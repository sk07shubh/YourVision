import { describe, expect, it } from "vitest";
import type { TraceState } from "../../types/trace";
import { arrayVisualizationModule, buildArrayVisualization } from "./module";

function state(): TraceState {
  return {
    sequence: 1,
    line: 3,
    method: "Solution",
    depth: 0,
    variables: { i: 1 },
    arrays: { nums: { $arrayId: "nums-1", values: [2, 7, 11] } },
    dataStructures: {},
    objects: {},
    callStack: ["Solution"]
  };
}

describe("array visualization module contract", () => {
  it("exposes the shared lifecycle used by future data structures", () => {
    expect(arrayVisualizationModule.id).toBe("array");
    expect(arrayVisualizationModule.dataStructure).toBe("array");
    expect(typeof arrayVisualizationModule.createScene).toBe("function");
    expect(typeof arrayVisualizationModule.compileEvents).toBe("function");
    expect(typeof arrayVisualizationModule.presentScene).toBe("function");
  });

  it("builds a presented scene through the shared lifecycle", () => {
    const result = buildArrayVisualization(state(), "int x = nums[i];");
    expect(result.scene.arrays[0].cells[1].state).toBe("active");
  });
});
