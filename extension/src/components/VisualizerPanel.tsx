import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import { useSession } from '../state/session';
import { sessionStore } from '../state/store';
import { displayValue, stableStringify, isPlainObject } from '../utils/value';
import { highlightEditorLine, clearEditorExecutionMarker } from '../leetcode/editor-overlay';
import type { TraceState } from '../types/trace';
import { buildHeapStructureModel, buildObjectStructureModel } from './treeModel';
import visualizerPanelSource from './VisualizerPanel.tsx?raw';
import visualizerStylesSource from './styles.css?raw';
import treeModelSource from './treeModel.ts?raw';

type Obj = Record<string, unknown>;

function mapKeySignature(key: unknown): string {
  if (isPlainObject(key)) {
    for (const identityField of ['$objectId', '$ref', '$arrayId', '$mapId', '$collectionId']) {
      if (typeof key[identityField] === 'string') return identityField + ':' + key[identityField];
    }
  }
  return stableStringify(key);
}

const LINK_PALETTE = ['#60a5fa', '#34d399', '#fbbf24', '#c084fc', '#fb7185', '#22d3ee', '#a3e635', '#f97316'];
function linkedConnectionColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return LINK_PALETTE[hash % LINK_PALETTE.length]!;
}

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
        const objectName = typeof eventData.name === 'string' ? eventData.name : 'object';
        effects.push({
          kind: 'change',
          text: objectName + '.' + fields + '  ' + variableSummary(change.before) + '  →  ' + variableSummary(change.after)
        });
      }
    } else if (eventType === 'STRING_ACCESS') {
      const name = typeof eventData.name === 'string' ? eventData.name : 'string';
      const index = typeof eventData.index === 'number' ? '[' + eventData.index + ']' : '';
      effects.push({ kind: 'structural', text: name + index + ' = ' + compactValue(eventData.value) });
    } else if (eventType === 'STRING_RANGE_ACCESS') {
      const name = typeof eventData.name === 'string' ? eventData.name : 'string';
      const start = typeof eventData.start === 'number' ? eventData.start : '?';
      const end = typeof eventData.end === 'number' ? eventData.end : '?';
      effects.push({ kind: 'structural', text: name + '[' + start + ':' + end + ')' });
    } else if (eventType === 'STRING_SEARCH_RESULT') {
      const name = typeof eventData.name === 'string' ? eventData.name : 'string';
      const operation = typeof eventData.operation === 'string' ? eventData.operation : 'operation';
      if ('result' in eventData) effects.push({
        kind: 'structural',
        text: name + '.' + operation + ' → ' + compactValue(eventData.result)
      });
    } else if (eventType === 'STRING_SPLIT_RESULT') {
      const name = typeof eventData.name === 'string' ? eventData.name : 'string';
      const resultName = typeof eventData.resultName === 'string' ? eventData.resultName : 'parts';
      const count = typeof eventData.partCount === 'number' ? eventData.partCount : '?';
      effects.push({ kind: 'structural', text: name + '.split → ' + resultName + ' (' + count + ' parts)' });
    } else if (eventType === 'STRING_CONVERSION_RESULT') {
      const name = typeof eventData.name === 'string' ? eventData.name : 'string';
      const operation = typeof eventData.operation === 'string' ? eventData.operation : 'conversion';
      const length = typeof eventData.resultLength === 'number' ? eventData.resultLength : '?';
      effects.push({ kind: 'structural', text: name + '.' + operation + ' → char[' + length + ']' });
    } else if (eventType === 'STRING_RESULT') {
      const resultName = typeof eventData.resultName === 'string' ? eventData.resultName : 'result';
      const before = typeof eventData.before === 'string' ? compactValue(eventData.before) + '  →  ' : '';
      effects.push({ kind: 'change', text: resultName + '  ' + before + compactValue(eventData.after) });
    } else if (eventType === 'STRING_MUTATION') {
      const name = typeof eventData.name === 'string' ? eventData.name : 'string';
      const operation = typeof eventData.operation === 'string' ? eventData.operation : 'mutate';
      effects.push({
        kind: 'change',
        text: name + '.' + operation + '  ' + compactValue(eventData.before) + '  →  ' + compactValue(eventData.after)
      });
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
    // Use the semantic summary for object returns so linked-list nodes render
    // as a stable node identity/value instead of leaking serialized snapshots.
    effects.push({ kind: 'return', text: '↩  ' + variableSummary(data.returnValue) });
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

export function buildDataStructuresSnapshot(state: TraceState | undefined): string {
  return JSON.stringify({
    format: 'YourVision Data Structures Snapshot',
    checkpoint: state ? {
      sequence: state.sequence ?? null,
      line: state.line ?? null,
      method: state.method ?? null,
      depth: state.depth ?? null,
      event: state.lastEvent?.type ?? null,
    } : null,
    structures: {
      variables: state?.variables ?? {},
      arrays: state?.arrays ?? {},
      dataStructures: state?.dataStructures ?? {},
      objects: state?.objects ?? {},
    },
  }, null, 2);
}

function buildExecutionPanelTrace(states: TraceState[], source: string): string {
  const lines = source.split(/\r?\n/);
  return states.map((state, index) => {
    const previous = index > 0 ? states[index - 1] : undefined;
    const lineNumber = state.line ?? 0;
    const statement = lineNumber > 0 ? (lines[lineNumber - 1] ?? '').trim() : '';
    const data = isPlainObject(state.lastEvent?.data) ? state.lastEvent.data : {};
    const condition = typeof data.conditionResult === 'boolean'
      ? (data.conditionResult ? 'TRUE' : 'FALSE')
      : '—';
    const before = previous?.variables ?? {};
    const after = state.variables ?? {};
    const changedVariables = Object.entries(after)
      .filter(([name, value]) => name !== 'this' && (!Object.prototype.hasOwnProperty.call(before, name) || stableStringify(before[name]) !== stableStringify(value)))
      .map(([name, value]) => name + ': ' + (Object.prototype.hasOwnProperty.call(before, name) ? debugValue(before[name]) + ' → ' : '') + debugValue(value));
    const events = Array.isArray(data.executionEvents) ? data.executionEvents : [];
    const eventEffects = events.map((event: any) => {
      const eventData = isPlainObject(event?.data) ? event.data : {};
      return (event?.type ?? 'EVENT') + (Object.keys(eventData).length ? ': ' + debugValue(eventData) : '');
    });
    return [
      'STEP ' + (index + 1) + ' / ' + states.length,
      'EXECUTED LINE ' + lineNumber + ': ' + statement,
      'CONDITION RESULT: ' + condition,
      'VARIABLE / STATE CHANGES:',
      ...(changedVariables.length ? changedVariables : ['—']),
      'TRACE EVENTS:',
      ...(eventEffects.length ? eventEffects : ['—']),
      ''
    ].join('\n');
  }).join('\n' + '-'.repeat(72) + '\n');
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
    .filter(([name, value]) => {
      if (name === 'this') return false;
      const oldValue = before[name];
      if (!(name in before)) return true;
      const oldId = isPlainObject(oldValue) && looksListNode(oldValue)
        ? (typeof oldValue.$objectId === 'string' ? oldValue.$objectId : oldValue.$ref)
        : undefined;
      const newId = isPlainObject(value) && looksListNode(value)
        ? (typeof value.$objectId === 'string' ? value.$objectId : value.$ref)
        : undefined;
      if (oldId !== undefined && newId !== undefined && oldId === newId) return false;
      return valueChanged(oldValue, value);
    })
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


function isStructuredResultValue(value: unknown): boolean {
  return isMapSnapshot(value) || isCollectionSnapshot(value) || isArraySnapshot(value) ||
    Array.isArray(value) ||
    (isPlainObject(value) && (
      typeof value.$objectId === 'string' ||
      typeof value.$ref === 'string' ||
      isPlainObject(value.fields)
    ));
}

function DataStructureResult({
  name, operation, value, oldValue, position, showOld = oldValue !== undefined,
  state, previousState, source
}: {
  name: string; operation: string; value: unknown; oldValue?: unknown; position: string; showOld?: boolean;
  state?: TraceState; previousState?: TraceState; source: string;
}) {
  const structuredUpdate = showOld && isStructuredResultValue(oldValue) && isStructuredResultValue(value);
  return (
    <div className={'yv-ds-result' + (structuredUpdate ? ' yv-ds-result-structured' : '')}>
      <span className="yv-ds-result-name">{name}</span>
      <span className="yv-ds-result-arrow">→</span>
      <span className="yv-ds-result-operation">[{operation}]</span>
      <span className="yv-ds-result-position">[{position}]</span>
      {structuredUpdate ? (
        <div className="yv-ds-result-structured-values">
          <div className="yv-ds-result-snapshot">
            <span className="yv-ds-result-snapshot-label">Before</span>
            <DataValue value={oldValue} state={previousState} source={source} depth={1}/>
          </div>
          <span className="yv-ds-result-transition" aria-hidden="true">→</span>
          <div className="yv-ds-result-snapshot is-current">
            <span className="yv-ds-result-snapshot-label">After</span>
            <DataValue value={value} state={state} source={source} depth={1}/>
          </div>
        </div>
      ) : (
        <span className="yv-ds-result-value">
          {showOld && <span className="yv-ds-result-old">{compactValue(oldValue)}</span>}
          {showOld && <span className="yv-ds-result-transition">→</span>}
          <span className={showOld ? 'yv-ds-result-new' : ''}>{compactValue(value)}</span>
        </span>
      )}
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
      if (collectionItemIdentity(before[i]) !== collectionItemIdentity(after[i])) return { added: after[i], removed: before[i], index: i };
    }
    return undefined;
  }
  if (after.length === before.length + 1) {
    for (let i = 0; i < after.length; i++) {
      const matches = before.every((value, j) =>
        collectionItemIdentity(value) === collectionItemIdentity(after[j + (j >= i ? 1 : 0)])
      );
      if (matches) return { added: after[i], index: i };
    }
  }
  if (before.length === after.length + 1) {
    for (let i = 0; i < before.length; i++) {
      const matches = after.every((value, j) =>
        collectionItemIdentity(value) === collectionItemIdentity(before[j + (j >= i ? 1 : 0)])
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
  const remaining = before.map(value => ({ key: collectionItemIdentity(value), value }));
  const added: unknown[] = [];
  for (const value of after) {
    const key = collectionItemIdentity(value);
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
  if (kind === 'list' || kind === 'arrayList' || /^(ArrayList|Vector|CopyOnWriteArrayList)$/.test(kind)) {
    if (m === 'add') return argCount >= 2
      ? {operation:'Insert',value:delta.added,position:'Index: ' + (delta.index ?? '?')}
      : {operation:'Add',value:delta.added,position:'End'};
    if (['addlast','offer','append'].includes(m)) return {operation:'Add',value:delta.added,position:'End'};
    if (['remove','removelast','poll','removeat'].includes(m)) return {operation:'Remove',value:delta.removed,position:typeof delta.index === 'number' ? 'Index: ' + delta.index : 'End'};
    if (m === 'set') return {operation:'Set',value:delta.added,oldValue:delta.removed,position:'Index: ' + (delta.index ?? '?'),showOld:true};
  }
  if (kind === 'set' || kind === 'sortedSet' || kind === 'insertionOrderedSet') {
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
    beforeMap.set(mapKeySignature(entry.key), entry);
  }

  for (const entry of after) {
    afterMap.set(mapKeySignature(entry.key), entry);
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
    rows.push(<DataStructureResult key={key} name={name} operation={operation} value={value} oldValue={oldValue} position={position} showOld={showOld} state={current} previousState={previous} source={statement}/>);
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
      const isUnordered = ac.$kind === 'priorityQueue' || ac.$kind === 'set';
      const delta = isUnordered
        ? unorderedCollectionDelta(bc.values, ac.values)
        : collectionDelta(bc.values, ac.values);
      const op=delta ? collectionOperation(ac.$kind ?? '',method,delta,args.length) : undefined;
      if(delta && op) add('col-'+name+'-'+stableStringify([delta.added,delta.removed]),name,op.operation,op.value,op.position,op.oldValue,op.showOld);
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
          Copy DS Debug Trace
        </button>
        <button
          className="yv-btn"
          type="button"
          tabIndex={-1}
          onMouseDown={e => e.preventDefault()}
          onClick={async () => {
            const current = sessionStore.get();
            const trace = buildExecutionPanelTrace(current.states, current.source);
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
          Copy Execution Trace
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
      <ArrayView
        value={value.values}
        state={state}
        source={source}
        arrayName={name}
        depth={depth}
        seen={seen}
        nestedItems={value.values.some(item => isCollectionSnapshot(item) || isArraySnapshot(item) || Array.isArray(item))}
      />
    </div>
  );
}

function previousCollectionSnapshot(
  state: TraceState | undefined,
  collectionId: string
): { $collectionId: string; values: unknown[] } | undefined {
  if (!state) return undefined;
  const session = sessionStore.get();
  const stateIndex = session.states.indexOf(state);
  const selectedIndex = stateIndex >= 0
    ? stateIndex
    : Math.max(0, Math.min(session.index, session.states.length - 1));
  const current = session.states[selectedIndex];
  const previous = selectedIndex > 0 ? session.states[selectedIndex - 1] : undefined;
  if (!current || !previous || current.sequence !== state.sequence) return undefined;

  // A variable can be renamed or an alias can become the visible collection
  // name between steps. Resolve by runtime identity, not by the current label.
  const candidates = [
    ...Object.values(previous.variables),
    ...Object.values(previous.dataStructures),
  ];
  return candidates.find(candidate =>
    isCollectionSnapshot(candidate) && candidate.$collectionId === collectionId
  ) as { $collectionId: string; values: unknown[] } | undefined;
}

function collectionItemIdentity(item: unknown): string {
  if (isPlainObject(item)) {
    for (const key of ['$objectId', '$ref', '$arrayId', '$mapId', '$collectionId']) {
      if (typeof item[key] === 'string') return key + ':' + item[key];
    }
  }
  return stableStringify(item);
}

function collectionItemReactKey(item: unknown, index: number, values: unknown[]): string {
  const identity = collectionItemIdentity(item);
  const occurrence = values.slice(0, index).filter(candidate => collectionItemIdentity(candidate) === identity).length;
  return identity + '#' + occurrence;
}

function collectionItemMotionClass(
  value: { $collectionId: string; values: unknown[] },
  item: unknown,
  occurrenceIndex: number,
  state: TraceState | undefined
): string {
  const prior = previousCollectionSnapshot(state, value.$collectionId);
  if (!prior) return '';

  // Count equal values rather than using a Set: collections may legally hold
  // duplicate values (queues, deques and priority queues), and each occurrence
  // must be treated independently.
  const signature = collectionItemIdentity(item);
  const occurrenceBefore = value.values.slice(0, occurrenceIndex + 1)
    .filter(candidate => collectionItemIdentity(candidate) === signature).length;
  const occurrencePreviously = prior.values
    .filter(candidate => collectionItemIdentity(candidate) === signature).length;
  return occurrenceBefore > occurrencePreviously ? 'yv-collection-item-enter' : '';
}

function HeapTreeView({
  value,
  state,
  source,
  depth,
  seen
}: {
  value: Obj & { $collectionId: string; values: unknown[] };
  state?: TraceState;
  source: string;
  depth: number;
  seen: Set<string>;
}) {
  const heapModel = useMemo(() => buildHeapStructureModel(value.values), [value.values]);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = useState<{ width: number; height: number; paths: string; signature: string }>({
    width: 0, height: 0, paths: '', signature: ''
  });

  // Measure the actual rendered node centers instead of guessing connector
  // positions from values or equal-width levels. This keeps edges attached
  // when labels have different widths or the heap is horizontally scrolled.
  useLayoutEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const measure = () => {
      const currentTree = treeRef.current;
      if (!currentTree) return;
      const currentBounds = currentTree.getBoundingClientRect();
      const currentWidth = Math.max(currentTree.clientWidth, currentTree.scrollWidth);
      const currentHeight = Math.max(currentTree.clientHeight, currentTree.scrollHeight);
      const nodes = Array.from(currentTree.querySelectorAll<HTMLElement>('.yv-heap-node[data-heap-index]'));
      const centers = new Map<number, { x: number; top: number; bottom: number }>();
      for (const node of nodes) {
        const index = Number(node.dataset.heapIndex);
        if (!Number.isInteger(index) || index < 0) continue;
        const rect = node.getBoundingClientRect();
        centers.set(index, {
          x: rect.left - currentBounds.left + currentTree.scrollLeft + rect.width / 2,
          top: rect.top - currentBounds.top + currentTree.scrollTop,
          bottom: rect.bottom - currentBounds.top + currentTree.scrollTop
        });
      }
      const paths: string[] = [];
      for (const edge of heapModel.edges) {
        const parentIndex = Number(edge.source.slice('heap:'.length));
        const childIndex = Number(edge.target.slice('heap:'.length));
        const parent = centers.get(parentIndex);
        const child = centers.get(childIndex);
        if (!parent || !child) continue;
        paths.push(`M ${parent.x.toFixed(2)} ${parent.bottom.toFixed(2)} L ${child.x.toFixed(2)} ${child.top.toFixed(2)}`);
      }
      const pathData = paths.join(' ');
      const signature = currentWidth + ':' + currentHeight + ':' + pathData;
      setGeometry(previous => previous.signature === signature
        ? previous
        : { width: currentWidth, height: currentHeight, paths: pathData, signature });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measure)
      : undefined;
    observer?.observe(tree);
    tree.querySelectorAll<HTMLElement>('.yv-heap-node[data-heap-index]').forEach(node => observer?.observe(node));
    tree.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer?.disconnect();
      tree.removeEventListener('scroll', measure);
    };
  });

  const levels: unknown[][] = [];
  value.values.forEach((item, index) => {
    const level = Math.floor(Math.log2(index + 1));
    (levels[level] ??= []).push(item);
  });

  return (
    <div className="yv-heap-tree" ref={treeRef}>
      {geometry.paths && geometry.width > 0 && geometry.height > 0 && (
        <svg className="yv-heap-links" width={geometry.width} height={geometry.height}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true" focusable="false">
          <path d={geometry.paths} />
        </svg>
      )}
      {levels.map((items, level) => (
        <div className="yv-heap-level" key={level}>
          {items.map((item, index) => {
            const heapIndex = (2 ** level) - 1 + index;
            const key = collectionItemReactKey(item, heapIndex, value.values);
            return (
              <div className="yv-heap-node-wrap" key={key}>
                <div data-heap-index={heapIndex} data-collection-item-key={key}
                  className={"yv-heap-node " + collectionItemMotionClass(value, item, heapIndex, state)}>
                  <DataValue
                  value={item}
                  state={state}
                  source={source}
                  depth={depth + 1}
                  seen={seen}
                />
                </div>
                <div className="yv-cell-index">[{heapIndex}]</div>
              </div>
            );
          })}
        </div>
      ))}
      {!value.values.length && <div className="yv-empty">Empty priority queue</div>}
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
  const previousSnapshot = previousCollectionSnapshot(state, value.$collectionId);
  const emptiedThisStep = Boolean(previousSnapshot && previousSnapshot.values.length > 0 && value.values.length === 0);
  const sameLengthTopReplacement = kind === 'stack' && Boolean(previousSnapshot &&
    previousSnapshot.values.length === value.values.length && value.values.length > 0 &&
    collectionItemIdentity(previousSnapshot.values[previousSnapshot.values.length - 1]) !==
      collectionItemIdentity(value.values[value.values.length - 1]));
  const queueFrontChanged = (kind === 'queue' || kind === 'deque') && Boolean(previousSnapshot &&
    previousSnapshot.values.length > 0 && value.values.length > 0 &&
    collectionItemIdentity(previousSnapshot.values[0]) !== collectionItemIdentity(value.values[0]));
  const queueRearChanged = (kind === 'queue' || kind === 'deque') && Boolean(previousSnapshot &&
    previousSnapshot.values.length > 0 && value.values.length > 0 &&
    collectionItemIdentity(previousSnapshot.values[previousSnapshot.values.length - 1]) !==
      collectionItemIdentity(value.values[value.values.length - 1]));
  const collectionRootRef = useRef<HTMLDivElement | null>(null);
  const previousItemRects = useRef<Map<string, DOMRect>>(new Map());
  const itemAnimations = useRef<WeakMap<HTMLElement, Animation>>(new WeakMap());

  // FLIP only the surviving logical items when insertions/removals change layout.
  // Removed items disappear in place; no detached "pop-out" element is rendered.
  useLayoutEffect(() => {
    const root = collectionRootRef.current;
    if (!root) return;
    const reduceMotion = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const items = Array.from(root.querySelectorAll<HTMLElement>(
      ':scope > .yv-stack-view > [data-collection-item-key], ' +
      ':scope > .yv-queue-view > [data-collection-item-key], ' +
      ':scope > .yv-set-view > [data-collection-item-key], ' +
      ':scope > .yv-list-view > [data-collection-item-key], ' +
      ':scope > .yv-heap-tree .yv-heap-node[data-collection-item-key]'
    ));
    const nextRects = new Map<string, DOMRect>();
    for (const element of items) {
      const key = element.dataset.collectionItemKey;
      if (!key) continue;
      // Rapid Next/Prev playback must not stack competing transforms.
      itemAnimations.current.get(element)?.cancel();
      const rect = element.getBoundingClientRect();
      nextRects.set(key, rect);
      const before = previousItemRects.current.get(key);
      if (!reduceMotion && before && !element.classList.contains('yv-collection-item-enter')) {
        const dx = before.left - rect.left;
        const dy = before.top - rect.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          const animation = element.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 220, easing: 'cubic-bezier(.2,.75,.25,1)' }
          );
          itemAnimations.current.set(element, animation);
        }
      }
    }
    previousItemRects.current = nextRects;
  });

  if (kind === 'stack') {
    return (
      <div className="yv-collection" ref={collectionRootRef} data-collection-emptied={emptiedThisStep ? 'true' : undefined}>
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>TOP · {itemCount} items</span>
        </div>
        <div className="yv-stack-view">
          {[...value.values].reverse().map((item, index) => (
            <div className={"yv-stack-cell " + collectionItemMotionClass(value, item, value.values.length - 1 - index, state) + (sameLengthTopReplacement && index === 0 ? ' yv-stack-top-updated' : '')} key={collectionItemReactKey(item, value.values.length - 1 - index, value.values)} data-collection-item-key={collectionItemReactKey(item, value.values.length - 1 - index, value.values)}>
              <span className="yv-stack-position">{index === 0 ? 'TOP' : ''}</span>
              <DataValue value={item} state={state} source={source} depth={depth + 1} seen={seen}/>
            </div>
          ))}
          {!value.values.length && <div className="yv-empty">Empty stack</div>}
        </div>
      </div>
    );
  }

  if (kind === 'queue' || kind === 'deque') {
    return (
      <div className="yv-collection" ref={collectionRootRef} data-collection-emptied={emptiedThisStep ? 'true' : undefined}>
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>{kind === 'deque' ? 'FRONT ↔ REAR' : 'FRONT → REAR'} · {itemCount} items</span>
        </div>
        <div className="yv-queue-view">
          <div className="yv-queue-end">FRONT</div>
          {value.values.map((item, index) => (
            <div className={"yv-queue-cell " + collectionItemMotionClass(value, item, index, state) + (queueFrontChanged && index === 0 ? ' yv-queue-front-changed' : '') + (queueRearChanged && index === value.values.length - 1 ? ' yv-queue-rear-changed' : '')} key={collectionItemReactKey(item, index, value.values)} data-collection-item-key={collectionItemReactKey(item, index, value.values)}>
              <DataValue value={item} state={state} source={source} depth={depth + 1} seen={seen}/>
            </div>
          ))}
          <div className="yv-queue-end">REAR</div>
          {!value.values.length && <div className="yv-empty">Empty queue</div>}
        </div>
      </div>
    );
  }

  if (kind === 'set' || kind === 'sortedSet' || kind === 'insertionOrderedSet') {
    return (
      <div className="yv-collection" ref={collectionRootRef} data-collection-emptied={emptiedThisStep ? 'true' : undefined}>
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>{kind === 'sortedSet' ? 'SORTED · ' : kind === 'insertionOrderedSet' ? 'INSERTION ORDER · ' : 'UNORDERED · '}{itemCount} elements</span>
        </div>
        <div className="yv-set-view">
          {value.values.map((item, index) => (
            <div className={"yv-set-element " + collectionItemMotionClass(value, item, index, state)} key={collectionItemReactKey(item, index, value.values)} data-collection-item-key={collectionItemReactKey(item, index, value.values)}>
              <DataValue value={item} state={state} source={source} depth={depth + 1} seen={seen}/>
            </div>
          ))}
          {!value.values.length && <div className="yv-empty">Empty set</div>}
        </div>
      </div>
    );
  }

  if (kind === 'priorityQueue') {
    return (
      <div className="yv-collection" ref={collectionRootRef} data-collection-emptied={emptiedThisStep ? 'true' : undefined}>
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>HEAP · {itemCount} items</span>
        </div>
        <HeapTreeView value={value} state={state} source={source} depth={depth} seen={seen}/>
        <div className="yv-code yv-heap-note">Heap tree · root is index 0</div>
      </div>
    );
  }

  if (kind === 'list' || kind === 'arrayList' || /^(ArrayList|Vector|CopyOnWriteArrayList)$/.test(type)) {
    const hasNestedItems = value.values.some(item =>
      isCollectionSnapshot(item) || isArraySnapshot(item) || Array.isArray(item)
    );
    const listIndexNames = collectionIndexVariableNames(source, name);
    const listPointers = pointerTargets(state, value.values.length, listIndexNames, name, source);
    const pointersAt = (index: number) => listPointers.filter(pointer => pointer.index === index);
    return (
      <div className={`yv-collection ${hasNestedItems ? 'yv-collection-nested-inline' : ''}`} ref={collectionRootRef} data-collection-emptied={emptiedThisStep ? 'true' : undefined}>
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>INDEXED ORDER · {itemCount} items</span>
        </div>
        <div className="yv-list-view">
          {value.values.map((item, index) => (
            <div className="yv-list-slot" key={collectionItemReactKey(item, index, value.values)}
              data-collection-item-key={collectionItemReactKey(item, index, value.values)}>
              <div className="yv-list-pointer-row" aria-hidden="true">{pointersAt(index).map(pointer => <span key={pointer.name} className="yv-list-pointer">{pointer.name}</span>)}</div>
              <div className={"yv-list-cell " + collectionItemMotionClass(value, item, index, state)}>
                <DataValue value={item} state={state} source={source} depth={depth + 1} seen={seen} nestedArrayItem={hasNestedItems && (isArraySnapshot(item) || Array.isArray(item))}/>
              </div>
              <div className="yv-cell-index">{index}</div>
            </div>
          ))}
          {!value.values.length && <div className="yv-empty">Empty list</div>}
          {listPointers.some(pointer => pointer.index === value.values.length) && <div className="yv-list-slot yv-list-end-slot" aria-label="List boundary, not an element">
            <div className="yv-list-pointer-row" aria-hidden="true">{pointersAt(value.values.length).map(pointer => <span key={pointer.name} className="yv-list-pointer yv-list-pointer-end">{pointer.name}</span>)}</div>
            <div className="yv-list-cell" title="One past the last item" aria-label="List boundary, not an item">×</div>
            <div className="yv-cell-index">{value.values.length}</div>
          </div>}
        </div>
      </div>
    );
  }

  return (
    <div className="yv-collection" ref={collectionRootRef} data-collection-emptied={emptiedThisStep ? 'true' : undefined}>
      <div className="yv-collection-meta">
        <span>{type}</span>
        <span>{kind} · {itemCount} items</span>
      </div>
      <CollectionBackingArray value={value} state={state} source={source} name={name} depth={depth} seen={seen}/>
    </div>
  );
}

function variableSummary(value: unknown): string {
  if (isPlainObject(value) && looksListNode(value)) {
    const id = typeof value.$objectId === 'string' ? value.$objectId
      : typeof value.$ref === 'string' ? value.$ref : undefined;
    const fields = objectFields(value);
    const nodeValue = fields.val ?? fields.value ?? fields.data;
    const shortId = id ? (id.length > 8 ? id.slice(-6) : id) : '?';
    return 'node #' + shortId + (nodeValue !== undefined ? ' (val=' + compactValue(nodeValue) + ')' : '');
  }
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

export interface SemanticRoleView { name:string; role:string; confidence?:number; evidence?:string; structureName?:string; usage?:string[]; method?:string; }
function stateSemanticRoles(state?:TraceState):SemanticRoleView[]{
 const data=state?.lastEvent?.data;
 if(!isPlainObject(data)||!Array.isArray(data.semanticRoles))return [];
 return data.semanticRoles.filter((role):role is SemanticRoleView=>isPlainObject(role)&&typeof role.name==="string"&&typeof role.role==="string");
}
export function semanticRoleForVariable(state:TraceState|undefined,name:string):SemanticRoleView|undefined{return stateSemanticRoles(state).find(role=>role.name===name);}
function semanticRoleLabel(role:string):string{return ({'left-bound':'LEFT BOUND','right-bound':'RIGHT BOUND',midpoint:'MIDPOINT','loop-counter':'LOOP',pointer:'POINTER','derived-value':'DERIVED','answer-value':'RESULT',unused:'UNUSED'} as Record<string,string>)[role]??'';}
export function Variables({ state, previous }: { state?: TraceState; previous?: TraceState }) {
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
            <div className="yv-var-name"><span>{name}</span></div>
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


type EnhancedForBinding = { variable: string; iterable: string; index: number; value: unknown };

/**
 * Resolve the element currently assigned by a Java enhanced-for loop.
 * The iteration ordinal comes from recorded VARIABLE_UPDATE events, not from
 * searching by value, so repeated values still point at the correct cell.
 */
function enhancedForBinding(source: string, state: TraceState | undefined, collectionName: string | undefined, values: unknown[]): EnhancedForBinding | undefined {
  if (!state || !collectionName || !values.length) return undefined;
  const collectionNames = new Set(collectionName.split(' / ').map(name => name.trim()));
  const pattern = /for\s*\(\s*(?:final\s+)?(?:[\w.$<>?,\[\]\s]+?)\s+([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)(?:\s*\.\s*toCharArray\s*\(\s*\))?\s*\)/g;
  const session = sessionStore.get();
  const stateIndex = session.states.indexOf(state);
  const currentIndex = stateIndex >= 0
    ? stateIndex
    : session.states.findIndex(candidate => candidate.sequence === state.sequence);
  const upto = currentIndex >= 0 ? currentIndex : session.index;

  for (const match of source.matchAll(pattern)) {
    const variable = match[1];
    const iterable = match[2];
    if (!variable || !iterable || !collectionNames.has(iterable)) continue;

    const headerOffset = match.index ?? 0;
    const headerLine = source.slice(0, headerOffset).split(/\r?\n/).length;
    const openBrace = source.indexOf('{', headerOffset + match[0].length);
    let loopEndLine = headerLine;
    if (openBrace >= 0) {
      let depth = 0;
      let closeBrace = -1;
      for (let i = openBrace; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) { closeBrace = i; break; }
      }
      if (closeBrace >= 0) loopEndLine = source.slice(0, closeBrace).split(/\r?\n/).length;
    }

    const currentLine = state.line ?? headerLine;
    if (currentLine < headerLine || currentLine > loopEndLine) continue;

    // Count one binding per trace checkpoint, and only when the binding update
    // belongs to this loop header. Counting raw events overcounts duplicate
    // updates in a checkpoint and can accidentally count assignments in the
    // loop body or another loop that reuses the same variable name.
    let assignments = 0;
    let lastAssignedValue: unknown;
    let hasLastAssignedValue = false;
    const historyEnd = Math.min(upto, session.states.length - 1);
    for (let i = 0; i <= historyEnd; i++) {
      const historicalState = session.states[i];
      if (!historicalState) continue;
      const historicalLine = historicalState.line;
      if (historicalLine !== undefined && (historicalLine < headerLine || historicalLine > loopEndLine)) continue;
      const data = historicalState.lastEvent?.data;
      if (!isPlainObject(data) || !Array.isArray(data.executionEvents)) continue;
      const matchingUpdates = data.executionEvents.filter(event => {
        if (!isPlainObject(event) || event.type !== 'VARIABLE_UPDATE' || !isPlainObject(event.data)) return false;
        if (event.data.name !== variable) return false;
        const eventLine = typeof event.line === 'number' ? event.line : historicalLine;
        return eventLine === headerLine;
      });
      if (matchingUpdates.length === 0) continue;
      assignments++;
      const latest = matchingUpdates[matchingUpdates.length - 1];
      if (isPlainObject(latest) && isPlainObject(latest.data) && 'value' in latest.data) {
        lastAssignedValue = latest.data.value;
        hasLastAssignedValue = true;
      }
    }

    // Without a recorded binding checkpoint there is no reliable way to map
    // a duplicate value back to its cell. Never guess by searching the value.
    if (assignments === 0) continue;
    const index = Math.min(assignments - 1, values.length - 1);
    const variableValue = state.variables?.[variable];
    const value = variableValue !== undefined
      ? variableValue
      : hasLastAssignedValue ? lastAssignedValue : values[index];
    return { variable, iterable, index, value };
  }
  return undefined;
}

function isEnhancedForVariable(source: string, name: string): boolean {
  const pattern = /for\s*\(\s*(?:final\s+)?(?:[\w.$<>?,\[\]\s]+?)\s+([A-Za-z_$][\w$]*)\s*:/g;
  return [...source.matchAll(pattern)].some(match => match[1] === name);
}

function EnhancedForValueCard({ binding, alignStart = false }: { binding: EnhancedForBinding; alignStart?: boolean }) {
  return (
    <div className="yv-enhanced-for-card" data-enhanced-for-variable={binding.variable} data-enhanced-for-index={binding.index}
      style={{ position: 'absolute', zIndex: 5, left: alignStart ? 0 : '50%', bottom: 'calc(100% + 10px)', transform: alignStart ? 'none' : 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', padding: '4px 8px',
        border: '1px solid var(--yv-accent, #65a9ff)', borderRadius: 7, background: 'var(--yv-panel, #101b2d)',
        color: 'var(--yv-text, #f3f6ff)', boxShadow: '0 3px 12px rgba(0,0,0,.28)', fontSize: 12,
        lineHeight: '16px', pointerEvents: 'none', transition: 'opacity 120ms ease' }}>
      <span className="yv-enhanced-for-name" style={{ color: 'var(--yv-accent, #65a9ff)', fontWeight: 700 }}>{binding.variable}</span>
      <span className="yv-enhanced-for-equals">=</span>
      <span className="yv-enhanced-for-value">{compactValue(binding.value)}</span>
      <span className="yv-enhanced-for-connector" aria-hidden="true"
        style={{ position: 'absolute', left: alignStart ? 18 : '50%', top: '100%', height: 10, borderLeft: '1px solid var(--yv-accent, #65a9ff)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', left: alignStart ? 15 : 'calc(50% - 3px)', top: 'calc(100% + 7px)',
        width: 6, height: 6, borderRadius: '50%', background: 'var(--yv-accent, #65a9ff)' }} />
    </div>
  );
}

function collectionIndexVariableNames(source: string, collectionName?: string): Set<string> {
  const names = new Set<string>();
  if (!collectionName) return names;
  for (const candidate of collectionName.split('/').map(part => part.trim()).filter(Boolean)) {
    const escaped = candidate.replace(/[$]/g, '\\$&');
    const pattern = new RegExp('\\b' + escaped + '\\s*\\.\\s*(?:get|set|remove)\\s*\\(\\s*([^,)]+)', 'g');
    for (const match of source.matchAll(pattern)) {
      for (const identifier of (match[1] ?? '').matchAll(/\b[A-Za-z_$][\w$]*\b/g)) names.add(identifier[0]);
    }
  }
  return names;
}

function arrayIndexVariableNames(source: string, arrayName?: string): Set<string> {
  const names = new Set<string>();
  if (!arrayName) return names;
  // Java identifiers may contain '$'. Escape it and keep the regex escapes single.
  const escapedArrayName = arrayName.replace(/[$]/g, '\\$&');
  const pattern = new RegExp('\\b' + escapedArrayName + '\\s*\\[([^\\]]+)\\]', 'g');
  for (const match of source.matchAll(pattern)) {
    for (const identifier of match[1].matchAll(/\b[A-Za-z_$][\w$]*\b/g)) names.add(identifier[0]);
  }
  return names;
}

export function pointerTargets(
  state: TraceState | undefined,
  length: number,
  indexNames: Set<string>,
  arrayName?: string,
  source = ''
): Array<{ name: string; index: number }> {
  const targets: Array<{ name: string; index: number }> = [];
  const roles = stateSemanticRoles(state);
  const boundaryRoles = roles.filter(role =>
    ['left-bound', 'right-bound', 'midpoint', 'pointer'].includes(role.role)
  );
  const hasArraySpecificRoles = boundaryRoles.some(
    role => role.structureName === arrayName
  );
  const semanticNames = new Set(
    boundaryRoles
      .filter(role => role.structureName === arrayName)
      .map(role => role.name)
  );

  // A semantic midpoint role may be omitted on condition/loop-header steps,
  // even while its boundary roles remain present. Keep those boundary pointers
  // attached by deriving the midpoint relationship from source, not from the
  // current step's role list alone.
  const leftBounds = boundaryRoles.filter(role => role.role === 'left-bound');
  const rightBounds = boundaryRoles.filter(role => role.role === 'right-bound');
  const hasSourceDerivedMidpointIndex = [...indexNames].some(indexName => {
    const assignmentPattern = /(?:\b(?:byte|short|int|long|char|float|double)\s+)?([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+);/g;
    for (const match of source.matchAll(assignmentPattern)) {
      if (match[1] !== indexName) continue;
      const identifiers = new Set(
        [...(match[2] ?? '').matchAll(/\b[A-Za-z_$][\w$]*\b/g)].map(item => item[0])
      );
      if (
        leftBounds.some(role => identifiers.has(role.name)) &&
        rightBounds.some(role => identifiers.has(role.name))
      ) return true;
    }
    return false;
  });
  const hasMidpointIndex = [...indexNames].some(name =>
    boundaryRoles.some(role => role.name === name && role.role === 'midpoint')
  ) || hasSourceDerivedMidpointIndex;
  if (!hasArraySpecificRoles && hasMidpointIndex) {
    for (const role of boundaryRoles) {
      // Never leak explicit roles belonging to another structure into this array.
      if (role.structureName && role.structureName !== arrayName) continue;
      if (role.role === 'left-bound' || role.role === 'right-bound') {
        semanticNames.add(role.name);
      } else if (role.role === 'midpoint' && indexNames.has(role.name)) {
        semanticNames.add(role.name);
      }
    }
  }

  for (const [name, value] of Object.entries(state?.variables ?? {})) {
    if (!indexNames.has(name) && !semanticNames.has(name)) continue;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value >= length
    ) continue;
    targets.push({ name, index: value });
  }
  return targets;
}

export function pointerLabels(
  state: TraceState | undefined,
  length: number,
  indexNames: Set<string>,
  arrayName?: string,
  source = ''
): Map<number, string[]> {
  const labels = new Map<number, string[]>();

  for (const target of pointerTargets(state, length, indexNames, arrayName, source)) {
    const names = labels.get(target.index) ?? [];
    names.push(target.name);
    labels.set(target.index, names);
  }

  return labels;
}

function arrayNameMatches(candidate: string, requested?: string): boolean {
  if (!requested) return true;
  return requested.split('/').map(name => name.trim()).includes(candidate);
}

function matrixIndexVariableNames(source: string, arrayName?: string): { rows: Set<string>; columns: Set<string> } {
  const rows = new Set<string>();
  const columns = new Set<string>();
  if (!arrayName) return { rows, columns };
  const pattern = /([A-Za-z_$][\w$]*)\s*\[\s*([^\]]+)\s*\]\s*\[\s*([^\]]+)\s*\]/g;
  for (const match of source.matchAll(pattern)) {
    if (!arrayNameMatches(match[1] ?? '', arrayName)) continue;
    const rowExpr = match[2] ?? '';
    const colExpr = match[3] ?? '';
    for (const id of rowExpr.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) rows.add(id[0]);
    for (const id of colExpr.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) columns.add(id[0]);
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
    if (typeof event.data.name === 'string' && !arrayNameMatches(event.data.name, arrayName)) continue;
    if (!Array.isArray(event.data.indices)) continue;
    const index = event.data.indices[0];
    if (typeof index === 'number') set.add(index);
  }
  return set;
}

function isComparisonStatement(source: string, state?: TraceState): boolean {
  const line = state?.line;
  if (!line || line < 1) return false;
  const statement = source.split(/\r?\n/)[line - 1] ?? '';
  // Require an actual comparison operator, not a plain assignment.
  return /(?:===|!==|==|!=|<=|>=|(?<![<>=!])<(?![=])|(?<![<>=!])>(?![=]))/.test(statement);
}

function accessedArrayPaths(state: TraceState | undefined, arrayName?: string): Set<string> {
  const paths = new Set<string>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data) || !Array.isArray(data.executionEvents)) return paths;
  for (const event of data.executionEvents) {
    if (!isPlainObject(event) || event.type !== 'ARRAY_ACCESS' || !isPlainObject(event.data)) continue;
    if (arrayName && (typeof event.data.name !== 'string' || !arrayNameMatches(event.data.name, arrayName))) continue;
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
    if (typeof eventArrayName === 'string' && !arrayNameMatches(eventArrayName, arrayName)) return;
    if (!Array.isArray(changes)) return;
    for (const change of changes) {
      if (!isPlainObject(change) || !Array.isArray(change.indices)) continue;
      // A trace may report a write operation even when the stored value is
      // unchanged. Don't replay a "changed cell" animation for a no-op write.
      if ('before' in change && 'after' in change && !valueChanged(change.before, change.after)) continue;
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
    if (arrayName && (typeof eventArrayName !== 'string' || !arrayNameMatches(eventArrayName, arrayName))) return;
    if (!Array.isArray(changes)) return;
    for (const change of changes) {
      if (!isPlainObject(change) || !Array.isArray(change.indices) ||
          !change.indices.every(index => typeof index === 'number' && Number.isInteger(index))) continue;
      if ('before' in change && 'after' in change && !valueChanged(change.before, change.after)) continue;
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
    if (typeof writeData.name === 'string' && !arrayNameMatches(writeData.name, arrayName)) return;
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

function accumulatedArrayIndices(state: TraceState | undefined, arrayName?: string): Set<number> {
  const indices = new Set<number>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data) || !Array.isArray(data.executionEvents)) return indices;
  const events = data.executionEvents.filter(isPlainObject);
  const reads = events.filter(event =>
    event.type === 'ARRAY_ACCESS' &&
    isPlainObject(event.data) &&
    typeof event.data.name === 'string' &&
    arrayNameMatches(event.data.name, arrayName) &&
    Array.isArray(event.data.indices)
  );
  if (reads.length === 0) return indices;

  for (const event of events) {
    if (event.type !== 'ARRAY_WRITE' || !isPlainObject(event.data)) continue;
    const write = event.data;
    if (typeof write.name === 'string' && !arrayNameMatches(write.name, arrayName)) continue;
    if (!Array.isArray(write.changes)) continue;
    for (const change of write.changes) {
      if (!isPlainObject(change) || !Array.isArray(change.indices) ||
          change.indices.length !== 1 || typeof change.indices[0] !== 'number' ||
          !Number.isInteger(change.indices[0]) || !('before' in change) || !('after' in change) ||
          !valueChanged(change.before, change.after)) continue;
      const destination = change.indices[0];
      const readsAnotherCell = reads.some(read =>
        isPlainObject(read.data) &&
        Array.isArray(read.data.indices) &&
        read.data.indices.length === 1 &&
        typeof read.data.indices[0] === 'number' &&
        read.data.indices[0] !== destination
      );
      if (readsAnotherCell) indices.add(destination);
    }
  }
  return indices;
}

function copiedArrayIndices(state: TraceState | undefined, arrayName?: string): Set<number> {
  const indices = new Set<number>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data) || !Array.isArray(data.executionEvents)) return indices;

  const events = data.executionEvents.filter(isPlainObject);
  const sourceReads = events.filter(event =>
    event.type === 'ARRAY_ACCESS' &&
    isPlainObject(event.data) &&
    typeof event.data.name === 'string' &&
    !arrayNameMatches(event.data.name, arrayName)
  );
  if (sourceReads.length === 0) return indices;

  for (const event of events) {
    if (event.type !== 'ARRAY_WRITE' || !isPlainObject(event.data)) continue;
    const write = event.data;
    if (typeof write.name === 'string' && !arrayNameMatches(write.name, arrayName)) continue;
    if (!Array.isArray(write.changes)) continue;
    for (const change of write.changes) {
      if (!isPlainObject(change) || !Array.isArray(change.indices) ||
          change.indices.length !== 1 || typeof change.indices[0] !== 'number' ||
          !Number.isInteger(change.indices[0]) || !('before' in change) || !('after' in change)) continue;
      // Only animate a genuine value update, not a repeated write of the same value.
      if (valueChanged(change.before, change.after)) indices.add(change.indices[0]);
    }
  }
  return indices;
}

function rotatedArrayIndices(state?: TraceState, arrayName?: string): Map<number, 'left' | 'right'> {
  const directions = new Map<number, 'left' | 'right'>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return directions;

  const inspectWrite = (writeData: Obj) => {
    if (typeof writeData.name === 'string' && !arrayNameMatches(writeData.name, arrayName)) return;
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

    // Infer a rotation only when this trace event contains the full contiguous
    // segment and each destination receives its cyclic neighbor's old value.
    if (changes.length < 3) return;
    for (let i = 1; i < changes.length; i++) {
      if (changes[i]!.index !== changes[i - 1]!.index + 1) return;
    }
    if (!changes.every(change => valueChanged(change.before, change.after))) return;

    const leftMatches = changes.every((change, i) =>
      !valueChanged(change.after, changes[(i + 1) % changes.length]!.before)
    );
    const rightMatches = changes.every((change, i) =>
      !valueChanged(change.after, changes[(i - 1 + changes.length) % changes.length]!.before)
    );
    if (leftMatches === rightMatches) return;
    for (const change of changes) directions.set(change.index, leftMatches ? 'left' : 'right');
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

function swappedMatrixPaths(state: TraceState | undefined, arrayName?: string): Set<string> {
  const paths = new Set<string>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return paths;

  const writes: Obj[] = [];
  if (state?.lastEvent?.type === 'ARRAY_WRITE') writes.push(data);
  if (Array.isArray(data.executionEvents)) {
    for (const event of data.executionEvents) {
      if (isPlainObject(event) && event.type === 'ARRAY_WRITE' && isPlainObject(event.data)) {
        writes.push(event.data);
      }
    }
  }

  for (const write of writes) {
    if (arrayName && (typeof write.name !== 'string' || !arrayNameMatches(write.name, arrayName))) continue;
    if (!Array.isArray(write.changes)) continue;
    const changes = write.changes.filter((change): change is Obj =>
      isPlainObject(change) &&
      Array.isArray(change.indices) &&
      change.indices.length === 2 &&
      change.indices.every(index => typeof index === 'number' && Number.isInteger(index)) &&
      'before' in change &&
      'after' in change &&
      valueChanged(change.before, change.after)
    ).map(change => ({
      path: (change.indices as number[]).join(','),
      before: change.before,
      after: change.after,
    }));

    // Only mark cells when the trace proves an actual two-cell exchange.
    // This also covers row swaps: each changed column is paired independently.
    for (let i = 0; i < changes.length; i++) {
      const first = changes[i]!;
      for (let j = i + 1; j < changes.length; j++) {
        const second = changes[j]!;
        if (first.path === second.path) continue;
        if (!valueChanged(first.before, second.after) && !valueChanged(first.after, second.before)) {
          paths.add(first.path);
          paths.add(second.path);
        }
      }
    }
  }
  return paths;
}

function MatrixView({ value, state, source, arrayName, depth, seen }: {
  value: unknown[][];
  state?: TraceState;
  source: string;
  arrayName?: string;
  depth: number;
  seen: Set<string>;
}) {
  const rows = value;
  const rowCount = rows.length;
  const columnCount = Math.max(0, ...rows.map(row => row.length));
  const readPaths = accessedArrayPaths(state, arrayName);
  const writtenPaths = changedArrayPaths(state, arrayName);
  const swappedPaths = swappedMatrixPaths(state, arrayName);
  const comparedPaths = isComparisonStatement(source, state) && readPaths.size >= 2 ? readPaths : new Set<string>();
  const indexNames = matrixIndexVariableNames(source, arrayName);
  const targets = matrixPointerTargets(state, rowCount, columnCount, indexNames);
  const activeRows = new Set(targets.rows.map(target => target.index));
  const activeColumns = new Set(targets.columns.map(target => target.index));
  // Runtime access coordinates are authoritative for the active matrix cell.
  // During row = mid / n and col = mid % n, one coordinate can be new while
  // the other is still from the previous iteration. Do not render that
  // temporary Cartesian-product intersection as if it had been accessed.
  const eventData = state?.lastEvent?.data;
  const hasAuthoritativeAccessEvents = isPlainObject(eventData) && Array.isArray(eventData.executionEvents);
  const activeCells = new Set<string>();
  if (hasAuthoritativeAccessEvents) {
    for (const path of readPaths) {
      const [rowText, columnText] = path.split(',');
      const row = Number(rowText);
      const column = Number(columnText);
      if (
        Number.isInteger(row) && Number.isInteger(column) &&
        row >= 0 && row < rowCount &&
        column >= 0 && column < (rows[row]?.length ?? 0)
      ) activeCells.add(path);
    }
  } else {
    // Compatibility fallback for older/synthetic states without execution events.
    for (const row of activeRows) for (const column of activeColumns) activeCells.add(row + ',' + column);
  }
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

    const layoutPointers = () => {
      const x: Record<string, number> = {};
      const y: Record<string, number> = {};
      const movingRows = new Set<string>();
      const movingColumns = new Set<string>();
      const next = new Map<string, number>();
      const labels = new Map<string, HTMLElement>();
      host.querySelectorAll<HTMLElement>('[data-matrix-pointer]').forEach(label => {
        const name = label.dataset.matrixPointer;
        if (name) labels.set(name, label);
      });
      const columnGroups = new Map<number, typeof targets.columns>();
      const rowGroups = new Map<number, typeof targets.rows>();

      for (const target of targets.columns) {
        const header = matrixCellRefs.current['__col,' + target.index];
        if (!header) continue;
        const group = columnGroups.get(target.index) ?? [];
        group.push(target);
        columnGroups.set(target.index, group);
        const key = 'c:' + target.name;
        const previous = previousMatrixTargets.current.get(key);
        if (previous !== undefined && previous !== target.index) movingColumns.add(target.name);
        next.set(key, target.index);
      }
      for (const [index, group] of columnGroups) {
        const header = matrixCellRefs.current['__col,' + index];
        if (!header) continue;
        const center = header.offsetLeft + header.offsetWidth / 2;
        const gap = 4;
        const widths = group.map(target => labels.get(target.name)?.offsetWidth ?? Math.max(24, target.name.length * 7 + 10));
        let left = center - (widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, group.length - 1)) / 2;
        group.forEach((target, i) => {
          x[target.name] = left + widths[i]! / 2;
          left += widths[i]! + gap;
        });
      }

      for (const target of targets.rows) {
        // Anchor to the row fragment, not column zero: jagged matrices may
        // contain an empty row with no [row, 0] cell to measure.
        const cell = matrixCellRefs.current['__row,' + target.index];
        if (!cell) continue;
        const group = rowGroups.get(target.index) ?? [];
        group.push(target);
        rowGroups.set(target.index, group);
        const key = 'r:' + target.name;
        const previous = previousMatrixTargets.current.get(key);
        if (previous !== undefined && previous !== target.index) movingRows.add(target.name);
        next.set(key, target.index);
      }
      for (const [index, group] of rowGroups) {
        const cell = matrixCellRefs.current['__row,' + index];
        if (!cell) continue;
        const center = cell.offsetTop + cell.offsetHeight / 2;
        const gap = 3;
        const heights = group.map(target => labels.get(target.name)?.offsetHeight ?? 16);
        let top = center - (heights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, group.length - 1)) / 2;
        group.forEach((target, i) => {
          y[target.name] = top + heights[i]! / 2;
          top += heights[i]! + gap;
        });
      }
      previousMatrixTargets.current = next;
      setMatrixPointerLayout({ x, y, movingRows, movingColumns });
    };

    layoutPointers();
    // Matrix columns can resize independently as values change, so pointer
    // coordinates must be remeasured after responsive/layout changes too.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(layoutPointers);
    observer.observe(host);
    Object.values(matrixCellRefs.current).forEach(cell => { if (cell) observer.observe(cell); });
    return () => observer.disconnect();
  }, [targetSignature, state?.sequence, rowCount, columnCount]);

  return (
    <div
      className="yv-matrix yv-matrix-grid"
      ref={matrixRef}
      data-matrix-empty={rowCount === 0 ? 'true' : undefined}
      style={{ gridTemplateColumns: `62px repeat(${columnCount}, minmax(36px, max-content))` }}
    >
      <div className="yv-matrix-corner" />
      {rowCount === 0 && <div className="yv-empty yv-matrix-empty-state">Empty matrix · 0 rows</div>}
      {Array.from({ length: columnCount }, (_, column) => (
        <div
          className={`yv-matrix-column-index ${activeColumns.has(column) ? 'yv-matrix-axis-active' : ''}`}
          key={'column-' + column}
          ref={element => { matrixCellRefs.current['__col,' + column] = element; }}
        >{column}</div>
      ))}
      {rows.map((row, r) => (
        <div className="yv-matrix-row-fragment" key={'row-' + r}>
          <div
            className={`yv-matrix-row-index ${activeRows.has(r) ? 'yv-matrix-axis-active' : ''}`}
            ref={element => { matrixCellRefs.current['__row,' + r] = element; }}
          >{r}</div>
          {Array.from({ length: columnCount }, (_, column) => {
            const path = r + ',' + column;
            const exists = column < row.length;
            const active = activeCells.has(path) && exists;
            return (
              <div
                className={`yv-matrix-cell ${exists ? '' : 'yv-matrix-cell-empty'} ${active ? 'yv-matrix-cell-active' : ''}`}
                key={path}
                ref={element => { matrixCellRefs.current[path] = element; }}
              >
                <div
                  key={`${path}-${state?.sequence ?? state?.line ?? 'initial'}`}
                  className={`yv-cell-value ${comparedPaths.has(path) ? 'yv-cell-compared ' : ''}${readPaths.has(path) ? 'yv-cell-read ' : ''}${writtenPaths.has(path) ? 'yv-cell-written ' : ''}${swappedPaths.has(path) ? 'yv-matrix-cell-swapped' : ''}`}
                >
                  {exists
                    ? <DataValue value={row[column]} state={state} source={source} depth={depth + 1} seen={seen}/>
                    : <span className="yv-matrix-missing">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div className="yv-matrix-pointer-layer" aria-hidden="true">
        {targets.columns.map(target => (
          <div
            key={'c:' + target.name}
            data-matrix-pointer={target.name}
            className={`yv-matrix-pointer yv-matrix-pointer-column ${matrixPointerLayout.movingColumns.has(target.name) ? 'is-moving' : ''}`}
            style={{ transform: `translate3d(${matrixPointerLayout.x[target.name] ?? 0}px, 0, 0) translateX(-50%)` }}
          >{target.name}</div>
        ))}
        {targets.rows.map(target => (
          <div
            key={'r:' + target.name}
            data-matrix-pointer={target.name}
            className={`yv-matrix-pointer yv-matrix-pointer-row ${matrixPointerLayout.movingRows.has(target.name) ? 'is-moving' : ''}`}
            style={{ transform: `translate3d(0, ${matrixPointerLayout.y[target.name] ?? 0}px, 0) translateY(-50%)` }}
          >{target.name}</div>
        ))}
        {targets.rows.flatMap(rowTarget =>
          targets.columns
            .filter(columnTarget => {
              const path = rowTarget.index + ',' + columnTarget.index;
              const cellExists = columnTarget.index < (rows[rowTarget.index]?.length ?? 0);
              return cellExists && (!hasAuthoritativeAccessEvents || readPaths.has(path));
            })
            .map(columnTarget => (
              <div
                key={`intersection:${rowTarget.name}:${columnTarget.name}`}
                className="yv-matrix-pointer yv-matrix-pointer-intersection"
                data-matrix-intersection={`${rowTarget.name},${columnTarget.name}`}
                data-matrix-cell={`[${rowTarget.index},${columnTarget.index}]`}
                style={{
                  transform: `translate3d(${matrixPointerLayout.x[columnTarget.name] ?? 0}px, ${matrixPointerLayout.y[rowTarget.name] ?? 0}px, 0) translate(-50%, -100%)`
                }}
              >{rowTarget.name} · {columnTarget.name}</div>
            ))
        )}
      </div>
    </div>
  );
}

export function ArrayView({ value, state, source, arrayName, depth = 0, seen = new Set<string>(), nestedItems = false }: {
  value: unknown[];
  state?: TraceState;
  source: string;
  arrayName?: string;
  depth?: number;
  seen?: Set<string>;
  /** A collection's elements are nested containers, not a Java 2D matrix. */
  nestedItems?: boolean;
}) {
  // Preserve collection-of-collections rendering while recognizing empty
  // Java matrices from their two-dimensional indexed access.
  const matrixAccess = /\b[A-Za-z_$][\w$]*\s*\[[^\]]+\]\s*\[[^\]]+\]/.test(source) &&
    (!arrayName || source.includes(arrayName));
  const matrixLike = !nestedItems && (
    value.length > 0
      ? value.every(row => Array.isArray(row) || isArraySnapshot(row))
      : matrixAccess
  );
  if (matrixLike) {
    const rows = value.map(row => Array.isArray(row) ? row : isArraySnapshot(row) ? row.values : []);
    return <MatrixView value={rows} state={state} source={source} arrayName={arrayName} depth={depth} seen={seen}/>;
  }

  const containsNestedCollections = nestedItems || value.some(item => isCollectionSnapshot(item) || isArraySnapshot(item) || Array.isArray(item));
  const indexNames = arrayIndexVariableNames(source, arrayName);
  const targets = pointerTargets(state, value.length, indexNames, arrayName, source);
  const targetSignature = targets.map(target => target.name + ':' + target.index).sort().join('|');
  const arrayRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const previousTargets = useRef<Map<string, number>>(new Map());
  // A variable name such as "index" is reused by every recursive invocation.
  // Do not animate a pointer from the caller's index to the callee's index as
  // if it were one continuous pointer; each invocation owns its own frame.
  const previousPointerInvocation = useRef<string | undefined>(state?.invocationId);
  const [pointerLayout, setPointerLayout] = useState<{ offsets: Record<string, number>; moving: Set<string> }>({ offsets: {}, moving: new Set() });

  useLayoutEffect(() => {
    const host = arrayRef.current;
    if (!host) return;

    // Recursive frames commonly reuse the same local names with different
    // values. Reset transition history on frame changes so labels snap to the
    // current checkpoint rather than animating from a different stack frame.
    if (previousPointerInvocation.current !== state?.invocationId) {
      previousPointerInvocation.current = state?.invocationId;
      previousTargets.current.clear();
    }

    const layoutPointers = () => {
      const offsets: Record<string, number> = {};
      const moving = new Set<string>();
      const next = new Map<string, number>();
      const labels = new Map<string, HTMLElement>();
      host.querySelectorAll<HTMLElement>('[data-array-pointer]').forEach(label => {
        const name = label.dataset.arrayPointer;
        if (name) labels.set(name, label);
      });

      // Group pointers on the same cell and lay their measured labels side by
      // side. This avoids hiding one index behind another (e.g. left/right).
      const groups = new Map<number, typeof targets>();
      for (const target of targets) {
        // One-past-end cursors use a dedicated sentinel cell, not a real element.
        const cell = cellRefs.current[target.index] ?? null;
        if (!cell) continue;
        const group = groups.get(target.index) ?? [];
        group.push(target);
        groups.set(target.index, group);
        const previous = previousTargets.current.get(target.name);
        if (previous !== undefined && previous !== target.index) moving.add(target.name);
        next.set(target.name, target.index);
      }

      for (const [index, group] of groups) {
        const cell = cellRefs.current[index];
        if (!cell) continue;
        const center = cell.offsetLeft + cell.offsetWidth / 2;
        const gap = 5;
        const widths = group.map(target => labels.get(target.name)?.offsetWidth ?? Math.max(24, target.name.length * 7 + 10));
        const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, group.length - 1);
        let left = center - totalWidth / 2;
        group.forEach((target, i) => {
          offsets[target.name] = left + widths[i]! / 2;
          left += widths[i]! + gap;
        });
      }

      previousTargets.current = next;
      setPointerLayout({ offsets, moving });
    };

    layoutPointers();
    // Keep labels aligned when responsive layout, fonts, or cell contents alter
    // widths, not only when the traced index changes.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(layoutPointers);
    observer.observe(host);
    Object.values(cellRefs.current).forEach(cell => { if (cell) observer.observe(cell); });
    host.querySelectorAll<HTMLElement>('[data-array-pointer]').forEach(label => observer.observe(label));
    return () => observer.disconnect();
  }, [targetSignature, state?.sequence, state?.invocationId, value.length]);

  const enhancedBinding = enhancedForBinding(source, state, arrayName, value);
  const changed = changedArrayIndices(state, arrayName);
  const accessed = accessedArrayIndices(state, arrayName);
  const compared = isComparisonStatement(source, state) && accessed.size >= 2 ? accessed : new Set<number>();
  const swapped = swappedArrayIndices(state, arrayName);
  const rotated = rotatedArrayIndices(state, arrayName);
  const copied = copiedArrayIndices(state, arrayName);
  const accumulated = accumulatedArrayIndices(state, arrayName);
  const shifted = shiftedArrayIndices(state, arrayName);
  const rangeStart = targets.length >= 2 ? Math.min(...targets.map(target => target.index)) : -1;
  const rangeEnd = targets.length >= 2 ? Math.max(...targets.map(target => target.index)) : -1;

  return (
    <div className={`yv-array yv-array-pointer-host ${targets.length ? 'has-pointers' : ''} ${containsNestedCollections ? 'yv-array-nested-collections' : ''}`} ref={arrayRef} style={enhancedBinding ? { paddingTop: 52, paddingLeft: 44, boxSizing: 'border-box' } : undefined}>
      <div className="yv-pointer-layer" aria-hidden="true">
        {targets.map(target => (
          <div
            key={target.name}
            data-array-pointer={target.name}
            className={`yv-pointer ${target.index === value.length ? 'yv-pointer-out-of-bounds' : ''} ${pointerLayout.moving.has(target.name) ? 'yv-pointer-moving' : ''}`}
            style={{ transform: `translate3d(${pointerLayout.offsets[target.name] ?? 0}px, 0, 0) translateX(-50%)` }}
          >{target.name}</div>
        ))}
      </div>
      {value.map((item, index) => (
        <div className="yv-cell" key={index} ref={element => { cellRefs.current[index] = element; }} style={enhancedBinding?.index === index ? { position: "relative" } : undefined}>
          {enhancedBinding?.index === index && <EnhancedForValueCard binding={enhancedBinding} alignStart={index === 0} />}
          <div
            className={`yv-cell-value ${rangeStart >= 0 && index >= rangeStart && index <= rangeEnd ? 'yv-cell-range ' : ''}${rangeStart >= 0 && index === rangeStart ? 'yv-cell-range-start ' : ''}${rangeEnd >= 0 && index === rangeEnd && rangeEnd !== rangeStart ? 'yv-cell-range-end ' : ''}${changed.has(index) ? 'yv-cell-written ' : ''}${accessed.has(index) ? 'yv-cell-read ' : ''}${compared.has(index) ? 'yv-cell-compared ' : ''}${accumulated.has(index) && !copied.has(index) ? 'yv-cell-accumulated ' : ''}${copied.has(index) ? 'yv-cell-copied ' : ''}${rotated.has(index) ? 'yv-cell-rotated-' + rotated.get(index) + ' ' : ''}${swapped.has(index) ? 'yv-cell-swapped' : ''}`}
          >
            <div className={`yv-array-cell-content ${swapped.has(index) ? 'yv-array-cell-content-swapped' : ''}${rotated.has(index) ? ' yv-array-cell-content-rotate-' + rotated.get(index) : shifted.has(index) ? ' yv-array-cell-content-shift-' + shifted.get(index) : ''}`}>
              <DataValue
                value={item}
                state={state}
                source={source}
                name={arrayName}
                depth={depth + 1}
                seen={seen}
                nestedArrayItem={containsNestedCollections}
              />
            </div>
          </div>
          <div className="yv-cell-index">{index}</div>
        </div>
      ))}
      {targets.some(target => target.index === value.length) && (
        <div className="yv-cell yv-array-end-slot" key="array-end" ref={element => { cellRefs.current[value.length] = element; }}>
          <div className="yv-cell-value yv-array-end-marker" title="One past the last element" aria-label="Array boundary, not an element">×</div>
          <div className="yv-cell-index">{value.length}</div>
        </div>
      )}
    </div>
  );
}

function mapSnapshotCandidates(state?: TraceState): unknown[] {
  const candidates: unknown[] = [
    ...Object.values(state?.variables ?? {}),
    ...Object.values(state?.dataStructures ?? {})
  ];
  const thisValue = state?.variables?.this;
  if (isPlainObject(thisValue) && isPlainObject(thisValue.fields)) {
    candidates.push(...Object.values(thisValue.fields));
  }
  const thisId = isPlainObject(thisValue)
    ? (typeof thisValue.$objectId === 'string' ? thisValue.$objectId
      : typeof thisValue.$ref === 'string' ? thisValue.$ref : undefined)
    : undefined;
  const thisObject = thisId ? state?.objects?.[thisId] : undefined;
  if (isPlainObject(thisObject)) candidates.push(...Object.values(objectFields(thisObject)));
  return candidates;
}

function mapChanges(state?: TraceState, mapId?: string): Array<{
  kind: 'insert' | 'update' | 'delete';
  key: unknown;
  before?: unknown;
  after?: unknown;
}> {
  const data = state?.lastEvent?.data;
  const changes: unknown[] = [];
  if (isPlainObject(data)) {
    // A trace step may carry writes for several maps. Never apply a write to
    // a different map just because its key happens to compare equal.
    if (Array.isArray(data.changes) &&
        (typeof data.mapId !== 'string' || data.mapId === mapId)) {
      changes.push(...data.changes);
    }
    if (Array.isArray(data.executionEvents)) {
      for (const event of data.executionEvents) {
        if (!isPlainObject(event) || event.type !== 'MAP_WRITE' || !isPlainObject(event.data)) continue;
        if (typeof event.data.mapId === 'string' && event.data.mapId !== mapId) continue;
        if (Array.isArray(event.data.changes)) changes.push(...event.data.changes);
      }
    }
  }

  const authoritative = changes.filter(
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
  const collapseSameKeyWrites = (input: typeof authoritative) => {
    const grouped = new Map<string, {
      key: unknown;
      firstKind: 'insert' | 'update' | 'delete';
      lastKind: 'insert' | 'update' | 'delete';
      before?: unknown;
      after?: unknown;
    }>();
    for (const change of input) {
      const signature = mapKeySignature(change.key);
      const previous = grouped.get(signature);
      if (!previous) {
        grouped.set(signature, {
          key: change.key,
          firstKind: change.kind,
          lastKind: change.kind,
          before: change.before,
          after: change.kind === 'delete' ? undefined : change.after
        });
      } else {
        previous.lastKind = change.kind;
        if (previous.before === undefined && change.kind !== 'insert' && change.before !== undefined) {
          previous.before = change.before;
        }
        previous.after = change.kind === 'delete' ? undefined : change.after;
      }
    }
    const collapsed: typeof authoritative = [];
    for (const change of grouped.values()) {
      // A transient insert followed by delete has no visible final-state delta.
      if (change.firstKind === 'insert' && change.lastKind === 'delete') continue;
      const kind = change.firstKind === 'insert' ? 'insert' :
        change.lastKind === 'delete' ? 'delete' :
        change.firstKind === 'delete' && change.lastKind === 'insert' ? 'update' :
        change.firstKind === 'delete' ? 'delete' : 'update';
      collapsed.push({
        kind,
        key: change.key,
        ...(kind === 'insert' ? {} : change.before !== undefined ? { before: change.before } : {}),
        ...(kind === 'delete' ? {} : change.after !== undefined ? { after: change.after } : {})
      });
    }
    return collapsed;
  };
  if (authoritative.length) return collapseSameKeyWrites(authoritative);
  if (!state || !mapId) return [];

  // Some runtime checkpoints contain exact before/after snapshots but no MAP_WRITE
  // payload. Derive only the concrete map delta between adjacent captured states.
  const session = sessionStore.get();
  const currentIndex = session.states.findIndex(candidate =>
    candidate === state || (state.sequence !== undefined && candidate.sequence === state.sequence)
  );
  if (currentIndex <= 0) return [];
  const previousState = session.states[currentIndex - 1];
  const previousMap = mapSnapshotCandidates(previousState).find(candidate =>
    isPlainObject(candidate) && candidate.$mapId === mapId && Array.isArray(candidate.entries)
  );
  const currentMap = mapSnapshotCandidates(state).find(candidate =>
    isPlainObject(candidate) && candidate.$mapId === mapId && Array.isArray(candidate.entries)
  );
  if (!isPlainObject(previousMap) || !isPlainObject(currentMap)) return [];
  return compareMapEntries(
    previousMap.entries as Array<{ key: unknown; value: unknown }>,
    currentMap.entries as Array<{ key: unknown; value: unknown }>
  );
}

function mapReorderedKeys(
  state: TraceState | undefined,
  mapId: string,
  currentEntries: Array<{ key: unknown; value: unknown }>
): Set<string> {
  if (!state) return new Set<string>();
  const session = sessionStore.get();
  const currentIndex = session.states.findIndex(candidate =>
    candidate === state || (state.sequence !== undefined && candidate.sequence === state.sequence)
  );
  if (currentIndex <= 0) return new Set<string>();
  const previousState = session.states[currentIndex - 1];
  const previousMap = mapSnapshotCandidates(previousState).find(candidate =>
    isPlainObject(candidate) && candidate.$mapId === mapId && Array.isArray(candidate.entries)
  );
  if (!isPlainObject(previousMap) || !Array.isArray(previousMap.entries) ||
      previousMap.entries.length !== currentEntries.length) return new Set<string>();
  const previousIndices = new Map<string, number>();
  (previousMap.entries as Array<{ key: unknown }>).forEach((entry, index) =>
    previousIndices.set(mapKeySignature(entry.key), index)
  );
  const currentIndices = new Map<string, number>();
  currentEntries.forEach((entry, index) => currentIndices.set(mapKeySignature(entry.key), index));
  if (previousIndices.size !== currentIndices.size ||
      [...previousIndices.keys()].some(key => !currentIndices.has(key))) return new Set<string>();
  const moved = new Set<string>();
  for (const [key, index] of currentIndices) {
    if (previousIndices.get(key) !== index) moved.add(key);
  }
  return moved;
}

function isStructuredMapValue(value: unknown): boolean {
  return isMapSnapshot(value) ||
    isCollectionSnapshot(value) ||
    isArraySnapshot(value) ||
    Array.isArray(value) ||
    (isPlainObject(value) && (
      typeof value.$objectId === 'string' ||
      typeof value.$ref === 'string' ||
      isPlainObject(value.fields)
    ));
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
  const changes = mapChanges(state, value.$mapId);
  const typeName = typeof value.$type === 'string' ? value.$type.split('.').pop() : '';
  const accessOrdered = typeName === 'LinkedHashMap' &&
    /new\s+LinkedHashMap\s*<[^>]*>\s*\(\s*[^,]+,\s*[^,]+,\s*true\s*\)/s.test(source);
  const reorderedKeys = typeName === 'LinkedHashMap'
    ? mapReorderedKeys(state, value.$mapId, value.entries)
    : new Set<string>();

  const findChange = (key: unknown) =>
    changes.find(
      change =>
        mapKeySignature(change.key) ===
        mapKeySignature(key)
    );

  const deleted = changes.filter(
    change => change.kind === 'delete'
  );
  const mapTableRef = useRef<HTMLDivElement | null>(null);
  const previousMapRowRects = useRef<Map<string, DOMRect>>(new Map());
  const mapRowAnimations = useRef<WeakMap<HTMLElement, Animation>>(new WeakMap());
  useLayoutEffect(() => {
    const table = mapTableRef.current;
    if (!table) return;
    const reduceMotion = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rows = Array.from(table.querySelectorAll<HTMLElement>(':scope > .yv-map-row[data-map-key-identity]'));
    const nextRects = new Map<string, DOMRect>();
    for (const row of rows) {
      const key = row.dataset.mapKeyIdentity;
      if (!key) continue;
      mapRowAnimations.current.get(row)?.cancel();
      const rect = row.getBoundingClientRect();
      nextRects.set(key, rect);
      const before = previousMapRowRects.current.get(key);
      if (!reduceMotion && before && !row.classList.contains('yv-map-insert')) {
        const dx = before.left - rect.left;
        const dy = before.top - rect.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          mapRowAnimations.current.set(row, row.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 230, easing: 'cubic-bezier(.2,.75,.25,1)' }
          ));
        }
      }
    }
    previousMapRowRects.current = nextRects;
  });

  return (
    <div className="yv-hashmap" data-map-id={value.$mapId}>
      <div className="yv-map-meta">
        <span>
          {typeof value.$type === 'string'
            ? value.$type.split('.').pop()
            : 'Map'}
        </span>
        <span>{typeof value.$type === 'string' && value.$type.endsWith('TreeMap')
          ? 'SORTED BY KEY · ' + value.entries.length + ' entries'
          : typeof value.$type === 'string' && value.$type.endsWith('LinkedHashMap')
            ? (accessOrdered ? 'ACCESS ORDER · ' : 'INSERTION ORDER · ') + value.entries.length + ' entries'
            : value.entries.length + ' entries'}</span>
      </div>

      <div ref={mapTableRef} className={"yv-map-table" + (deleted.length ? ' yv-map-delete-pulse' : '')}
        data-map-delete-count={deleted.length || undefined}>
        <div className="yv-map-header">
          <div>Key</div>
          <div>Value</div>
        </div>

        {!value.entries.length && <div className="yv-empty yv-map-empty">Empty map</div>}
        {value.entries.map((entry, index) => {
          const change = findChange(entry.key);

          return (
            <div
              className={`yv-map-row ${change ? `yv-map-${change.kind}` : ''}${reorderedKeys.has(mapKeySignature(entry.key)) ? ' yv-map-reordered' : ''}`}
              key={mapKeySignature(entry.key)} data-map-key-identity={mapKeySignature(entry.key)}
              data-map-reordered={reorderedKeys.has(mapKeySignature(entry.key)) ? 'true' : undefined}
            >
              <div className="yv-map-key">
                <DataValue value={entry.key} state={state} source={source} depth={depth + 1} seen={seen}/>
              </div>

              <div className="yv-map-value">
                {change?.kind === 'update' &&
                  !(isStructuredMapValue(change.before) && isStructuredMapValue(entry.value)) ? (
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
          <div className="yv-map-row yv-map-delete" key={`deleted-${mapKeySignature(change.key)}-${index}`}
            data-map-key-identity={mapKeySignature(change.key)} data-map-deleted="true">
            <div className="yv-map-key">
              <DataValue value={change.key} state={state} source={source} depth={depth + 1} seen={seen} resolveObjects={false}/>
            </div>
            <div className="yv-map-value">
              <DataValue value={change.before} state={state} source={source} depth={depth + 1} seen={seen} resolveObjects={false}/>
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
function looksTreeNode(value: Obj): boolean {
  const fields = objectFields(value);
  const hasValue = 'val' in fields || 'value' in fields || 'data' in fields;
  const hasChildren = 'left' in fields || 'right' in fields || ('children' in fields && hasValue);
  return /TreeNode/i.test(objectType(value)) || (hasValue && hasChildren);
}
function resolveRef(value: unknown, objects: Record<string,unknown>): unknown {
  if (!isPlainObject(value)) return value;
  if (typeof value.$ref==='string') return objects[value.$ref] ?? value;
  if (typeof value.$objectId==='string') return objects[value.$objectId] ?? value;
  return value;
}
function nodeValue(value: Obj): unknown { const f=objectFields(value); return f.val ?? f.value ?? f.data ?? f.keys ?? '?'; }

function looksGraphNode(value: Obj): boolean {
  return 'neighbors' in objectFields(value);
}

function graphNeighborValues(value: Obj): unknown[] | undefined {
  const fields = objectFields(value);
  if (!('neighbors' in fields)) return undefined;
  const neighbors = fields.neighbors;
  if (Array.isArray(neighbors)) return neighbors;
  if (isPlainObject(neighbors) && Array.isArray(neighbors.values)) return neighbors.values;
  return neighbors == null ? [] : undefined;
}

function graphReferenceId(value: unknown, objects: Record<string, unknown>): string | undefined {
  if (!isPlainObject(value)) return undefined;
  if (typeof value.$objectId === 'string') return value.$objectId;
  if (typeof value.$ref === 'string') return value.$ref;
  const resolved = resolveRef(value, objects);
  if (isPlainObject(resolved) && typeof resolved.$objectId === 'string') return resolved.$objectId;
  return undefined;
}

function looksTrieNode(value: Obj): boolean {
  const fields = objectFields(value);
  return /TrieNode/i.test(objectType(value)) ||
    ('children' in fields && ['isEnd', 'isWord', 'endOfWord', 'isEndOfWord', 'terminal', 'isTerminal'].some(name => name in fields));
}

function trieChildEntries(value: Obj, source: string): Array<{ label: string; target: unknown }> {
  const children = objectFields(value).children;
  const characterIndexed = /children\s*\[\s*[A-Za-z_$][\w$]*\s*-\s*['"]a['"]\s*\]/.test(source);
  if (isPlainObject(children) && Array.isArray(children.entries)) {
    return children.entries.flatMap((entry: unknown) => {
      if (!isPlainObject(entry) || entry.value == null) return [];
      return [{ label: typeof entry.key === 'string' ? entry.key : displayValue(entry.key), target: entry.value }];
    });
  }
  const values = Array.isArray(children) ? children :
    isPlainObject(children) && Array.isArray(children.values) ? children.values : undefined;
  if (values) {
    return values.flatMap((target, index) => target == null ? [] : [{
      label: characterIndexed && index < 26 ? String.fromCharCode(97 + index) : '[' + index + ']',
      target,
    }]);
  }
  if (isPlainObject(children)) {
    return Object.entries(children).flatMap(([label, target]) => target == null ? [] : [{ label, target }]);
  }
  return [];
}

function trieTerminal(value: Obj): boolean {
  const fields = objectFields(value);
  return ['isEnd', 'isWord', 'endOfWord', 'isEndOfWord', 'terminal', 'isTerminal']
    .some(name => fields[name] === true);
}

export function TrieView({ objects, variables = {}, source = '', state }: {
  objects: Record<string, unknown>;
  variables?: Record<string, unknown>;
  source?: string;
  state?: TraceState;
}) {
  const session = sessionStore.get();
  const selectedIndex = state ? session.states.indexOf(state) : -1;
  const previous = selectedIndex > 0 ? session.states[selectedIndex - 1] : undefined;
  const previousObjects = previous?.objects ?? {};
  const changedNodeIds = new Set<string>();
  const enteredNodeIds = new Set<string>();
  const createdNodeIds = new Set<string>();
  if (state && previous && session.states.includes(state)) {
    for (const [key, value] of Object.entries(objects)) {
      if (!isPlainObject(value) || !looksTrieNode(value)) continue;
      const id = typeof value.$objectId === 'string' ? value.$objectId : key;
      const before = previousObjects[id];
      if (before === undefined) createdNodeIds.add(id);
      else if (stableStringify(before) !== stableStringify(value)) changedNodeIds.add(id);
    }
    for (const [name, value] of Object.entries(variables)) {
      const currentId = graphReferenceId(value, objects);
      const previousId = graphReferenceId(previous.variables[name], previousObjects);
      if (currentId && currentId !== previousId) enteredNodeIds.add(currentId);
    }
  }
  const nodes = Object.entries(objects).flatMap(([key, value]) => {
    if (!isPlainObject(value) || !looksTrieNode(value)) return [];
    const id = typeof value.$objectId === 'string' ? value.$objectId : key;
    return [{ id, value, children: trieChildEntries(value, source), terminal: trieTerminal(value) }];
  }).slice(0, 500);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const childIds = new Set(nodes.flatMap(node => node.children.flatMap(child => {
    const id = graphReferenceId(child.target, objects);
    return id && byId.has(id) ? [id] : [];
  })));
  const roots = nodes.filter(node => !childIds.has(node.id));
  const rootNodes = roots.length ? roots : nodes.slice(0, 1);
  // Adapt trie-labelled edges into the same node/edge model used by binary
  // and N-ary trees. The synthetic root only represents a forest in the model;
  // it is never rendered as a trie node.
  const trieModelRootId = '__yv_trie_model_root__';
  const trieModelRoot = { $objectId: trieModelRootId, $type: 'YourVisionModelRoot', val: 'root',
    children: rootNodes.map(node => ({ $ref: node.id })) };
  const trieModel = buildObjectStructureModel({ $ref: trieModelRootId },
    { ...objects, [trieModelRootId]: trieModelRoot }, {
      referenceFields: [],
      getChildren: (value, fields) => {
        if (value.$objectId === trieModelRootId) {
          return rootNodes.map(node => ({ target: { $ref: node.id }, label: node.id, slot: node.id }));
        }
        return trieChildEntries(value, source).map(child => ({
          target: child.target, label: child.label, slot: child.label,
        }));
      },
    });
  const trieChildEdges = new Map<string, Array<{ id: string; target: string; label?: string }>>();
  for (const edge of trieModel.edges) {
    if (edge.kind !== 'child' || edge.source === trieModelRootId) continue;
    const list = trieChildEdges.get(edge.source) ?? [];
    list.push(edge);
    trieChildEdges.set(edge.source, list);
  }
  const pointerNames = new Map<string, string[]>();
  for (const [name, value] of Object.entries(variables)) {
    const directId = graphReferenceId(value, objects);
    if (directId && byId.has(directId)) {
      pointerNames.set(directId, [...(pointerNames.get(directId) ?? []), name]);
      continue;
    }
    const resolved = directId ? objects[directId] : undefined;
    if (isPlainObject(resolved)) {
      const rootId = graphReferenceId(objectFields(resolved).root, objects);
      if (rootId && byId.has(rootId)) pointerNames.set(rootId, [...(pointerNames.get(rootId) ?? []), name]);
    }
  }

  if (!nodes.length) return <div className="yv-empty">No trie nodes captured.</div>;

  const renderedNodes = new Set<string>();
  const renderNode = (id: string, edgeLabel: string, depth: number, path: Set<string>): React.ReactNode => {
    const node = byId.get(id);
    if (!node) return <span className="yv-code">unresolved</span>;
    if (depth > 12) return <span className="yv-code">…</span>;
    if (path.has(id)) return <span className="yv-code" data-trie-cycle={id}>↻ {id}</span>;
    if (renderedNodes.has(id)) return <span className="yv-code" data-trie-reference={id}>↗ {id}</span>;
    renderedNodes.add(id);
    const nextPath = new Set(path);
    nextPath.add(id);
    const pointers = pointerNames.get(id) ?? [];
    const previousTrieNode = previousObjects[id];
    const previousChildren = isPlainObject(previousTrieNode) && looksTrieNode(previousTrieNode)
      ? trieChildEntries(previousTrieNode, source)
      : [];
    const childSignature = (child: { label: string; target: unknown }, objectMap: Record<string, unknown>) =>
      JSON.stringify([child.label, graphReferenceId(child.target, objectMap) ?? stableStringify(child.target)]);
    const currentChildCounts = new Map<string, number>();
    for (const child of node.children) {
      const signature = childSignature(child, objects);
      currentChildCounts.set(signature, (currentChildCounts.get(signature) ?? 0) + 1);
    }
    const previousChildCounts = new Map<string, number>();
    const removedChildren = previousChildren.flatMap(child => {
      const signature = childSignature(child, previousObjects);
      const occurrence = previousChildCounts.get(signature) ?? 0;
      previousChildCounts.set(signature, occurrence + 1);
      return occurrence < (currentChildCounts.get(signature) ?? 0) ? [] : [{ label: child.label, signature }];
    });
    return (
      <div className={'yv-trie-branch' + (changedNodeIds.has(id) ? ' yv-trie-node-changed' : '') + (enteredNodeIds.has(id) ? ' yv-trie-node-entered' : '') + (createdNodeIds.has(id) ? ' yv-trie-node-created' : '')}
        key={id + ':' + edgeLabel} data-trie-node-id={id} data-trie-changed={changedNodeIds.has(id) ? 'true' : undefined}
        data-trie-entered={enteredNodeIds.has(id) ? 'true' : undefined}
        data-trie-created={createdNodeIds.has(id) ? 'true' : undefined}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 6 }}>
        {edgeLabel && <span data-trie-edge-label={edgeLabel}
    className={enteredNodeIds.has(id) ? 'yv-trie-edge-traversed' : undefined}
    style={{ color: 'var(--yv-muted, #8b9bb4)', fontSize: 11 }}>{edgeLabel}</span>}
        <div className="yv-trie-node" style={{ minWidth: 54, padding: '7px 10px', border: '1px solid var(--yv-accent, #65a9ff)',
          borderRadius: 9, background: changedNodeIds.has(id) ? 'var(--yv-highlight, #203b5b)' : 'var(--yv-panel, #101b2d)', color: 'var(--yv-text, #f3f6ff)', textAlign: 'center', fontSize: 12 }}>
          <div>{node.terminal ? '● WORD END' : '○ PREFIX'}</div>
          <div style={{ color: 'var(--yv-muted, #8b9bb4)', fontSize: 10 }}>{id}</div>
          {pointers.map(pointer => <div key={pointer} style={{ color: 'var(--yv-accent, #65a9ff)', fontSize: 10 }}>{pointer}</div>)}
        </div>
        {((trieChildEdges.get(id)?.length ?? 0) > 0 || removedChildren.length > 0) && (
          <div className="yv-trie-children" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 10, flexWrap: 'wrap',
            borderTop: '1px solid var(--yv-border, #334155)', paddingTop: 8 }}>
            {(trieChildEdges.get(id) ?? []).map((edge, index) => {
              const childId = edge.target;
              const label = edge.label ?? String(index);
              if (!byId.has(childId)) return <span key={edge.id} className="yv-code">[{label}] unresolved</span>;
              return <div key={edge.id} data-trie-edge-id={edge.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {renderNode(childId, label, depth + 1, nextPath)}
              </div>;
            })}
            {removedChildren.map((child, index) => (
              <span key={'removed:' + child.signature + ':' + index} className="yv-trie-edge-removed"
                data-trie-edge-label={child.label} data-trie-edge-status="removed">{child.label} · removed</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="yv-trie" data-trie-node-count={nodes.length}>
      <div className="yv-collection-meta"><span>Trie</span><span>{nodes.length} nodes · {nodes.filter(node => node.terminal).length} word ends{nodes.length === 500 ? ' · display limit reached' : ''}</span></div>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <div className="yv-trie-roots" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 14, minWidth: 'max-content' }}>
          {rootNodes.map(root => renderNode(root.id, 'root', 0, new Set<string>()))}
        </div>
      </div>
    </div>
  );
}

export function GraphView({ objects, variables = {}, state }: {
  objects: Record<string, unknown>;
  variables?: Record<string, unknown>;
  state?: TraceState;
}) {
  const session = sessionStore.get();
  const selectedIndex = state ? session.states.indexOf(state) : -1;
  const previous = selectedIndex > 0 ? session.states[selectedIndex - 1] : undefined;
  const previousObjects = previous?.objects ?? {};
  const changedNodeIds = new Set<string>();
  const enteredNodeIds = new Set<string>();
  const createdNodeIds = new Set<string>();
  if (state && previous && session.states.includes(state)) {
    for (const [key, value] of Object.entries(objects)) {
      if (!isPlainObject(value) || !looksGraphNode(value)) continue;
      const id = typeof value.$objectId === 'string' ? value.$objectId : key;
      const before = previousObjects[id];
      if (before === undefined) createdNodeIds.add(id);
      else if (stableStringify(before) !== stableStringify(value)) changedNodeIds.add(id);
    }
    for (const [name, value] of Object.entries(variables)) {
      const currentId = graphReferenceId(value, objects);
      const previousId = graphReferenceId(previous.variables[name], previousObjects);
      if (currentId && currentId !== previousId) enteredNodeIds.add(currentId);
    }
  }
  const nodes = Object.entries(objects).flatMap(([key, value]) => {
    if (!isPlainObject(value) || !looksGraphNode(value)) return [];
    const id = typeof value.$objectId === 'string' ? value.$objectId : key;
    return [{ id, value, label: nodeValue(value), neighbors: graphNeighborValues(value) ?? [] }];
  }).slice(0, 80);
  const ids = new Set(nodes.map(node => node.id));
  const positionSession = useRef(session.states[0]);
  const stableGraphPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  if (positionSession.current !== session.states[0]) {
    stableGraphPositions.current.clear();
    positionSession.current = session.states[0];
  }
  const stablePositions = stableGraphPositions.current;
  // Lay out the first observed snapshot once. Later vertices take an unused
  // slot; existing vertices never orbit/reflow merely because another is added.
  if (stablePositions.size === 0 && nodes.length) {
    nodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, nodes.length);
      stablePositions.set(node.id, {
        x: 300 + (nodes.length <= 1 ? 0 : 205 * Math.cos(angle)),
        y: 160 + (nodes.length <= 1 ? 0 : 112 * Math.sin(angle)),
      });
    });
  } else {
    const slots = Array.from({ length: 80 }, (_, index) => ({
      x: 30 + (index % 10) * 60,
      y: 20 + Math.floor(index / 10) * 40,
    }));
    for (const node of nodes) {
      if (stablePositions.has(node.id)) continue;
      let hash = 0;
      for (let index = 0; index < node.id.length; index++) hash = (hash * 31 + node.id.charCodeAt(index)) >>> 0;
      let chosen: { x: number; y: number } | undefined;
      let bestDistance = -1;
      for (let offset = 0; offset < slots.length; offset++) {
        const candidate = slots[(hash + offset) % slots.length]!;
        const minDistance = stablePositions.size
          ? Math.min(...[...stablePositions.values()].map(point => Math.hypot(point.x - candidate.x, point.y - candidate.y)))
          : Infinity;
        if (minDistance > bestDistance) {
          bestDistance = minDistance;
          chosen = candidate;
        }
        if (minDistance >= 50) break;
      }
      stablePositions.set(node.id, chosen ?? { x: 300, y: 160 });
    }
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const position = stablePositions.get(node.id);
    if (position) positions.set(node.id, position);
  }
  const traversedEdgePairs = new Set<string>();
  if (previous) {
    for (const [name, currentValue] of Object.entries(variables)) {
      const from = graphReferenceId(previous.variables[name], previousObjects);
      const to = graphReferenceId(currentValue, objects);
      if (from && to && from !== to) traversedEdgePairs.add(from + ':' + to);
    }
  }
  // Compare edge multiplicities, not just endpoint pairs. Adjacency lists can
  // contain parallel edges, so adding/removing one occurrence must not make all
  // edges between the same two nodes look unchanged.
  const edgePairKey = (from: string, to: string) => JSON.stringify([from, to]);
  const previousEdgeCounts = new Map<string, number>();
  const previousEdgeOccurrences: Array<{ key: string; from: string; to: string }> = [];
  if (previous) {
    for (const [objectKey, value] of Object.entries(previousObjects)) {
      if (!isPlainObject(value) || !looksGraphNode(value)) continue;
      const from = typeof value.$objectId === 'string' ? value.$objectId : objectKey;
      if (!ids.has(from)) continue;
      (graphNeighborValues(value) ?? []).forEach((neighbor, index) => {
        const to = graphReferenceId(neighbor, previousObjects);
        if (!to || !ids.has(to)) return;
        const pair = edgePairKey(from, to);
        previousEdgeCounts.set(pair, (previousEdgeCounts.get(pair) ?? 0) + 1);
        previousEdgeOccurrences.push({ key: pair + ':' + index, from, to });
      });
    }
  }
  const currentEdgeCounts = new Map<string, number>();
  const edges = nodes.flatMap(node => node.neighbors.flatMap((neighbor, index) => {
    const target = graphReferenceId(neighbor, objects);
    if (!target || !ids.has(target)) return [];
    const pair = edgePairKey(node.id, target);
    const occurrence = currentEdgeCounts.get(pair) ?? 0;
    currentEdgeCounts.set(pair, occurrence + 1);
    const added = Boolean(previous && occurrence >= (previousEdgeCounts.get(pair) ?? 0));
    return [{ key: pair + ':' + index, from: node.id, to: target, status: added ? 'added' as const :
      traversedEdgePairs.has(node.id + ':' + target) ? 'traversed' as const : 'steady' as const }];
  }));
  const removedCounts = new Map<string, number>();
  const removedEdges = previousEdgeOccurrences.flatMap(edge => {
    const pair = edgePairKey(edge.from, edge.to);
    const occurrence = removedCounts.get(pair) ?? 0;
    removedCounts.set(pair, occurrence + 1);
    if (occurrence < (currentEdgeCounts.get(pair) ?? 0)) return [];
    return [{ key: 'removed:' + edge.key, from: edge.from, to: edge.to, status: 'removed' as const }];
  });
  const pointerNames = new Map<string, string[]>();
  for (const [name, value] of Object.entries(variables)) {
    const id = graphReferenceId(value, objects);
    if (!id || !ids.has(id)) continue;
    pointerNames.set(id, [...(pointerNames.get(id) ?? []), name]);
  }

  if (!nodes.length) return <div className="yv-empty">No graph nodes captured.</div>;

  return (
    <div className="yv-graph" data-graph-node-count={nodes.length} data-graph-edge-count={edges.length}>
      <div className="yv-collection-meta">
        <span>Adjacency graph</span>
        <span>{nodes.length} nodes · {edges.length} links{nodes.length === 80 ? ' · display limit reached' : ''}</span>
      </div>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <div style={{ position: 'relative', width: 600, height: 320, minWidth: 600, margin: '0 auto' }}>
          <svg width="600" height="320" viewBox="0 0 600 320" aria-label="Graph links"
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              <marker id="yv-graph-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 z" fill="var(--yv-muted, #8b9bb4)" />
              </marker>
            </defs>
            {[...edges, ...removedEdges].map(edge => {
              const from = positions.get(edge.from)!;
              const to = positions.get(edge.to)!;
              const stroke = edge.status === 'added' || edge.status === 'traversed' ? 'var(--yv-accent, #65a9ff)'
                : edge.status === 'removed' ? 'var(--yv-warning, #f59e0b)' : 'var(--yv-muted, #8b9bb4)';
              if (edge.from === edge.to) {
                return <path key={edge.key + (edge.status !== 'steady' ? ':' + selectedIndex : '')} className={`yv-graph-edge yv-graph-edge-${edge.status}`}
                  data-graph-edge-from={edge.from} data-graph-edge-to={edge.to}
                  data-graph-edge-status={edge.status}
                  d={`M ${from.x + 20} ${from.y - 12} C ${from.x + 70} ${from.y - 65}, ${from.x - 45} ${from.y - 65}, ${from.x - 20} ${from.y - 12}`}
                  fill="none" stroke={stroke} strokeDasharray={edge.status === 'removed' ? '4 3' : undefined}
                  opacity={edge.status === 'removed' ? 0.65 : 1} strokeWidth={edge.status === 'traversed' ? 2.5 : 1.5} markerEnd="url(#yv-graph-arrow)" />;
              }
              const dx = to.x - from.x, dy = to.y - from.y;
              const length = Math.max(1, Math.hypot(dx, dy));
              return <line key={edge.key + (edge.status !== 'steady' ? ':' + selectedIndex : '')} className={`yv-graph-edge yv-graph-edge-${edge.status}`}
                data-graph-edge-from={edge.from} data-graph-edge-to={edge.to}
                data-graph-edge-status={edge.status}
                x1={from.x + dx / length * 43} y1={from.y + dy / length * 25}
                x2={to.x - dx / length * 50} y2={to.y - dy / length * 30}
                stroke={stroke} strokeDasharray={edge.status === 'removed' ? '4 3' : undefined}
                opacity={edge.status === 'removed' ? 0.65 : 1} strokeWidth={edge.status === 'traversed' ? 2.5 : 1.5} markerEnd="url(#yv-graph-arrow)" />;
            })}
          </svg>
          {nodes.map(node => {
            const point = positions.get(node.id)!;
            const pointers = pointerNames.get(node.id) ?? [];
            const changed = changedNodeIds.has(node.id);
            const entered = enteredNodeIds.has(node.id);
            return <div key={node.id + ((changed || entered || createdNodeIds.has(node.id)) ? ':' + selectedIndex : '')} className={'yv-graph-node' + (changed ? ' yv-graph-node-changed' : '') + (entered ? ' yv-graph-node-entered' : '') + (createdNodeIds.has(node.id) ? ' yv-graph-node-created' : '')}
              data-graph-node-id={node.id} data-graph-changed={changed ? 'true' : undefined} data-graph-entered={entered ? 'true' : undefined}
              data-graph-created={createdNodeIds.has(node.id) ? 'true' : undefined}
              style={{ position: 'absolute', left: point.x - 47, top: point.y - 23, width: 94, minHeight: 46,
                boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 2, padding: '5px 6px', border: '1px solid var(--yv-accent, #65a9ff)',
                borderRadius: 10, background: changed ? 'var(--yv-highlight, #203b5b)' : 'var(--yv-panel, #101b2d)', color: 'var(--yv-text, #f3f6ff)',
                boxShadow: entered ? '0 0 0 3px color-mix(in srgb, var(--yv-accent, #65a9ff), transparent 55%)' : changed ? '0 0 0 2px color-mix(in srgb, var(--yv-accent, #65a9ff), transparent 55%)' : '0 2px 8px rgba(0,0,0,.2)', textAlign: 'center', fontSize: 12, zIndex: 1 }}>
              <span>{compactValue(node.label)}</span>
              <span style={{ color: 'var(--yv-accent, #65a9ff)', fontSize: 10 }}>{node.id}</span>
              {pointers.length > 0 && <span style={{ color: 'var(--yv-muted, #8b9bb4)', fontSize: 10 }}>{pointers.join(' · ')}</span>}
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}

export function LinkedListView({
  root,
  objects,
  variables = {},
  state
}: {
  root: unknown;
  objects: Record<string, unknown>;
  variables?: Record<string, unknown>;
  state?: TraceState;
}) {
  const session = sessionStore.get();
  const selectedIndex = state ? session.states.indexOf(state) : -1;
  const previous = selectedIndex > 0 ? session.states[selectedIndex - 1] : undefined;
  const previousObjects = previous?.objects ?? {};
  type ListNodeRecord = { id: string; value: unknown; fields: Obj; nextId: string | null; cycleTo: string | null };
  type ListComponent = { nodes: ListNodeRecord[]; cycleTo: string | null };
  const pointerNames = new Map<string, string[]>();
  const nullPointers: string[] = [];
  for (const [name, value] of Object.entries(variables)) {
    if (name === 'this') continue;
    if (isPlainObject(value) && (typeof value.$objectId === 'string' || typeof value.$ref === 'string')) {
      const id = String(value.$objectId ?? value.$ref);
      const names = pointerNames.get(id) ?? [];
      names.push(name);
      pointerNames.set(id, names);
    } else if (value == null) {
      nullPointers.push(name);
    }
  }
  const maxPointerLabelCount = Math.max(0, ...Array.from(pointerNames.values(), names => names.length));

  const records = new Map<string, ListNodeRecord>();
  for (const [key, raw] of Object.entries(objects)) {
    const value = resolveRef(raw, objects);
    if (!isPlainObject(value) || !looksListNode(value)) continue;
    const id = String(value.$objectId ?? key);
    const fields = objectFields(value);
    const next = fields.next;
    const resolvedNext = next == null ? null : resolveRef(next, objects);
    const nextId = isPlainObject(resolvedNext) ? String(resolvedNext.$objectId ?? resolvedNext.$ref ?? '') || null : null;
    records.set(id, { id, value: nodeValue(value), fields, nextId, cycleTo: null });
  }
  const resolvedRoot = resolveRef(root, objects);
  if (isPlainObject(resolvedRoot) && looksListNode(resolvedRoot)) {
    const id = String(resolvedRoot.$objectId ?? 'root');
    if (!records.has(id)) {
      const fields = objectFields(resolvedRoot);
      const next = fields.next;
      const resolvedNext = next == null ? null : resolveRef(next, objects);
      records.set(id, {
        id, value: nodeValue(resolvedRoot), fields,
        nextId: isPlainObject(resolvedNext) ? String(resolvedNext.$objectId ?? resolvedNext.$ref ?? '') || null : null,
        cycleTo: null
      });
    }
  }

  // Include nodes referenced by fields even when a trace snapshot has not
  // materialized them in the top-level objects table yet.
  const pending: unknown[] = [
    resolvedRoot,
    ...[...records.values()].flatMap(node => [node.fields.next, node.fields.prev]),
  ];
  const expanded = new Set<string>();
  for (let guard = 0; pending.length > 0 && guard < 300; guard++) {
    const candidate = resolveRef(pending.shift(), objects);
    if (!isPlainObject(candidate) || !looksListNode(candidate)) continue;
    const id = String(candidate.$objectId ?? '');
    if (!id || expanded.has(id)) continue;
    expanded.add(id);
    const fields = objectFields(candidate);
    if (!records.has(id)) {
      const next = fields.next;
      const resolvedNext = next == null ? null : resolveRef(next, objects);
      const nextId = isPlainObject(resolvedNext) ? String(resolvedNext.$objectId ?? resolvedNext.$ref ?? '') || null : null;
      records.set(id, { id, value: nodeValue(candidate), fields, nextId, cycleTo: null });
    }
    if (fields.next != null) pending.push(fields.next);
    if (fields.prev != null) pending.push(fields.prev);
  }

  const startIds: string[] = [];
  // Lay out the actual next-chain from its structural head (a node that is
  // not targeted by another node's next field). Variable aliases such as
  // "head" can still point at the old first node after reversal; prioritizing
  // aliases splits the reversed chain into an isolated component.
  const targetedIds = new Set<string>();
  for (const node of records.values()) if (node.nextId && records.has(node.nextId)) targetedIds.add(node.nextId);
  for (const id of records.keys()) if (!targetedIds.has(id)) startIds.push(id);
  if (isPlainObject(resolvedRoot) && looksListNode(resolvedRoot)) {
    const id = String(resolvedRoot.$objectId ?? 'root');
    if (!startIds.includes(id)) startIds.push(id);
  }
  for (const value of Object.values(variables)) {
    if (!isPlainObject(value)) continue;
    const id = typeof value.$objectId === 'string' ? value.$objectId : typeof value.$ref === 'string' ? value.$ref : null;
    if (id && records.has(id) && !startIds.includes(id)) startIds.push(id);
  }
  for (const id of records.keys()) if (!startIds.includes(id)) startIds.push(id);

  const visited = new Set<string>();
  const components: ListComponent[] = [];
  for (const startId of startIds) {
    if (visited.has(startId)) continue;
    const componentNodes: ListNodeRecord[] = [];
    const local = new Map<string, number>();
    let currentId: string | null = startId;
    let cycleTo: string | null = null;
    for (let guard = 0; currentId && guard < 100; guard++) {
      if (local.has(currentId)) {
        cycleTo = currentId;
        break;
      }
      if (visited.has(currentId)) break;
      const node = records.get(currentId);
      if (!node) break;
      local.set(currentId, componentNodes.length);
      visited.add(currentId);
      componentNodes.push(node);
      currentId = node.nextId;
    }
    if (componentNodes.length) {
      if (cycleTo) componentNodes[componentNodes.length - 1].cycleTo = cycleTo;
      components.push({ nodes: componentNodes, cycleTo });
    }
  }

  const allNodes = components.flatMap(component => component.nodes);
  const edgeSnapshot = new Map(allNodes.map(node => [node.id, node.nextId] as const));
  const pointerSnapshot = new Map<string, string>();
  for (const [nodeId, names] of pointerNames) for (const name of names) pointerSnapshot.set(name, nodeId);
  const edgeSignature = [...edgeSnapshot.entries()].map(([id, target]) => `${id}:${target ?? 'null'}`).join('|');
  const pointerSignature = [...pointerSnapshot.entries()].map(([name, id]) => `${name}:${id}`).join('|');
  const graphRef = useRef<HTMLDivElement | null>(null);
  const [connectionPaths, setConnectionPaths] = useState<Array<{ key: string; d: string; kind: 'prev' | 'cross-next' | 'null-next' | 'cycle'; from: string; to: string }>>([]);
  // Derive transitions from the selected trace step, not render history. This
  // keeps pointer/edge cues correct when users step backward or seek directly.
  const previousEdges = new Map<string, string | null>();
  for (const [key, raw] of Object.entries(previousObjects)) {
    const value = resolveRef(raw, previousObjects);
    if (!isPlainObject(value) || !looksListNode(value)) continue;
    const id = String(value.$objectId ?? key);
    const next = objectFields(value).next;
    const resolvedNext = next == null ? null : resolveRef(next, previousObjects);
    const target = isPlainObject(resolvedNext) ? String(resolvedNext.$objectId ?? resolvedNext.$ref ?? '') || null : null;
    previousEdges.set(id, target);
  }
  const previousPointers = new Map<string, string>();
  for (const [name, value] of Object.entries(previous?.variables ?? {})) {
    if (!isPlainObject(value)) continue;
    const id = typeof value.$objectId === 'string' ? value.$objectId : typeof value.$ref === 'string' ? value.$ref : null;
    if (id) previousPointers.set(name, id);
  }
  const changedEdgeIds = new Set<string>();
  if (previous && selectedIndex >= 0) {
    for (const [id, target] of edgeSnapshot) {
      if (previousEdges.has(id) && previousEdges.get(id) !== target) changedEdgeIds.add(id);
    }
  }
  const movedPointerNames = new Set<string>();
  if (previous && selectedIndex >= 0) {
    for (const [name, nodeId] of pointerSnapshot) {
      const previousNode = previousPointers.get(name);
      if (previousNode && previousNode !== nodeId) movedPointerNames.add(name);
    }
  }
  const changedValueIds = new Set<string>();
  const createdNodeIds = new Set<string>();
  if (previous && selectedIndex >= 0) {
    for (const node of allNodes) {
      const previousRaw = previousObjects[node.id];
      if (previousRaw === undefined) {
        createdNodeIds.add(node.id);
        continue;
      }
      const previousNode = resolveRef(previousRaw, previousObjects);
      if (!isPlainObject(previousNode) || !looksListNode(previousNode)) continue;
      if (valueChanged(nodeValue(previousNode), node.value)) changedValueIds.add(node.id);
    }
  }
  useLayoutEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const measure = () => {
      const graphRect = graph.getBoundingClientRect();
      const nodes = new Map<string, DOMRect>();
      graph.querySelectorAll<HTMLElement>('[data-linked-node-value]').forEach(element => {
        const id = element.dataset.linkedNodeValue;
        if (id) nodes.set(id, element.getBoundingClientRect());
      });
      graph.querySelectorAll<HTMLElement>('[data-linked-null-target]').forEach(element => {
        const id = element.dataset.linkedNullTarget;
        if (id) nodes.set('null:' + id, element.getBoundingClientRect());
      });
      const nextPaths: Array<{ key: string; d: string; kind: 'prev' | 'cross-next' | 'null-next' | 'cycle'; from: string; to: string }> = [];
      const addPath = (from: string, to: string, kind: 'prev' | 'cross-next' | 'null-next' | 'cycle') => {
        const a = nodes.get(from), b = nodes.get(to);
        if (!a || !b) return;
        const sourcePort = graph.querySelector<HTMLElement>(`[data-linked-node-value="${CSS.escape(from)}"] .yv-linked-next-port`);
        const sourceRect = sourcePort?.getBoundingClientRect() ?? a;
        // Next links begin at the outer edge of the source dot, so the stroke
        // visibly touches the dot instead of passing underneath its fill.
        const ax = (kind === 'prev' ? a.left : sourceRect.right) - graphRect.left + graph.scrollLeft;
        const ay = (kind === 'prev' ? a.top + a.height / 2 : sourceRect.top + sourceRect.height / 2) - graphRect.top + graph.scrollTop;
        const bx = (kind === 'cycle' ? b.right : b.left) - graphRect.left + graph.scrollLeft;
        const by = b.top + b.height / 2 - graphRect.top + graph.scrollTop;
        let d: string;
        if (kind === 'cycle') {
          // Keep cycle back-edges distinct by routing them above the chain.
          const lift = Math.max(34, Math.min(90, Math.abs(ax - bx) * 0.28 + 24));
          const top = Math.max(4, Math.min(ay, by) - lift);
          d = `M ${ax} ${ay} C ${ax + 22} ${top}, ${bx + 22} ${top}, ${bx} ${by}`;
        } else if (kind === 'null-next') {
          // Connect the source port to the exact vertical center of the null box,
          // matching how links meet the centerline of other node targets.
          d = `M ${ax} ${ay} L ${bx} ${by}`;
        } else if (kind === 'cross-next' && bx > ax && Math.abs(by - ay) <= 10) {
          // Side-by-side nodes on the same row get a genuinely straight link.
          d = `M ${ax} ${ay} L ${bx} ${by}`;
        } else if (kind === 'cross-next' && by < ay) {
          // Route cross-row links around the other nodes.
          const midX = ax + (bx - ax) * 0.5;
          const midY = ay + (by - ay) * 0.5;
          d = `M ${ax} ${ay} H ${midX} L ${midX} ${midY} L ${bx - 12} ${by} H ${bx}`;
        } else {
          const lift = Math.max(28, Math.min(72, Math.abs(bx - ax) * 0.22));
          const direction = kind === 'prev' ? -1 : 1;
          const controlY = Math.min(ay, by) - lift;
          d = `M ${ax} ${ay} C ${ax + direction * lift} ${controlY}, ${bx - direction * lift} ${controlY}, ${bx} ${by}`;
        }
        nextPaths.push({ key: `${kind}:${from}:${to}`, d, kind, from, to });
      };
      for (const node of allNodes) {
        // Every next link is drawn from the actual pointer dot to the next
        // node's left outline, including ordinary adjacent nodes in a chain.
        if (node.nextId && nodes.has(node.nextId)) {
          addPath(node.id, node.nextId, 'cross-next');
        } else if (node.nextId == null && node.fields.next == null && nodes.has('null:' + node.id)) {
          addPath(node.id, 'null:' + node.id, 'null-next');
        }
        const prev = resolveRef(node.fields.prev, objects);
        const prevId = isPlainObject(prev) ? String(prev.$objectId ?? prev.$ref ?? '') : '';
        if (prevId && nodes.has(prevId)) addPath(node.id, prevId, 'prev');
      }
      for (const component of components) {
        if (component.cycleTo && component.nodes.length) {
          addPath(component.nodes[component.nodes.length - 1]!.id, component.cycleTo, 'cycle');
        }
      }
      setConnectionPaths(previous => {
        if (previous.length === nextPaths.length && previous.every((path, i) => path.key === nextPaths[i]?.key && path.d === nextPaths[i]?.d)) return previous;
        return nextPaths;
      });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(graph);
    graph.querySelectorAll<HTMLElement>('[data-linked-node-value]').forEach(node => observer?.observe(node));
    graph.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer?.disconnect();
      graph.removeEventListener('scroll', measure);
    };
  }, [edgeSignature, pointerSignature, objects, components]);
  const idLabel = (id: string | null) => {
    if (id == null) return 'null';
    const node = allNodes.find(candidate => candidate.id === id);
    return node ? `#${node.id.length > 8 ? node.id.slice(-6) : node.id}` : 'external node';
  };

  return (
    <div ref={graphRef} className="yv-linked-graph" data-linked-list-root={isPlainObject(resolvedRoot) ? String(resolvedRoot.$objectId ?? 'root') : 'null'}>
      {connectionPaths.length > 0 && (
        <svg className="yv-linked-connections" aria-hidden="true" width={Math.max(graphRef.current?.scrollWidth ?? 0, graphRef.current?.clientWidth ?? 0)} height={Math.max(graphRef.current?.scrollHeight ?? 0, graphRef.current?.clientHeight ?? 0)}>
          {connectionPaths.map(path => (
            <path
              key={path.key}
              className={`yv-linked-connection yv-linked-connection-${path.kind}`}
              d={path.d}
              data-connection-from={path.from}
              data-connection-to={path.to}
              style={path.kind === 'cross-next' ? { stroke: linkedConnectionColor(path.from) } : path.kind === 'null-next' ? { stroke: '#fff' } : undefined}
            />
          ))}
        </svg>
      )}
      {nullPointers.length > 0 && (
        <div className="yv-linked-null-pointers" aria-label="Null references">
          {nullPointers.map(name => <span className="yv-node-pointer yv-node-pointer-null" key={name}>{name} = null</span>)}
        </div>
      )}
      {allNodes.length === 0 ? (
        <div className="yv-linked-empty"><span className="yv-linked-empty-label">empty list</span><span className="yv-null">null</span></div>
      ) : (
        <div className="yv-linked-components" role="group" aria-label="Linked list reference graph">
          {components.map((component, componentIndex) => (
            <div className="yv-linked" data-linked-component={componentIndex} key={component.nodes[0]?.id ?? componentIndex} role="group" aria-label={`Linked-list component ${componentIndex + 1}`}>
              {component.nodes.map((node, index) => {
                const nextField = node.fields.next;
                const hasPrev = 'prev' in node.fields;
                const prevValue = hasPrev ? resolveRef(node.fields.prev, objects) : null;
                const prevId = isPlainObject(prevValue) ? String(prevValue.$objectId ?? prevValue.$ref ?? '') || null : null;
                const isLast = index === component.nodes.length - 1;
                const nextInComponent = component.nodes[index + 1]?.id === node.nextId;
                const nextIsCycle = isLast && component.cycleTo != null;
                return (
                  <div className="yv-linked-piece" key={node.id} data-node-id={node.id} data-node-index={allNodes.findIndex(candidate => candidate.id === node.id)} data-next-target={node.nextId ?? 'null'} data-prev-target={prevId ?? 'null'}>
                    <div className="yv-linked-node-column">
                      <div className="yv-linked-pointer-labels" style={{ height: `${Math.max(22, maxPointerLabelCount * 22)}px`, minHeight: `${Math.max(22, maxPointerLabelCount * 22)}px` }}>
                        {pointerNames.get(node.id)?.map(name => <div className={`yv-node-pointer ${movedPointerNames.has(name) ? 'yv-node-pointer-moved' : ''}`} data-pointer-name={name} key={name}>{name}</div>)}
                      </div>
                      <div
                        className={`yv-node yv-linked-node ${changedEdgeIds.has(node.id) ? 'yv-node-link-changed' : ''} ${changedValueIds.has(node.id) ? 'yv-node-value-changed' : ''} ${createdNodeIds.has(node.id) ? 'yv-linked-node-created' : ''}`}
                        data-linked-node-value={node.id}
                        style={(() => {
                          const incoming = allNodes.find(candidate => candidate.nextId === node.id);
                          return incoming ? { borderColor: linkedConnectionColor(incoming.id), boxShadow: `inset 0 0 0 1.5px ${linkedConnectionColor(incoming.id)}` } : undefined;
                        })()}
                      >
                        <span className="yv-linked-node-data">
                          <span className="yv-node-value">{displayValue(node.value)}</span>
                        </span>
                        <span className="yv-linked-node-next" aria-label={`next pointer slot; target ${idLabel(node.nextId)}`}>
                          <span className="yv-linked-next-port" style={node.nextId ? { borderColor: linkedConnectionColor(node.id), boxShadow: `0 0 0 2px ${linkedConnectionColor(node.id)}33` } : undefined} />
                        </span>
                      </div>
                      <span className="yv-node-identity" title={`Stable object identity: ${node.id}`}>#{node.id.length > 8 ? node.id.slice(-6) : node.id}</span>
                      {hasPrev && <span className="yv-node-link-meta" title={`prev references ${prevId ?? 'null'}`}>prev: {idLabel(prevId)}</span>}
                    </div>
                    {nextInComponent && <span className="yv-linked-edge-accessible-label" data-edge-kind="next" data-edge-from={node.id} data-edge-to={node.nextId} aria-label={`next points to ${idLabel(node.nextId)}`} />}
                    {nextIsCycle && <div className={`yv-edge yv-edge-cycle ${changedEdgeIds.has(node.id) ? 'yv-edge-rewired' : ''}`} data-edge-kind="cycle" data-edge-from={node.id} data-edge-to={component.cycleTo ?? 'unknown'} aria-label={`cycle back to ${idLabel(component.cycleTo)}`}>↶ {idLabel(component.cycleTo)}</div>}
                    {isLast && !nextIsCycle && nextField == null && <div className={`yv-edge yv-edge-null ${changedEdgeIds.has(node.id) ? 'yv-edge-rewired' : ''}`} style={{ marginTop: `${Math.max(22, maxPointerLabelCount * 22) + 17}px` }} data-edge-kind="null" data-edge-from={node.id}><span className="yv-null-value-box" data-linked-null-target={node.id}>null</span></div>}
                    {isLast && !nextIsCycle && nextField != null && !nextInComponent && <div className={`yv-edge yv-edge-external ${changedEdgeIds.has(node.id) ? 'yv-edge-rewired' : ''}`} data-edge-kind="external" data-edge-from={node.id} data-edge-to={node.nextId ?? 'external'}>→ <span>{idLabel(node.nextId)}</span></div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeNodeView({ value, objects, depth = 0, seen = new Set<string>(), state, structureModel }: {
  value: unknown;
  objects: Record<string, unknown>;
  depth?: number;
  seen?: Set<string>;
  state?: TraceState;
  structureModel?: ReturnType<typeof buildObjectStructureModel>;
}) {
  const model = structureModel ?? buildObjectStructureModel(value, objects, {
    referenceFields: ['parent', 'next', 'prev', 'thread', 'random'],
  });
  const treeNodeRef = useRef<HTMLDivElement | null>(null);
  const [treeConnectorLines, setTreeConnectorLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; rootWidth: number; rootHeight: number; target: string }>>([]);
  useLayoutEffect(() => {
    const root = treeNodeRef.current;
    if (!root) return;
    const updateConnectors = () => {
      const rootRect = root.getBoundingClientRect();
      const parentCard = root.querySelector<HTMLElement>(':scope > .yv-structure-node-card');
      if (!parentCard) {
        setTreeConnectorLines([]);
        return;
      }
      const parentRect = parentCard.getBoundingClientRect();
      const startX = parentRect.left + parentRect.width / 2 - rootRect.left;
      const startY = parentRect.bottom - rootRect.top;
      const edges = Array.from(root.querySelectorAll<HTMLElement>(':scope > .yv-binary-tree-children > .yv-binary-tree-edge'));
      const lines = edges.flatMap((edge) => {
        const childCard = edge.querySelector<HTMLElement>(':scope > .yv-binary-tree-edge-content > .yv-structure-node > .yv-structure-node-card');
        if (!childCard) return [];
        const childRect = childCard.getBoundingClientRect();
        return [{
          x1: startX,
          y1: startY,
          x2: childRect.left + childRect.width / 2 - rootRect.left,
          y2: childRect.top - rootRect.top,
          rootWidth: rootRect.width,
          rootHeight: rootRect.height,
          target: edge.dataset.treeEdgeTarget ?? edge.dataset.treeEdgeLabel ?? 'child',
        }];
      });
      setTreeConnectorLines((previousLines) => {
        if (previousLines.length === lines.length && previousLines.every((line, index) => {
          const next = lines[index];
          return next && Math.abs(line.x1 - next.x1) < 0.5 && Math.abs(line.y1 - next.y1) < 0.5 &&
            Math.abs(line.x2 - next.x2) < 0.5 && Math.abs(line.y2 - next.y2) < 0.5 &&
            Math.abs(line.rootWidth - next.rootWidth) < 0.5 && Math.abs(line.rootHeight - next.rootHeight) < 0.5 && line.target === next.target;
        })) return previousLines;
        return lines;
      });
    };
    updateConnectors();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateConnectors) : undefined;
    observer?.observe(root);
    root.querySelectorAll<HTMLElement>('.yv-structure-node-card, .yv-binary-tree-edge').forEach((element) => observer?.observe(element));
    window.addEventListener('resize', updateConnectors);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateConnectors);
    };
  }, [value, objects, depth, state, structureModel]);
  const session = sessionStore.get();
  const selectedIndex = state ? session.states.indexOf(state) : -1;
  const previous = selectedIndex > 0 ? session.states[selectedIndex - 1] : undefined;
  const previousObjects = previous?.objects ?? {};
  const resolved = resolveRef(value, objects);
  if (!isPlainObject(resolved)) return null;
  if (depth > 12) return <span className="yv-code">…</span>;
  const id = typeof resolved.$objectId === 'string' ? resolved.$objectId
    : isPlainObject(value) && typeof value.$ref === 'string' ? value.$ref : undefined;
  if (id && seen.has(id)) return <span className="yv-code yv-tree-cycle" data-tree-cycle-to={id}>↻ {displayValue(nodeValue(resolved))}</span>;
  const nextSeen = new Set(seen);
  if (id) nextSeen.add(id);
  const fields = objectFields(resolved);
  const previousNode = id ? previousObjects[id] : undefined;
  const previousFields = isPlainObject(previousNode) ? objectFields(previousNode) : {};
  const hasPreviousSnapshot = Boolean(state && previous && session.states.includes(state) && previousNode !== undefined);
  const changed = Boolean(hasPreviousSnapshot && stableStringify(previousNode) !== stableStringify(resolved));
  const created = Boolean(state && previous && session.states.includes(state) && id && previousNode === undefined);
  const modelNodeId = id ?? model.nodes.find(node => node.fields === fields)?.id;
  const genericChildEdges = model.edges.filter(edge => edge.kind === 'child' && edge.source === modelNodeId);
  const currentChildSlots = new Set(genericChildEdges.map(edge => (edge.label ?? '').toLowerCase()));
  const previousChildTargets = new Set(Object.entries(previousFields)
    .filter(([fieldName, previousValue]) => previousValue != null && /^(left|right|children|child\d+|firstChild|secondChild)$/i.test(fieldName))
    .flatMap(([fieldName, previousValue]) => {
      if (fieldName.toLowerCase() !== 'children') return [graphReferenceId(previousValue, previousObjects)];
      const childValues = Array.isArray(previousValue)
        ? previousValue
        : isPlainObject(previousValue) && Array.isArray(previousValue.values)
          ? previousValue.values
          : isPlainObject(previousValue) && Array.isArray(previousValue.entries)
            ? previousValue.entries.filter(isPlainObject).map(entry => entry.value)
            : isPlainObject(previousValue) ? Object.values(previousValue) : [];
      return childValues.map(child => graphReferenceId(child, previousObjects));
    })
    .filter((target): target is string => Boolean(target)));
  const addedChildTargets = new Set(genericChildEdges
    .filter(edge => Boolean(previous && session.states.includes(state!)) && !previousChildTargets.has(edge.target))
    .map(edge => edge.target));
  const nodeValueChanged = Boolean(hasPreviousSnapshot && valueChanged(nodeValue(previousFields), nodeValue(resolved)));
  const changedMetadataNames = Object.keys(fields).filter(name =>
    ['color', 'bf', 'balanceFactor', 'height', 'weight', 'isEnd', 'isWord', 'endOfWord', 'isEndOfWord'].includes(name) &&
    hasPreviousSnapshot && valueChanged(previousFields[name], fields[name])
  );
  const changedReferenceNames = ['parent', 'next', 'prev', 'thread', 'random'].filter(name =>
    hasPreviousSnapshot &&
    graphReferenceId(previousFields[name], previousObjects) !== graphReferenceId(fields[name], objects)
  );
  const removedChildEdges = Object.entries(previousFields).flatMap(([fieldName, previousValue]) => {
    if (previousValue == null || !/^(left|right|children|child\d+|firstChild|secondChild)$/i.test(fieldName)) return [];
    const currentValue = fields[fieldName];
    const previousTarget = graphReferenceId(previousValue, previousObjects);
    const currentTarget = graphReferenceId(currentValue, objects);
    if (currentValue != null && (!previousTarget || currentTarget === previousTarget)) return [];
    const label = fieldName.toUpperCase();
    if (currentChildSlots.has(label.toLowerCase())) return [];
    return [{ fieldName, label, target: previousTarget }];
  });
  const movedPointerTargets = new Set<string>();
  if (state && previous && session.states.includes(state)) {
    for (const [name, currentValue] of Object.entries(state.variables)) {
      const currentTarget = graphReferenceId(currentValue, objects);
      const previousTarget = graphReferenceId(previous.variables[name], previousObjects);
      if (currentTarget && currentTarget !== previousTarget) movedPointerTargets.add(currentTarget);
    }
  }
  const pointerNames = Object.entries(state?.variables ?? {})
    .filter(([, pointerValue]) => graphReferenceId(pointerValue, objects) === id)
    .map(([pointerName]) => pointerName);
  const nodeIdentity = id ? (id.length > 18 ? id.slice(0, 15) + '…' : id) : undefined;
  const keyCells = Array.isArray(fields.keys) ? fields.keys : undefined;
  const nodeMetadata = Object.entries(fields).filter(([name, metadataValue]) =>
    ['color', 'bf', 'balanceFactor', 'height', 'weight', 'isEnd', 'isWord', 'endOfWord', 'isEndOfWord'].includes(name) &&
    (typeof metadataValue === 'string' || typeof metadataValue === 'number' || typeof metadataValue === 'boolean')
  );
  const modelReferenceEdges = model.edges.filter(edge => edge.kind === 'reference' && edge.source === modelNodeId);
  const entered = Boolean(state && previous && id && session.states.includes(state) &&
    movedPointerTargets.has(id));
  const depthClass = 'yv-structure-depth-' + Math.min(depth, 4);
  return (
    <div ref={treeNodeRef} className={'yv-structure-node ' + depthClass + (changed ? ' yv-tree-node-changed' : '') + (entered ? ' yv-tree-node-entered' : '') + (created ? ' yv-tree-node-created' : '') + (nodeValueChanged ? ' yv-tree-node-value-changed' : '') + (removedChildEdges.length ? ' yv-tree-node-child-removed' : '')}
      data-tree-node-id={id} data-tree-depth={depth} data-tree-layout="binary-tree"
      data-tree-changed={changed ? 'true' : undefined} data-tree-entered={entered ? 'true' : undefined}
      data-tree-created={created ? 'true' : undefined} aria-label={'Tree node ' + displayValue(nodeValue(resolved)) + (id ? ', object ' + id : '')}>
      <div key={(changed || entered || created || nodeValueChanged) ? id + ':' + selectedIndex : id} className="yv-node yv-structure-node-card">
        <div className="yv-structure-node-main">
          <span className="yv-structure-node-heading">
            {keyCells
              ? <span className="yv-node-key-cells" aria-label="Node keys">
                  {keyCells.map((keyValue, index) => <span className="yv-node-key-cell" key={index}>{displayValue(keyValue)}</span>)}
                </span>
              : <span className="yv-structure-node-value">{displayValue(nodeValue(resolved))}</span>}
          </span>
          {nodeIdentity && <span className="yv-structure-node-identity" title={'Object identity: ' + id}>@{nodeIdentity}</span>}
        </div>
        {created && <span className="yv-binary-node-status is-created yv-tree-operation-badge">NODE CREATED</span>}
        {nodeValueChanged && <span className="yv-binary-node-status is-changed yv-tree-operation-badge yv-tree-value-delta" title="Value changed between adjacent execution snapshots">
          {compactValue(nodeValue(previousNode!))} → {compactValue(nodeValue(resolved))}
        </span>}
        {changed && !nodeValueChanged && <span className="yv-binary-node-status is-changed yv-tree-operation-badge">NODE UPDATED</span>}
        {entered && <span className="yv-binary-node-status is-current yv-tree-operation-badge">VISITED</span>}
        {pointerNames.length > 0 && <span className="yv-tree-pointer-labels yv-binary-pointer-labels" aria-label="Variables pointing to this node">
          {pointerNames.map(pointerName => <span className="yv-tree-pointer-label" key={pointerName} title={pointerName + ' points to this node'}>{pointerName}</span>)}
        </span>}
        {nodeMetadata.length > 0 && <span className="yv-tree-node-metadata" aria-label="Node metadata">
          {nodeMetadata.map(([name, metadataValue]) => <span className={'yv-tree-metadata-chip' + (changedMetadataNames.includes(name) ? ' yv-tree-metadata-changed' : '')} key={name}>{name}={displayValue(metadataValue)}</span>)}
        </span>}
        {modelReferenceEdges.length > 0 && <span className="yv-tree-reference-labels" aria-label="Additional object references">
          {modelReferenceEdges.map(edge => <span className={'yv-tree-reference-label' + (changedReferenceNames.includes(edge.label ?? '') ? ' yv-tree-reference-changed' : '')} key={edge.id} title={edge.label + ' references object ' + edge.target}>{edge.label} → @{edge.target.length > 8 ? edge.target.slice(-6) : edge.target}{changedReferenceNames.includes(edge.label ?? '') && <strong> REWIRED</strong>}</span>)}
        </span>}
      </div>
      {(genericChildEdges.length > 0 || removedChildEdges.length > 0) && (
        <div className="yv-binary-tree-children" data-tree-children="binary-tree">
          {genericChildEdges.map((edge, index) => {
            const childEntered = movedPointerTargets.has(edge.target);
            const edgeLabel = edge.label ?? String(index);
            const childAdded = addedChildTargets.has(edge.target);
            return (
              <div key={edge.id} className={'yv-binary-tree-edge' + (childEntered ? ' yv-tree-edge-traversed' : '') + (childAdded ? ' yv-tree-edge-added' : '')}
                data-tree-edge={edgeLabel.toLowerCase()} data-tree-edge-label={edgeLabel} data-tree-edge-target={edge.target}>
                <div className="yv-binary-tree-edge-heading">
                  <span className="yv-binary-tree-edge-label">{edgeLabel}</span>
                  {edge.metadata.weight !== undefined && <span className="yv-tree-metadata-chip">w={displayValue(edge.metadata.weight)}</span>}
                  {childAdded && <span className="yv-binary-edge-status is-added yv-tree-operation-badge">ADDED</span>}
                  {childEntered && <span className="yv-binary-edge-status is-traversed yv-tree-operation-badge">TRAVERSED</span>}
                </div>
                <div className="yv-binary-tree-edge-content">
                  <TreeNodeView value={model.nodes.find(node => node.id === edge.target)?.snapshot ?? { $ref: edge.target }} objects={objects} depth={depth + 1} seen={nextSeen} state={state} structureModel={model} />
                </div>
              </div>
            );
          })}
          {removedChildEdges.map(edge => (
            <div key={'removed:' + edge.fieldName} className="yv-binary-tree-edge yv-binary-tree-edge-removed"
              data-tree-edge={edge.fieldName.toLowerCase()} data-tree-edge-label={edge.label}
              data-tree-edge-target={edge.target ?? undefined} data-tree-edge-status="removed">
              <div className="yv-binary-tree-edge-heading">
                <span className="yv-binary-tree-edge-label">{edge.label}</span>
                <span className="yv-binary-edge-status is-removed">REMOVED</span>
              </div>
              <div className="yv-binary-tree-edge-content"><span className="yv-null">null</span></div>
            </div>
          ))}
        </div>
      )}
      {treeConnectorLines.length > 0 && (
        <svg className="yv-tree-connectors" viewBox={`0 0 ${treeConnectorLines[0]?.rootWidth ?? 1} ${treeConnectorLines[0]?.rootHeight ?? 1}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {treeConnectorLines.map((line) => (
            <line key={line.target} className={(addedChildTargets.has(line.target) ? 'yv-tree-connector-added ' : '') + (movedPointerTargets.has(line.target) ? 'yv-tree-connector-traversed' : '')} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          ))}
        </svg>
      )}
    </div>
  );
}
function linkedListReturnText(root: unknown, objects: Record<string, unknown>): string | undefined {
  if (!isPlainObject(root) || !looksListNode(root)) return undefined;

  const values: unknown[] = [];
  const visited = new Set<string>();
  let current: unknown = root;

  // Follow the returned head through the captured object graph. Use object
  // identities to stop safely if the list contains a cycle.
  while (isPlainObject(current) && looksListNode(current) && values.length < 500) {
    const resolved = resolveRef(current, objects);
    if (!isPlainObject(resolved) || !looksListNode(resolved)) break;
    const id = typeof resolved.$objectId === 'string'
      ? resolved.$objectId
      : typeof resolved.$ref === 'string' ? resolved.$ref : undefined;
    if (id && visited.has(id)) break;
    if (id) visited.add(id);

    values.push(nodeValue(resolved));
    const next = objectFields(resolved).next;
    if (next == null) break;
    current = resolveRef(next, objects);
  }

  return '[' + values.map(item => displayValue(item)).join(',') + ']';
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
    const listText = linkedListReturnText(value, state?.objects ?? {});
    return <div className="yv-code">{listText ?? text}</div>;
  }

  if (isPlainObject(value) && looksTreeNode(value)) {
    return (
      <div className="yv-return-object">
        <div className="yv-return-reference yv-code">{text}</div>
        <div className="yv-return-caption">Returned root and reachable tree</div>
        <div className="yv-tree"><TreeNodeView value={value} objects={state?.objects ?? {}} state={state} /></div>
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
  const session = sessionStore.get();
  const selectedIndex = state ? session.states.findIndex(candidate =>
    candidate === state || (state.sequence !== undefined && candidate.sequence === state.sequence)
  ) : -1;
  const previousState = selectedIndex > 0 ? session.states[selectedIndex - 1] : undefined;
  const previousObject = objectId ? previousState?.objects?.[objectId] : undefined;
  const previousFields = isPlainObject(previousObject) ? objectFields(previousObject) : {};
  const createdFields = new Set(entries.filter(([key]) =>
    previousObject !== undefined && !(key in previousFields)
  ).map(([key]) => key));
  const changedFields = new Set<string>();
  const eventData = state?.lastEvent?.data;
  const collectChangedFields = (candidate: unknown, eventObjectId?: unknown) => {
    if (!isPlainObject(candidate) || !Array.isArray(candidate.changes)) return;
    for (const change of candidate.changes) {
      if (!isPlainObject(change)) continue;
      const changedObjectId = change.objectId ?? eventObjectId;
      if (changedObjectId !== objectId) continue;
      const path = Array.isArray(change.fields) ? change.fields : Array.isArray(change.path) ? change.path : [];
      const field = path.find((part): part is string => typeof part === 'string');
      if (field) changedFields.add(field);
    }
  };
  if (objectId && isPlainObject(eventData)) {
    collectChangedFields(eventData, eventData.objectId);
    if (Array.isArray(eventData.executionEvents)) {
      for (const event of eventData.executionEvents) {
        if (isPlainObject(event) && event.type === 'OBJECT_FIELD_WRITE' && isPlainObject(event.data)) {
          collectChangedFields(event.data, event.data.objectId);
        }
      }
    }
  }

  const removedFieldNames = [...changedFields].filter(field => !(field in fields));
  const objectClassName = "yv-object" +
    (createdFields.size ? ' yv-object-has-created-fields' : '') +
    (removedFieldNames.length ? ' yv-object-has-removed-fields' : '');

  if (!entries.length) {
    // Keep the object container mounted for this trace step when its final field
    // was removed, so the in-place mutation cue is not lost with the last row.
    if (removedFieldNames.length) {
      return (
        <div className={objectClassName}
          data-object-removed-fields={removedFieldNames.join(',')}>
          <div className="yv-code yv-object-empty">
            {objectType(value) || 'Object'}
            {objectId ? ` · ${objectId}` : ''}
            <span> · no fields</span>
          </div>
        </div>
      );
    }
    return (
      <div className="yv-code">
        {objectType(value) || 'Object'}
        {objectId ? ` · ${objectId}` : ''}
      </div>
    );
  }

  return (
    <div className={objectClassName}
      data-object-removed-fields={removedFieldNames.length ? removedFieldNames.join(',') : undefined}>
      {entries.map(([key, fieldValue]) => (
        <div className={"yv-object-field" + (changedFields.has(key) ? ' yv-object-field-changed' : '') + (createdFields.has(key) ? ' yv-object-field-created' : '')} key={key}
          data-object-field={key} data-object-field-changed={changedFields.has(key) ? 'true' : undefined}
          data-object-field-created={createdFields.has(key) ? 'true' : undefined}>
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
  resolveObjects = true,
  nestedArrayItem = false
}: {
  value: unknown;
  state?: TraceState;
  source: string;
  name?: string;
  depth?: number;
  seen?: Set<string>;
  resolveObjects?: boolean;
  /** Prevent a one-dimensional array stored inside a collection from being mistaken for a matrix row. */
  nestedArrayItem?: boolean;
}) {
  if (isPlainObject(value) && typeof value.$ref === 'string' &&
      (typeof value.$arrayId === 'string' || typeof value.$mapId === 'string' || typeof value.$collectionId === 'string')) {
    return <div className="yv-code">↻ {value.$ref}</div>;
  }

  if (depth >= 6) {
    return <div className="yv-code">…</div>;
  }

  const builderText = stringBuilderText(value);
  if (builderText !== undefined) return <StringView value={builderText} state={state} name={name ?? ''} source={source} />;

  if (isPlainObject(value) && typeof value.$stringValue === 'string') {
    return <StringView value={value.$stringValue} state={state} name={name ?? ''} source={source} />;
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
        <ArrayView value={value.values} state={state} source={source} arrayName={name} depth={depth} seen={seen} nestedItems={nestedArrayItem}/>
        {value.truncated === true && (
          <div className="yv-truncated">
            Showing first {value.values.length} of {String(value.length ?? '?')} items.
          </div>
        )}
      </>
    );
  }

  if (Array.isArray(value)) return <ArrayView value={value} state={state} source={source} arrayName={name} depth={depth} seen={seen} nestedItems={nestedArrayItem}/>;
  if (isPlainObject(value)) {
    const resolved = resolveObjects ? resolveRef(value, state?.objects ?? {}) : value;
    if (isPlainObject(resolved) && looksTreeNode(resolved)) {
      return <div className="yv-tree"><TreeNodeView value={resolved} objects={state?.objects ?? {}} state={state}/></div>;
    }
    if (isPlainObject(resolved) && looksListNode(resolved)) {
      return <LinkedListView root={resolved} objects={state?.objects ?? {}} variables={state?.variables ?? {}} state={state}/>;
    }
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
    looksTreeNode(value) ||
    ('next' in fields && ('val' in fields || 'value' in fields));
}

function stringBuilderText(value: unknown): string | undefined {
  if (!isPlainObject(value) || typeof value.$type !== 'string' || !/StringBuilder|StringBuffer/.test(value.$type)) return undefined;
  const fields = isPlainObject(value.fields) ? value.fields : {};
  for (const candidate of [fields.stringValue, fields.text]) if (typeof candidate === 'string') return candidate;
  const fieldValue = fields.value;
  const values = isPlainObject(fieldValue) && Array.isArray(fieldValue.values) ? fieldValue.values :
    Array.isArray(fieldValue) ? fieldValue : undefined;
  if (!values || !values.every(item => typeof item === 'string' || typeof item === 'number')) return undefined;
  const count = typeof fields.count === 'number' ? fields.count : values.length;
  const coder = typeof fields.coder === 'number' ? fields.coder : 0;
  let text: string;
  if (values.every(item => typeof item === 'string' && item.length <= 1)) {
    text = (values as string[]).join('');
  } else if (coder === 1) {
    const chars: string[] = [];
    for (let i = 0; i + 1 < values.length; i += 2) {
      chars.push(String.fromCharCode(((Number(values[i]) & 255) << 8) | (Number(values[i + 1]) & 255)));
    }
    text = chars.join('');
  } else {
    text = values.map(item => String.fromCharCode(Number(item) & 255)).join('');
  }
  return text.slice(0, count);
}

export function StringView({ value, state, name, source = '' }: { value: string; state?: TraceState; name: string; source?: string }) {
  const data = isPlainObject(state?.lastEvent?.data) ? state.lastEvent.data : {};
  const executionEvents = Array.isArray(data.executionEvents) ? data.executionEvents : [];
  const structureNames = name.split(' / ');
  const matchesName = (candidate: unknown) => typeof candidate === 'string' && structureNames.includes(candidate);
  const accessed = new Set<number>();
  const stringAccessIndices: number[] = [];
  const compared = new Set<number>();
  const ranges: Array<{ start: number; end: number }> = [];
  const pointers = new Map<string, number>();
  let transition: { operation: string; before: string; after: string; kind: 'result' | 'mutation'; index?: number; removed?: string; inserted?: string } | undefined;
  let operationResult: { operation: string; result: unknown } | undefined;

  for (const event of executionEvents) {
    if (!isPlainObject(event) || !isPlainObject(event.data)) continue;
    const effect = event.data;
    if ((event.type === 'STRING_ACCESS' || event.type === 'ARRAY_ACCESS') && matchesName(effect.name)) {
      const index = event.type === 'STRING_ACCESS' ? effect.index :
        Array.isArray(effect.indices) ? effect.indices[0] : undefined;
      if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < value.length) {
        accessed.add(index);
        if (event.type === 'STRING_ACCESS') stringAccessIndices.push(index);
      }
      if (event.type === 'STRING_ACCESS' && typeof effect.indexVariable === 'string' && typeof effect.index === 'number') {
        pointers.set(effect.indexVariable, effect.index);
      }
    }
    if (event.type === 'STRING_SEARCH_RESULT' && matchesName(effect.name) && typeof effect.operation === 'string' && 'result' in effect) {
      operationResult = { operation: effect.operation, result: effect.result };
    }
    if (event.type === 'STRING_SPLIT_RESULT' && matchesName(effect.name)) {
      if (typeof effect.partCount === 'number') operationResult = { operation: 'split', result: effect.partCount + ' parts' };
      if (Array.isArray(effect.delimiterRanges)) {
        for (const range of effect.delimiterRanges) {
          if (!isPlainObject(range) || typeof range.start !== 'number' || typeof range.end !== 'number') continue;
          if (Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= value.length) {
            ranges.push({ start: range.start, end: range.end });
          }
        }
      }
    }
    if (event.type === 'STRING_CONVERSION_RESULT' && matchesName(effect.name) &&
        effect.operation === 'toCharArray' && typeof effect.resultLength === 'number') {
      operationResult = { operation: 'toCharArray', result: effect.resultLength + ' chars' };
    }
    if (event.type === 'STRING_SEARCH_RESULT' && matchesName(effect.name) &&
        typeof effect.index === 'number' && typeof effect.end === 'number') {
      const isComparisonMismatch = effect.matched === false &&
        ['equals', 'equalsIgnoreCase', 'compareTo'].includes(String(effect.operation));
      if ((effect.matched === true || isComparisonMismatch) &&
          Number.isInteger(effect.index) && Number.isInteger(effect.end) &&
          effect.index >= 0 && effect.end > effect.index && effect.end <= value.length) {
        if (isComparisonMismatch) {
          for (let index = effect.index; index < effect.end; index++) compared.add(index);
        } else {
          ranges.push({ start: effect.index, end: effect.end });
        }
      }
    }
    if (event.type === 'STRING_RANGE_ACCESS' && matchesName(effect.name) &&
        typeof effect.start === 'number' && Number.isInteger(effect.start) &&
        typeof effect.end === 'number' && Number.isInteger(effect.end) &&
        effect.start >= 0 && effect.end > effect.start && effect.end <= value.length) {
      // Trace ranges are half-open UTF-16 offsets. Ignore malformed/out-of-range
      // events rather than highlighting beyond the captured string or placing
      // pointer labels at impossible positions.
      ranges.push({ start: effect.start, end: effect.end });
      if (typeof effect.startVariable === 'string') pointers.set(effect.startVariable, effect.start);
      if (typeof effect.endVariable === 'string') pointers.set(effect.endVariable, effect.end);
      if (typeof effect.endExpression === 'string' && /\.length\s*\(\s*\)\s*$/.test(effect.endExpression) && effect.end === value.length) pointers.set('end', value.length);
    }
    if (event.type === 'STRING_RESULT' && (matchesName(effect.resultName) || matchesName(effect.name)) &&
        typeof effect.after === 'string' && effect.after === value && typeof effect.operation === 'string') {
      transition = { operation: effect.operation, before: typeof effect.before === 'string' ? effect.before : '', after: effect.after, kind: 'result' };
    } else if (event.type === 'STRING_RESULT' && (matchesName(effect.resultName) || matchesName(effect.name)) &&
        typeof effect.before === 'string' && effect.before === value && typeof effect.after === 'string' && typeof effect.operation === 'string') {
      transition = { operation: effect.operation, before: effect.after, after: effect.before, kind: 'result' };
    }
    if (event.type === 'STRING_MUTATION' && matchesName(effect.name) &&
        typeof effect.after === 'string' && typeof effect.before === 'string' && typeof effect.operation === 'string') {
      // Appends often have no explicit index in the runtime event. The exact
      // before snapshot gives an authoritative insertion point at its length.
      const mutationIndex = typeof effect.index === 'number' ? effect.index
        : effect.operation === 'append' ? effect.before.length : undefined;
      const mutationInserted = typeof effect.inserted === 'string' ? effect.inserted
        : effect.operation === 'append' && effect.after.startsWith(effect.before)
          ? effect.after.slice(effect.before.length) : undefined;
      if (effect.after === value) {
        transition = { operation: effect.operation, before: effect.before, after: effect.after, kind: 'mutation',
          index: mutationIndex, removed: typeof effect.removed === 'string' ? effect.removed : undefined,
          inserted: mutationInserted };
      } else if (effect.before === value) {
        const operation = effect.operation === 'append' || effect.operation === 'insert' ? 'delete'
          : effect.operation === 'delete' || effect.operation === 'deleteCharAt' ? 'insert'
          : effect.operation;
        transition = { operation, before: effect.after, after: effect.before, kind: 'mutation',
          index: mutationIndex,
          removed: mutationInserted,
          inserted: typeof effect.removed === 'string' ? effect.removed : undefined };
      }
    }
  }

  // Runtime events control highlights. Source scanning only locates integer
  // pointer variables for the currently executed string expression.
  const line = source.split(/\r?\n/)[Math.max(0, (state?.line ?? 1) - 1)] ?? '';
  if (/(?:==|!=|<=|>=|<|>)/.test(line)) {
    for (const index of stringAccessIndices) compared.add(index);
  }
  const sourceName = structureNames[0] ?? name;
  const escapedName = sourceName.replace(/\$/g, '\\$');
  const indexExpressions: string[] = [];
  // Discover string index variables from the whole method, not only the
  // currently highlighted line. Pointer position is persistent state; the
  // current STRING_ACCESS event should control highlighting, not visibility.
  const isActiveIdentifier = (expression: string) =>
    /^[A-Za-z_$][\w$]*$/.test(expression);
  for (const match of source.matchAll(new RegExp('\\b' + escapedName + '\\s*\\.\\s*charAt\\s*\\(([^()]*)\\)', 'g'))) {
    const expression = (match[1] ?? '').trim();
    if (isActiveIdentifier(expression)) indexExpressions.push(expression);
  }
  for (const match of source.matchAll(new RegExp('\\b' + escapedName + '\\s*\\.\\s*(?:substring|subSequence)\\s*\\(([^()]*)\\)', 'g'))) {
    indexExpressions.push(...(match[1] ?? '').split(',').slice(0, 2).map(part => part.trim()).filter(isActiveIdentifier));
  }
  for (const expression of indexExpressions) {
    if (!/^[A-Za-z_$][\w$]*$/.test(expression) || pointers.has(expression)) continue;
    const index = state?.variables?.[expression];
    if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && index <= value.length) pointers.set(expression, index);
  }

  // Java String indices count UTF-16 code units. split('') preserves that
  // mapping. Render a space as a blank cell, never as a visible abbreviation.
  const enhancedBinding = enhancedForBinding(source, state, name, value.split(''));
  const characters = value.split('');
  const usesStableCharacterKeys = Boolean(transition?.kind === 'mutation' &&
    (['insert', 'delete', 'deleteCharAt', 'reverse'].includes(transition.operation) ||
      transition.before.length !== transition.after.length));
  const stringRootRef = useRef<HTMLDivElement | null>(null);
  const previousCharacterPositions = useRef<Map<string, { left: number; top: number }>>(new Map());
  const characterAnimations = useRef<WeakMap<HTMLElement, Animation>>(new WeakMap());
  useLayoutEffect(() => {
    const root = stringRootRef.current;
    if (!root) return;
    const reduceMotion = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-string-cell-key]'));
    const nextPositions = new Map<string, { left: number; top: number }>();
    for (const cell of cells) {
      const key = cell.dataset.stringCellKey;
      if (!key) continue;
      characterAnimations.current.get(cell)?.cancel();
      const position = { left: cell.offsetLeft, top: cell.offsetTop };
      nextPositions.set(key, position);
      const previousPosition = previousCharacterPositions.current.get(key);
      if (!reduceMotion && usesStableCharacterKeys && previousPosition) {
        const dx = previousPosition.left - position.left;
        const dy = previousPosition.top - position.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          characterAnimations.current.set(cell, cell.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)' }
          ));
        }
      }
    }
    previousCharacterPositions.current = nextPositions;
  });
  const hasPointers = [...pointers.values()].some(index => index >= 0 && index <= value.length);
  const emptiedThisStep = Boolean(transition?.kind === 'mutation' &&
    transition.before.length > 0 && transition.after.length === 0 && value === transition.after);
  return (
    <div ref={stringRootRef} className={`yv-string-view ${hasPointers ? 'has-pointers' : ''}`}
      data-string-structure={name} data-string-length={value.length}
      data-string-emptied={emptiedThisStep ? 'true' : undefined}>
      {(transition || operationResult) && <div className="yv-string-operation">
        {transition && <span>{transition.operation} · {transition.kind === 'mutation' ? 'mutated' : 'result'}</span>}
        {operationResult && <span>{operationResult.operation} → {String(operationResult.result)}</span>}
      </div>}
      <div className="yv-string-cells" style={enhancedBinding ? { paddingTop: 52, paddingLeft: 44, boxSizing: 'border-box' } : undefined}>
        {hasPointers && <div className="yv-string-pointer-layer" aria-hidden="true">
          {[...new Set(pointers.values())].map(pointerIndex => (
            <span className="yv-string-pointer-group" key={pointerIndex} data-string-pointer-index={pointerIndex}
              style={{ left: pointerIndex * 40 + 18 + (enhancedBinding ? 44 : 0) }}>
              {[...pointers.entries()].filter(([, index]) => index === pointerIndex).map(([pointer]) => (
                <span className="yv-string-pointer" key={pointer} data-string-pointer={pointer}>{pointer}</span>
              ))}
            </span>
          ))}
        </div>}
        {characters.map((character, index) => {
          const codeUnit = character.charCodeAt(0);
          const isSurrogateUnit = codeUnit >= 0xd800 && codeUnit <= 0xdfff;
          const characterLabel = character === ' ' ? '\u00a0' : isSurrogateUnit
            ? '\\u' + codeUnit.toString(16).toUpperCase().padStart(4, '0')
            : character;
          const inRange = ranges.some(range => index >= range.start && index < range.end);
          const previousCharacter = transition?.before[index];
          const simpleAppend = Boolean(transition?.kind === 'result' &&
            (transition.operation === 'concat' || transition.operation === 'concatenate') &&
            transition.after.startsWith(transition.before));
          const wholeValueChange = Boolean(transition?.kind === 'result' &&
            transition.before.length !== transition.after.length && !simpleAppend);
          const changed = Boolean(transition && transition.before !== transition.after &&
            (wholeValueChange || previousCharacter !== character));
          const swapped = Boolean(transition?.kind === 'mutation' && transition.operation === 'reverse' &&
            transition.before[index] !== character);
          const swapFromRight = swapped && transition !== undefined && index < transition.before.length / 2;
          const swapFromLeft = swapped && transition !== undefined && index >= transition.before.length / 2;
          const inserted = Boolean(transition?.kind === 'mutation' && transition.inserted && transition.index !== undefined && index >= transition.index && index < transition.index + transition.inserted.length);
          const added = Boolean((transition?.kind === 'result' && transition.before.length === 0 && index < transition.after.length) ||
            (simpleAppend && transition && index >= transition.before.length && index < transition.after.length) || inserted);
          return (
            <div className="yv-string-cell-wrap"
              key={String(codeUnit) + '#' + characters.slice(0, index).filter(candidate => candidate === character).length}
              data-string-cell-index={index}
              data-string-cell-key={String(codeUnit) + '#' + characters.slice(0, index).filter(candidate => candidate === character).length}
              style={enhancedBinding?.index === index ? { position: "relative" } : undefined}>
              {enhancedBinding?.index === index && <EnhancedForValueCard binding={enhancedBinding} />}
              <div className={`yv-string-cell ${accessed.has(index) ? 'yv-cell-read ' : ''}${compared.has(index) ? 'yv-string-cell-compared ' : ''}${inRange ? 'yv-cell-range ' : ''}${changed ? 'yv-string-cell-changed ' : ''}${added ? 'yv-string-cell-added ' : ''}${swapFromRight ? 'yv-string-cell-swap-right ' : ''}${swapFromLeft ? 'yv-string-cell-swap-left ' : ''}`} data-string-index={index}>
                <div className={`yv-string-character ${isSurrogateUnit ? 'yv-string-code-unit' : ''}`} title={isSurrogateUnit ? `UTF-16 code unit U+${codeUnit.toString(16).toUpperCase().padStart(4, '0')}` : undefined}>{characterLabel}</div>
              </div>
              <div className="yv-string-index">{index}</div>
            </div>
          );
        })}
        {!characters.length && <div className="yv-empty">Empty string</div>}
        {[...pointers.entries()].some(([, index]) => index === value.length) &&
          <div className="yv-string-cell-wrap yv-string-end-pointer">
            <div className="yv-string-cell" aria-label="String boundary, not a character" title="One past the last character"><div className="yv-string-character">×</div></div>
            <div className="yv-string-index">{value.length}</div>
          </div>}
      </div>
    </div>
  );
}

export function DisjointSetView({ parent, name, state, rank, size, rankName, sizeName }: {
  parent: unknown[];
  name: string;
  state?: TraceState;
  rank?: unknown[];
  size?: unknown[];
  rankName?: string;
  sizeName?: string;
}) {
  const count = Math.min(parent.length, 100);
  const values = parent.slice(0, count);
  const children = Array.from({ length: count }, () => [] as number[]);
  const roots: number[] = [];
  values.forEach((value, index) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < -1 || value >= count) return;
    if (value === index || value === -1) roots.push(index);
    else children[value]!.push(index);
  });
  const changed = changedArrayIndices(state, name);
  const changedRanks = rankName ? changedArrayIndices(state, rankName) : new Set<number>();
  const changedSizes = sizeName ? changedArrayIndices(state, sizeName) : new Set<number>();
  const session = sessionStore.get();
  const selectedIndex = state ? session.states.indexOf(state) : -1;
  const previous = selectedIndex > 0 ? session.states[selectedIndex - 1] : undefined;
  const previousParent = previous ? [
    ...Object.entries(previous.variables ?? {}),
    ...Object.entries(previous.dataStructures ?? {})
  ].find(([candidateName, candidate]) => candidateName === name && isArraySnapshot(candidate))?.[1] : undefined;
  const previousLength = isArraySnapshot(previousParent) ? previousParent.values.length : count;
  const created = new Set<number>();
  if (previous && selectedIndex >= 0) {
    for (let index = previousLength; index < count; index++) created.add(index);
  }
  const visited = new Set<number>();
  const renderNode = (index: number, path: Set<number>): React.ReactNode => {
    if (path.has(index)) return <span className="yv-code" data-dsu-cycle={index}>↻ {index}</span>;
    if (visited.has(index)) return <span className="yv-code" data-dsu-reference={index}>↗ {index}</span>;
    visited.add(index);
    const nextPath = new Set(path);
    nextPath.add(index);
    const parentIndex = values[index];
    const isRoot = parentIndex === index || parentIndex === -1;
    return (
      <div className={'yv-dsu-branch' + (changed.has(index) || changedRanks.has(index) || changedSizes.has(index) ? ' yv-dsu-changed' : '') + (created.has(index) ? ' yv-dsu-created' : '')} key={index}
        data-dsu-node-index={index} data-dsu-parent={typeof parentIndex === 'number' ? parentIndex : 'invalid'}
        data-dsu-created={created.has(index) ? 'true' : undefined}
        data-dsu-parent-changed={changed.has(index) ? 'true' : undefined}
        data-dsu-rank-changed={changedRanks.has(index) ? 'true' : undefined}
        data-dsu-size-changed={changedSizes.has(index) ? 'true' : undefined}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: 7 }}>
        <div className="yv-dsu-node" style={{ minWidth: 52, padding: '7px 9px', border: '1px solid var(--yv-accent, #65a9ff)',
          borderRadius: 9, background: changed.has(index) ? 'var(--yv-highlight, #203b5b)' : 'var(--yv-panel, #101b2d)',
          color: 'var(--yv-text, #f3f6ff)', textAlign: 'center', fontSize: 12 }}>
          <div>{index}</div>
          <div style={{ fontSize: 10, color: isRoot ? 'var(--yv-accent, #65a9ff)' : 'var(--yv-muted, #8b9bb4)' }}>
            {isRoot ? 'ROOT' : 'parent → ' + String(parentIndex)}
          </div>
          {rank?.[index] !== undefined && <div className={changedRanks.has(index) ? 'yv-dsu-field-changed' : undefined} style={{ fontSize: 10 }}>rank {displayValue(rank[index])}</div>}
          {size?.[index] !== undefined && <div className={changedSizes.has(index) ? 'yv-dsu-field-changed' : undefined} style={{ fontSize: 10 }}>size {displayValue(size[index])}</div>}
        </div>
        {children[index]!.length > 0 && (
          <div className="yv-dsu-children" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--yv-border, #334155)', paddingTop: 8 }}>
            {children[index]!.map(child => renderNode(child, nextPath))}
          </div>
        )}
      </div>
    );
  };
  const forestRoots = roots.length ? roots : values.map((_, index) => index);
  const trees = forestRoots.map(index => renderNode(index, new Set<number>()));
  const disconnected = values.map((_, index) => index).filter(index => !visited.has(index));
  disconnected.forEach(index => trees.push(renderNode(index, new Set<number>())));

  return (
    <div className="yv-dsu" data-dsu-array={name} data-dsu-node-count={count}>
      <div className="yv-collection-meta">
        <span>Disjoint-set forest · {name}</span>
        <span>{roots.length} roots · {count} elements{parent.length > count ? ' · display limit reached' : ''}</span>
      </div>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <div className="yv-dsu-forest" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 12, minWidth: 'max-content' }}>
          {trees}
        </div>
      </div>
    </div>
  );
}

export function DataStructures({ state, source }: { state?: TraceState; source: string }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    setCopyStatus('idle');
  }, [state?.sequence, state?.line, state?.lastEvent?.type]);

  const copyVisualizationSource = async () => {
    const panel = visualizerPanelSource;
    const helpersStart = panel.indexOf('function objectFields(value: Obj): Obj {');
    const helpersEnd = panel.indexOf('function looksGraphNode(value: Obj): boolean {', helpersStart);
    const referenceStart = panel.indexOf('function graphReferenceId(value: unknown, objects: Record<string, unknown>): string | undefined {');
    const referenceEnd = panel.indexOf('function looksTrieNode(value: Obj): boolean {', referenceStart);
    const treeStart = panel.indexOf('export function TreeNodeView(');
    const treeEnd = panel.indexOf('function linkedListReturnText(', treeStart);

    const requiredCode = [
      "import type { TraceState } from '../types/trace';",
      "import { sessionStore } from '../state/store';",
      "import { displayValue, stableStringify, isPlainObject } from '../utils/value';",
      "import { buildObjectStructureModel } from './treeModel';",
      "type Obj = Record<string, unknown>;",
      '',
      panel.slice(helpersStart, helpersEnd).trim(),
      '',
      panel.slice(referenceStart, referenceEnd).trim(),
      '',
      panel.slice(treeStart, treeEnd).trim(),
    ].join('\n');

    const css = visualizerStylesSource;
    const selectors = [
      '.yv-node', '.yv-tree', '.yv-tree-node', '.yv-tree-children',
      '.yv-null', '.yv-tree-cycle', '.yv-tree-edge-label',
      '.yv-tree-node-entered', '.yv-tree-node-changed', '.yv-tree-node-created',
      '.yv-tree-edge-changed', '.yv-tree-pointer-labels', '.yv-tree-pointer-label',
      '.yv-tree-edge-traversed',
      '.yv-binary-node', '.yv-binary-node-card', '.yv-binary-node-main',
      '.yv-binary-node-value', '.yv-binary-node-identity', '.yv-binary-node-status',
      '.yv-binary-children', '.yv-binary-branch', '.yv-binary-edge-label',
      '.yv-binary-edge-status', '.yv-binary-pointer-labels',
      '.yv-tree-reference-labels', '.yv-tree-reference-label',
      '.yv-structure-node', '.yv-structure-node-card', '.yv-structure-node-main',
      '.yv-structure-node-value', '.yv-structure-node-identity', '.yv-structure-node-heading',
      '.yv-structure-node-depth-badge', '.yv-binary-tree-children', '.yv-binary-tree-edge',
      '.yv-binary-tree-edge-heading', '.yv-binary-tree-edge-label', '.yv-binary-tree-edge-content',
      '.yv-binary-tree-edge-removed', '.yv-structure-depth-0', '.yv-structure-depth-1',
      '.yv-structure-depth-2', '.yv-structure-depth-3', '.yv-structure-depth-4',
      '.yv-node-key-cells', '.yv-node-key-cell', '.yv-tree-node-metadata', '.yv-tree-metadata-chip',
    ];
    const rules: string[] = [];
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    for (const match of css.matchAll(rulePattern)) {
      const selector = match[1]!.trim();
      if (selector.startsWith('@keyframes') || selector.startsWith('@media')) continue;
      if (selector.split(',').some(part => selectors.some(needle => { const rule = part.trim(); return rule === needle || rule.startsWith(needle + ' ') || rule.startsWith(needle + '>') || rule.startsWith(needle + ':') || rule.startsWith(needle + '[') || rule.startsWith(needle + '.'); }))) {
        rules.push(selector + ' {' + match[2]!.trim() + '}');
      }
    }
    const keyframes = [
      'yv-graph-node-entered', 'yv-graph-node-changed', 'yv-graph-node-created',
      'yv-tree-edge-change', 'yv-tree-edge-traverse',
    ];
    for (const name of keyframes) {
      const start = css.indexOf('@keyframes ' + name);
      if (start < 0) continue;
      const open = css.indexOf('{', start);
      if (open < 0) continue;
      let depth = 0;
      for (let i = open; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1;
        if (css[i] === '}') depth -= 1;
        if (depth === 0) {
          rules.push(css.slice(start, i + 1).trim());
          break;
        }
      }
    }
    const source = [
      '===== Binary Tree Visualization: minimal review bundle =====',
      '===== Required rendering code and dependencies =====',
      requiredCode,
      '',
      '===== Shared node-and-edge model =====',
      treeModelSource,
      '',
      '===== CSS used by the tree renderer =====',
      [...new Set(rules)].join('\n'),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(source);
      setCopyStatus('copied');
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = source;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        setCopyStatus(copied ? 'copied' : 'failed');
      } catch {
        setCopyStatus('failed');
      }
    }
  };

  const copyButton = (
    <div className="yv-ds-copy-row">
      <button
        className="yv-btn"
        type="button"
        aria-label="Copy visualization source code"
        title="Copy the visualization component and styles so they can be shared for review"
        onMouseDown={event => event.preventDefault()}
        onClick={copyVisualizationSource}
      >
        {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Copy failed' : 'Copy Visualization Code'}
      </button>
    </div>
  );

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

  // Design-class state is rooted at `this`, so fields such as
  // `this.cache` are not named locals. Promote structural fields from the
  // current instance into the same renderer used for ordinary local maps,
  // collections and arrays. This keeps encapsulated state visible while
  // avoiding a generic object dump of the whole instance.
  const thisValue = state?.variables?.this;
  const thisObjectId = isPlainObject(thisValue)
    ? (typeof thisValue.$objectId === 'string' ? thisValue.$objectId
      : typeof thisValue.$ref === 'string' ? thisValue.$ref : undefined)
    : undefined;
  // Object snapshots may be embedded directly in the `this` local (as in
  // OBJECT_FIELD_WRITE events), or represented by an ID resolved through the
  // trace's object table. Prefer the embedded snapshot because it is the exact
  // state for this step.
  const thisObject = isPlainObject(thisValue) && isPlainObject(thisValue.fields)
    ? thisValue
    : thisObjectId ? state?.objects?.[thisObjectId] : undefined;
  if (isPlainObject(thisObject)) {
    for (const [fieldName, fieldValue] of Object.entries(objectFields(thisObject))) {
      if (!isStructuralValue(fieldValue)) continue;
      const displayName = 'this.' + fieldName;
      if (isArraySnapshot(fieldValue)) {
        grouped.set(`array:instance:${fieldValue.$arrayId}`, { names: [displayName], value: fieldValue });
      } else if (isMapSnapshot(fieldValue)) {
        grouped.set(`map:instance:${fieldValue.$mapId}`, { names: [displayName], value: fieldValue });
      } else if (isCollectionSnapshot(fieldValue)) {
        grouped.set(`collection:instance:${fieldValue.$collectionId}`, { names: [displayName], value: fieldValue });
      }
    }
  }

  // Strings remain ordinary variables as well as being shown as indexed,
  // read-only character sequences in the Data Structures section.
  for (const [name, value] of Object.entries(state?.variables ?? {})) {
    if (name === 'this' || typeof value !== 'string') continue;
    // Enhanced-for element variables are scalar loop bindings, not independent strings.
    if (isEnhancedForVariable(source, name)) continue;
    grouped.set(`string:${name}`, { names: [name], value: { $stringValue: value } });
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

  const objectEntries = Object.entries(state?.objects ?? {});
  const listNodeEntries = objectEntries.filter(([, value]) => isPlainObject(value) && looksListNode(value));
  if (listNodeEntries.length > 0) {
    const listNodeIds = new Set(listNodeEntries.map(([id, value]) =>
      isPlainObject(value) && typeof value.$objectId === 'string' ? value.$objectId : id
    ));
    const listVariableEntries = Object.entries(state?.variables ?? {}).filter(([, value]) =>
      isPlainObject(value) && typeof value.$objectId === 'string' && listNodeIds.has(value.$objectId)
    );
    const preferredRoot = listVariableEntries.find(([name]) => /^(head|root|first)$/i.test(name));
    const rootVariable = preferredRoot ?? listVariableEntries[0];
    const rootId = rootVariable && isPlainObject(rootVariable[1]) && typeof rootVariable[1].$objectId === 'string'
      ? rootVariable[1].$objectId
      : null;
    const rootEntry = rootId
      ? listNodeEntries.find(([id, value]) => id === rootId || (isPlainObject(value) && value.$objectId === rootId))
      : listNodeEntries[0];
    const rootValue = rootEntry?.[1];
    if (rootValue !== undefined) {
      grouped.set('linked-list:runtime', {
        names: listVariableEntries.map(([name]) => name).filter((name, index, all) => all.indexOf(name) === index),
        value: rootValue,
      });
    }
  }

  const graphNodeEntries = objectEntries.filter(([, value]) =>
    isPlainObject(value) && looksGraphNode(value)
  );
  const trieNodeEntries = objectEntries.filter(([, value]) =>
    isPlainObject(value) && looksTrieNode(value)
  );
  const trieNodeIds = new Set(trieNodeEntries.map(([id, value]) =>
    isPlainObject(value) && typeof value.$objectId === 'string' ? value.$objectId : id
  ));

  const dsuContext = /\b(?:find|union)\s*\(/i.test(source) && /\b(?:parent|parents|par)\s*\[/i.test(source);
  const dsuParentEntry = dsuContext ? Object.entries(state?.arrays ?? {}).find(([name, value]) =>
    /^(?:parent|parents|par)$/i.test(name) && isArraySnapshot(value) &&
    value.values.length > 0 && value.values.every(item => typeof item === 'number' && Number.isInteger(item) && item >= -1 && item < value.values.length)
  ) : undefined;
  const dsuRankEntry = dsuContext ? Object.entries(state?.arrays ?? {}).find(([name, value]) =>
    /^(?:rank|ranks)$/i.test(name) && isArraySnapshot(value)
  ) : undefined;
  const dsuSizeEntry = dsuContext ? Object.entries(state?.arrays ?? {}).find(([name, value]) =>
    /^(?:size|sizes)$/i.test(name) && isArraySnapshot(value)
  ) : undefined;

  const trieNames = Object.entries(state?.variables ?? {}).flatMap(([name, value]) => {
    const id = graphReferenceId(value, state?.objects ?? {});
    if (id && trieNodeIds.has(id)) return [name];
    const resolved = id ? state?.objects?.[id] : undefined;
    const rootId = isPlainObject(resolved) ? graphReferenceId(objectFields(resolved).root, state?.objects ?? {}) : undefined;
    return rootId && trieNodeIds.has(rootId) ? [name] : [];
  });

  for (const [id, value] of objectEntries) {
    if (isPlainObject(value) && (looksListNode(value) || looksGraphNode(value) || looksTrieNode(value))) continue;
    if (isPlainObject(value) && /Trie$/.test(objectType(value))) {
      const rootId = graphReferenceId(objectFields(value).root, state?.objects ?? {});
      if (rootId && trieNodeIds.has(rootId)) continue;
    }
    const names = namedObjectIds.get(id);
    if (!names?.length) continue;
    grouped.set(`object:${id}`, { names, value });
  }

  const items = [...grouped.values()];

  if (!items.length && graphNodeEntries.length === 0 && trieNodeEntries.length === 0 && !dsuParentEntry) {
    return (
      <div className="yv-ds-list">
        {copyButton}
        <div className="yv-empty">Structures appear here as your code creates or mutates them.</div>
      </div>
    );
  }

  return (
    <div className="yv-ds-list">
      {copyButton}
      {items.map(({ names, value }) => {
        const uniqueNames = [...new Set(names)];
        const primaryName = uniqueNames[0] ?? 'value';
        const isString = isPlainObject(value) && typeof value.$stringValue === 'string';
        const isArray = Array.isArray(value) || isArraySnapshot(value);
        const isCharArray = isArray && uniqueNames.some(variable =>
          /char\s*\[\s*\]\s+/.test(source) && source.includes(variable) && source.includes('.toCharArray')
        );
        const kind = isString ? 'String'
          : isArray ? (isCharArray ? 'charArray' : 'Array')
          : isPlainObject(value) && typeof value.$mapId === 'string' ? 'Map'
          : isPlainObject(value) && typeof value.$collectionId === 'string' ? 'Collection'
          : isPlainObject(value) && looksListNode(value) ? 'Linked List'
          : isPlainObject(value) && typeof value.$objectId === 'string' ? 'Object'
          : 'Data Structure';
        const title = kind + ' → ' + uniqueNames.join(' / ');
        return (
          <div className="yv-ds" key={kind === 'Linked List' ? 'Linked List → runtime graph' : title}>
            <div className="yv-ds-title">{title}</div>
            <DataValue value={value} state={state} source={source} name={uniqueNames.join(' / ')}/>
          </div>
        );
      })}
      {dsuParentEntry && isArraySnapshot(dsuParentEntry[1]) && (
        <div className="yv-ds" key="Disjoint-set forest">
          <div className="yv-ds-title">Disjoint Set → {dsuParentEntry[0]}</div>
          <DisjointSetView
            parent={dsuParentEntry[1].values}
            name={dsuParentEntry[0]}
            state={state}
            rank={dsuRankEntry && isArraySnapshot(dsuRankEntry[1]) ? dsuRankEntry[1].values : undefined}
            rankName={dsuRankEntry?.[0]}
            size={dsuSizeEntry && isArraySnapshot(dsuSizeEntry[1]) ? dsuSizeEntry[1].values : undefined}
            sizeName={dsuSizeEntry?.[0]}
          />
        </div>
      )}
      {trieNodeEntries.length > 0 && (
        <div className="yv-ds" key="Trie → runtime nodes">
          <div className="yv-ds-title">Trie → {trieNames.join(' / ') || 'runtime nodes'}</div>
          <TrieView objects={state?.objects ?? {}} variables={state?.variables ?? {}} source={source} state={state} />
        </div>
      )}
      {graphNodeEntries.length > 0 && (
        <div className="yv-ds" key="Graph → runtime nodes">
          <div className="yv-ds-title">Graph → {[...new Set(Object.entries(state?.variables ?? {}).flatMap(([name, value]) => {
            const id = graphReferenceId(value, state?.objects ?? {});
            return id && graphNodeEntries.some(([key, node]) => id === key || (isPlainObject(node) && node.$objectId === id)) ? [name] : [];
          }))].join(' / ') || 'runtime nodes'}</div>
          <GraphView objects={state?.objects ?? {}} variables={state?.variables ?? {}} state={state} />
        </div>
      )}
    </div>
  );
}

type ClassFieldDeclaration = { name: string; declaration: string };

function parseClassFieldDeclarations(source: string): ClassFieldDeclaration[] {
  const lines = source.split(/\r?\n/);
  const classLine = lines.findIndex(line => /\bclass\s+[A-Za-z_$][\w$]*/.test(line));
  if (classLine < 0) return [];
  let depth = 0;
  let enteredClass = false;
  let pending = "";
  const declarations: ClassFieldDeclaration[] = [];
  for (let index = classLine; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const code = line.replace(/\/\/.*$/, "").trim();
    if (!code) {
      if (depth === 1 && pending) pending += " ";
      continue;
    }
    if (!enteredClass) {
      const open = code.indexOf("{");
      if (open < 0) continue;
      enteredClass = true;
      depth += (code.slice(open).match(/{/g) ?? []).length - (code.slice(open).match(/}/g) ?? []).length;
      const afterOpen = code.slice(open + 1).trim();
      if (afterOpen) pending += afterOpen + " ";
      continue;
    }
    if (depth === 1) {
      pending += code + " ";
      if (code.includes(";")) {
        const candidate = pending.slice(0, pending.indexOf(";") + 1).trim();
        const declaration = candidate.replace(/\s+/g, " ");
        const beforeInitializer = declaration.split("=")[0] ?? "";
        const match = beforeInitializer.match(/^(?:(?:public|protected|private|static|final|transient|volatile)\s+)*(?:[\w.$<>?,\[\] ]+?)\s+([A-Za-z_$][\w$]*)\s*$/);
        if (match?.[1] && !beforeInitializer.includes("(") && !/^(?:return|throw|break|continue)\b/.test(declaration)) {
          declarations.push({ name: match[1], declaration });
        }
        pending = pending.slice(pending.indexOf(";") + 1);
      }
    }
    depth += (code.match(/{/g) ?? []).length - (code.match(/}/g) ?? []).length;
    if (depth <= 0) break;
    if (depth !== 1) pending = "";
  }
  return declarations.filter((item, index, all) => all.findIndex(candidate => candidate.name === item.name) === index);
}

function splitCallArguments(source: string, method: string, line: number): string[] {
  const lines = source.split(/\r?\n/);
  if (!Number.isFinite(line) || line < 1 || line > lines.length) return [];

  // Search every occurrence in the source rather than only the first match in a
  // small window. A declaration may precede the real call in that same window,
  // and multiline calls can extend beyond an arbitrary window boundary.
  const candidates: Array<{ distance: number; span: number; args: string[] }> = [];

  // Keep offsets and newlines stable while hiding comments and string contents
  // from call-name matching. Parse the actual argument text from the original source.
  const searchable = source.split('');
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    const next = source[i + 1] ?? '';
    if (lineComment) {
      if (ch === '\n' || ch === '\r') lineComment = false;
      else searchable[i] = ' ';
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        searchable[i] = ' ';
        if (i + 1 < searchable.length) searchable[i + 1] = ' ';
        i += 1;
        blockComment = false;
      } else if (ch !== '\n' && ch !== '\r') {
        searchable[i] = ' ';
      }
      continue;
    }
    if (quote) {
      searchable[i] = ' ';
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      searchable[i] = ' ';
      if (i + 1 < searchable.length) searchable[i + 1] = ' ';
      i += 1;
      lineComment = true;
    } else if (ch === '/' && next === '*') {
      searchable[i] = ' ';
      if (i + 1 < searchable.length) searchable[i + 1] = ' ';
      i += 1;
      blockComment = true;
    } else if (ch === '"' || ch === "'") {
      searchable[i] = ' ';
      quote = ch;
    }
  }

  const searchableSource = searchable.join('');
  const pattern = new RegExp('\\b' + method + '\\s*\\(', 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(searchableSource)) !== null) {
    const open = source.indexOf('(', match.index);
    let depth = 0;
    let quote = '';
    let escaped = false;
    let close = -1;

    for (let i = open; i < source.length; i += 1) {
      const ch = source[i]!;
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) { close = i; break; }
      }
    }
    if (close < 0) continue;

    const after = source.slice(close + 1);
    // Exclude method declarations, including declarations with a throws clause.
    if (/^\s*(?:throws\b[^{};]*)?\s*\{/.test(after)) continue;

    const before = source.slice(0, match.index);
    const callLine = before.split(/\r?\n/).length;
    const raw = source.slice(open + 1, close);
    const args: string[] = [];
    let startArg = 0;
    let parens = 0, brackets = 0, braces = 0;
    quote = ''; escaped = false;

    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i]!;
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') parens += 1;
      else if (ch === ')') parens -= 1;
      else if (ch === '[') brackets += 1;
      else if (ch === ']') brackets -= 1;
      else if (ch === '{') braces += 1;
      else if (ch === '}') braces -= 1;
      else if (ch === ',' && parens === 0 && brackets === 0 && braces === 0) {
        args.push(raw.slice(startArg, i).trim());
        startArg = i + 1;
      }
    }
    if (raw.trim()) args.push(raw.slice(startArg).trim());
    candidates.push({ distance: Math.abs(callLine - line), span: close - open, args });
  }

  // Exact-line matches win. If nested calls of the same method share a line,
  // the innermost expression is entered first by Java, so prefer its shorter span.
  candidates.sort((a, b) => a.distance - b.distance || a.span - b.span);
  return candidates[0]?.args ?? [];
}
type InvocationNode = {
  id: string;
  parentId: string;
  method: string;
  signature: string;
  entryIndex: number;
  status: 'active' | 'returned' | 'void' | 'exceptional';
  returnValue?: unknown;
  returnValueName?: string;
  returnType?: string;
  frameVariables: Record<string, unknown>;
  arguments: Array<{ name: string; value: unknown; expression?: string }>;
  entryState?: TraceState;
  exitState?: TraceState;
  children: string[];
};

export function buildInvocationNodes(states: TraceState[], source = ''): { nodes: Map<string, InvocationNode>; currentId?: string } {
  const nodes = new Map<string, InvocationNode>();
  nodes.set('root', { id: 'root', parentId: '', method: 'Solution', signature: 'Solution', entryIndex: 0, status: 'active', frameVariables: {}, arguments: [], children: [] });
  for (let index = 0; index < states.length; index += 1) {
    const event = states[index]?.lastEvent;
    const data = isPlainObject(event?.data) ? event.data : {};
    if (event?.type === 'METHOD_ENTER' && typeof data.invocationId === 'string') {
      const id = data.invocationId;
      if (nodes.has(id)) continue;
      // Parent identity may live on the checkpoint state rather than the event payload.
      // Preserve the declared parent even if its node is encountered later; links are resolved
      // after processing the visible trace prefix instead of incorrectly flattening calls to root.
      const checkpointParentId = states[index]?.parentInvocationId;
      const parentId = typeof data.parentInvocationId === 'string'
        ? data.parentInvocationId
        : typeof checkpointParentId === 'string'
          ? checkpointParentId
          : 'root';
      const method = typeof event.method === 'string' && event.method ? event.method : 'method';
      // Only read parameter names from a method declaration, never a call site such as
      // helper(this). The old substring search could mistake that call for the declaration.
      const escapedMethod = method.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
      const declarationPattern = new RegExp('\\b(?:(?:public|private|protected)\\s+)?(?:(?:static|final|synchronized)\\s+)*[\\w.$<>?,\\[\\] ]+?\\s+' + escapedMethod + '\\s*\\(([^)]*)\\)');
      const declarationMatch = source.match(declarationPattern);
      // The runtime can report framework/JVM implementation entries as method events.
      // The visual tree represents calls into methods declared in the submitted solution,
      // so do not create a visible node for an event that has no matching source declaration.
      if (source.trim() && !declarationMatch) continue;
      const parameterText = declarationMatch?.[1] ?? '';
      const parameterNames = parameterText
        ? parameterText.split(',').map(parameter => parameter.trim().replace(/\s*=.*$/, '').split(/\s+/).pop() ?? '')
        : [];
      const rawParams = Array.isArray(data.parameterTypes)
        ? data.parameterTypes.filter((item): item is string => typeof item === 'string' && item !== 'this')
        : [];
      const displayType = (type: string): string => type
        .replace(/^java\.lang\./, '')
        .replace(/^java\.util\./, '')
        .replace(/\bboolean\b/g, 'bool');
      const entryVariables = {
        ...(isPlainObject(states[index]?.variables) ? states[index].variables : {}),
        ...(isPlainObject(data.variables) ? data.variables : {})
      };
      const argumentCount = Math.max(rawParams.length, parameterNames.length);
      const argumentNames = Array.from({ length: argumentCount }, (_unused, index) =>
        parameterNames[index] && parameterNames[index] !== 'this'
          ? parameterNames[index]
          : 'arg' + (index + 1)
      );
      // These values are captured directly from StackFrame.getArgumentValues()
      // by the Java tracer, so they remain correct even when JDI cannot expose
      // parameter names/locals at the method-entry location.
      const capturedArgumentValues = Array.isArray(data.argumentValues)
        ? data.argumentValues
        : [];
      const parentCallLine = (() => {
        for (let previous = index - 1; previous >= 0; previous -= 1) {
          const prior = states[previous];
          if (prior?.invocationId === parentId && typeof prior.line === 'number') return prior.line;
        }
        return typeof states[index - 1]?.line === 'number' ? states[index - 1].line : undefined;
      })();
      const callExpressions = parentCallLine === undefined ? [] : splitCallArguments(source, method, parentCallLine);
      const argumentsList = argumentNames.map((name, argumentIndex) => ({
        name,
        expression: callExpressions[argumentIndex] || name,
        value: argumentIndex < capturedArgumentValues.length
          ? capturedArgumentValues[argumentIndex]
          : Object.prototype.hasOwnProperty.call(entryVariables, name) ? entryVariables[name] : undefined
      }));
      const signature = `${method}(${argumentsList.map(argument => argument.expression ?? argument.name).join(', ')})`;
      const returnType = typeof data.returnType === 'string' ? displayType(data.returnType) : undefined;
      const root = nodes.get('root');
      if (root && typeof data.declaringType === 'string' && data.declaringType) {
        root.method = data.declaringType;
        root.signature = data.declaringType;
      }
      const node: InvocationNode = { id, parentId: parentId === id ? 'root' : parentId, method, signature, entryIndex: index, status: 'active', returnType, frameVariables: {}, arguments: argumentsList, entryState: states[index], children: [] };
      nodes.set(id, node);
    } else if (event?.type === 'METHOD_EXIT' && typeof data.invocationId === 'string') {
      const node = nodes.get(data.invocationId);
      if (!node) continue;
      node.status = data.exceptional === true ? 'exceptional' : data.returnedVoid === true ? 'void' : 'returned';
      node.exitState = states[index];
      if (Object.prototype.hasOwnProperty.call(data, 'returnValue')) node.returnValue = data.returnValue;
      else if (data.hasReturnValue === true) node.returnValue = null;
      const exitLine = states[index]?.line;
      const returnStatement = typeof exitLine === 'number' ? source.split(/\r?\n/)[exitLine - 1] : undefined;
      const returnedVariable = returnStatement?.match(/\breturn\s+(?:this\.)?([A-Za-z_$][\w$]*)\s*;/);
      if (returnedVariable?.[1]) node.returnValueName = returnedVariable[1];
      if (typeof data.returnType === 'string') node.returnType = data.returnType;
    }

    const root = nodes.get('root');
    if (root && typeof data.declaringType === 'string' && data.declaringType) {
      root.method = data.declaringType;
      root.signature = data.declaringType;
    }
    if (root && isPlainObject(data.classFields)) {
      root.frameVariables = data.classFields;
    }

    const checkpointId = typeof states[index]?.invocationId === 'string'
      ? states[index].invocationId
      : typeof data.invocationId === 'string' ? data.invocationId : undefined;
    const checkpointNode = checkpointId ? nodes.get(checkpointId) : undefined;
    if (checkpointNode && event?.type !== 'METHOD_EXIT') {
      // State snapshots and event payloads are not always populated at the same
      // checkpoint. Prefer event frame variables when present, while also
      // accepting the normalized state snapshot as a fallback.
      const snapshot = {
        ...(isPlainObject(states[index]?.variables) ? states[index].variables : {}),
        ...(isPlainObject(data.variables) ? data.variables : {}),
      };
      if (Object.keys(snapshot).length > 0) {
        checkpointNode.frameVariables = snapshot;

        // METHOD_ENTER can arrive before JDI exposes every parameter in the
        // local-variable table. Fill only missing values from the earliest later
        // snapshot for this exact invocation. Never replace captured values
        // (including null, 0, false, or empty collections) with later mutations.
        checkpointNode.arguments = checkpointNode.arguments.map(argument => {
          if (argument.value !== undefined ||
              !Object.prototype.hasOwnProperty.call(snapshot, argument.name) ||
              snapshot[argument.name] === undefined) {
            return argument;
          }
          return { ...argument, value: snapshot[argument.name] };
        });
      }
    }
  }
  // Resolve relationships only after every invocation in this checkpoint prefix is known.
  // This handles trace producers that report parentInvocationId on the state, and avoids
  // creating a long flat list when a parent node is registered later in the prefix.
  for (const node of nodes.values()) node.children = [];
  for (const node of nodes.values()) {
    if (node.id === 'root') continue;
    const parent = nodes.get(node.parentId) ?? nodes.get('root');
    if (parent && !parent.children.includes(node.id)) parent.children.push(node.id);
  }

  const last = states[states.length - 1];
  const lastData = isPlainObject(last?.lastEvent?.data) ? last.lastEvent.data : {};
  const currentId = typeof last?.invocationId === 'string' ? last.invocationId : typeof lastData.invocationId === 'string' ? lastData.invocationId : undefined;
  return { nodes, currentId };
}

function InvocationTree({ states, currentIndex, onSelect, source }: { states: TraceState[]; currentIndex: number; onSelect: (index: number) => void; source: string }) {
  const [openArguments, setOpenArguments] = useState<{ node: InvocationNode; anchor: HTMLElement; kind?: 'arguments' | 'return' } | null>(null);
  const [argumentPopoverPosition, setArgumentPopoverPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const argumentCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argumentPopoverRef = useRef<HTMLDivElement | null>(null);
  const [openClassContext, setOpenClassContext] = useState<{ node: InvocationNode; anchor: HTMLElement } | null>(null);
  const [classContextPosition, setClassContextPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const classContextCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const classContextPopoverRef = useRef<HTMLDivElement | null>(null);
  const updateClassContextPosition = useMemo(() => () => {
    const anchor = openClassContext?.anchor;
    if (!anchor || !anchor.isConnected) { setClassContextPosition(null); return; }
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(680, window.innerWidth - margin * 2);
    const gap = 8;
    // Keep the class-context preview beside its trigger, matching the function dropdown.
    // Prefer the right side; flip left only when there is not enough room on the right.
    const rightSpace = window.innerWidth - rect.right - gap - margin;
    const leftSpace = rect.left - gap - margin;
    const placeRight = rightSpace >= Math.min(width, 220) || rightSpace >= leftSpace;
    const left = placeRight
      ? Math.max(margin, Math.min(rect.right + gap, window.innerWidth - width - margin))
      : Math.max(margin, rect.left - gap - width);
    const maxHeight = Math.max(100, Math.min(380, window.innerHeight - margin * 2));
    const top = Math.max(margin, Math.min(rect.top, window.innerHeight - maxHeight - margin));
    setClassContextPosition({ left, top, maxHeight });
  }, [openClassContext]);
  useLayoutEffect(() => {
    if (!openClassContext) { setClassContextPosition(null); return; }
    updateClassContextPosition();
    window.addEventListener('resize', updateClassContextPosition);
    window.addEventListener('scroll', updateClassContextPosition, true);
    return () => { window.removeEventListener('resize', updateClassContextPosition); window.removeEventListener('scroll', updateClassContextPosition, true); };
  }, [openClassContext, updateClassContextPosition]);
  const openClassContextPreview = (node: InvocationNode, anchor: HTMLElement) => {
    if (classContextCloseTimer.current) clearTimeout(classContextCloseTimer.current);
    classContextCloseTimer.current = null;
    setOpenClassContext({ node, anchor });
  };
  const scheduleClassContextClose = () => {
    if (classContextCloseTimer.current) clearTimeout(classContextCloseTimer.current);
    classContextCloseTimer.current = setTimeout(() => {
      if (!classContextPopoverRef.current?.matches(':hover') && !classContextPopoverRef.current?.contains(document.activeElement)) setOpenClassContext(null);
      classContextCloseTimer.current = null;
    }, 180);
  };
  useEffect(() => () => { if (classContextCloseTimer.current) clearTimeout(classContextCloseTimer.current); }, []);
  const updateArgumentPopoverPosition = useMemo(() => () => {
    const anchor = openArguments?.anchor;
    if (!anchor || !anchor.isConnected) { setArgumentPopoverPosition(null); return; }
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(680, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const below = window.innerHeight - rect.bottom - 14;
    const above = rect.top - 14;
    const placeBelow = below >= Math.min(180, above) || below >= above;
    const maxHeight = Math.max(100, Math.min(360, Math.floor(placeBelow ? below : above)));
    const top = placeBelow ? Math.min(window.innerHeight - margin - maxHeight, rect.bottom + 6) : Math.max(margin, rect.top - 6 - maxHeight);
    setArgumentPopoverPosition({ left, top, maxHeight });
  }, [openArguments]);
  useLayoutEffect(() => {
    if (!openArguments) { setArgumentPopoverPosition(null); return; }
    updateArgumentPopoverPosition();
    window.addEventListener('resize', updateArgumentPopoverPosition);
    window.addEventListener('scroll', updateArgumentPopoverPosition, true);
    return () => { window.removeEventListener('resize', updateArgumentPopoverPosition); window.removeEventListener('scroll', updateArgumentPopoverPosition, true); };
  }, [openArguments, updateArgumentPopoverPosition]);
  const openArgumentPreview = (node: InvocationNode, anchor: HTMLElement, kind: 'arguments' | 'return' = 'arguments') => {
    if (argumentCloseTimer.current) clearTimeout(argumentCloseTimer.current);
    argumentCloseTimer.current = null;
    setOpenArguments({ node, anchor, kind });
  };
  const scheduleArgumentPreviewClose = () => {
    if (argumentCloseTimer.current) clearTimeout(argumentCloseTimer.current);
    argumentCloseTimer.current = setTimeout(() => {
      if (!argumentPopoverRef.current?.matches(':hover') && !argumentPopoverRef.current?.contains(document.activeElement)) setOpenArguments(null);
      argumentCloseTimer.current = null;
    }, 140);
  };
  useEffect(() => () => { if (argumentCloseTimer.current) clearTimeout(argumentCloseTimer.current); }, []);

  const { nodes } = useMemo(() => buildInvocationNodes(states.slice(0, currentIndex + 1), source), [states, currentIndex, source]);
  const classDeclarations = useMemo(() => parseClassFieldDeclarations(source), [source]);
  const current = states[currentIndex];
  const viewportRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    const selected = viewport?.querySelector<HTMLElement>('.yv-tree-node.selected');
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }, [currentIndex, nodes.size]);
  const currentData = isPlainObject(current?.lastEvent?.data) ? current.lastEvent.data : {};
  const selectedId = typeof current?.invocationId === 'string' ? current.invocationId : typeof currentData.invocationId === 'string' ? currentData.invocationId : undefined;
  const renderNode = (id: string, depth: number): ReactNode => {
    const node = nodes.get(id);
    if (!node) return null;
    const selected = id === selectedId;
    const result = node.status === 'active' ? '-' : node.status === 'void' ? 'void' : node.status === 'exceptional' ? 'Exception' : displayValue(node.returnValue);
    return <div className={`yv-tree-branch depth-${Math.min(depth, 5)}`} key={id}>
      <div
        role="button"
        tabIndex={0}
        className={`yv-tree-node ${selected ? 'selected' : ''} ${node.status} ${id === 'root' ? 'class-context-node' : ''}`}
        style={{ '--yv-tree-depth': depth } as CSSProperties}
        onClick={() => onSelect(node.entryIndex)}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(node.entryIndex);
          }
        }}
        aria-current={selected ? 'step' : undefined}
      >
        <span className="yv-tree-depth" style={{ fontSize: '0.68em', lineHeight: 1.1, opacity: 0.72 }}>Depth {depth}</span>
        {node.arguments.length > 0 ? (
          <span className="yv-tree-method">
            <span>{node.method}</span>
            <span className="yv-tree-arguments">
              <button
                type="button"
                className="yv-tree-arguments-trigger"
                aria-label={`Preview all arguments passed to ${node.method}`}
                aria-haspopup="true"
                aria-expanded={openArguments?.node.id === node.id && (openArguments.kind ?? 'arguments') === 'arguments'}
                onMouseEnter={event => openArgumentPreview(node, event.currentTarget)}
                onMouseLeave={scheduleArgumentPreviewClose}
                onFocus={event => openArgumentPreview(node, event.currentTarget)}
                onBlur={scheduleArgumentPreviewClose}
                onClick={event => { event.stopPropagation(); if (openArguments?.node.id === node.id && (openArguments.kind ?? 'arguments') === 'arguments') setOpenArguments(null); else openArgumentPreview(node, event.currentTarget, 'arguments'); }}
                onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") setOpenArguments(null); }}
              >
                ({node.arguments.map((argument, argumentIndex) => (
                  <span className="yv-tree-argument-name" key={argument.name}>
                    {argument.expression ?? argument.name}{argumentIndex < node.arguments.length - 1 ? ', ' : ''}
                  </span>
                ))})
              </button>
            </span>
          </span>
        ) : (
          <span className="yv-tree-method">{node.signature}</span>
        )}
        {id === 'root' ? (
          <span className="yv-tree-outcome yv-class-context">
            <button
              type="button"
              className="yv-class-context-trigger"
              aria-label={`Preview class declarations and captured values for ${node.method}`}
              aria-haspopup="true"
              aria-expanded={openClassContext?.node.id === node.id}
              onMouseEnter={event => openClassContextPreview(node, event.currentTarget)}
              onMouseLeave={scheduleClassContextClose}
              onFocus={event => openClassContextPreview(node, event.currentTarget)}
              onBlur={scheduleClassContextClose}
              onClick={event => { event.stopPropagation(); if (openClassContext?.node.id === node.id) setOpenClassContext(null); else openClassContextPreview(node, event.currentTarget); }}
              onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") setOpenClassContext(null); }}
            >Class context</button>
          </span>
        ) : (
          <span className="yv-tree-outcome">
            {node.status === 'returned' ? (
              <span className="yv-tree-return-value">
                <button
                  type="button"
                  className="yv-tree-arguments-trigger yv-tree-return-trigger"
                  aria-label={`Preview return value from ${node.method}`}
                  aria-haspopup="true"
                  aria-expanded={openArguments?.node.id === node.id && openArguments.kind === 'return'}
                  onMouseEnter={event => openArgumentPreview(node, event.currentTarget, 'return')}
                  onMouseLeave={scheduleArgumentPreviewClose}
                  onFocus={event => openArgumentPreview(node, event.currentTarget, 'return')}
                  onBlur={scheduleArgumentPreviewClose}
                  onClick={event => { event.stopPropagation(); if (openArguments?.node.id === node.id && openArguments.kind === 'return') setOpenArguments(null); else openArgumentPreview(node, event.currentTarget, 'return'); }}
                  onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") setOpenArguments(null); }}
                >{node.returnValueName ?? 'return'}</button>
              </span>
            ) : result}
          </span>
        )}
      </div>
      {node.children.length > 0 && <div className="yv-tree-children">{node.children.map(child => renderNode(child, depth + 1))}</div>}
    </div>;
  };
  return <>
    <aside className="yv-function-tree" aria-label="Function call tree">
      <div className="yv-tree-heading"><strong>Function tree</strong><span>{Math.max(0, nodes.size - 1)} calls</span></div>
      <div className="yv-tree-viewport" ref={viewportRef}>{renderNode('root', 0)}</div>
    </aside>
    {openArguments && argumentPopoverPosition && createPortal(
      <div
        ref={argumentPopoverRef}
        className="yv-tree-arguments-popover yv-tree-arguments-popover-portal"
        role="region"
        aria-label={openArguments.kind === 'return' ? `Return value from ${openArguments.node.method}` : `Arguments for ${openArguments.node.method}`}
        style={{ left: argumentPopoverPosition.left, top: argumentPopoverPosition.top, maxHeight: argumentPopoverPosition.maxHeight }}
        onMouseEnter={() => { if (argumentCloseTimer.current) clearTimeout(argumentCloseTimer.current); argumentCloseTimer.current = null; }}
        onMouseLeave={scheduleArgumentPreviewClose}
        onFocus={() => { if (argumentCloseTimer.current) clearTimeout(argumentCloseTimer.current); argumentCloseTimer.current = null; }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleArgumentPreviewClose(); }}
      >
        {openArguments.kind === 'return' ? (
          <span className="yv-tree-argument-preview">
            <strong className="yv-tree-argument-label">{openArguments.node.returnValueName ?? "return"}</strong>
            <span className="yv-tree-argument-value">
              <DataValue value={openArguments.node.returnValue} state={openArguments.node.exitState ?? openArguments.node.entryState} source={source} name={openArguments.node.returnValueName ?? "return"} />
            </span>
          </span>
        ) : openArguments.node.arguments.map(argument => (
          <span className="yv-tree-argument-preview" key={argument.name}>
            <strong className="yv-tree-argument-label">{argument.expression && argument.expression !== argument.name ? <>{argument.expression} <span aria-hidden="true">→</span> {argument.name}</> : argument.name}</strong>
            <span className="yv-tree-argument-value">
              {argument.value === undefined
                ? <span className="yv-code">Value not captured</span>
                : <DataValue value={argument.value} state={openArguments.node.entryState} source={source} name={argument.name} />}
            </span>
          </span>
        ))}
      </div>,
      openArguments.anchor.getRootNode() as ShadowRoot
    )}
    {openClassContext && classContextPosition && createPortal(
      <div
        ref={classContextPopoverRef}
        className="yv-class-context-popover yv-class-context-popover-portal"
        role="region"
        aria-label={`Class fields for ${openClassContext.node.method}`}
        style={{ left: classContextPosition.left, top: classContextPosition.top, maxHeight: classContextPosition.maxHeight }}
        onMouseEnter={() => { if (classContextCloseTimer.current) clearTimeout(classContextCloseTimer.current); classContextCloseTimer.current = null; }}
        onMouseLeave={scheduleClassContextClose}
        onFocus={() => { if (classContextCloseTimer.current) clearTimeout(classContextCloseTimer.current); classContextCloseTimer.current = null; }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleClassContextClose(); }}
      >
            {classDeclarations.length > 0 || Object.entries(openClassContext.node.frameVariables).length > 0 ? (
              <>
                {classDeclarations.map(field => {
                  const captured = Object.prototype.hasOwnProperty.call(openClassContext.node.frameVariables, field.name);
                  return (
                    <span className="yv-tree-argument-preview" key={field.name}>
                      <strong className="yv-tree-argument-label">{field.name}</strong>
                      <span className="yv-class-field-declaration">{field.declaration}</span>
                      <span className="yv-tree-argument-value">
                        {captured
                          ? <DataValue value={openClassContext.node.frameVariables[field.name]} state={current} source={source} name={field.name} />
                          : <span className="yv-class-field-pending">Not captured yet</span>}
                      </span>
                    </span>
                  );
                })}
                {Object.entries(openClassContext.node.frameVariables).filter(([name]) => !classDeclarations.some(field => field.name === name)).map(([name, value]) => (
                  <span className="yv-tree-argument-preview" key={name}>
                    <strong className="yv-tree-argument-label">{name}</strong>
                    <span className="yv-tree-argument-value"><DataValue value={value} state={current} source={source} name={name} /></span>
                  </span>
                ))}
              </>
            ) : <span className="yv-class-context-empty">No class fields are declared in this solution.</span>}
</div>,
      openClassContext.anchor.getRootNode() as ShadowRoot
    )}
  </>;
}

export function VisualizerPanel(){
  const [treeOpen,setTreeOpen]=useState(false);
  const s=useSession(); const current=s.states[s.index]; const prev=s.index>0?s.states[s.index-1]:undefined;
  const classDeclarationLine = useMemo(() => {
    const lines = s.source.split(/\r?\n/);
    const index = lines.findIndex(value => /\bclass\s+[A-Za-z_$][\w$]*/.test(value) && !/^\s*(?:\/\/|\*|\*)/.test(value));
    return index >= 0 ? index + 1 : undefined;
  }, [s.source]);
  // The first checkpoint is the class-entry frame: highlight the declaration
  // before the JVM reaches the first executable initializer or method line.
  const line = current?.line && current.line > 0 ? current.line : (s.index === 0 ? classDeclarationLine : undefined);
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
    {!s.loading&&!finished&&<div className={`yv-workspace ${treeOpen?'tree-open':''}`}><div className="yv-workspace-tree"><InvocationTree states={s.states} currentIndex={s.index} source={s.source} onSelect={index=>{sessionStore.set({index,playing:false});}}/></div><div className="yv-workspace-content"><div className="yv-tree-toggle-row"><button type="button" className="yv-tree-toggle" aria-expanded={treeOpen} onClick={()=>setTreeOpen(open=>!open)}><span aria-hidden="true">⌘</span> Function tree <span className="yv-tree-toggle-hint">Recursion & calls</span></button></div><Section title="Variables"><Variables state={current} previous={prev}/></Section><Section title="Data Structures"><DataStructures state={current} source={s.source}/></Section></div></div>}
  </div><div className="yv-current"><ExecutionInspector state={current} previous={prev} statement={statement} index={s.index} total={s.states.length}/><div className="yv-controls"><div className="yv-buttons"><button className="yv-btn" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.restart()} disabled={!s.states.length}>↺ Restart</button><button className="yv-btn" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.prev()} disabled={s.index<=0}>← Prev</button><button className="yv-btn primary" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.togglePlay()} disabled={s.states.length<2}>{s.playing?'■ Stop':'▶ Play'}</button><button className="yv-btn" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.next()} disabled={!s.states.length||s.index>=s.states.length-1}>Next →</button></div></div></div></div>;
}
