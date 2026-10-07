import type {
    ExecutionEvent,
    ExecutionTrace
} from "./schema.js";

type SnapshotRecord = Record<string, unknown>;

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
            event = annotateCondition(event, sourceLines);
            if (previousStep && previousStep.method === event.method) {
                enriched.push(...deriveArrayReferenceEvents(event));
                enriched.push(...deriveChanges(previousStep, event));
                enriched.push(...deriveMapChanges(previousStep, event));
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
            const derived: ExecutionEvent[] = [];

            if (previousStep && previousStep.method === event.method) {
                derived.push(...deriveChanges(previousStep, event));
                derived.push(...deriveMapChanges(previousStep, event));
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

            // A method can return before STEP_LINE gives us a second
            // checkpoint. Compare the final frame against method entry so
            // mutations to arguments are still visible.
            const entry = methodEntries.pop();
            if (entry && entry.method === event.method) {
                const entryDerived = [
                    ...deriveChanges(entry, event),
                    ...deriveMapChanges(entry, event)
                ];

                const existing = new Set(
                    derived.map(item =>
                        JSON.stringify({
                            type: item.type,
                            data: item.data
                        })
                    )
                );

                for (const item of entryDerived) {
                    const key = JSON.stringify({
                        type: item.type,
                        data: item.data
                    });

                    if (
                        (
                            item.type === "OBJECT_FIELD_WRITE" ||
                            item.type === "ARRAY_WRITE" ||
                            item.type === "MAP_WRITE"
                        ) &&
                        !existing.has(key)
                    ) {
                        derived.push(item);
                        existing.add(key);
                    }
                }
            }

            enriched.push(...derived);
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
    if (/^for\\s*\\(/.test(trimmed)) {
        const inside = balancedParenthesized(trimmed, trimmed.indexOf("("));
        if (!inside) return undefined;
        const parts = splitTopLevel(inside, ";");
        return parts.length === 3 ? parts[1].trim() : undefined;
    }
    const doWhile = trimmed.match(/\\bwhile\\s*\\(/);
    if (doWhile) return balancedParenthesized(trimmed, trimmed.indexOf("(", doWhile.index ?? 0));
    return undefined;
}

function balancedParenthesized(source: string, openIndex: number): string | undefined {
    if (source[openIndex] !== "(") return undefined;
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let i = openIndex; i < source.length; i++) {
        const ch = source[i];
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
        const ch = source[i];
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
        const ch = source[i];
        if (/\\s/.test(ch)) { i++; continue; }
        const two = source.slice(i, i + 2);
        if (["&&", "||", "==", "!=", "<=", ">="].includes(two)) {
            tokens.push({ type: "operator", value: two }); i += 2; continue;
        }
        if ("()[]!.+-*/%<>".includes(ch)) {
            tokens.push({ type: "operator", value: ch }); i++; continue;
        }
        if (ch === '"' || ch === "'") {
            const quote = ch; let value = ""; i++;
            while (i < source.length) {
                const current = source[i];
                if (current === "\\" && i + 1 < source.length) { value += source[i + 1]; i += 2; continue; }
                if (current === quote) { i++; break; }
                value += current; i++;
            }
            tokens.push({ type: "string", value }); continue;
        }
        if (/[0-9]/.test(ch)) {
            let end = i + 1;
            while (end < source.length && /[0-9.]/.test(source[end])) end++;
            tokens.push({ type: "number", value: source.slice(i, end) }); i = end; continue;
        }
        if (/[A-Za-z_$]/.test(ch)) {
            let end = i + 1;
            while (end < source.length && /[A-Za-z0-9_$]/.test(source[end])) end++;
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
    private parseOr(): unknown {
        let left = this.parseAnd();
        while (this.peek("||")) {
            this.index++; const right = this.parseAnd();
            if (typeof left !== "boolean" || typeof right !== "boolean") throw new Error("boolean expected");
            left = left || right;
        }
        return left;
    }
    private parseAnd(): unknown {
        let left = this.parseEquality();
        while (this.peek("&&")) {
            this.index++; const right = this.parseEquality();
            if (typeof left !== "boolean" || typeof right !== "boolean") throw new Error("boolean expected");
            left = left && right;
        }
        return left;
    }
    private parseEquality(): unknown {
        let left = this.parseRelational();
        while (this.peek("==") || this.peek("!=")) {
            const operator = this.tokens[this.index++].value;
            const right = this.parseRelational();
            const equal = sameConditionValue(left, right);
            left = operator === "==" ? equal : !equal;
        }
        return left;
    }
    private parseRelational(): unknown {
        let left = this.parseAdditive();
        while (this.peek("<") || this.peek("<=") || this.peek(">") || this.peek(">=")) {
            const operator = this.tokens[this.index++].value;
            const right = this.parseAdditive();
            if (typeof left !== "number" || typeof right !== "number") throw new Error("numeric comparison expected");
            if (operator === "<") left = left < right;
            else if (operator === "<=") left = left <= right;
            else if (operator === ">") left = left > right;
            else left = left >= right;
        }
        return left;
    }
    private parseAdditive(): unknown {
        let left = this.parseMultiplicative();
        while (this.peek("+") || this.peek("-")) {
            const operator = this.tokens[this.index++].value;
            const right = this.parseMultiplicative();
            if (operator === "+" && (typeof left === "string" || typeof right === "string")) left = String(left) + String(right);
            else if (typeof left === "number" && typeof right === "number") left = operator === "+" ? left + right : left - right;
            else throw new Error("numeric operands expected");
        }
        return left;
    }
    private parseMultiplicative(): unknown {
        let left = this.parseUnary();
        while (this.peek("*") || this.peek("/") || this.peek("%")) {
            const operator = this.tokens[this.index++].value;
            const right = this.parseUnary();
            if (typeof left !== "number" || typeof right !== "number") throw new Error("numeric operands expected");
            if (operator === "*") left = left * right;
            else if (operator === "/") left = left / right;
            else left = left % right;
        }
        return left;
    }
    private parseUnary(): unknown {
        if (this.peek("!")) { this.index++; const value = this.parseUnary(); if (typeof value !== "boolean") throw new Error("boolean expected"); return !value; }
        if (this.peek("-")) { this.index++; const value = this.parseUnary(); if (typeof value !== "number") throw new Error("numeric operand expected"); return -value; }
        if (this.peek("+")) { this.index++; const value = this.parseUnary(); if (typeof value !== "number") throw new Error("numeric operand expected"); return value; }
        return this.parsePrimary();
    }
    private parsePrimary(): unknown {
        const token = this.tokens[this.index++];
        if (!token) throw new Error("missing expression");
        let value: unknown;
        if (token.value === "(") { value = this.parseOr(); this.consume(")"); }
        else if (token.type === "number") value = Number(token.value);
        else if (token.type === "string") value = token.value;
        else if (token.type === "identifier") {
            if (token.value === "true") value = true;
            else if (token.value === "false") value = false;
            else if (token.value === "null") value = null;
            else value = this.resolveVariable(token.value);
        } else throw new Error("unsupported primary");

        while (this.peek("[") || this.peek(".")) {
            if (this.peek("[")) {
                this.index++; const index = this.parseOr(); this.consume("]");
                if (typeof index !== "number") throw new Error("array index expected");
                value = readIndexed(value, index);
            } else {
                this.index++;
                const property = this.tokens[this.index++];
                if (!property || property.type !== "identifier" || property.value !== "length") throw new Error("unsupported property");
                value = readLength(value);
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
        const record = value.snapshot;
        if (Array.isArray(record.values)) return record.values[index];
    }
    throw new Error("not indexable");
}

function readLength(value: unknown): number {
    if (typeof value === "string" || Array.isArray(value)) return value.length;
    if (value && typeof value === "object" && "snapshot" in value) {
        const record = value.snapshot;
        if (typeof record.length === "number") return record.length;
        if (Array.isArray(record.values)) return record.values.length;
        if (Array.isArray(record.entries)) return record.entries.length;
    }
    throw new Error("length unavailable");
}

function sameConditionValue(left: unknown, right: unknown): boolean {
    if (left && typeof left === "object" && "snapshot" in left && right && typeof right === "object" && "snapshot" in right) {
        return JSON.stringify(left.snapshot) === JSON.stringify(right.snapshot);
    }
    return left === right;
}

function deriveArrayReferenceEvents(
    current: ExecutionEvent
): ExecutionEvent[] {
    const references =
        current.data?.arrayReferences;

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
    value: unknown
): ExecutionEvent {
    return {
        sequence: 0,
        type:
            "VARIABLE_UPDATE",
        line:
            source.line,
        method:
            source.method,
        depth:
            source.depth,
        data: {
            name,
            value
        }
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
