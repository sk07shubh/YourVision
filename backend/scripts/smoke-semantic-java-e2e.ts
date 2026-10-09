import { runJava } from "../src/execution/java/runner.js";
import type { ExecutionEvent } from "../src/execution/trace/schema.js";

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

type Case = {
    name: string;
    source: string;
    method: string;
    args: string[];
    expectedResult: string;
    indexedArray: string;
};

const cases: Case[] = [
    {
        name: "binary search",
        source: `class Solution {
    public int search(int[] nums, int target) {
        int low = 0;
        int high = nums.length - 1;
        while (low <= high) {
            int mid = low + (high - low) / 2;
            if (nums[mid] == target) {
                return mid;
            }
            if (nums[mid] < target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return -1;
    }
}`,
        method: "search",
        args: ["[1,3,5,7,9,11]", "7"],
        expectedResult: "3",
        indexedArray: "nums"
    },
    {
        name: "two sum",
        source: `import java.util.*;
class Solution {
    public int[] twoSum(int[] nums, int target) {
        int n = nums.length;
        Map<Integer, Integer> mp = new HashMap<>();
        for (int i = 0; i < n; i++) {
            int need = target - nums[i];
            if (mp.containsKey(need)) {
                return new int[] { mp.get(need), i };
            } else {
                mp.put(nums[i], i);
            }
        }
        return new int[] {};
    }
}`,
        method: "twoSum",
        args: ["[2,7,11,15]", "9"],
        expectedResult: "[0,1]",
        indexedArray: "nums"
    }
];

for (const test of cases) {
    const result = await runJava(test.source, {
        method: test.method,
        arguments: test.args
    });

    assert(result.success, `${test.name}: runner failed (${result.kind}): ${result.message ?? result.stderr}`);
    assert(result.result === test.expectedResult,
        `${test.name}: expected result ${test.expectedResult}, got ${result.result}`);

    const trace = result.trace;
    assert(trace && trace.events.length > 0, `${test.name}: real runner returned no trace`);
    const steps = trace.events.filter((event) => event.type === "STEP");
    assert(steps.length > 0, `${test.name}: no STEP checkpoints were captured`);

    for (const step of steps) {
        const visualization = step.data?.visualization as Record<string, unknown> | undefined;
        assert(visualization && visualization.provider === "local-fallback",
            `${test.name}: STEP ${step.sequence} is missing deterministic semantic metadata`);
        assert(Array.isArray(visualization.targets),
            `${test.name}: STEP ${step.sequence} is missing semantic targets`);
    }

    const sourceLines = test.source.split(/\r?\n/);
    const indexedLines = sourceLines
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => new RegExp(`\\b${test.indexedArray}\\s*\\[`).test(line));
    assert(indexedLines.length > 0, `${test.name}: test fixture has no indexed array access`);

    const indexedSteps = steps.filter((step) =>
        indexedLines.some(({ lineNumber }) => step.line === lineNumber)
    );
    assert(indexedSteps.length > 0, `${test.name}: runtime trace did not visit an indexed-array source line`);

    const groundedRead = indexedSteps.some((step) => {
        const visualization = step.data?.visualization as {
            variableRoles?: Array<{ name: string; role: string; structureName?: string }>;
            targets?: Array<{ eventType: string; operation: string; name?: string; indices?: number[] }>;
        };
        const roles = visualization.variableRoles ?? [];
        const targets = visualization.targets ?? [];
        const runtimeEvents = Array.isArray(step.data?.executionEvents)
            ? step.data.executionEvents as ExecutionEvent[]
            : [];
        const hasRuntimeRead = runtimeEvents.some((event) =>
            event.type === "ARRAY_ACCESS" && event.data?.name === test.indexedArray
        );
        const hasTarget = targets.some((target) =>
            target.eventType === "ARRAY_ACCESS" &&
            target.operation === "read" &&
            target.name === test.indexedArray &&
            Array.isArray(target.indices) &&
            target.indices.every(Number.isInteger)
        );
        const hasIndexRole = roles.some((role) =>
            role.role === "array-index" &&
            role.structureName === test.indexedArray
        );
        return hasRuntimeRead && hasTarget && hasIndexRole;
    });

    assert(groundedRead,
        `${test.name}: semantic read target/index role did not agree with the real runtime event and source`);

    console.log(`PASS: ${test.name} real Java execution + semantic trace (${steps.length} steps)`);
}

console.log("PASS: real Java end-to-end semantic trace regression");
