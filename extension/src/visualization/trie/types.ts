export interface TrieNode{ id:string; value:string; depth:number; terminal:boolean; state:"neutral"|"insert"|"visit"|"remove" }
export interface TrieScene{ id:string; name:string; nodes:TrieNode[] }
export type TrieSemanticEvent=
 | {type:"TRIE_CREATE";trieId:string;name:string;sourceLine?:number}
 | {type:"TRIE_INSERT";trieId:string;nodeId:string;value:string;sourceLine?:number}
 | {type:"TRIE_VISIT";trieId:string;nodeId:string;sourceLine?:number};