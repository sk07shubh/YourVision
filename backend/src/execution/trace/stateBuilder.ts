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

        const snapshot: TraceState = {
            ...state,
            variables: { ...state.variables },
            arrays: { ...state.arrays },
            dataStructures: { ...state.dataStructures },
            objects: { ...state.objects },
            callStack: [...state.callStack]
        };

        const previous = states[states.length - 1];
        const sameVisible = previous !== undefined &&
            sameVisibleState(previous, snapshot);

        // Adjacent STEP events at the same visible location can be separate
        // loop executions even if no displayed value changed. Preserve them.
        // Other identical checkpoint pairs can be duplicate boundary snapshots,
        // such as METHOD_EXIT followed by its caller-resume STEP.
        const repeatedStep = previous?.lastEvent?.type === "STEP" &&
            event.type === "STEP";
        if (!sameVisible || repeatedStep) {
            states.push(snapshot);
        }
    }

    return states;
}

function isCheckpointEvent(event: ExecutionEvent): boolean {
    return (
        event.type === "STEP" ||
        event.type === "METHOD_ENTER" ||
        event.type === "METHOD_EXIT" ||
        event.type === "ERROR" ||
        event.type === "TIMEOUT" ||
        event.type === "TRACE_LIMIT"
    );
}

function sameVisibleState(left: TraceState, right: TraceState): boolean {
    return (
        left.line === right.line &&
        left.method === right.method &&
        left.depth === right.depth &&
        JSON.stringify(left.variables) === JSON.stringify(right.variables) &&
        JSON.stringify(left.arrays) === JSON.stringify(right.arrays) &&
        JSON.stringify(left.dataStructures) === JSON.stringify(right.dataStructures) &&
        JSON.stringify(left.objects) === JSON.stringify(right.objects) &&
        JSON.stringify(left.callStack) === JSON.stringify(right.callStack) &&
        left.invocationId === right.invocationId &&
        left.parentInvocationId === right.parentInvocationId &&
        left.methodSignature === right.methodSignature &&
        left.declaringType === right.declaringType &&
        left.returnType === right.returnType &&
        JSON.stringify(left.returnValue) === JSON.stringify(right.returnValue) &&
        left.returnValueType === right.returnValueType &&
        left.returnedVoid === right.returnedVoid &&
        left.invocationStatus === right.invocationStatus &&
        JSON.stringify(left.error) === JSON.stringify(right.error)
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
        lastEvent: event,
        invocationId:
            typeof event.data?.invocationId === "string"
                ? event.data.invocationId
                : event.type === "STEP" && previous.lastEvent?.type === "METHOD_EXIT"
                    ? previous.parentInvocationId
                    : previous.invocationId,
        parentInvocationId:
            typeof event.data?.parentInvocationId === "string"
                ? event.data.parentInvocationId
                : event.type === "METHOD_ENTER"
                    ? undefined
                    : event.type === "STEP" && previous.lastEvent?.type === "METHOD_EXIT"
                        ? (typeof previous.lastEvent.data?.parentParentInvocationId === "string"
                            ? previous.lastEvent.data.parentParentInvocationId
                            : undefined)
                        : previous.parentInvocationId,
        methodSignature:
            typeof event.data?.methodSignature === "string"
                ? event.data.methodSignature
                : event.type === "STEP" && previous.lastEvent?.type === "METHOD_EXIT"
                    ? (typeof previous.lastEvent.data?.parentMethodSignature === "string" ? previous.lastEvent.data.parentMethodSignature : undefined)
                    : previous.methodSignature,
        declaringType:
            typeof event.data?.declaringType === "string"
                ? event.data.declaringType
                : event.type === "STEP" && previous.lastEvent?.type === "METHOD_EXIT"
                    ? (typeof previous.lastEvent.data?.parentDeclaringType === "string" ? previous.lastEvent.data.parentDeclaringType : undefined)
                    : previous.declaringType,
        returnType:
            typeof event.data?.returnType === "string"
                ? event.data.returnType
                : event.type === "STEP" && previous.lastEvent?.type === "METHOD_EXIT"
                    ? (typeof previous.lastEvent.data?.parentReturnType === "string" ? previous.lastEvent.data.parentReturnType : undefined)
                    : previous.returnType,
        returnValue:
            event.data && Object.prototype.hasOwnProperty.call(event.data, "returnValue")
                ? event.data.returnValue
                : event.type === "METHOD_ENTER" || event.type === "STEP"
                    ? undefined
                    : previous.returnValue,
        returnValueType:
            typeof event.data?.returnValueType === "string"
                ? event.data.returnValueType
                : event.type === "METHOD_ENTER" || event.type === "STEP"
                    ? undefined
                    : previous.returnValueType,
        returnedVoid:
            typeof event.data?.returnedVoid === "boolean"
                ? event.data.returnedVoid
                : event.type === "METHOD_ENTER" || event.type === "STEP"
                    ? undefined
                    : previous.returnedVoid,
        invocationStatus: previous.invocationStatus
    };

    const data = event.data ?? {};

    switch (event.type) {
        case "STEP":
            if (previous.lastEvent?.type === "METHOD_EXIT") {
                next.invocationStatus = "active";
            }
            // STEP is a pre-execution JDI checkpoint. For replay,
            // use the postVariables snapshot captured from the next runtime
            // checkpoint so the state shown with this highlighted line is
            // the state produced by this line.
            applyVariableSnapshot(
                next,
                data.postVariables ?? data.variables
            );

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
            next.invocationStatus = "active";
            if (typeof data.displayLine === "number") {
                next.line = data.displayLine;
            }

            if (event.method) {
                next.callStack = [
                    ...previous.callStack,
                    event.method
                ];
            }

            applyVariableSnapshot(next, data.variables);
            break;

        case "METHOD_EXIT":
            next.invocationStatus = data.exceptional === true
                ? "exceptional"
                : data.returnedVoid === true
                    ? "void"
                    : Object.prototype.hasOwnProperty.call(data, "returnValue")
                        ? "returned"
                        : "returned";
            // Preserve the callee's actual return location for this checkpoint.
            // A later caller STEP represents the caller resuming execution.
            next.line = event.line ?? previous.line;
            next.method = previous.method;
            next.callStack =
                previous.callStack.length > 0
                    ? previous.callStack.slice(
                        0,
                        -1
                    )
                    : [];

            if (data.variables) {
                applyVariableSnapshot(next, data.variables);
            }
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

    // A structural reference points back to an already-snapshotted array,
    // map, or collection. Do not recursively walk it again: JSON decoding
    // materializes each $ref as a fresh object, so identity-based cycle guards
    // cannot catch this case.
    if (
        typeof record.$ref === "string" &&
        (
            typeof record.$objectId === "string" ||
            typeof record.$arrayId === "string" ||
            typeof record.$mapId === "string" ||
            typeof record.$collectionId === "string"
        )
    ) {
        return;
    }

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
