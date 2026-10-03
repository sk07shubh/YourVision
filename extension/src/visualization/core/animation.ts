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
  return timeline.frames.find(frame => clamped >= frame.startMs && clamped <= frame.endMs)
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
