import type { TraceState } from '../types/trace';
import type { VisualEvent } from '../visualization/engine/visualEvents';
import { displayValue, isPlainObject } from '../utils/value';

type ArraySnapshot={ $arrayId:string; values:unknown[] };
function isArraySnapshot(value:unknown):value is ArraySnapshot{return isPlainObject(value)&&typeof value.$arrayId==='string'&&Array.isArray(value.values);}
function numberVar(vars:Record<string,unknown>,names:string[]):number|undefined{for(const name of names)if(typeof vars[name]==='number'&&Number.isInteger(vars[name]))return vars[name] as number;return undefined;}
function operationFor(events:VisualEvent[],arrayId:string,mid:number|undefined):string{for(const event of events){if(event.type==='compare'&&event.targets.some(t=>t.structureId===arrayId&&t.index===mid))return 'COMPARE MID';if(event.type==='highlight'&&event.target.structureId===arrayId&&event.target.index===mid)return 'READ MID';}return 'SEARCH';}

export function BinarySearchView({state,previous,visualEvents}:{state?:TraceState;previous?:TraceState;visualEvents:VisualEvent[]}){
 const entry=Object.entries(state?.arrays??{}).find(([,value])=>isArraySnapshot(value)); if(!entry)return null;
 const name=entry[0]; const value=entry[1] as ArraySnapshot; const vars=state?.variables??{};
 const lo=numberVar(vars,['lo','low','left','start','l'])??0; const hi=numberVar(vars,['hi','high','right','end','r'])??value.values.length-1; const mid=numberVar(vars,['mid','middle']);
 const target=vars.target??vars.key??vars.x; const operation=operationFor(visualEvents,value.$arrayId,mid); const sequence=state?.sequence??0;
 const previousArray=previous?.arrays?.[name];
 return <div className="yv-binary-view" data-array={name}>
  <div className="yv-binary-head"><span>BINARY SEARCH STATE</span><b>{operation}</b></div>
  <div className="yv-binary-array">{value.values.map((item,index)=>{const eliminated=index<lo||index>hi;const active=index===mid;const changed=isArraySnapshot(previousArray)&&JSON.stringify(previousArray.values[index])!==JSON.stringify(item);return <div key={active||changed?String(index)+'-'+sequence:index} className={['yv-binary-cell',active?'yv-binary-mid':'',eliminated?'yv-binary-eliminated':'',changed?'yv-binary-changed':''].filter(Boolean).join(' ')}><div className="yv-binary-value">{displayValue(item)}</div><div className="yv-binary-index">{index}</div></div>})}</div>
  <div className="yv-binary-bounds"><span><b>LO</b> {lo}</span><span><b>MID</b> {mid===undefined?'—':mid}</span><span><b>HI</b> {hi}</span>{target!==undefined&&<span className="yv-binary-target">target = {displayValue(target)}</span>}</div>
  <div className="yv-binary-detail">{mid!==undefined?<span>mid value = {displayValue(value.values[mid])}</span>:<span>Waiting for midpoint.</span>}<span>{Math.max(0,hi-lo+1)} candidates remain</span></div>
 </div>;
}