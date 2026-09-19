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

if (states.length !== trace.events.length) {
    throw new Error("one replay state must exist per event");
}

const state2 = stateAt(states, 2);

if (state2.variables.left !== 0) {
    throw new Error("variable update was not replayed");
}

const replayedNums =
    stateAt(states, 3).arrays.nums as {
        values?: unknown[];
    };

if (
    JSON.stringify(replayedNums.values) !==
    JSON.stringify([2, 7, 11])
) {
    throw new Error("array state was not replayed");
}

if (
    JSON.stringify(stateAt(states, 5).callStack) !==
    JSON.stringify(["twoSum"])
) {
    throw new Error("method enter/exit stack was not replayed");
}

if (
    stateAt(states, 6).error?.type !==
    "IndexOutOfBoundsException"
) {
    throw new Error("error state was not replayed");
}

if (
    stateAt(states, 7).variables.left !== 1
) {
    throw new Error("STEP variables were not hydrated");
}

const nums =
    stateAt(states, 7).arrays.nums as {
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
    !stateAt(states, 7).objects["99"]
) {
    throw new Error("object identity snapshot was not hydrated");
}

console.log("PASS: trace state builder");
