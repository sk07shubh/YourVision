export type ExecutionEventType =
    | "PROGRAM_START"
    | "PROGRAM_END"
    | "STEP"
    | "VARIABLE_UPDATE"
    | "ARRAY_REFERENCE"
    | "ARRAY_ACCESS"
    | "ARRAY_WRITE"
    | "OBJECT_CREATE"
    | "OBJECT_FIELD_WRITE"
    | "MAP_WRITE"
    | "METHOD_ENTER"
    | "METHOD_EXIT"
    | "ERROR"
    | "TIMEOUT"
    | "TRACE_LIMIT";

export interface ExecutionEvent {
    sequence: number;
    type: ExecutionEventType;
    line?: number | undefined;
    method?: string | undefined;
    depth?: number | undefined;
    data?: Record<string, unknown> | undefined;
}

export interface ExecutionTrace {
    version: 1;
    events: ExecutionEvent[];
}

export interface TraceState {
    sequence: number;
    line: number;
    method: string;
    depth: number;
    variables: Record<string, unknown>;
    arrays: Record<string, unknown>;
    dataStructures: Record<string, unknown>;
    objects: Record<string, unknown>;
    callStack: string[];
    lastEvent?: ExecutionEvent;
    error?: {
        type: string;
        message: string;
    };
}
