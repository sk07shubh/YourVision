import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

function traceTypes(result: Awaited<ReturnType<typeof runJava>>): Set<string> {
    return new Set(result.trace?.events.map((event) => event.type) ?? []);
}

function hasCallStack(result: Awaited<ReturnType<typeof runJava>>, ...methods: string[]): boolean {
    return result.states?.some((state) => methods.every((method) => state.callStack.includes(method))) ?? false;
}

const source = `
import java.util.*;

class Solution {
    static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;
        TreeNode() {}
        TreeNode(int val) { this.val = val; }
    }

    static class GraphNode {
        int id;
        List<GraphNode> neighbors = new ArrayList<>();
        GraphNode() {}
        GraphNode(int id) { this.id = id; }
    }

    public int nestedLoops(int[] nums) {
        int count = 0;
        for (int i = 0; i < nums.length; i++) {
            if (nums[i] % 2 == 0) {
                for (int j = i; j < nums.length; j++) {
                    if (nums[j] > nums[i]) count++;
                }
            } else if (nums[i] > 2) {
                count += 2;
            }
        }
        return count;
    }

    public int dfsSum(TreeNode root) {
        if (root == null) return 0;
        return root.val + dfsSum(root.left) + dfsSum(root.right);
    }

    public int bfsSum(TreeNode root) {
        if (root == null) return 0;
        Queue<TreeNode> queue = new ArrayDeque<>();
        queue.offer(root);
        int sum = 0;
        while (!queue.isEmpty()) {
            TreeNode node = queue.poll();
            sum += node.val;
            if (node.left != null) queue.offer(node.left);
            if (node.right != null) queue.offer(node.right);
        }
        return sum;
    }

    public int graphBfsCount() {
        GraphNode a = new GraphNode(1);
        GraphNode b = new GraphNode(2);
        GraphNode c = new GraphNode(3);
        GraphNode d = new GraphNode(4);
        a.neighbors.add(b);
        a.neighbors.add(c);
        b.neighbors.add(d);
        c.neighbors.add(d);
        Queue<GraphNode> queue = new ArrayDeque<>();
        Set<GraphNode> seen = new HashSet<>();
        queue.offer(a);
        seen.add(a);
        int count = 0;
        while (!queue.isEmpty()) {
            GraphNode node = queue.poll();
            count++;
            for (GraphNode next : node.neighbors) {
                if (seen.add(next)) queue.offer(next);
            }
        }
        return count;
    }

    public int gridDfsCount(int[][] grid) {
        int count = 0;
        for (int r = 0; r < grid.length; r++) {
            for (int c = 0; c < grid[0].length; c++) {
                if (grid[r][c] == 1) {
                    count++;
                    sinkIsland(grid, r, c);
                }
            }
        }
        return count;
    }

    private void sinkIsland(int[][] grid, int r, int c) {
        if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || grid[r][c] == 0) return;
        grid[r][c] = 0;
        sinkIsland(grid, r + 1, c);
        sinkIsland(grid, r - 1, c);
        sinkIsland(grid, r, c + 1);
        sinkIsland(grid, r, c - 1);
    }

    public int countPaths(TreeNode root, int target) {
        if (root == null) return 0;
        if (root.left == null && root.right == null) return root.val == target ? 1 : 0;
        return countPaths(root.left, target - root.val) + countPaths(root.right, target - root.val);
    }

    public int subsetsCount(int[] nums) {
        List<Integer> path = new ArrayList<>();
        List<List<Integer>> answer = new ArrayList<>();
        buildSubsets(nums, 0, path, answer);
        return answer.size();
    }

    private void buildSubsets(int[] nums, int index, List<Integer> path, List<List<Integer>> answer) {
        answer.add(new ArrayList<>(path));
        for (int i = index; i < nums.length; i++) {
            path.add(nums[i]);
            buildSubsets(nums, i + 1, path, answer);
            path.remove(path.size() - 1);
        }
    }

    public int permutationCount(int[] nums) {
        boolean[] used = new boolean[nums.length];
        List<Integer> path = new ArrayList<>();
        return buildPermutations(nums, used, path);
    }

    private int buildPermutations(int[] nums, boolean[] used, List<Integer> path) {
        if (path.size() == nums.length) return 1;
        int count = 0;
        for (int i = 0; i < nums.length; i++) {
            if (used[i]) continue;
            used[i] = true;
            path.add(nums[i]);
            count += buildPermutations(nums, used, path);
            path.remove(path.size() - 1);
            used[i] = false;
        }
        return count;
    }

    public int mixedStructureScore(int[] values) {
        List<int[]> rows = new ArrayList<>();
        rows.add(new int[] {values[0], values[1]});
        rows.add(new int[] {values[2], values[3]});
        int total = 0;
        for (int[] row : rows) {
            for (int value : row) total += value;
        }
        return total;
    }
}
`;

const loops = await runJava(source, { method: "nestedLoops", arguments: ["[1,4,2,5]"] });
assert(loops.kind === "OK" && loops.result === "4", "nested loops/branches returned the wrong result");
assert((loops.states?.length ?? 0) > 0, "nested loops produced no states");
assert(loops.states?.some((state) => state.variables.i === 2 && state.variables.j !== undefined) === true, "nested loop indices were not captured");

const dfs = await runJava(source, {
    method: "dfsSum",
    arguments: ['{"val":1,"left":{"val":2,"left":null,"right":null},"right":{"val":3,"left":null,"right":null}}']
});
assert(dfs.kind === "OK" && dfs.result === "6", "DFS tree sum returned the wrong result");
assert(hasCallStack(dfs, "dfsSum", "dfsSum"), "DFS recursion did not preserve nested call-stack frames");
assert((dfs.states?.at(-1)?.callStack.length ?? -1) === 0, "DFS final call stack did not unwind");

const bfs = await runJava(source, {
    method: "bfsSum",
    arguments: ['{"val":1,"left":{"val":2},"right":{"val":3,"left":{"val":4}}}']
});
assert(bfs.kind === "OK" && bfs.result === "10", "BFS tree sum returned the wrong result");
assert(traceTypes(bfs).has("OBJECT_FIELD_WRITE") || (bfs.states?.length ?? 0) > 0, "BFS did not produce usable object/queue state");
assert(bfs.states?.some((state) => state.variables.queue !== undefined) === true, "BFS queue variable was not captured");

const graphBfs = await runJava(source, { method: "graphBfsCount" });
assert(graphBfs.kind === "OK" && graphBfs.result === "4", "graph BFS returned the wrong reachable-node count");
assert(hasCallStack(graphBfs, "graphBfsCount"), "graph BFS did not preserve its active method frame");
assert(graphBfs.states?.some((state) => state.variables.queue !== undefined && state.variables.seen !== undefined) === true, "graph BFS queue/set state was not captured");

const gridDfs = await runJava(source, { method: "gridDfsCount", arguments: ["[[1,1,0],[0,1,0],[1,0,1]]"] });
assert(gridDfs.kind === "OK" && gridDfs.result === "3", "grid DFS returned the wrong island count");
assert(hasCallStack(gridDfs, "gridDfsCount", "sinkIsland"), "grid DFS did not preserve nested recursive frames");
assert(traceTypes(gridDfs).has("ARRAY_WRITE"), "grid DFS did not emit array mutation events");

const paths = await runJava(source, {
    method: "countPaths",
    arguments: ['{"val":5,"left":{"val":4,"left":null,"right":null},"right":{"val":8,"left":null,"right":null}}', "9"]
});
assert(paths.kind === "OK" && paths.result === "1", "recursive tree path search returned the wrong result");
assert(hasCallStack(paths, "countPaths", "countPaths"), "recursive path search did not preserve nested frames");

const subsets = await runJava(source, { method: "subsetsCount", arguments: ["[1,2,3]"] });
assert(subsets.kind === "OK" && subsets.result === "8", "backtracking subsets returned the wrong count");
assert(hasCallStack(subsets, "buildSubsets", "buildSubsets"), "subsets backtracking did not preserve recursive frames");
assert(traceTypes(subsets).has("OBJECT_FIELD_WRITE") || (subsets.states?.length ?? 0) > 0, "subsets produced no useful mutation trace");

const permutations = await runJava(source, { method: "permutationCount", arguments: ["[1,2,3]"] });
assert(permutations.kind === "OK" && permutations.result === "6", "backtracking permutations returned the wrong count");
assert(hasCallStack(permutations, "buildPermutations", "buildPermutations"), "permutation backtracking did not preserve recursive frames");
assert(permutations.states?.some((state) => state.variables.used !== undefined) === true, "permutation boolean-array state was not captured");

const mixed = await runJava(source, { method: "mixedStructureScore", arguments: ["[1,2,3,4]"] });
assert(mixed.kind === "OK" && mixed.result === "10", "mixed array/object structure returned the wrong result");
assert(mixed.states?.some((state) => state.variables.rows !== undefined) === true, "mixed collection/array structure was not captured");

console.log("PASS: LeetCode algorithms - nested loops, DFS, BFS, backtracking, mixed structures");
