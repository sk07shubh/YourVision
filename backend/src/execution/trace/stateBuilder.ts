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
