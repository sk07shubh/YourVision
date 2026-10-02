import type { TraceState } from '../../types/trace';
import type { VisualEvent, VisualTarget } from './visualEvents';
import { diffStates } from './stateDiff';

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function arrayId(state: TraceState, name: string): string | undefined {
  const value = state.arrays[name];
  return isRecord(value) && typeof value.$arrayId === 'string' ? value.$arrayId : undefined;
}

function accessTargets(statement: string, state: TraceState): VisualTarget[] {
  const targets: VisualTarget[] = [];
  const pattern = /([A-Za-z_$][\w$]*)\s*\[\s*([A-Za-z_$][\w$]*|\d+)\s*\](?:\s*\[\s*([A-Za-z_$][\w$]*|\d+)\s*\])?/g;
  for (const match of statement.matchAll(pattern)) {
    const name = match[1];
    const id = arrayId(state, name);
    if (!id) continue;
    const readIndex = (token: string | undefined) => {
      if (!token) return undefined;
      if (/^\d+$/.test(token)) return Number(token);
      const value = state.variables[token];
      return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
    };
    const row = readIndex(match[2]);
    const column = readIndex(match[3]);
    if (row === undefined) continue;
    targets.push({
      structureId: id,
      kind: column === undefined ? 'array' : 'matrix',
      index: column === undefined ? row : undefined,
      row: column === undefined ? undefined : row,
      column,
    });
  }
  return targets;
}


function objectReference(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.$objectId === 'string') return value.$objectId;
  if (typeof value.$ref === 'string') return value.$ref;
  return undefined;
}

function comparisonIn(statement: string): boolean {
  return /(?:==|!=|<=|>=|<|>)(?!=)/.test(statement) || /\.equals\s*\(/.test(statement);
}

function sameTarget(a: VisualTarget, b: VisualTarget): boolean {
  return a.structureId === b.structureId &&
    a.kind === b.kind &&
    a.index === b.index &&
    a.row === b.row &&
    a.column === b.column;
}

export function semanticEventsBetween(
  previous: TraceState | undefined,
  current: TraceState | undefined,
  source = ''
): VisualEvent[] {
  if (!previous || !current) return [];

  const events = diffStates(previous, current);
  const line = current.line ?? 0;
  const statement = line > 0 ? source.split(/\r?\n/)[line - 1]?.trim() ?? '' : '';
  const accesses = accessTargets(statement, current);

  if (comparisonIn(statement) && accesses.length >= 2) {
    const unique = accesses.filter((target, index) => accesses.findIndex(item => sameTarget(item, target)) === index);
    if (unique.length >= 2) {
      return [...events, { type: 'compare', targets: unique.slice(0, 4) }];
    }
  }

  const mutations = events.filter(event =>
    event.type === 'swap' || event.type === 'insert' || event.type === 'remove' || event.type === 'update'
  );

  if (!mutations.length && accesses.length) {
    return [...events, ...accesses.map(target => ({ type: 'highlight' as const, target }))];
  }

  const structureReads: VisualEvent[] = [];
  const methodRead = /\.(get|peek|peekFirst|peekLast|contains|containsKey|containsValue|element|front|back)\s*\(/i.test(statement);
  if (methodRead && !mutations.length) {
    const names = new Set([...Object.keys(current.dataStructures), ...Object.keys(current.arrays)]);
    for (const name of names) {
      const id = arrayId(current, name);
      if (id && statement.includes(name)) structureReads.push({ type: 'highlight', target: { structureId: id, kind: 'array' } });
      const ds = current.dataStructures[name];
      if (isRecord(ds)) {
        const dsId = typeof ds.$collectionId === 'string' ? ds.$collectionId : typeof ds.$mapId === 'string' ? ds.$mapId : undefined;
        if (dsId && statement.includes(name)) structureReads.push({ type: 'highlight', target: { structureId: dsId, kind: 'collection' } });
      }
    }
  }

  const previousVariables = previous.variables;
  const currentVariables = current.variables;
  const pointerMoves: VisualEvent[] = [];
  for (const name of Object.keys(currentVariables)) {
    const from = previousVariables[name];
    const to = currentVariables[name];
    const fromId = objectReference(from);
    const toId = objectReference(to);
    if (fromId !== toId && toId) {
      pointerMoves.push({
        type: 'move',
        target: { structureId: toId, kind: 'node', objectId: toId },
        from: { index: undefined },
        to: { index: undefined },
      });
      pointerMoves.push({ type: 'traverse', target: { structureId: toId, kind: 'node', objectId: toId } });
    } else if (typeof from === 'number' && typeof to === 'number' && !Object.is(from, to)) {
      pointerMoves.push({
        type: 'move',
        target: { structureId: name, kind: 'variable' },
        from: { index: from },
        to: { index: to },
      });
    }
  }

  return [...events, ...structureReads, ...pointerMoves];
}

export type VisualOperation =
  | 'compare' | 'swap' | 'insert' | 'remove' | 'move'
  | 'traverse' | 'update' | 'highlight' | 'step';

export function primaryVisualOperation(events: VisualEvent[]): VisualOperation {
  const priority: VisualEvent['type'][] = [
    'swap', 'compare', 'insert', 'remove', 'move',
    'traverse', 'update', 'highlight'
  ];
  const type = priority.find(item => events.some(event => event.type === item));
  return (type ?? 'step') as VisualOperation;
}

export function visualOperationLabel(operation: VisualOperation): string {
  return ({
    compare: 'COMPARE',
    swap: 'SWAP',
    insert: 'INSERT',
    remove: 'REMOVE',
    move: 'MOVE',
    traverse: 'TRAVERSE',
    update: 'UPDATE',
    highlight: 'READ',
    step: 'STEP',
  })[operation];
}

export function eventTargets(events: VisualEvent[], structureId: string, index?: number, row?: number, column?: number, field?: string): string[] {
  const kinds = new Set<string>();
  for (const event of events) {
    const targets = event.type === 'swap' || event.type === 'compare'
      ? event.targets
      : 'target' in event
        ? [event.target]
        : [];
    for (const target of targets) {
      if (target.structureId !== structureId) continue;
      if (target.index !== undefined && target.index !== index) continue;
      if (target.row !== undefined && target.row !== row) continue;
      if (target.column !== undefined && target.column !== column) continue;
      if (target.field !== undefined && target.field !== field) continue;
      kinds.add(event.type);
    }
  }
  return [...kinds];
}
