import { runJava } from "../src/execution/java/runner.js";

function assert(condition:boolean,message:string):void{
    if(!condition)throw new Error(message);
}

const source=`
import java.util.*;

class Solution {
    static class Node {
        String id;
        String label;
        Node(String id,String label){this.id=id;this.label=label;}
    }

    static class Edge {
        String id;
        String from;
        String to;
        boolean directed;
        Edge(String id,String from,String to,boolean directed){
            this.id=id;this.from=from;this.to=to;this.directed=directed;
        }
    }

    static class Graph {
        String name;
        ArrayList<Node> nodes=new ArrayList<>();
        ArrayList<Edge> edges=new ArrayList<>();
        Graph(String name){this.name=name;}
    }

    static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;
        TreeNode(int val){this.val=val;}
    }

    public int tree(){
        TreeNode root=new TreeNode(10);
        root.left=new TreeNode(5);
        root.right=new TreeNode(15);
        root.left.left=new TreeNode(2);
        return root.val+root.left.val+root.right.val+root.left.left.val;
    }

    public int collections(){
        Stack<Integer> stack=new Stack<>();
        stack.push(1); stack.push(2);
        Queue<Integer> queue=new ArrayDeque<>();
        queue.add(3); queue.add(4);
        Deque<Integer> deque=new ArrayDeque<>();
        deque.addFirst(5); deque.addLast(6);
        LinkedList<Integer> linked=new LinkedList<>();
        linked.add(7); linked.add(8);
        PriorityQueue<Integer> heap=new PriorityQueue<>();
        heap.add(9); heap.add(2); heap.add(5);
        HashMap<String,Integer> map=new HashMap<>();
        map.put("a",10); map.put("b",11);
        HashSet<Integer> set=new HashSet<>();
        set.add(12); set.add(13);
        int[][] matrix={{1,2},{3,4}};
        return stack.size()+queue.size()+deque.size()+linked.size()+heap.size()+map.size()+set.size()+matrix.length;
    }

    public int graph(){
        Graph graph=new Graph("demo");
        graph.nodes.add(new Node("a","A"));
        graph.nodes.add(new Node("b","B"));
        graph.edges.add(new Edge("ab","a","b",true));
        graph.edges.add(new Edge("ba","b","a",false));
        return graph.nodes.size()+graph.edges.size();
    }
}
`;

const result=await runJava(source,{method:"graph"});
assert(result.kind==="OK","graph execution failed");

const state=result.states?.at(-1);
const graph=Object.values(state?.variables??{})
    .find(value=>{
        const record=value as Record<string,unknown>;
        return typeof record.$graphId==="string";
    }) as Record<string,any>|undefined;

assert(graph!==undefined,"graph snapshot missing");
if(!graph)throw new Error("graph snapshot missing");
assert(graph.name==="demo","graph name missing");
assert(Array.isArray(graph.nodes)&&graph.nodes.length===2,"graph nodes incorrect");
assert(Array.isArray(graph.edges)&&graph.edges.length===2,"graph edges incorrect");
assert(graph.nodes[0].id==="a"&&graph.nodes[0].label==="A","graph node normalization incorrect");
assert(graph.edges[0].from==="a"&&graph.edges[0].to==="b","graph edge endpoints incorrect");
assert(graph.edges[0].directed===true,"directed edge flag incorrect");
assert(graph.edges[1].directed===false,"undirected edge flag incorrect");

const treeResult=await runJava(source,{method:"tree"});
assert(treeResult.kind==="OK","tree visualization trace failed");
const treeState=treeResult.states?.at(-1);
const treeRoot=treeState?.variables?.root as Record<string,any>|undefined;
assert(typeof treeRoot?.$objectId==="string","tree root object snapshot missing");
const treeObjects=treeState?.objects??{};
const treeLeftId=treeRoot?.fields?.left?.$ref??treeRoot?.fields?.left?.$objectId;
const treeRightId=treeRoot?.fields?.right?.$ref??treeRoot?.fields?.right?.$objectId;
assert(typeof treeLeftId==="string"&&typeof treeRightId==="string","tree child references missing");
assert((treeObjects[treeLeftId] as Record<string,any>)?.fields?.val===5,"tree left node incorrect");
assert((treeObjects[treeRightId] as Record<string,any>)?.fields?.val===15,"tree right node incorrect");
const treeLeftLeft=(treeObjects[treeLeftId] as Record<string,any>)?.fields?.left?.$ref;
assert(typeof treeLeftLeft==="string"&&(treeObjects[treeLeftLeft] as Record<string,any>)?.fields?.val===2,"tree nested node incorrect");

const structuresResult=await runJava(source,{method:"collections"});
assert(structuresResult.kind==="OK","collection visualization trace failed");
const structuresState=structuresResult.states?.at(-1);
const structures=structuresState?.dataStructures??{};
const stack=structures.stack as Record<string,any>|undefined;
const queue=structures.queue as Record<string,any>|undefined;
const deque=structures.deque as Record<string,any>|undefined;
const linked=structures.linked as Record<string,any>|undefined;
const heap=structures.heap as Record<string,any>|undefined;
const map=structures.map as Record<string,any>|undefined;
const set=structures.set as Record<string,any>|undefined;
assert(stack?.$kind==="stack"&&JSON.stringify(stack.values)==="[1,2]","stack visualization snapshot incorrect");
assert(queue?.$kind==="deque"&&typeof queue.$declaredType==="string"&&queue.$declaredType.includes("Queue"),"queue visualization snapshot incorrect");
assert(deque?.$kind==="deque"&&typeof deque.$declaredType==="string"&&deque.$declaredType.includes("Deque"),"deque visualization snapshot incorrect");
assert(linked?.$kind==="linkedList"&&JSON.stringify(linked.values)==="[7,8]","linked-list visualization snapshot incorrect");
assert(heap?.$kind==="priorityQueue"&&JSON.stringify(heap.values)==="[2,9,5]","heap visualization snapshot incorrect");
assert(map?.$mapId&&Array.isArray(map.entries)&&map.entries.length===2,"map visualization snapshot incorrect");
assert(set?.$kind==="set"&&Array.isArray(set.values)&&set.values.length===2,"set visualization snapshot incorrect");
const matrix=Object.values(structuresState?.arrays??{}).find(value=>{
    const record=value as Record<string,any>;
    return Array.isArray(record.values)&&record.values.every((row:unknown)=>Array.isArray(row));
}) as Record<string,any>|undefined;
assert(matrix!==undefined,"matrix visualization snapshot missing");
assert(JSON.stringify(matrix.values)==="[[1,2],[3,4]]","matrix visualization snapshot incorrect");

console.log("PASS: Java graph visualization trace");
