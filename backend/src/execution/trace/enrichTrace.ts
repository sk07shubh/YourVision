import type {
    ExecutionEvent,
    ExecutionTrace
} from "./schema.js";

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
                    ...deriveArrayAccessEvents(previousStep, sourceLines)
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
                    ...deriveArrayAccessEvents(previousStep, sourceLines)
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


    return {
        version: 1,
        events: enriched.map((event, index) => ({
            ...event,
            sequence: index + 1
        }))
    };
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
): unknown[] {
    return Array.isArray(event.data?.executionEvents)
        ? event.data.executionEvents
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
    for (const keyword of ["if", "while"]) {
        if (new RegExp("^" + keyword + "\\s*\\(").test(trimmed)) {
            return balancedParenthesized(trimmed, trimmed.indexOf("("));
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