import type { ArraySemanticEvent, ArrayScene } from "./types";
import { withCellState, withPointer, withRange } from "./scene";

export function presentArrayScene(scene: ArrayScene, events: ArraySemanticEvent[]): ArrayScene {
  let next: ArrayScene = {
    ...scene,
    arrays: scene.arrays.map(array => ({
      ...array,
      cells: array.cells.map(cell => ({ ...cell, state: "neutral" }))
    })),
    ranges: scene.ranges.map(range => ({ ...range }))
  };

  for (const pointer of next.pointers) {
    next = withCellState(next, pointer.arrayId, [pointer.index], "active");
  }

  for (const event of events) {
    switch (event.type) {
      case "ARRAY_READ":
        next = withCellState(next, event.arrayId, [event.index], "read");
        break;
      case "ARRAY_WRITE":
      case "ARRAY_INSERT":
        next = withCellState(next, event.arrayId, [event.index], "write");
        break;
      case "ARRAY_COMPARE":
        next = withCellState(next, event.arrayId, event.indices, "compare");
        break;
      case "ARRAY_SWAP":
        next = withCellState(next, event.arrayId, [event.first, event.second], "swap");
        break;
      case "POINTER_MOVE": {
        const pointer = next.pointers.find(item => item.id === event.pointerId);
        if (pointer) next = withPointer(next, { ...pointer, index: event.to });
        break;
      }
      case "RANGE_MOVE":
      case "RANGE_SHRINK":
      case "RANGE_EXPAND": {
        const range = next.ranges.find(item => item.id === event.rangeId);
        if (range) next = withRange(next, { ...range, start: event.start, end: event.end });
        break;
      }
      default:
        break;
    }
  }

  return next;
}
