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
            normalizeForLoopCheckpoint(event, previousStep, undefined, sourceLines);
            if (previousStep && previousStep.method === event.method) {
                const transitionEvents = [
                    ...deriveChanges(previousStep, event),
                    ...deriveMapChanges(previousStep, event)
                ];

                // A normal state transition belongs to the previous line.
                // A for-loop update is the important exception: Java executes
                // the update expression before reaching the next condition
                // checkpoint, so that variable change belongs to the next
                // highlighted for-line.
                const { previousLineEvents, currentLineEvents } =
                    partitionLoopUpdateEvents(
                        previousStep,
                        event,
                        transitionEvents,
                        sourceLines
                    );

                normalizeForLoopCheckpoint(
                    event,
                    previousStep,
                    currentLineEvents,
                    sourceLines
                );

                const executionEvents = [
                    ...previousLineEvents,
                    ...deriveArrayAccessEvents(previousStep, sourceLines)
                ];

                const sameLineLoopUpdate =
                    previousStep.line === event.line &&
                    event.data?.executionPhase === "update";

                attachStepResult(
                    previousStep,
                    event,
                    executionEvents,
                    sameLineLoopUpdate
                );

                if (currentLineEvents.length > 0) {
                    appendExecutionEvents(event, currentLineEvents);
                }

                insertDerivedEvents(
                    enriched,
                    previousStep,
                    [
                        ...executionEvents,
                        ...deriveArrayReferenceEvents(event, sourceLines)
                    ]
                );
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

    normalizeForLoopSequence(enriched, sourceLines);

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

function partitionLoopUpdateEvents(
    previous: ExecutionEvent,
    current: ExecutionEvent,
    events: ExecutionEvent[],
    sourceLines: string[]
): {
    previousLineEvents: ExecutionEvent[];
    currentLineEvents: ExecutionEvent[];
} {
    const statement =
        typeof current.line === "number" && current.line > 0
            ? sourceLines[current.line - 1]?.trim() ?? ""
            : "";

    const loop = parseBasicForStatement(statement);
    if (!loop) {
        return { previousLineEvents: events, currentLineEvents: [] };
    }

    const previousVariables = getVariables(previous);
    const currentLineEvents: ExecutionEvent[] = [];
    const previousLineEvents: ExecutionEvent[] = [];

    for (const event of events) {
        const name =
            event.type === "VARIABLE_UPDATE" &&
            typeof event.data?.name === "string"
                ? event.data.name
                : undefined;

        if (
            name &&
            (
                // A variable first appearing at this for checkpoint belongs
                // to ForInit, not to the line before the loop.
                (loop.initNames.has(name) && !(name in previousVariables)) ||
                // A variable that already existed and is modified by ForUpdate
                // belongs to this loop checkpoint as well.
                (loop.updateNames.has(name) && name in previousVariables)
            )
        ) {
            currentLineEvents.push(event);
        } else {
            previousLineEvents.push(event);
        }
    }

    return { previousLineEvents, currentLineEvents };
}


function parseBasicForStatement(statement: string): {
    init: string;
    condition: string;
    update: string;
    initNames: Set<string>;
    updateNames: Set<string>;
} | undefined {
    if (!/^for\s*\(/.test(statement.trim())) return undefined;
    const inside = balancedParenthesized(statement, statement.indexOf("("));
    if (inside === undefined) return undefined;
    const parts = splitTopLevel(inside, ";");
    if (parts.length !== 3) return undefined;

    const assignmentNames = (part: string): Set<string> => {
        const names = new Set<string>();
        for (const match of part.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:\+\+|--|[+\-*/%&|^]?=)/g)) {
            if (match[1]) names.add(match[1]);
        }
        for (const match of part.matchAll(/(?:\+\+|--)\s*([A-Za-z_$][\w$]*)\b/g)) {
            if (match[1]) names.add(match[1]);
        }
        return names;
    };

    return {
        init: parts[0]?.trim() ?? "",
        condition: parts[1]?.trim() ?? "",
        update: parts[2]?.trim() ?? "",
        initNames: assignmentNames(parts[0] ?? ""),
        updateNames: assignmentNames(parts[2] ?? "")
    };
}

function setExecutionPhase(
    event: ExecutionEvent,
    phase: "initialization" | "condition" | "update"
): void {
    event.data = {
        ...(event.data ?? {}),
        executionPhase: phase
    };
}

function removeConditionResult(event: ExecutionEvent): void {
    if (!event.data || !("conditionResult" in event.data)) return;
    const data = { ...event.data };
    delete data.conditionResult;
    event.data = data;
}

function executionEventsFor(
    event: ExecutionEvent
): unknown[] {
    return Array.isArray(event.data?.executionEvents)
        ? event.data.executionEvents
        : [];
}

function variableUpdateEvents(
    events: unknown[],
    names: Set<string>
): unknown[] {
    return events.filter(candidate =>
        isPlainObject(candidate) &&
        candidate.type === "VARIABLE_UPDATE" &&
        isPlainObject(candidate.data) &&
        typeof candidate.data.name === "string" &&
        names.has(candidate.data.name)
    );
}

function appendUniqueExecutionEvents(
    event: ExecutionEvent,
    additions: unknown[]
): void {
    if (additions.length === 0) return;

    const existing = executionEventsFor(event);
    const signature = (candidate: unknown): string => {
        if (!isPlainObject(candidate)) return "";
        const data = isPlainObject(candidate.data) ? candidate.data : {};
        return JSON.stringify({
            type: candidate.type,
            name: data.name,
            value: data.value,
            before: data.before
        });
    };

    const merged = [...existing];
    const seen = new Set(merged.map(signature));
    for (const addition of additions) {
        const key = signature(addition);
        if (!seen.has(key)) {
            merged.push(addition);
            seen.add(key);
        }
    }

    event.data = {
        ...(event.data ?? {}),
        executionEvents: merged
    };
}

function normalizeForLoopCheckpoint(
    current: ExecutionEvent,
    previous: ExecutionEvent | undefined,
    currentLineEvents: ExecutionEvent[] | undefined,
    sourceLines: string[]
): void {
    const statement =
        typeof current.line === "number" && current.line > 0
            ? sourceLines[current.line - 1]?.trim() ?? ""
            : "";
    const loop = parseBasicForStatement(statement);
    if (!loop) return;

    const currentVariables = getVariables(current);
    const previousVariables = previous ? getVariables(previous) : {};
    const rawEvents = executionEventsFor(current);

    if (!previous) {
        if ([...loop.initNames].some(name => name in currentVariables)) {
            setExecutionPhase(current, "initialization");
            removeConditionResult(current);
        } else {
            setExecutionPhase(current, "condition");
        }
        return;
    }

    const checkpointEvents = currentLineEvents ?? [];
    if (checkpointEvents.length > 0) {
        const hasInitialization = checkpointEvents.some(candidate => {
            const data = isPlainObject(candidate.data) ? candidate.data : {};
            return typeof data.name === "string" &&
                loop.initNames.has(data.name) &&
                !(data.name in previousVariables);
        });
        setExecutionPhase(
            current,
            hasInitialization ? "initialization" : "update"
        );
        removeConditionResult(current);
        return;
    }

    if (previous.line !== current.line) {
        if (
            [...loop.initNames].some(
                name => !(name in previousVariables) && name in currentVariables
            )
        ) {
            setExecutionPhase(current, "initialization");
            removeConditionResult(current);
            return;
        }

        setExecutionPhase(current, "condition");
        return;
    }

    // A same-line STEP can contain a duplicate VARIABLE_UPDATE emitted by the
    // tracer while the debugger is moving from initialization/update to the
    // condition checkpoint. Only treat it as an update when the variable
    // actually transitions at this checkpoint.
    const rawUpdateEvents = variableUpdateEvents(
        rawEvents,
        loop.updateNames
    ).filter(candidate => {
        if (!isPlainObject(candidate)) return false;
        const data = isPlainObject(candidate.data) ? candidate.data : {};
        if (typeof data.name !== "string" || !(data.name in previousVariables)) {
            return false;
        }

        if ("before" in data) {
            return !sameSnapshot(data.before, data.value);
        }

        return !sameSnapshot(
            previousVariables[data.name],
            currentVariables[data.name]
        );
    });

    const duplicateLoopEvents = variableUpdateEvents(
        rawEvents,
        new Set([...loop.initNames, ...loop.updateNames])
    ).filter(candidate => !rawUpdateEvents.includes(candidate));

    if (rawUpdateEvents.length > 0) {
        appendUniqueExecutionEvents(previous, rawUpdateEvents);
        setExecutionPhase(previous, "update");
        removeConditionResult(previous);

        current.data = {
            ...(current.data ?? {}),
            executionEvents: rawEvents.filter(candidate => !rawUpdateEvents.includes(candidate))
        };
        setExecutionPhase(current, "condition");
        return;
    }

    // Do not surface a zero-delta loop variable update as a second execution
    // result. The state already represents the condition checkpoint.
    if (duplicateLoopEvents.length > 0) {
        current.data = {
            ...(current.data ?? {}),
            executionEvents: rawEvents.filter(candidate => !duplicateLoopEvents.includes(candidate))
        };
    }

    setExecutionPhase(current, "condition");
}

function normalizeForLoopSequence(
    events: ExecutionEvent[],
    sourceLines: string[]
): void {
    const stepIndices = events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.type === "STEP");

    for (let position = 0; position < stepIndices.length - 1; position++) {
        const first = stepIndices[position]!;
        const second = stepIndices[position + 1]!;

        if (
            first.event.method !== second.event.method ||
            first.event.line !== second.event.line
        ) {
            continue;
        }

        const statement =
            typeof first.event.line === "number" && first.event.line > 0
                ? sourceLines[first.event.line - 1]?.trim() ?? ""
                : "";
        const loop = parseBasicForStatement(statement);
        if (!loop) continue;

        const firstData = first.event.data ?? {};
        const secondData = second.event.data ?? {};
        const firstEvents = executionEventsFor(first.event);
        const secondEvents = executionEventsFor(second.event);

        const changedUpdateEvents = secondEvents.filter(candidate => {
            if (!isPlainObject(candidate) || candidate.type !== "VARIABLE_UPDATE") {
                return false;
            }
            const data = isPlainObject(candidate.data) ? candidate.data : {};
            if (
                typeof data.name !== "string" ||
                !loop.updateNames.has(data.name)
            ) {
                return false;
            }
            if ("before" in data) {
                return !sameSnapshot(data.before, data.value);
            }
            return false;
        });

        const initEvents = secondEvents.filter(candidate => {
            if (!isPlainObject(candidate) || candidate.type !== "VARIABLE_UPDATE") {
                return false;
            }
            const data = isPlainObject(candidate.data) ? candidate.data : {};
            return (
                typeof data.name === "string" &&
                loop.initNames.has(data.name) &&
                !("before" in data)
            );
        });

        // Some JDI line-step sequences expose the first for location twice:
        // the first checkpoint already contains the initialized locals, while
        // the second checkpoint carries the derived initialization update.
        // The semantic order is initialization -> condition.
        if (
            initEvents.length > 0 &&
            [...loop.initNames].some(name => name in getVariables(first.event)) &&
            firstEvents.length === 0
        ) {
            appendUniqueExecutionEvents(first.event, initEvents);
            setExecutionPhase(first.event, "initialization");
            removeConditionResult(first.event);

            second.event.data = {
                ...(second.event.data ?? {}),
                executionEvents: secondEvents.filter(candidate => !initEvents.includes(candidate))
            };
            annotateConditionInPlace(second.event, sourceLines);
            setExecutionPhase(second.event, "condition");
            continue;
        }

        // After a loop body, the runtime can expose the condition checkpoint
        // before the update snapshot even though Java executes update first.
        // Move the observed update result onto that highlighted checkpoint,
        // then use the following same-line checkpoint as the condition with
        // the updated state.
        if (changedUpdateEvents.length > 0) {
            appendUniqueExecutionEvents(first.event, changedUpdateEvents);
            setExecutionPhase(first.event, "update");
            removeConditionResult(first.event);

            if (secondData.variables && typeof secondData.variables === "object") {
                first.event.data = {
                    ...(first.event.data ?? {}),
                    postVariables: secondData.variables
                };
            }

            second.event.data = {
                ...(second.event.data ?? {}),
                executionEvents: secondEvents.filter(candidate => !changedUpdateEvents.includes(candidate))
            };
            annotateConditionInPlace(second.event, sourceLines);
            setExecutionPhase(second.event, "condition");
        }
    }
}

function annotateConditionInPlace(
    event: ExecutionEvent,
    sourceLines: string[]
): void {
    const annotated = annotateCondition(event, sourceLines);
    event.data = annotated.data;
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
    executionEvents: ExecutionEvent[],
    preserveCurrentLoopCheckpoint = false
): void {
    const data = {
        ...(step.data ?? {})
    };

    if (
        !preserveCurrentLoopCheckpoint &&
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

type ConditionValue = number | string | boolean | null | ConditionValue[] | { snapshot: Record<string, unknown> };
type ConditionToken = { type: "number" | "string" | "identifier" | "operator"; value: string };

function evaluateCondition(expression: string, variables: Record<string, unknown>): boolean | undefined {
    try {
        const parser = new ConditionParser(tokenizeCondition(expression), variables);
        const value = parser.parse();
        return typeof value === "boolean" ? value : undefined;
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
                // Java short-circuits &&. Still consume the RHS so the
                // parser remains synchronized, but do not evaluate it.
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
        if (token.value === "(") { value = this.parseOr(evaluate); this.consume(")"); }
        else if (token.type === "number") value = evaluate ? Number(token.value) : undefined;
        else if (token.type === "string") value = evaluate ? token.value : undefined;
        else if (token.type === "identifier") {
            if (token.value === "true") value = evaluate ? true : undefined;
            else if (token.value === "false") value = evaluate ? false : undefined;
            else if (token.value === "null") value = evaluate ? null : undefined;
            else value = evaluate ? this.resolveVariable(token.value) : undefined;
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
    if (!value || typeof value !== "object" || !("snapshot" in value)) {
        throw new Error("method receiver unavailable");
    }

    const snapshot = (value as { snapshot: Record<string, unknown> }).snapshot;

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
