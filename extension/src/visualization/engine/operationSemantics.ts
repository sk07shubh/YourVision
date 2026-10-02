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



function collectionId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.$collectionId === 'string' ? value.$collectionId : undefined;
}

function mapId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.$mapId === 'string' ? value.$mapId : undefined;
}

function collectionValues(value: unknown): unknown[] | undefined {
  return isRecord(value) && Array.isArray(value.values) ? value.values : undefined;
}

function mapEntries(value: unknown): Array<{ key: unknown; value: unknown }> | undefined {
  return isRecord(value) && Array.isArray(value.entries) ? value.entries as Array<{ key: unknown; value: unknown }> : undefined;
}

function readToken(token: string | undefined, state: TraceState): unknown {
  if (!token) return undefined;
  const trimmed = token.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?(?:\d+\.\d+)$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return state.variables[trimmed];
}

function snapshotKey(value: unknown): string {
  return JSON.stringify(value);
}

function methodReadTargets(statement: string, state: TraceState): VisualTarget[] {
  const targets: VisualTarget[] = [];
  const methodPattern = /([A-Za-z_$][\w$]*)\s*\.\s*(get|peek|peekFirst|peekLast|element|front|back|contains|containsKey|containsValue)\s*\(([^)]*)\)/gi;

  for (const match of statement.matchAll(methodPattern)) {
    const name = match[1];
    const method = match[2].toLowerCase();
    const argument = match[3].trim();
    const value = state.dataStructures[name];
    const cid = collectionId(value);
    const mid = mapId(value);
    const values = collectionValues(value);
    const entries = mapEntries(value);

    if (mid && entries) {
      if (method === 'containskey' || method === 'get' || method === 'getordefault') {
        const key = readToken(argument.split(',')[0]?.trim(), state);
        const entry = entries.find(item => snapshotKey(item.key) === snapshotKey(key));
        if (entry) targets.push({ structureId: mid, kind: 'collection', field: snapshotKey(entry.key) });
      } else if (method === 'containsvalue') {
        for (const entry of entries) {
          const sought = readToken(argument, state);
          if (snapshotKey(entry.value) === snapshotKey(sought)) {
            targets.push({ structureId: mid, kind: 'collection', field: snapshotKey(entry.key) });
          }
        }
      }
      continue;
    }

    if (!cid || !values) continue;

    if (method === 'get') {
      const index = readToken(argument, state);
      if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < values.length) {
        targets.push({ structureId: cid, kind: 'collection', index });
      }
    } else if (method === 'peek' || method === 'element' || method === 'front') {
      if (values.length) {
        const kind = isRecord(value) && typeof value.$kind === 'string' ? value.$kind : '';
        const index = kind === 'stack' ? values.length - 1 : 0;
        targets.push({ structureId: cid, kind: 'collection', index });
      }
    } else if (method === 'peeklast' || method === 'back') {
      if (values.length) targets.push({ structureId: cid, kind: 'collection', index: values.length - 1 });
    } else if (method === 'contains') {
      const sought = readToken(argument, state);
      values.forEach((item, index) => {
        if (snapshotKey(item) === snapshotKey(sought)) {
          targets.push({ structureId: cid, kind: 'collection', index });
        }
      });
    }
  }

  return targets;
}

function objectFieldReadTargets(statement: string, state: TraceState): VisualTarget[] {
  const targets: VisualTarget[] = [];
  const pattern = /\b([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\b(?!\s*\()/g;
  for (const match of statement.matchAll(pattern)) {
    const objectId = objectReference(state.variables[match[1]]);
    if (!objectId) continue;
    targets.push({
      structureId: objectId,
      kind: 'node',
      objectId,
      field: match[2],
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
  const methodAccesses = methodReadTargets(statement, current);
  const fieldAccesses = objectFieldReadTargets(statement, current);
  const readTargets = [...accesses, ...methodAccesses, ...fieldAccesses];

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
  if (!mutations.length && readTargets.length) {
    const unique = readTargets.filter((target, index) =>
      readTargets.findIndex(item => sameTarget(item, target) && item.field === target.field) === index
    );
    structureReads.push(...unique.map(target => ({ type: 'highlight' as const, target })));
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
      pointerMoves.push({ type: 'traverse', target: { structureId: fromId + '->' + toId, kind: 'edge' } });
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
