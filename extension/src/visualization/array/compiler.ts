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

function currentLineSource(source: string, line?: number): string {
  if (!line || line < 1) return "";
  return source.split(/\r?\n/)[line - 1]?.trim() ?? "";
}

function evaluateIndex(expression: string, state: TraceState): number | undefined {
  const text = expression.trim();
  if (/^-?\d+$/.test(text)) return Number(text);
  const value = state.variables[text];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function arrayAccesses(statement: string, arrayName: string, state: TraceState): Array<{ index: number; expression: string }> {
  const escaped = arrayName.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped + "\\s*\\[([^\\]]+)\\]", "g");
  const result: Array<{ index: number; expression: string }> = [];

  for (const match of statement.matchAll(pattern)) {
    const index = evaluateIndex(match[1], state);
    if (index !== undefined) result.push({ index, expression: match[0] });
  }

  return result;
}

function eventLabel(event: ArraySemanticEvent): string {
  switch (event.type) {
    case "ARRAY_READ": return "Read array element";
    case "ARRAY_WRITE": return "Updated array element";
    case "ARRAY_COMPARE": return "Compared array elements";
    case "ARRAY_SWAP": return "Swapped array elements";
    case "ARRAY_INSERT": return "Inserted array element";
    case "ARRAY_REMOVE": return "Removed array element";
    case "ARRAY_SHIFT": return "Shifted array elements";
    case "POINTER_CREATE": return "Created pointer";
    case "POINTER_MOVE": return "Moved pointer";
    case "ARRAY_CREATE": return "Created array";
    case "VARIABLE_UPDATE": return "Updated variable";
    case "RANGE_MOVE": return "Moved active range";
    case "RANGE_SHRINK": return "Shrank active range";
    case "RANGE_EXPAND": return "Expanded active range";
    case "RETURN": return "Returned";
    default: return event.type.replaceAll("_", " ").toLowerCase();
  }
}

function pointerEvents(state: TraceState, previous: TraceState | undefined, source: string): ArraySemanticEvent[] {
  const current = createArrayScene(state, source);
  const before = previous ? createArrayScene(previous, source) : undefined;
  const events: ArraySemanticEvent[] = [];

  for (const pointer of current.pointers) {
    const old = before?.pointers.find(item => item.id === pointer.id);

    if (!old) {
      events.push({
        type: "POINTER_CREATE",
        pointerId: pointer.id,
        label: pointer.label,
        arrayId: pointer.arrayId,
        index: pointer.index,
        sourceLine: state.line
      });
      continue;
    }

    if (old.index !== pointer.index) {
      events.push({
        type: "POINTER_MOVE",
        pointerId: pointer.id,
        from: old.index,
        to: pointer.index,
        sourceLine: state.line
      });
    }
  }

  return events;
}

function rangeEvents(state: TraceState, previous: TraceState | undefined, source: string): ArraySemanticEvent[] {
  if (!previous) return [];

  const current = createArrayScene(state, source);
  const before = createArrayScene(previous, source);
  const events: ArraySemanticEvent[] = [];

  for (const range of current.ranges) {
    const old = before.ranges.find(item => item.id === range.id);
    if (!old) {
      events.push({ type: "RANGE_CREATE", range, sourceLine: state.line });
      continue;
    }
    if (old.start === range.start && old.end === range.end) continue;

    const oldSize = old.end - old.start;
    const newSize = range.end - range.start;
    const type = oldSize === newSize
      ? "RANGE_MOVE"
      : newSize < oldSize
        ? "RANGE_SHRINK"
        : "RANGE_EXPAND";

    events.push({ type, rangeId: range.id, start: range.start, end: range.end, sourceLine: state.line });
  }

  return events;
}

function variableEvents(state: TraceState, previous: TraceState | undefined): ArraySemanticEvent[] {
  if (!previous) return [];

  const events: ArraySemanticEvent[] = [];

  for (const [name, value] of Object.entries(state.variables)) {
    if (!(name in previous.variables)) {
      events.push({ type: "VARIABLE_CREATE", name, value, sourceLine: state.line });
      continue;
    }

    if (!same(previous.variables[name], value)) {
      events.push({ type: "VARIABLE_UPDATE", name, value, sourceLine: state.line });
    }
  }

  return events;
}

function accessEvents(state: TraceState, source: string): ArraySemanticEvent[] {
  const statement = currentLineSource(source, state.line);
  if (!statement) return [];

  const events: ArraySemanticEvent[] = [];
  const isAssignment = /(^|[^=!<>])=([^=]|$)/.test(statement) && !/==|!=|<=|>=/.test(statement);
  const isComparison = /==|!=|<=|>=|<|>/.test(statement);

  for (const [name, value] of Object.entries({ ...state.arrays, ...state.variables })) {
    const values = arrayValues(value);
    if (!values) continue;

    const id = arrayId(name, value);
    const accesses = arrayAccesses(statement, name, state);
    if (accesses.length === 0) continue;

    const uniqueIndices = [...new Set(accesses.map(item => item.index))]
      .filter(index => index >= 0 && index < values.length);

    if (isComparison && uniqueIndices.length > 0) {
      events.push({
        type: "ARRAY_COMPARE",
        arrayId: id,
        indices: uniqueIndices,
        sourceLine: state.line,
        sourceExpression: statement
      });
    }

    const writesToArray = isAssignment && statement.indexOf("=") > -1 && /\[[^\]]+\]\s*=/.test(statement);
    if (!writesToArray) {
      for (const index of uniqueIndices) {
        events.push({
          type: "ARRAY_READ",
          arrayId: id,
          index,
          value: values[index],
          sourceLine: state.line,
          sourceExpression: statement
        });
      }
    }
  }

  return events;
}

function insertionOrRemoval(
  before: unknown[],
  after: unknown[],
  id: string,
  sourceLine?: number
): ArraySemanticEvent[] {
  if (after.length === before.length + 1) {
    for (let index = 0; index < after.length; index++) {
      if (same(after.slice(0, index), before.slice(0, index)) &&
          same(after.slice(index + 1), before.slice(index))) {
        return [{ type: "ARRAY_INSERT", arrayId: id, index, value: after[index], sourceLine }];
      }
    }
  }

  if (after.length + 1 === before.length) {
    for (let index = 0; index < before.length; index++) {
      if (same(before.slice(0, index), after.slice(0, index)) &&
          same(before.slice(index + 1), after.slice(index))) {
        return [{ type: "ARRAY_REMOVE", arrayId: id, index, value: before[index], sourceLine }];
      }
    }
  }

  return [];
}

export function compileArrayEvents(state: TraceState, previous?: TraceState, source = ""): ArraySemanticEvent[] {
  if (!previous) {
    return [
      ...Object.entries(state.arrays).flatMap(([name, value]) => {
        const values = arrayValues(value);
        if (!values) return [];
        return [{
          type: "ARRAY_CREATE" as const,
          arrayId: arrayId(name, value),
          name,
          values,
          sourceLine: state.line
        }];
      }),
      ...pointerEvents(state, undefined, source),
      ...accessEvents(state, source)
    ];
  }

  const events: ArraySemanticEvent[] = [];
  const previousArrays = { ...previous.arrays, ...previous.variables };
  const currentArrays = { ...state.arrays, ...state.variables };

  for (const [name, current] of Object.entries(currentArrays)) {
    const after = arrayValues(current);
    const before = arrayValues(previousArrays[name]);
    if (!after) continue;

    if (!before) {
      events.push({
        type: "ARRAY_CREATE",
        arrayId: arrayId(name, current),
        name,
        values: after,
        sourceLine: state.line
      });
      continue;
    }

    const id = arrayId(name, current);
    const structural = insertionOrRemoval(before, after, id, state.line);
    if (structural.length > 0) {
      events.push(...structural);
      continue;
    }

    const changes = changedIndices(before, after);

    if (changes.length === 2) {
      const [first, second] = changes;
      if (same(before[first], after[second]) && same(before[second], after[first])) {
        events.push({
          type: "ARRAY_SWAP",
          arrayId: id,
          first,
          second,
          sourceLine: state.line,
          sourceExpression: currentLineSource(source, state.line)
        });
        continue;
      }
    }

    for (const index of changes) {
      events.push({
        type: "ARRAY_WRITE",
        arrayId: id,
        index,
        before: before[index],
        after: after[index],
        sourceLine: state.line,
        sourceExpression: currentLineSource(source, state.line)
      });
    }
  }

  return [
    ...variableEvents(state, previous),
    ...pointerEvents(state, previous, source),
    ...rangeEvents(state, previous, source),
    ...accessEvents(state, source),
    ...events
  ];
}

export function compileArrayStep(state: TraceState, source = "", previous?: TraceState) {
  const events = compileArrayEvents(state, previous, source);
  return {
    sourceLine: state.line,
    method: state.method,
    eventLabel: events.length > 0
      ? eventLabel(events[0])
      : (state.lastEvent?.type?.replaceAll("_", " ").toLowerCase() ?? "Execution state"),
    events,
    scene: createArrayScene(state, source, previous)
  };
}
