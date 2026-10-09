import { enrichTrace, evaluateCondition } from "../src/execution/trace/enrichTrace.js";
import type { ExecutionTrace } from "../src/execution/trace/schema.js";

const source = [
    "class Solution {",
    "    boolean test(char[] S, int a) {",
    "        if (!Character.isLetterOrDigit(S[a])) {",
    "            return false;",
    "        }",
    "        return true;",
    "    }",
    "    boolean valid(Stack<Character> st, char ch) {",
    "        if (ch == '(' || ch == '{' || ch == '[') {",
    "            return true;",
    "        }",
    "        if (st.isEmpty()) return false;",
    "        if (st.peek() == '(' && ch != ')' || st.peek() == '{' && ch != '}' || st.peek() == '[' && ch != ']') {",
    "            return false;",
    "        }",
    "        return true;",
    "    }",
    "}"
].join("\n");

const trace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 3,
            method: "test",
            depth: 1,
            data: {
                variables: {
                    a: 0,
                    S: {
                        $arrayId: "chars",
                        $type: "char[]",
                        values: ["A"]
                    }
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 3,
            method: "test",
            depth: 1,
            data: {
                variables: {
                    a: 0,
                    S: {
                        $arrayId: "chars",
                        $type: "char[]",
                        values: [" "]
                    }
                }
            }
        },
        {
            sequence: 3,
            type: "STEP",
            line: 9,
            method: "valid",
            depth: 1,
            data: {
                variables: {
                    ch: "(",
                    st: {
                        $collectionId: "stack-1",
                        $type: "java.util.Stack",
                        $kind: "stack",
                        values: []
                    }
                }
            }
        },
        {
            sequence: 4,
            type: "STEP",
            line: 13,
            method: "valid",
            depth: 1,
            data: {
                variables: {
                    ch: "]",
                    st: {
                        $collectionId: "stack-1",
                        $type: "java.util.Stack",
                        $kind: "stack",
                        values: ["(", "{", "(", "{", "[", "{"]
                    }
                }
            }
        }
    ]
};

const directChar = evaluateCondition(
    "ch == '(' || ch == '{' || ch == '['",
    { ch: "(" }
);
const directPeek = evaluateCondition(
    "st.peek() == '{'",
    {
        ch: "]",
        st: {
            $collectionId: "stack-1",
            $type: "java.util.Stack",
            $kind: "stack",
            values: ["(", "{"]
        }
    }
);
const directCharNotParen = evaluateCondition("ch != ')'", { ch: "]" });
const directPeekFalse = evaluateCondition(
    "st.peek() == '('",
    {
        st: {
            $collectionId: "stack-1",
            $type: "java.util.Stack",
            $kind: "stack",
            values: ["(", "{"]
        }
    }
);

const directFalseAnd = evaluateCondition(
    "st.peek() == '(' && ch != ')'",
    {
        ch: "]",
        st: {
            $collectionId: "stack-1",
            $type: "java.util.Stack",
            $kind: "stack",
            values: ["(", "{"]
        }
    }
);
const directAnd = evaluateCondition(
    "st.peek() == '{' && ch != '}'",
    {
        ch: "]",
        st: {
            $collectionId: "stack-1",
            $type: "java.util.Stack",
            $kind: "stack",
            values: ["(", "{"]
        }
    }
);
const directTwoClauses = evaluateCondition(
    "st.peek() == '(' && ch != ')' || st.peek() == '{' && ch != '}'",
    {
        ch: "]",
        st: {
            $collectionId: "stack-1",
            $type: "java.util.Stack",
            $kind: "stack",
            values: ["(", "{"]
        }
    }
);
const directFullPeekCondition = evaluateCondition(
    "st.peek() == '(' && ch != ')' || st.peek() == '{' && ch != '}' || st.peek() == '[' && ch != ']'",
    {
        ch: "]",
        st: {
            $collectionId: "stack-1",
            $type: "java.util.Stack",
            $kind: "stack",
            values: ["(", "{", "(", "{", "[", "{"]
        }
    }
);
if (
    directChar !== true ||
    directPeek !== true ||
    directCharNotParen !== true ||
    directPeekFalse !== false ||
    directFalseAnd !== false ||
    directAnd !== true ||
    directTwoClauses !== true ||
    directFullPeekCondition !== true
) {
    throw new Error(
        "Direct condition evaluator regression: " +
        JSON.stringify({ directChar, directPeek, directCharNotParen, directPeekFalse, directFalseAnd, directAnd, directTwoClauses, directFullPeekCondition })
    );
}

const enriched = enrichTrace(trace, source);
const results = enriched.events
    .filter((event) => event.type === "STEP")
    .map((event) => event.data?.conditionResult);

const expected = [false, true, true, true];
if (
    results.length !== expected.length ||
    results.some((result, index) => result !== expected[index])
) {
    throw new Error(
        "Generic condition evaluation is incorrect: " +
        JSON.stringify({ results, expected })
    );
}


const elseIfSource = [
    "class Solution {",
    "    int search(int[] nums, int target, int mid) {",
    "        if (nums[mid] == target) {",
    "        }else if(nums[mid] < target){",
    "            return -1;",
    "        }",
    "        return -1;",
    "    }",
    "}"
].join("\n");
const elseIfTrace: ExecutionTrace = {
    version: 1,
    events: [{
        sequence: 1,
        type: "STEP",
        line: 4,
        method: "search",
        depth: 1,
        data: {
            variables: {
                nums: { $arrayId: "nums-1", $type: "int[]", values: [-1, 0, 3, 5, 9, 12] },
                target: 9,
                mid: 2
            },
            executionEvents: [{
                sequence: 0,
                type: "ARRAY_ACCESS",
                line: 4,
                method: "search",
                depth: 1,
                data: { name: "nums", arrayId: "nums-1", indices: [2], value: 3, kind: "read" }
            }]
        }
    }]
};
const elseIfResult = enrichTrace(elseIfTrace, elseIfSource).events[0]?.data?.conditionResult;
if (elseIfResult !== true) {
    throw new Error("else-if condition was not evaluated: " + JSON.stringify({ elseIfResult }));
}

console.log("condition evaluator regression passed");
