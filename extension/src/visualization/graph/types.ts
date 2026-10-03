export interface GraphNode{id:string;label:unknown;x:number;y:number;state:"neutral"|"active"|"visit"|"insert"|"remove"}
export interface GraphEdge{id:string;fromId:string;toId:string;directed:boolean;state:"neutral"|"active"|"connect"|"disconnect"}
export interface GraphScene{id:string;name:string;nodes:GraphNode[];edges:GraphEdge[]}
export type GraphSemanticEvent={type:"GRAPH_CREATE";graphId:string;name:string;sourceLine?:number}|{type:"GRAPH_CONNECT";graphId:string;edgeId:string;fromId:string;toId:string;directed:boolean;sourceLine?:number}|{type:"GRAPH_DISCONNECT";graphId:string;edgeId:string;fromId:string;toId:string;directed:boolean;sourceLine?:number}|{type:"GRAPH_VISIT";graphId:string;nodeId:string;sourceLine?:number};
