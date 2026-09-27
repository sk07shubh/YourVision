import { runJava } from "../src/execution/java/runner.js";

const source = `
class Solution {
    public int repeatSameLine() {
        int visits = 0;
        while (visits++ < 3) continue;
        return visits;
    }
}
`;

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

const result = await runJava(source, {
    method: "repeatSameLine",
    arguments: []
});

const loopLine = source.split("\n").findIndex((line) => line.includes("while")) + 1;
const repeatedSteps = result.trace?.events.filter(
    (event) => event.type === "STEP" && event.line === loopLine
) ?? [];
assert(result.success && result.result === "4", `Minimal loop did not return 4: ${JSON.stringify({ kind: result.kind, result: result.result, message: result.message, stderr: result.stderr })}`);
assert(repeatedSteps.length === 4, `Expected four real condition visits, got ${repeatedSteps.length}`);

const visitValues = repeatedSteps.map((event) => {
    const variables = event.data?.variables as Record<string, unknown> | undefined;
    return variables?.visits;
});
assert(
    JSON.stringify(visitValues) === JSON.stringify([0, 1, 2, 3]),
    `Expected each condition visit's pre-increment value, got ${JSON.stringify(visitValues)}`
);
assert(
    Boolean(result.trace?.events.some((event) => event.type === "METHOD_ENTER" && event.data?.displayLine === 3)),
    "Method entry location changed"
);
assert(
    Boolean(result.trace?.events.some((event) => event.type === "METHOD_EXIT" && event.line === 6)),
    "Actual return-line location changed"
);

console.log("PASS same-line loop records all four genuine condition visits at the exact source line");
