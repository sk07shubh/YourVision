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
                executionEvents: [
                    { sequence: 0, type: "VARIABLE_UPDATE", line: 3, method: "find", depth: 1,
                      data: { name: "i", value: 0 } }
                ]
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
        {
            sequence: 5,
            type: "STEP",
            line: 4,
            method: "find",
            depth: 1,
            data: {
                variables: { nums: { $arrayId: "a1", $type: "int[]", values: [4, 10] }, target: 8, i: 1, value: 10 },
                executionEvents: [
                    { sequence: 0, type: "ARRAY_WRITE", line: 4, method: "find", depth: 1,
                      data: { name: "nums", objectId: "a1", values: [4, 10], changes: [{ indices: [1], before: 8, after: 10 }] } }
                ]
            }
        },
        { sequence: 6, type: "METHOD_EXIT", line: 5, method: "find", depth: 1, data: { returnValue: 1 } }
    ]
};

const prompt = buildSemanticTracePrompt(source, trace);
if (!prompt.system.includes("Never invent or omit") ||
    !prompt.user.includes('"runtimeTrace"') ||
    !prompt.user.includes('"sequence":3') ||
    !prompt.user.includes("class Solution {")) {
    throw new Error("future AI prompt contract omitted source, runtime trace, or grounding constraints");
}

const prepared = await prepareSemanticTrace(trace, source);
const loop = prepared.events.find((event) => event.sequence === 2);
const loopAnnotation = loop?.data?.visualization as Record<string, unknown> | undefined;
if (loopAnnotation?.lineKind !== "loop-header" || loopAnnotation.provider !== "local-fallback" ||
    !Array.isArray(loopAnnotation.animationIntents) || loopAnnotation.executionPhase !== "initialization") {
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
const readIntents = readAnnotation.animationIntents as Array<{ action: string; targetIndex: number; variableName?: string }>;
if (!readIntents.some((intent) => intent.action === "highlight-read" && intent.targetIndex === 0) ||
    !readIntents.some((intent) => intent.action === "pointer-move" && intent.variableName === "i" && intent.targetIndex === 0)) {
    throw new Error("grounded array read did not produce a safe highlight and matching pointer intent");
}
if (!((readAnnotation.variableRoles as Array<{ name: string; role: string; structureName?: string }>)
    .some((hint) => hint.name === "i" && hint.role === "array-index" && hint.structureName === "nums"))) {
    throw new Error("array-index role was not scoped to the correct array");
}

const writeStep = prepared.events.find((event) => event.sequence === 5);
const writeAnnotation = writeStep?.data?.visualization as Record<string, unknown> | undefined;
const writeTargets = writeAnnotation?.targets as Array<{ eventType: string; operation: string; name?: string; indices?: number[] }>;
if (!writeTargets.some((target) => target.eventType === "ARRAY_WRITE" && target.operation === "write" &&
    target.name === "nums" && JSON.stringify(target.indices) === "[1]")) {
    throw new Error("array write target did not preserve its exact changed cell path");
}
const writeIntents = (writeAnnotation?.animationIntents ?? []) as Array<{ action: string; targetIndex: number }>;
if (!writeIntents.some((intent) => intent.action === "highlight-write" && intent.targetIndex === 0)) {
    throw new Error("grounded array write did not produce a highlight intent");
}

const conditionStep = prepared.events.find((event) => event.sequence === 4);
const conditionAnnotation = conditionStep?.data?.visualization as Record<string, unknown> | undefined;
if (conditionAnnotation?.conditionResult !== true) {
    throw new Error("runtime condition result was not preserved in semantic metadata");
}
if (prepared.events.find((event) => event.sequence === 6)?.data?.visualization !== undefined) {
    throw new Error("semantic annotations should only be attached to STEP checkpoints");
}

const multiArraySource = [
    "class Solution {",
    "  void inspect(int[] nums, int[] other, int i, int j) {",
    "    int first = nums[i]; int second = other[j];",
    "  }",
    "}"
].join("\n");
const multiArrayTrace: ExecutionTrace = {
    version: 1,
    events: [{
        sequence: 10,
        type: "STEP",
        line: 3,
        method: "inspect",
        depth: 1,
        data: {
            variables: {
                nums: { $arrayId: "nums-id", $type: "int[]", values: [3, 5] },
                other: { $arrayId: "other-id", $type: "int[]", values: [7, 9] },
                i: 1,
                j: 0,
                first: 5,
                second: 7
            },
            executionEvents: [
                { sequence: 0, type: "ARRAY_ACCESS", line: 3, method: "inspect", depth: 1,
                  data: { name: "nums", arrayId: "nums-id", indices: [1], value: 5, kind: "read" } },
                { sequence: 1, type: "ARRAY_ACCESS", line: 3, method: "inspect", depth: 1,
                  data: { name: "other", arrayId: "other-id", indices: [0], value: 7, kind: "read" } }
            ]
        }
    }]
};
const multiArrayPrepared = await prepareSemanticTrace(multiArrayTrace, multiArraySource);
const multiArrayAnnotation = multiArrayPrepared.events[0]?.data?.visualization as
    { variableRoles: Array<{ name: string; role: string; structureName?: string }> } | undefined;
const scopedRoles = multiArrayAnnotation?.variableRoles.filter((hint) => hint.role === "array-index") ?? [];
if (!scopedRoles.some((hint) => hint.name === "i" && hint.structureName === "nums") ||
    !scopedRoles.some((hint) => hint.name === "j" && hint.structureName === "other")) {
    throw new Error("multiple array indices were not scoped to their own structures");
}

const misScopedAnalyzer: SemanticTraceAnalyzer = {
    async analyze() {
        return {
            schemaVersion: 1,
            annotations: multiArrayPrepared.events.filter((event) => event.type === "STEP").map((event) => {
                const annotation = event.data?.visualization as Record<string, unknown>;
                const roles = annotation.variableRoles as Array<Record<string, unknown>>;
                return {
                    eventSequence: event.sequence,
                    annotation: {
                        ...annotation,
                        provider: "ai",
                        variableRoles: roles.map((role) =>
                            role.name === "i" && role.role === "array-index"
                                ? { ...role, structureName: "other" }
                                : role
                        )
                    }
                };
            })
        };
    }
};
const rejectedMisScope = await prepareSemanticTrace(multiArrayTrace, multiArraySource, misScopedAnalyzer);
const rejectedMisScopeAnnotation = rejectedMisScope.events[0]?.data?.visualization as
    { provider?: string } | undefined;
if (rejectedMisScopeAnnotation?.provider !== "local-fallback") {
    throw new Error("provider was allowed to attach an array index to the wrong source array");
}

const mapSource = [
    "class Solution {",
    "  void save(Map<Integer, Integer> mp, int key, int value) {",
    "    mp.put(key, value);",
    "  }",
    "}"
].join("\n");
const mapTrace: ExecutionTrace = {
    version: 1,
    events: [{
        sequence: 20,
        type: "STEP",
        line: 3,
        method: "save",
        depth: 1,
        data: {
            variables: {
                mp: { $mapId: "map-1", entries: [{ key: 7, value: 0 }] },
                key: 7,
                value: 0
            },
            executionEvents: [{
                sequence: 0,
                type: "MAP_WRITE",
                line: 3,
                method: "save",
                depth: 1,
                data: {
                    name: "mp",
                    mapId: "map-1",
                    changes: [{ kind: "insert", key: 7, after: 0 }]
                }
            }]
        }
    }]
};
const mapPrepared = await prepareSemanticTrace(mapTrace, mapSource);
const mapAnnotation = mapPrepared.events[0]?.data?.visualization as {
    targets?: Array<{ eventType: string; changeKind?: string; key?: unknown }>;
    animationIntents?: Array<{ action: string; targetIndex: number }>;
} | undefined;
if (!mapAnnotation?.targets?.some((target) =>
    target.eventType === "MAP_WRITE" && target.changeKind === "insert" && target.key === 7
) || !mapAnnotation.animationIntents?.some((intent) => intent.action === "insert" && intent.targetIndex === 0)) {
    throw new Error("map insertion intent was not grounded in the exact runtime change");
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
