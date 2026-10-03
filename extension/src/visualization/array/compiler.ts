import type { TraceState } from "../../types/trace";
import type { ArraySemanticEvent } from "./types";
import { createArrayScene } from "./scene";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isArraySnapshot(value: unknown): value is RecordValue & { $arrayId: string; values: unknown[] } {
  return isRecord(value) && typeof value.$arrayId === "string" && Array.isArray(value.values);
}

function arrayValues(value: unknown): unknown[] | undefined {
  if (isArraySnapshot(value)) return value.values;
  return Array.isArray(value) ? value : undefined;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedIndices(before: unknown[], after: unknown[]): number[] {
  const length = Math.max(before.length, after.length);
  const result: number[] = [];
  for (let index = 0; index < length; index++) {
    if (!same(before[index], after[index])) result.push(index);
  }
  return result;
}

function arrayId(name: string, value: unknown): string {
  return isArraySnapshot(value) ? value.$arrayId : name;
}

function eventLabel(event: ArraySemanticEvent): string {
  switch (event.type) {
    case "ARRAY_READ": return "Read array element";
    case "ARRAY_WRITE": return "Updated array element";
    case "ARRAY_COMPARE": return "Compared array elements";
    case "ARRAY_SWAP": return "Swapped array elements";
    case "POINTER_CREATE": return "Created pointer";
    case "POINTER_MOVE": return "Moved pointer";
    case "ARRAY_CREATE": return "Created array";
    case "RETURN": return "Returned";
    default: return event.type.replaceAll("_", " ").toLowerCase();
  }
}

export function compileArrayEvents(state: TraceState, previous?: TraceState): ArraySemanticEvent[] {
  if (!previous) {
    return Object.entries(state.arrays).flatMap(([name, value]) => {
      const values = arrayValues(value);
      if (!values) return [];
      return [{ type: "ARRAY_CREATE" as const, arrayId: arrayId(name, value), name, values, sourceLine: state.line }];
    });
  }

  const events: ArraySemanticEvent[] = [];
  const previousArrays = { ...previous.arrays, ...previous.variables };
  const currentArrays = { ...state.arrays, ...state.variables };

  for (const [name, current] of Object.entries(currentArrays)) {
    const after = arrayValues(current);
    const before = arrayValues(previousArrays[name]);
    if (!after) continue;

    if (!before) {
      events.push({ type: "ARRAY_CREATE", arrayId: arrayId(name, current), name, values: after, sourceLine: state.line });
      continue;
    }

    const changes = changedIndices(before, after);
    const id = arrayId(name, current);

    if (changes.length === 2) {
      const [first, second] = changes;
      if (same(before[first], after[second]) && same(before[second], after[first])) {
        events.push({ type: "ARRAY_SWAP", arrayId: id, first, second, sourceLine: state.line });
        continue;
      }
    }

    for (const index of changes) {
      events.push({ type: "ARRAY_WRITE", arrayId: id, index, before: before[index], after: after[index], sourceLine: state.line });
    }
  }

  return events;
}

export function compileArrayStep(state: TraceState, source = "", previous?: TraceState) {
  const events = compileArrayEvents(state, previous);
  return {
    sourceLine: state.line,
    method: state.method,
    eventLabel: events.length > 0 ? eventLabel(events[0]) : (state.lastEvent?.type?.replaceAll("_", " ").toLowerCase() ?? "Execution state"),
    events,
    scene: createArrayScene(state, source, previous)
  };
}
