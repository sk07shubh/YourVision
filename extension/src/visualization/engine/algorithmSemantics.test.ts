import {describe,expect,it} from 'vitest';
import {detectAlgorithm} from './algorithmSemantics';
import type {TraceState} from '../../types/trace';

const state=(variables:Record<string,unknown>={}):TraceState=>({sequence:1,depth:0,variables,arrays:{},dataStructures:{},objects:{},callStack:[]});

describe('algorithm semantics',()=>{
 it('detects binary search',()=>{const x=detectAlgorithm(undefined,state({lo:0,hi:9,mid:4}),'while(lo<=hi){int mid=(lo+hi)/2;if(nums[mid]<target)lo=mid+1;else hi=mid-1;}');expect(x.family).toBe('binary-search');expect(x.confidence).toBe('high');});
 it('detects sliding window',()=>expect(detectAlgorithm(undefined,state({left:2,right:5,sum:17}),'while(sum>k){sum-=nums[left];left++;}right++;').family).toBe('sliding-window'));
 it('detects two pointer',()=>expect(detectAlgorithm(undefined,state({left:0,right:8}),'while(left<right){if(nums[left]+nums[right]<target)left++;else right--;}').family).toBe('two-pointer'));
 it('detects DP',()=>expect(detectAlgorithm(undefined,state({dp:[]}),'dp[i]=Math.max(dp[i-1],dp[i-2]+nums[i]);').family).toBe('dynamic-programming'));
 it('detects BFS',()=>expect(detectAlgorithm(undefined,state({}),'Queue<Node> q=new ArrayDeque<>();while(!q.isEmpty()){Node cur=q.poll();for(Node next:cur.neighbors){q.offer(next);}}').family).toBe('queue-bfs'));
 it('detects sorting',()=>{const x=detectAlgorithm(undefined,state({}),'Arrays.sort(nums);');expect(x.family).toBe('sorting');expect(x.confidence).toBe('high');});
 it('detects shortest path before generic heap',()=>expect(detectAlgorithm(undefined,state({}),'PriorityQueue<Node> pq=new PriorityQueue<>();while(!pq.isEmpty()){Node u=pq.poll();for(Edge e:u.neighbors){if(dist[e.v]>dist[u]+e.w)dist[e.v]=dist[u]+e.w;}}').family).toBe('shortest-path'));
 it('detects tree traversal',()=>expect(detectAlgorithm(undefined,state({}),'void dfs(TreeNode root){if(root==null)return;dfs(root.left);dfs(root.right);}').family).toBe('tree-traversal'));
 it('falls back safely to linear scan',()=>expect(detectAlgorithm(undefined,state({i:3}),'for(int i=0;i<n;i++){if(nums[i]==target)return i;}').family).toBe('array-scan'));
});
