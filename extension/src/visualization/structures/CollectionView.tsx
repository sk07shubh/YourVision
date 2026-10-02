import type { ReactElement } from 'react';
import type { VisualEvent } from '../engine/visualEvents';
import { eventTargets } from '../engine/operationSemantics';

export type CollectionViewKind='stack'|'queue'|'deque';
export interface CollectionViewProps { kind:CollectionViewKind; values:unknown[]; changedIndices?:Set<number>; structureId?:string; visualEvents?:VisualEvent[]; }

export function CollectionView({kind,values,changedIndices=new Set(),structureId,visualEvents=[]}:CollectionViewProps){
  const classes=(index:number)=>['yv-structure-cell',changedIndices.has(index)?'yv-structure-changed':'',structureId?eventTargets(visualEvents,structureId,index).map(op=>'yv-cell-op-'+op).join(' '):''].filter(Boolean).join(' ');
  if(kind==='stack') return <div className="yv-structure-stack">{[...values].reverse().map((value,index)=>{const sourceIndex=values.length-1-index;return <div className={classes(sourceIndex)} key={sourceIndex}><span>{String(value)}</span>{index===0&&<small>TOP</small>}</div>;})}</div>;
  const cells:ReactElement[]=[]; values.forEach((value,index)=>cells.push(<div className={classes(index)} key={index}>{String(value)}</div>));
  return <div className="yv-structure-linear"><small>FRONT</small>{cells}<small>REAR</small></div>;
}