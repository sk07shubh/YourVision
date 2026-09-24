import type { ExecutionEvent, ExecutionTrace } from "../src/execution/trace/schema.js";
import { buildStates } from "../src/execution/trace/stateBuilder.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

function event(sequence: number, type: ExecutionEvent["type"], data: Record<string, unknown>, method = "solve"): ExecutionEvent {
    return { sequence, type, method, depth: 0, line: sequence, data };
}

const trace: ExecutionTrace = {
    version: 1,
    events: [
        event(1, "METHOD_ENTER", {
            variables: {
                nums: { $arrayId: "a1", $type: "int[]", values: [1, 2, 3] },
                target: 3
            }
        }),
        event(2, "STEP", {
            variables: {
                i: 0,
                nums: { $arrayId: "a1", $type: "int[]", values: [1, 2, 3] },
                node: { $objectId: "o1", $type: "Node", fields: { value: 5 } }
            }
        }),
        event(3, "ARRAY_WRITE", {
            name: "nums",
            objectId: "a1",
            values: [1, 9, 3],
            changes: [{ indices: [1], before: 2, after: 9 }]
        }),
        event(4, "OBJECT_FIELD_WRITE", {
            objectId: "o1",
            value: { $objectId: "o1", $type: "Node", fields: { value: 7 } }
        }),
        event(5, "METHOD_ENTER", {}, "helper"),
        event(6, "METHOD_EXIT", {
            callerLine: 7,
            callerMethod: "solve",
            callerVariables: {
                i: 1,
                nums: { $arrayId: "a1", $type: "int[]", values: [1, 9, 3] },
                target: 3
            }
        }, "helper"),
        event(7, "STEP", {
            variables: {
                i: 1,
                nums: { $arrayId: "a1", $type: "int[]", values: [1, 9, 3] },
                target: 3
            }
        })
    ]
};

const states = buildStates(trace);
assert(states.length === 4, "replay state count must match visible checkpoints");
assert(states[0]?.lastEvent?.type === "METHOD_ENTER", "method entry must be visible");
assert(states[1]?.arrays.nums !== undefined, "STEP must hydrate named arrays");
assert(states[2]?.lastEvent?.type === "METHOD_ENTER", "nested method entry must be replayable");
assert(states[2]?.callStack.join("/") === "solve/helper", "nested call stack replay is incorrect");
assert(states[3]?.lastEvent?.type === "METHOD_EXIT", "method return must be replayable");
assert(states[3]?.line === 7 && states[3]?.method === "solve", "caller location was not restored");
assert(states[3]?.callStack.join("/") === "solve", "caller stack was not restored");


const replay = buildStates(trace);
assert(JSON.stringify(states) === JSON.stringify(replay), "state replay is not deterministic");

const independent: ExecutionTrace = {
    version: 1,
    events: [
        event(1, "STEP", { variables: { value: 42 } }),
        event(2, "PROGRAM_END", {})
    ]
};
const independentStates = buildStates(independent);
assert(independentStates[0]?.variables.value === 42, "independent replay failed");
assert(Object.keys(independentStates[0]?.arrays ?? {}).length === 0, "independent replay inherited arrays");

console.log("PASS: trace replay - deterministic visible checkpoints");
