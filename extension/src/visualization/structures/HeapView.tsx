import type { VisualEvent } from '../engine/visualEvents';
import { eventTargets } from '../engine/operationSemantics';
export interface HeapViewProps { values:unknown[]; activeIndex?:number; structureId?:string; visualEvents?:VisualEvent[]; }
export function HeapView({values,activeIndex,structureId,visualEvents=[]}:HeapViewProps){
  const levels:unknown[][]=[]; values.forEach((value,index)=>{const level=Math.floor(Math.log2(index+1));(levels[level]??=[]).push(value);});
  return <div className="yv-heap-visual">{levels.map((level,levelIndex)=>{const start=(2**levelIndex)-1;return <div className="yv-heap-level" key={levelIndex}>{level.map((value,index)=>{const actual=start+index;const ops=structureId?eventTargets(visualEvents,structureId,actual):[];const cls=['yv-heap-node',actual===activeIndex?'yv-heap-active':''].concat(ops.map(op=>'yv-cell-op-'+op)).filter(Boolean).join(' ');return <div className={cls} key={actual+'-'+(actual===activeIndex?'active':'')}><span>{String(value)}</span><small>[{actual}]</small></div>;})}</div>;})}</div>;
}