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
import java.util.ArrayList;
import java.util.List;

class Solution {
    static class Node {
        int value;
        Node next;

        Node() {
        }

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

    public int mutateNode(Node node) {
        node.next.value = 42;
        return node.next.value;
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

    public int mutateInput(int[] nums) {
        nums[0] = 9;
        return nums[0];
    }

    public int prints() {
        System.out.println("hello from YourVision");
        System.err.println("warning from YourVision");
        return 1;
    }

    public int indexedRead(int[] nums) {
        int i = 1;
        return nums[i];
    }

    public int postIndexedRead(int[] nums) {
        int i = 0;
        return nums[i++] + i;
    }

    public int methodIndexedRead(int[] nums) {
        return nums[nextIndex()];
    }

    private int nextIndex() {
        return 1;
    }

    public int helper() {
        return doubleIt(5);
    }

    private int doubleIt(int value) {
        int result = value * 2;
        return result;
    }

    public int throwsError() {
        throw new IllegalArgumentException("bad input");
    }

    public int collectionMutation() {
        List<Integer> values = new ArrayList<>();
        values.add(1);
        values.add(2);
        values.set(0, 9);
        return values.get(0) + values.get(1);
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

const inputObjectMutation = await runJava(source, {
    method: "mutateNode",
    arguments: ["{\"value\":5,\"next\":{\"value\":8}}"]
});

assert(
    inputObjectMutation.kind === "OK",
    "object argument mutation test did not execute successfully"
);
assert(
    inputObjectMutation.result === "42",
    "object argument mutation returned the wrong result"
);
assert(
    traceTypes(inputObjectMutation).has("OBJECT_FIELD_WRITE"),
    "object argument mutation did not emit OBJECT_FIELD_WRITE"
);

const inputObjectState = inputObjectMutation.states?.at(-1);
const inputObject = inputObjectState?.variables.node;
const inputObjectFields = snapshotField(inputObject, "fields");
const inputObjectTail = snapshotField(inputObjectFields, "next");
const inputObjectTailValue = snapshotField(
    snapshotField(inputObjectTail, "fields"),
    "value"
);

assert(
    inputObjectTailValue === 42,
    "object argument state did not preserve the nested mutation"
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

const inputArrayMutation = await runJava(source, {
    method: "mutateInput",
    arguments: ["[1,2,3]"]
});

assert(
    inputArrayMutation.kind === "OK",
    "argument array mutation test did not execute successfully"
);
assert(
    inputArrayMutation.result === "9",
    "argument array mutation returned the wrong result"
);
assert(
    traceTypes(inputArrayMutation).has("ARRAY_WRITE"),
    "argument array mutation did not emit ARRAY_WRITE"
);

const inputArrayState = inputArrayMutation.states?.at(-1);
const inputArray = inputArrayState?.variables.nums;
const inputArrayValues = snapshotField(inputArray, "values");

assert(
    JSON.stringify(inputArrayValues) === "[9,2,3]",
    "argument array state did not preserve the caller-provided mutation"
);

const prints = await runJava(source, { method: "prints" });

assert(
    prints.kind === "OK",
    "stdout/stderr test did not execute successfully"
);
assert(
    prints.result === "1",
    "stdout/stderr test returned the wrong result"
);
assert(
    prints.stdout.includes("hello from YourVision"),
    "stdout was not captured from generic Java execution"
);
assert(
    prints.stderr.includes("warning from YourVision"),
    "stderr was not captured from generic Java execution"
);
assert(
    (prints.states?.length ?? 0) > 0,
    "stdout/stderr execution did not produce trace states"
);

const indexedRead = await runJava(source, {
    method: "indexedRead",
    arguments: ["[4,8,15]"]
});

assert(
    indexedRead.kind === "OK" && indexedRead.result === "8",
    "simple indexed read state test returned the wrong result"
);
assert(
    indexedRead.states?.some(
        (state) => state.variables.i === 1
    ) === true,
    "simple indexed read did not preserve the index variable"
);

const postIndexedRead = await runJava(source, {
    method: "postIndexedRead",
    arguments: ["[4,8,15]"]
});

assert(
    postIndexedRead.kind === "OK" && postIndexedRead.result === "5",
    "post-increment indexed read state test returned the wrong result"
);
assert(
    postIndexedRead.states?.some(
        (state) => state.variables.i === 0
    ) === true,
    "post-increment indexed read did not preserve the source index state"
);

const methodIndexedRead = await runJava(source, {
    method: "methodIndexedRead",
    arguments: ["[4,8,15]"]
});

assert(
    methodIndexedRead.kind === "OK" && methodIndexedRead.result === "8",
    "method-call indexed read state test returned the wrong result"
);
assert(
    methodIndexedRead.states?.some(
        (state) =>
            state.callStack.includes("methodIndexedRead") &&
            state.callStack.includes("nextIndex")
    ) === true,
    "method-call indexed read did not preserve the nested call stack"
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

const runtimeError = await runJava(source, { method: "throwsError" });

assert(
    runtimeError.kind === "RUNTIME_ERROR",
    "runtime exception state test did not report RUNTIME_ERROR"
);

assert(
    traceTypes(runtimeError).has("ERROR"),
    "runtime exception did not emit ERROR"
);

const errorState = runtimeError.states?.find((state) => state.error?.type === "java.lang.IllegalArgumentException");

assert(
    errorState?.error?.message === "bad input",
    "runtime exception state did not preserve the error details"
);

const collectionMutation = await runJava(source, { method: "collectionMutation" });

assert(
    collectionMutation.kind === "OK",
    "collection mutation state test did not execute successfully"
);
assert(
    collectionMutation.result === "11",
    "collection mutation returned the wrong result"
);

const collectionState = collectionMutation.states?.at(-1);
const values = collectionState?.variables.values;
const valuesFields = snapshotField(values, "fields") as Record<string, unknown> | undefined;

assert(
    typeof valuesFields?.size === "number" && valuesFields.size === 2,
    "collection state did not preserve the final collection size"
);
assert(
    typeof valuesFields?.elementData === "object" && valuesFields.elementData !== null,
    "collection state did not preserve the backing array"
);

const collectionArray = valuesFields?.elementData;
const collectionArrayValues = snapshotField(collectionArray, "values");

const firstElement = Array.isArray(collectionArrayValues)
    ? collectionArrayValues[0]
    : undefined;
const secondElement = Array.isArray(collectionArrayValues)
    ? collectionArrayValues[1]
    : undefined;

assert(
    snapshotField(snapshotField(firstElement, "fields"), "value") === 9 &&
    snapshotField(snapshotField(secondElement, "fields"), "value") === 2,
    "collection state did not preserve mutated elements"
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
