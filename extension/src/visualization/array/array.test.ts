import { describe, expect, it } from "vitest";
import type { TraceState } from "../../types/trace";
import { compileArrayEvents } from "./compiler";
import { createArrayScene } from "./scene";
import { applyArraySemanticEvent } from "./reducer";
import { arrayWidth, DEFAULT_ARRAY_LAYOUT } from "./layout";
import { motionFor } from "./timeline";
import { presentArrayScene } from "./presentation";

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

  it("detects an array read from the executed statement", () => {
    const current = state({ line: 6, variables: { i: 2, left: 0, right: 3 } });
    const events = compileArrayEvents(current, state({ line: 5 }), "int x = nums[i];");

    expect(events).toContainEqual({
      type: "ARRAY_READ",
      arrayId: "nums-1",
      index: 2,
      value: 11,
      sourceLine: 6,
      sourceExpression: "int x = nums[i];"
    });
  });

  it("detects array comparison without treating the compared cell as a write", () => {
    const current = state({ line: 7, variables: { i: 1, j: 3, left: 0, right: 3 } });
    const events = compileArrayEvents(current, state({ line: 6 }), "if (nums[i] < nums[j])");

    expect(events).toContainEqual({
      type: "ARRAY_COMPARE",
      arrayId: "nums-1",
      indices: [1, 3],
      sourceLine: 7,
      sourceExpression: "if (nums[i] < nums[j])"
    });
    expect(events.filter(event => event.type === "ARRAY_WRITE")).toHaveLength(0);
  });

  it("detects insertion and removal as structural operations", () => {
    const previous = state();
    const inserted = state({ sequence: 2, arrays: { nums: { $arrayId: "nums-1", values: [2, 7, 9, 11, 15] } } });
    const removed = state({ sequence: 2, arrays: { nums: { $arrayId: "nums-1", values: [2, 11, 15] } } });

    expect(compileArrayEvents(inserted, previous)).toContainEqual({
      type: "ARRAY_INSERT", arrayId: "nums-1", index: 2, value: 9, sourceLine: 4
    });
    expect(compileArrayEvents(removed, previous)).toContainEqual({
      type: "ARRAY_REMOVE", arrayId: "nums-1", index: 1, value: 7, sourceLine: 4
    });
  });

  it("detects a sliding-window range change", () => {
    const previous = state({ variables: { left: 0, right: 3, i: 0 } });
    const current = state({ sequence: 2, variables: { left: 1, right: 3, i: 1 } });

    expect(compileArrayEvents(current, previous, "int x = nums[i];")).toContainEqual({
      type: "RANGE_SHRINK",
      rangeId: "nums-1:range:nums-1:left:nums-1:right",
      start: 1,
      end: 3,
      sourceLine: 4
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

  it("highlights pointer targets and lets semantic operations override them", () => {
    const scene = createArrayScene(state(), "nums[i] = nums[1];");
    const presented = presentArrayScene(scene, [
      { type: "POINTER_MOVE", pointerId: "nums-1:i", from: 0, to: 1, sourceLine: 8 },
      { type: "ARRAY_WRITE", arrayId: "nums-1", index: 1, before: 7, after: 9, sourceLine: 8 }
    ]);

    expect(presented.arrays[0].cells[1].state).toBe("write");
    expect(presented.arrays[0].cells[3].state).toBe("active");
  });

  it("presents semantic reads and swaps as cell states", () => {
    const scene = createArrayScene(state(), "nums[i] = nums[1];");
    const presented = presentArrayScene(scene, [
      { type: "ARRAY_READ", arrayId: "nums-1", index: 0, value: 2, sourceLine: 8 },
      { type: "ARRAY_SWAP", arrayId: "nums-1", first: 1, second: 2, sourceLine: 9 }
    ]);

    expect(presented.arrays[0].cells[0].state).toBe("read");
    expect(presented.arrays[0].cells[1].state).toBe("swap");
    expect(presented.arrays[0].cells[2].state).toBe("swap");
  });

  it("keeps geometry independent from the renderer", () => {
    expect(arrayWidth(4, DEFAULT_ARRAY_LAYOUT)).toBeGreaterThan(arrayWidth(2, DEFAULT_ARRAY_LAYOUT));
  });

  it("assigns deliberate motion to semantic operations", () => {
    expect(motionFor({ type: "POINTER_MOVE", pointerId: "i", from: 0, to: 1 }).kind).toBe("pointer-move");
    expect(motionFor({ type: "ARRAY_SWAP", arrayId: "nums-1", first: 0, second: 1 }).kind).toBe("value-move");
  });
});


describe("array operation coverage", () => {
  it("detects a true shift without misclassifying it as a swap", () => {
    const previous = state();
    const current = state({ sequence: 2, arrays: { nums: { $arrayId: "nums-1", values: [2, 11, 15, 7] } } });

    expect(compileArrayEvents(current, previous)).toContainEqual({
      type: "ARRAY_SHIFT", arrayId: "nums-1", from: 1, to: 3, direction: "right", sourceLine: 4
    });
  });

  it("keeps independent arrays as separate visualization targets", () => {
    const current = state({
      arrays: {
        nums: { $arrayId: "nums-1", values: [1, 2] },
        answer: { $arrayId: "answer-1", values: [3, 4] }
      },
      variables: { i: 0 }
    });
    const scene = createArrayScene(current, "answer[i] = nums[i];");

    expect(scene.arrays.map(array => array.id)).toEqual(["nums-1", "answer-1"]);
    expect(scene.pointers).toContainEqual({ id: "nums-1:i", label: "i", arrayId: "nums-1", index: 0 });
    expect(scene.pointers).toContainEqual({ id: "answer-1:i", label: "i", arrayId: "answer-1", index: 0 });
  });
});

describe("array access semantics", () => {
  it("keeps the right-hand array access as a read during an array write", () => {
    const current = state({
      line: 8,
      variables: { i: 0, j: 1, left: 0, right: 3 },
      arrays: { nums: { $arrayId: "nums-1", values: [7, 2, 11, 15] } }
    });
    const previous = state({
      line: 7,
      variables: { i: 0, j: 1, left: 0, right: 3 },
      arrays: { nums: { $arrayId: "nums-1", values: [2, 7, 11, 15] } }
    });
    const events = compileArrayEvents(current, previous, "nums[i] = nums[j];");

    expect(events).toContainEqual(expect.objectContaining({
      type: "ARRAY_READ", arrayId: "nums-1", index: 1
    }));
  });
});

describe("array search ranges", () => {
  it("derives a binary-search range from low and high around a mid pointer", () => {
    const current = state({
      variables: { low: 0, high: 3, mid: 1 },
      line: 6
    });
    const scene = createArrayScene(current, "if (nums[mid] < target)");

    expect(scene.pointers).toContainEqual({
      id: "nums-1:low", label: "low", arrayId: "nums-1", index: 0
    });
    expect(scene.pointers).toContainEqual({
      id: "nums-1:high", label: "high", arrayId: "nums-1", index: 3
    });
    expect(scene.pointers).toContainEqual({
      id: "nums-1:mid", label: "mid", arrayId: "nums-1", index: 1
    });
    expect(scene.ranges).toContainEqual({
      id: "nums-1:range:nums-1:low:nums-1:high",
      arrayId: "nums-1",
      start: 0,
      end: 3,
      kind: "search"
    });
  });
});
