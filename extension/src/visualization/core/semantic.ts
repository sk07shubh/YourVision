export type VisualDataStructure =
  | "array" | "matrix" | "stack" | "queue" | "deque" | "linked-list"
  | "tree" | "heap" | "trie" | "graph" | "map" | "set";

export type VisualOperation =
  | "create" | "read" | "write" | "compare" | "swap" | "insert" | "remove"
  | "shift" | "move" | "connect" | "disconnect" | "traverse" | "push" | "pop"
  | "enqueue" | "dequeue" | "peek" | "visit" | "update";

export interface VisualSemanticEvent {
  id?: string;
  dataStructure: VisualDataStructure;
  operation: VisualOperation;
  sourceLine?: number;
  sourceExpression?: string;
  metadata?: Record<string, unknown>;
}

export interface VisualEventContext {
  sourceLine?: number;
  sourceExpression?: string;
  method?: string;
  sequence?: number;
}

export type VisualPrimitiveEvent =
  | {
      type: "CREATE" | "READ" | "WRITE" | "COMPARE" | "SWAP" | "INSERT" | "REMOVE" | "SHIFT" | "MOVE" | "CONNECT" | "DISCONNECT" | "TRAVERSE" | "VISIT" | "UPDATE";
      dataStructure: VisualDataStructure;
      target?: string;
      index?: number;
      indices?: number[];
      from?: number;
      to?: number;
      value?: unknown;
      before?: unknown;
      after?: unknown;
      context?: VisualEventContext;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "PUSH" | "POP" | "ENQUEUE" | "DEQUEUE" | "PEEK";
      dataStructure: "stack" | "queue" | "deque";
      target?: string;
      value?: unknown;
      context?: VisualEventContext;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "RANGE_CREATE" | "RANGE_MOVE" | "RANGE_SHRINK" | "RANGE_EXPAND";
      dataStructure: "array" | "matrix";
      target: string;
      start?: number;
      end?: number;
      context?: VisualEventContext;
      metadata?: Record<string, unknown>;
    };
