export type ExecutionEventType =
  | 'PROGRAM_START' | 'PROGRAM_END' | 'STEP' | 'VARIABLE_UPDATE'
  | 'ARRAY_REFERENCE' | 'ARRAY_ACCESS' | 'STRING_ACCESS' | 'STRING_RANGE_ACCESS' | 'STRING_SEARCH_RESULT' | 'STRING_SPLIT_RESULT' | 'STRING_CONVERSION_RESULT' | 'STRING_RESULT' | 'STRING_MUTATION' | 'ARRAY_WRITE' | 'OBJECT_CREATE'
  | 'OBJECT_FIELD_WRITE' | 'MAP_WRITE' | 'METHOD_ENTER' | 'METHOD_EXIT' | 'ERROR'
  | 'TIMEOUT' | 'TRACE_LIMIT';

export interface TraceEvent {
  type: ExecutionEventType;
  line?: number;
  method?: string;
  [key: string]: unknown;
}

export interface TraceState {
  sequence: number;
  line?: number;
  method?: string;
  depth: number;
  variables: Record<string, unknown>;
  arrays: Record<string, unknown>;
  dataStructures: Record<string, unknown>;
  objects: Record<string, unknown>;
  callStack: string[];
  lastEvent?: TraceEvent;
  error?: { type?: string; message?: string } | string;
}

export interface VisualizationResponse {
  success: boolean;
  kind: string;
  result?: unknown;
  stdout?: string;
  stderr?: string;
  errorType?: string;
  message?: string;
  trace?: TraceEvent[];
  states?: TraceState[];
}
