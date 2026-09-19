import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

const source = `
class Solution {
    public int outerThrows() {
        return throwHelper();
    }

    private int throwHelper() {
        throw new IllegalArgumentException("nested bad input");
    }
}
`;

const result = await runJava(source, { method: "outerThrows" });

assert(result.kind === "RUNTIME_ERROR", "nested exception did not report RUNTIME_ERROR");
assert(
    result.states?.some(
        (state) =>
            state.callStack.includes("outerThrows") &&
            state.callStack.includes("throwHelper") &&
            state.error?.type === "java.lang.IllegalArgumentException"
    ) === true,
    "nested exception state did not preserve the throwing call stack"
);
assert(
    result.states?.at(-1)?.callStack.length === 0,
    "call stack was not fully unwound after an uncaught nested exception"
);

console.log("PASS: nested exception call-stack unwind");
