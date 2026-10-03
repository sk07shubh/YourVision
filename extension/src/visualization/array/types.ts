export type ArrayCellState = "neutral" | "active" | "read" | "write" | "compare" | "swap" | "inactive";

export type ArrayRangeKind = "window" | "active" | "search" | "processed";

export interface ArrayCell { index: number; value: unknown; state: ArrayCellState; }
export interface ArraySceneArray { id: string; name: string; cells: ArrayCell[]; type?: string; }
export interface ArrayPointer { id: string; label: string; arrayId: string; index: number; }
export interface ArrayRange { id: string; arrayId: string; start: number; end: number; kind: ArrayRangeKind; }
export interface ArraySceneVariable { name: string; value: unknown; changed: boolean; }

export interface ArrayScene {
  arrays: ArraySceneArray[];
  pointers: ArrayPointer[];
  ranges: ArrayRange[];
  variables: ArraySceneVariable[];
}

export type ArraySemanticEvent =
  | { type: "ARRAY_CREATE"; arrayId: string; name: string; values: unknown[]; sourceLine?: number; sourceExpression?: string }
  | { type: "ARRAY_READ"; arrayId: string; index: number; value: unknown; sourceLine?: number; sourceExpression?: string }
  | { type: "ARRAY_WRITE"; arrayId: string; index: number; before: unknown; after: unknown; sourceLine?: number; sourceExpression?: string }
  | { type: "ARRAY_COMPARE"; arrayId: string; indices: number[]; sourceLine?: number; sourceExpression?: string }
  | { type: "ARRAY_SWAP"; arrayId: string; first: number; second: number; sourceLine?: number; sourceExpression?: string }
  | { type: "ARRAY_INSERT"; arrayId: string; index: number; value: unknown; sourceLine?: number; sourceExpression?: string }
  | { type: "ARRAY_REMOVE"; arrayId: string; index: number; value: unknown; sourceLine?: number; sourceExpression?: string }
  | { type: "ARRAY_SHIFT"; arrayId: string; from: number; to: number; direction: "left" | "right"; sourceLine?: number; sourceExpression?: string }
  | { type: "POINTER_CREATE"; pointerId: string; label: string; arrayId: string; index: number; sourceLine?: number }
  | { type: "POINTER_MOVE"; pointerId: string; from: number; to: number; sourceLine?: number }
  | { type: "RANGE_CREATE"; range: ArrayRange; sourceLine?: number }
  | { type: "RANGE_MOVE" | "RANGE_SHRINK" | "RANGE_EXPAND"; rangeId: string; start: number; end: number; sourceLine?: number }
  | { type: "VARIABLE_CREATE" | "VARIABLE_UPDATE"; name: string; value: unknown; sourceLine?: number }
  | { type: "CONDITION_TRUE" | "CONDITION_FALSE"; sourceLine?: number }
  | { type: "LOOP_ENTER" | "LOOP_ITERATION" | "LOOP_EXIT"; sourceLine?: number }
  | { type: "RETURN"; value?: unknown; sourceLine?: number };

export interface ArraySceneStep {
  sourceLine?: number;
  method?: string;
  eventLabel: string;
  events: ArraySemanticEvent[];
  scene: ArrayScene;
}
