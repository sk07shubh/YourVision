import type { TraceState } from '../../types/trace';
import type { VisualEvent, VisualTarget } from './visualEvents';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isArraySnapshot(value: unknown): value is UnknownRecord & { $arrayId: string; values: unknown[] } {
  return isRecord(value) && typeof value.$arrayId === 'string' && Array.isArray(value.values);
}
function structureId(name: string, value: unknown): string {
  if (isRecord(value)) {
    if (typeof value.$arrayId === 'string') return value.$arrayId;
    if (typeof value.$mapId === 'string') return value.$mapId;
    if (typeof value.$collectionId === 'string') return value.$collectionId;
    if (typeof value.$objectId === 'string') return value.$objectId;
  }
  return name;
}
function diffArray(name: string, before: unknown, after: unknown): VisualEvent[] {
  if (!isArraySnapshot(before) || !isArraySnapshot(after)) return [];
  const id = structureId(name, after);
  const limit = Math.max(before.values.length, after.values.length);
  const events: VisualEvent[] = [];
  for (let index = 0; index < limit; index++) {
    const oldValue = before.values[index];
    const newValue = after.values[index];
    if (index >= before.values.length) {
      events.push({ type: 'insert', target: { structureId: id, kind: 'array', index }, value: newValue });
    } else if (index >= after.values.length) {
      events.push({ type: 'remove', target: { structureId: id, kind: 'array', index }, value: oldValue });
    } else if (!Object.is(oldValue, newValue)) {
      events.push({ type: 'update', target: { structureId: id, kind: 'array', index }, from: oldValue, to: newValue });
    }
  }
  return events;
}

/** Converts two immutable execution snapshots into only the semantic visual changes. */
export function diffStates(previous: TraceState | undefined, current: TraceState | undefined): VisualEvent[] {
  if (!previous || !current) return [];
  const events: VisualEvent[] = [];
  const arrayNames = new Set([...Object.keys(previous.arrays), ...Object.keys(current.arrays)]);
  for (const name of arrayNames) events.push(...diffArray(name, previous.arrays[name], current.arrays[name]));

  for (const name of Object.keys(current.variables)) {
    if (!Object.prototype.hasOwnProperty.call(previous.variables, name)) continue;
    const from = previous.variables[name];
    const to = current.variables[name];
    if (typeof from === 'number' && typeof to === 'number' && !Object.is(from, to)) {
      events.push({ type: 'update', target: { structureId: name, kind: 'variable' }, from, to });
    }
  }
  return events;
}

export function targetKey(target: VisualTarget): string {
  return [
    target.structureId, target.kind, target.index ?? '', target.row ?? '',
    target.column ?? '', target.objectId ?? '', target.field ?? '',
  ].join(':');
}
