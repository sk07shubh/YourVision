import { prepareSemanticTrace, type SemanticTraceAnalyzer } from "../src/execution/trace/semanticTrace.js";
import type { ExecutionTrace } from "../src/execution/trace/schema.js";
import { buildSemanticTracePrompt } from "../src/execution/trace/semanticTracePrompt.js";

const source = [
    "class Solution {",
    "  int find(int[] nums, int target) {",
    "    for (int i = 0; i < nums.length; i++) {",
    "      int value = nums[i];",
    "      if (value == target) return i;",
    "    }",
    "    return -1;",
    "  }",
    "}"
].join("\n");

const trace: ExecutionTrace = {
    version: 1,
    events: [
        {
            sequence: 1,
            type: "METHOD_ENTER",
            line: 2,
            method: "find",
            depth: 1,
            data: { variables: { nums: { $arrayId: "a1", $type: "int[]", values: [4, 8] }, target: 8 } }
        },
        {
            sequence: 2,
            type: "STEP",
            line: 3,
            method: "find",
            depth: 1,
            data: {
                variables: { nums: { $arrayId: "a1", $type: "int[]", values: [4, 8] }, target: 8, i: 0 },
                executionEvents: []
            }
        },
        {
            sequence: 3,
            type: "STEP",
            line: 4,
            method: "find",
            depth: 1,
            data: {
                variables: { nums: { $arrayId: "a1", $type: "int[]", values: [4, 8] }, target: 8, i: 0, value: 4 },
                executionEvents: [
                    { sequence: 0, type: "ARRAY_ACCESS", line: 4, method: "find", depth: 1,
                      data: { name: "nums", arrayId: "a1", indices: [0], value: 4, kind: "read" } }
                ]
            }
        },
        {
            sequence: 4,
            type: "STEP",
            line: 5,
            method: "find",
            depth: 1,
            data: {
                conditionResult: true,
                variables: { nums: { $arrayId: "a1", $type: "int[]", values: [4, 8] }, target: 8, i: 1, value: 8 },
                executionEvents: []
            }
        },
        { sequence: 5, type: "METHOD_EXIT", line: 5, method: "find", depth: 1, data: { returnValue: 1 } }
    ]
};

const prompt = buildSemanticTracePrompt(source, trace);
if (!prompt.system.includes("Never invent an access") ||
    !prompt.user.includes('"runtimeTrace"') ||
    !prompt.user.includes('"sequence":3') ||
    !prompt.user.includes(source)) {
    throw new Error("future AI prompt contract omitted source, runtime trace, or grounding constraints");
}

const prepared = await prepareSemanticTrace(trace, source);
const loop = prepared.events.find((event) => event.sequence === 2);
const loopAnnotation = loop?.data?.visualization as Record<string, unknown> | undefined;
if (loopAnnotation?.lineKind !== "loop-header" || loopAnnotation.provider !== "local-fallback") {
    throw new Error("local semantic stage did not annotate a loop header");
}
const loopRoles = loopAnnotation.variableRoles as Array<{ name: string; role: string }>;
if (!loopRoles.some((hint) => hint.name === "i" && hint.role === "loop-counter")) {
    throw new Error("loop counter role was not inferred from the source header");
}

const readStep = prepared.events.find((event) => event.sequence === 3);
const readAnnotation = readStep?.data?.visualization as Record<string, unknown> | undefined;
if (readAnnotation?.lineKind !== "array-operation") {
    throw new Error("array access line was not classified");
}
const targets = readAnnotation.targets as Array<{ eventType: string; operation: string; name?: string; indices?: number[] }>;
if (!targets.some((target) => target.eventType === "ARRAY_ACCESS" && target.operation === "read" &&
    target.name === "nums" && JSON.stringify(target.indices) === "[0]")) {
    throw new Error("visual target was not grounded in the runtime array-access event");
}

const conditionStep = prepared.events.find((event) => event.sequence === 4);
const conditionAnnotation = conditionStep?.data?.visualization as Record<string, unknown> | undefined;
if (conditionAnnotation?.conditionResult !== true) {
    throw new Error("runtime condition result was not preserved in semantic metadata");
}
if (prepared.events.find((event) => event.sequence === 5)?.data?.visualization !== undefined) {
    throw new Error("semantic annotations should only be attached to STEP checkpoints");
}

const maliciousAnalyzer: SemanticTraceAnalyzer = {
    async analyze() {
        return {
            schemaVersion: 1,
            annotations: [{
                eventSequence: 3,
                annotation: {
                    schemaVersion: 1,
                    provider: "ai",
                    lineKind: "array-operation",
                    confidence: 1,
                    variableRoles: [],
                    targets: [{ eventType: "ARRAY_WRITE", operation: "write", name: "nums", indices: [99] }]
                }
            }]
        };
    }
};
const guarded = await prepareSemanticTrace(trace, source, maliciousAnalyzer);
const guardedStep = guarded.events.find((event) => event.sequence === 3);
const guardedAnnotation = guardedStep?.data?.visualization as Record<string, unknown> | undefined;
const guardedTargets = guardedAnnotation?.targets as Array<{ eventType: string; indices?: number[] }>;
if (guardedAnnotation?.provider !== "local-fallback" ||
    guardedTargets.some((target) => target.eventType === "ARRAY_WRITE" && target.indices?.includes(99))) {
    throw new Error("invalid provider output was not rejected in favor of the deterministic fallback");
}

const failingAnalyzer: SemanticTraceAnalyzer = {
    async analyze() { throw new Error("simulated provider outage"); }
};
const recovered = await prepareSemanticTrace(trace, source, failingAnalyzer);
const recoveredAnnotation = recovered.events.find((event) => event.sequence === 2)?.data?.visualization as Record<string, unknown> | undefined;
if (recoveredAnnotation?.provider !== "local-fallback") {
    throw new Error("provider failure did not fall back safely");
}

console.log("PASS: semantic trace contract, grounding validation, and fallback");
