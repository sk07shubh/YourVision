import { describe, expect, it } from "vitest";
import { createAnimationPlayer, finish, pause, play, restart, seek, tick } from "./player";
import type { AnimationTimeline } from "./animation";

describe("generic animation player", () => {
  const timeline: AnimationTimeline = { frames: [], durationMs: 500 };

  it("supports deterministic play, pause and restart", () => {
    let state = createAnimationPlayer();
    expect(state).toEqual({ playing: false, elapsedMs: 0 });
    state = play(state);
    expect(state.playing).toBe(true);
    state = pause(state);
    expect(state.playing).toBe(false);
    state = restart(state);
    expect(state).toEqual({ playing: false, elapsedMs: 0 });
  });

  it("clamps seek and tick to the timeline duration", () => {
    let state = seek(createAnimationPlayer(), 700, timeline.durationMs);
    expect(state.elapsedMs).toBe(500);
    state = play(state);
    state = tick(state, 100, timeline.durationMs);
    expect(state.elapsedMs).toBe(500);
    expect(state.playing).toBe(false);
    state = seek(state, -20, timeline.durationMs);
    expect(state.elapsedMs).toBe(0);
  });

  it("finishes at the exact timeline endpoint", () => {
    const state = finish(timeline, play(createAnimationPlayer()));
    expect(state).toEqual({ playing: false, elapsedMs: 500 });
  });
});
