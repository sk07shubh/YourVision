import type { ArraySemanticEvent } from "./types";

export type MotionKind =
  | "instant"
  | "fade"
  | "emphasis"
  | "pointer-move"
  | "value-move"
  | "range-move";

export interface MotionToken {
  kind: MotionKind;
  durationMs: number;
  delayMs: number;
}

export interface ArrayAnimationFrame {
  event: ArraySemanticEvent;
  motion: MotionToken;
}

export const ARRAY_MOTION: Record<MotionKind, MotionToken> = {
  instant: { kind: "instant", durationMs: 0, delayMs: 0 },
  fade: { kind: "fade", durationMs: 180, delayMs: 0 },
  emphasis: { kind: "emphasis", durationMs: 220, delayMs: 0 },
  "pointer-move": { kind: "pointer-move", durationMs: 260, delayMs: 0 },
  "value-move": { kind: "value-move", durationMs: 300, delayMs: 0 },
  "range-move": { kind: "range-move", durationMs: 260, delayMs: 0 }
};

export function motionFor(event: ArraySemanticEvent): MotionToken {
  switch (event.type) {
    case "POINTER_MOVE":
      return ARRAY_MOTION["pointer-move"];
    case "ARRAY_SWAP":
      return ARRAY_MOTION["value-move"];
    case "RANGE_MOVE":
    case "RANGE_SHRINK":
    case "RANGE_EXPAND":
      return ARRAY_MOTION["range-move"];
    case "ARRAY_READ":
    case "ARRAY_WRITE":
    case "ARRAY_COMPARE":
      return ARRAY_MOTION.emphasis;
    default:
      return ARRAY_MOTION.instant;
  }
}

export function buildAnimationFrame(event: ArraySemanticEvent): ArrayAnimationFrame {
  return { event, motion: motionFor(event) };
}
