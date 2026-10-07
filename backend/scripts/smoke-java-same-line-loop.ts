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

const integrationSource = `
class Solution {
    public int run() {
        int result = helper();
        return result;
    }
    private int helper() {
        int visits = 0;
        int[] history = new int[3];
        while (visits++ < 3) history[visits - 1] = visits;
        return visits;
    }
}
`;
const integration = await runJava(integrationSource, {
    method: "run",
    arguments: []
});
const integrationLoopLine = integrationSource.split("\n").findIndex(line => line.includes("while")) + 1;
const integrationReturnLine = integrationSource.split("\n").findIndex(line => line.includes("return visits")) + 1;
const integrationCallLine = integrationSource.split("\n").findIndex(line => line.includes("int result = helper")) + 1;
const integrationLoopEvents = integration.trace?.events.filter(
    event => event.type === "STEP" && event.method === "helper" && event.line === integrationLoopLine
) ?? [];
const integrationLoopStates = integration.states?.filter(
    state => state.method === "helper" && state.lastEvent?.type === "STEP" && state.lastEvent.line === integrationLoopLine
) ?? [];
assert(
    integration.success && integration.result === "4",
    `Call/loop integration did not return 4: ${JSON.stringify({ kind: integration.kind, result: integration.result, message: integration.message })}`
);
assert(integrationLoopEvents.length === 4, `Expected four live JDI loop checkpoints, got ${integrationLoopEvents.length}`);
assert(integrationLoopStates.length === 4, `Expected all four loop checkpoints in stateBuilder, got ${integrationLoopStates.length}`);
assert(
    JSON.stringify(integrationLoopEvents.map(event => (event.data?.variables as Record<string, unknown> | undefined)?.visits)) === JSON.stringify([0, 1, 2, 3]),
    "The live JDI loop snapshots do not represent each pre-increment condition visit"
);
assert(
    JSON.stringify(integrationLoopStates.map(state => state.variables.visits)) === JSON.stringify([1, 2, 3, 4]),
    "stateBuilder did not attach each loop line to its post-execution state"
);
assert(
    JSON.stringify(integrationLoopStates.map(state => (state.arrays.history as { values?: unknown[] } | undefined)?.values)) ===
        JSON.stringify([[1, 0, 0], [1, 2, 0], [1, 2, 3], [1, 2, 3]]),
    "The post-line array state did not advance with each same-line iteration"
);
const helperExit = integration.states?.find(state => state.method === "helper" && state.lastEvent?.type === "METHOD_EXIT");
assert(helperExit?.line === integrationReturnLine, `Expected helper return statement line ${integrationReturnLine}, got ${helperExit?.line}`);
assert(helperExit?.variables.visits === 4, "The helper return state lost its final local variables");
const callerResume = integration.states?.find(state => state.sequence > (helperExit?.sequence ?? -1) && state.method === "run" && state.lastEvent?.type === "STEP" && state.line === integrationCallLine && state.variables.result === 4);
assert(callerResume?.callStack.join("/") === "run", "Expected the caller frame to resume on the call line");
assert(callerResume?.variables.result === 4, "The caller resume state lost the returned value");
assert(
    new Set(integration.states?.map(state => state.lastEvent?.sequence)).size === integration.states?.length,
    "Replay introduced checkpoints that do not correspond to distinct enriched trace events"
);
assert(
    (integration.trace?.events.length ?? 0) <= 5000 && (integration.states?.length ?? 0) <= 5000,
    "The returned/enriched trace exceeded the 5,000-event safety limit"
);
console.log("PASS JDI loop checkpoints survive state building, array replay, helper return, and caller resume");
