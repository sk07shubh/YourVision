import { describe, expect, it } from "vitest";
import {
  buildAnimationTimeline,
  cursorForFrame,
  frameAtElapsed,
  type AnimationMotion
} from "./animation";

type Event = { type: "A" | "B"; sourceLine?: number };

const motions: Record<Event["type"], AnimationMotion> = {
  A: { kind: "emphasis", durationMs: 100, delayMs: 20 },
  B: { kind: "pointer-move", durationMs: 200, delayMs: 10 }
};

describe("generic animation timeline", () => {
  it("builds deterministic sequential frames from semantic events", () => {
    const timeline = buildAnimationTimeline<Event>(
      [{ type: "A", sourceLine: 4 }, { type: "B", sourceLine: 7 }],
      event => motions[event.type]
    );

    expect(timeline.frames).toEqual([
      {
        index: 0,
        event: { type: "A", sourceLine: 4 },
        motion: motions.A,
        startMs: 20,
        endMs: 120
      },
      {
        index: 1,
        event: { type: "B", sourceLine: 7 },
        motion: motions.B,
        startMs: 130,
        endMs: 330
      }
    ]);
    expect(timeline.durationMs).toBe(330);
  });

  it("resolves elapsed time to the corresponding frame", () => {
    const timeline = buildAnimationTimeline<Event>(
      [{ type: "A" }, { type: "B" }],
      event => motions[event.type]
    );

    expect(frameAtElapsed(timeline, 50)?.event.type).toBe("A");
    expect(frameAtElapsed(timeline, 120)?.event.type).toBe("B");
    expect(frameAtElapsed(timeline, 125)?.event.type).toBe("B");
    expect(frameAtElapsed(timeline, 150)?.event.type).toBe("B");
    expect(frameAtElapsed(timeline, 999)?.event.type).toBe("B");
  });

  it("maps a logical frame index to a deterministic playback cursor", () => {
    const timeline = buildAnimationTimeline<Event>(
      [{ type: "A" }, { type: "B" }],
      event => motions[event.type]
    );

    expect(cursorForFrame(timeline, 1)).toEqual({ frameIndex: 1, elapsedMs: 130 });
    expect(cursorForFrame(timeline, 99)).toEqual({ frameIndex: 1, elapsedMs: 130 });
  });
});
