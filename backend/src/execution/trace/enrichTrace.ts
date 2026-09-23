import type {
    ExecutionEvent,
    ExecutionTrace
} from "./schema.js";

type SnapshotRecord =
    Record<string, unknown>;

export function enrichTrace(
    trace: ExecutionTrace
): ExecutionTrace {
    const enriched: ExecutionEvent[] = [];

    let previousStep:
        ExecutionEvent | undefined;

    for (const event of trace.events) {
        if (event.type === "STEP") {
    if (previousStep) {
        enriched.push(
            ...deriveArrayReferenceEvents(
                event
            )
        );

        enriched.push(
            ...deriveChanges(
                previousStep,
                event
            )
        );
    }

    enriched.push(event);

    if (previousStep) {
        enriched.push(
            ...deriveMapChanges(
                previousStep,
                event
            )
        );
    }

    previousStep = event;
    continue;
}

        enriched.push(event);

    }

    return {
        version: 1,
        events:
            enriched.map(
                (event, index) => ({
                    ...event,
                    sequence:
                        index + 1
                })
            )
    };
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
            line: current.line,
            method: current.method,
            depth: current.depth,
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
