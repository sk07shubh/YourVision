import { runJava } from "../src/execution/java/runner.js";

type Case = {
    name: string;
    source: string;
    method: string;
    args?: string[];
    expectedKind: string;
    expectedResult?: string;
    expectedErrorType?: string;
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

    public List<Integer> listResult() {
        return Arrays.asList(1, 2, 3);
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
        expectedResult: "6"
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
        expectedResult: "21"
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
        name: "runtime exception",
        source,
        method: "boom",
        expectedKind: "RUNTIME_ERROR",
        expectedErrorType:
            "java.lang.ArrayIndexOutOfBoundsException"
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

let failures = 0;

for (const test of cases) {
    const result =
        await runJava(
            test.source,
            {
                method: test.method,
                arguments: test.args
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

    if (
        kindMatches &&
        resultMatches &&
        errorMatches
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
