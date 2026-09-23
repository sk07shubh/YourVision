import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const source = `
import java.util.*;

class Solution {
    public int structures() {
        int[] nums = {2, 7, 11};
        HashMap<Integer, Integer> map = new HashMap<>();
        map.put(2, 7);
        HashSet<Integer> set = new HashSet<>();
        set.add(10);
        Stack<Integer> stack = new Stack<>();
        stack.push(5);
        Queue<Integer> queue = new ArrayDeque<>();
        queue.add(8);
        ArrayList<Integer> list = new ArrayList<>();
        list.add(3);

        map.put(3, 9);
        set.add(11);
        stack.push(6);
        queue.add(12);
        list.add(4);
        nums[0] = 99;

        return nums[0] + map.get(3) + set.size() +
            stack.peek() + queue.peek() + list.get(1);
    }

    public int empty() {
        HashMap<Integer, Integer> map = new HashMap<>();
        HashSet<Integer> set = new HashSet<>();
        Stack<Integer> stack = new Stack<>();
        Queue<Integer> queue = new ArrayDeque<>();
        ArrayList<Integer> list = new ArrayList<>();
        return map.size() + set.size() + stack.size() +
            queue.size() + list.size();
    }
}
`;

const populated = await runJava(source, { method: "structures" });
assert(populated.kind === "OK", "data structure execution failed");

const finalState = populated.states?.at(-1);
const structures = finalState?.dataStructures ?? {};
const variables = finalState?.variables ?? {};

assert(!("nums" in variables), "array leaked into Variables");
assert(!("map" in variables), "map leaked into Variables");

for (const name of ["nums","map","set","stack","queue","list"]) {
    assert(name in structures, name + " missing from Data Structures");
}

const nums = structures.nums as Record<string, unknown>;
const map = structures.map as Record<string, unknown>;
const set = structures.set as Record<string, unknown>;
const stack = structures.stack as Record<string, unknown>;
const queue = structures.queue as Record<string, unknown>;
const list = structures.list as Record<string, unknown>;

assert(JSON.stringify(nums.values) === "[99,7,11]", "array values incorrect");
assert(Array.isArray(map.entries) && (map.entries as unknown[]).length === 2, "map entries incorrect");
assert(JSON.stringify(set.values) === "[10,11]", "set values incorrect");
assert(JSON.stringify(stack.values) === "[5,6]", "stack values incorrect");
assert(JSON.stringify(queue.values) === "[8,12]", "queue values incorrect");
assert(JSON.stringify(list.values) === "[3,4]", "list values incorrect");

const empty = await runJava(source, { method: "empty" });
assert(empty.kind === "OK", "empty DS execution failed");

const emptyState = empty.states?.find(
    state => Object.keys(state.dataStructures ?? {}).length >= 5
);
const emptyStructures = emptyState?.dataStructures ?? {};

for (const name of ["map","set","stack","queue","list"]) {
    assert(name in emptyStructures, "empty " + name + " missing");
    const value = emptyStructures[name] as Record<string, unknown>;
    const length = name === "map"
        ? Array.isArray(value.entries) ? value.entries.length : -1
        : Array.isArray(value.values) ? value.values.length : -1;
    assert(length === 0, "empty " + name + " is not empty");
}

console.log("PASS: Java data structure state integration");
