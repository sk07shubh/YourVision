export type VisualStructureKind =
  | 'array' | 'matrix' | 'string' | 'collection' | 'object' | 'node' | 'edge' | 'variable';

export interface VisualTarget {
  structureId: string;
  kind: VisualStructureKind;
  index?: number;
  row?: number;
  column?: number;
  objectId?: string;
  field?: string;
}
export interface HighlightEvent { type: 'highlight'; target: VisualTarget; }
export interface CompareEvent { type: 'compare'; targets: VisualTarget[]; }
export interface UpdateEvent { type: 'update'; target: VisualTarget; from?: unknown; to: unknown; }
export interface MoveEvent {
  type: 'move';
  target: VisualTarget;
  from: { index?: number; row?: number; column?: number };
  to: { index?: number; row?: number; column?: number };
}
export interface SwapEvent { type: 'swap'; targets: [VisualTarget, VisualTarget]; }
export interface InsertEvent { type: 'insert'; target: VisualTarget; value: unknown; }
export interface RemoveEvent { type: 'remove'; target: VisualTarget; value?: unknown; }
export interface ConnectEvent { type: 'connect'; from: VisualTarget; to: VisualTarget; field?: string; }
export interface DisconnectEvent { type: 'disconnect'; from: VisualTarget; to?: VisualTarget; field?: string; }
export interface TraverseEvent { type: 'traverse'; target: VisualTarget; }
export type VisualEvent =
  | HighlightEvent | CompareEvent | UpdateEvent | MoveEvent | SwapEvent
  | InsertEvent | RemoveEvent | ConnectEvent | DisconnectEvent | TraverseEvent;

export const ANIMATION_DURATION = {
  highlight: 100, update: 140, move: 180, swap: 220, insert: 180,
  remove: 180, connect: 160, disconnect: 160, traverse: 140,
} as const;
