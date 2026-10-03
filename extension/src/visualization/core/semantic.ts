export type VisualDataStructure =
  | "array"
  | "matrix"
  | "stack"
  | "queue"
  | "deque"
  | "linked-list"
  | "tree"
  | "heap"
  | "trie"
  | "graph"
  | "map"
  | "set";

export type VisualOperation =
  | "create"
  | "read"
  | "write"
  | "compare"
  | "swap"
  | "insert"
  | "remove"
  | "shift"
  | "move"
  | "connect"
  | "disconnect"
  | "traverse"
  | "push"
  | "pop"
  | "enqueue"
  | "dequeue"
  | "peek"
  | "visit"
  | "update";

export interface VisualSemanticEvent {
  id?: string;
  dataStructure: VisualDataStructure;
  operation: VisualOperation;
  sourceLine?: number;
  sourceExpression?: string;
  metadata?: Record<string, unknown>;
}
