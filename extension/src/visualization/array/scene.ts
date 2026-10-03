import type { TraceState } from "../../types/trace";
import type { ArrayCell, ArrayPointer, ArrayRange, ArrayScene, ArraySceneArray, ArraySceneVariable } from "./types";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isArraySnapshot(value: unknown): value is RecordValue & { $arrayId: string; values: unknown[] } {
  return isRecord(value) && typeof value.$arrayId === "string" && Array.isArray(value.values);
}

function arraySnapshotValues(value: unknown): unknown[] | undefined {
  if (isArraySnapshot(value)) return value.values;
  if (Array.isArray(value)) return value;
  return undefined;
}

function collectArrays(state: TraceState): ArraySceneArray[] {
  const source = { ...state.arrays, ...state.variables };
  const result: ArraySceneArray[] = [];
  const seen = new Set<string>();

  for (const [name, value] of Object.entries(source)) {
    const values = arraySnapshotValues(value);
    if (!values) continue;

    const snapshot = isArraySnapshot(value) ? value : undefined;
    const id = snapshot?.$arrayId ?? name;
    if (seen.has(id)) continue;
    seen.add(id);

    result.push({
      id,
      name,
      type: typeof snapshot?.$type === "string" ? snapshot.$type : undefined,
      cells: values.map((cell, index): ArrayCell => ({ index, value: cell, state: "neutral" }))
    });
  }

  return result;
}

function sourceIndexVariables(source: string, arrayName: string): Set<string> {
  const names = new Set<string>();
  const escaped = arrayName.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped + "\\s*\\[([^\\]]+)\\]", "g");

  for (const match of source.matchAll(pattern)) {
    for (const identifier of match[1].matchAll(/\\b[A-Za-z_$][\\w$]*\\b/g)) {
      names.add(identifier[0]);
    }
  }

  return names;
}

function collectPointers(state: TraceState, source: string, arrays: ArraySceneArray[]): ArrayPointer[] {
  const pointers: ArrayPointer[] = [];

  for (const array of arrays) {
    const candidates = sourceIndexVariables(source, array.name);

    for (const [name, value] of Object.entries(state.variables)) {
      if (!candidates.has(name)) continue;
      if (typeof value !== "number" || !Number.isInteger(value)) continue;
      if (value < 0 || value >= array.cells.length) continue;

      pointers.push({ id: array.id + ":" + name, label: name, arrayId: array.id, index: value });
    }
  }

  return pointers;
}

function collectVariables(state: TraceState, previous?: TraceState): ArraySceneVariable[] {
  return Object.entries(state.variables)
    .filter(([, value]) => !arraySnapshotValues(value))
    .map(([name, value]) => ({
      name,
      value,
      changed: previous ? JSON.stringify(previous.variables[name]) !== JSON.stringify(value) : false
    }));
}

export function createArrayScene(state: TraceState, source = "", previous?: TraceState): ArrayScene {
  const arrays = collectArrays(state);
  return {
    arrays,
    pointers: collectPointers(state, source, arrays),
    ranges: [],
    variables: collectVariables(state, previous)
  };
}

export function withCellState(scene: ArrayScene, arrayId: string, indices: number[], state: ArrayCell["state"]): ArrayScene {
  const indexSet = new Set(indices);
  return {
    ...scene,
    arrays: scene.arrays.map(array =>
      array.id !== arrayId ? array : {
        ...array,
        cells: array.cells.map(cell => indexSet.has(cell.index) ? { ...cell, state } : cell)
      }
    )
  };
}

export function withPointer(scene: ArrayScene, pointer: ArrayPointer): ArrayScene {
  const exists = scene.pointers.some(item => item.id === pointer.id);
  return {
    ...scene,
    pointers: exists
      ? scene.pointers.map(item => item.id === pointer.id ? pointer : item)
      : [...scene.pointers, pointer]
  };
}

export function withRange(scene: ArrayScene, range: ArrayRange): ArrayScene {
  const exists = scene.ranges.some(item => item.id === range.id);
  return {
    ...scene,
    ranges: exists
      ? scene.ranges.map(item => item.id === range.id ? range : item)
      : [...scene.ranges, range]
  };
}
