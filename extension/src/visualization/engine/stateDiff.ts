import type { TraceState } from '../../types/trace';
import type { VisualEvent, VisualTarget } from './visualEvents';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isArraySnapshot(value: unknown): value is UnknownRecord & { $arrayId: string; values: unknown[] } {
  return isRecord(value) && typeof value.$arrayId === 'string' && Array.isArray(value.values);
}
function isCollectionSnapshot(value: unknown): value is UnknownRecord & { $collectionId: string; values: unknown[]; $kind?: string } { return isRecord(value) && typeof value.$collectionId === 'string' && Array.isArray(value.values); }
function isMapSnapshot(value: unknown): value is UnknownRecord & { $mapId: string; entries: Array<{key:unknown;value:unknown}> } { return isRecord(value) && typeof value.$mapId === 'string' && Array.isArray(value.entries); }
function sameSnapshot(left: unknown,right: unknown): boolean { return JSON.stringify(left)===JSON.stringify(right); }
function structureId(name: string, value: unknown): string {
  if (isRecord(value)) {
    if (typeof value.$arrayId === 'string') return value.$arrayId;
    if (typeof value.$mapId === 'string') return value.$mapId;
    if (typeof value.$collectionId === 'string') return value.$collectionId;
    if (typeof value.$objectId === 'string') return value.$objectId;
  }
  return name;
}
function diffArray(name:string,before:unknown,after:unknown):VisualEvent[]{
  if(!isArraySnapshot(before)||!isArraySnapshot(after)||before.$arrayId!==after.$arrayId)return [];
  const id=structureId(name,after);const events:VisualEvent[]=[];
  const walk=(a:unknown[],b:unknown[],path:number[])=>{
    const limit=Math.max(a.length,b.length);const changed:Array<{index:number;from:unknown;to:unknown}>=[];
    for(let index=0;index<limit;index++){const oldValue=a[index],newValue=b[index];if(index>=a.length){events.push({type:'insert',target:{structureId:id,kind:path.length?'matrix':'array',index,row:path[0],column:path[1]},value:newValue});continue;}if(index>=b.length){events.push({type:'remove',target:{structureId:id,kind:path.length?'matrix':'array',index,row:path[0],column:path[1]},value:oldValue});continue;}if(Array.isArray(oldValue)&&Array.isArray(newValue)){walk(oldValue,newValue,[...path,index]);continue;}if(!sameSnapshot(oldValue,newValue))changed.push({index,from:oldValue,to:newValue});}
    if(changed.length===2&&sameSnapshot(changed[0].from,changed[1].to)&&sameSnapshot(changed[1].from,changed[0].to))events.push({type:'swap',targets:[{structureId:id,kind:path.length?'matrix':'array',index:changed[0].index,row:path[0],column:path[1]},{structureId:id,kind:path.length?'matrix':'array',index:changed[1].index,row:path[0],column:path[1]}]});
    else for(const change of changed)events.push({type:'update',target:{structureId:id,kind:path.length?'matrix':'array',index:change.index,row:path[0],column:path[1]},from:change.from,to:change.to});
  };
  walk(before.values,after.values,[]);return events;
}
function diffCollection(before:unknown,after:unknown):VisualEvent[]{
  if(!isCollectionSnapshot(before)||!isCollectionSnapshot(after)||before.$collectionId!==after.$collectionId)return [];
  const events:VisualEvent[]=[];const limit=Math.max(before.values.length,after.values.length);
  for(let i=0;i<limit;i++){if(i>=before.values.length)events.push({type:'insert',target:{structureId:after.$collectionId,kind:'collection',index:i},value:after.values[i]});else if(i>=after.values.length)events.push({type:'remove',target:{structureId:after.$collectionId,kind:'collection',index:i},value:before.values[i]});else if(!sameSnapshot(before.values[i],after.values[i]))events.push({type:'update',target:{structureId:after.$collectionId,kind:'collection',index:i},from:before.values[i],to:after.values[i]});}
  return events;
}
function diffMap(before:unknown,after:unknown):VisualEvent[]{
  if(!isMapSnapshot(before)||!isMapSnapshot(after)||before.$mapId!==after.$mapId)return [];
  const events:VisualEvent[]=[];const beforeMap=new Map<string,{key:unknown;value:unknown}>();const afterMap=new Map<string,{key:unknown;value:unknown}>();
  for(const e of before.entries)beforeMap.set(JSON.stringify(e.key),e);for(const e of after.entries)afterMap.set(JSON.stringify(e.key),e);
  for(const [key,e] of afterMap){const old=beforeMap.get(key);if(!old)events.push({type:'insert',target:{structureId:after.$mapId,kind:'collection',field:'entry'},value:e});else if(!sameSnapshot(old.value,e.value))events.push({type:'update',target:{structureId:after.$mapId,kind:'collection',field:'entry'},from:old.value,to:e.value});}
  for(const [key,e] of beforeMap)if(!afterMap.has(key))events.push({type:'remove',target:{structureId:after.$mapId,kind:'collection',field:'entry'},value:e.value});return events;
}
function diffObjects(previous:TraceState,current:TraceState):VisualEvent[]{
  const events:VisualEvent[]=[];const ids=new Set([...Object.keys(previous.objects),...Object.keys(current.objects)]);
  for(const id of ids){const a=previous.objects[id],b=current.objects[id];if(!isRecord(a)||!isRecord(b)||a.$objectId!==b.$objectId)continue;const af=isRecord(a.fields)?a.fields:{};const bf=isRecord(b.fields)?b.fields:{};const fields=new Set([...Object.keys(af),...Object.keys(bf)]);for(const field of fields)if(!sameSnapshot(af[field],bf[field]))events.push({type:'update',target:{structureId:id,kind:'object',objectId:id,field},from:af[field],to:bf[field]});}
  return events;
}
/** Converts two immutable execution snapshots into only the semantic visual changes. */
export function diffStates(previous: TraceState | undefined, current: TraceState | undefined): VisualEvent[] {
  if (!previous || !current) return [];
  const events: VisualEvent[] = [];
  const arrayNames = new Set([...Object.keys(previous.arrays), ...Object.keys(current.arrays)]);
  for (const name of arrayNames) events.push(...diffArray(name, previous.arrays[name], current.arrays[name]));
  const structureNames = new Set([...Object.keys(previous.dataStructures), ...Object.keys(current.dataStructures)]);
  for (const name of structureNames) { events.push(...diffCollection(previous.dataStructures[name],current.dataStructures[name])); events.push(...diffMap(previous.dataStructures[name],current.dataStructures[name])); }
  events.push(...diffObjects(previous,current));

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
