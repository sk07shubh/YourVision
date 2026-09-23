import { runJava } from "../src/execution/java/runner.js";

function assert(
    condition: boolean,
    message: string
): void {
    if (!condition) {
        throw new Error(message);
    }
}

type Case = {
    name: string;
    source: string;
    method: string;
    args?: string[];
    expectedKind: string;
    expectedResult?: string;
    expectedErrorType?: string;
    requiredTraceTypes?: string[];
};

const source = `
import java.util.*;

class Solution {
    public int zero() {
        return 42;
    }

    public static int add(int a, int b) {
        return a + b;
    }

    public int sum(int[] values) {
        int total = 0;

        for (int value : values) {
            total += value;
        }

        return total;
    }

    public int sum2(int[][] values) {
        int total = 0;

        for (int[] row : values) {
            if (row == null) {
                continue;
            }

            for (int value : row) {
                total += value;
            }
        }

        return total;
    }

    public int nullable(String value) {
        return value == null ? 1 : 0;
    }

    public String over(int value) {
        return "int";
    }

    public String over(long value) {
        return "long";
    }

    public int helperCall(int value) {
        return doubleIt(value);
    }

    private int doubleIt(int value) {
        return value * 2;
    }

    public int recursive(int n) {
        if (n <= 1) {
            return n;
        }

        return recursive(n - 1) +
            recursive(n - 2);
    }

    public int boom() {
        int[] values = {1};
        return values[2];
    }

    public int sideEffectWrite(int[] values) {
        int i = 0;
        values[i++] = 9;
        return i + values[0];
    }

    public int postIncrementWrite(int[] values) {
        int i = 1;
        values[i]++;
        return values[i];
    }

    public int nestedWrite(int[][] values) {
        int row = 0;
        int col = 1;
        values[row][col] = 8;
        return values[row][col];
    }

    public int readIndex(int[] values, int index) {
        return values[index];
    }

    public int postIncrementRead(int[] values) {
        int i = 0;
        return values[i++] + i;
    }

    public int functionIndexRead(int[] values) {
        return values[nextIndex()];
    }

    private int nextIndex() {
        return 1;
    }

    public int nestedIndexRead(int[][] values, int row, int col) {
        return values[row][col];
    }

    public int aliasIndexRead(int[] values, int index) {
        int[] alias = values;
        return alias[index];
    }

    public List<Integer> listResult() {
        return Arrays.asList(1, 2, 3);
    }

    public int sumList(List<Integer> values) {
        int total = 0;
        for (Integer value : values) {
            if (value != null) {
                total += value;
            }
        }
        return total;
    }

    public int sumQueue(Queue<Integer> values) {
        int total = 0;
        while (!values.isEmpty()) {
            Integer value = values.remove();
            if (value != null) {
                total += value;
            }
        }
        return total;
    }

    public int mapSize(Map<String, Integer> values) {
        return values.size();
    }

    public int nestedListSize(List<List<Integer>> values) {
        return values.get(0).size() + values.get(1).size();
    }

    public int nestedMapListSize(List<Map<String, Integer>> values) {
        return values.get(0).size() + values.get(1).size();
    }

    public List<Object> cyclicCollectionResult() {
        List<Object> values = new ArrayList<>();
        values.add(1);
        values.add(values);
        return values;
    }

    public List<Integer> linkedListResult() {
        return new LinkedList<>(Arrays.asList(3, 1, 2));
    }

    public List<Integer> dequeResult() {
        ArrayDeque<Integer> deque = new ArrayDeque<>();
        deque.addLast(2);
        deque.addFirst(1);
        deque.addLast(3);
        return new ArrayList<>(deque);
    }

    public List<Integer> stackResult() {
        Stack<Integer> stack = new Stack<>();
        stack.push(1);
        stack.push(2);
        stack.push(3);
        return new ArrayList<>(stack);
    }

    public List<Integer> priorityQueueResult() {
        PriorityQueue<Integer> queue = new PriorityQueue<>();
        queue.add(3);
        queue.add(1);
        queue.add(2);

        List<Integer> result = new ArrayList<>();

        while (!queue.isEmpty()) {
            result.add(queue.remove());
        }

        return result;
    }

    public List<List<Integer>> nestedCollectionsResult() {
        return Arrays.asList(
            Arrays.asList(1, 2),
            new LinkedList<>(Arrays.asList(3, 4))
        );
    }

    public List<Integer> nullCollectionResult() {
        List<Integer> values = new ArrayList<>();
        values.add(1);
        values.add(null);
        values.add(3);
        return values;
    }

    static class Node {
        int value;
        Node next;

        Node() {
        }

        Node(int value) {
            this.value = value;
        }

        @Override
        public String toString() {
            return "Node(" + value + ")";
        }
    }

    public List<Node> objectCollectionResult() {
        return Arrays.asList(
            new Node(1),
            new Node(2)
        );
    }

    public int linkNodes() {
        Node a = new Node(1);
        Node b = new Node(2);
        a.next = b;
        a.value = 7;
        return a.next.value + a.value;
    }

    public String objectOverload(Object value) {
        return "object";
    }

    public String objectOverload(Node value) {
        return "node";
    }

    static class BaseNode {
        private int value;

        BaseNode() {
        }

        int getValue() {
            return value;
        }
    }

    static class ChildNode extends BaseNode {
        ChildNode() {
        }
    }

    public int inheritedField(ChildNode value) {
        return value.getValue();
    }

    public List<int[]> arrayCollectionResult() {
        return Arrays.asList(
            new int[]{1, 2},
            new int[]{3, 4}
        );
    }
}
`;

const cases: Case[] = [
    {
        name: "zero arguments",
        source,
        method: "zero",
        expectedKind: "OK",
        expectedResult: "42"
    },
    {
        name: "static method",
        source,
        method: "add",
        args: ["2", "3"],
        expectedKind: "OK",
        expectedResult: "5"
    },
    {
        name: "empty array",
        source,
        method: "sum",
        args: ["[]"],
        expectedKind: "OK",
        expectedResult: "0"
    },
    {
        name: "one dimensional array",
        source,
        method: "sum",
        args: ["[1,2,3]"],
        expectedKind: "OK",
        expectedResult: "6",
        requiredTraceTypes: [
            "METHOD_ENTER",
            "STEP",
            "METHOD_EXIT"
        ]
    },
    {
        name: "nested jagged array with null row",
        source,
        method: "sum2",
        args: ["[[1,2],null,[],[3]]"],
        expectedKind: "OK",
        expectedResult: "6"
    },
    {
        name: "null reference argument",
        source,
        method: "nullable",
        args: ["null"],
        expectedKind: "OK",
        expectedResult: "1"
    },
    {
        name: "overload selection",
        source,
        method: "over",
        args: ["7"],
        expectedKind: "OK",
        expectedResult: "\"int\""
    },
    {
        name: "helper method call",
        source,
        method: "helperCall",
        args: ["9"],
        expectedKind: "OK",
        expectedResult: "18"
    },
    {
        name: "recursion",
        source,
        method: "recursive",
        args: ["8"],
        expectedKind: "OK",
        expectedResult: "21",
        requiredTraceTypes: [
            "METHOD_ENTER",
            "METHOD_EXIT",
            "STEP"
        ]
    },
    {
        name: "collection result formatting",
        source,
        method: "listResult",
        expectedKind: "OK",
        expectedResult: "[1,2,3]"
    },
    {
        name: "nested collection result formatting",
        source: source.replace(
            "public List<Integer> listResult() {",
            "public List<List<Integer>> listResult() {"
        ).replace(
            "return Arrays.asList(1, 2, 3);",
            "return Arrays.asList(Arrays.asList(1, 2), Arrays.asList(3, 4));"
        ),
        method: "listResult",
        expectedKind: "OK",
        expectedResult: "[[1,2],[3,4]]"
    },
    {
        name: "tree set result formatting",
        source: source.replace(
            "public List<Integer> listResult() {",
            "public Set<Integer> listResult() {"
        ).replace(
            "return Arrays.asList(1, 2, 3);",
            "return new TreeSet<>(Arrays.asList(3, 1, 2));"
        ),
        method: "listResult",
        expectedKind: "OK",
        expectedResult: "[1,2,3]"
    },
    {
        name: "tree map result formatting",
        source: source.replace(
            "public List<Integer> listResult() {",
            "public Map<String, Integer> listResult() {"
        ).replace(
            "return Arrays.asList(1, 2, 3);",
            "Map<String,Integer> map = new TreeMap<>(); map.put(\"b\",2); map.put(\"a\",1); return map;"
        ),
        method: "listResult",
        expectedKind: "OK",
        expectedResult: "{\"a\":1,\"b\":2}"
    },
    {
        name: "list input parsing",
        source,
        method: "sumList",
        args: ["[1,null,3]"],
        expectedKind: "OK",
        expectedResult: "4"
    },
    {
        name: "queue input parsing",
        source,
        method: "sumQueue",
        args: ["[1,2,3]"],
        expectedKind: "OK",
        expectedResult: "6"
    },
    {
        name: "map input parsing",
        source,
        method: "mapSize",
        args: ["{\"a\":1,\"b\":2}"],
        expectedKind: "OK",
        expectedResult: "2"
    },
    {
        name: "nested collection input parsing",
        source,
        method: "nestedListSize",
        args: ["[[1,2],[3,4,5]]"],
        expectedKind: "OK",
        expectedResult: "5"
    },
    {
        name: "nested map collection input parsing",
        source,
        method: "nestedMapListSize",
        args: ["[{\"a\":1,\"b\":2},{\"c\":3}]"],
        expectedKind: "OK",
        expectedResult: "3"
    },
    {
        name: "cyclic collection formatting",
        source,
        method: "cyclicCollectionResult",
        expectedKind: "OK",
        expectedResult: "[1,\"<cycle>\"]"
    },
    {
        name: "linked list result formatting",
        source,
        method: "linkedListResult",
        expectedKind: "OK",
        expectedResult: "[3,1,2]"
    },
    {
        name: "array deque result formatting",
        source,
        method: "dequeResult",
        expectedKind: "OK",
        expectedResult: "[1,2,3]"
    },
    {
        name: "stack result formatting",
        source,
        method: "stackResult",
        expectedKind: "OK",
        expectedResult: "[1,2,3]"
    },
    {
        name: "priority queue result formatting",
        source,
        method: "priorityQueueResult",
        expectedKind: "OK",
        expectedResult: "[1,2,3]"
    },
    {
        name: "nested collections result formatting",
        source,
        method: "nestedCollectionsResult",
        expectedKind: "OK",
        expectedResult: "[[1,2],[3,4]]"
    },
    {
        name: "collection containing null",
        source,
        method: "nullCollectionResult",
        expectedKind: "OK",
        expectedResult: "[1,null,3]"
    },
    {
        name: "collection containing objects",
        source,
        method: "objectCollectionResult",
        expectedKind: "OK",
        expectedResult: "[\"Node(1)\",\"Node(2)\"]"
    },
    {
        name: "collection containing arrays",
        source,
        method: "arrayCollectionResult",
        expectedKind: "OK",
        expectedResult: "[[1,2],[3,4]]"
    },
    {
        name: "object field mutations",
        source,
        method: "linkNodes",
        expectedKind: "OK",
        expectedResult: "9",
        requiredTraceTypes: [
            "OBJECT_FIELD_WRITE"
        ]
    },
    {
        name: "structured object overload selection",
        source,
        method: "objectOverload",
        args: ["{\"value\":7}"],
        expectedKind: "OK",
        expectedResult: "\"node\""
    },
    {
        name: "inherited private object field parsing",
        source,
        method: "inheritedField",
        args: ["{\"value\":37}"],
        expectedKind: "OK",
        expectedResult: "37"
    },
    {
        name: "array reference capture",
        source,
        method: "sideEffectWrite",
        args: ["[1,2,3]"],
        expectedKind: "OK",
        expectedResult: "10",
        requiredTraceTypes: [
            "ARRAY_REFERENCE",
            "ARRAY_WRITE"
        ]
    },
    {
        name: "side effect array index write",
        source,
        method: "sideEffectWrite",
        args: ["[1,2,3]"],
        expectedKind: "OK",
        expectedResult: "10",
        requiredTraceTypes: [
            "ARRAY_WRITE"
        ]
    },
    {
        name: "post increment array write",
        source,
        method: "postIncrementWrite",
        args: ["[1,2,3]"],
        expectedKind: "OK",
        expectedResult: "3",
        requiredTraceTypes: [
            "ARRAY_WRITE"
        ]
    },
    {
        name: "nested array write",
        source,
        method: "nestedWrite",
        args: ["[[1,2],[3,4]]"],
        expectedKind: "OK",
        expectedResult: "8",
        requiredTraceTypes: [
            "ARRAY_WRITE"
        ]
    },
    {
        name: "simple array index read semantics",
        source,
        method: "readIndex",
        args: ["[4,8,15]", "1"],
        expectedKind: "OK",
        expectedResult: "8"
    },
    {
        name: "post increment index read semantics",
        source,
        method: "postIncrementRead",
        args: ["[4,8,15]"],
        expectedKind: "OK",
        expectedResult: "5"
    },
    {
        name: "method call index read semantics",
        source,
        method: "functionIndexRead",
        args: ["[4,8,15]"],
        expectedKind: "OK",
        expectedResult: "8"
    },
    {
        name: "nested array index read semantics",
        source,
        method: "nestedIndexRead",
        args: ["[[1,2],[3,4]]", "1", "0"],
        expectedKind: "OK",
        expectedResult: "3"
    },
    {
        name: "array alias index read semantics",
        source,
        method: "aliasIndexRead",
        args: ["[4,8,15]", "2"],
        expectedKind: "OK",
        expectedResult: "15"
    },
    {
        name: "runtime exception",
        source,
        method: "boom",
        expectedKind: "RUNTIME_ERROR",
        expectedErrorType:
            "java.lang.ArrayIndexOutOfBoundsException",
        requiredTraceTypes: [
            "ERROR"
        ]
    },
    {
        name: "compile error",
        source:
            "class Solution { public int broken( { return 1; } }",
        method: "broken",
        expectedKind: "COMPILATION_ERROR"
    },
    {
        name: "timeout",
        source:
            "class Solution { public int loop() { while (true) {} } }",
        method: "loop",
        expectedKind: "TIMEOUT"
    }
];

const validationCases = [
    {
        name: "missing testcase method",
        source: "class Solution { public int ok() { return 1; } }",
        testcase: undefined,
        expectedMessage: "testcase.method is required"
    },
    {
        name: "non-array testcase arguments",
        source: "class Solution { public int ok() { return 1; } }",
        testcase: { method: "ok", arguments: "1" as unknown as string[] },
        expectedMessage: "testcase.arguments must be an array of strings"
    },
    {
        name: "non-string testcase argument",
        source: "class Solution { public int ok(int value) { return value; } }",
        testcase: { method: "ok", arguments: [1 as unknown as string] },
        expectedMessage: "every testcase argument must be a string"
    }
];

for (const test of validationCases) {
    const result = await runJava(test.source, test.testcase);

    assert(
        result.kind === "VALIDATION_ERROR",
        test.name + " did not return VALIDATION_ERROR"
    );
    assert(
        result.message === test.expectedMessage,
        test.name + " returned the wrong validation message"
    );
}

let failures = 0;

for (const test of cases) {
    const result =
        await runJava(
            test.source,
            {
                method: test.method,
                ...(test.args === undefined
                    ? {}
                    : { arguments: test.args })
            }
        );

    const kindMatches =
        result.kind ===
        test.expectedKind;

    const resultMatches =
        test.expectedResult === undefined ||
        result.result ===
            test.expectedResult;

    const errorMatches =
        test.expectedErrorType === undefined ||
        result.errorType ===
            test.expectedErrorType;

    const traceTypes =
        new Set(
            result.trace?.events.map(
                (event) => event.type
            ) ?? []
        );

    const traceMatches =
        test.requiredTraceTypes === undefined ||
        test.requiredTraceTypes.every(
            (type) =>
                traceTypes.has(
                    type as any
                )
        );

    let entryStateMatches = true;

    if (test.name === "one dimensional array") {
        const entry = result.trace?.events.find(
            (event) =>
                event.type === "METHOD_ENTER" &&
                event.method === "sum"
        );

        const entryVariables = entry?.data?.variables;

        entryStateMatches =
            !!entry &&
            !!entryVariables &&
            typeof entryVariables === "object" &&
            !Array.isArray(entryVariables) &&
            !!(entryVariables as Record<string, unknown>).values;

        if (
            result.trace?.events.some(
                (event) =>
                    event.method === "<init>" ||
                    event.method === "<clinit>"
            )
        ) {
            entryStateMatches = false;
        }
    }

    if (
        kindMatches &&
        resultMatches &&
        errorMatches &&
        traceMatches &&
        entryStateMatches
    ) {
        console.log(
            "PASS:",
            test.name
        );
        continue;
    }

    failures++;

    console.error(
        "FAIL:",
        test.name,
        {
            expectedKind:
                test.expectedKind,
            actualKind:
                result.kind,
            expectedResult:
                test.expectedResult,
            actualResult:
                result.result,
            expectedErrorType:
                test.expectedErrorType,
            actualErrorType:
                result.errorType,
            requiredTraceTypes:
                test.requiredTraceTypes,
            actualTraceTypes:
                [...traceTypes],
            entryStateMatches,
            stderr:
                result.stderr
        }
    );
}

if (failures > 0) {
    process.exitCode = 1;

    throw new Error(
        failures +
        " Java runtime smoke test(s) failed"
    );
}

console.log(
    "All Java runtime smoke tests passed."
);
