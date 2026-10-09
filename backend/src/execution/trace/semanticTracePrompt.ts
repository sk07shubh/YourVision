import type { ExecutionTrace } from "./schema.js";
import { SEMANTIC_TRACE_SCHEMA_VERSION } from "./semanticTrace.js";

/**
 * Prompt contract for the future model adapter. This module deliberately does
 * not make requests or read credentials; it only prepares the model input.
 */
export const SEMANTIC_TRACE_SYSTEM_PROMPT = [
    "You are YourVision's semantic trace annotator for source-code visualization.",
    "The supplied source and runtime trace describe a real Java execution. The runtime trace is authoritative for all runtime facts.",
    "Return one JSON object matching SemanticTraceProposal schema version 1. Do not return markdown, commentary, or extra properties.",
    "Annotate every STEP event exactly once, keyed by its exact event sequence. Do not annotate non-STEP events.",
    "Classify the highlighted source line and infer useful variable roles from the whole source and trace, not variable names alone. Use evidence and calibrated confidence.",
    "A variable-role hint name must exist in that STEP event's data.variables object. Do not create variable names.",
    "Visual targets must be copied from that STEP event's data.executionEvents. Their eventType, operation, name, indices, key, and path must match the corresponding runtime event exactly. Never invent an access, write, index, key, or mutation.",
    "Only copy conditionResult when it is explicitly present as a boolean in the runtime event data. Do not reevaluate or guess branch outcomes.",
    "Only copy executionPhase when it is explicitly present in runtime event data and is one of initialization, condition, increment, body, or unknown. Do not infer loop phases from ordering alone.",
    "If semantic intent is uncertain, use lineKind unknown or omit uncertain variable-role hints. Keep the targets array limited to runtime-grounded facts.",
    "The output is a proposal, not authority over execution. A deterministic validator will reject unsupported or malformed annotations."
].join("\n");

/**
 * Build the exact model input for a future provider. Callers are responsible
 * for model/context budgeting; the returned payload contains no credentials.
 */
export function buildSemanticTracePrompt(
    source: string,
    trace: ExecutionTrace
): { system: string; user: string } {
    return {
        system: SEMANTIC_TRACE_SYSTEM_PROMPT,
        user: JSON.stringify({
            schemaVersion: SEMANTIC_TRACE_SCHEMA_VERSION,
            source,
            runtimeTrace: trace,
            requiredOutput: {
                schemaVersion: SEMANTIC_TRACE_SCHEMA_VERSION,
                annotations: [{
                    eventSequence: "integer matching an actual STEP event",
                    annotation: {
                        schemaVersion: SEMANTIC_TRACE_SCHEMA_VERSION,
                        provider: "ai",
                        lineKind: [
                            "loop-header", "branch-condition", "return", "array-operation",
                            "data-structure-operation", "assignment", "method-boundary",
                            "statement", "unknown"
                        ],
                        confidence: "number from 0 through 1",
                        variableRoles: [{
                            name: "existing variable name",
                            role: [
                                "array-index", "loop-counter", "left-bound", "right-bound",
                                "midpoint", "result", "target", "collection", "pointer", "unknown"
                            ],
                            confidence: "number from 0 through 1",
                            evidence: "short evidence grounded in source and trace"
                        }],
                        targets: [{
                            eventType: "exact nested runtime event type",
                            operation: ["read", "write", "create", "update", "reference", "other"],
                            name: "optional exact runtime event name",
                            indices: "optional exact numeric index array",
                            key: "optional exact runtime key",
                            path: "optional exact runtime path"
                        }],
                        conditionResult: "optional boolean copied from runtime data",
                        executionPhase: ["optional initialization, condition, increment, body, or unknown"]
                    }
                }]
            }
        })
    };
}
