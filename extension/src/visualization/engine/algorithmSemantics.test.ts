import { describe, expect, it } from 'vitest';
import { detectAlgorithm } from './algorithmSemantics';
import type { TraceState } from '../../types/trace';

const state=(variables:Record<string,unknown>={}):TraceState=>({
  sequence:1,depth:0,variables,arrays:{},dataStructures:{},objects:{},callStack:[]
 it('detects shortest path before generic heap',()=>{const insight=detectAlgorithm(undefined,state({}),'PriorityQueue<Node> pq=new PriorityQueue<>();while(!pq.isEmpty()){Node u=pq.poll();for(Edge e:u.neighbors){if(dist[e.v]>dist[u]+e.w)dist[e.v]=dist[u]+e.w;}}');expect(insight.family).toBe('shortest-path');});
 it('detects tree traversal from node structure',()=>{const insight=detectAlgorithm(undefined,state({}),'void dfs(TreeNode root){if(root==null)return;dfs(root.left);dfs(root.right);}');expect(insight.family).toBe('tree-traversal');});
});

describe('algorithm semantics',()=>{
  it('detects binary search from bounds and midpoint',()=>{
    const insight=detectAlgorithm(undefined,state({lo:0,hi:9,mid:4}),'while(lo<=hi){ int mid=(lo+hi)/2; if(nums[mid]<target) lo=mid+1; else hi=mid-1; }');
    expect(insight.family).toBe('binary-search'); expect(insight.confidence).toBe('high');
  });
  it('detects sliding window from two bounds and constraint shrink',()=>{
    const insight=detectAlgorithm(undefined,state({left:2,right:5,sum:17}),'while(sum>k){ sum-=nums[left]; left++; } right++;');
    expect(insight.family).toBe('sliding-window');
  });
  it('detects two pointer independently of problem name',()=>{
    const insight=detectAlgorithm(undefined,state({left:0,right:8}),'while(left<right){ if(nums[left]+nums[right]<target) left++; else right--; }');
    expect(insight.family).toBe('two-pointer');
  });
  it('detects DP from table recurrence',()=>{
    const insight=detectAlgorithm(undefined,state({dp:[]}),'dp[i]=Math.max(dp[i-1],dp[i-2]+nums[i]);');
    expect(insight.family).toBe('dynamic-programming');
  });
  it('detects BFS from queue plus neighbors',()=>{
    const insight=detectAlgorithm(undefined,state({}),'Queue<Node> q=new ArrayDeque<>(); while(!q.isEmpty()){ Node cur=q.poll(); for(Node next:cur.neighbors){ q.offer(next); } }');
    expect(insight.family).toBe('queue-bfs');
  });
  it('detects sorting from sort/swap signals',()=>{
    const insight=detectAlgorithm(undefined,state({}),'Arrays.sort(nums);');
    expect(insight.family).toBe('sorting'); expect(insight.confidence).toBe('high');
  });
  it('falls back safely to linear scan',()=>{
    const insight=detectAlgorithm(undefined,state({i:3}),'for(int i=0;i<n;i++){ if(nums[i]==target) return i; }');
    expect(insight.family).toBe('array-scan');
  });
});
