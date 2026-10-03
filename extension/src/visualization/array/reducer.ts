import type { ArraySemanticEvent, ArrayScene } from "./types";
import { withCellState, withPointer, withRange } from "./scene";

function updateArray(scene: ArrayScene, arrayId: string, updater: (values: unknown[]) => unknown[]): ArrayScene {
  return {
    ...scene,
    arrays: scene.arrays.map(array =>
      array.id === arrayId
        ? {
            ...array,
            cells: updater(array.cells.map(cell => cell.value)).map((value, index) => ({
              index, value, state: "neutral"
            }))
          }
        : array
    )
  };
}

function insertArrayValue(scene: ArrayScene, arrayId: string, index: number, value: unknown): ArrayScene {
  return updateArray(scene, arrayId, values => {
    const next = [...values];
    next.splice(index, 0, value);
    return next;
  });
}

function removeArrayValue(scene: ArrayScene, arrayId: string, index: number): ArrayScene {
  return updateArray(scene, arrayId, values => {
    const next = [...values];
    next.splice(index, 1);
    return next;
  });
}

export function applyArraySemanticEvent(scene: ArrayScene, event: ArraySemanticEvent): ArrayScene {
  switch (event.type) {
    case "ARRAY_CREATE":
      return {
        ...scene,
        arrays: [
          ...scene.arrays.filter(array => array.id !== event.arrayId),
          { id: event.arrayId, name: event.name, cells: event.values.map((value, index) => ({ index, value, state: "neutral" })) }
        ]
      };
    case "ARRAY_READ":
      return withCellState(scene, event.arrayId, [event.index], "read");
    case "ARRAY_WRITE":
      return withCellState(updateArray(scene, event.arrayId, values => {
        const next = [...values]; next[event.index] = event.after; return next;
      }), event.arrayId, [event.index], "write");
    case "ARRAY_COMPARE":
      return withCellState(scene, event.arrayId, event.indices, "compare");
    case "ARRAY_SWAP":
      return withCellState(updateArray(scene, event.arrayId, values => {
        const next = [...values];
        [next[event.first], next[event.second]] = [next[event.second], next[event.first]];
        return next;
      }), event.arrayId, [event.first, event.second], "swap");
    case "ARRAY_INSERT":
      return withCellState(insertArrayValue(scene, event.arrayId, event.index, event.value), event.arrayId, [event.index], "write");
    case "ARRAY_REMOVE":
      return removeArrayValue(scene, event.arrayId, event.index);
    case "ARRAY_SHIFT":
      return scene;
    case "POINTER_CREATE":
      return withPointer(scene, { id: event.pointerId, label: event.label, arrayId: event.arrayId, index: event.index });
    case "POINTER_MOVE": {
      const pointer = scene.pointers.find(item => item.id === event.pointerId);
      return pointer ? withPointer(scene, { ...pointer, index: event.to }) : scene;
    }
    case "RANGE_CREATE":
      return withRange(scene, event.range);
    case "RANGE_MOVE":
    case "RANGE_SHRINK":
    case "RANGE_EXPAND": {
      const existing = scene.ranges.find(range => range.id === event.rangeId);
      return existing ? withRange(scene, { ...existing, start: event.start, end: event.end }) : scene;
    }
    case "VARIABLE_CREATE":
    case "VARIABLE_UPDATE":
      return {
        ...scene,
        variables: scene.variables.map(variable =>
          variable.name === event.name ? { ...variable, value: event.value, changed: true } : variable
        )
      };
    default:
      return scene;
  }
}
