import { enrichTrace } from "../src/execution/trace/enrichTrace.js";
import { buildStates } from "../src/execution/trace/stateBuilder.js";
import type { ExecutionTrace } from "../src/execution/trace/schema.js";

const trace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "STEP",
            line: 4,
            method: "mutate",
            depth: 1,
            data: {
                variables: {
                    i: 0,
                    nums: {
                        $arrayId: "17",
                        $type: "int[]",
                        values: [1, 2, 3]
                    }
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 5,
            method: "mutate",
            depth: 1,
            data: {
                variables: {
                    i: 1,
                    nums: {
                        $arrayId: "17",
                        $type: "int[]",
                        values: [9, 2, 3]
                    }
                }
            }
        }
    ]
};

const enriched =
    enrichTrace(trace);

const types =
    enriched.events.map(
        (event) => event.type
    );

if (
    JSON.stringify(types) !==
    JSON.stringify([
        "STEP",
        "VARIABLE_UPDATE",
        "ARRAY_WRITE",
        "STEP"
    ])
) {
    throw new Error(
        "unexpected enriched event order: " +
        JSON.stringify(types)
    );
}

const write =
    enriched.events.find(
        (event) =>
            event.type ===
            "ARRAY_WRITE"
    );

const changes =
    write?.data?.changes as
        Array<{
            indices: number[];
            before: unknown;
            after: unknown;
        }> | undefined;

if (
    !changes ||
    changes.length !== 1 ||
    JSON.stringify(
        changes[0].indices
    ) !== "[0]" ||
    changes[0].before !== 1 ||
    changes[0].after !== 9
) {
    throw new Error(
        "array mutation was not derived correctly"
    );
}

const states =
    buildStates(enriched);

const writeState =
    states.find(
        (state) =>
            state.lastEvent?.type ===
            "ARRAY_WRITE"
    );

const nums =
    writeState?.arrays.nums as
        | {
            objectId?: string;
            values?: unknown[];
        }
        | undefined;

if (
    nums?.objectId !== "17" ||
    JSON.stringify(nums.values) !==
        "[9,2,3]"
) {
    throw new Error(
        "array identity or values were lost during replay"
    );
}

console.log(
    "PASS: trace enrichment"
);
