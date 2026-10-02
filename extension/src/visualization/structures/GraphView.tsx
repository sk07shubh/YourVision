import type { ReactElement } from 'react';

export interface GraphNode { id:string; label:string; active?:boolean; visited?:boolean; frontier?:boolean; }
export interface GraphEdge { from:string; to:string; }
export interface GraphViewProps { nodes:GraphNode[]; edges:GraphEdge[]; directed?:boolean; }

export function GraphView({nodes,edges,directed=true}:GraphViewProps){
  const columns=Math.min(5,Math.max(1,nodes.length));
  const width=Math.max(420,columns*90+100);
  const height=Math.max(220,Math.ceil(nodes.length/5)*90+80);
  const center=(i:number)=>({x:50+(i%5)*90,y:50+Math.floor(i/5)*90});
  const positions=new Map(nodes.map((node,i)=>[node.id,center(i)]));
  const lines:ReactElement[]=[];
  for(const edge of edges){
    const a=positions.get(edge.from),b=positions.get(edge.to);
    if(!a||!b)continue;
    const from=nodes.find(node=>node.id===edge.from),to=nodes.find(node=>node.id===edge.to);
    const active=Boolean(from?.active||to?.active);
    const visited=Boolean(from?.visited&&to?.visited);
    const edgeClass=['yv-graph-edge',active?'yv-graph-edge-active':'',visited?'yv-graph-edge-visited':''].filter(Boolean).join(' ');
    lines.push(<line key={edge.from+'->'+edge.to} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={edgeClass} markerEnd={directed?'url(#yv-graph-arrow)':undefined}/>);
  }
  return <div className="yv-graph-view">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMin meet">
      <defs><marker id="yv-graph-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z"/></marker></defs>
      {lines}
      {nodes.map(node=>{
        const p=positions.get(node.id)!;
        const cls=['yv-graph-node',node.active?'yv-graph-active':'',node.visited?'yv-graph-visited':'',node.frontier?'yv-graph-frontier':''].filter(Boolean).join(' ');
        return <g key={`${node.id}-${node.active?'a':''}-${node.visited?'v':''}-${node.frontier?'f':''}`} className={cls}><circle cx={p.x} cy={p.y} r="18"/><text x={p.x} y={p.y+4} textAnchor="middle">{node.label}</text></g>;
      })}
    </svg>
  </div>;
}
