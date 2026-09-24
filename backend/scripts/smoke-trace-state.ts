import { buildStates } from "../src/execution/trace/stateBuilder.js";
import type { ExecutionTrace, TraceState } from "../src/execution/trace/schema.js";

function stateAt(states: TraceState[], index: number): TraceState {
    const state = states[index];
    if (!state) throw new Error(`missing replay state at index ${index}`);
    return state;
}

const trace: ExecutionTrace = {
    version: 1,
    events: [
        { sequence: 1, type: "PROGRAM_START", line: 1 },
        {
            sequence: 2,
            type: "METHOD_ENTER",
            line: 2,
            method: "twoSum",
            depth: 0,
            data: {
                variables: {
                    nums: { $arrayId: "41", $type: "int[]", values: [2, 7, 11] },
                    target: 9
                }
            }
        },
        {
            sequence: 3,
            type: "VARIABLE_UPDATE",
            line: 3,
            method: "twoSum",
            data: { name: "left", value: 0 }
        },
        {
            sequence: 4,
            type: "ARRAY_WRITE",
            line: 4,
            data: { name: "nums", values: [2, 7, 11] }
        },
        {
            sequence: 5,
            type: "METHOD_ENTER",
            line: 5,
            method: "helper",
            depth: 1,
            data: { variables: { value: 7 } }
        },
        {
            sequence: 6,
            type: "METHOD_EXIT",
            line: 6,
            method: "helper",
            depth: 1,
            data: {
                callerLine: 5,
                callerMethod: "twoSum",
                callerVariables: {
                    nums: { $arrayId: "41", $type: "int[]", values: [2, 7, 11] },
                    target: 9,
                    left: 0
                }
            }
        },
        {
            sequence: 7,
            type: "ERROR",
            line: 7,
            data: { type: "IndexOutOfBoundsException", message: "index 3" }
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
                    nums: { $arrayId: "41", $type: "int[]", values: [2, 7, 11] },
                    node: {
                        $objectId: "99",
                        $type: "Solution$Node",
                        fields: { val: 7, next: { $objectId: "99", $type: "Solution$Node", $ref: "99" } }
                    }
                }
            }
        }
    ]
};

const states = buildStates(trace);

if (states.length !== 5) throw new Error("only METHOD_ENTER, STEP, caller-return, and ERROR checkpoints should be replayable");

if (stateAt(states, 0).variables.target !== 9) throw new Error("method-entry arguments were not hydrated");
if (stateAt(states, 0).arrays.nums === undefined) throw new Error("method-entry array argument was not hydrated");
if (stateAt(states, 1).variables.left !== undefined) throw new Error("non-checkpoint variable update created a replay state");
if (stateAt(states, 2).line !== 5 || stateAt(states, 2).method !== "twoSum") throw new Error("method return did not restore the caller location");

const returnTrace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "METHOD_ENTER",
            line: 2,
            method: "maxArea",
            depth: 1,
            data: {
                variables: {
                    height: { $arrayId: "77", $type: "int[]", values: [1, 8, 6] }
                }
            }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 7,
            method: "maxArea",
            depth: 1,
            data: {
                variables: {
                    height: { $arrayId: "77", $type: "int[]", values: [1, 8, 6] },
                    a: 2,
                    b: 2
                }
            }
        },
        {
            sequence: 3,
            type: "METHOD_EXIT",
            line: 8,
            method: "maxArea",
            depth: 1,
            data: {
                returnValue: 8,
                variables: {
                    height: { $arrayId: "77", $type: "int[]", values: [1, 8, 6] },
                    a: 2,
                    b: 2
                }
            }
        }
    ]
};

const returnStates = buildStates(returnTrace);
if (returnStates.length !== 3 || stateAt(returnStates, 2).line !== 8) {
    throw new Error("top-level method return did not preserve the return statement line");
}

if (stateAt(states, 2).variables.left !== 0) throw new Error("caller variables were not restored on method return");
if (stateAt(states, 3).error?.type !== "IndexOutOfBoundsException") throw new Error("error state was not replayed");
if (stateAt(states, 4).variables.left !== 1) throw new Error("STEP variables were not hydrated");

const nums = stateAt(states, 4).arrays.nums as { objectId?: string; values?: unknown[] };
if (nums.objectId !== "41" || JSON.stringify(nums.values) !== JSON.stringify([2, 7, 11])) {
    throw new Error("STEP array snapshot was not hydrated");
}
if (!stateAt(states, 4).objects["99"]) throw new Error("object identity snapshot was not hydrated");

console.log("PASS: trace state builder");
