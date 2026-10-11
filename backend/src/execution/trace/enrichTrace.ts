import type {
    ExecutionEvent,
    ExecutionTrace
} from "./schema.js";
import { inferSemanticRoles } from "./semanticRoles.js";

type SnapshotRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function enrichTrace(
    trace: ExecutionTrace,
    source = ""
): ExecutionTrace {
    const enriched: ExecutionEvent[] = [];
    const sourceLines = source.split(/\r?\n/);
    let previousStep: ExecutionEvent | undefined;
    let pendingCallerResume: {
        method: string | undefined;
        line: number;
        sawCallLine: boolean;
    } | undefined;
    const methodEntries: ExecutionEvent[] = [];

    for (let event of trace.events) {
        if (event.type === "STEP") {
            event = filterStepArrayReferences(event, sourceLines);
            event = annotateCondition(event, sourceLines);
            if (previousStep && previousStep.method === event.method) {
                const executionEvents = [
                    ...deriveChanges(previousStep, event),
                    ...deriveMapChanges(previousStep, event),
                    ...deriveArrayAccessEvents(previousStep, sourceLines),
                    ...deriveStringEvents(previousStep, event, sourceLines)
                ];

                // Runtime checkpoints are authoritative. Keep derived effects
                // attached to their state transition without loop-specific
                // inference or checkpoint reordering.
                attachStepResult(previousStep, event, executionEvents);
                insertDerivedEvents(
                    enriched,
                    previousStep,
                    [
                        ...executionEvents,
                        ...deriveArrayReferenceEvents(event, sourceLines)
                    ]
                );

                const creationEvents = deriveDataStructureCreationEvents(
                    previousStep,
                    event
                );
                if (creationEvents.length > 0) {
                    appendExecutionEvents(event, creationEvents);
                    insertDerivedEvents(enriched, event, creationEvents);
                }
            }

            if (pendingCallerResume) {
                const isCaller =
                    pendingCallerResume.method === undefined ||
                    pendingCallerResume.method === event.method;
                if (!isCaller) {
                    pendingCallerResume = undefined;
                } else if (
                    !pendingCallerResume.sawCallLine &&
                    event.line === pendingCallerResume.line
                ) {
                    // JDI can first stop at the call instruction with the
                    // caller's pre-assignment locals, then at the next line
                    // with the returned value assigned. Keep the latter
                    // checkpoint tied to the call line that produced it.
                    pendingCallerResume.sawCallLine = true;
                } else {
                    event = {
                        ...event,
                        data: {
                            ...(event.data ?? {}),
                            displayLine: pendingCallerResume.line
                        }
                    };
                    pendingCallerResume = undefined;
                }
            }
            enriched.push(event);
            previousStep = event;
            continue;
        }

        if (event.type === "METHOD_ENTER") {
            methodEntries.push(event);
            previousStep = undefined;
            // Keep the declaration line on METHOD_ENTER. The first STEP is a
            // distinct pause at its own JDI location (the first body line).
            // Reusing the declaration line here caused the first body line to
            // be skipped in the editor and the declaration to appear twice.
            pendingCallerResume = undefined;
            enriched.push(event);
            continue;
        }

        if (event.type === "METHOD_EXIT") {
            if (previousStep && previousStep.method === event.method) {
                const executionEvents = [
                    ...deriveChanges(previousStep, event),
                    ...deriveMapChanges(previousStep, event),
                    ...deriveArrayAccessEvents(previousStep, sourceLines),
                    ...deriveStringEvents(previousStep, event, sourceLines)
                ];

                // MethodExitEvent is emitted after the method body has
                // executed, so it is the post-state source for the last STEP.
                attachStepResult(previousStep, event, executionEvents);
                insertDerivedEvents(
                    enriched,
                    previousStep,
                    executionEvents
                );
            }

            if (typeof event.data?.callerLine === "number") {
                pendingCallerResume = {
                    method:
                        typeof event.data.callerMethod === "string"
                            ? event.data.callerMethod
                            : undefined,
                    line: event.data.callerLine as number,
                    sawCallLine: false
                };
            }

            methodEntries.pop();

            previousStep = undefined;
            enriched.push(event);
            continue;
        }

        if (
            event.type === "ERROR" ||
            event.type === "TIMEOUT" ||
            event.type === "TRACE_LIMIT"
        ) {
            previousStep = undefined;
            pendingCallerResume = undefined;
        }

        enriched.push(event);
    }


    const normalized = collapseEnhancedForLoopCheckpoints(
        enriched,
        sourceLines
    );

    const semanticRoles = inferSemanticRoles(source);

    return {
        version: 1,
        events: normalized.map((event, index) => {
            if (event.type !== "STEP" || semanticRoles.length === 0) return { ...event, sequence: index + 1 };
            const variables = event.data?.postVariables ?? event.data?.variables;
            const activeNames = variables && typeof variables === "object" && !Array.isArray(variables)
                ? new Set(Object.keys(variables as Record<string, unknown>)) : undefined;
            const methodRoles = semanticRoles.filter(role => !role.method || !event.method || role.method === event.method);
            const activeRoles = activeNames ? methodRoles.filter(role => activeNames.has(role.name)) : methodRoles;
            return { ...event, sequence: index + 1, data: { ...(event.data ?? {}), semanticRoles: activeRoles } };
        })
    };
}

function collapseEnhancedForLoopCheckpoints(
    events: ExecutionEvent[],
    sourceLines: string[]
): ExecutionEvent[] {
    const normalized: ExecutionEvent[] = [];

    for (let index = 0; index < events.length; index++) {
        const current = events[index];
        if (!current) continue;

        const line = current.line;
        if (typeof line !== "number") {
            normalized.push(current);
            continue;
        }

        // Derived execution events are inserted between STEP checkpoints.
        // Do not assume the next array entry is the next STEP; otherwise the
        // duplicate enhanced-for header checkpoints are never collapsed.
        let nextStepIndex = index + 1;
        while (
            nextStepIndex < events.length &&
            events[nextStepIndex]?.type !== "STEP"
        ) {
            nextStepIndex++;
        }

        const next = events[nextStepIndex];

        if (
            current.type === "STEP" &&
            isEnhancedForHeader(sourceLines, line) &&
            !hasEnhancedForVariable(current, sourceLines, line)
        ) {
            if (
                next?.type === "STEP" &&
                current.method === next.method &&
                current.depth === next.depth &&
                current.line === next.line &&
                hasEnhancedForVariable(next, sourceLines, line)
            ) {
                // JDI first pauses at the enhanced-for header before assigning
                // the next element to the loop variable. Keep the meaningful
                // assignment checkpoint, not the uninitialized duplicate.
                const currentExecutionEvents = executionEventsFor(current);
                if (currentExecutionEvents.length > 0) {
                    appendExecutionEvents(next, currentExecutionEvents);
                }

                normalized.push(next);
                index = nextStepIndex;
                continue;
            }

            // A header checkpoint with no loop variable and no same-line
            // assignment is the exhausted-iterator pause. The enhanced-for
            // runtime has no user-visible condition to evaluate here, so
            // suppress it rather than showing a phantom extra iteration.
            index = nextStepIndex - 1;
            continue;
        }

        normalized.push(current);
    }

    return normalized;
}

function isEnhancedForHeader(
    sourceLines: string[],
    line: number | undefined
): boolean {
    if (typeof line !== "number" || line < 1) return false;

    const statement = sourceLines[line - 1]?.trim() ?? "";
    if (!/^for\s*\(/.test(statement)) return false;

    const inside = balancedParenthesized(
        statement,
        statement.indexOf("(")
    );
    if (!inside) return false;

    return splitTopLevel(inside, ":").length === 2;
}

function enhancedForVariableName(
    sourceLines: string[],
    line: number
): string | undefined {
    const statement = sourceLines[line - 1]?.trim() ?? "";
    const inside = balancedParenthesized(
        statement,
        statement.indexOf("(")
    );
    if (!inside) return undefined;

    const parts = splitTopLevel(inside, ":");
    if (parts.length !== 2) return undefined;

    const left = parts[0]?.trim() ?? "";
    const match = left.match(/([A-Za-z_$][\w$]*)\s*$/);
    return match?.[1];
}

function hasEnhancedForVariable(
    event: ExecutionEvent,
    sourceLines: string[],
    line: number
): boolean {
    const name = enhancedForVariableName(sourceLines, line);
    if (!name) return false;

    // JDI's header checkpoint contains the pre-assignment locals in
    // variables, while postVariables records the enhanced-for assignment.
    // Use both so the first real iteration is not mistaken for an
    // uninitialized checkpoint.
    const snapshots = [event.data?.postVariables, event.data?.variables];
    return snapshots.some((variables) =>
        !!(
            variables &&
            typeof variables === "object" &&
            !Array.isArray(variables) &&
            name in variables
        )
    );
}

function appendExecutionEvents(
    event: ExecutionEvent,
    executionEvents: ExecutionEvent[]
): void {
    if (executionEvents.length === 0) return;

    event.data = {
        ...(event.data ?? {}),
        executionEvents: [
            ...(Array.isArray(event.data?.executionEvents)
                ? event.data.executionEvents
                : []),
            ...executionEvents
        ]
    };
}






function executionEventsFor(
    event: ExecutionEvent
): ExecutionEvent[] {
    return Array.isArray(event.data?.executionEvents)
        ? event.data.executionEvents as ExecutionEvent[]
        : [];
}





function insertDerivedEvents(
    events: ExecutionEvent[],
    afterEvent: ExecutionEvent,
    derived: ExecutionEvent[]
): void {
    if (derived.length === 0) return;

    const index = events.lastIndexOf(afterEvent);
    if (index < 0) return;

    events.splice(
        index + 1,
        0,
        ...derived.map((event) => ({
            ...event,
            sequence: 0
        }))
    );
}

function attachStepResult(
    step: ExecutionEvent,
    postEvent: ExecutionEvent,
    executionEvents: ExecutionEvent[]
): void {
    const data = {
        ...(step.data ?? {})
    };

    if (
        postEvent.data?.variables &&
        typeof postEvent.data.variables === "object"
    ) {
        data.postVariables = postEvent.data.variables;
    }

    if (executionEvents.length > 0) {
        data.executionEvents = [
            ...(Array.isArray(data.executionEvents)
                ? data.executionEvents
                : []),
            ...executionEvents
        ];
    }

    if (postEvent.data && "returnValue" in postEvent.data) {
        data.returnValue = postEvent.data.returnValue;
    }

    // Keep source/runtime metadata on the highlighted STEP. In particular,
    // arrayReferences are structural metadata used by the visualizer and
    // must survive post-line result attachment unchanged.
    if (Array.isArray(step.data?.arrayReferences)) {
        data.arrayReferences = step.data.arrayReferences;
    }

    step.data = data;
}

function annotateCondition(
    event: ExecutionEvent,
    sourceLines: string[]
): ExecutionEvent {
    if (typeof event.line !== "number" || event.line < 1 || !event.data?.variables) return event;
    const statement = sourceLines[event.line - 1]?.trim() ?? "";
    const expression = extractConditionExpression(statement);
    if (!expression) return event;
    const variables = event.data.variables;
    if (!variables || typeof variables !== "object" || Array.isArray(variables)) return event;
    const result = evaluateCondition(expression, variables as Record<string, unknown>);
    if (result === undefined) return event;
    return { ...event, data: { ...event.data, conditionResult: result } };
}

function extractConditionExpression(statement: string): string | undefined {
    const trimmed = statement.trim();
    // A branch checkpoint can retain the full source spelling "else if (...)";
    // normalize only the leading keyword so its condition is evaluated too.
    const conditionStatement = trimmed.replace(/^(?:}\s*)?else\s+if\b/, "if");
    for (const keyword of ["if", "while"]) {
        if (new RegExp("^" + keyword + "\\s*\\(").test(conditionStatement)) {
            return balancedParenthesized(conditionStatement, conditionStatement.indexOf("("));
        }
    }
    if (/^for\s*\(/.test(trimmed)) {
        const inside = balancedParenthesized(trimmed, trimmed.indexOf("("));
        if (!inside) return undefined;
        const parts = splitTopLevel(inside, ";");
        return parts.length === 3 ? parts[1]?.trim() : undefined;
    }
    const doWhile = trimmed.match(/\bwhile\s*\(/);
    if (doWhile) return balancedParenthesized(trimmed, trimmed.indexOf("(", doWhile.index ?? 0));
    return undefined;
}

function balancedParenthesized(source: string, openIndex: number): string | undefined {
    if (source.charAt(openIndex) !== "(") return undefined;
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let i = openIndex; i < source.length; i++) {
        const ch = source[i]!;
        if (quote) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === quote) quote = "";
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === "(") depth++;
        if (ch === ")") {
            depth--;
            if (depth === 0) return source.slice(openIndex + 1, i);
        }
    }
    return undefined;
}

function splitTopLevel(source: string, separator: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i]!;
        if (quote) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === quote) quote = "";
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth--;
        if (depth === 0 && source.startsWith(separator, i)) {
            parts.push(source.slice(start, i));
            start = i + separator.length;
            i += separator.length - 1;
        }
    }
    parts.push(source.slice(start));
    return parts;
}

type ConditionValue =
    | number
    | string
    | boolean
    | null
    | ConditionValue[]
    | { snapshot: Record<string, unknown> }
    | { staticClass: string };
type ConditionToken = { type: "number" | "string" | "identifier" | "operator"; value: string };

export function evaluateCondition(expression: string, variables: Record<string, unknown>): boolean | undefined {
    try {
        const evaluateBoolean = (source: string): boolean => {
            const orParts = splitTopLevel(source, "||").map(part => part.trim()).filter(Boolean);
            if (orParts.length > 1) {
                return orParts.some(part => evaluateBoolean(part));
            }

            const andParts = splitTopLevel(source, "&&").map(part => part.trim()).filter(Boolean);
            if (andParts.length > 1) {
                return andParts.every(part => evaluateBoolean(part));
            }

            const value = new ConditionParser(tokenizeCondition(source), variables).parse();
            if (typeof value !== "boolean") throw new Error("boolean expected");
            return value;
        };

        return evaluateBoolean(expression);
    } catch {
        return undefined;
    }
}


function tokenizeCondition(source: string): ConditionToken[] {
    const tokens: ConditionToken[] = [];
    let i = 0;
    while (i < source.length) {
        const ch = source[i]!;
        if (/\s/.test(ch)) { i++; continue; }
        const two = source.slice(i, i + 2);
        if (["&&", "||", "==", "!=", "<=", ">="].includes(two)) {
            tokens.push({ type: "operator", value: two }); i += 2; continue;
        }
        if ("()[]!.+-*/%<>,".includes(ch)) {
            tokens.push({ type: "operator", value: ch }); i++; continue;
        }
        if (ch === '"' || ch === "'") {
            const quote = ch; let value = ""; i++;
            while (i < source.length) {
                const current = source[i]!;
                if (current === "\\" && i + 1 < source.length) { value += source[i + 1]; i += 2; continue; }
                if (current === quote) { i++; break; }
                value += current; i++;
            }
            tokens.push({ type: "string", value }); continue;
        }
        if (/[0-9]/.test(ch)) {
            let end = i + 1;
            while (end < source.length && /[0-9.]/.test(source[end]!)) end++;
            tokens.push({ type: "number", value: source.slice(i, end) }); i = end; continue;
        }
        if (/[A-Za-z_$]/.test(ch)) {
            let end = i + 1;
            while (end < source.length && /[A-Za-z0-9_$]/.test(source[end]!)) end++;
            tokens.push({ type: "identifier", value: source.slice(i, end) }); i = end; continue;
        }
        throw new Error("unsupported token");
    }
    return tokens;
}

class ConditionParser {
    private index = 0;
    constructor(private readonly tokens: ConditionToken[], private readonly variables: Record<string, unknown>) {}
    parse(): unknown {
        const value = this.parseOr();
        if (this.index !== this.tokens.length) throw new Error("trailing tokens");
        return value;
    }
    private peek(value?: string): ConditionToken | undefined {
        const token = this.tokens[this.index];
        return value === undefined || token?.value === value ? token : undefined;
    }
    private consume(value: string): void {
        if (!this.peek(value)) throw new Error("expected " + value);
        this.index++;
    }
    private parseOr(evaluate = true): unknown {
        let left = this.parseAnd(evaluate);
        while (this.peek("||")) {
            this.index++;
            if (evaluate && left === true) {
                // Java short-circuits ||. Consume the RHS without evaluating it.
                this.parseAnd(false);
                left = true;
                continue;
            }
            const right = this.parseAnd(evaluate);
            if (evaluate && (typeof left !== "boolean" || typeof right !== "boolean")) {
                throw new Error("boolean expected");
            }
            left = evaluate ? (left as boolean) || (right as boolean) : undefined;
        }
        return left;
    }
    private parseAnd(evaluate = true): unknown {
        let left = this.parseEquality(evaluate);

        while (this.peek("&&")) {
            this.index++;

            if (evaluate && left === false) {
                // The RHS must still be consumed so parsing stays aligned,
                // but it must not be evaluated because Java short-circuits.
                // Consume only one equality operand at a time; the enclosing
                // loop handles any additional && operators.
                this.parseEquality(false);
                left = false;
                continue;
            }

            const right = this.parseEquality(evaluate);
            if (evaluate && (typeof left !== "boolean" || typeof right !== "boolean")) {
                throw new Error("boolean expected");
            }
            left = evaluate ? (left as boolean) && (right as boolean) : undefined;
        }

        return left;
    }
    private parseEquality(evaluate = true): unknown {
        let left = this.parseRelational(evaluate);
        while (this.peek("==") || this.peek("!=")) {
            const operator = this.tokens[this.index++]!.value;
            const right = this.parseRelational(evaluate);
            if (!evaluate) { left = undefined; continue; }
            const equal = sameConditionValue(left, right);
            left = operator === "==" ? equal : !equal;
        }
        return left;
    }
    private parseRelational(evaluate = true): unknown {
        let left = this.parseAdditive(evaluate);
        while (this.peek("<") || this.peek("<=") || this.peek(">") || this.peek(">=")) {
            const operator = this.tokens[this.index++]!.value;
            const right = this.parseAdditive(evaluate);
            if (!evaluate) { left = undefined; continue; }
            if (typeof left !== "number" || typeof right !== "number") throw new Error("numeric comparison expected");
            if (operator === "<") left = left < right;
            else if (operator === "<=") left = left <= right;
            else if (operator === ">") left = left > right;
            else left = left >= right;
        }
        return left;
    }
    private parseAdditive(evaluate = true): unknown {
        let left = this.parseMultiplicative(evaluate);
        while (this.peek("+") || this.peek("-")) {
            const operator = this.tokens[this.index++]!.value;
            const right = this.parseMultiplicative(evaluate);
            if (!evaluate) { left = undefined; continue; }
            if (operator === "+" && (typeof left === "string" || typeof right === "string")) left = String(left) + String(right);
            else if (typeof left === "number" && typeof right === "number") left = operator === "+" ? left + right : left - right;
            else throw new Error("numeric operands expected");
        }
        return left;
    }
    private parseMultiplicative(evaluate = true): unknown {
        let left = this.parseUnary(evaluate);
        while (this.peek("*") || this.peek("/") || this.peek("%")) {
            const operator = this.tokens[this.index++]!.value;
            const right = this.parseUnary(evaluate);
            if (!evaluate) { left = undefined; continue; }
            if (typeof left !== "number" || typeof right !== "number") throw new Error("numeric operands expected");
            if (operator === "*") left = left * right;
            else if (operator === "/") left = left / right;
            else left = left % right;
        }
        return left;
    }
    private parseUnary(evaluate = true): unknown {
        if (this.peek("!")) { this.index++; const value = this.parseUnary(evaluate); if (evaluate && typeof value !== "boolean") throw new Error("boolean expected"); return evaluate ? !(value as boolean) : undefined; }
        if (this.peek("-")) { this.index++; const value = this.parseUnary(evaluate); if (evaluate && typeof value !== "number") throw new Error("numeric operand expected"); return evaluate ? -(value as number) : undefined; }
        if (this.peek("+")) { this.index++; const value = this.parseUnary(evaluate); if (evaluate && typeof value !== "number") throw new Error("numeric operand expected"); return evaluate ? value : undefined; }
        return this.parsePrimary(evaluate);
    }
    private parsePrimary(evaluate = true): unknown {
        const token = this.tokens[this.index++];
        if (!token) throw new Error("missing expression");
        let value: unknown;
        if (token.type === "string") value = evaluate ? token.value : undefined;
        else if (token.type === "number") value = evaluate ? Number(token.value) : undefined;
        else if (token.type === "operator" && token.value === "(") {
            value = this.parseOr(evaluate);
            this.consume(")");
        }
        else if (token.type === "identifier") {
            if (token.value === "true") value = evaluate ? true : undefined;
            else if (token.value === "false") value = evaluate ? false : undefined;
            else if (token.value === "null") value = evaluate ? null : undefined;
            else if (isConditionStaticClass(token.value)) {
                // Preserve known Java static utility classes until the
                // following ".method(...)" is parsed. This is intentionally
                // class/method based, not tied to any LeetCode problem.
                value = evaluate ? { staticClass: token.value } : undefined;
            } else {
                value = evaluate ? this.resolveVariable(token.value) : undefined;
            }
        } else throw new Error("unsupported primary");

        while (this.peek("[") || this.peek(".")) {
            if (this.peek("[")) {
                this.index++; const index = this.parseOr(evaluate); this.consume("]");
                if (evaluate && typeof index !== "number") throw new Error("array index expected");
                value = evaluate ? readIndexed(value, index as number) : undefined;
            } else {
                this.index++;
                const property = this.tokens[this.index++];
                if (!property || property.type !== "identifier") throw new Error("unsupported property");

                if (this.peek("(")) {
                    this.index++;
                    const args: unknown[] = [];
                    if (!this.peek(")")) {
                        args.push(this.parseOr(evaluate));
                        while (this.peek(",")) {
                            this.index++;
                            args.push(this.parseOr(evaluate));
                        }
                    }
                    this.consume(")");
                    value = evaluate ? readMethod(value, property.value, args) : undefined;
                } else {
                    if (property.value !== "length") throw new Error("unsupported property");
                    value = evaluate ? readLength(value) : undefined;
                }
            }
        }
        return value;
    }
    private resolveVariable(name: string): unknown {
        return conditionSnapshotValue(this.variables[name]);
    }
}

function conditionSnapshotValue(value: unknown): ConditionValue {
    if (Array.isArray(value)) return value.map(conditionSnapshotValue);
    if (value && typeof value === "object") return { snapshot: value as Record<string, unknown> };
    return value as ConditionValue;
}

function isConditionStaticClass(name: string): boolean {
    return new Set([
        "Character",
        "Math",
        "Integer",
        "Long",
        "Double",
        "String"
    ]).has(name);
}

function readIndexed(value: unknown, index: number): unknown {
    if (Array.isArray(value)) return value[index];
    if (value && typeof value === "object" && "snapshot" in value) {
        const record = value as { snapshot: Record<string, unknown> };
        const snapshot = record.snapshot;
        if (Array.isArray(snapshot.values)) return snapshot.values[index];
    }
    throw new Error("not indexable");
}

function readMethod(value: unknown, method: string, args: unknown[]): unknown {
    if (value && typeof value === "object" && "staticClass" in value) {
        return readStaticMethod(
            (value as { staticClass: string }).staticClass,
            method,
            args
        );
    }

    // Java String methods are invoked on the raw string value.
    if (method === "length" && typeof value === "string") {
        return value.length;
    }
    if (method === "charAt" && typeof value === "string") {
        if (args.length !== 1 || typeof args[0] !== "number") {
            throw new Error("charAt index expected");
        }
        return value.charAt(args[0]);
    }
    if (typeof value === "string") {
        if (method === "equals") return args.length === 1 && value === String(args[0]);
        if (method === "equalsIgnoreCase") return args.length === 1 && value.toLowerCase() === String(args[0]).toLowerCase();
        if (method === "contains") return args.length === 1 && value.includes(String(args[0]));
        if (method === "startsWith") return args.length === 1 && value.startsWith(String(args[0]));
        if (method === "endsWith") return args.length === 1 && value.endsWith(String(args[0]));
    }

    if (!value || typeof value !== "object" || !("snapshot" in value)) {
        throw new Error("method receiver unavailable");
    }

    const snapshot = (value as { snapshot: Record<string, unknown> }).snapshot;

    if (method === "peek") {
        if (args.length !== 0) throw new Error("peek expects no arguments");
        if (Array.isArray(snapshot.values)) {
            if (snapshot.values.length === 0) throw new Error("peek on empty collection");
            return snapshot.values[snapshot.values.length - 1];
        }
        throw new Error("peek receiver unavailable");
    }

    if (method === "containsKey") {
        const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
        return entries.some((entry) =>
            entry &&
            typeof entry === "object" &&
            sameConditionValue(
                (entry as Record<string, unknown>).key,
                args[0]
            )
        );
    }

    if (method === "containsValue") {
        const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
        return entries.some((entry) =>
            entry &&
            typeof entry === "object" &&
            sameConditionValue(
                (entry as Record<string, unknown>).value,
                args[0]
            )
        );
    }

    if (method === "contains") {
        const values = Array.isArray(snapshot.values) ? snapshot.values : [];
        return values.some((item) => sameConditionValue(item, args[0]));
    }

    // Set.add(value) returns whether the set changed. Conditions such as
    // if (!seen.add(value)) are common in LeetCode and must be evaluated
    // from the pre-line snapshot without mutating the trace state.
    if (method === "add" && (snapshot.kind === "set" || Object.entries(snapshot).some(([key, value]) => key.endsWith("kind") && value === "set"))) {
        const values = Array.isArray(snapshot.values) ? snapshot.values : [];
        return !values.some((item) => sameConditionValue(item, args[0]));
    }

    if (method === "isEmpty") {
        if (typeof snapshot.size === "number") return snapshot.size === 0;
        if (Array.isArray(snapshot.entries)) return snapshot.entries.length === 0;
        if (Array.isArray(snapshot.values)) return snapshot.values.length === 0;
    }

    if (method === "size") {
        if (typeof snapshot.size === "number") return snapshot.size;
        if (Array.isArray(snapshot.entries)) return snapshot.entries.length;
        if (Array.isArray(snapshot.values)) return snapshot.values.length;
    }

    // Java String uses method calls for these operations. The condition
    // evaluator already supports the equivalent length/property path, but
    // "s.length()" and "s.charAt(i)" must also be evaluable so annotateCondition
    // can attach the runtime TRUE/FALSE result to the STEP.
    if (method === "length") {
        return readLength(value);
    }

    if (method === "charAt") {
        if (args.length !== 1 || typeof args[0] !== "number") {
            throw new Error("charAt index expected");
        }
        const index = args[0];
        if (typeof snapshot.value === "string") return snapshot.value.charAt(index);
        if (Array.isArray(snapshot.values)) return String(snapshot.values[index] ?? "");
        throw new Error("charAt receiver unavailable");
    }

    if (method === "get") {
        const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
        const found = entries.find((entry) =>
            entry &&
            typeof entry === "object" &&
            sameConditionValue(
                (entry as Record<string, unknown>).key,
                args[0]
            )
        );
        return found && typeof found === "object"
            ? (found as Record<string, unknown>).value
            : null;
    }

    throw new Error("unsupported method");
}

function readStaticMethod(
    className: string,
    method: string,
    args: unknown[]
): unknown {
    if (className === "Character") {
        if (args.length !== 1) throw new Error("Character method expects one argument");
        const value = args[0];

        // JDI can represent a char/Character array element either as the
        // primitive character or as a small object snapshot. Normalize both
        // forms before applying the Java Character predicate. This keeps
        // condition evaluation independent of the particular problem or
        // trace serializer shape.
        const unwrapCharacter = (candidate: unknown): string | undefined => {
            if (typeof candidate === "string") return candidate.charAt(0);
            if (typeof candidate === "number") return String.fromCharCode(candidate);

            if (candidate && typeof candidate === "object" && "snapshot" in candidate) {
                const snapshot = (candidate as {
                    snapshot: Record<string, unknown>;
                }).snapshot;

                for (const key of ["value", "character", "char", "string"]) {
                    const nested = snapshot[key];
                    const result = unwrapCharacter(nested);
                    if (result !== undefined) return result;
                }
            }

            return undefined;
        };

        const character = unwrapCharacter(value);
        if (character === undefined) throw new Error("Character argument unavailable");

        switch (method) {
            case "isLetterOrDigit":
                return /[\p{L}\p{N}]/u.test(character);
            case "isLetter":
                return /[\p{L}]/u.test(character);
            case "isDigit":
                return /[0-9]/.test(character);
            case "isWhitespace":
                return /\s/u.test(character);
            case "isSpaceChar":
                return /[\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/u.test(character);
            case "isUpperCase":
                return character !== character.toLowerCase() && character === character.toUpperCase();
            case "isLowerCase":
                return character !== character.toUpperCase() && character === character.toLowerCase();
            case "toLowerCase":
                return character.toLowerCase();
            case "toUpperCase":
                return character.toUpperCase();
            default:
                throw new Error("unsupported Character method");
        }
    }

    if (className === "Math") {
        if (method === "abs" && args.length === 1 && typeof args[0] === "number") return Math.abs(args[0]);
        if (method === "min" && args.length === 2 && typeof args[0] === "number" && typeof args[1] === "number") return Math.min(args[0], args[1]);
        if (method === "max" && args.length === 2 && typeof args[0] === "number" && typeof args[1] === "number") return Math.max(args[0], args[1]);
        throw new Error("unsupported Math method");
    }

    if (className === "Integer" || className === "Long" || className === "Double") {
        if (method === "compare" && args.length === 2 && typeof args[0] === "number" && typeof args[1] === "number") {
            return args[0] < args[1] ? -1 : args[0] > args[1] ? 1 : 0;
        }
        throw new Error("unsupported numeric utility method");
    }

    if (className === "String" && method === "valueOf" && args.length === 1) {
        return String(args[0]);
    }

    throw new Error("unsupported static method");
}

function readLength(value: unknown): number {
    if (typeof value === "string" || Array.isArray(value)) return value.length;
    if (value && typeof value === "object" && "snapshot" in value) {
        const record = value as { snapshot: Record<string, unknown> };
        const snapshot = record.snapshot;
        if (typeof snapshot.length === "number") return snapshot.length;
        if (Array.isArray(snapshot.values)) return snapshot.values.length;
        if (Array.isArray(snapshot.entries)) return snapshot.entries.length;
    }
    throw new Error("length unavailable");
}

function sameConditionValue(left: unknown, right: unknown): boolean {
    if (left && typeof left === "object" && "snapshot" in left && right && typeof right === "object" && "snapshot" in right) {
        return JSON.stringify(left.snapshot) === JSON.stringify(right.snapshot);
    }
    return left === right;
}

function deriveArrayAccessEvents(
    sourceEvent: ExecutionEvent,
    sourceLines: string[]
): ExecutionEvent[] {
    if (typeof sourceEvent.line !== "number" || sourceEvent.line < 1) return [];

    const statement = sourceLines[sourceEvent.line - 1] ?? "";
    const variables = getVariables(sourceEvent);
    const accesses: ExecutionEvent[] = [];

    for (const match of statement.matchAll(/\b([A-Za-z_$][\w$]*)\s*(\[[^\]]+\])+/g)) {
        const name = match[1];
        if (!name) continue;
        const full = match[0];
        const array = asArraySnapshot(variables[name]);
        if (!array) continue;

        const indices: number[] = [];
        let current: unknown = variables[name];
        let valid = true;

        for (const bracket of full.matchAll(/\[([^\]]+)\]/g)) {
            const index = evaluateExpression(bracket[1] ?? "", variables);
            if (typeof index !== "number" || !Number.isInteger(index)) {
                valid = false;
                break;
            }
            indices.push(index);
            const snapshot = asArraySnapshot(current);
            if (!snapshot || index < 0 || index >= snapshot.values.length) {
                valid = false;
                break;
            }
            current = snapshot.values[index];
        }

        if (!valid || indices.length === 0) continue;

        accesses.push({
            sequence: 0,
            type: "ARRAY_ACCESS",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: {
                name,
                arrayId: array.$arrayId,
                indices,
                value: current,
                kind: "read"
            }
        });
    }

    return accesses;
}


/**
 * Derive string effects from the executed statement and adjacent runtime
 * checkpoints. We only emit an access when its index/range and receiver are
 * available in the runtime snapshot; source text alone never creates a hit.
 */
function deriveStringEvents(
    sourceEvent: ExecutionEvent,
    postEvent: ExecutionEvent,
    sourceLines: string[]
): ExecutionEvent[] {
    if (typeof sourceEvent.line !== "number" || sourceEvent.line < 1) return [];
    const statement = sourceLines[sourceEvent.line - 1] ?? "";
    const variables = getVariables(sourceEvent);
    const postVariables = getVariables(postEvent);
    const events: ExecutionEvent[] = [];

    for (const match of statement.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*charAt\s*\(((?:[^()]|\([^()]*\))*)\)/g)) {
        const name = match[1];
        if (!name) continue;
        const value = typeof variables[name] === "string" ? variables[name] as string : stringBuilderContents(variables[name]);
        if (value === undefined) continue;
        const index = evaluateExpression(match[2] ?? "", variables);
        if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= value.length) continue;
        events.push({
            sequence: 0,
            type: "STRING_ACCESS",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: { name, index, value: value.charAt(index), kind: "read", operation: "charAt", indexExpression: (match[2] ?? "").trim(), indexVariable: /^[A-Za-z_$][\w$]*$/.test((match[2] ?? "").trim()) ? (match[2] ?? "").trim() : undefined }
        });
    }

    for (const match of statement.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*(substring|subSequence)\s*\(((?:[^()]|\([^()]*\))*)\)/g)) {
        const name = match[1];
        if (!name) continue;
        const value = typeof variables[name] === "string" ? variables[name] as string : stringBuilderContents(variables[name]);
        if (value === undefined) continue;
        const args = splitTopLevel(match[3] ?? "", ",").map(part => part.trim());
        const start = evaluateExpression(args[0] ?? "", variables);
        const end = args.length > 1 ? evaluateExpression(args[1] ?? "", variables) : value.length;
        if (typeof start !== "number" || typeof end !== "number" ||
            !Number.isInteger(start) || !Number.isInteger(end) ||
            start < 0 || end < start || end > value.length) continue;
        events.push({
            sequence: 0,
            type: "STRING_RANGE_ACCESS",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: { name, start, end, operation: match[2], kind: "read", startExpression: args[0], endExpression: args[1] ?? String(value.length), startVariable: /^[A-Za-z_$][\w$]*$/.test(args[0] ?? "") ? args[0] : undefined, endVariable: /^[A-Za-z_$][\w$]*$/.test(args[1] ?? "") ? args[1] : undefined }
        });
    }

    const searchPattern = /\b([A-Za-z_$][\w$]*)\s*\.\s*(indexOf|lastIndexOf|contains|startsWith|endsWith|equals|equalsIgnoreCase|compareTo|isEmpty|isBlank|length)\s*\(((?:[^()]|\([^()]*\))*)\)/g;
    for (const match of statement.matchAll(searchPattern)) {
        const name = match[1];
        const operation = match[2];
        if (!name || !operation) continue;
        const value = typeof variables[name] === "string" ? variables[name] as string : stringBuilderContents(variables[name]);
        if (value === undefined) continue;
        const argument = (match[3] ?? "").trim();
        const queryValue = argument ? evaluateExpression(argument, variables) : undefined;
        let index = -1;
        let end = -1;
        let result: string | number | boolean;
        let matched = false;
        if (operation === "length") result = value.length;
        else if (operation === "isEmpty") result = value.length === 0;
        else if (operation === "isBlank") result = value.trim().length === 0;
        else {
            if (typeof queryValue !== "string") continue;
            const query = queryValue;
            if (operation === "indexOf") { index = value.indexOf(query); result = index; matched = index >= 0; }
            else if (operation === "lastIndexOf") { index = value.lastIndexOf(query); result = index; matched = index >= 0; }
            else if (operation === "contains") { index = value.indexOf(query); result = index >= 0; matched = index >= 0; }
            else if (operation === "startsWith") { index = value.startsWith(query) ? 0 : -1; result = index >= 0; matched = index >= 0; }
            else if (operation === "endsWith") { index = value.endsWith(query) ? value.length - query.length : -1; result = index >= 0; matched = index >= 0; }
            else if (operation === "equalsIgnoreCase") {
                result = value.toLowerCase() === query.toLowerCase();
                matched = result;
                let offset = 0;
                while (offset < value.length && offset < query.length &&
                    value.charAt(offset).toLowerCase() === query.charAt(offset).toLowerCase()) offset++;
                index = matched ? 0 : offset;
            }
            else if (operation === "equals") {
                result = value === query;
                matched = result;
                let offset = 0;
                while (offset < value.length && offset < query.length &&
                    value.charCodeAt(offset) === query.charCodeAt(offset)) offset++;
                index = matched ? 0 : offset;
            }
            else {
                let offset = 0;
                while (offset < value.length && offset < query.length && value.charCodeAt(offset) === query.charCodeAt(offset)) offset++;
                result = offset < value.length && offset < query.length
                    ? value.charCodeAt(offset) - query.charCodeAt(offset)
                    : value.length - query.length;
                matched = result === 0;
                index = matched ? 0 : offset;
            }
            if (matched && index >= 0) end = operation === "equals" || operation === "equalsIgnoreCase" || operation === "compareTo"
                ? value.length
                : index + query.length;
            else if ((operation === "compareTo" || operation === "equals" || operation === "equalsIgnoreCase") &&
                index >= 0 && index < value.length) end = index + 1;
        }
        events.push({
            sequence: 0,
            type: "STRING_SEARCH_RESULT",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: { name, operation, query: argument ? queryValue : undefined, index, end, matched, result, kind: "search" }
        });
    }

    // split() creates a distinct String[]; its cells are rendered by the existing
    // array visualizer. This event links the result to its source and highlights
    // delimiters only when the regex is provably a literal delimiter.
    const splitPattern = /\b([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\.\s*split\s*\(((?:[^()]|\([^()]*\))*)\)/g;
    for (const match of statement.matchAll(splitPattern)) {
        const resultName = match[1];
        const name = match[2];
        if (!resultName || !name) continue;
        const value = typeof variables[name] === "string"
            ? variables[name] as string
            : stringBuilderContents(variables[name]);
        if (value === undefined) continue;
        const args = splitTopLevel(match[3] ?? "", ",").map(part => part.trim());
        const delimiter = evaluateExpression(args[0] ?? "", variables);
        const rawResultArray = postVariables[resultName];
        const resultArray = asArraySnapshot(rawResultArray);
        if (typeof delimiter !== "string" || !resultArray) continue;
        const partCount = isPlainObject(rawResultArray) && typeof rawResultArray.length === "number"
            ? rawResultArray.length
            : resultArray.values.length;

        const delimiterRanges: Array<{ start: number; end: number }> = [];
        const regexMetaCodes = [92, 94, 36, 46, 42, 43, 63, 40, 41, 91, 93, 123, 125, 124];
        const literalDelimiter = delimiter.length > 0 &&
            ![...delimiter].some(character => regexMetaCodes.includes(character.charCodeAt(0)));
        if (literalDelimiter) {
            let cursor = 0;
            while (cursor <= value.length - delimiter.length) {
                const index = value.indexOf(delimiter, cursor);
                if (index < 0) break;
                delimiterRanges.push({ start: index, end: index + delimiter.length });
                cursor = index + delimiter.length;
            }
        }

        events.push({
            sequence: 0,
            type: "STRING_SPLIT_RESULT",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: {
                name,
                resultName,
                operation: "split",
                delimiter,
                partCount,
                delimiterRanges,
                kind: "split"
            }
        });
    }

    // toCharArray() creates a distinct char[]; the array itself remains owned
    // by the existing array visualizer. Also support enhanced-for expressions
    // where the temporary array has no user-declared result variable.
    const charArrayPattern = /(?:\b([A-Za-z_$][\w$]*)\s*=\s*)?\b([A-Za-z_$][\w$]*)\s*\.\s*toCharArray\s*\(\s*\)/g;
    for (const match of statement.matchAll(charArrayPattern)) {
        const resultName = match[1];
        const name = match[2];
        if (!name) continue;
        const value = typeof variables[name] === "string" ? variables[name] as string : undefined;
        if (value === undefined) continue;
        if (resultName && !asArraySnapshot(postVariables[resultName])) continue;
        events.push({
            sequence: 0,
            type: "STRING_CONVERSION_RESULT",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: {
                name,
                resultName,
                operation: "toCharArray",
                resultLength: value.length,
                kind: "conversion"
            }
        });
    }

    const assignmentPattern = /\b([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\.\s*(substring|subSequence|concat|replace|replaceAll|toLowerCase|toUpperCase|trim|strip|toString)\s*\(((?:[^()]|\([^()]*\))*)\)/g;
    for (const match of statement.matchAll(assignmentPattern)) {
        const resultName = match[1];
        const sourceName = match[2];
        const operation = match[3];
        const suffix = statement.slice((match.index ?? 0) + match[0].length).trim();
        if (suffix && !suffix.startsWith(";")) continue;
        if (!resultName || !sourceName || !operation) continue;
        const beforeResult = variables[resultName];
        const afterResult = postVariables[resultName];
        const sourceValue = typeof variables[sourceName] === "string" ? variables[sourceName] as string : stringBuilderContents(variables[sourceName]);
        if (typeof afterResult !== "string" || sourceValue === undefined ||
            beforeResult === afterResult) continue;
        events.push({
            sequence: 0,
            type: "STRING_RESULT",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: {
                name: resultName,
                resultName,
                sourceName,
                operation,
                before: typeof beforeResult === "string" ? beforeResult : undefined,
                after: afterResult,
                sourceBefore: sourceValue,
                kind: "derived"
            }
        });
    }

    const staticStringPattern = /\b([A-Za-z_$][\w$]*)\s*=\s*String\s*\.\s*(valueOf|join|format|copyValueOf)\s*\(((?:[^()]|\([^()]*\))*)\)/g;
    for (const match of statement.matchAll(staticStringPattern)) {
        const resultName = match[1];
        const operation = match[2];
        const args = match[3] ?? "";
        if (!resultName || !operation) continue;
        const beforeResult = variables[resultName];
        const afterResult = postVariables[resultName];
        if (typeof afterResult !== "string" || beforeResult === afterResult) continue;
        const firstArg = args.split(",")[0]?.trim();
        const sourceName = firstArg && /^[A-Za-z_$][\w$]*$/.test(firstArg) ? firstArg : undefined;
        events.push({
            sequence: 0,
            type: "STRING_RESULT",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: { name: resultName, resultName, sourceName, operation: "String." + operation, before: typeof beforeResult === "string" ? beforeResult : "", after: afterResult, sourceBefore: sourceName ? variables[sourceName] : undefined, kind: "derived" }
        });
    }

    const stringConstructorPattern = /\b([A-Za-z_$][\w$]*)\s*=\s*new\s+String\s*\(((?:[^()]|\([^()]*\))*)\)/g;
    for (const match of statement.matchAll(stringConstructorPattern)) {
        const resultName = match[1];
        if (!resultName) continue;
        const beforeResult = variables[resultName];
        const afterResult = postVariables[resultName];
        if (typeof afterResult !== "string" || beforeResult === afterResult) continue;
        events.push({
            sequence: 0,
            type: "STRING_RESULT",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: { name: resultName, resultName, operation: "new String", before: typeof beforeResult === "string" ? beforeResult : "", after: afterResult, kind: "derived" }
        });
    }

    const concatenationPattern = /\b([A-Za-z_$][\w$]*)\s*(\+=|=(?!=))\s*([^;\n]+);?/g;
    for (const match of statement.matchAll(concatenationPattern)) {
        const resultName = match[1];
        const operator = match[2];
        const expression = match[3] ?? "";
        const after = resultName ? postVariables[resultName] : undefined;
        const before = resultName ? variables[resultName] : undefined;
        if (!resultName || !operator || (operator !== "+=" && !expression.includes("+")) || typeof after !== "string" || before === after) continue;
        const sourceNames = [...expression.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)]
            .map(item => item[1])
            .filter((candidate): candidate is string => typeof candidate === "string" && candidate !== resultName && typeof variables[candidate] === "string");
        const sourceName = sourceNames[0];
        events.push({
            sequence: 0,
            type: "STRING_RESULT",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: { name: resultName, resultName, sourceName, operation: "concatenate", before: typeof before === "string" ? before : "", after, sourceBefore: sourceName ? variables[sourceName] : undefined, kind: "derived" }
        });
    }

    // StringBuilder is mutable; only emit a mutation event when the runtime
    // exposes string snapshots for both sides and proves a changed value.
    const mutablePattern = /\b([A-Za-z_$][\w$]*)\s*\.\s*(append|insert|delete|deleteCharAt|setCharAt|replace|reverse)\s*\(((?:[^()]|\([^()]*\))*)\)/g;
    for (const match of statement.matchAll(mutablePattern)) {
        const name = match[1];
        const operation = match[2];
        if (!name || !operation) continue;
        const before = stringBuilderContents(variables[name]);
        const after = stringBuilderContents(postVariables[name]);
        if (before === undefined || after === undefined || before === after) continue;
        const args = splitTopLevel(match[3] ?? "", ",").map(part => part.trim());
        const firstArg = evaluateExpression(args[0] ?? "", variables);
        const secondArg = evaluateExpression(args[1] ?? "", variables);
        const index = typeof firstArg === "number" && Number.isInteger(firstArg)
            ? firstArg
            : operation === "append" ? before.length : undefined;
        let removed = "";
        let inserted = "";
        if (operation === "deleteCharAt" && index !== undefined) removed = before.charAt(index);
        else if (operation === "delete" && index !== undefined) {
            const end = typeof secondArg === "number" && Number.isInteger(secondArg) ? secondArg : before.length;
            removed = before.slice(index, end);
        } else if (operation === "insert" && index !== undefined) {
            const amount = Math.max(0, after.length - before.length);
            inserted = after.slice(index, index + amount);
        } else if (operation === "append" && after.startsWith(before)) {
            inserted = after.slice(before.length);
        } else if (operation === "setCharAt" && index !== undefined) {
            inserted = after.charAt(index);
            removed = before.charAt(index);
        } else if (operation === "replace" && index !== undefined && typeof secondArg === "number") {
            removed = before.slice(index, secondArg);
            inserted = after.slice(index, index + Math.max(0, after.length - (before.length - removed.length)));
        }
        events.push({
            sequence: 0,
            type: "STRING_MUTATION",
            line: sourceEvent.line,
            method: sourceEvent.method,
            depth: sourceEvent.depth,
            data: { name, operation, before, after, index, removed: removed || undefined, inserted: inserted || undefined, kind: "mutation" }
        });
    }

    return events;
}

function stringBuilderContents(value: unknown): string | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const type = typeof record.$type === "string" ? record.$type : "";
    if (!/StringBuilder|StringBuffer/.test(type)) return undefined;
    const fields = record.fields && typeof record.fields === "object" && !Array.isArray(record.fields)
        ? record.fields as Record<string, unknown>
        : {};
    for (const candidate of [record.value, record.stringValue, record.text, fields.stringValue, fields.text]) {
        if (typeof candidate === "string") return candidate;
    }
    const fieldValue = fields.value;
    const values = fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue) &&
        Array.isArray((fieldValue as Record<string, unknown>).values)
        ? (fieldValue as { values: unknown[] }).values
        : Array.isArray(fieldValue) ? fieldValue : undefined;
    if (!values || !values.every(item => typeof item === "string" || typeof item === "number")) return undefined;
    const count = typeof fields.count === "number" ? fields.count : values.length;
    const coder = typeof fields.coder === "number" ? fields.coder : 0;
    let text: string;
    if (values.every(item => typeof item === "string" && item.length <= 1)) {
        text = (values as string[]).join("");
    } else if (coder === 1) {
        let decoded = "";
        for (let i = 0; i + 1 < values.length; i += 2) {
            decoded += String.fromCharCode(((Number(values[i]) & 255) << 8) | (Number(values[i + 1]) & 255));
        }
        text = decoded;
    } else {
        text = values.map(item => String.fromCharCode(Number(item) & 255)).join("");
    }
    return text.slice(0, count);
}

function evaluateExpression(
    expression: string,
    variables: Record<string, unknown>
): unknown {
    try {
        return new ConditionParser(tokenizeCondition(expression), variables).parse();
    } catch {
        return undefined;
    }
}

function filterStepArrayReferences(
    event: ExecutionEvent,
    sourceLines: string[]
): ExecutionEvent {
    if (!Array.isArray(event.data?.arrayReferences)) return event;
    const filtered = filterArrayReferencesForLine(
        event.data.arrayReferences,
        event.line,
        sourceLines
    );
    return {
        ...event,
        data: {
            ...(event.data ?? {}),
            arrayReferences: filtered
        }
    };
}

function filterArrayReferencesForLine(
    references: unknown,
    line: number | undefined,
    sourceLines: string[]
): unknown[] {
    if (!Array.isArray(references)) return [];
    if (typeof line !== "number" || line < 1 || sourceLines.length === 0) {
        return references;
    }

    const statement = sourceLines[line - 1] ?? "";
    if (!statement.trim()) return references;

    return references.filter((reference) => {
        if (!reference || typeof reference !== "object") return false;
        const record = reference as Record<string, unknown>;
        const name =
            typeof record.array === "string"
                ? record.array
                : typeof record.name === "string"
                    ? record.name
                    : undefined;
        if (!name) return false;

        // Java local-variable names are identifiers, so a word-boundary
        // match is sufficient here and avoids treating every visible array
        // local as a reference on every source line.
        const identifier = new RegExp("\\b" + name + "\\b");
        return identifier.test(statement);
    });
}

function deriveArrayReferenceEvents(
    current: ExecutionEvent,
    sourceLines: string[]
): ExecutionEvent[] {
    const references =
        filterArrayReferencesForLine(
            current.data?.arrayReferences,
            current.line,
            sourceLines
        );

    if (
        !Array.isArray(references)
    ) {
        return [];
    }

    return references
        .filter(
            (access) =>
                access &&
                typeof access === "object"
        )
        .map(
        (access) => ({
            sequence: 0,
            type: "ARRAY_REFERENCE",
            line:
                current.line,
            method:
                current.method,
            depth:
                current.depth,
            data:
                access &&
                typeof access === "object"
                    ? access as Record<string, unknown>
                    : {
                        value: access
                    }
        })
    );
}

function deriveChanges(
    previous: ExecutionEvent,
    current: ExecutionEvent
): ExecutionEvent[] {
    const before =
        getVariables(previous);

    const after =
        getVariables(current);

    const derived: ExecutionEvent[] = [];
    const emittedObjectIds =
        new Set<string>();

    for (
        const [name, currentValue] of
        Object.entries(after)
    ) {
        if (!(name in before)) {
            if (!isDataStructureSnapshot(currentValue)) {
                derived.push(
                    variableUpdate(
                        previous,
                        name,
                        undefined,
                        currentValue
                    )
                );
            }

            continue;
        }

        const previousValue =
            before[name];

        const beforeArray =
            asArraySnapshot(
                previousValue
            );

        const afterArray =
            asArraySnapshot(
                currentValue
            );

        if (
            beforeArray &&
            afterArray &&
            beforeArray.$arrayId ===
                afterArray.$arrayId
        ) {
            const changes:
                Array<{
                    indices: number[];
                    before: unknown;
                    after: unknown;
                }> = [];

            compareArrayValues(
                beforeArray.values,
                afterArray.values,
                [],
                changes
            );

            if (changes.length > 0) {
                derived.push({
                    sequence: 0,
                    type:
                        "ARRAY_WRITE",
                    line:
                        previous.line,
                    method:
                        previous.method,
                    depth:
                        previous.depth,
                    data: {
                        name,
                        objectId:
                            afterArray.$arrayId,
                        changes,
                        values:
                            afterArray.values
                    }
                });
            }

            continue;
        }

        const beforeObject =
            asObjectSnapshot(
                previousValue
            );

        const afterObject =
            asObjectSnapshot(
                currentValue
            );

        if (
            beforeObject &&
            afterObject &&
            beforeObject.$objectId ===
                afterObject.$objectId
        ) {
            const changes:
                Array<{
                    fields: string[];
                    before: unknown;
                    after: unknown;
                }> = [];

            compareObjectFields(
                beforeObject.fields,
                afterObject.fields,
                [],
                changes
            );

            if (
                changes.length > 0 &&
                !emittedObjectIds.has(
                    afterObject.$objectId
                )
            ) {
                emittedObjectIds.add(
                    afterObject.$objectId
                );

                derived.push({
                    sequence: 0,
                    type:
                        "OBJECT_FIELD_WRITE",
                    line:
                        previous.line,
                    method:
                        previous.method,
                    depth:
                        previous.depth,
                    data: {
                        name,
                        objectId:
                            afterObject.$objectId,
                        changes,
                        value:
                            currentValue
                    }
                });
            }

            continue;
        }

        if (
            !sameSnapshot(
                previousValue,
                currentValue
            ) &&
            !isDataStructureSnapshot(currentValue)
        ) {
            derived.push(
                variableUpdate(
                    previous,
                    name,
                    previousValue,
                    currentValue
                )
            );
        }
    }

    return derived;
}
function deriveDataStructureCreationEvents(
    previous: ExecutionEvent,
    current: ExecutionEvent
): ExecutionEvent[] {
    const before = getVariables(previous);
    const after = getVariables(current);
    const derived: ExecutionEvent[] = [];

    for (const [name, value] of Object.entries(after)) {
        if (name in before) continue;

        const map = asMapSnapshot(value);
        if (map) {
            derived.push({
                sequence: 0,
                type: "MAP_WRITE",
                line: current.line,
                method: current.method,
                depth: current.depth,
                data: {
                    name,
                    mapId: map.$mapId,
                    changes: [],
                    entries: map.entries,
                    size: map.size ?? map.entries.length,
                    operation: "create"
                }
            });
        }
    }

    return derived;
}

function deriveMapChanges(
    previous: ExecutionEvent,
    current: ExecutionEvent
): ExecutionEvent[] {
    const before = getVariables(previous);
    const after = getVariables(current);

    const derived: ExecutionEvent[] = [];

    for (const [name, currentValue] of Object.entries(after)) {
        if (!(name in before)) {
            continue;
        }

        const previousValue = before[name];

        const beforeMap = asMapSnapshot(previousValue);
        const afterMap = asMapSnapshot(currentValue);

        if (
            !beforeMap ||
            !afterMap ||
            beforeMap.$mapId !== afterMap.$mapId
        ) {
            continue;
        }

        const changes = compareMapEntries(
            beforeMap.entries,
            afterMap.entries
        );

        if (changes.length === 0) {
            continue;
        }

        derived.push({
            sequence: 0,
            type: "MAP_WRITE",
            line: previous.line,
            method: previous.method,
            depth: previous.depth,
            data: {
                name,
                mapId: afterMap.$mapId,
                changes,
                entries: afterMap.entries,
                size: afterMap.size
            }
        });
    }

    return derived;
}
function variableUpdate(
    source: ExecutionEvent,
    name: string,
    before: unknown,
    value: unknown
): ExecutionEvent {
    const data: Record<string, unknown> = {
        name,
        value
    };

    if (before !== undefined) {
        data.before = before;
    }

    return {
        sequence: 0,
        type: "VARIABLE_UPDATE",
        line: source.line,
        method: source.method,
        depth: source.depth,
        data
    };
}

function getVariables(
    event: ExecutionEvent
): Record<string, unknown> {
    const variables =
        event.data?.variables;

    if (
        !variables ||
        typeof variables !== "object" ||
        Array.isArray(variables)
    ) {
        return {};
    }

    return variables as
        Record<string, unknown>;
}

function asArraySnapshot(
    value: unknown
): {
    $arrayId: string;
    values: unknown[];
} | undefined {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        return undefined;
    }

    const record =
        value as SnapshotRecord;

    if (
        typeof record.$arrayId !== "string" ||
        !Array.isArray(
            record.values
        )
    ) {
        return undefined;
    }

    return {
        $arrayId:
            record.$arrayId,
        values:
            record.values
    };
}
function asMapSnapshot(
    value: unknown
): {
    $mapId: string;
    entries: Array<{
        key: unknown;
        value: unknown;
    }>;
    size?: number;
} | undefined {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        return undefined;
    }

    const record =
        value as SnapshotRecord;

    if (
        typeof record.$mapId !== "string" ||
        !Array.isArray(record.entries)
    ) {
        return undefined;
    }

    const entries =
        record.entries.filter(
            (
                entry
            ): entry is {
                key: unknown;
                value: unknown;
            } =>
                Boolean(entry) &&
                typeof entry === "object" &&
                !Array.isArray(entry) &&
                "key" in entry &&
                "value" in entry
        );

    const result: {
        $mapId: string;
        entries: Array<{
            key: unknown;
            value: unknown;
        }>;
        size?: number;
    } = {
        $mapId:
            record.$mapId,
        entries
    };

    if (
        typeof record.size === "number"
    ) {
        result.size =
            record.size;
    }

    return result;
}
function compareArrayValues(
    before: unknown[],
    after: unknown[],
    path: number[],
    changes: Array<{
        indices: number[];
        before: unknown;
        after: unknown;
    }>
): void {
    const length =
        Math.max(
            before.length,
            after.length
        );

    for (let i = 0; i < length; i++) {
        const beforeValue =
            before[i];

        const afterValue =
            after[i];

        const beforeNested =
            asArraySnapshot(
                beforeValue
            );

        const afterNested =
            asArraySnapshot(
                afterValue
            );

        if (
            beforeNested &&
            afterNested &&
            beforeNested.$arrayId ===
                afterNested.$arrayId
        ) {
            compareArrayValues(
                beforeNested.values,
                afterNested.values,
                [...path, i],
                changes
            );

            continue;
        }

        if (
            !sameSnapshot(
                beforeValue,
                afterValue
            )
        ) {
            changes.push({
                indices:
                    [...path, i],
                before:
                    beforeValue,
                after:
                    afterValue
            });
        }
    }
}
function compareMapEntries(
    before: Array<{
        key: unknown;
        value: unknown;
    }>,
    after: Array<{
        key: unknown;
        value: unknown;
    }>
): Array<{
    kind:
        | "insert"
        | "update"
        | "delete";
    key: unknown;
    before?: unknown;
    after?: unknown;
}> {
    const changes: Array<{
        kind:
            | "insert"
            | "update"
            | "delete";
        key: unknown;
        before?: unknown;
        after?: unknown;
    }> = [];

    const beforeMap =
        new Map<string, {
            key: unknown;
            value: unknown;
        }>();

    const afterMap =
        new Map<string, {
            key: unknown;
            value: unknown;
        }>();

    for (const entry of before) {
        beforeMap.set(
            stableSnapshotKey(entry.key),
            entry
        );
    }

    for (const entry of after) {
        afterMap.set(
            stableSnapshotKey(entry.key),
            entry
        );
    }

    for (const [key, entry] of afterMap) {
        const previous =
            beforeMap.get(key);

        if (!previous) {
            changes.push({
                kind: "insert",
                key: entry.key,
                after: entry.value
            });
            continue;
        }

        if (
            !sameSnapshot(
                previous.value,
                entry.value
            )
        ) {
            changes.push({
                kind: "update",
                key: entry.key,
                before: previous.value,
                after: entry.value
            });
        }
    }

    for (const [key, entry] of beforeMap) {
        if (!afterMap.has(key)) {
            changes.push({
                kind: "delete",
                key: entry.key,
                before: entry.value
            });
        }
    }

    return changes;
}

function stableSnapshotKey(
    value: unknown
): string {
    return JSON.stringify(value);
}
function asObjectSnapshot(
    value: unknown
): {
    $objectId: string;
    fields: Record<string, unknown>;
} | undefined {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        return undefined;
    }

    const record =
        value as SnapshotRecord;

    if (
        typeof record.$objectId !== "string" ||
        !record.fields ||
        typeof record.fields !== "object" ||
        Array.isArray(record.fields)
    ) {
        return undefined;
    }

    return {
        $objectId:
            record.$objectId,
        fields:
            record.fields as
                Record<string, unknown>
    };
}

function compareObjectFields(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    path: string[],
    changes: Array<{
        fields: string[];
        before: unknown;
        after: unknown;
    }>
): void {
    const keys =
        new Set([
            ...Object.keys(before),
            ...Object.keys(after)
        ]);

    for (const key of keys) {
        const beforeValue =
            before[key];

        const afterValue =
            after[key];

        const beforeObject =
            asObjectSnapshot(
                beforeValue
            );

        const afterObject =
            asObjectSnapshot(
                afterValue
            );

        if (
            beforeObject &&
            afterObject &&
            beforeObject.$objectId ===
                afterObject.$objectId
        ) {
            compareObjectFields(
                beforeObject.fields,
                afterObject.fields,
                [...path, key],
                changes
            );

            continue;
        }

        if (
            !sameSnapshot(
                beforeValue,
                afterValue
            )
        ) {
            changes.push({
                fields:
                    [...path, key],
                before:
                    beforeValue,
                after:
                    afterValue
            });
        }
    }
}

function sameSnapshot(
    left: unknown,
    right: unknown
): boolean {
    return (
        JSON.stringify(left) ===
        JSON.stringify(right)
    );
}


function isDataStructureSnapshot(
    value: unknown
): boolean {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        return false;
    }

    const record =
        value as SnapshotRecord;

    return (
        typeof record.$arrayId === "string" ||
        typeof record.$mapId === "string" ||
        typeof record.$collectionId === "string"
    );
}