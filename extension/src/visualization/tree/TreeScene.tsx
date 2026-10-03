import type{TreeScene as Model,TreeSemanticEvent,TreeNode}from"./types";
import"./tree-scene.css";

type Position={x:number;y:number};

function layoutTree(tree:Model){
  const nodes=new Map(tree.nodes.map(node=>[node.id,node]));
  const positions=new Map<string,Position>();
  const visited=new Set<string>();
  let order=0;

  const visit=(id:string|undefined,depth:number)=>{
    if(!id||visited.has(id))return;
    const node=nodes.get(id);
    if(!node)return;
    visited.add(id);
    visit(node.leftId,depth+1);
    positions.set(id,{x:order*110+55,y:depth*82+42});
    order++;
    visit(node.rightId,depth+1);
  };

  visit(tree.rootId,0);
  for(const node of tree.nodes){
    if(!positions.has(node.id)){
      positions.set(node.id,{x:order*110+55,y:node.depth*82+42});
      order++;
    }
  }

  const maxDepth=Math.max(0,...tree.nodes.map(node=>node.depth));
  return{nodes,positions,width:Math.max(360,order*110),height:Math.max(150,(maxDepth+1)*82+30)};
}

export function TreeScene({scene,events=[]}:{scene:Model[];events?:TreeSemanticEvent[]}){
  return <div className="yv-tree-scenes">{scene.map(tree=>{
    const layout=layoutTree(tree);
    return <section className="yv-tree-card" key={tree.id}>
      <header><strong>{tree.name}</strong><span>ROOT → LEAVES · {tree.nodes.length}</span></header>
      <div className="yv-tree-view">
        <svg className="yv-tree-svg" width="100%" height={layout.height} viewBox={"0 0 "+layout.width+" "+layout.height} role="img" aria-label={"Tree "+tree.name}>
          {tree.nodes.map(node=>
            [node.leftId,node.rightId].map((childId,sideIndex)=>{
              if(!childId)return null;
              const from=layout.positions.get(node.id);
              const to=layout.positions.get(childId);
              if(!from||!to)return null;
              return <line className="yv-tree-edge" key={node.id+"-"+childId} x1={from.x} y1={from.y} x2={to.x} y2={to.y}/>;
            })
          )}
          {tree.nodes.map(node=>{
            const position=layout.positions.get(node.id);
            if(!position)return null;
            const stateClass=node.state!=="neutral"?"yv-tree-"+node.state:"";
            return <g className={"yv-tree-svg-node "+stateClass} key={node.id} transform={"translate("+position.x+","+position.y+")"}>
              <circle r="24"/>
              <text className="yv-tree-value" textAnchor="middle" dy="5">{String(node.value)}</text>
              <text className="yv-tree-depth" textAnchor="middle" dy="42">{node.depth===0?"ROOT":"L/R"}</text>
            </g>;
          })}
        </svg>
      </div>
      {events.some(e=>e.treeId===tree.id)&&<div className="yv-tree-event">{events.filter(e=>e.treeId===tree.id).map(e=>e.type.replace("TREE_","")).join(" · ")}</div>}
    </section>;
  })}</div>;
}
