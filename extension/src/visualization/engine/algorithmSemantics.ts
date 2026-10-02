import type { TraceState } from '../../types/trace';
import type { VisualEvent } from './visualEvents';

export type AlgorithmFamily =
  | 'sorting'
  | 'binary-search'
  | 'two-pointer'
  | 'sliding-window'
  | 'prefix-sum'
  | 'monotonic-stack'
  | 'stack'
  | 'queue-bfs'
  | 'dfs'
  | 'backtracking'
  | 'dynamic-programming'
  | 'greedy'
  | 'heap'
  | 'graph-traversal'
  | 'shortest-path'
  | 'linked-list'
  | 'tree-traversal'
  | 'trie'
  | 'hashing'
  | 'array-scan'
  | 'recursion'
  | 'unknown';

export interface AlgorithmInsight {
  family: AlgorithmFamily;
  label: string;
  phase: string;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

const lines=(source:string)=>source.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
const has=(source:string,re:RegExp)=>re.test(source);
const count=(source:string,re:RegExp)=>[...source.matchAll(re)].length;

function loopDepth(source:string): number {
  return count(source,/\b(?:for|while)\s*\(/g);
}

function detectFamily(source:string,state?:TraceState,events:VisualEvent[]=[]): AlgorithmInsight {
  const s=source;
  const vars=Object.keys(state?.variables??{}).join(' ');
  const ds=Object.values(state?.dataStructures??{}).map(v=>JSON.stringify(v)).join(' ');
  const names=(vars+' '+ds).toLowerCase();
  const signals:string[]=[];

  if (has(s,/\b(backtrack|backtracking|choose|unchoose)\b/i) || (has(s,/\breturn\s*;/) && has(s,/for\s*\(/) && has(s,/recursive/i))) {
    return {family:'backtracking',label:'BACKTRACKING',phase:'CHOOSE → EXPLORE → UNCHOOSE',confidence:'medium',signals:['recursive search with branching']};
  }
  if (has(s,/memo|dp\b|cache|\btable\b/i) && has(s,/\b(?:min|max|Math\.min|Math\.max)\b/)) {
    return {family:'dynamic-programming',label:'DYNAMIC PROGRAMMING',phase:'STATE → TRANSITION → UPDATE',confidence:'high',signals:['memo/table state','recurrence-style min/max transition']};
  }
  if (has(s,/dist\s*\[|distance|shortest|Dijkstra/i) && has(s,/neighbors|adjacent|edge|graph|PriorityQueue/i)) {
    return {family:'shortest-path',label:'SHORTEST PATH',phase:'RELAX → UPDATE DISTANCE',confidence:'high',signals:['distance state','graph edges','relaxation candidate']};
  }
  if (has(s,/PriorityQueue|heap/i) || /priorityqueue|heap/.test(names)) {
    return {family:'heap',label:'HEAP / PRIORITY QUEUE',phase:'PUSH → TOP → POP',confidence:'high',signals:['heap/priority queue detected']};
  }
  if (has(s,/Deque|ArrayDeque|Stack|push\(|pop\(/i) && has(s,/while|for/)) {
    if (has(s,/monotonic|removeFirst|removeLast|peekFirst|peekLast/i) || has(s,/nums\[[^\]]+\]\s*[<>]=?\s*nums\[/)) {
      return {family:'monotonic-stack',label:'MONOTONIC STACK / DEQUE',phase:'COMPARE → POP → PUSH',confidence:'medium',signals:['stack/deque mutation','ordering comparison']};
    }
    return {family:'stack',label:'STACK',phase:'PUSH → PEEK → POP',confidence:'medium',signals:['stack-like mutation']};
  }
  if (has(s,/Queue|ArrayDeque|offer\(|poll\(|add\(/i) && has(s,/while|for/)) {
    if (has(s,/visited|neighbors|adjacent|adjacency|graph|node/i)) {
      return {family:'queue-bfs',label:'BFS',phase:'ENQUEUE → VISIT → ENQUEUE NEIGHBORS',confidence:'high',signals:['queue traversal','graph/node neighbors']};
    }
    return {family:'queue-bfs',label:'QUEUE PROCESSING',phase:'ENQUEUE → PROCESS → DEQUEUE',confidence:'medium',signals:['queue mutation']};
  }
  if (has(s,/neighbors|adjacent|adjacency|visited|dfs|bfs/i) && has(s,/\b(?:dfs|visit|traverse)\b/i)) {
    return {family:'graph-traversal',label:'GRAPH TRAVERSAL',phase:'VISIT → TRAVERSE EDGE',confidence:'medium',signals:['visited graph traversal']};
  }
  if (has(s,/\bdfs\b/i) || (has(s,/recursive/i) && has(s,/left|right|children|child/))) {
    return {family:'dfs',label:'DFS',phase:'VISIT → RECURSE → RETURN',confidence:'medium',signals:['recursive traversal']};
  }
  if (has(s,/left\s*=|right\s*=|head\s*=|next\b/i) && has(s,/next|ListNode|Node/i)) {
    return {family:'linked-list',label:'LINKED LIST',phase:'FOLLOW POINTER → UPDATE LINK',confidence:'medium',signals:['node pointer/link manipulation']};
  }
  if (has(s,/TreeNode|root|children|left|right/) && has(s,/queue|recursive|dfs|bfs|traverse|visit/i)) {
    return {family:'tree-traversal',label:'TREE TRAVERSAL',phase:'VISIT NODE → TRAVERSE CHILD',confidence:'medium',signals:['tree child traversal']};
  }
  if (has(s,/Trie|children|isEnd|isWord/i) && has(s,/char|prefix/i)) {
    return {family:'trie',label:'TRIE TRAVERSAL',phase:'MATCH CHARACTER → FOLLOW CHILD',confidence:'high',signals:['trie child/character state']};
  }
  if (has(s,/Arrays\.sort|\.sort\(/) || (events.some(e=>e.type==='swap') && has(s,/nums\[|arr\[/))) {
    return {family:'sorting',label:'SORTING',phase:'COMPARE → SWAP / WRITE',confidence:has(s,/sort/) ? 'high':'medium',signals:['ordering/swap operations']};
  }
  if (has(s,/binary|mid\b|lo\b|hi\b|low\b|high\b/i) && has(s,/left|right|lo|hi|low|high/i) && has(s,/mid|middle/i)) {
    return {family:'binary-search',label:'BINARY SEARCH',phase:'COMPARE MID → DISCARD HALF',confidence:'high',signals:['midpoint','search bounds']};
  }
  if (has(s,/window|left|right|start|end/) && has(s,/right\+\+|left\+\+|right\s*\+=|left\s*\+=/) && loopDepth(s)>=1) {
    if (has(s,/while\s*\([^)]*(?:sum|count|freq|distinct|map|set)/i)) {
      return {family:'sliding-window',label:'SLIDING WINDOW',phase:'EXPAND → CHECK → SHRINK',confidence:'high',signals:['two moving bounds','window constraint']};
    }
    return {family:'two-pointer',label:'TWO POINTER',phase:'COMPARE → MOVE POINTER',confidence:'medium',signals:['two moving bounds']};
  }
  if (has(s,/prefix|runningSum|prefixSum|preSum|sum\s*\[|sum\s*\+=/i) && has(s,/sum|target|k/i)) {
    return {family:'prefix-sum',label:'PREFIX SUM',phase:'ACCUMULATE → QUERY RANGE',confidence:'medium',signals:['running cumulative sum']};
  }
  if (has(s,/HashMap|HashSet|HashMap|Map<|Set<|containsKey|contains\(/i)) {
    return {family:'hashing',label:'HASHING',phase:'LOOKUP → UPDATE FREQUENCY',confidence:'medium',signals:['hash lookup/set membership']};
  }
  if (has(s,/greedy|locally|earliest|minimum|maximum/i) && has(s,/sort|priority|best|current/i)) {
    return {family:'greedy',label:'GREEDY',phase:'CHOOSE LOCAL BEST → COMMIT',confidence:'low',signals:['local-choice language']};
  }
  if (has(s,/\b(?:return|solve|helper)\b/) && has(s,/\b[a-zA-Z_$][\w$]*\s*\(/) && has(s,/return\s+[a-zA-Z_$][\w$]*\s*\(/)) {
    return {family:'recursion',label:'RECURSION',phase:'CALL → EXPLORE → RETURN',confidence:'low',signals:['self/helper recursive call shape']};
  }
  if (loopDepth(s)>0) {
    return {family:'array-scan',label:'LINEAR SCAN',phase:'READ → CHECK → ADVANCE',confidence:'low',signals:['iterative scan']};
  }
  return {family:'unknown',label:'ALGORITHM',phase:'EXECUTE → OBSERVE',confidence:'low',signals:[]};
}

export function detectAlgorithm(previous:TraceState|undefined,current:TraceState|undefined,source:string,events:VisualEvent[]=[]):AlgorithmInsight {
  const insight=detectFamily(source,current,events);
  const line=source.split(/\r?\n/)[(current?.line??1)-1]?.trim()??'';
  if (insight.family==='two-pointer' && /sum|target|difference/i.test(line)) {
    return {...insight,phase:'COMPARE TARGET → MOVE LEFT/RIGHT'};
  }
  if (insight.family==='binary-search' && /if|while/.test(line)) {
    return {...insight,phase:'COMPARE MID → KEEP HALF'};
  }
  if (insight.family==='sorting' && events.some(e=>e.type==='swap')) {
    return {...insight,phase:'COMPARE → SWAP'};
  }
  if (insight.family==='sliding-window' && /while/.test(line)) {
    return {...insight,phase:'WINDOW INVALID → SHRINK'};
  }
  return insight;
}

export function algorithmFamilyLabel(family:AlgorithmFamily):string {
  return family === 'unknown' ? 'ALGORITHM' : family.replace(/-/g,' ').toUpperCase();
}
