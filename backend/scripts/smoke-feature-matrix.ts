import { enrichTrace } from "../src/execution/trace/enrichTrace.js";
import type { ExecutionTrace } from "../src/execution/trace/schema.js";

type Case = {
    name: string;
    sourceLine: string;
    variables: Record<string, unknown>;
    expected: boolean;
};

function runCase(testCase: Case): void {
    const source = [
        "class Solution {",
        "    boolean check() {",
        "        " + testCase.sourceLine,
        "        return false;",
        "    }",
        "}"
    ].join("\n");

    const trace: ExecutionTrace = {
        version: 1,
        events: [{
            sequence: 1,
            type: "STEP",
            line: 3,
            method: "check",
            depth: 1,
            data: { variables: testCase.variables }
        }]
    };

    const result = enrichTrace(trace, source).events[0]?.data?.conditionResult;
    if (result !== testCase.expected) {
        throw new Error(
            testCase.name +
            ": expected " + String(testCase.expected) +
            ", got " + String(result) +
            " for " + testCase.sourceLine
        );
    }
}

function snapshotArray(id: string, values: unknown[]) {
    return { $arrayId: id, $type: "Object[]", values };
}

function snapshotMap(id: string, entries: Array<{ key: unknown; value: unknown }>) {
    return {
        $mapId: id,
        $type: "java.util.HashMap",
        size: entries.length,
        entries
    };
}

function snapshotCollection(id: string, kind: string, values: unknown[]) {
    return {
        $collectionId: id,
        $kind: kind,
        $type: "java.util." + kind,
        size: values.length,
        values
    };
}

const cases: Case[] = [
    // Primitive operators and precedence.
    { name: "less-than", sourceLine: "if (x < 5)", variables: { x: 4 }, expected: true },
    { name: "less-than-false", sourceLine: "if (x < 5)", variables: { x: 5 }, expected: false },
    { name: "less-equal", sourceLine: "if (x <= 5)", variables: { x: 5 }, expected: true },
    { name: "greater-than", sourceLine: "if (x > 5)", variables: { x: 6 }, expected: true },
    { name: "greater-equal", sourceLine: "if (x >= 5)", variables: { x: 5 }, expected: true },
    { name: "equal", sourceLine: "if (x == 5)", variables: { x: 5 }, expected: true },
    { name: "not-equal", sourceLine: "if (x != 5)", variables: { x: 6 }, expected: true },
    { name: "not", sourceLine: "if (!flag)", variables: { flag: false }, expected: true },
    { name: "double-not", sourceLine: "if (!!flag)", variables: { flag: true }, expected: true },
    { name: "and", sourceLine: "if (a && b)", variables: { a: true, b: true }, expected: true },
    { name: "and-false", sourceLine: "if (a && b)", variables: { a: true, b: false }, expected: false },
    { name: "or", sourceLine: "if (a || b)", variables: { a: false, b: true }, expected: true },
    { name: "or-false", sourceLine: "if (a || b)", variables: { a: false, b: false }, expected: false },
    { name: "precedence", sourceLine: "if (a || b && c)", variables: { a: false, b: true, c: true }, expected: true },
    { name: "parentheses", sourceLine: "if ((a || b) && c)", variables: { a: false, b: true, c: true }, expected: true },
    { name: "arithmetic", sourceLine: "if (x + 2 * y == 10)", variables: { x: 4, y: 3 }, expected: true },
    { name: "unary-minus", sourceLine: "if (-x < 0)", variables: { x: 2 }, expected: true },

    // Character literals and the exact Valid Parentheses shape that previously
    // produced CONDITION: —.
    { name: "char-or-open-paren", sourceLine: "if (ch == '(' || ch == '{' || ch == '[')", variables: { ch: "(" }, expected: true },
    { name: "char-or-open-brace", sourceLine: "if (ch == '(' || ch == '{' || ch == '[')", variables: { ch: "{" }, expected: true },
    { name: "char-or-open-bracket", sourceLine: "if (ch == '(' || ch == '{' || ch == '[')", variables: { ch: "[" }, expected: true },
    { name: "char-or-closing-bracket", sourceLine: "if (ch == '(' || ch == '{' || ch == '[')", variables: { ch: "]" }, expected: false },
    { name: "char-and-not", sourceLine: "if (ch == '(' && ch != ')')", variables: { ch: "(" }, expected: true },
    { name: "char-comparison", sourceLine: "if (ch != ')' && ch != ']')", variables: { ch: "{" }, expected: true },

    // Arrays, strings, and nested access.
    {
        name: "array-index",
        sourceLine: "if (nums[i] == target)",
        variables: { i: 1, target: 7, nums: snapshotArray("a", [2, 7, 11]) },
        expected: true
    },
    {
        name: "array-length",
        sourceLine: "if (nums.length > 2)",
        variables: { nums: snapshotArray("a", [2, 7, 11]) },
        expected: true
    },
    {
        name: "string-length-method",
        sourceLine: "if (s.length() == 3)",
        variables: { s: "abc" },
        expected: true
    },
    {
        name: "string-charAt",
        sourceLine: "if (s.charAt(i) == 'a')",
        variables: { s: "cat", i: 1 },
        expected: false
    },
    {
        name: "string-equals",
        sourceLine: "if (s.equals("abc"))",
        variables: { s: "abc" },
        expected: true
    },
    {
        name: "string-contains",
        sourceLine: "if (s.contains("bc"))",
        variables: { s: "abc" },
        expected: true
    },
    {
        name: "string-starts-with",
        sourceLine: "if (s.startsWith("ab"))",
        variables: { s: "abc" },
        expected: true
    },
    {
        name: "string-ends-with",
        sourceLine: "if (s.endsWith("bc"))",
        variables: { s: "abc" },
        expected: true
    },

    // Character utility methods, including negation.
    {
        name: "character-letter-or-digit",
        sourceLine: "if (Character.isLetterOrDigit(ch))",
        variables: { ch: "A" },
        expected: true
    },
    {
        name: "character-negated-letter-or-digit",
        sourceLine: "if (!Character.isLetterOrDigit(ch))",
        variables: { ch: " " },
        expected: true
    },
    {
        name: "character-is-digit",
        sourceLine: "if (Character.isDigit(ch))",
        variables: { ch: "7" },
        expected: true
    },
    {
        name: "character-is-letter",
        sourceLine: "if (Character.isLetter(ch))",
        variables: { ch: "A" },
        expected: true
    },
    {
        name: "character-is-whitespace",
        sourceLine: "if (Character.isWhitespace(ch))",
        variables: { ch: " " },
        expected: true
    },
    {
        name: "character-is-space-char",
        sourceLine: "if (Character.isSpaceChar(ch))",
        variables: { ch: " " },
        expected: true
    },
    {
        name: "character-lower-case",
        sourceLine: "if (Character.toLowerCase(ch) == 'a')",
        variables: { ch: "A" },
        expected: true
    },

    // Map / Set / Stack / Queue collection predicates and accessors.
    {
        name: "map-contains-key",
        sourceLine: "if (mp.containsKey(7))",
        variables: { mp: snapshotMap("m", [{ key: 2, value: 0 }, { key: 7, value: 1 }]) },
        expected: true
    },
    {
        name: "map-get",
        sourceLine: "if (mp.get(7) == 1)",
        variables: { mp: snapshotMap("m", [{ key: 7, value: 1 }]) },
        expected: true
    },
    {
        name: "map-contains-value",
        sourceLine: "if (mp.containsValue(1))",
        variables: { mp: snapshotMap("m", [{ key: 7, value: 1 }]) },
        expected: true
    },
    {
        name: "set-contains",
        sourceLine: "if (set.contains(7))",
        variables: { set: snapshotCollection("s", "HashSet", [2, 7]) },
        expected: true
    },
    {
        name: "set-is-empty-false",
        sourceLine: "if (!set.isEmpty())",
        variables: { set: snapshotCollection("s", "HashSet", [2]) },
        expected: true
    },
    {
        name: "stack-peek",
        sourceLine: "if (st.peek() == '(')",
        variables: { st: snapshotCollection("st", "Stack", ["(", "{"]) },
        expected: false
    },
    {
        name: "stack-peek-and",
        sourceLine: "if (!st.isEmpty() && st.peek() == '{')",
        variables: { st: snapshotCollection("st", "Stack", ["(", "{"]) },
        expected: true
    },

    // while/for condition extraction must use the actual condition clause.
    {
        name: "while-condition",
        sourceLine: "while (i < n)",
        variables: { i: 2, n: 5 },
        expected: true
    },
    {
        name: "for-condition",
        sourceLine: "for (int i = 0; i < n; i++)",
        variables: { i: 4, n: 4 },
        expected: false
    },
    {
        name: "for-condition-true",
        sourceLine: "for (int i = 0; i < n; i++)",
        variables: { i: 3, n: 4 },
        expected: true
    }
];

// Add a deterministic boolean-expression corpus so operator combinations are
// exercised rather than relying only on hand-picked examples.
for (const a of [false, true]) {
    for (const b of [false, true]) {
        for (const c of [false, true]) {
            cases.push({
                name: "boolean-corpus-" + Number(a) + Number(b) + Number(c),
                sourceLine: "if ((a || b) && !c)",
                variables: { a, b, c },
                expected: (a || b) && !c
            });
        }
    }
}

for (const testCase of cases) runCase(testCase);

console.log("PASS: comprehensive condition feature matrix (" + cases.length + " cases)");
