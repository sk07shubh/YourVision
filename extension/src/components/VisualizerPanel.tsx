import { useEffect, useMemo, useState } from 'react';
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

function CollectionView({
  value,
  state,
  source
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
}) {
  const type =
    typeof value.$type === 'string'
      ? value.$type.split('.').pop() ?? 'Collection'
      : 'Collection';

  const kind =
    typeof value.$kind === 'string'
      ? value.$kind
      : 'collection';

  return (
    <div className="yv-hashmap">
      <div className="yv-map-meta">
        <span>{type}</span>
        <span>{kind} · {value.size ?? value.values.length} items</span>
      </div>
      <ArrayView value={value.values} state={state} source={source}/>
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

function arrayIndexVariableNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/\[([^\]]+)\]/g)) {
    for (const identifier of match[1].matchAll(/\b[A-Za-z_$][\w$]*\b/g)) names.add(identifier[0]);
  }
  return names;
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

function ArrayView({ value, state, source }: { value: unknown[]; state?: TraceState; source?: string }) {
  if (value.every(Array.isArray)) return <div className="yv-matrix">{value.map((row,r)=><div className="yv-array" key={r}>{(row as unknown[]).map((v,i)=><div className="yv-cell" key={i}><div className="yv-cell-value">{displayValue(v)}</div><div className="yv-cell-index">[{r},{i}]</div></div>)}</div>)}</div>;
  const labels=pointerLabels(state,value.length,arrayIndexVariableNames(source ?? '')); const changed=changedArrayIndices(state);
  return <div className="yv-array">{value.map((v,i)=><div className="yv-cell" key={i}>{labels.has(i)&&<div className="yv-pointer">{labels.get(i)!.join(' · ')}</div>}<div className={`yv-cell-value ${changed.has(i)?'yv-cell-changed':''}`}>{displayValue(v)}</div><div className="yv-cell-index">{i}</div></div>)}</div>;
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
  state
}: {
  value: Obj & {
    $mapId: string;
    entries: Array<{ key: unknown; value: unknown }>;
  };
  state?: TraceState;
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
              <div className="yv-map-key yv-code">
                {displayValue(entry.key)}
              </div>

              <div className="yv-map-value yv-code">
                {change?.kind === 'update' ? (
                  <>
                    <span className="yv-old-value">
                      {displayValue(change.before)}
                    </span>
                    <span className="yv-map-arrow">→</span>
                    <span>{displayValue(entry.value)}</span>
                  </>
                ) : (
                  <span>{displayValue(entry.value)}</span>
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
            <div className="yv-map-key yv-code">
              {displayValue(change.key)}
            </div>
            <div className="yv-map-value yv-code">
              <span className="yv-old-value">
                {displayValue(change.before)}
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

function LinkedListView({ root, objects }: { root: Obj; objects: Record<string,unknown> }) {
  const nodes: Array<{id:string;value:unknown}> = []; const seen=new Set<string>(); let cur: unknown=root;
  for(let guard=0;guard<40;guard++){
    cur=resolveRef(cur,objects); if(!isPlainObject(cur))break;
    const id=String(cur.$objectId ?? `node-${guard}`); if(seen.has(id)){nodes.push({id:'cycle',value:'↻'});break;} seen.add(id);
    nodes.push({id,value:nodeValue(cur)}); const f=objectFields(cur); if(f.next==null)break; cur=f.next;
  }
  return <div className="yv-linked">{nodes.map((n,i)=><div className="yv-linked-piece" key={`${n.id}-${i}`}><div className="yv-node">{displayValue(n.value)}</div>{i<nodes.length-1&&<div className="yv-edge">→</div>}</div>)}</div>;
}

function TreeNodeView({ value, objects, depth=0 }: { value: unknown; objects: Record<string,unknown>; depth?: number }) {
  const resolved=resolveRef(value,objects); if(!isPlainObject(resolved) || depth>6)return null;
  const f=objectFields(resolved); return <div className="yv-tree-node"><div className="yv-node">{displayValue(nodeValue(resolved))}</div>{(f.left!=null||f.right!=null)&&<div className="yv-tree-children"><div>{f.left!=null?<TreeNodeView value={f.left} objects={objects} depth={depth+1}/>:<span className="yv-null">null</span>}</div><div>{f.right!=null?<TreeNodeView value={f.right} objects={objects} depth={depth+1}/>:<span className="yv-null">null</span>}</div></div>}</div>;
}

function DataValue({ value, state, source }: { value: unknown; state?: TraceState; source: string }) {
  if (isMapSnapshot(value)) {
    return <MapView value={value} state={state}/>;
  }

  if (isCollectionSnapshot(value)) {
    return <CollectionView value={value} state={state} source={source}/>;
  }

  if (isArraySnapshot(value)) {
    return (
      <>
        <ArrayView value={value.values} state={state} source={source}/>
        {value.truncated === true && (
          <div className="yv-truncated">
            Showing first {value.values.length} of {String(value.length ?? '?')} items.
          </div>
        )}
      </>
    );
  }

  if (Array.isArray(value)) return <ArrayView value={value} state={state} source={source}/>;
  if (isPlainObject(value)) {
    if (looksTreeNode(value)) return <div className="yv-tree"><TreeNodeView value={value} objects={state?.objects??{}}/></div>;
    if (looksListNode(value)) return <LinkedListView root={value} objects={state?.objects??{}}/>;
    const fields = objectFields(value);
    return <div className="yv-map">{Object.entries(fields).map(([k,v])=><div className="yv-map-row" key={k}><div className="yv-code">{k}</div><div className="yv-code">{displayValue(v)}</div></div>)}</div>;
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
  const arrays = Object.entries(state?.arrays ?? {});
  const structures = Object.entries(state?.dataStructures ?? {});
  const namedObjectIds = new Set<string>();

  for (const value of Object.values(state?.variables ?? {})) {
    if (isStructuralObject(value) && typeof value.$objectId === 'string') {
      namedObjectIds.add(value.$objectId);
    }
  }

  const objectItems = Object.entries(state?.objects ?? {})
    .filter(([id]) => namedObjectIds.has(id));

  const items = [
    ...arrays,
    ...structures,
    ...objectItems
  ];

  if (!items.length) {
    return <div className="yv-empty">Structures appear here as your code creates or mutates them.</div>;
  }

  return (
    <div className="yv-ds-list">
      {items.map(([name, value]) => (
        <div className="yv-ds" key={name}>
          <div className="yv-ds-title">{name}</div>
          <DataValue value={value} state={state} source={source}/>
        </div>
      ))}
    </div>
  );
}

export function VisualizerPanel(){
  const s=useSession(); const current=s.states[s.index]; const prev=s.index>0?s.states[s.index-1]:undefined;
  const sourceLines=useMemo(()=>s.source.split(/\r?\n/),[s.source]);
  const line=current?.line; const statement=line?sourceLines[line-1]?.trim():'';
  useEffect(()=>{highlightEditorLine(line);return()=>clearEditorExecutionMarker();},[line]);
  useEffect(()=>{ if(!s.playing)return; const id=setInterval(()=>sessionStore.next(),650); return()=>clearInterval(id); },[s.playing,s.index,s.states.length]);
  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if(!sessionStore.get().open)return; const target=e.target as HTMLElement|null; if(target?.matches('input,textarea,[contenteditable=true]'))return; if(e.key==='ArrowRight'||e.key==='ArrowLeft'||e.code==='Space'||e.key.toLowerCase()==='r'){e.preventDefault();e.stopPropagation(); if(e.key==='ArrowRight')sessionStore.next(); else if(e.key==='ArrowLeft')sessionStore.prev(); else if(e.code==='Space')sessionStore.togglePlay(); else sessionStore.restart(); } }; window.addEventListener('keydown',onKey,true);return()=>window.removeEventListener('keydown',onKey,true)},[]);
  const output=s.response?.result; const tc=s.testcase; const finished=current?.lastEvent?.type==='PROGRAM_END' || (s.states.length>0&&s.index===s.states.length-1);
  return <div className="yv-root"><div className="yv-scroll">
    {tc&&<div className="yv-top"><div className="yv-title-row"><div className="yv-case">{tc.label}</div>{tc.source==='custom'&&<span className="yv-case-kind">Custom</span>}{tc.source==='failed'&&<span className="yv-case-kind">Failed testcase</span>}</div><div className="yv-inputs">{Object.keys(tc.inputs).length?Object.entries(tc.inputs).map(([k,v])=><div className="yv-input" key={k}><div className="yv-key">{k}</div><div className="yv-code">{v}</div></div>):<div className="yv-code">{tc.raw}</div>}</div><div className="yv-output-row"><div className={`yv-output yv-actual ${finished&&s.response?.success?'good':''}`}><div className="yv-label">Output</div><div className="yv-code">{finished&&output!==undefined?displayValue(output):'—'}</div></div></div></div>}
    {s.loading&&<div className="yv-loading">Tracing your code…</div>}{s.error&&<div className="yv-error">{s.error}</div>}
    {!s.loading&&<><Section title="Variables"><Variables state={current} previous={prev}/></Section><Section title="Call Stack">{current?.callStack?.length?<div className="yv-stack">{current.callStack.map((f:string,i:number)=><div className="yv-frame" key={`${f}-${i}`}>{f}</div>)}</div>:<div className="yv-empty">No active method calls.</div>}</Section><Section title="Data Structures"><DataStructures state={current} source={s.source}/></Section></>}
  </div><div className="yv-current"><div className="yv-current-head"><span>{eventLabel(current)}</span><span className="yv-line">{line?`Line ${line}`:'—'}</span></div><div className="yv-statement">{statement||'Select a testcase and press Visualize.'}</div><div className="yv-controls"><div className="yv-buttons"><button className="yv-btn" onClick={()=>sessionStore.restart()} disabled={!s.states.length}>↺ Restart</button><button className="yv-btn" onClick={()=>sessionStore.prev()} disabled={s.index<=0}>← Prev</button><button className="yv-btn primary" onClick={()=>sessionStore.togglePlay()} disabled={s.states.length<2}>{s.playing?'■ Stop':'▶ Play'}</button><button className="yv-btn" onClick={()=>sessionStore.next()} disabled={!s.states.length||s.index>=s.states.length-1}>Next →</button></div></div></div></div>;
}
