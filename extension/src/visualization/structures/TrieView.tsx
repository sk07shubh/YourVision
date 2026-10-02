export interface TrieNodeLike { id:string; value:string; terminal?:boolean; children:TrieNodeLike[]; active?:boolean; }

function TrieBranch({node}:{node:TrieNodeLike}){
  return <div className="yv-trie-branch">
    <div key={`${node.id}-${node.active?'active':''}`} className={`yv-trie-node ${node.active?'yv-trie-active':''}`}>{node.value}{node.terminal&&<span className="yv-trie-terminal">●</span>}</div>
    {node.children.length>0&&<div className="yv-trie-children">{node.children.map(child=><TrieBranch key={child.id} node={child}/>)}</div>}
  </div>;
}

export function TrieView({root}:{root:TrieNodeLike}){
  return <div className="yv-trie"><TrieBranch node={root}/></div>;
}
