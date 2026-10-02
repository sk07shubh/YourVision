import type { TraceState } from '../types/trace';
import type { VisualEvent, VisualTarget } from '../visualization/engine/visualEvents';
import { displayValue, isPlainObject } from '../utils/value';

type ArraySnapshot={ $arrayId:string; values:unknown[] };
function isArraySnapshot(value:unknown):value is ArraySnapshot{return isPlainObject(value)&&typeof value.$arrayId==='string'&&Array.isArray(value.values);}
function targetsOf(events:VisualEvent[],type:'compare'|'swap'|'update'):VisualTarget[]{const out:VisualTarget[]=[];for(const event of events){if(event.type===type){if(event.type==='compare'||event.type==='swap')out.push(...event.targets);else out.push(event.target);}}return out;}
function uniqueIndexes(targets:VisualTarget[],arrayId:string):number[]{return [...new Set(targets.filter(t=>t.structureId===arrayId&&t.kind==='array'&&t.index!==undefined).map(t=>t.index as number))];}
function numberVars(state:TraceState|undefined):Record<string,number>{const out:Record<string,number>={};for(const [name,value] of Object.entries(state?.variables??{}))if(typeof value==='number'&&Number.isInteger(value))out[name]=value;return out;}
function indexLabels(vars:Record<string,number>,length:number):Map<number,string[]>{const result=new Map<number,string[]>();for(const [name,value] of Object.entries(vars)){if(value<0||value>=length)continue;if(!/^(i|j|k|left|right|lo|hi|low|high|start|end|index|idx|pos|l|r)$/.test(name))continue;const labels=result.get(value)??[];labels.push(name);result.set(value,labels);}return result;}

export function SortingView({state,previous,visualEvents}:{state?:TraceState;previous?:TraceState;visualEvents:VisualEvent[]}){
 const entry=Object.entries(state?.arrays??{}).find(([,value])=>isArraySnapshot(value));
 if(!entry)return null;
 const [name,value]=entry; const previousValue=previous?.arrays?.[name]; const arrayId=value.$arrayId;
 const compareIndexes=uniqueIndexes(targetsOf(visualEvents,'compare'),arrayId);
 const swapIndexes=uniqueIndexes(targetsOf(visualEvents,'swap'),arrayId);
 const updateIndexes=uniqueIndexes(targetsOf(visualEvents,'update'),arrayId);
 const vars=numberVars(state); const labels=indexLabels(vars,value.values.length); const active=new Set([...compareIndexes,...swapIndexes,...updateIndexes]);
 const changed=previousValue&&isArraySnapshot(previousValue)?value.values.map((v,i)=>JSON.stringify(v)!==JSON.stringify(previousValue.values[i])).map((x,i)=>x?i:-1).filter(i=>i>=0):[];
 const operation=swapIndexes.length?'SWAP':compareIndexes.length?'COMPARE':updateIndexes.length?'WRITE':'SCAN'; const sequence=state?.sequence??0;
 return <div className="yv-sorting-view" data-array={name}>
  <div className="yv-sorting-head"><span>SORTING STATE</span><b>{operation}</b></div>
  <div className="yv-sorting-array">{value.values.map((item,index)=>{const isActive=active.has(index);const isChanged=changed.includes(index);return <div key={isActive||isChanged?String(index)+'-'+sequence:index} className={['yv-sort-cell',compareIndexes.includes(index)?'yv-sort-compare':'',swapIndexes.includes(index)?'yv-sort-swap':'',updateIndexes.includes(index)?'yv-sort-write':'',isChanged?'yv-sort-changed':''].filter(Boolean).join(' ')}>{labels.has(index)&&<div className="yv-sort-pointers">{labels.get(index)!.join(' · ')}</div>}<div className="yv-sort-value">{displayValue(item)}</div><div className="yv-sort-index">{index}</div></div>})}</div>
  <div className="yv-sorting-detail">{compareIndexes.length>=2&&<span>compare: {compareIndexes.slice(0,2).map(i=>'['+i+'] '+displayValue(value.values[i])).join(' ↔ ')}</span>}{swapIndexes.length>=2&&<span>swap: {swapIndexes.slice(0,2).map(i=>'['+i+'] '+displayValue(value.values[i])).join(' ↔ ')}</span>}{!compareIndexes.length&&!swapIndexes.length&&updateIndexes.length>0&&<span>write: {updateIndexes.map(i=>'['+i+']').join(', ')}</span>}{!compareIndexes.length&&!swapIndexes.length&&!updateIndexes.length&&<span>Watching array mutations and index movement.</span>}</div>
  <div className="yv-sorting-legend"><span>● active</span><span>◆ changed</span><span>{value.values.length} elements</span></div>
 </div>;
}