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
    indexedArray?: string;
    regression: "array-read" | "nested-loops" | "map-mutations" | "array-write" | "recursion";
};

type RuntimeEvent = ExecutionEvent & { data?: Record<string, unknown> };

const cases: Case[] = [
    {
        name: "binary search",
        regression: "array-read",
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
        regression: "array-read",
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
    },
    {
        name: "nested loops",
        regression: "nested-loops",
        source: `class Solution {
    public int countPairs() {
        int count = 0;
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 2; j++) {
                count++;
            }
        }
        return count;
    }
}`,
        method: "countPairs",
        args: [],
        expectedResult: "6"
    },
    {
        name: "map insert and update",
        regression: "map-mutations",
        source: `import java.util.*;
class Solution {
    public int mapMutation() {
        Map<Integer, Integer> values = new HashMap<>();
        values.put(1, 10);
        values.put(1, 20);
        return values.get(1);
    }
}`,
        method: "mapMutation",
        args: [],
        expectedResult: "20"
    },
    {
        name: "array write",
        regression: "array-write",
        source: `class Solution {
    public int arrayWrite() {
        int[] values = {1, 2, 3};
        values[1] = 9;
        return values[1];
    }
}`,
        method: "arrayWrite",
        args: [],
        expectedResult: "9"
    },
    {
        name: "recursion",
        regression: "recursion",
        source: `class Solution {
    public int sum(int n) {
        if (n <= 0) {
            return 0;
        }
        return n + sum(n - 1);
    }
}`,
        method: "sum",
        args: ["4"],
        expectedResult: "10"
    }
];

function stepEvents(step: ExecutionEvent): RuntimeEvent[] {
    const events = step.data?.executionEvents;
    return Array.isArray(events) ? events.filter(
        (event): event is RuntimeEvent => Boolean(event) && typeof event === "object"
    ) : [];
}

function allTraceEvents(traceEvents: ExecutionEvent[]): RuntimeEvent[] {
    const result: RuntimeEvent[] = [];
    for (const event of traceEvents) {
        result.push(event as RuntimeEvent);
        result.push(...stepEvents(event));
    }
    return result;
}

function visualizationOf(step: ExecutionEvent): {
    provider?: string;
    targets?: Array<{
        eventType: string;
        operation: string;
        name?: string;
        indices?: number[];
        changeKind?: string;
        key?: unknown;
    }>;
    variableRoles?: Array<{ name: string; role: string; structureName?: string }>;
    animationIntents?: Array<{ action: string; targetIndex: number; variableName?: string }>;
} {
    return step.data?.visualization as ReturnType<typeof visualizationOf>;
}

for (const test of cases) {
    const result = await runJava(test.source, {
        method: test.method,
        arguments: test.args
    });

    assert(result.success, `${test.name}: runner failed (${result.kind}): ${result.message ?? result.stderr}`);
    assert(result.result === test.expectedResult,
        `${test.name}: expected result ${test.expectedResult}, got ${result.result}`);

    const trace = result.trace;
    if (!trace || trace.events.length === 0) throw new Error(`${test.name}: real runner returned no trace`);
    const steps = trace.events.filter((event) => event.type === "STEP");
    assert(steps.length > 0, `${test.name}: no STEP checkpoints were captured`);

    for (const step of steps) {
        const visualization = visualizationOf(step);
        assert(visualization?.provider === "local-fallback",
            `${test.name}: STEP ${step.sequence} is missing deterministic semantic metadata`);
        assert(Array.isArray(visualization.targets),
            `${test.name}: STEP ${step.sequence} is missing semantic targets`);
        assert(Array.isArray(visualization.animationIntents),
            `${test.name}: STEP ${step.sequence} is missing grounded animation intent metadata`);
    }

    const sourceLines = test.source.split(/\r?\n/);
    const runtimeEvents = allTraceEvents(trace.events);

    if (test.regression === "array-read") {
        const indexedArray = test.indexedArray!;
        const indexedLines = sourceLines
            .map((line, index) => ({ line, lineNumber: index + 1 }))
            .filter(({ line }) => new RegExp(`\\b${indexedArray}\\s*\\[`).test(line));
        assert(indexedLines.length > 0, `${test.name}: test fixture has no indexed array access`);

        const indexedSteps = steps.filter((step) =>
            indexedLines.some(({ lineNumber }) => step.line === lineNumber)
        );
        assert(indexedSteps.length > 0, `${test.name}: runtime trace did not visit an indexed-array source line`);

        const groundedRead = indexedSteps.some((step) => {
            const visualization = visualizationOf(step)!;
            const roles = visualization.variableRoles ?? [];
            const targets = visualization.targets ?? [];
            const events = stepEvents(step);
            const hasRuntimeRead = events.some((event) =>
                event.type === "ARRAY_ACCESS" && event.data?.name === indexedArray
            );
            const hasTarget = targets.some((target) =>
                target.eventType === "ARRAY_ACCESS" &&
                target.operation === "read" &&
                target.name === indexedArray &&
                Array.isArray(target.indices) &&
                target.indices.every(Number.isInteger)
            );
            const hasIndexRole = roles.some((role) =>
                role.role === "array-index" && role.structureName === indexedArray
            );
            const hasGroundedPointerIntent = (visualization.animationIntents ?? []).some((intent) => {
                const target = targets[intent.targetIndex];
                const role = roles.find((candidate) =>
                    candidate.role === "array-index" &&
                    candidate.name === intent.variableName &&
                    candidate.structureName === indexedArray
                );
                return intent.action === "pointer-move" &&
                    !!role && !!target &&
                    target.eventType === "ARRAY_ACCESS" &&
                    target.name === indexedArray &&
                    Array.isArray(target.indices) &&
                    target.indices.length === 1 &&
                    step.data?.variables &&
                    (step.data.variables as Record<string, unknown>)[role.name] === target.indices[0];
            });
            return hasRuntimeRead && hasTarget && hasIndexRole && hasGroundedPointerIntent;
        });

        assert(groundedRead,
            `${test.name}: semantic read target/index role did not agree with the real runtime event and source`);
    }

    if (test.regression === "nested-loops") {
        const loopLines = sourceLines
            .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
            .filter(({ line }) => /^for\s*\(/.test(line));
        assert(loopLines.length === 2, "nested loops: fixture must contain two for-loop headers");

        const bodySteps = steps.filter((step) => {
            const line = sourceLines[(step.line ?? 0) - 1]?.trim() ?? "";
            return line === "count++;";
        });
        const pairs = new Set(bodySteps.map((step) => {
            const vars = (step.data?.variables ?? {}) as Record<string, unknown>;
            return `${String(vars.i)}:${String(vars.j)}`;
        }));
        assert(pairs.size === 6, `nested loops: expected six distinct (i,j) runtime snapshots, got ${pairs.size}`);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
                assert(pairs.has(`${i}:${j}`), `nested loops: missing runtime index pair (${i},${j})`);
            }
        }
    }

    if (test.regression === "map-mutations") {
        const mapEvents = runtimeEvents.filter((event) =>
            event.type === "MAP_WRITE" && event.data?.name === "values"
        );
        const changes = mapEvents.flatMap((event) =>
            Array.isArray(event.data?.changes) ? event.data.changes as Array<Record<string, unknown>> : []
        );
        assert(changes.some((change) => change.kind === "insert" && change.key === 1 && change.after === 10),
            "map insert and update: real trace is missing insertion of key 1 -> 10");
        assert(changes.some((change) => change.kind === "update" && change.key === 1 && change.before === 10 && change.after === 20),
            "map insert and update: real trace is missing update of key 1 from 10 to 20");

        const groundedMapTarget = steps.some((step) => {
            const targets = visualizationOf(step)?.targets ?? [];
            const events = stepEvents(step);
            return events.some((event) => event.type === "MAP_WRITE" && event.data?.name === "values") &&
                targets.some((target) => target.eventType === "MAP_WRITE" &&
                    target.name === "values" && target.changeKind === "update" && target.key === 1);
        });
        assert(groundedMapTarget, "map insert and update: semantic update target is not grounded in the runtime map event");
    }

    if (test.regression === "array-write") {
        const writes = runtimeEvents.filter((event) =>
            event.type === "ARRAY_WRITE" && event.data?.name === "values"
        );
        const changes = writes.flatMap((event) =>
            Array.isArray(event.data?.changes) ? event.data.changes as Array<Record<string, unknown>> : []
        );
        assert(changes.some((change) =>
            Array.isArray(change.indices) &&
            change.indices.length === 1 &&
            change.indices[0] === 1 &&
            change.before === 2 &&
            change.after === 9
        ), "array write: real trace did not capture index 1 changing from 2 to 9");

        const groundedWriteTarget = steps.some((step) => {
            const targets = visualizationOf(step)?.targets ?? [];
            const events = stepEvents(step);
            return events.some((event) => event.type === "ARRAY_WRITE" && event.data?.name === "values") &&
                targets.some((target) => target.eventType === "ARRAY_WRITE" &&
                    target.name === "values" &&
                    Array.isArray(target.indices) &&
                    target.indices.length === 1 &&
                    target.indices[0] === 1);
        });
        assert(groundedWriteTarget, "array write: semantic write target does not match the runtime write index");
    }

    if (test.regression === "recursion") {
        const enters = trace.events.filter((event) =>
            event.type === "METHOD_ENTER" && event.method === "sum"
        );
        const depths = new Set(enters.map((event) => event.depth).filter(
            (depth): depth is number => typeof depth === "number"
        ));
        assert(enters.length >= 5, `recursion: expected at least five real method-entry events, got ${enters.length}`);
        assert(depths.size >= 5, `recursion: expected five distinct recursive call depths, got ${[...depths].join(",")}`);

        const recursiveSnapshots = enters.map((event) => {
            const variables = event.data?.variables as Record<string, unknown> | undefined;
            return variables?.n;
        });
        for (const expectedN of [4, 3, 2, 1, 0]) {
            assert(recursiveSnapshots.includes(expectedN),
                `recursion: method-entry snapshots are missing n=${expectedN}`);
        }
    }

    console.log(`PASS: ${test.name} real Java execution + semantic trace (${steps.length} steps)`);
}

console.log("PASS: real Java end-to-end semantic trace regression");
