import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const numArray = await runJava(
    `class NumArray {
        private final int[] nums;
        public NumArray(int[] nums) { this.nums = nums; }
        public int sumRange(int left, int right) {
            int sum = 0;
            for (int i = left; i <= right; i++) sum += nums[i];
            return sum;
        }
    }`,
    {
        constructorArguments: ["[1,2,3,4,5]"],
        calls: [
            { method: "sumRange", arguments: ["0", "2"] },
            { method: "sumRange", arguments: ["1", "3"] }
        ]
    }
);

assert(numArray.success, `NumArray design execution failed: ${numArray.message ?? numArray.stderr}`);
assert(numArray.result === "[null,6,9]", `NumArray results mismatch: ${numArray.result}`);

const counter = await runJava(
    `class Counter {
        private int value;
        public Counter(int initial) { value = initial; }
        public int add(int amount) { value += amount; return value; }
        public int get() { return value; }
    }`,
    {
        constructorArguments: ["3"],
        calls: [
            { method: "add", arguments: ["2"] },
            { method: "add", arguments: ["3"] },
            { method: "get" }
        ]
    }
);

assert(counter.success, `Counter design execution failed: ${counter.message ?? counter.stderr}`);
assert(counter.result === "[null,5,8,8]", `Counter state did not persist across calls: ${counter.result}`);
assert(
    (counter.trace?.events.length ?? 0) > 0,
    "Expected the design-class execution to retain its execution trace"
);

console.log("Java design-class execution passed (constructor arguments, ordered calls, persistent fields).");
