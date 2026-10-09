import type { ExecutionEvent, ExecutionTrace } from "./schema.js";

export const SEMANTIC_TRACE_SCHEMA_VERSION = 1 as const;

export type SemanticLineKind =
    | "loop-header"
    | "branch-condition"
    | "return"
    | "array-operation"
    | "data-structure-operation"
    | "assignment"
    | "method-boundary"
    | "statement"
    | "unknown";

export type SemanticVariableRole =
    | "array-index"
    | "loop-counter"
    | "left-bound"
    | "right-bound"
    | "midpoint"
    | "result"
    | "target"
    | "collection"
    | "pointer"
    | "unknown";

export type SemanticTargetOperation =
    | "read"
    | "write"
    | "create"
    | "update"
    | "reference"
    | "other";

export interface SemanticVariableRoleHint {
    name: string;
    role: SemanticVariableRole;
    confidence: number;
    evidence: string;
}

export interface SemanticVisualTarget {
    eventType: string;
    operation: SemanticTargetOperation;
    name?: string;
    indices?: number[];
    key?: unknown;
    path?: unknown;
}

export interface SemanticStepAnnotation {
    schemaVersion: typeof SEMANTIC_TRACE_SCHEMA_VERSION;
    provider: "local-fallback" | "ai";
    lineKind: SemanticLineKind;
    confidence: number;
    variableRoles: SemanticVariableRoleHint[];
    targets: SemanticVisualTarget[];
    conditionResult?: boolean;
    executionPhase?: "initialization" | "condition" | "increment" | "body" | "unknown";
}

export interface SemanticTraceProposal {
    schemaVersion: typeof SEMANTIC_TRACE_SCHEMA_VERSION;
    annotations: Array<{
        eventSequence: number;
        annotation: SemanticStepAnnotation;
    }>;
}

/**
 * The seam where an AI provider will be plugged in later. It receives the
 * source and the real enriched runtime trace; it must not execute user code
 * or invent runtime facts.
 */
export interface SemanticTraceAnalyzer {
    analyze(source: string, trace: ExecutionTrace): Promise<unknown>;
}

const LINE_KINDS = new Set<SemanticLineKind>([
    "loop-header", "branch-condition", "return", "array-operation",
    "data-structure-operation", "assignment", "method-boundary",
    "statement", "unknown"
]);
const VARIABLE_ROLES = new Set<SemanticVariableRole>([
    "array-index", "loop-counter", "left-bound", "right-bound",
    "midpoint", "result", "target", "collection", "pointer", "unknown"
]);
const TARGET_OPERATIONS = new Set<SemanticTargetOperation>([
    "read", "write", "create", "update", "reference", "other"
]);
const EXECUTION_PHASES = new Set([
    "initialization", "condition", "increment", "body", "unknown"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sourceLineFor(event: ExecutionEvent, lines: string[]): string {
    return typeof event.line === "number" && event.line > 0
        ? (lines[event.line - 1] ?? "").trim()
        : "";
}

function classifyLine(line: string): SemanticLineKind {
    const normalized = line.replace(/^\s*}\s*else\s+if\b/, "else if").trim();
    if (!normalized) return "unknown";
    if (/\bfor\s*\(/.test(normalized) || /\bwhile\s*\(/.test(normalized) ||
        /\bdo\b/.test(normalized)) return "loop-header";
    if (/^(?:else\s+)?if\s*\(/.test(normalized) ||
        /^switch\s*\(/.test(normalized) || /^case\b/.test(normalized)) {
        return "branch-condition";
    }
    if (/\breturn\b/.test(normalized)) return "return";
    if (/\w+\s*\[[^\]]+\]/.test(normalized)) return "array-operation";
    if (/\.\s*(?:put|get|add|remove|push|pop|offer|poll|peek|contains|containsKey|enqueue|dequeue)\s*\(/.test(normalized)) {
        return "data-structure-operation";
    }
    if (/\b(?:int|long|double|float|boolean|char|byte|short|var|String|[A-Z]\w*(?:<[^>]+>)?)\s+\w+\s*=/.test(normalized) ||
        /(?:^|[^=!<>])=(?!=)/.test(normalized) || /\+\+|--/.test(normalized)) {
        return "assignment";
    }
    return "statement";
}

function nestedExecutionEvents(event: ExecutionEvent): Array<Record<string, unknown>> {
    const events = event.data?.executionEvents;
    return Array.isArray(events) ? events.filter(isRecord) : [];
}

function targetOperation(type: string): SemanticTargetOperation {
    if (type === "ARRAY_ACCESS") return "read";
    if (type === "ARRAY_REFERENCE") return "reference";
    if (type === "ARRAY_WRITE" || type === "MAP_WRITE") return "write";
    if (type === "OBJECT_CREATE") return "create";
    if (type === "VARIABLE_UPDATE" || type === "OBJECT_FIELD_WRITE") return "update";
    return "other";
}

function targetsFromRuntimeEvents(event: ExecutionEvent): SemanticVisualTarget[] {
    return nestedExecutionEvents(event).map((nested) => {
        const data = isRecord(nested.data) ? nested.data : {};
        const target: SemanticVisualTarget = {
            eventType: typeof nested.type === "string" ? nested.type : "UNKNOWN_EVENT",
            operation: targetOperation(typeof nested.type === "string" ? nested.type : "")
        };
        for (const key of ["name", "indices", "key", "path"] as const) {
            const value = data[key];
            if (key === "name" && typeof value === "string") target.name = value;
            else if (key === "indices" && Array.isArray(value) &&
                value.every((index) => typeof index === "number" && Number.isFinite(index))) {
                target.indices = [...value] as number[];
            } else if (key === "key" && value !== undefined) target.key = value;
            else if (key === "path" && value !== undefined) target.path = value;
        }
        return target;
    });
}

function variableRoleHints(line: string, event: ExecutionEvent): SemanticVariableRoleHint[] {
    const variables = isRecord(event.data?.variables) ? event.data.variables : {};
    const names = new Set(Object.keys(variables));
    const hints: SemanticVariableRoleHint[] = [];
    const add = (name: string | undefined, role: SemanticVariableRole, evidence: string) => {
        if (!name || !names.has(name) || hints.some((hint) => hint.name === name && hint.role === role)) return;
        hints.push({ name, role, confidence: 0.82, evidence: evidence.slice(0, 240) });
    };

    const forHeader = line.match(/\bfor\s*\(\s*(?:(?:final\s+)?[\w$.<>?\[\]]+\s+)?([A-Za-z_$][\w$]*)\s*=/);
    if (forHeader?.[1]) add(forHeader[1], "loop-counter", "Declared as the initializer variable in this for-loop header.");

    const bracketPattern = /\[\s*([A-Za-z_$][\w$]*)\s*\]/g;
    let bracket: RegExpExecArray | null;
    while ((bracket = bracketPattern.exec(line)) !== null) {
        add(bracket[1], "array-index", "Used as an index inside an array access on the highlighted source line.");
    }

    const lower = line.toLowerCase();
    for (const name of names) {
        if (/^(?:left|lo|low|start)$/i.test(name) && /\bleft\b|\blo\b|\blow\b|\bstart\b/.test(lower)) {
            add(name, "left-bound", "Name and source context suggest the lower search boundary.");
        }
        if (/^(?:right|hi|high|end)$/i.test(name) && /\bright\b|\bhi\b|\bhigh\b|\bend\b/.test(lower)) {
            add(name, "right-bound", "Name and source context suggest the upper search boundary.");
        }
        if (/^(?:mid|midpoint)$/i.test(name) && /\bmid\b|\bmidpoint\b/.test(lower)) {
            add(name, "midpoint", "Name and source context suggest a midpoint variable.");
        }
        if (/^(?:ans|answer|result|res)$/i.test(name) && /\breturn\b|\bans\b|\banswer\b|\bresult\b/.test(lower)) {
            add(name, "result", "Name or source context suggests a result value.");
        }
        if (/^(?:target|goal|key)$/i.test(name) && /\btarget\b|\bgoal\b|\bkey\b/.test(lower)) {
            add(name, "target", "Name and source context suggest a value being searched for.");
        }
    }
    return hints;
}

function localProposal(source: string, trace: ExecutionTrace): SemanticTraceProposal {
    const lines = source.split(/\r?\n/);
    const annotations: SemanticTraceProposal["annotations"] = [];
    for (const event of trace.events) {
        if (event.type !== "STEP") continue;
        const data = event.data ?? {};
        const line = sourceLineFor(event, lines);
        const annotation: SemanticStepAnnotation = {
            schemaVersion: SEMANTIC_TRACE_SCHEMA_VERSION,
            provider: "local-fallback",
            lineKind: classifyLine(line),
            confidence: line ? 0.65 : 0.25,
            variableRoles: variableRoleHints(line, event),
            targets: targetsFromRuntimeEvents(event)
        };
        if (typeof data.conditionResult === "boolean") annotation.conditionResult = data.conditionResult;
        if (typeof data.executionPhase === "string" && EXECUTION_PHASES.has(data.executionPhase)) {
            annotation.executionPhase = data.executionPhase as "initialization" | "condition" | "increment" | "body" | "unknown";
        }
        annotations.push({ eventSequence: event.sequence, annotation });
    }
    return { schemaVersion: SEMANTIC_TRACE_SCHEMA_VERSION, annotations };
}

function targetMatchesRuntime(target: SemanticVisualTarget, event: ExecutionEvent): boolean {
    return nestedExecutionEvents(event).some((nested) => {
        if (nested.type !== target.eventType) return false;
        const data = isRecord(nested.data) ? nested.data : {};
        if (target.name !== undefined && data.name !== target.name) return false;
        if (target.indices !== undefined &&
            (!Array.isArray(data.indices) || JSON.stringify(data.indices) !== JSON.stringify(target.indices))) return false;
        if (target.key !== undefined && JSON.stringify(data.key) !== JSON.stringify(target.key)) return false;
        if (target.path !== undefined && JSON.stringify(data.path) !== JSON.stringify(target.path)) return false;
        return target.operation === targetOperation(String(nested.type));
    });
}

function validateProposal(value: unknown, trace: ExecutionTrace): SemanticTraceProposal | undefined {
    if (!isRecord(value) || value.schemaVersion !== SEMANTIC_TRACE_SCHEMA_VERSION ||
        !Array.isArray(value.annotations)) return undefined;
    const stepEvents = new Map(trace.events.filter((event) => event.type === "STEP").map((event) => [event.sequence, event]));
    const seen = new Set<number>();
    const annotations: SemanticTraceProposal["annotations"] = [];

    for (const item of value.annotations) {
        if (!isRecord(item) || typeof item.eventSequence !== "number" || !Number.isInteger(item.eventSequence) ||
            seen.has(item.eventSequence)) return undefined;
        const sourceEvent = stepEvents.get(item.eventSequence);
        const annotation = item.annotation;
        if (!sourceEvent || !isRecord(annotation) ||
            annotation.schemaVersion !== SEMANTIC_TRACE_SCHEMA_VERSION ||
            (annotation.provider !== "ai" && annotation.provider !== "local-fallback") ||
            typeof annotation.lineKind !== "string" || !LINE_KINDS.has(annotation.lineKind as SemanticLineKind) ||
            typeof annotation.confidence !== "number" || !Number.isFinite(annotation.confidence) ||
            annotation.confidence < 0 || annotation.confidence > 1 ||
            !Array.isArray(annotation.variableRoles) || !Array.isArray(annotation.targets)) return undefined;

        const variables = isRecord(sourceEvent.data?.variables) ? sourceEvent.data.variables : {};
        for (const hint of annotation.variableRoles) {
            if (!isRecord(hint) || typeof hint.name !== "string" || !(hint.name in variables) ||
                typeof hint.role !== "string" || !VARIABLE_ROLES.has(hint.role as SemanticVariableRole) ||
                typeof hint.confidence !== "number" || !Number.isFinite(hint.confidence) ||
                hint.confidence < 0 || hint.confidence > 1 ||
                typeof hint.evidence !== "string" || hint.evidence.length > 240) return undefined;
        }
        for (const target of annotation.targets) {
            if (!isRecord(target) || typeof target.eventType !== "string" ||
                typeof target.operation !== "string" || !TARGET_OPERATIONS.has(target.operation as SemanticTargetOperation) ||
                (target.name !== undefined && typeof target.name !== "string") ||
                (target.indices !== undefined && (!Array.isArray(target.indices) ||
                    !target.indices.every((index) => typeof index === "number" && Number.isFinite(index))) ) ||
                !targetMatchesRuntime(target as unknown as SemanticVisualTarget, sourceEvent)) return undefined;
        }
        if (annotation.conditionResult !== undefined && typeof annotation.conditionResult !== "boolean") return undefined;
        if (annotation.executionPhase !== undefined &&
            (typeof annotation.executionPhase !== "string" || !EXECUTION_PHASES.has(annotation.executionPhase))) return undefined;

        seen.add(item.eventSequence);
        annotations.push({
            eventSequence: item.eventSequence,
            annotation: annotation as unknown as SemanticStepAnnotation
        });
    }
    if (seen.size !== stepEvents.size) return undefined;
    return { schemaVersion: SEMANTIC_TRACE_SCHEMA_VERSION, annotations };
}

/**
 * API-ready semantic stage. The default analyzer is intentionally local and
 * makes no network/API calls. Any analyzer proposal is validated against real
 * STEP checkpoints and nested runtime events before it can affect the trace.
 * Invalid output or provider errors fall back to conservative local metadata.
 */
export async function prepareSemanticTrace(
    trace: ExecutionTrace,
    source: string,
    analyzer?: SemanticTraceAnalyzer
): Promise<ExecutionTrace> {
    let proposal: unknown;
    try {
        proposal = analyzer
            ? await analyzer.analyze(source, trace)
            : localProposal(source, trace);
    } catch {
        proposal = undefined;
    }
    const validated = validateProposal(proposal, trace) ?? localProposal(source, trace);
    const annotations = new Map(validated.annotations.map((entry) => [entry.eventSequence, entry.annotation]));

    return {
        version: 1,
        events: trace.events.map((event) => {
            if (event.type !== "STEP") return event;
            const annotation = annotations.get(event.sequence);
            if (!annotation) return event;
            return {
                ...event,
                data: {
                    ...(event.data ?? {}),
                    visualization: annotation
                }
            };
        })
    };
}
