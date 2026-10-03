import { describe, expect, it } from "vitest";
import type { TraceState } from "../../types/trace";
import { compileArrayEvents } from "./compiler";
import { createArrayScene } from "./scene";
import { applyArraySemanticEvent } from "./reducer";
import { arrayWidth, DEFAULT_ARRAY_LAYOUT } from "./layout";
import { motionFor } from "./timeline";

function state(overrides: Partial<TraceState> = {}): TraceState {
  return {
    sequence: 1, line: 4, method: "Solution", depth: 0,
    variables: { i: 0, left: 0, right: 3 },
    arrays: { nums: { $arrayId: "nums-1", values: [2, 7, 11, 15] } },
    dataStructures: {}, objects: {}, callStack: ["Solution"], ...overrides
  };
}

describe("array visualization foundation", () => {
  it("normalizes runtime arrays and derives index pointers and a range", () => {
    const scene = createArrayScene(state(), "int x = nums[i];");

    expect(scene.arrays[0].cells.map(cell => cell.value)).toEqual([2, 7, 11, 15]);
    expect(scene.pointers).toEqual([
      { id: "nums-1:i", label: "i", arrayId: "nums-1", index: 0 },
      { id: "nums-1:left", label: "left", arrayId: "nums-1", index: 0 },
      { id: "nums-1:right", label: "right", arrayId: "nums-1", index: 3 }
    ]);
    expect(scene.ranges).toEqual([{
      id: "nums-1:range:nums-1:left:nums-1:right",
      arrayId: "nums-1",
      start: 0,
      end: 3,
      kind: "window"
    }]);
  });

  it("classifies pointer movement from runtime variable changes", () => {
    const previous = state();
    const current = state({ sequence: 2, line: 5, variables: { i: 1, left: 0, right: 2 } });

    expect(compileArrayEvents(current, previous, "int x = nums[i];")).toContainEqual({
      type: "POINTER_MOVE", pointerId: "nums-1:i", from: 0, to: 1, sourceLine: 5
    });
    expect(compileArrayEvents(current, previous, "int x = nums[i];")).toContainEqual({
      type: "POINTER_MOVE", pointerId: "nums-1:right", from: 3, to: 2, sourceLine: 5
    });
  });

  it("classifies a two-cell value exchange as a swap", () => {
    const previous = state();
    const current = state({ sequence: 2, line: 8, arrays: { nums: { $arrayId: "nums-1", values: [7, 2, 11, 15] } } });

    expect(compileArrayEvents(current, previous)).toContainEqual({
      type: "ARRAY_SWAP", arrayId: "nums-1", first: 0, second: 1, sourceLine: 8
    });
  });

  it("classifies ordinary mutation as a write", () => {
    const previous = state();
    const current = state({ sequence: 2, line: 9, arrays: { nums: { $arrayId: "nums-1", values: [2, 0, 11, 15] } } });

    expect(compileArrayEvents(current, previous)).toContainEqual({
      type: "ARRAY_WRITE", arrayId: "nums-1", index: 1, before: 7, after: 0, sourceLine: 9
    });
  });

  it("applies semantic writes without recreating the scene", () => {
    const scene = createArrayScene(state(), "nums[i] = 0;");
    const next = applyArraySemanticEvent(scene, {
      type: "ARRAY_WRITE", arrayId: "nums-1", index: 1, before: 7, after: 0, sourceLine: 8
    });

    expect(next.arrays[0].cells[1]).toEqual({ index: 1, value: 0, state: "write" });
    expect(next.arrays[0].cells[0]).toEqual({ index: 0, value: 2, state: "neutral" });
  });

  it("keeps geometry independent from the renderer", () => {
    expect(arrayWidth(4, DEFAULT_ARRAY_LAYOUT)).toBeGreaterThan(arrayWidth(2, DEFAULT_ARRAY_LAYOUT));
  });

  it("assigns deliberate motion to semantic operations", () => {
    expect(motionFor({ type: "POINTER_MOVE", pointerId: "i", from: 0, to: 1 }).kind).toBe("pointer-move");
    expect(motionFor({ type: "ARRAY_SWAP", arrayId: "nums-1", first: 0, second: 1 }).kind).toBe("value-move");
  });
});
