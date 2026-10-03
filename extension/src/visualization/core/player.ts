import type { AnimationTimeline } from "./animation";

export interface AnimationPlayerState {
  playing: boolean;
  elapsedMs: number;
}

export function createAnimationPlayer(): AnimationPlayerState {
  return { playing: false, elapsedMs: 0 };
}

export function play(state: AnimationPlayerState): AnimationPlayerState {
  return { ...state, playing: true };
}

export function pause(state: AnimationPlayerState): AnimationPlayerState {
  return { ...state, playing: false };
}

export function restart(state: AnimationPlayerState): AnimationPlayerState {
  return { ...state, playing: false, elapsedMs: 0 };
}

export function seek(state: AnimationPlayerState, elapsedMs: number, durationMs: number): AnimationPlayerState {
  return { ...state, elapsedMs: Math.max(0, Math.min(elapsedMs, durationMs)) };
}

export function tick(state: AnimationPlayerState, deltaMs: number, durationMs: number): AnimationPlayerState {
  const nextElapsed = Math.max(0, Math.min(state.elapsedMs + Math.max(0, deltaMs), durationMs));
  return { elapsedMs: nextElapsed, playing: state.playing && nextElapsed < durationMs };
}

export function finish<TEvent>(timeline: AnimationTimeline<TEvent>, state: AnimationPlayerState): AnimationPlayerState {
  return { ...state, playing: false, elapsedMs: timeline.durationMs };
}
