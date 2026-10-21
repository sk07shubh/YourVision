import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const cloneGraphSource = `
/*
class Node {
    public int val;
    public List<Node> neighbors;
}
*/
class Solution {
    private Map<Node, Node> clones = new HashMap<>();

    public Node cloneGraph(Node node) {
        if (node == null) return null;
        if (clones.containsKey(node)) return clones.get(node);

        Node copy = new Node(node.val);
        clones.put(node, copy);

        for (Node neighbor : node.neighbors) {
            copy.neighbors.add(cloneGraph(neighbor));
        }
        return copy;
    }
}
`;

const cloned = await runJava(cloneGraphSource, {
    method: "cloneGraph",
    arguments: ["[[2,4],[1,3],[2,4],[1,3]]"]
});

assert(
    cloned.success && cloned.kind === "OK",
    "Clone Graph should compile and execute using the injected LeetCode Node type. " +
        (cloned.message ?? cloned.stderr)
);
assert(
    cloned.trace?.events.some(event => event.type === "METHOD_ENTER") === true,
    "Clone Graph should emit method trace events"
);
assert(
    cloned.states?.some(state =>
        Object.values(state.objects ?? {}).some(value =>
            (value as Record<string, unknown> | undefined)?.$type === "Node"
        )
    ) === true,
    "Graph Node objects should be present in captured runtime state"
);

const customNodeSource = `
class Node {
    int val;
    List<Node> neighbors = new ArrayList<>();
    Node() {}
    Node(int val) { this.val = val; }
}
class Solution {
    public int firstNeighbor(Node node) {
        return node.neighbors.get(0).val;
    }
}
`;

const custom = await runJava(customNodeSource, {
    method: "firstNeighbor",
    arguments: ["[[2],[1]]"]
});

assert(
    custom.success && custom.result === "2",
    "A user-defined Node class should not conflict with the injected compatibility type. " +
        (custom.message ?? custom.stderr)
);

console.log("PASS: LeetCode graph Node compatibility and adjacency-list input");
