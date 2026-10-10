import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../state/session';
import { sessionStore } from '../state/store';
import { displayValue, stableStringify, isPlainObject } from '../utils/value';
import { highlightEditorLine, clearEditorExecutionMarker } from '../leetcode/editor-overlay';
import type { TraceState } from '../types/trace';

type Obj = Record<string, unknown>;

function eventLabel(state?: TraceState): string {
  const t = state?.lastEvent?.type;
  if (!t) return state ? 'Execution state' : 'Ready';
  return ({STEP:'Executed line',METHOD_ENTER:'Entered method',METHOD_EXIT:'Returned from method',ARRAY_WRITE:'Array updated',ARRAY_ACCESS:'Array accessed',ARRAY_REFERENCE:'Array referenced',OBJECT_FIELD_WRITE:'Object updated',OBJECT_CREATE:'Object created',VARIABLE_UPDATE:'Variable updated',MAP_WRITE:'Map updated',ERROR:'Runtime error',TIMEOUT:'Execution timed out',TRACE_LIMIT:'Trace limit reached',PROGRAM_START:'Started',PROGRAM_END:'Finished'} as Record<string,string>)[t] ?? 'Execution state';
}

type ExecutionEffect = { text: string; kind?: 'change' | 'condition' | 'structural' | 'return'; };

export function executionCondition(state?: TraceState): boolean | undefined {
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return undefined;
  if (typeof data.conditionResult === 'boolean') return data.conditionResult;
  return undefined;
}

function valueChanged(a: unknown, b: unknown): boolean { return stableStringify(a) !== stableStringify(b); }
function compactValue(value: unknown): string { const text = displayValue(value); return text.length > 42 ? text.slice(0, 39) + '…' : text; }

function isStructuralValue(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return typeof value.$arrayId === 'string' || typeof value.$mapId === 'string' || typeof value.$collectionId === 'string';
}

function accessEffects(data: Obj): ExecutionEffect[] {
  const effects: ExecutionEffect[] = [];
  const executionEvents = Array.isArray(data.executionEvents) ? data.executionEvents : [];
  for (const event of executionEvents) {
    if (!isPlainObject(event) || event.type !== 'ARRAY_ACCESS' || !isPlainObject(event.data)) continue;
    const eventData = event.data;
    const name = typeof eventData.name === 'string' ? eventData.name : 'array';
    const indices = Array.isArray(eventData.indices) ? eventData.indices.map((x) => '[' + x + ']').join('') : '';
    effects.push({ kind: 'structural', text: name + indices + ' = ' + compactValue(eventData.value) });
  }
  return effects;
}

export function eventEffects(state?: TraceState): ExecutionEffect[] {
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return [];

  const type = state?.lastEvent?.type;
  const effects: ExecutionEffect[] = [...accessEffects(data)];

  // Replay checkpoints carry the operations observed between the current
  // STEP and the next runtime checkpoint. Those operations belong to the
  // currently highlighted line, not the following line.
  const executionEvents = Array.isArray(data.executionEvents) ? data.executionEvents : [];

  for (const event of executionEvents) {
    if (!isPlainObject(event)) continue;
    const eventData = isPlainObject(event.data) ? event.data : {};
    const eventType = typeof event.type === 'string' ? event.type : '';

    if (eventType === 'ARRAY_WRITE') {
      const name = typeof eventData.name === 'string' ? eventData.name : 'array';
      const changes = Array.isArray(eventData.changes) ? eventData.changes : [];
      for (const change of changes.slice(0, 3)) {
        if (!isPlainObject(change)) continue;
        const indices = Array.isArray(change.indices)
          ? change.indices.map((x) => '[' + x + ']').join('')
          : '';
        effects.push({
          kind: 'change',
          text: name + indices + '  ' + compactValue(change.before) + '  →  ' + compactValue(change.after)
        });
      }
    } else if (eventType === 'MAP_WRITE') {
      const changes = Array.isArray(eventData.changes) ? eventData.changes : [];
      for (const change of changes.slice(0, 3)) {
        if (!isPlainObject(change)) continue;
        const key = compactValue(change.key);
        if (change.kind === 'insert') {
          effects.push({ kind: 'structural', text: key + '  →  ' + compactValue(change.after) });
        } else if (change.kind === 'delete') {
          effects.push({ kind: 'structural', text: key + '  removed' });
        } else {
          effects.push({
            kind: 'change',
            text: key + '  ' + compactValue(change.before) + '  →  ' + compactValue(change.after)
          });
        }
      }
    } else if (eventType === 'OBJECT_FIELD_WRITE') {
      const changes = Array.isArray(eventData.changes) ? eventData.changes : [];
      for (const change of changes.slice(0, 3)) {
        if (!isPlainObject(change)) continue;
        const fields = Array.isArray(change.fields) ? change.fields.join('.') : 'field';
        effects.push({
          kind: 'change',
          text: fields + '  ' + compactValue(change.before) + '  →  ' + compactValue(change.after)
        });
      }
    }
  }

  if (type === 'ARRAY_ACCESS') {
    const name = typeof data.array === 'string'
      ? data.array
      : typeof data.name === 'string' ? data.name : 'array';
    const index = typeof data.index === 'number' ? '[' + data.index + ']' : '';
    const value = 'value' in data ? ' = ' + compactValue(data.value) : '';
    effects.push({ kind: 'structural', text: name + index + value });
  }

  if (type === 'ARRAY_REFERENCE') {
    const name = typeof data.array === 'string'
      ? data.array
      : typeof data.name === 'string' ? data.name : 'array';
    effects.push({ kind: 'structural', text: name });
  }

  if (type === 'OBJECT_CREATE') {
    const name = typeof data.name === 'string'
      ? data.name
      : typeof data.type === 'string' ? data.type : 'object';
    effects.push({ kind: 'structural', text: name });
  }

  if (type === 'OBJECT_FIELD_WRITE') {
    const changes = Array.isArray(data.changes) ? data.changes : [];
    for (const change of changes.slice(0, 3)) {
      if (!isPlainObject(change)) continue;
      const fields = Array.isArray(change.fields) ? change.fields.join('.') : 'field';
      effects.push({
        kind: 'change',
        text: fields + '  ' + compactValue(change.before) + '  →  ' + compactValue(change.after)
      });
    }
  }

  if (type === 'ARRAY_WRITE') {
    const changes = Array.isArray(data.changes) ? data.changes : [];
    for (const change of changes.slice(0, 3)) {
      if (!isPlainObject(change)) continue;
      const indices = Array.isArray(change.indices)
        ? change.indices.map((x) => '[' + x + ']').join('')
        : '';
      const name = typeof data.name === 'string' ? data.name : 'array';
      effects.push({
        kind: 'change',
        text: name + indices + '  ' + compactValue(change.before) + '  →  ' + compactValue(change.after)
      });
    }
  }

  if (type === 'MAP_WRITE') {
    const changes = Array.isArray(data.changes) ? data.changes : [];
    for (const change of changes.slice(0, 3)) {
      if (!isPlainObject(change)) continue;
      const key = compactValue(change.key);
      if (change.kind === 'insert') {
        effects.push({ kind: 'structural', text: key + '  →  ' + compactValue(change.after) });
      } else if (change.kind === 'delete') {
        effects.push({ kind: 'structural', text: key + '  removed' });
      } else {
        effects.push({
          kind: 'change',
          text: key + '  ' + compactValue(change.before) + '  →  ' + compactValue(change.after)
        });
      }
    }
  }

  if ('returnValue' in data) {
    effects.push({ kind: 'return', text: '↩  ' + compactValue(data.returnValue) });
  }

  return effects;
}

export function executionSubstatement(
  statement: string,
  state?: TraceState,
  previous?: TraceState
): string {
  const trimmed = statement.trim();
  const data = isPlainObject(state?.lastEvent?.data) ? state.lastEvent.data : undefined;

  const balanced = (source: string, openIndex: number): string | undefined => {
    if (source.charAt(openIndex) !== '(') return undefined;
    let depth = 0, quote = '', escaped = false;
    for (let i = openIndex; i < source.length; i++) {
      const ch = source[i]!;
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) return source.slice(openIndex + 1, i);
      }
    }
    return undefined;
  };

  const splitTopLevel = (source: string, delimiter = ';'): string[] => {
    const parts: string[] = [];
    let start = 0, depth = 0, quote = '', escaped = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i]!;
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (ch === delimiter && depth === 0) {
        parts.push(source.slice(start, i).trim());
        start = i + 1;
      }
    }
    parts.push(source.slice(start).trim());
    return parts;
  };

  const rawVariables = isPlainObject(data?.variables) ? data.variables : {};
  const previousData = isPlainObject(previous?.lastEvent?.data) ? previous.lastEvent.data : undefined;
  const rawPreviousVariables = isPlainObject(previousData?.variables) ? previousData.variables : {};
  const conditionResult = typeof data?.conditionResult === 'boolean' ? data.conditionResult : undefined;

  if (/^for\s*\(/.test(trimmed)) {
    const inside = balanced(trimmed, trimmed.indexOf('('));
    if (inside) {
      const parts = splitTopLevel(inside);

      // Enhanced-for: for (Type name : iterable)
      // It has no init/condition/update triplet. The complete declaration
      // before ':' is the binding, regardless of whether the element is a
      // primitive, String, array, object, generic type, or nested generic.
      if (splitTopLevel(inside, ':').length === 2) {
        const [declaration, iterable] = splitTopLevel(inside, ':');
        return declaration.trim() + ' : ' + iterable.trim();
      }

      if (parts.length === 3) {
        const [initialization, condition, update] = parts;
        const initNames = [...initialization.matchAll(
          /(?:^|[,\s])(?:final\s+)?(?:byte|short|int|long|float|double|char|boolean|var)\s+([A-Za-z_$][\w$]*)/g
        )].map(m => m[1]);
        const updateNames = [...update.matchAll(/\b[A-Za-z_$][\w$]*\b/g)]
          .map(m => m[0])
          .filter(name => name in rawVariables || name in rawPreviousVariables);
        const events = Array.isArray(data?.executionEvents) ? data.executionEvents : [];
        const variableEvents = events.filter(e => isPlainObject(e) && e.type === 'VARIABLE_UPDATE');

        // Declaration/update event without a previous value = first entry into this for-loop.
        const isInitialization = variableEvents.some(event => {
          const d = isPlainObject(event.data) ? event.data : undefined;
          const name = typeof d?.name === 'string' ? d.name : undefined;
          return !!name && initNames.includes(name) &&
            (!('before' in (d ?? {})) || !(name in rawPreviousVariables));
        });
        if (isInitialization) return initialization + ';';

        // The runtime trace can attach the following conditionResult to the
        // same checkpoint as the for-loop increment. The variable-update event
        // is the authoritative phase marker: render i++ first, then let the
        // next clean checkpoint render i < n.
        const isUpdate = variableEvents.some(event => {
          const d = isPlainObject(event.data) ? event.data : undefined;
          const name = typeof d?.name === 'string' ? d.name : undefined;
          return !!name && updateNames.includes(name) &&
            ('before' in (d ?? {}) || name in rawPreviousVariables);
        });
        if (isUpdate) return update;

        // Only a checkpoint without a runtime update event is a condition
        // checkpoint, even when the trace carries a conditionResult on the
        // preceding update checkpoint.
        if (conditionResult !== undefined) return condition;

        // Last-resort runtime snapshot delta.
        if (updateNames.some(name =>
          name in rawVariables && name in rawPreviousVariables &&
          valueChanged(rawPreviousVariables[name], rawVariables[name])
        )) return update;

        // Only now is this a condition checkpoint.
        return condition;
      }
    }
  }

  // Always preserve complete if/while syntax. TRUE/FALSE is rendered separately.
  if (/^(if|while)\s*\(/.test(trimmed)) {
    const inside = balanced(trimmed, trimmed.indexOf('('));
    if (inside) {
      const keyword = trimmed.match(/^(if|while)\b/)?.[1] ?? 'if';
      return keyword + '(' + inside + ')';
    }
  }

  return statement || '';
}

function debugValue(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function buildDebugTrace(states: TraceState[], source: string): string {
  const lines = source.split(/\r?\n/);
  return states.map((state, index) => {
    const lineNumber = state.line ?? 0;
    const code = lineNumber > 0 ? (lines[lineNumber - 1] ?? '').trim() : '';
    const data = isPlainObject(state.lastEvent?.data) ? state.lastEvent.data : {};
    const condition = typeof data.conditionResult === 'boolean'
      ? (data.conditionResult ? 'TRUE' : 'FALSE')
      : '—';
    const executionEvents = Array.isArray(data.executionEvents) ? data.executionEvents : [];
    return [
      'STEP ' + (index + 1) + ' / ' + states.length,
      'LINE: ' + lineNumber,
      'CODE: ' + code,
      'EVENT: ' + (state.lastEvent?.type ?? '—'),
      'METHOD: ' + (state.method ?? '—'),
      'DEPTH: ' + (state.depth ?? 0),
      'CONDITION: ' + condition,
      'EXECUTION EVENTS:',
      executionEvents.length ? debugValue(executionEvents) : '[]',
      'VARIABLES:',
      debugValue(state.variables ?? {}),
      'ARRAYS:',
      debugValue(state.arrays ?? {}),
      'DATA STRUCTURES:',
      debugValue(state.dataStructures ?? {}),
      'OBJECTS:',
      debugValue(state.objects ?? {}),
      'CALL STACK:',
      debugValue(state.callStack ?? []),
      'LAST EVENT DATA:',
      debugValue(data),
      '\n' + '='.repeat(80) + '\n'
    ].join('\n');
  }).join('\n');
}
function VariableResult({ name, oldValue, value, initialized }: {
  name: string;
  oldValue?: unknown;
  value: unknown;
  initialized: boolean;
}) {
  return (
    <div className="yv-variable-result">
      <span className="yv-variable-name">{name}</span>
      <span className="yv-variable-transition">
        <span className="yv-variable-old">
          {initialized ? 'undefined' : variableSummary(oldValue)}
        </span>
        <span className="yv-variable-arrow">→</span>
        <span className="yv-variable-new">{variableSummary(value)}</span>
      </span>
    </div>
  );
}

function statementFromState(state: TraceState): string {
  const source = sessionStore.get().source;
  const line = state.line;
  return line && line > 0 ? (source.split(/\r?\n/)[line - 1] ?? '').trim() : '';
}

function variableResultChanges(current?: TraceState, previous?: TraceState): React.ReactNode[] {
  if (!current) return [];

  const before = previous?.variables ?? {};
  const results = Object.entries(current.variables ?? {})
    .filter(([, value]) => !isStructuralValue(value))
    .filter(([name, value]) => name !== 'this' && (!(name in before) || valueChanged(before[name], value)))
    .map(([name, value]) => (
      <VariableResult key={name} name={name} oldValue={before[name]} value={value} initialized={!(name in before)} />
    ));

  if (results.length > 0) return results;

  const data = isPlainObject(current.lastEvent?.data) ? current.lastEvent.data : undefined;
  const rawVariables = isPlainObject(data?.variables) ? data.variables : {};
  const events = Array.isArray(data?.executionEvents) ? data.executionEvents : [];
  const fallback: React.ReactNode[] = [];

  // Runtime may omit a VARIABLE_UPDATE when an assignment writes the same value.
  // Use the executed source statement so these lines never collapse to "—".
  const source = statementFromState(current);
  const assignment = source.match(
    /^(?:final\s+)?(?:(?:byte|short|int|long|float|double|char|boolean|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?!=|>)/
  );
  if (assignment) {
    const name = assignment[1];
    if (name in rawVariables && name !== 'this' && !isStructuralValue(rawVariables[name])) {
      fallback.push(
        <VariableResult
          key={'source-variable-' + name}
          name={name}
          oldValue={before[name]}
          value={rawVariables[name]}
          initialized={!(name in before)}
        />
      );
    }
  }

  if (fallback.length > 0) return fallback;

  for (const event of events) {
    if (!isPlainObject(event) || event.type !== 'VARIABLE_UPDATE') continue;
    const eventData = isPlainObject(event.data) ? event.data : undefined;
    const name = typeof eventData?.name === 'string' ? eventData.name : undefined;
    if (!eventData || !name || name === 'this' || !('value' in eventData)) continue;
    const value = eventData.value;
    if (isStructuralValue(value)) continue;
    const oldValue = 'before' in eventData ? eventData.before : before[name];
    fallback.push(
      <VariableResult
        key={'event-variable-' + name}
        name={name}
        oldValue={oldValue}
        value={value}
        initialized={oldValue === undefined}
      />
    );
  }
  return fallback;
}

function structureType(value: unknown, fallback: string): string {
  if (isArraySnapshot(value)) return 'Array';
  if (isMapSnapshot(value)) return 'Map';
  if (isCollectionSnapshot(value)) {
    if (typeof value.$kind === 'string' && value.$kind.trim()) {
      return value.$kind.charAt(0).toUpperCase() + value.$kind.slice(1);
    }
    if (typeof value.$type === 'string') {
      return value.$type.split('.').pop() ?? fallback;
    }
    return 'Collection';
  }
  if (isPlainObject(value) && typeof value.$type === 'string') {
    return value.$type.split('.').pop() ?? fallback;
  }
  return fallback;
}

function newDataStructureResults(current?: TraceState, previous?: TraceState): React.ReactNode[] {
  if (!current) return [];

  const beforeNames = new Set([
    ...Object.keys(previous?.arrays ?? {}),
    ...Object.keys(previous?.dataStructures ?? {})
  ]);

  const currentEntries = [
    ...Object.entries(current.arrays ?? {}).map(([name, value]) => [name, value, 'Array'] as const),
    ...Object.entries(current.dataStructures ?? {}).map(([name, value]) => [
      name,
      value,
      structureType(value, 'Data Structure')
    ] as const)
  ];

  const seen = new Set<string>();

  return currentEntries
    .filter(([name]) => {
      if (name === 'this' || beforeNames.has(name) || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map(([name, value, fallback]) => (
      <div className="yv-new-result" key={'new-ds-' + name}>
        <span className="yv-new-badge">[NEW]</span>
        <span className="yv-new-type">{structureType(value, fallback)}</span>
        <span className="yv-new-separator">—</span>
        <span className="yv-new-name">{name}</span>
      </div>
    ));
}


function DataStructureResult({
  name, operation, value, oldValue, position, showOld = oldValue !== undefined
}: {
  name: string; operation: string; value: unknown; oldValue?: unknown; position: string; showOld?: boolean;
}) {
  return (
    <div className="yv-ds-result">
      <span className="yv-ds-result-name">{name}</span>
      <span className="yv-ds-result-arrow">→</span>
      <span className="yv-ds-result-operation">[{operation}]</span>
      <span className="yv-ds-result-value">
        {showOld && <span className="yv-ds-result-old">{compactValue(oldValue)}</span>}
        {showOld && <span className="yv-ds-result-transition">→</span>}
        <span className={showOld ? 'yv-ds-result-new' : ''}>{compactValue(value)}</span>
      </span>
      <span className="yv-ds-result-position">[{position}]</span>
    </div>
  );
}

function sourceCall(statement: string, name: string): string | undefined {
  if (!name || name === 'this') return undefined;
  const escaped = name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  return statement.match(new RegExp('\\b' + escaped + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\('))?.[1];
}

export function collectionDelta(
  before: unknown[],
  after: unknown[]
): { added?: unknown; removed?: unknown; index?: number } | undefined {
  if (before.length === after.length) {
    for (let i = 0; i < before.length; i++) {
      if (valueChanged(before[i], after[i])) return { added: after[i], removed: before[i], index: i };
    }
    return undefined;
  }
  if (after.length === before.length + 1) {
    for (let i = 0; i < after.length; i++) {
      const matches = before.every((value, j) =>
        valueChanged(value, after[j + (j >= i ? 1 : 0)]) === false
      );
      if (matches) return { added: after[i], index: i };
    }
  }
  if (before.length === after.length + 1) {
    for (let i = 0; i < before.length; i++) {
      const matches = after.every((value, j) =>
        valueChanged(value, before[j + (j >= i ? 1 : 0)]) === false
      );
      if (matches) return { removed: before[i], index: i };
    }
  }
  return undefined;
}

export function unorderedCollectionDelta(
  before: unknown[],
  after: unknown[]
): { added?: unknown; removed?: unknown } | undefined {
  const remaining = before.map(value => ({ key: stableStringify(value), value }));
  const added: unknown[] = [];
  for (const value of after) {
    const key = stableStringify(value);
    const index = remaining.findIndex(entry => entry.key === key);
    if (index >= 0) remaining.splice(index, 1);
    else added.push(value);
  }
  const removed = remaining.map(entry => entry.value);
  if (added.length === 1 && removed.length === 0) return { added: added[0] };
  if (removed.length === 1 && added.length === 0) return { removed: removed[0] };
  return undefined;
}

function sourceCallArgs(statement: string, name: string): string[] {
  if (!name || name === 'this') return [];
  const escaped = name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const match = statement.match(
    new RegExp('\\b' + escaped + '\\s*\\.\\s*[A-Za-z_$][\\w$]*\\s*\\((.*)\\)')
  );
  if (!match?.[1]?.trim()) return [];
  return match[1].split(',').map(part => part.trim()).filter(Boolean);
}

export function collectionOperation(kind: string, method: string | undefined, delta: {added?: unknown; removed?: unknown; index?: number}, argCount = 0) {
  if (!method) return undefined;
  const m = method.toLowerCase();

  if (kind === 'stack') {
    if (['push','add','addlast','offer','offerlast'].includes(m)) return {operation:'Push',value:delta.added,position:'Top'};
    if (['pop','remove','removelast','poll','polllast'].includes(m)) return {operation:'Pop',value:delta.removed,position:'Top'};
  }
  if (kind === 'queue') {
    if (['add','offer','enqueue'].includes(m)) return {operation:'Enqueue',value:delta.added,position:'Rear'};
    if (['remove','poll','dequeue'].includes(m)) return {operation:'Dequeue',value:delta.removed,position:'Front'};
  }
  if (kind === 'deque') {
    if (['addfirst','offerfirst','push'].includes(m)) return {operation:m === 'push' ? 'Push' : 'addFirst',value:delta.added,position:'Front'};
    if (['addlast','offerlast','add','offer'].includes(m)) return {operation:'addLast',value:delta.added,position:'Back'};
    if (['removefirst','pollfirst','remove','poll','pop'].includes(m)) return {operation:m === 'pop' ? 'Pop' : 'removeFirst',value:delta.removed,position:'Front'};
    if (['removelast','polllast'].includes(m)) return {operation:'removeLast',value:delta.removed,position:'Back'};
  }
  if (kind === 'priorityQueue') {
    if (['add','offer'].includes(m)) return {operation:'Offer',value:delta.added,position:'Queue'};
    if (['poll','remove'].includes(m)) return {operation:'Poll',value:delta.removed,position:'Priority'};
  }
  if (kind === 'list') {
    if (m === 'add') return argCount >= 2
      ? {operation:'Insert',value:delta.added,position:'Index: ' + (delta.index ?? '?')}
      : {operation:'Add',value:delta.added,position:'End'};
    if (['addlast','offer'].includes(m)) return {operation:'Add',value:delta.added,position:'End'};
    if (['remove','removelast','poll'].includes(m)) return {operation:'Remove',value:delta.removed,position:typeof delta.index === 'number' ? 'Index: ' + delta.index : 'End'};
    if (m === 'set') return {operation:'Set',value:delta.added,oldValue:delta.removed,position:'Index: ' + (delta.index ?? '?'),showOld:true};
  }
  if (kind === 'set') {
    if (m === 'add') return {operation:'Add',value:delta.added,position:'Element'};
    if (m === 'remove') return {operation:'Remove',value:delta.removed,position:'Element'};
  }
  return undefined;
}


function asArraySnapshot(
  value: unknown
): Obj & { $arrayId: string; values: unknown[] } | undefined {
  return isArraySnapshot(value) ? value : undefined;
}

function asMapSnapshot(
  value: unknown
): Obj & {
  $mapId: string;
  entries: Array<{ key: unknown; value: unknown }>;
} | undefined {
  return isMapSnapshot(value) ? value : undefined;
}

export function compareArrayValues(
  before: unknown[],
  after: unknown[],
  path: number[],
  changes: Array<{ indices: number[]; before: unknown; after: unknown }>
): void {
  const length = Math.max(before.length, after.length);

  for (let i = 0; i < length; i++) {
    const beforeValue = before[i];
    const afterValue = after[i];

    const beforeNested = asArraySnapshot(beforeValue);
    const afterNested = asArraySnapshot(afterValue);

    if (
      beforeNested &&
      afterNested &&
      beforeNested.$arrayId === afterNested.$arrayId
    ) {
      compareArrayValues(
        beforeNested.values,
        afterNested.values,
        [...path, i],
        changes
      );
      continue;
    }

    if (!valueChanged(beforeValue, afterValue)) continue;

    changes.push({
      indices: [...path, i],
      before: beforeValue,
      after: afterValue
    });
  }
}

export function compareMapEntries(
  before: Array<{ key: unknown; value: unknown }>,
  after: Array<{ key: unknown; value: unknown }>
): Array<{
  kind: 'insert' | 'update' | 'delete';
  key: unknown;
  before?: unknown;
  after?: unknown;
}> {
  const changes: Array<{
    kind: 'insert' | 'update' | 'delete';
    key: unknown;
    before?: unknown;
    after?: unknown;
  }> = [];

  const beforeMap = new Map<string, { key: unknown; value: unknown }>();
  const afterMap = new Map<string, { key: unknown; value: unknown }>();

  for (const entry of before) {
    beforeMap.set(stableStringify(entry.key), entry);
  }

  for (const entry of after) {
    afterMap.set(stableStringify(entry.key), entry);
  }

  for (const [key, entry] of afterMap) {
    const previous = beforeMap.get(key);

    if (!previous) {
      changes.push({
        kind: 'insert',
        key: entry.key,
        after: entry.value
      });
      continue;
    }

    if (valueChanged(previous.value, entry.value)) {
      changes.push({
        kind: 'update',
        key: entry.key,
        before: previous.value,
        after: entry.value
      });
    }
  }

  for (const [key, entry] of beforeMap) {
    if (!afterMap.has(key)) {
      changes.push({
        kind: 'delete',
        key: entry.key,
        before: entry.value
      });
    }
  }

  return changes;
}

export function dataStructureResults(current?: TraceState, previous?: TraceState, statement = ''): React.ReactNode[] {
  if (!current) return [];
  const rows: React.ReactNode[] = [];
  const seen = new Set<string>();
  const add = (key:string,name:string,operation:string,value:unknown,position:string,oldValue?:unknown,showOld=oldValue!==undefined) => {
    if (seen.has(key) || name === 'this' || value === undefined) return;
    seen.add(key);
    rows.push(<DataStructureResult key={key} name={name} operation={operation} value={value} oldValue={oldValue} position={position} showOld={showOld}/>);
  };

  const before = {
    ...(previous?.arrays ?? {}),
    ...(previous?.dataStructures ?? {})
  };
  const after = {
    ...(current.arrays ?? {}),
    ...(current.dataStructures ?? {})
  };

  for (const [name,value] of Object.entries(after)) {
    if (name === 'this') continue;
    const oldValue = before[name];

    const bm = asMapSnapshot(oldValue), am = asMapSnapshot(value);
    if (bm && am && bm.$mapId === am.$mapId) {
      for (const change of compareMapEntries(bm.entries,am.entries)) {
        const key=compactValue(change.key);
        if(change.kind==='insert') add('map-i-'+name+'-'+key,name,'Put',change.after,'Key: '+key,undefined,true);
        else if(change.kind==='update') add('map-u-'+name+'-'+key,name,'Update',change.after,'Key: '+key,change.before,true);
        else add('map-r-'+name+'-'+key,name,'Remove',change.before,'Key: '+key);
      }
      continue;
    }

    const bc=isCollectionSnapshot(oldValue)?oldValue:undefined;
    const ac=isCollectionSnapshot(value)?value:undefined;
    if(bc && ac && bc.$collectionId===ac.$collectionId){
      const method=sourceCall(statement,name);
      const args=sourceCallArgs(statement,name);
      let delta=collectionDelta(bc.values,ac.values);
      if (!delta && ac.$kind === 'priorityQueue') delta=unorderedCollectionDelta(bc.values,ac.values);
      const op=delta ? collectionOperation(ac.$kind ?? '',method,delta,args.length) : undefined;
      if(delta && op) add('col-'+name+'-'+stableStringify([delta.added,delta.removed,delta.index]),name,op.operation,op.value,op.position,op.oldValue,op.showOld);
      continue;
    }

    const ba=asArraySnapshot(oldValue), aa=asArraySnapshot(value);
    if(ba && aa && ba.$arrayId===aa.$arrayId){
      const changes:Array<{indices:number[];before:unknown;after:unknown}>=[];
      compareArrayValues(ba.values,aa.values,[],changes);
      for(const change of changes) add('arr-'+name+'-'+JSON.stringify(change.indices),name,'Set',change.after,'Index: '+change.indices.join('.'),change.before,change.before===undefined);
    }
  }

  const data=isPlainObject(current.lastEvent?.data)?current.lastEvent.data:{};
  const events=Array.isArray(data.executionEvents)?data.executionEvents:[];
  for(const event of events){
    if(!isPlainObject(event)||!isPlainObject(event.data)) continue;
    const d=event.data;
    if(event.type==='MAP_WRITE'){
      const name=typeof d.name==='string'?d.name:'map';
      const changes=Array.isArray(d.changes)?d.changes:[];
      for(const change of changes){
        if(!isPlainObject(change)) continue;
        const key=compactValue(change.key);
        if(change.kind==='insert') add('map-i-' + name + '-' + key,name,'Put',change.after,'Key: '+key,undefined,true);
        else if(change.kind==='update') add('map-u-' + name + '-' + key,name,'Update',change.after,'Key: '+key,change.before,true);
        else if(change.kind==='delete') add('map-r-' + name + '-' + key,name,'Remove',change.before,'Key: '+key);
      }
    } else if(event.type==='ARRAY_WRITE'){
      const name=typeof d.name==='string'?d.name:'array';
      const changes=Array.isArray(d.changes)?d.changes:[];
      for(const change of changes){
        if(!isPlainObject(change)) continue;
        const indices=Array.isArray(change.indices)?change.indices:[];
        add('arr-' + name + '-' + JSON.stringify(indices),name,'Set',change.after,'Index: '+indices.join('.'),change.before,change.before===undefined);
      }
    }
  }
  return rows;
}

export function isForLoopUpdateStep(statement: string, state?: TraceState, previous?: TraceState): boolean {
  const trimmed = statement.trim();
  if (!/^for\s*\(/.test(trimmed)) return false;

  const data = isPlainObject(state?.lastEvent?.data) ? state.lastEvent.data : undefined;
  const previousData = isPlainObject(previous?.lastEvent?.data) ? previous.lastEvent.data : undefined;
  const rawVariables = isPlainObject(data?.variables) ? data.variables : {};
  const rawPreviousVariables = isPlainObject(previousData?.variables) ? previousData.variables : {};

  const openIndex = trimmed.indexOf('(');
  let depth = 0, quote = '', escaped = false, inside: string | undefined;
  for (let i = openIndex; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) { inside = trimmed.slice(openIndex + 1, i); break; }
    }
  }
  if (inside === undefined) return false;

  const parts: string[] = [];
  let start = 0; depth = 0; quote = ''; escaped = false;
  for (let i = 0; i < inside.length; i++) {
    const ch = inside[i]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) {
      parts.push(inside.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(inside.slice(start).trim());
  if (parts.length !== 3) return false;

  const updateNames = [...parts[2].matchAll(/\b[A-Za-z_$][\w$]*\b/g)]
    .map(m => m[0])
    .filter(name => name in rawVariables || name in rawPreviousVariables);
  if (!updateNames.length) return false;

  const events = Array.isArray(data?.executionEvents) ? data.executionEvents : [];
  return events.some(event => {
    const d = isPlainObject(event.data) ? event.data : undefined;
    const name = typeof d?.name === 'string' ? d.name : undefined;
    return isPlainObject(event) && event.type === 'VARIABLE_UPDATE' &&
      !!name && updateNames.includes(name) &&
      ('before' in (d ?? {}) || name in rawPreviousVariables);
  });
}

function ExecutionInspector({ state, previous, statement, index, total }: { state?: TraceState; previous?: TraceState; statement: string; index: number; total: number }) {
  const substatement = executionSubstatement(statement, state, previous);
  const variableResults = variableResultChanges(state, previous);
  const dataStructureResultRows = dataStructureResults(state, previous, statement);
  const newStructureResults = newDataStructureResults(state, previous);
  const condition = isForLoopUpdateStep(statement, state, previous) || dataStructureResultRows.length > 0 || variableResults.length > 0 || newStructureResults.length > 0 ? undefined : executionCondition(state);
  const effects = eventEffects(state)
    .filter((effect, i, all) => all.findIndex((x) => x.text === effect.text) === i);
  const showEffects = dataStructureResultRows.length === 0;


  return (
    <div className="yv-execution">
      <div className="yv-execution-top">
        <div className="yv-execution-label">EXECUTED</div>
        <div className="yv-execution-step">{total ? (index + 1) + ' / ' + total : '—'}</div>
        <button
          className="yv-btn"
          type="button"
          tabIndex={-1}
          onMouseDown={e => e.preventDefault()}
          onClick={async () => {
            const trace = buildDebugTrace(sessionStore.get().states, sessionStore.get().source);
            try {
              await navigator.clipboard.writeText(trace);
            } catch {
              const textarea = document.createElement('textarea');
              textarea.value = trace;
              textarea.style.position = 'fixed';
              textarea.style.opacity = '0';
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              textarea.remove();
            }
          }}
        >
          Copy Debug Trace
        </button>
      </div>

      <div className="yv-execution-code">{substatement || 'Select a testcase and press Visualize.'}</div>

      <div className="yv-execution-result-label">EXECUTION RESULT</div>
      <div className="yv-execution-result" aria-label="Execution result">
          {condition !== undefined ? (
            <span className={'yv-condition ' + (condition ? 'true' : 'false')}>
              {condition ? 'TRUE' : 'FALSE'}
            </span>
          ) : dataStructureResultRows.length > 0 || variableResults.length > 0 || newStructureResults.length > 0 ? (
            <div className="yv-result-list">
              {dataStructureResultRows}
              {variableResults}
              {newStructureResults}
            </div>
          ) : effects.length > 0 ? (
            <div className="yv-result-list">
              {effects.slice(0, 3).map((effect, i) => (
                <div className={'yv-result ' + (effect.kind ?? 'change')} key={effect.text + '-' + i}>
                  {effect.text}
                </div>
              ))}
              {effects.length > 3 && <div className="yv-result-more">+{effects.length - 3} more</div>}
            </div>
          ) : (
            <span className="yv-result-empty">—</span>
          )}
        </div>

      {showEffects && effects.length > 3 && (
        <div className="yv-effects" aria-label="Additional execution effects">
          {effects.slice(3, 6).map((effect, i) => (
            <div className={'yv-effect ' + (effect.kind ?? 'change')} key={effect.text + '-' + i}>
              {effect.text}
            </div>
          ))}
          {effects.length > 6 && <div className="yv-effect-more">+{effects.length - 6} more</div>}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open,setOpen]=useState(true);
  return <div className="yv-section"><button className="yv-section-head" onClick={()=>setOpen(x=>!x)}><span>{open?'▾':'▸'} {title}</span>{typeof count==='number'&&<span className="yv-count">{count}</span>}</button>{open&&<div className="yv-section-body">{children}</div>}</div>;
}

function isArraySnapshot(
    value: unknown
): value is Obj & {
    $arrayId: string;
    $type?: string;
    values: unknown[];
    length?: number;
} {
    return (
        isPlainObject(value) &&
        typeof value.$arrayId === 'string' &&
        Array.isArray(value.values)
    );
}

function isMapSnapshot(value: unknown): value is Obj & {
  $mapId: string;
  $type?: string;
  entries: Array<{ key: unknown; value: unknown }>;
} {
  return (
    isPlainObject(value) &&
    typeof value.$mapId === 'string' &&
    Array.isArray(value.entries)
  );
}


function isCollectionSnapshot(value: unknown): value is Obj & {
  $collectionId: string;
  $type?: string;
  $kind?: string;
  values: unknown[];
  size?: number;
} {
  return (
    isPlainObject(value) &&
    typeof value.$collectionId === 'string' &&
    Array.isArray(value.values)
  );
}

function CollectionBackingArray({
  value,
  state,
  source,
  name,
  depth,
  seen
}: {
  value: { values: unknown[] };
  state?: TraceState;
  source: string;
  name?: string;
  depth: number;
  seen: Set<string>;
}) {
  return (
    <div className="yv-collection-backing">
      <div className="yv-code yv-collection-backing-title">Array view · snapshot order</div>
      <ArrayView value={value.values} state={state} source={source} arrayName={name} depth={depth} seen={seen}/>
    </div>
  );
}

function CollectionView({
  value,
  state,
  source,
  name,
  depth = 0,
  seen = new Set<string>()
}: {
  value: Obj & {
    $collectionId: string;
    $type?: string;
    $kind?: string;
    values: unknown[];
    size?: number;
  };
  state?: TraceState;
  source: string;
  name?: string;
  depth?: number;
  seen?: Set<string>;
}) {
  const type =
    typeof value.$type === 'string'
      ? value.$type.split('.').pop() ?? 'Collection'
      : 'Collection';

  const kind =
    typeof value.$kind === 'string'
      ? value.$kind
      : 'collection';

  const itemCount = value.size ?? value.values.length;

  if (kind === 'stack') {
    return (
      <div className="yv-collection">
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>TOP · {itemCount} items</span>
        </div>
        <div className="yv-stack-view">
          {[...value.values].reverse().map((item, index) => (
            <div className="yv-stack-cell" key={index}>
              <span className="yv-stack-position">{index === 0 ? 'TOP' : ''}</span>
              <DataValue value={item} state={state} source={source} depth={depth + 1} seen={seen}/>
            </div>
          ))}
          {!value.values.length && <div className="yv-empty">Empty stack</div>}
        </div>
        <CollectionBackingArray value={value} state={state} source={source} name={name} depth={depth} seen={seen}/>
      </div>
    );
  }

  if (kind === 'queue' || kind === 'deque') {
    return (
      <div className="yv-collection">
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>{kind === 'deque' ? 'FRONT ↔ REAR' : 'FRONT → REAR'} · {itemCount} items</span>
        </div>
        <div className="yv-queue-view">
          <div className="yv-queue-end">FRONT</div>
          {value.values.map((item, index) => (
            <div className="yv-queue-cell" key={index}>
              <DataValue value={item} state={state} source={source} depth={depth + 1} seen={seen}/>
            </div>
          ))}
          <div className="yv-queue-end">REAR</div>
          {!value.values.length && <div className="yv-empty">Empty queue</div>}
        </div>
        <CollectionBackingArray value={value} state={state} source={source} name={name} depth={depth} seen={seen}/>
      </div>
    );
  }

  if (kind === 'set') {
    return (
      <div className="yv-collection">
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>UNORDERED · {itemCount} elements</span>
        </div>
        <div className="yv-set-view">
          {value.values.map((item, index) => (
            <div className="yv-set-element" key={index}>
              <DataValue value={item} state={state} source={source} depth={depth + 1} seen={seen}/>
            </div>
          ))}
          {!value.values.length && <div className="yv-empty">Empty set</div>}
        </div>
        <CollectionBackingArray value={value} state={state} source={source} name={name} depth={depth} seen={seen}/>
      </div>
    );
  }

  if (kind === 'priorityQueue') {
    return (
      <div className="yv-collection">
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>MIN-HEAP · {itemCount} items</span>
        </div>
        <div className="yv-heap-tree">
          {(() => {
            const levels: unknown[][] = [];
            value.values.forEach((item, index) => {
              const level = Math.floor(Math.log2(index + 1));
              (levels[level] ??= []).push(item);
            });
            return levels.map((items, level) => (
              <div className="yv-heap-level" key={level}>
                {items.map((item, index) => (
                  <div className="yv-heap-node-wrap" key={`${level}-${index}`}>
                    <div className="yv-heap-node"><DataValue value={item} state={state} source={source} depth={depth + 1} seen={seen}/></div>
                    <div className="yv-cell-index">[{(2 ** level) - 1 + index}]</div>
                  </div>
                ))}
              </div>
            ));
          })()}
        </div>
        <div className="yv-code yv-heap-note">Heap tree · root is index 0</div>
        <CollectionBackingArray value={value} state={state} source={source} name={name} depth={depth} seen={seen}/>
      </div>
    );
  }

  return (
    <div className="yv-collection">
      <div className="yv-collection-meta">
        <span>{type}</span>
        <span>{kind} · {itemCount} items</span>
      </div>
      <CollectionBackingArray value={value} state={state} source={source} name={name} depth={depth} seen={seen}/>
    </div>
  );
}

function variableSummary(value: unknown): string {
  if (isArraySnapshot(value)) {
    const type =
      typeof value.$type === 'string'
        ? value.$type.split('.').pop() ?? 'Array'
        : 'Array';

    return `${type} · ${value.values.length} elements`;
  }

  if (isMapSnapshot(value)) {
    const type =
      typeof value.$type === 'string'
        ? value.$type.split('.').pop() ?? 'Map'
        : 'Map';

    return `${type} · ${value.entries.length} entries`;
  }

  if (isPlainObject(value)) {
    const type =
      typeof value.$type === 'string'
        ? value.$type.split('.').pop() ?? 'Object'
        : 'Object';

    return type;
  }

  return displayValue(value);
}

function Variables({ state, previous }: { state?: TraceState; previous?: TraceState }) {
  const entries = Object.entries(state?.variables ?? {})
    .filter(([name, value]) => name !== 'this' && !isStructuralObject(value));
  if (!entries.length) return <div className="yv-empty">No local variables yet.</div>;

  return (
    <div className="yv-vars">
      {entries.map(([name, value]) => {
        const old = previous?.variables?.[name];
        const initialized = !(name in (previous?.variables ?? {}));
        const changed =
          Boolean(previous) &&
          stableStringify(old) !== stableStringify(value);

        return (
          <div className={`yv-var ${changed ? 'changed' : ''}`} key={name}>
            <div className="yv-var-name">{name}</div>
            <div className="yv-change">
              {changed && (
                <>
                  <span className="yv-old yv-code">
                    {initialized ? 'undefined' : variableSummary(old)}
                  </span>
                  <span className="yv-arrow">→</span>
                </>
              )}
              <span className="yv-code">{variableSummary(value)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function arrayIndexVariableNames(source: string, arrayName?: string): Set<string> {
  const names = new Set<string>();
  if (!arrayName) return names;
  const pattern = new RegExp(arrayName + '\\s*\\[([^\\]]+)\\]', 'g');
  for (const match of source.matchAll(pattern)) {
    for (const identifier of match[1].matchAll(/\b[A-Za-z_$][\w$]*\b/g)) names.add(identifier[0]);
  }
  return names;
}

export function pointerTargets(
  state: TraceState | undefined,
  length: number,
  indexNames: Set<string>
): Array<{ name: string; index: number }> {
  const targets: Array<{ name: string; index: number }> = [];
  for (const [name, value] of Object.entries(state?.variables ?? {})) {
    if (!indexNames.has(name)) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= length) continue;
    targets.push({ name, index: value });
  }
  return targets;
}

function matrixIndexVariableNames(source: string, arrayName?: string): { rows: Set<string>; columns: Set<string> } {
  const rows = new Set<string>();
  const columns = new Set<string>();
  if (!arrayName) return { rows, columns };
  const escaped = arrayName.replace(/[.*+?^${}()|[\]\\]/g, '\\function accessedArrayIndices(state: TraceState | undefined, arrayName?: string): Set<number> {');
  const pattern = new RegExp('\\b' + escaped + '\\s*\\[([^\\]]+)\\]\\s*\\[([^\\]]+)\\]', 'g');
  for (const match of source.matchAll(pattern)) {
    const rowExpr = match[1] ?? '';
    const colExpr = match[2] ?? '';
    for (const id of rowExpr.matchAll(/\\b[A-Za-z_$][\\w$]*\\b/g)) rows.add(id[0]);
    for (const id of colExpr.matchAll(/\\b[A-Za-z_$][\\w$]*\\b/g)) columns.add(id[0]);
  }
  return { rows, columns };
}

function matrixPointerTargets(
  state: TraceState | undefined,
  rowCount: number,
  columnCount: number,
  names: { rows: Set<string>; columns: Set<string> }
): { rows: Array<{ name: string; index: number }>; columns: Array<{ name: string; index: number }> } {
  const rows: Array<{ name: string; index: number }> = [];
  const columns: Array<{ name: string; index: number }> = [];
  for (const [name, value] of Object.entries(state?.variables ?? {})) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) continue;
    if (names.rows.has(name) && value < rowCount) rows.push({ name, index: value });
    if (names.columns.has(name) && value < columnCount) columns.push({ name, index: value });
  }
  return { rows, columns };
}

function accessedArrayIndices(state: TraceState | undefined, arrayName?: string): Set<number> {
  const set = new Set<number>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data) || !Array.isArray(data.executionEvents)) return set;
  for (const event of data.executionEvents) {
    if (!isPlainObject(event) || event.type !== 'ARRAY_ACCESS' || !isPlainObject(event.data)) continue;
    if (arrayName && event.data.name !== arrayName) continue;
    if (!Array.isArray(event.data.indices)) continue;
    const index = event.data.indices[0];
    if (typeof index === 'number') set.add(index);
  }
  return set;
}

function accessedArrayPaths(state: TraceState | undefined, arrayName?: string): Set<string> {
  const paths = new Set<string>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data) || !Array.isArray(data.executionEvents)) return paths;
  for (const event of data.executionEvents) {
    if (!isPlainObject(event) || event.type !== 'ARRAY_ACCESS' || !isPlainObject(event.data)) continue;
    if (arrayName && event.data.name !== arrayName) continue;
    if (!Array.isArray(event.data.indices) || !event.data.indices.every((x) => typeof x === 'number')) continue;
    paths.add((event.data.indices as number[]).join(','));
  }
  return paths;
}

function changedArrayIndices(state?: TraceState, arrayName?: string): Set<number> {
  const set = new Set<number>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return set;

  const collect = (changes: unknown, eventArrayName?: unknown) => {
    if (arrayName && typeof eventArrayName === 'string' && eventArrayName !== arrayName) return;
    if (!Array.isArray(changes)) return;
    for (const change of changes) {
      if (!isPlainObject(change) || !Array.isArray(change.indices)) continue;
      const i = change.indices[0];
      if (typeof i === 'number' && Number.isInteger(i) && i >= 0) set.add(i);
    }
  };

  if (state?.lastEvent?.type === 'ARRAY_WRITE') collect(data.changes, data.name);
  if (Array.isArray(data.executionEvents)) {
    for (const event of data.executionEvents) {
      if (!isPlainObject(event) || event.type !== 'ARRAY_WRITE' || !isPlainObject(event.data)) continue;
      collect(event.data.changes, event.data.name);
    }
  }

  return set;
}

function changedArrayPaths(state?: TraceState, arrayName?: string): Set<string> {
  const paths = new Set<string>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return paths;

  const collect = (changes: unknown, eventArrayName?: unknown) => {
    if (arrayName && typeof eventArrayName === 'string' && eventArrayName !== arrayName) return;
    if (!Array.isArray(changes)) return;
    for (const change of changes) {
      if (!isPlainObject(change) || !Array.isArray(change.indices) ||
          !change.indices.every(index => typeof index === 'number' && Number.isInteger(index))) continue;
      paths.add((change.indices as number[]).join(','));
    }
  };

  if (state?.lastEvent?.type === 'ARRAY_WRITE') collect(data.changes, data.name);
  if (Array.isArray(data.executionEvents)) {
    for (const event of data.executionEvents) {
      if (isPlainObject(event) && event.type === 'ARRAY_WRITE' && isPlainObject(event.data)) {
        collect(event.data.changes, event.data.name);
      }
    }
  }
  return paths;
}

function swappedArrayIndices(state?: TraceState, arrayName?: string): Set<number> {
  const indices = new Set<number>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return indices;

  const inspectWrite = (writeData: Obj) => {
    if (arrayName && typeof writeData.name === 'string' && writeData.name !== arrayName) return;
    if (!Array.isArray(writeData.changes)) return;
    const changes = writeData.changes.filter((change): change is Obj =>
      isPlainObject(change) &&
      Array.isArray(change.indices) &&
      change.indices.length === 1 &&
      typeof change.indices[0] === 'number' &&
      Number.isInteger(change.indices[0])
    );
    if (changes.length !== 2) return;

    const [first, second] = changes;
    if (!first || !second) return;
    const firstIndex = (first.indices as number[])[0]!;
    const secondIndex = (second.indices as number[])[0]!;
    if (firstIndex === secondIndex) return;
    if (
      !valueChanged(first.before, first.after) ||
      !valueChanged(second.before, second.after) ||
      valueChanged(first.before, second.after) ||
      valueChanged(first.after, second.before)
    ) return;

    indices.add(firstIndex);
    indices.add(secondIndex);
  };

  if (state?.lastEvent?.type === 'ARRAY_WRITE') inspectWrite(data);
  if (Array.isArray(data.executionEvents)) {
    for (const event of data.executionEvents) {
      if (isPlainObject(event) && event.type === 'ARRAY_WRITE' && isPlainObject(event.data)) {
        inspectWrite(event.data);
      }
    }
  }
  return indices;
}

function shiftedArrayIndices(state?: TraceState, arrayName?: string): Map<number, 'left' | 'right'> {
  const directions = new Map<number, 'left' | 'right'>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return directions;

  const inspectWrite = (writeData: Obj) => {
    if (arrayName && typeof writeData.name === 'string' && writeData.name !== arrayName) return;
    if (!Array.isArray(writeData.changes)) return;
    const changes = writeData.changes.filter((change): change is Obj =>
      isPlainObject(change) &&
      Array.isArray(change.indices) &&
      change.indices.length === 1 &&
      typeof change.indices[0] === 'number' &&
      Number.isInteger(change.indices[0]) &&
      'before' in change &&
      'after' in change
    ).map(change => ({
      index: (change.indices as number[])[0]!,
      before: change.before,
      after: change.after
    })).sort((a, b) => a.index - b.index);

    // A two-cell exchange matches both directions and is handled by the
    // swap animation; a one-direction neighbor match indicates a shift.
    if (changes.length < 2) return;
    for (let i = 1; i < changes.length; i++) {
      if (changes[i]!.index !== changes[i - 1]!.index + 1) return;
    }

    // Compare destination values to the neighboring cell's previous value.
    const rightMatches = changes.slice(1).every((change, i) =>
      !valueChanged(change.after, changes[i]!.before)
    );
    const leftMatches = changes.slice(0, -1).every((change, i) =>
      !valueChanged(change.after, changes[i + 1]!.before)
    );

    if (rightMatches && !leftMatches) {
      for (const change of changes) directions.set(change.index, 'right');
    } else if (leftMatches && !rightMatches) {
      for (const change of changes) directions.set(change.index, 'left');
    }
  };

  if (state?.lastEvent?.type === 'ARRAY_WRITE') inspectWrite(data);
  if (Array.isArray(data.executionEvents)) {
    for (const event of data.executionEvents) {
      if (isPlainObject(event) && event.type === 'ARRAY_WRITE' && isPlainObject(event.data)) {
        inspectWrite(event.data);
      }
    }
  }
  return directions;
}

function ArrayView({ value, state, source, arrayName, depth = 0, seen = new Set<string>() }: { value: unknown[]; state?: TraceState; source?: string; arrayName?: string; depth?: number; seen?: Set<string> }) {
  const arrayRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Array<HTMLDivElement | null>>([]);
  const indexNames = arrayIndexVariableNames(source ?? '', arrayName);
  const targets = pointerTargets(state, value.length, indexNames);
  const targetSignature = targets.map(({ name, index }) => name + ':' + index).sort().join('|');
  const previousIndices = useRef<Map<string, number>>(new Map());
  const [pointerLayout, setPointerLayout] = useState<{ offsets: Record<string, number>; moving: Set<string> }>({
    offsets: {},
    moving: new Set<string>()
  });

  useLayoutEffect(() => {
    const host = arrayRef.current;
    if (!host) return;

    const cellCenters: Record<string, number> = {};
    const moving = new Set<string>();
    const nextIndices = new Map<string, number>();
    const targetsByIndex = new Map<number, typeof targets>();

    for (const target of targets) {
      const cell = cellRefs.current[target.index];
      if (!cell) continue;
      cellCenters[target.name] = cell.offsetLeft + cell.offsetWidth / 2;
      const previousIndex = previousIndices.current.get(target.name);
      if (previousIndex !== undefined && previousIndex !== target.index) moving.add(target.name);
      nextIndices.set(target.name, target.index);
      const peers = targetsByIndex.get(target.index) ?? [];
      peers.push(target);
      targetsByIndex.set(target.index, peers);
    }

    const offsets: Record<string, number> = {};
    for (const target of targets) {
      const peers = targetsByIndex.get(target.index) ?? [target];
      const widths = peers.map(peer => Math.max(1, peer.name.length) * 6.2 + 10);
      const peerIndex = peers.findIndex(peer => peer.name === target.name);
      const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, peers.length - 1) * 3;
      const precedingWidth = widths.slice(0, peerIndex).reduce((sum, width) => sum + width + 3, 0);
      const centeredOffset = precedingWidth + widths[peerIndex]! / 2 - totalWidth / 2;
      offsets[target.name] = (cellCenters[target.name] ?? 0) + centeredOffset;
    }

    previousIndices.current = nextIndices;
    setPointerLayout({ offsets, moving });
  }, [targetSignature, state?.sequence, value.length]);

  if (value.length > 0 && value.every(Array.isArray)) {
    const rows = value as unknown[][];
    const rowCount = rows.length;
    const columnCount = Math.max(0, ...rows.map(row => row.length));
    const readPaths = accessedArrayPaths(state, arrayName);
    const writtenPaths = changedArrayPaths(state, arrayName);
    const indexNames = matrixIndexVariableNames(source ?? '', arrayName);
    const targets = matrixPointerTargets(state, rowCount, columnCount, indexNames);
    const targetSignature = [
      ...targets.rows.map(target => 'r:' + target.name + ':' + target.index),
      ...targets.columns.map(target => 'c:' + target.name + ':' + target.index)
    ].sort().join('|');
    const matrixRef = useRef<HTMLDivElement | null>(null);
    const matrixCellRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const previousMatrixTargets = useRef<Map<string, number>>(new Map());
    const [matrixPointerLayout, setMatrixPointerLayout] = useState<{
      x: Record<string, number>;
      y: Record<string, number>;
      movingRows: Set<string>;
      movingColumns: Set<string>;
    }>({ x: {}, y: {}, movingRows: new Set(), movingColumns: new Set() });

    useLayoutEffect(() => {
      const host = matrixRef.current;
      if (!host) return;
      const x: Record<string, number> = {};
      const y: Record<string, number> = {};
      const movingRows = new Set<string>();
      const movingColumns = new Set<string>();
      const next = new Map<string, number>();

      for (const target of targets.columns) {
        const cell = matrixCellRefs.current[target.index + ',0'];
        const colCell = matrixCellRefs.current['__col,' + target.index];
        const measured = colCell ?? cell;
        if (!measured) continue;
        x[target.name] = measured.offsetLeft + measured.offsetWidth / 2;
        const key = 'c:' + target.name;
        const previous = previousMatrixTargets.current.get(key);
        if (previous !== undefined && previous !== target.index) movingColumns.add(target.name);
        next.set(key, target.index);
      }
      for (const target of targets.rows) {
        const cell = matrixCellRefs.current[target.index + ',0'];
        if (!cell) continue;
        y[target.name] = cell.offsetTop + cell.offsetHeight / 2;
        const key = 'r:' + target.name;
        const previous = previousMatrixTargets.current.get(key);
        if (previous !== undefined && previous !== target.index) movingRows.add(target.name);
        next.set(key, target.index);
      }
      previousMatrixTargets.current = next;
      setMatrixPointerLayout({ x, y, movingRows, movingColumns });
    }, [targetSignature, state?.sequence, rowCount, columnCount]);

    return (
      <div
        className="yv-matrix yv-matrix-grid"
        ref={matrixRef}
        style={{ gridTemplateColumns: `38px repeat(${columnCount}, minmax(36px, max-content))` }}
      >
        <div className="yv-matrix-corner" />
        {Array.from({ length: columnCount }, (_, column) => (
          <div
            className="yv-matrix-column-index"
            key={'column-' + column}
            ref={element => { matrixCellRefs.current['__col,' + column] = element; }}
          >{column}</div>
        ))}
        {rows.map((row, r) => (
          <React.Fragment key={'row-' + r}>
            <div className="yv-matrix-row-index">{r}</div>
            {Array.from({ length: columnCount }, (_, column) => {
              const path = r + ',' + column;
              const exists = column < row.length;
              return (
                <div className={`yv-matrix-cell ${exists ? '' : 'yv-matrix-cell-empty'}`} key={path}>
                  <div
                    ref={element => { matrixCellRefs.current[path] = element; }}
                    key={`${path}-${state?.sequence ?? state?.line ?? 'initial'}`}
                    className={`yv-cell-value ${readPaths.has(path) ? 'yv-cell-read ' : ''}${writtenPaths.has(path) ? 'yv-cell-written' : ''}`}
                  >
                    {exists
                      ? <DataValue value={row[column]} state={state} source={source ?? ''} depth={depth + 1} seen={seen}/>
                      : <span className="yv-matrix-missing">—</span>}
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
        <div className="yv-matrix-pointer-layer" aria-hidden="true">
          {targets.columns.map(target => (
            <div
              key={'c:' + target.name}
              className={`yv-matrix-pointer yv-matrix-pointer-column ${matrixPointerLayout.movingColumns.has(target.name) ? 'is-moving' : ''}`}
              style={{ transform: `translate3d(${matrixPointerLayout.x[target.name] ?? 0}px, 0, 0) translateX(-50%)` }}
            >{target.name}</div>
          ))}
          {targets.rows.map(target => (
            <div
              key={'r:' + target.name}
              className={`yv-matrix-pointer yv-matrix-pointer-row ${matrixPointerLayout.movingRows.has(target.name) ? 'is-moving' : ''}`}
              style={{ transform: `translate3d(0, ${matrixPointerLayout.y[target.name] ?? 0}px, 0) translateY(-50%)` }}
            >{target.name}</div>
          ))}
        </div>
      </div>
    );
  }

  // Reads and writes are independent trace facts: a read gets a cool blue
  // focus, while only an ARRAY_WRITE checkpoint gets the green write pulse.
  const changed = changedArrayIndices(state, arrayName);
  const accessed = accessedArrayIndices(state, arrayName);
  const swapped = swappedArrayIndices(state, arrayName);
  const shifted = shiftedArrayIndices(state, arrayName);
  // With two or more source-grounded array indices, softly mark the active
  // interval. This works for windows and candidate ranges without naming an algorithm.
  const rangeStart = targets.length >= 2 ? Math.min(...targets.map(target => target.index)) : -1;
  const rangeEnd = targets.length >= 2 ? Math.max(...targets.map(target => target.index)) : -1;
  const pointerMarkers = targets.map(target => {
    const x = pointerLayout.offsets[target.name] ?? 0;
    return (
      <div
        key={target.name}
        className={`yv-pointer ${pointerLayout.moving.has(target.name) ? 'yv-pointer-moving' : ''}`}
        style={{ transform: `translate3d(${x}px, 0, 0) translateX(-50%)` }}
      >
        {target.name}
      </div>
    );
  });

  return (
    <div className={`yv-array yv-array-pointer-host ${targets.length ? 'has-pointers' : ''}`} ref={arrayRef}>
      <div className="yv-pointer-layer" aria-hidden="true">{pointerMarkers}</div>
      {value.map((v, i) => (
        <div className="yv-cell" key={i} ref={element => { cellRefs.current[i] = element; }}>
          <div
            key={`${i}-${state?.sequence ?? state?.line ?? 'initial'}`}
            className={`yv-cell-value ${rangeStart >= 0 && i >= rangeStart && i <= rangeEnd ? 'yv-cell-range ' : ''}${changed.has(i) ? 'yv-cell-written ' : ''}${accessed.has(i) ? 'yv-cell-read ' : ''}${swapped.has(i) ? 'yv-cell-swapped' : ''}`}
          >
            <div className={`yv-array-cell-content ${swapped.has(i) ? 'yv-array-cell-content-swapped' : ''}${shifted.has(i) ? ' yv-array-cell-content-shift-' + shifted.get(i) : ''}`}>
              <DataValue value={v} state={state} source={source ?? ''} name={arrayName} depth={depth + 1} seen={seen}/>
            </div>
          </div>
          <div className="yv-cell-index">{i}</div>
        </div>
      ))}
    </div>
  );
}

function mapChanges(state?: TraceState): Array<{
  kind: 'insert' | 'update' | 'delete';
  key: unknown;
  before?: unknown;
  after?: unknown;
}> {
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return [];

  const changes: unknown[] = [];
  if (Array.isArray(data.changes)) changes.push(...data.changes);
  if (Array.isArray(data.executionEvents)) {
    for (const event of data.executionEvents) {
      if (!isPlainObject(event) || event.type !== 'MAP_WRITE' || !isPlainObject(event.data)) continue;
      if (Array.isArray(event.data.changes)) changes.push(...event.data.changes);
    }
  }

  return changes.filter(
    (change): change is {
      kind: 'insert' | 'update' | 'delete';
      key: unknown;
      before?: unknown;
      after?: unknown;
    } =>
      isPlainObject(change) &&
      (change.kind === 'insert' ||
        change.kind === 'update' ||
        change.kind === 'delete')
  );
}

function MapView({
  value,
  state,
  source,
  depth = 0,
  seen = new Set<string>()
}: {
  value: Obj & {
    $mapId: string;
    entries: Array<{ key: unknown; value: unknown }>;
  };
  state?: TraceState;
  source: string;
  depth?: number;
  seen?: Set<string>;
}) {
  const changes = mapChanges(state);

  const findChange = (key: unknown) =>
    changes.find(
      change =>
        stableStringify(change.key) ===
        stableStringify(key)
    );

  const deleted = changes.filter(
    change => change.kind === 'delete'
  );

  return (
    <div className="yv-hashmap">
      <div className="yv-map-meta">
        <span>
          {typeof value.$type === 'string'
            ? value.$type.split('.').pop()
            : 'Map'}
        </span>
        <span>{value.entries.length} entries</span>
      </div>

      <div className="yv-map-table">
        <div className="yv-map-header">
          <div>Key</div>
          <div>Value</div>
        </div>

        {value.entries.map((entry, index) => {
          const change = findChange(entry.key);

          return (
            <div
              className={`yv-map-row ${change ? `yv-map-${change.kind}` : ''}`}
              key={stableStringify(entry.key) || index}
            >
              <div className="yv-map-key">
                <DataValue value={entry.key} state={state} source={source} depth={depth + 1} seen={seen}/>
              </div>

              <div className="yv-map-value">
                {change?.kind === 'update' ? (
                  <>
                    <span className="yv-old-value">
                      <DataValue value={change.before} state={state} source={source} depth={depth + 1} seen={seen} resolveObjects={false}/>
                    </span>
                    <span className="yv-map-arrow">→</span>
                    <DataValue value={entry.value} state={state} source={source} depth={depth + 1} seen={seen}/>
                  </>
                ) : (
                  <DataValue value={entry.value} state={state} source={source} depth={depth + 1} seen={seen}/>
                )}

                {change?.kind === 'insert' && (
                  <span className="yv-map-tag">NEW</span>
                )}
              </div>
            </div>
          );
        })}

        {deleted.map((change, index) => (
          <div
            className="yv-map-row yv-map-delete"
            key={`deleted-${stableStringify(change.key)}-${index}`}
          >
            <div className="yv-map-key">
              <DataValue value={change.key} state={state} source={source} depth={depth + 1} seen={seen}/>
            </div>
            <div className="yv-map-value">
              <span className="yv-old-value">
                <DataValue value={change.before} state={state} source={source} depth={depth + 1} seen={seen} resolveObjects={false}/>
              </span>
              <span className="yv-map-tag">REMOVED</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function objectFields(value: Obj): Obj {
  return isPlainObject(value.fields) ? value.fields : value;
}
function objectType(value: Obj): string { return typeof value.$type==='string'?value.$type:''; }
function looksListNode(value: Obj): boolean { const f=objectFields(value); return /ListNode/i.test(objectType(value)) || ('next' in f && ('val' in f || 'value' in f)); }
function looksTreeNode(value: Obj): boolean { const f=objectFields(value); return /TreeNode/i.test(objectType(value)) || (('left' in f || 'right' in f) && ('val' in f || 'value' in f)); }
function resolveRef(value: unknown, objects: Record<string,unknown>): unknown {
  if (!isPlainObject(value)) return value;
  if (typeof value.$ref==='string') return objects[value.$ref] ?? value;
  if (typeof value.$objectId==='string') return objects[value.$objectId] ?? value;
  return value;
}
function nodeValue(value: Obj): unknown { const f=objectFields(value); return f.val ?? f.value ?? f.data ?? '?'; }

function LinkedListView({
  root,
  objects,
  variables = {}
}: {
  root: Obj;
  objects: Record<string, unknown>;
  variables?: Record<string, unknown>;
}) {
  const pointerNames = new Map<string, string[]>();
  for (const [name, value] of Object.entries(variables)) {
    if (name === 'this') continue;
    if (isPlainObject(value) && typeof value.$objectId === 'string') {
      const names = pointerNames.get(value.$objectId) ?? [];
      names.push(name);
      pointerNames.set(value.$objectId, names);
    }
  }

  const nodes: Array<{id:string;value:unknown}> = []; const seen=new Set<string>(); let cur: unknown=root;
  for(let guard=0;guard<40;guard++){
    cur=resolveRef(cur,objects); if(!isPlainObject(cur))break;
    const id=String(cur.$objectId ?? `node-${guard}`); if(seen.has(id)){nodes.push({id:'cycle',value:'↻'});break;} seen.add(id);
    nodes.push({id,value:nodeValue(cur)}); const f=objectFields(cur); if(f.next==null)break; cur=f.next;
  }
  return <div className="yv-linked">{nodes.map((n,i)=><div className="yv-linked-piece" key={`${n.id}-${i}`}>
    {pointerNames.get(n.id)?.map(name => <div className="yv-node-pointer" key={name}>{name}</div>)}
    <div className="yv-node">{displayValue(n.value)}</div>{i<nodes.length-1&&<div className="yv-edge">→</div>}
  </div>)}</div>;
}

function TreeNodeView({ value, objects, depth=0 }: { value: unknown; objects: Record<string,unknown>; depth?: number }) {
  const resolved=resolveRef(value,objects); if(!isPlainObject(resolved) || depth>6)return null;
  const f=objectFields(resolved); return <div className="yv-tree-node"><div className="yv-node">{displayValue(nodeValue(resolved))}</div>{(f.left!=null||f.right!=null)&&<div className="yv-tree-children"><div>{f.left!=null?<TreeNodeView value={f.left} objects={objects} depth={depth+1}/>:<span className="yv-null">null</span>}</div><div>{f.right!=null?<TreeNodeView value={f.right} objects={objects} depth={depth+1}/>:<span className="yv-null">null</span>}</div></div>}</div>;
}
function ReturnValueView({
  text,
  value,
  state
}: {
  text: string;
  value: unknown;
  state?: TraceState;
}) {
  if (isPlainObject(value) && looksListNode(value)) {
    return (
      <div className="yv-return-object">
        <div className="yv-return-reference yv-code">{text}</div>
        <div className="yv-return-caption">Returned node and reachable chain</div>
        <LinkedListView root={value} objects={state?.objects ?? {}} variables={state?.variables ?? {}} />
      </div>
    );
  }

  if (isPlainObject(value) && looksTreeNode(value)) {
    return (
      <div className="yv-return-object">
        <div className="yv-return-reference yv-code">{text}</div>
        <div className="yv-return-caption">Returned root and reachable tree</div>
        <div className="yv-tree"><TreeNodeView value={value} objects={state?.objects ?? {}} /></div>
      </div>
    );
  }

  if (isPlainObject(value) || Array.isArray(value)) {
    return (
      <div className="yv-return-object">
        <div className="yv-return-reference yv-code">{text}</div>
        <div className="yv-return-caption">Returned value</div>
        <DataValue value={value} state={state} source="" />
      </div>
    );
  }

  return <div className="yv-code">{text}</div>;
}


function ObjectView({
  value,
  state,
  source,
  depth = 0,
  seen = new Set<string>()
}: {
  value: Obj;
  state?: TraceState;
  source: string;
  depth?: number;
  seen?: Set<string>;
}) {
  const objectId =
    typeof value.$objectId === 'string'
      ? value.$objectId
      : undefined;

  if (objectId && seen.has(objectId)) {
    return <div className="yv-code">↻ {objectId}</div>;
  }

  if (depth >= 6) {
    return <div className="yv-code">…</div>;
  }

  const nextSeen = new Set(seen);
  if (objectId) {
    nextSeen.add(objectId);
  }

  const fields = objectFields(value);
  const entries = Object.entries(fields);

  if (!entries.length) {
    return (
      <div className="yv-code">
        {objectType(value) || 'Object'}
        {objectId ? ` · ${objectId}` : ''}
      </div>
    );
  }

  return (
    <div className="yv-object">
      {entries.map(([key, fieldValue]) => (
        <div className="yv-object-field" key={key}>
          <div className="yv-code yv-object-key">{key}</div>
          <div className="yv-object-value">
            <DataValue
              value={fieldValue}
              state={state}
              source={source}
              name={key}
              depth={depth + 1}
              seen={nextSeen}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DataValue({
  value,
  state,
  source,
  name,
  depth = 0,
  seen = new Set<string>(),
  resolveObjects = true
}: {
  value: unknown;
  state?: TraceState;
  source: string;
  name?: string;
  depth?: number;
  seen?: Set<string>;
  resolveObjects?: boolean;
}) {
  if (isPlainObject(value) && typeof value.$ref === 'string' &&
      (typeof value.$arrayId === 'string' || typeof value.$mapId === 'string' || typeof value.$collectionId === 'string')) {
    return <div className="yv-code">↻ {value.$ref}</div>;
  }

  if (depth >= 6) {
    return <div className="yv-code">…</div>;
  }

  if (isMapSnapshot(value)) {
    return <MapView value={value} state={state} source={source} depth={depth} seen={seen}/>;
  }

  if (isCollectionSnapshot(value)) {
    return <CollectionView value={value} state={state} source={source} name={name} depth={depth} seen={seen}/>;
  }

  if (isArraySnapshot(value)) {
    return (
      <>
        <ArrayView value={value.values} state={state} source={source} arrayName={name} depth={depth} seen={seen}/>
        {value.truncated === true && (
          <div className="yv-truncated">
            Showing first {value.values.length} of {String(value.length ?? '?')} items.
          </div>
        )}
      </>
    );
  }

  if (Array.isArray(value)) return <ArrayView value={value} state={state} source={source} arrayName={name} depth={depth} seen={seen}/>;
  if (isPlainObject(value)) {
    if (looksTreeNode(value)) return <div className="yv-tree"><TreeNodeView value={value} objects={state?.objects??{}}/></div>;
    if (looksListNode(value)) return <LinkedListView root={value} objects={state?.objects??{}} variables={state?.variables??{}}/>;
    const resolved = resolveObjects ? resolveRef(value, state?.objects ?? {}) : value;
    if (isPlainObject(resolved)) {
      return <ObjectView value={resolved} state={state} source={source} depth={depth} seen={seen}/>;
    }
  }
  return <div className="yv-code">{displayValue(value)}</div>;
}

function isStructuralObject(value: unknown): value is Obj {
  if (!isPlainObject(value)) return false;
  const fields = objectFields(value);
  const type = objectType(value);
  return /ListNode|TreeNode/i.test(type) ||
    ('next' in fields && ('val' in fields || 'value' in fields)) ||
    (('left' in fields || 'right' in fields) && ('val' in fields || 'value' in fields));
}

function DataStructures({ state, source }: { state?: TraceState; source: string }) {
  const namedObjectIds = new Map<string, string[]>();

  for (const [name, value] of Object.entries(state?.variables ?? {})) {
    if (name === 'this') continue;
    if (isPlainObject(value) && typeof value.$objectId === 'string') {
      const names = namedObjectIds.get(value.$objectId) ?? [];
      names.push(name);
      namedObjectIds.set(value.$objectId, names);
    }
  }

  const grouped = new Map<string, { names: string[]; value: unknown }>();

  for (const [name, value] of Object.entries(state?.arrays ?? {})) {
    const id = isPlainObject(value) && typeof value.$arrayId === 'string'
      ? value.$arrayId
      : name;
    const item = grouped.get(`array:${id}`);
    if (item) {
      item.names.push(name);
    } else {
      grouped.set(`array:${id}`, { names: [name], value });
    }
  }

  for (const [name, value] of Object.entries(state?.dataStructures ?? {})) {
    const record = isPlainObject(value) ? value : {};
    const id =
      typeof record.$mapId === 'string'
        ? `map:${record.$mapId}`
        : typeof record.$collectionId === 'string'
          ? `collection:${record.$collectionId}`
          : `structure:${name}`;
    const item = grouped.get(id);
    if (item) {
      item.names.push(name);
    } else {
      grouped.set(id, { names: [name], value });
    }
  }

  for (const [id, value] of Object.entries(state?.objects ?? {})) {
    const names = namedObjectIds.get(id);
    if (!names?.length) continue;
    grouped.set(`object:${id}`, { names, value });
  }

  const items = [...grouped.values()];

  if (!items.length) {
    return <div className="yv-empty">Structures appear here as your code creates or mutates them.</div>;
  }

  return (
    <div className="yv-ds-list">
      {items.map(({ names, value }) => {
        const title = [...new Set(names)].join(' / ');
        return (
          <div className="yv-ds" key={title}>
            <div className="yv-ds-title">{title}</div>
            <DataValue value={value} state={state} source={source} name={title}/>
          </div>
        );
      })}
    </div>
  );
}

export function VisualizerPanel(){
  const s=useSession(); const current=s.states[s.index]; const prev=s.index>0?s.states[s.index-1]:undefined;
  const line = current?.line;
  const lastEventData = isPlainObject(current?.lastEvent?.data) ? current.lastEvent.data : undefined;
  const sourceLines=useMemo(()=>s.source.split(/\r?\n/),[s.source]);
  const statement=line?sourceLines[line-1]?.trim():'';
  useEffect(()=>{highlightEditorLine(line,s.source);return()=>clearEditorExecutionMarker();},[line,s.source]);
  useEffect(()=>{ if(!s.playing)return; const id=setInterval(()=>sessionStore.next(),650); return()=>clearInterval(id); },[s.playing,s.index,s.states.length]);
  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if(!sessionStore.get().open)return; const target=e.target as HTMLElement|null; if(target?.matches('input,textarea,[contenteditable=true]'))return; const handled=e.key==='ArrowRight'||e.key==='ArrowLeft'||e.code==='Space'||e.key.toLowerCase()==='r'; if(!handled)return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); const active=document.activeElement?.shadowRoot?.activeElement as HTMLElement|null; if(active?.matches('button'))active.blur(); if(e.key==='ArrowRight'||e.code==='Space')sessionStore.next(); else if(e.key==='ArrowLeft')sessionStore.prev(); else sessionStore.restart(); }; window.addEventListener('keydown',onKey,true);return()=>window.removeEventListener('keydown',onKey,true)},[]);
  const output=s.response?.result; const tc=s.testcase; const finished=current?.lastEvent?.type==='PROGRAM_END' || (s.states.length>0&&s.index===s.states.length-1);
  return <div className="yv-root"><div className="yv-scroll">
    {tc&&<div className="yv-top"><div className="yv-title-row"><div className="yv-case">{tc.label}</div>{tc.source==='custom'&&<span className="yv-case-kind">Custom</span>}{tc.source==='failed'&&<span className="yv-case-kind">Failed testcase</span>}</div><div className="yv-inputs">{Object.keys(tc.inputs).length?Object.entries(tc.inputs).map(([k,v])=><div className="yv-input" key={k}><div className="yv-key">{k}</div><div className="yv-code">{v}</div></div>):<div className="yv-code">{tc.raw}</div>}</div><div className="yv-output-row"><div className={`yv-output ${finished&&s.response?.success?'good':''}`}><div className="yv-label">Output</div>{finished&&output!==undefined?<ReturnValueView text={displayValue(output)} value={lastEventData?.returnValue} state={current}/>:<div className="yv-code">—</div>}</div></div></div>}
    {s.loading&&<div className="yv-loading">Tracing your code…</div>}{s.error&&<div className="yv-error">{s.error}</div>}
    {!s.loading&&<><Section title="Variables"><Variables state={current} previous={prev}/></Section><Section title="Call Stack">{current?.callStack?.length?<div className="yv-stack-wrap"><div className="yv-stack-label">TOP</div><div className="yv-stack">{current.callStack.map((f:string,i:number)=><div className="yv-frame" key={`${f}-${i}`}>{f}</div>)}</div><div className="yv-stack-label bottom">BOTTOM</div></div>:<div className="yv-empty">No active method calls.</div>}</Section><Section title="Data Structures"><DataStructures state={current} source={s.source}/></Section></>}
  </div><div className="yv-current"><ExecutionInspector state={current} previous={prev} statement={statement} index={s.index} total={s.states.length}/><div className="yv-controls"><div className="yv-buttons"><button className="yv-btn" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.restart()} disabled={!s.states.length}>↺ Restart</button><button className="yv-btn" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.prev()} disabled={s.index<=0}>← Prev</button><button className="yv-btn primary" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.togglePlay()} disabled={s.states.length<2}>{s.playing?'■ Stop':'▶ Play'}</button><button className="yv-btn" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.next()} disabled={!s.states.length||s.index>=s.states.length-1}>Next →</button></div></div></div></div>;
}