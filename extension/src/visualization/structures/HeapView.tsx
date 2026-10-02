export interface HeapViewProps { values:unknown[]; activeIndex?:number; }

export function HeapView({values,activeIndex}:HeapViewProps){
  const levels:unknown[][]=[];
  values.forEach((value,index)=>{
    const level=Math.floor(Math.log2(index+1));
    (levels[level]??=[]).push(value);
  });
  return <div className="yv-heap-visual">
    {levels.map((level,levelIndex)=>{
      const start=(2**levelIndex)-1;
      return <div className="yv-heap-level" key={levelIndex}>
        {level.map((value,index)=>{
          const actual=start+index;
          return <div className={`yv-heap-node ${actual===activeIndex?'yv-heap-active':''}`} key={`${actual}-${actual===activeIndex?'active':''}`}><span>{String(value)}</span><small>[{actual}]</small></div>;
        })}
      </div>;
    })}
  </div>;
}
