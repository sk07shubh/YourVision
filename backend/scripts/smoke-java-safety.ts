import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const source = `
class Solution {
    static class Node {
        int value;
        Node next;
        Node() {}
    }

    public int largeArray(int[] nums) {
        return nums.length;
    }

    public int deepObject(Node node) {
        int count = 0;
        Node current = node;
        while (current != null) {
            count++;
            current = current.next;
        }
        return count;
    }

    public int boundedLoop() {
        int sum = 0;
        for (int i = 0; i < 1000000000; i++) sum += i;
        return sum;
    }
}
`;

const large = await runJava(source, {
    method: "largeArray",
    arguments: [`[${Array.from({ length: 200 }, (_, i) => i).join(",")}]`]
});
assert(large.kind === "OK" && large.result === "200", "large-array safety input failed");
const arraySnapshot = JSON.stringify(large.states?.find((state) => Object.keys(state.arrays).length > 0)?.arrays ?? {});
assert(arraySnapshot.includes('"truncated":true'), "large array snapshot was not bounded");
assert(arraySnapshot.includes('"length":200'), "large array length metadata was lost");

const deep = await runJava(source, {
    method: "deepObject",
    arguments: ['{"value":1,"next":{"value":2,"next":{"value":3,"next":{"value":4,"next":{"value":5,"next":{"value":6,"next":{"value":7,"next":{"value":8,"next":{"value":9,"next":null}}}}}}}}}']
});
assert(deep.kind === "OK" && deep.result === "9", "deep object safety input failed");
assert((deep.states?.length ?? 0) > 0, "deep object produced no states");

const timeout = await runJava(source, { method: "boundedLoop" });
assert(timeout.kind === "TIMEOUT", "unbounded execution was not contained: " + timeout.kind);
assert(timeout.success === false, "timeout must not report success");
assert(timeout.message !== undefined && timeout.message.length > 0, "timeout must expose a useful message");

console.log("PASS: Java safety - large snapshots, deep objects, execution timeout");
