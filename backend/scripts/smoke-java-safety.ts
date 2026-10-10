import { runJava } from "../src/execution/java/runner.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

    public void spinForever() {
        while (true) {}
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
assert(
    (timeout.trace?.events.length ?? 0) <= 5000,
    "expanded trace exceeded the 5,000-event safety limit"
);

const infinite = await runJava(source, { method: "spinForever" });

assert(
    infinite.kind === "TIMEOUT",
    "infinite Java loop was not timed out: " + infinite.kind
);
assert(infinite.success === false, "infinite-loop timeout must not report success");
assert(
    typeof infinite.message === "string" && infinite.message.length > 0,
    "infinite-loop timeout must expose a useful message"
);

// Allow a short grace period for OS process-table updates, then check for
// any surviving tracer/debuggee JVM whose command line contains the runtime.
const deadline = Date.now() + 2000;
let survivingRuntime: string | undefined;

do {
    try {
        const { stdout } = await execFileAsync(
            "pgrep",
            ["-f", "YourVisionRuntime"],
            { timeout: 1000 }
        );
        survivingRuntime = stdout.trim() || undefined;
    } catch (error) {
        // pgrep exits 1 when no process matches; execFile surfaces the
        // numeric exit code on the error object.
        const code = (error as unknown as { code?: unknown }).code;

        if (code === 1) {
            // pgrep found no matching process.
            survivingRuntime = undefined;
        } else {
            throw error;
        }
    }

    if (survivingRuntime === undefined) break;

    await new Promise((resolve) => setTimeout(resolve, 100));
} while (Date.now() < deadline);

assert(
    survivingRuntime === undefined,
    "orphaned YourVisionRuntime process remained after runJava timeout: " +
        survivingRuntime
);

console.log(
    "PASS: Java safety - large snapshots, deep objects, execution timeout, no orphaned debuggee"
);
