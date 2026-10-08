import { enrichTrace } from "../src/execution/trace/enrichTrace.js";
import type { ExecutionTrace } from "../src/execution/trace/schema.js";

const source = [
    "class Solution {",
    "    boolean test(char[] S, int a) {",
    "        if (!Character.isLetterOrDigit(S[a])) {",
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
        }
    ]
};

const enriched = enrichTrace(trace, source);
const results = enriched.events
    .filter((event) => event.type === "STEP")
    .map((event) => event.data?.conditionResult);

if (results.length !== 2 || results[0] !== false || results[1] !== true) {
    throw new Error(
        "Character negation condition evaluation is incorrect: " +
        JSON.stringify(results)
    );
}

console.log("condition evaluator regression passed");
