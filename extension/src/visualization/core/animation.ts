export type AnimationMotionKind =
  | "instant"
  | "fade"
  | "emphasis"
  | "pointer-move"
  | "value-move"
  | "range-move";

export interface AnimationMotion {
  kind: AnimationMotionKind;
  durationMs: number;
  delayMs: number;
}

export const DEFAULT_ANIMATION_MOTION: Record<AnimationMotionKind, AnimationMotion> = {
  instant: { kind: "instant", durationMs: 0, delayMs: 0 },
  fade: { kind: "fade", durationMs: 180, delayMs: 0 },
  emphasis: { kind: "emphasis", durationMs: 220, delayMs: 0 },
  "pointer-move": { kind: "pointer-move", durationMs: 260, delayMs: 0 },
  "value-move": { kind: "value-move", durationMs: 300, delayMs: 0 },
  "range-move": { kind: "range-move", durationMs: 260, delayMs: 0 }
};

export function motionForOperation(operation: import("./semantic").VisualOperation): AnimationMotion {
  switch (operation) {
    case "create":
    case "read":
    case "write":
    case "compare":
    case "update":
    case "visit":
    case "peek":
      return DEFAULT_ANIMATION_MOTION.emphasis;
    case "swap":
    case "move":
    case "shift":
      return DEFAULT_ANIMATION_MOTION["value-move"];
    case "insert":
    case "push":
    case "enqueue":
    case "connect":
      return DEFAULT_ANIMATION_MOTION.fade;
    case "remove":
    case "pop":
    case "dequeue":
    case "disconnect":
      return DEFAULT_ANIMATION_MOTION["range-move"];
    case "traverse":
      return DEFAULT_ANIMATION_MOTION["pointer-move"];
    default:
      return DEFAULT_ANIMATION_MOTION.instant;
  }
}

export interface AnimationFrame<TEvent = unknown> {
  index: number;
  event: TEvent;
  motion: AnimationMotion;
  startMs: number;
  endMs: number;
}

export interface AnimationTimeline<TEvent = unknown> {
  frames: AnimationFrame<TEvent>[];
  durationMs: number;
}

export interface AnimationCursor {
  frameIndex: number;
  elapsedMs: number;
}

export function buildAnimationTimeline<TEvent>(
  events: TEvent[],
  motionFor: (event: TEvent) => AnimationMotion
): AnimationTimeline<TEvent> {
  let cursor = 0;
  const frames = events.map((event, index) => {
    const motion = motionFor(event);
    const startMs = cursor + motion.delayMs;
    const endMs = startMs + motion.durationMs;
    cursor = endMs;
    return { index, event, motion, startMs, endMs };
  });
  return { frames, durationMs: cursor };
}

export function frameAtElapsed<TEvent>(
  timeline: AnimationTimeline<TEvent>,
  elapsedMs: number
): AnimationFrame<TEvent> | undefined {
  if (!timeline.frames.length) return undefined;
  const clamped = Math.max(0, Math.min(elapsedMs, timeline.durationMs));
  const active = timeline.frames.find(frame => {
    if (frame.motion.durationMs === 0) return clamped === frame.startMs;
    return clamped >= frame.startMs && clamped < frame.endMs;
  });
  if (active) return active;
  return timeline.frames.find(frame => clamped < frame.startMs)
    ?? timeline.frames[timeline.frames.length - 1];
}

export function cursorForFrame<TEvent>(
  timeline: AnimationTimeline<TEvent>,
  frameIndex: number
): AnimationCursor {
  if (!timeline.frames.length) return { frameIndex: 0, elapsedMs: 0 };
  const index = Math.max(0, Math.min(frameIndex, timeline.frames.length - 1));
  return { frameIndex: index, elapsedMs: timeline.frames[index].startMs };
}
