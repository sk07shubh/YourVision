import type { ReactElement } from 'react';

export type CollectionViewKind='stack'|'queue'|'deque';

export interface CollectionViewProps {
  kind:CollectionViewKind;
  values:unknown[];
  changedIndices?:Set<number>;
}

export function CollectionView({kind,values,changedIndices=new Set()}:CollectionViewProps){
  if(kind==='stack'){
    return <div className="yv-structure-stack">{[...values].reverse().map((value,index)=>{
      const sourceIndex=values.length-1-index;
      return <div className={`yv-structure-cell ${changedIndices.has(sourceIndex)?'yv-structure-changed':''}`} key={sourceIndex}><span>{String(value)}</span>{index===0&&<small>TOP</small>}</div>;
    })}</div>;
  }
  const cells:ReactElement[]=[];
  values.forEach((value,index)=>{
    cells.push(<div className={`yv-structure-cell ${changedIndices.has(index)?'yv-structure-changed':''}`} key={index}>{String(value)}</div>);
  });
  return <div className="yv-structure-linear"><small>FRONT</small>{cells}<small>REAR</small></div>;
}
