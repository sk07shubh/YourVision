import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../state/session';
import { sessionStore } from '../state/store';
import { displayValue, stableStringify, isPlainObject } from '../utils/value';
import { highlightEditorLine, clearEditorExecutionMarker } from '../leetcode/editor-overlay';
import type { TraceState } from '../types/trace';
import { GraphView } from '../visualization/structures/GraphView';
import { TrieView } from '../visualization/structures/TrieView';
import type { GraphNode, GraphEdge } from '../visualization/structures/GraphView';
import type { TrieNodeLike } from '../visualization/structures/TrieView';
import { eventTargets, primaryVisualOperation, semanticEventsBetween, visualOperationLabel } from '../visualization/engine/operationSemantics';
import type { VisualEvent } from '../visualization/engine/visualEvents';

type Obj = Record<string, unknown>;

function eventLabel(state?: TraceState): string {
  const t = state?.lastEvent?.type;
  if (!t) return state ? 'Execution state' : 'Ready';
  return ({STEP:'Executed line',METHOD_ENTER:'Entered method',METHOD_EXIT:'Returned from method',ARRAY_WRITE:'Array updated',ARRAY_ACCESS:'Array accessed',ARRAY_REFERENCE:'Array referenced',OBJECT_FIELD_WRITE:'Object updated',OBJECT_CREATE:'Object created',VARIABLE_UPDATE:'Variable updated',MAP_WRITE:'Map updated',ERROR:'Runtime error',TIMEOUT:'Execution timed out',TRACE_LIMIT:'Trace limit reached',PROGRAM_START:'Started',PROGRAM_END:'Finished'} as Record<string,string>)[t] ?? 'Execution state';
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
  seen,
  visualEvents = []
}: {
  value: { values: unknown[] };
  state?: TraceState;
  source: string;
  name?: string;
  depth: number;
  seen: Set<string>;
  visualEvents?: VisualEvent[];
}) {
  return (
    <div className="yv-collection-backing">
      <div className="yv-code yv-collection-backing-title">Array view · snapshot order</div>
      <ArrayView value={value.values} state={state} source={source} arrayName={name} depth={depth} seen={seen} visualEvents={visualEvents}/>
    </div>
  );
}

function changedCollectionIndices(value: Obj|undefined, previousValue: unknown): Set<number> {
  const currentValues=isCollectionSnapshot(value)?value.values:[];
  const previousValues=isCollectionSnapshot(previousValue)?previousValue.values:[];
  const changed=new Set<number>();
  const limit=Math.max(currentValues.length,previousValues.length);
  for(let i=0;i<limit;i++)if(stableStringify(currentValues[i])!==stableStringify(previousValues[i]))changed.add(i);
  return changed;
}
function CollectionView({
  value,
  state,
  source,
  name,
  previousValue,
  depth = 0,
  seen = new Set<string>(),
  visualEvents = []
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
  previousValue?: unknown;
  depth?: number;
  seen?: Set<string>;
  visualEvents?: VisualEvent[];
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
  const changed=changedCollectionIndices(value,previousValue);

  if (kind === 'stack') {
    return (
      <div className="yv-collection">
        <div className="yv-collection-meta">
          <span>{type}</span>
          <span>TOP · {itemCount} items</span>
        </div>
        <div className="yv-stack-view">
          {[...value.values].reverse().map((item, index) => (
            <div className={changed.has(value.values.length-1-index)?'yv-stack-cell yv-collection-changed':'yv-stack-cell'} key={index}>
              <span className="yv-stack-position">{index === 0 ? 'TOP' : ''}</span>
              <DataValue value={item} state={state} source={source} depth={depth + 1} seen={seen}/>
            </div>
          ))}
          {!value.values.length && <div className="yv-empty">Empty stack</div>}
        </div>
        <CollectionBackingArray value={value} state={state} source={source} name={name} depth={depth} seen={seen} visualEvents={visualEvents}/>
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
            <div className={changed.has(index)?'yv-queue-cell yv-collection-changed':'yv-queue-cell'} key={index}>
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
            <div className={changed.has(index)?'yv-set-element yv-collection-changed':'yv-set-element'} key={index}>
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
                  <div className={changed.has((2 ** level) - 1 + index)?'yv-heap-node-wrap yv-collection-changed':'yv-heap-node-wrap'} key={`${level}-${index}`}>
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
  const entries = Object.entries(state?.variables ?? {}).filter(([, value]) => !isStructuralObject(value));
  if (!entries.length) return <div className="yv-empty">No local variables yet.</div>;

  return (
    <div className="yv-vars">
      {entries.map(([name, value]) => {
        const old = previous?.variables?.[name];
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
                    {variableSummary(old)}
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

function matrixIndexVariableNames(source: string, arrayName?: string): [Set<string>, Set<string>] {
  const rows = new Set<string>(); const columns = new Set<string>();
  if (!arrayName) return [rows, columns];
  const pattern = new RegExp(arrayName + '\\s*\\[\\s*([A-Za-z_$][\\w$]*)\\s*\\]\\s*\\[\\s*([A-Za-z_$][\\w$]*)\\s*\\]', 'g');
  for (const match of source.matchAll(pattern)) { rows.add(match[1]); columns.add(match[2]); }
  return [rows, columns];
}
function activeMatrixCell(state: TraceState | undefined, source: string, arrayName?: string): { row: number; column: number } | undefined {
  const [rowNames, columnNames] = matrixIndexVariableNames(source, arrayName);
  if (!rowNames.size || !columnNames.size) return undefined;
  let row: number | undefined; let column: number | undefined;
  for (const [name, value] of Object.entries(state?.variables ?? {})) {
    if (!Number.isInteger(value)) continue;
    if (rowNames.has(name)) row = value as number;
    if (columnNames.has(name)) column = value as number;
  }
  return row !== undefined && column !== undefined && row >= 0 && column >= 0 ? { row, column } : undefined;
}

function pointerLabels(state: TraceState | undefined, length: number, indexNames: Set<string>): Map<number,string[]> {
  const map = new Map<number,string[]>();
  for (const [name,value] of Object.entries(state?.variables ?? {})) {
    if (!indexNames.has(name)) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= length) continue;
    const list = map.get(value) ?? []; list.push(name); map.set(value,list);
  }
  return map;
}

function changedArrayIndices(state?: TraceState): Set<number> {
  const set = new Set<number>();
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data)) return set;
  const changes = data.changes;
  if (!Array.isArray(changes)) return set;
  for (const c of changes) {
    if (!isPlainObject(c) || !Array.isArray(c.indices)) continue;
    const i = c.indices[0]; if (typeof i === 'number') set.add(i);
  }
  return set;
}

function ArrayView({ value, state, source, arrayName, depth = 0, seen = new Set<string>(), visualEvents = [] }: { value: unknown[]; state?: TraceState; source?: string; arrayName?: string; depth?: number; seen?: Set<string>; visualEvents?: VisualEvent[] }) {
  if (value.every(Array.isArray)) {
    const active = activeMatrixCell(state, source ?? '', arrayName);
    return <div className="yv-matrix">{value.map((row,r)=><div className="yv-array" key={r}>{(row as unknown[]).map((v,i)=>{
      const selected = active?.row === r && active?.column === i;
      const operations = eventTargets(visualEvents, isArraySnapshot(state?.arrays?.[arrayName ?? '']) ? String((state?.arrays?.[arrayName ?? ''] as Obj).$arrayId) : String(arrayName ?? ''), undefined, r, i);
      return <div className={`yv-cell ${operations.map(op => `yv-cell-op-${op}`).join(' ')}`} key={selected ? `${i}-${state?.sequence ?? 0}` : i}><div className={`yv-cell-value ${selected ? 'yv-cell-active' : ''}`}><DataValue value={v} state={state} source={source ?? ''} depth={depth + 1} seen={seen}/></div><div className="yv-cell-index">[${r},${i}]</div></div>;
    })}</div>)}</div>;
  }
  const labels=pointerLabels(state,value.length,arrayIndexVariableNames(source ?? '', arrayName)); const changed=changedArrayIndices(state); const structureId = arrayName && isArraySnapshot(state?.arrays?.[arrayName]) ? state.arrays[arrayName].$arrayId : arrayName;
  return <div className="yv-array">{value.map((v,i)=>{
    const changedCell = changed.has(i); const operations = structureId ? eventTargets(visualEvents, structureId, i) : [];
    return <div className={`yv-cell ${operations.map(op => `yv-cell-op-${op}`).join(' ')}`} key={changedCell ? `${i}-${state?.sequence ?? 0}` : i}>{labels.has(i)&&<div className="yv-pointer">{labels.get(i)!.join(' · ')}</div>}<div className={`yv-cell-value ${changedCell?'yv-cell-changed':''}`}><DataValue value={v} state={state} source={source ?? ''} name={arrayName} depth={depth + 1} seen={seen}/></div><div className="yv-cell-index">{i}</div></div>;
  })}</div>;
}

function mapChanges(state?: TraceState): Array<{
  kind: 'insert' | 'update' | 'delete';
  key: unknown;
  before?: unknown;
  after?: unknown;
}> {
  const data = state?.lastEvent?.data;
  if (!isPlainObject(data) || !Array.isArray(data.changes)) return [];

  return data.changes.filter(
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
    <div className={'yv-node '+(pointerNames.has(n.id)?'yv-node-active':'')}>{displayValue(n.value)}</div>{i<nodes.length-1&&<div className="yv-edge">→</div>}
  </div>)}</div>;
}

function TreeNodeView({ value, objects, variables = {}, depth=0 }: { value: unknown; objects: Record<string,unknown>; variables?: Record<string,unknown>; depth?: number }) {
  const resolved=resolveRef(value,objects); if(!isPlainObject(resolved)||depth>8)return null;
  const id=typeof resolved.$objectId==='string'?resolved.$objectId:undefined;
  const active=Boolean(id&&Object.values(variables).some(item=>isPlainObject(item)&&item.$objectId===id));
  const f=objectFields(resolved);
  return <div className="yv-tree-node"><div className={'yv-node '+(active?'yv-tree-node-active':'')}>{displayValue(nodeValue(resolved))}</div>{(f.left!=null||f.right!=null)&&<div className="yv-tree-children"><div>{f.left!=null?<TreeNodeView value={f.left} objects={objects} variables={variables} depth={depth+1}/>:<span className="yv-null">null</span>}</div><div>{f.right!=null?<TreeNodeView value={f.right} objects={objects} variables={variables} depth={depth+1}/>:<span className="yv-null">null</span>}</div></div>}</div>;
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
  resolveObjects = true,
  previousValue,
  visualEvents = []
}: {
  value: unknown;
  state?: TraceState;
  source: string;
  previousValue?: unknown;
  name?: string;
  depth?: number;
  seen?: Set<string>;
  resolveObjects?: boolean;
  visualEvents?: VisualEvent[];
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
    return <CollectionView value={value} state={state} source={source} name={name} previousValue={previousValue} depth={depth} seen={seen} visualEvents={visualEvents}/>
  }

  if (isArraySnapshot(value)) {
    return (
      <>
        <ArrayView value={value.values} state={state} source={source} arrayName={name} depth={depth} seen={seen} visualEvents={visualEvents}/>
        {value.truncated === true && (
          <div className="yv-truncated">
            Showing first {value.values.length} of {String(value.length ?? '?')} items.
          </div>
        )}
      </>
    );
  }

  if (Array.isArray(value)) return <ArrayView value={value} state={state} source={source} arrayName={name} depth={depth} seen={seen} visualEvents={visualEvents}/>;
  if (isPlainObject(value)) {
    const smart=smartStructureView(value,state); if(smart)return smart;
    if (looksTreeNode(value)) return <div className="yv-tree"><TreeNodeView value={value} objects={state?.objects??{}} variables={state?.variables??{}}/></div>;
    if (looksListNode(value)) return <LinkedListView root={value} objects={state?.objects??{}} variables={state?.variables??{}}/>;
    const resolved = resolveObjects ? resolveRef(value, state?.objects ?? {}) : value;
    if (isPlainObject(resolved)) {
      return <ObjectView value={resolved} state={state} source={source} depth={depth} seen={seen}/>;
    }
  }
  return <div className="yv-code">{displayValue(value)}</div>;
}

function objectIdOf(value: unknown): string | undefined {
  if (!isPlainObject(value)) return undefined;
  if (typeof value.$objectId === 'string') return value.$objectId;
  if (typeof value.$ref === 'string') return value.$ref;
  return undefined;
}
function runtimeObjectIds(state?: TraceState): Set<string> { const ids=new Set<string>(); for(const value of Object.values(state?.variables??{})){const id=objectIdOf(value);if(id)ids.add(id);} return ids; }
function collectionObjectIds(state: TraceState|undefined,kinds:Set<string>): Set<string> { const ids=new Set<string>(); for(const value of Object.values(state?.dataStructures??{})){if(!isCollectionSnapshot(value)||!kinds.has(value.$kind??''))continue;for(const item of value.values){const id=objectIdOf(item);if(id)ids.add(id);}} return ids; }
function graphNeighbors(value: Obj): unknown[] { const fields=objectFields(value); for(const key of ['neighbors','neighbours','adjacent','adjacency','connections']){const candidate=fields[key];if(isCollectionSnapshot(candidate)||isArraySnapshot(candidate))return candidate.values;if(Array.isArray(candidate))return candidate;if(isMapSnapshot(candidate))return candidate.entries.map(entry=>entry.value);} return []; }
function isGraphNode(value: unknown): value is Obj { if(!isPlainObject(value)||looksListNode(value)||looksTreeNode(value))return false; return ['neighbors','neighbours','adjacent','adjacency','connections'].some(key=>key in objectFields(value)); }
function graphSnapshot(root: Obj,state?:TraceState): {nodes:GraphNode[];edges:GraphEdge[]} { const objects=state?.objects??{};const queue:unknown[]=[resolveRef(root,objects)];const seen=new Set<string>();const nodes:GraphNode[]=[];const edges:GraphEdge[]=[];const active=runtimeObjectIds(state);const visited=collectionObjectIds(state,new Set(['set']));const frontier=collectionObjectIds(state,new Set(['queue','deque']));while(queue.length&&nodes.length<80){const raw=queue.shift();const node=resolveRef(raw,objects);if(!isPlainObject(node))continue;const id=objectIdOf(node);if(!id||seen.has(id))continue;seen.add(id);nodes.push({id,label:String(nodeValue(node)),active:active.has(id),visited:visited.has(id),frontier:frontier.has(id)});for(const childRaw of graphNeighbors(node)){const child=resolveRef(childRaw,objects);const childId=objectIdOf(child);if(!childId)continue;edges.push({from:id,to:childId});queue.push(child);}}return {nodes,edges}; }
function isTrieNode(value: unknown): value is Obj { if(!isPlainObject(value)||looksListNode(value)||looksTreeNode(value)||isGraphNode(value))return false;const fields=objectFields(value);const children=fields.children??fields.child;const terminal=['terminal','isEnd','isWord','end'].some(key=>typeof fields[key]==='boolean');return /TrieNode/i.test(objectType(value)) || Boolean(children && (isMapSnapshot(children)||isCollectionSnapshot(children)||Array.isArray(children)) && (terminal || 'char' in fields)); }
function trieSnapshot(root: Obj,state?:TraceState): TrieNodeLike { const objects=state?.objects??{};const active=runtimeObjectIds(state);const build=(raw:unknown):TrieNodeLike=>{const resolved=resolveRef(raw,objects);const node=isPlainObject(resolved)?resolved:{};const fields=objectFields(node);const id=objectIdOf(node)??'trie-node';const rawChildren=fields.children??fields.child;const children:TrieNodeLike[]=[];if(isMapSnapshot(rawChildren)){for(const entry of rawChildren.entries)children.push(build(entry.value));}else{const values=isCollectionSnapshot(rawChildren)?rawChildren.values:Array.isArray(rawChildren)?rawChildren:[];for(const item of values)children.push(build(item));}const terminal=typeof fields.terminal==='boolean'?fields.terminal:typeof fields.isEnd==='boolean'?fields.isEnd:typeof fields.isWord==='boolean'?fields.isWord:typeof fields.end==='boolean'?fields.end:false;return {id,value:String(fields.char??fields.value??fields.val??''),terminal,active:active.has(id),children};};return build(root); }
function smartStructureView(value: Obj,state?:TraceState): React.ReactNode|null { if(isGraphNode(value)){const graph=graphSnapshot(value,state);if(graph.nodes.length>1||graph.edges.length)return <GraphView nodes={graph.nodes} edges={graph.edges} directed/>;}if(isTrieNode(value))return <TrieView root={trieSnapshot(value,state)}/>;return null; }
function isStructuralObject(value: unknown): value is Obj {
  if (!isPlainObject(value)) return false;
  const fields = objectFields(value);
  const type = objectType(value);
  return /ListNode|TreeNode/i.test(type) ||
    ('next' in fields && ('val' in fields || 'value' in fields)) ||
    (('left' in fields || 'right' in fields) && ('val' in fields || 'value' in fields));
}

function DataStructures({ state, previousState, source, visualEvents = [] }: { state?: TraceState; previousState?: TraceState; source: string; visualEvents?: VisualEvent[] }) {
  const namedObjectIds = new Map<string, string[]>();

  for (const [name, value] of Object.entries(state?.variables ?? {})) {
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
            <DataValue value={value} state={state} source={source} name={title} previousValue={state?.dataStructures?.[names[0]] && previousState?.dataStructures?.[names[0]]} visualEvents={visualEvents}/>
          </div>
        );
      })}
    </div>
  );
}

export function VisualizerPanel(){
  const s=useSession(); const current=s.states[s.index]; const prev=s.index>0?s.states[s.index-1]:undefined;
  const visualEvents = useMemo(() => semanticEventsBetween(prev, current, s.source), [prev, current, s.source]);
  const visualOperation = primaryVisualOperation(visualEvents);
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
    {!s.loading&&<><Section title="Variables"><Variables state={current} previous={prev}/></Section><Section title="Call Stack">{current?.callStack?.length?<div className="yv-stack-wrap"><div className="yv-stack-label">TOP</div><div className="yv-stack">{current.callStack.map((f:string,i:number)=><div className="yv-frame" key={`${f}-${i}`}>{f}</div>)}</div><div className="yv-stack-label bottom">BOTTOM</div></div>:<div className="yv-empty">No active method calls.</div>}</Section><Section title="Data Structures"><DataStructures state={current} previousState={prev} source={s.source} visualEvents={visualEvents}/></Section></>}
  </div><div className="yv-current"><div className="yv-current-head"><span>{eventLabel(current)}</span><span className={`yv-operation yv-operation-${visualOperation}`}>{visualOperationLabel(visualOperation)}</span></div><div className="yv-statement">{statement||'Select a testcase and press Visualize.'}</div><div className="yv-controls"><div className="yv-buttons"><button className="yv-btn" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.restart()} disabled={!s.states.length}>↺ Restart</button><button className="yv-btn" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.prev()} disabled={s.index<=0}>← Prev</button><button className="yv-btn primary" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.togglePlay()} disabled={s.states.length<2}>{s.playing?'■ Stop':'▶ Play'}</button><button className="yv-btn" tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={()=>sessionStore.next()} disabled={!s.states.length||s.index>=s.states.length-1}>Next →</button></div></div></div></div>;
}
