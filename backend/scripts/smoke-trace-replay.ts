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
        event(1, "METHOD_ENTER", {}),
        event(2, "STEP", {
            variables: {
                i: 0,
                nums: { $arrayId: "a1", $type: "int[]", values: [1, 2, 3], length: 3 },
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
        event(6, "METHOD_EXIT", {}, "helper"),
        event(7, "METHOD_EXIT", {}, "solve")
    ]
};

const states = buildStates(trace);
assert(states.length === 5, "only checkpoint events should become replay states");
assert(states[1]?.arrays.nums !== undefined, "STEP must hydrate named arrays");
assert(states[2]?.arrays.nums !== undefined, "folded ARRAY_WRITE must preserve array state");
assert(JSON.stringify(states[2]?.arrays.nums).includes("9"), "folded ARRAY_WRITE state did not contain updated value");
assert(states[2]?.objects.o1 !== undefined, "folded OBJECT_FIELD_WRITE must preserve object identity");
assert(states[2]?.callStack.join("/") === "solve/helper", "nested call stack replay is incorrect");
assert(states[3]?.callStack.join("/") === "solve", "forward unwind replay is incorrect");
assert(states[4]?.callStack.length === 0, "final call stack must be empty");

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
assert((independentStates[0]?.arrays !== undefined) && Object.keys(independentStates[0].arrays).length === 0, "independent replay inherited arrays");

console.log("PASS: trace replay - forward/backward-ready deterministic state reconstruction");
