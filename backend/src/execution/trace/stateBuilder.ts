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
        objects: {},
        callStack: []
    };

    for (const event of trace.events) {
        state = applyEvent(state, event);

        states.push({
            ...state,
            variables: { ...state.variables },
            arrays: { ...state.arrays },
            objects: { ...state.objects },
            callStack: [...state.callStack]
        });
    }

    return states;
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
            if (
                data.variables &&
                typeof data.variables === "object" &&
                !Array.isArray(data.variables)
            ) {
                const variables =
                    data.variables as Record<string, unknown>;

                next.variables = {
                    ...variables
                };

                next.arrays = {};
                next.objects = {};

                for (
                    const [name, value] of
                    Object.entries(variables)
                ) {
                    collectSnapshots(
                        value,
                        name,
                        next.arrays,
                        next.objects
                    );
                }
            }
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
                next.arrays = {
                    ...next.arrays,
                    [data.name]: [...data.values]
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

        case "METHOD_ENTER":
            if (event.method) {
                next.callStack = [
                    ...previous.callStack,
                    event.method
                ];
            }
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


function collectSnapshots(
    value: unknown,
    variableName: string,
    arrays: Record<string, unknown>,
    objects: Record<string, unknown>
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
                objects
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
            !record.$ref &&
            Array.isArray(record.values)
        ) {
            arrays[variableName] = {
                objectId:
                    record.$arrayId,
                type:
                    record.$type,
                values:
                    record.values,
                truncated:
                    record.truncated === true,
                length:
                    record.length
            };
        }

        if (Array.isArray(record.values)) {
            for (const item of record.values) {
                collectSnapshots(
                    item,
                    variableName,
                    arrays,
                    objects
                );
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
                    objects
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
            objects
        );
    }
}
