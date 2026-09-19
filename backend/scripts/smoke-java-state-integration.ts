import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function traceTypes(result: Awaited<ReturnType<typeof runJava>>): Set<string> {
    return new Set(
        result.trace?.events.map((event) => event.type) ?? []
    );
}

function snapshotField(value: unknown, field: string): unknown {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        return undefined;
    }

    return (value as Record<string, unknown>)[field];
}

const source = `
class Solution {
    static class Node {
        int value;
        Node next;

        Node(int value) {
            this.value = value;
        }
    }

    public int locals() {
        int x = 1;
        x = 2;
        x++;
        return x;
    }

    public String branch(int value) {
        String path;
        if (value > 0) {
            path = "positive";
        } else {
            path = "non-positive";
        }
        return path;
    }

    public int aliasing() {
        Node a = new Node(1);
        Node b = a;
        b.value = 7;
        return a.value;
    }

    public int deepMutation() {
        Node head = new Node(1);
        head.next = new Node(2);
        head.next.next = new Node(3);
        head.next.next.value = 10;
        return head.next.next.value;
    }

    public int arrayMutation() {
        int[] nums = {1, 2, 3};
        nums[1] = 9;
        nums[2]++;
        return nums[1] + nums[2];
    }

    public int helper() {
        return doubleIt(5);
    }

    private int doubleIt(int value) {
        int result = value * 2;
        return result;
    }

    public int recursive(int value) {
        if (value <= 1) {
            return value;
        }
        return value + recursive(value - 1);
    }
}
`;

const locals = await runJava(source, { method: "locals" });

assert(locals.kind === "OK", "local variable test did not execute successfully");
assert(locals.result === "3", "local variable test returned the wrong result");

const localValues = (locals.states ?? [])
    .map((state) => state.variables.x)
    .filter((value) => typeof value === "number");

assert(localValues.includes(1), "local variable initial value was not captured");
assert(localValues.includes(2), "local variable reassignment was not captured");
assert(localValues.includes(3), "local variable increment was not captured");

const positive = await runJava(source, {
    method: "branch",
    arguments: ["5"]
});

const negative = await runJava(source, {
    method: "branch",
    arguments: ["0"]
});

assert(positive.kind === "OK", "positive branch did not execute successfully");
assert(negative.kind === "OK", "negative branch did not execute successfully");
assert(positive.result === "\"positive\"", "positive branch returned the wrong result");
assert(negative.result === "\"non-positive\"", "negative branch returned the wrong result");

const positiveState = positive.states?.at(-1);
const negativeState = negative.states?.at(-1);

assert(
    positiveState?.variables.path === "positive",
    "positive branch state did not preserve the executed path"
);

assert(
    negativeState?.variables.path === "non-positive",
    "negative branch state did not preserve the executed path"
);

const aliasing = await runJava(source, { method: "aliasing" });

assert(aliasing.kind === "OK", "object aliasing test did not execute successfully");
assert(aliasing.result === "7", "object aliasing mutation did not affect the original reference");

const aliasState = aliasing.states?.at(-1);
const a = aliasState?.variables.a as Record<string, unknown> | undefined;
const b = aliasState?.variables.b as Record<string, unknown> | undefined;

assert(
    typeof a?.$objectId === "string" &&
    a.$objectId === b?.$objectId,
    "object aliases did not preserve the same object identity"
);

assert(
    traceTypes(aliasing).has("OBJECT_FIELD_WRITE"),
    "object aliasing mutation did not emit OBJECT_FIELD_WRITE"
);

const deepMutation = await runJava(source, { method: "deepMutation" });

assert(deepMutation.kind === "OK", "deep object mutation test did not execute successfully");
assert(deepMutation.result === "10", "deep object mutation returned the wrong result");

const deepTypes = traceTypes(deepMutation);

assert(
    deepTypes.has("OBJECT_FIELD_WRITE"),
    "deep object mutation did not emit OBJECT_FIELD_WRITE"
);

const deepState = deepMutation.states?.at(-1);
const head = deepState?.variables.head;
const next = snapshotField(snapshotField(head, "fields"), "next");
const tail = snapshotField(snapshotField(next, "fields"), "next");
const tailValue = snapshotField(snapshotField(tail, "fields"), "value");

assert(
    tailValue === 10,
    "deep object state did not preserve the final nested field value"
);

const arrayMutation = await runJava(source, { method: "arrayMutation" });

assert(
    arrayMutation.kind === "OK",
    "array mutation state test did not execute successfully"
);
assert(
    arrayMutation.result === "13",
    "array mutation returned the wrong result"
);

const arrayTypes = traceTypes(arrayMutation);

assert(
    arrayTypes.has("ARRAY_WRITE"),
    "array mutation did not emit ARRAY_WRITE"
);

const arrayState = arrayMutation.states?.at(-1);
const nums = arrayState?.variables.nums;

const arrayValues = snapshotField(nums, "values");

assert(
    JSON.stringify(arrayValues) === "[1,9,4]",
    "array state did not preserve the final mutated values"
);

const helper = await runJava(source, { method: "helper" });

assert(helper.kind === "OK", "helper call test did not execute successfully");
assert(helper.result === "10", "helper call returned the wrong result");

const helperStates = helper.states ?? [];

assert(
    helperStates.some(
        (state) =>
            state.callStack.includes("helper") &&
            state.callStack.includes("doubleIt")
    ),
    "call stack state did not capture the nested helper call"
);

assert(
    helperStates.at(-1)?.callStack.length === 0,
    "call stack was not restored after method return"
);

const recursive = await runJava(source, {
    method: "recursive",
    arguments: ["4"]
});

assert(
    recursive.kind === "OK",
    "recursive state test did not execute successfully"
);
assert(
    recursive.result === "10",
    "recursive call returned the wrong result"
);

const recursiveStates = recursive.states ?? [];

assert(
    recursiveStates.some(
        (state) =>
            state.callStack.filter((method) => method === "recursive").length >= 2
    ),
    "recursive call stack did not capture nested recursion"
);

assert(
    recursiveStates.at(-1)?.callStack.length === 0,
    "call stack was not restored after recursion"
);

console.log("PASS: Java state integration");
