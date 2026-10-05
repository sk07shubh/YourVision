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

console.log("PASS: Java graph visualization trace");
