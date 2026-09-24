import type {
    ExecutionEvent,
    ExecutionTrace,
    TraceState
} from "./schema.js";

export function buildStates(
    trace: ExecutionTrace
): TraceState[] {
    const states: TraceState[] = [];

    let state: TraceState = {
        sequence: 0,
        line: 0,
        method: "",
        depth: 0,
        variables: {},
        arrays: {},
        dataStructures: {},
        objects: {},
        callStack: []
    };

    for (const event of trace.events) {
        state = applyEvent(state, event);

        if (!isCheckpointEvent(event)) {
            continue;
        }

        states.push({
            ...state,
            variables: { ...state.variables },
            arrays: { ...state.arrays },
            dataStructures: { ...state.dataStructures },
            objects: { ...state.objects },
            callStack: [...state.callStack]
        });
    }

    return states;
}

function isCheckpointEvent(event: ExecutionEvent): boolean {
    return (
        event.type === "STEP" ||
        event.type === "ERROR" ||
        event.type === "TIMEOUT" ||
        event.type === "TRACE_LIMIT" ||
        event.type === "PROGRAM_END"
    );
}

function applyEvent(
    previous: TraceState,
    event: ExecutionEvent
): TraceState {
    const next: TraceState = {
        ...previous,
        sequence: event.sequence,
        line: event.line ?? previous.line,
        method: event.method ?? previous.method,
        depth: event.depth ?? previous.depth,
        lastEvent: event
    };

    const data = event.data ?? {};

    switch (event.type) {
        case "STEP":
            applyVariableSnapshot(next, data.variables);

            if (typeof data.displayLine === "number") {
                next.line = data.displayLine;
            }
            break;

        case "ARRAY_REFERENCE":
            next.lastEvent = event;
            break;

        case "ARRAY_ACCESS":
            next.lastEvent = event;
            break;

        case "VARIABLE_UPDATE":
            if (typeof data.name === "string") {
                next.variables = {
                    ...next.variables,
                    [data.name]: data.value
                };
            }
            break;

        case "ARRAY_WRITE":
            if (
                typeof data.name === "string" &&
                Array.isArray(data.values)
            ) {
                const current =
                    next.arrays[data.name];

                const currentRecord =
                    current &&
                    typeof current === "object" &&
                    !Array.isArray(current)
                        ? current as Record<string, unknown>
                        : {};

                next.arrays = {
                    ...next.arrays,
                    [data.name]: {
                        ...currentRecord,
                        $arrayId:
                            typeof data.objectId === "string"
                                ? data.objectId
                                : currentRecord.$arrayId,
                        objectId:
                            typeof data.objectId === "string"
                                ? data.objectId
                                : currentRecord.objectId,
                        values: [...data.values],
                        changes:
                            Array.isArray(data.changes)
                                ? data.changes
                                : undefined
                    }
                };
            }
            break;

        case "MAP_WRITE":
            if (
                typeof data.name === "string" &&
                typeof data.mapId === "string" &&
                Array.isArray(data.entries)
            ) {
                const current =
                    next.dataStructures[data.name];

                const currentRecord =
                    current &&
                    typeof current === "object" &&
                    !Array.isArray(current)
                        ? current as Record<string, unknown>
                        : {};

                next.dataStructures = {
                    ...next.dataStructures,
                    [data.name]: {
                        ...currentRecord,
                        $mapId: data.mapId,
                        entries: data.entries,
                        size:
                            typeof data.size === "number"
                                ? data.size
                                : currentRecord.size,
                        changes:
                            Array.isArray(data.changes)
                                ? data.changes
                                : undefined
                    }
                };
            }
            break;

        case "OBJECT_CREATE":
            if (typeof data.objectId === "string") {
                next.objects = {
                    ...next.objects,
                    [data.objectId]: data.value
                };
            }
            break;

        case "OBJECT_FIELD_WRITE":
            if (
                typeof data.objectId === "string"
            ) {
                next.objects = {
                    ...next.objects,
                    [data.objectId]:
                        data.value
                };
            }
            break;

        case "METHOD_ENTER":
            if (event.method) {
                next.callStack = [
                    ...previous.callStack,
                    event.method
                ];
            }

            applyVariableSnapshot(next, data.variables);
            break;

        case "METHOD_EXIT":
            next.callStack =
                previous.callStack.length > 0
                    ? previous.callStack.slice(
                        0,
                        -1
                    )
                    : [];
            break;

        case "ERROR":
            next.error = {
                type:
                    typeof data.type === "string"
                        ? data.type
                        : "UnknownError",
                message:
                    typeof data.message === "string"
                        ? data.message
                        : ""
            };
            break;

        default:
            break;
    }

    return next;
}


function applyVariableSnapshot(
    next: TraceState,
    value: unknown
): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return;
    }

    const variables = value as Record<string, unknown>;
    const localVariables: Record<string, unknown> = {};

    next.arrays = {};
    next.dataStructures = {};
    next.objects = {};

    for (const [name, item] of Object.entries(variables)) {
        if (!isDataStructureSnapshot(item)) {
            localVariables[name] = item;
        }

        collectSnapshots(
            item,
            name,
            next.arrays,
            next.dataStructures,
            next.objects,
            true
        );
    }

    next.variables = localVariables;
}

function collectSnapshots(
    value: unknown,
    variableName: string,
    arrays: Record<string, unknown>,
    dataStructures: Record<string, unknown>,
    objects: Record<string, unknown>,
    registerNamedArray: boolean
): void {
    if (
        !value ||
        typeof value !== "object"
    ) {
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectSnapshots(
                item,
                variableName,
                arrays,
                dataStructures,
                objects,
                false
            );
        }

        return;
    }

    const record =
        value as Record<string, unknown>;

    if (
        typeof record.$arrayId === "string"
    ) {
        if (
            registerNamedArray &&
            !record.$ref &&
            Array.isArray(record.values)
        ) {
            arrays[variableName] = {
                ...record,
                objectId:
                    record.$arrayId
            };
        }

        if (Array.isArray(record.values)) {
            for (const item of record.values) {
                collectSnapshots(
                item,
                variableName,
                arrays,
                dataStructures,
                objects,
                false
            );
            }
        }

        return;
    }

    if (
        typeof record.$mapId === "string" ||
        typeof record.$collectionId === "string"
    ) {
        if (registerNamedArray) {
            dataStructures[variableName] = value;
        }

        if (Array.isArray(record.values)) {
            for (const item of record.values) {
                collectSnapshots(
                    item,
                    variableName,
                    arrays,
                    dataStructures,
                    objects,
                    false
                );
            }
        }

        if (Array.isArray(record.entries)) {
            for (const entry of record.entries) {
                if (
                    entry &&
                    typeof entry === "object" &&
                    !Array.isArray(entry)
                ) {
                    const entryRecord =
                        entry as Record<string, unknown>;

                    collectSnapshots(
                        entryRecord.key,
                        variableName,
                        arrays,
                        dataStructures,
                        objects,
                        false
                    );

                    collectSnapshots(
                        entryRecord.value,
                        variableName,
                        arrays,
                        dataStructures,
                        objects,
                        false
                    );
                }
            }
        }

        return;
    }

    if (
        typeof record.$objectId === "string"
    ) {
        const objectId =
            record.$objectId;

        objects[objectId] = value;

        if (
            record.fields &&
            typeof record.fields === "object" &&
            !Array.isArray(record.fields)
        ) {
            for (
                const child of
                Object.values(
                    record.fields as
                        Record<string, unknown>
                )
            ) {
                collectSnapshots(
                    child,
                    variableName,
                    arrays,
                    dataStructures,
                    objects,
                    false
                );
            }
        }

        return;
    }

    for (const child of Object.values(record)) {
        collectSnapshots(
            child,
            variableName,
            arrays,
            dataStructures,
            objects,
            false
        );
    }
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
        value as Record<string, unknown>;

    return (
        typeof record.$arrayId === "string" ||
        typeof record.$mapId === "string" ||
        typeof record.$collectionId === "string"
    );
}
