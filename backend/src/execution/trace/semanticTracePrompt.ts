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
    "For an array-index role, include structureName with the exact array variable being indexed. It must exist in the same STEP variables. This prevents an index for one array from becoming a pointer on every array.",
    "Visual targets must exactly represent all targets derived from that STEP event's data.executionEvents, including each concrete location in a write event changes array. Their eventType, operation, name, indices, key, and path must match runtime data exactly. Never invent or omit an access, write, index, key, or mutation.",
    "Only copy conditionResult when it is explicitly present as a boolean in the runtime event data. Do not reevaluate or guess branch outcomes.",
    "animationIntents are plans for a future renderer only; they must not trigger side effects. Every intent must point to an existing target. highlight-read requires ARRAY_ACCESS, highlight-write requires ARRAY_WRITE or OBJECT_FIELD_WRITE, insert/update/delete must match an exact MAP_WRITE change kind (or object-field update for update), create requires OBJECT_CREATE, and pointer-move requires an array-index role whose structureName and current numeric value match that ARRAY_ACCESS target's single concrete index.",
    "executionPhase is semantic metadata, not a runtime value. You may infer initialization or increment only when the source loop clause and a matching VARIABLE_UPDATE event support it; infer condition only when conditionResult is present; infer body only when the highlighted source line is inside a loop body. Never infer phases from ordering alone. If unsupported, omit it.",
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
                            evidence: "short evidence grounded in source and trace",
                            structureName: "required for array-index roles; exact array variable being indexed"
                        }],
                        targets: [{
                            eventType: "exact nested runtime event type",
                            operation: ["read", "write", "create", "update", "reference", "other"],
                            name: "optional exact runtime event name",
                            indices: "optional exact numeric index array",
                            key: "optional exact runtime key",
                            path: "optional exact runtime path",
                            changeKind: "optional insert, update, or delete copied from the exact runtime change"
                        }],
                        animationIntents: [{
                            action: ["highlight-read", "highlight-write", "insert", "update", "delete", "create", "pointer-move"],
                            targetIndex: "integer index into this annotation's targets array",
                            variableName: "required for pointer-move; existing array-index variable name",
                            confidence: "number from 0 through 1",
                            evidence: "short explanation grounded in source and runtime trace"
                        }],
                        conditionResult: "optional boolean copied from runtime data",
                        executionPhase: ["optional initialization, condition, increment, body, or unknown"]
                    }
                }]
            }
        })
    };
}
