import { buildStates } from "../src/execution/trace/stateBuilder.js";
import type {
    ExecutionTrace,
    TraceState
} from "../src/execution/trace/schema.js";

function stateAt(
    states: TraceState[],
    index: number
): TraceState {
    const state = states[index];

    if (!state) {
        throw new Error(`missing replay state at index ${index}`);
    }

    return state;
}

const trace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "PROGRAM_START",
            line: 1
        },
        {
            sequence: 2,
            type: "METHOD_ENTER",
            line: 2,
            method: "twoSum",
            depth: 0
        },
        {
            sequence: 3,
            type: "VARIABLE_UPDATE",
            line: 3,
            method: "twoSum",
            data: {
                name: "left",
                value: 0
            }
        },
        {
            sequence: 4,
            type: "ARRAY_WRITE",
            line: 4,
            data: {
                name: "nums",
                values: [2, 7, 11]
            }
        },
        {
            sequence: 5,
            type: "METHOD_ENTER",
            line: 5,
            method: "helper",
            depth: 1
        },
        {
            sequence: 6,
            type: "METHOD_EXIT",
            line: 6,
            method: "helper",
            depth: 1
        },
        {
            sequence: 7,
            type: "ERROR",
            line: 7,
            data: {
                type: "IndexOutOfBoundsException",
                message: "index 3"
            }
        },
        {
            sequence: 8,
            type: "STEP",
            line: 8,
            method: "twoSum",
            depth: 1,
            data: {
                variables: {
                    left: 1,
                    nums: {
                        $arrayId: "41",
                        $type: "int[]",
                        values: [2, 7, 11]
                    },
                    node: {
                        $objectId: "99",
                        $type: "Solution$Node",
                        fields: {
                            val: 7,
                            next: {
                                $objectId: "99",
                                $type: "Solution$Node",
                                $ref: "99"
                            }
                        }
                    }
                }
            }
        }
    ]
};

const states = buildStates(trace);

if (states.length !== 6) {
    throw new Error("only execution checkpoint events should become replay states");
}

const state1 = stateAt(states, 1);

if (JSON.stringify(state1.callStack) !== JSON.stringify(["twoSum"])) {
    throw new Error("method entry checkpoint was not replayed");
}

const replayedNums =
    stateAt(states, 5).arrays.nums as {
        values?: unknown[];
    };

if (
    JSON.stringify(replayedNums.values) !==
    JSON.stringify([2, 7, 11])
) {
    throw new Error("array state was not replayed");
}

if (
    JSON.stringify(stateAt(states, 2).callStack) !==
    JSON.stringify(["twoSum"])
) {
    throw new Error("method enter/exit stack was not replayed");
}

if (
    stateAt(states, 4).error?.type !==
    "IndexOutOfBoundsException"
) {
    throw new Error("error state was not replayed");
}

if (
    stateAt(states, 5).variables.left !== 1
) {
    throw new Error("STEP variables were not hydrated");
}

const nums =
    stateAt(states, 5).arrays.nums as {
        objectId?: string;
        values?: unknown[];
    };

if (
    nums.objectId !== "41" ||
    JSON.stringify(nums.values) !==
        JSON.stringify([2, 7, 11])
) {
    throw new Error("STEP array snapshot was not hydrated");
}

if (
    !stateAt(states, 5).objects["99"]
) {
    throw new Error("object identity snapshot was not hydrated");
}

console.log("PASS: trace state builder");
