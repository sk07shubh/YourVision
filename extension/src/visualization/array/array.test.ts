import { describe, expect, it } from "vitest";
import type { TraceState } from "../../types/trace";
import { compileArrayEvents } from "./compiler";
import { createArrayScene } from "./scene";
import { applyArraySemanticEvent } from "./reducer";

function state(overrides: Partial<TraceState> = {}): TraceState {
  return {
    sequence: 1,
    line: 4,
    method: "Solution",
    depth: 0,
    variables: { i: 0 },
    arrays: {
      nums: { $arrayId: "nums-1", values: [2, 7, 11, 15] }
    },
    dataStructures: {},
    objects: {},
    callStack: ["Solution"],
    ...overrides
  };
}

describe("array visualization foundation", () => {
  it("normalizes runtime arrays and derives an index pointer from source usage", () => {
    const scene = createArrayScene(state(), "int x = nums[i];");

    expect(scene.arrays[0].cells.map(cell => cell.value)).toEqual([2, 7, 11, 15]);
    expect(scene.pointers).toEqual([
      { id: "nums-1:i", label: "i", arrayId: "nums-1", index: 0 }
    ]);
  });

  it("classifies a two-cell value exchange as a swap", () => {
    const previous = state();
    const current = state({
      sequence: 2,
      line: 8,
      variables: { i: 0 },
      arrays: {
        nums: { $arrayId: "nums-1", values: [7, 2, 11, 15] }
      }
    });

    expect(compileArrayEvents(current, previous)).toEqual([
      { type: "ARRAY_SWAP", arrayId: "nums-1", first: 0, second: 1, sourceLine: 8 }
    ]);
  });

  it("classifies ordinary mutation as writes", () => {
    const previous = state();
    const current = state({
      sequence: 2,
      line: 9,
      arrays: {
        nums: { $arrayId: "nums-1", values: [2, 0, 11, 15] }
      }
    });

    expect(compileArrayEvents(current, previous)).toEqual([
      { type: "ARRAY_WRITE", arrayId: "nums-1", index: 1, before: 7, after: 0, sourceLine: 9 }
    ]);
  });

  it("applies semantic writes without recreating the scene", () => {
    const scene = createArrayScene(state(), "nums[i] = 0;");
    const next = applyArraySemanticEvent(scene, {
      type: "ARRAY_WRITE",
      arrayId: "nums-1",
      index: 1,
      before: 7,
      after: 0,
      sourceLine: 8
    });

    expect(next.arrays[0].cells[1]).toEqual({ index: 1, value: 0, state: "write" });
    expect(next.arrays[0].cells[0]).toEqual({ index: 0, value: 2, state: "neutral" });
  });
});
