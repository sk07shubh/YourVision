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
        if (
            event.type === "STEP" &&
            previousStep
        ) {
            enriched.push(
                ...deriveArrayAccessEvents(
                    previousStep,
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

        if (event.type === "STEP") {
            previousStep = event;
        }
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

function deriveArrayAccessEvents(
    previous: ExecutionEvent,
    current: ExecutionEvent
): ExecutionEvent[] {
    const accesses =
        current.data?.accesses;

    if (
        !Array.isArray(accesses)
    ) {
        return [];
    }

    return accesses
        .filter(
            (access) =>
                access &&
                typeof access === "object"
        )
        .map(
        (access) => ({
            sequence: 0,
            type: "ARRAY_ACCESS",
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
            derived.push(
                variableUpdate(
                    previous,
                    name,
                    currentValue
                )
            );

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
            )
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
