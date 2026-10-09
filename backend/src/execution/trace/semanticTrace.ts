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
    structureName?: string;
}

export interface SemanticVisualTarget {
    eventType: string;
    operation: SemanticTargetOperation;
    name?: string;
    indices?: number[];
    key?: unknown;
    path?: unknown;
    changeKind?: "insert" | "update" | "delete";
}

export type SemanticAnimationAction =
    | "highlight-read"
    | "highlight-write"
    | "insert"
    | "update"
    | "delete"
    | "create"
    | "pointer-move";

export interface SemanticAnimationIntent {
    action: SemanticAnimationAction;
    targetIndex: number;
    variableName?: string;
    confidence: number;
    evidence: string;
}

export interface SemanticStepAnnotation {
    schemaVersion: typeof SEMANTIC_TRACE_SCHEMA_VERSION;
    provider: "local-fallback" | "ai";
    lineKind: SemanticLineKind;
    confidence: number;
    variableRoles: SemanticVariableRoleHint[];
    targets: SemanticVisualTarget[];
    /** A grounded plan for a future renderer; this does not trigger animations. */
    animationIntents: SemanticAnimationIntent[];
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
const ANIMATION_ACTIONS = new Set<SemanticAnimationAction>([
    "highlight-read", "highlight-write", "insert", "update", "delete", "create", "pointer-move"
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
    return nestedExecutionEvents(event).flatMap((nested) => {
        const data = isRecord(nested.data) ? nested.data : {};
        const eventType = typeof nested.type === "string" ? nested.type : "UNKNOWN_EVENT";
        const operation = targetOperation(eventType);
        const base: SemanticVisualTarget = { eventType, operation };
        if (typeof data.name === "string") base.name = data.name;

        const copyLocation = (source: Record<string, unknown>, target: SemanticVisualTarget) => {
            if (Array.isArray(source.indices) &&
                source.indices.every((index) => typeof index === "number" && Number.isFinite(index))) {
                target.indices = [...source.indices] as number[];
            }
            if (source.key !== undefined) target.key = source.key;
            if (source.path !== undefined) target.path = source.path;
            if (source.kind === "insert" || source.kind === "update" || source.kind === "delete") {
                target.changeKind = source.kind;
            }
        };

        const changes = Array.isArray(data.changes) ? data.changes.filter(isRecord) : [];
        if (changes.length > 0 && ["ARRAY_WRITE", "MAP_WRITE", "OBJECT_FIELD_WRITE"].includes(eventType)) {
            return changes.map((change) => {
                const target: SemanticVisualTarget = { ...base };
                copyLocation(change, target);
                return target;
            });
        }

        copyLocation(data, base);
        return [base];
    });
}


function animationIntentsFrom(
    event: ExecutionEvent,
    targets: SemanticVisualTarget[],
    roles: SemanticVariableRoleHint[]
): SemanticAnimationIntent[] {
    const intents: SemanticAnimationIntent[] = [];
    const variables = isRecord(event.data?.variables) ? event.data.variables : {};
    const add = (action: SemanticAnimationAction, targetIndex: number, evidence: string, variableName?: string) => {
        intents.push({
            action,
            targetIndex,
            confidence: action === "pointer-move" ? 0.78 : 0.9,
            evidence: evidence.slice(0, 240),
            ...(variableName ? { variableName } : {})
        });
    };
    targets.forEach((target, targetIndex) => {
        if (target.eventType === "ARRAY_ACCESS") {
            add("highlight-read", targetIndex, "Runtime trace recorded this array read.");
        } else if (target.eventType === "ARRAY_WRITE") {
            add("highlight-write", targetIndex, "Runtime trace recorded this array write.");
        } else if (target.eventType === "OBJECT_FIELD_WRITE") {
            add("update", targetIndex, "Runtime trace recorded an object-field mutation.");
        } else if (target.eventType === "OBJECT_CREATE") {
            add("create", targetIndex, "Runtime trace recorded object creation.");
        } else if (target.eventType === "MAP_WRITE" && target.changeKind) {
            add(target.changeKind, targetIndex, "Runtime trace recorded this map mutation.");
        }
        if (target.eventType !== "ARRAY_ACCESS" || !target.name || !target.indices || target.indices.length !== 1) return;
        for (const role of roles) {
            if (role.role !== "array-index" || role.structureName !== target.name) continue;
            if (typeof variables[role.name] === "number" && variables[role.name] === target.indices[0]) {
                add("pointer-move", targetIndex, "The current index variable matches the concrete runtime array index.", role.name);
            }
        }
    });
    return intents;
}

function variableRoleHints(line: string, event: ExecutionEvent): SemanticVariableRoleHint[] {
    const variables = isRecord(event.data?.variables) ? event.data.variables : {};
    const names = new Set(Object.keys(variables));
    const hints: SemanticVariableRoleHint[] = [];
    const add = (
        name: string | undefined,
        role: SemanticVariableRole,
        evidence: string,
        structureName?: string
    ) => {
        if (!name || !names.has(name) || hints.some((hint) =>
            hint.name === name && hint.role === role && hint.structureName === structureName
        )) return;
        hints.push({
            name,
            role,
            confidence: 0.82,
            evidence: evidence.slice(0, 240),
            ...(structureName ? { structureName } : {})
        });
    };

    const forHeader = line.match(/\bfor\s*\(\s*(?:(?:final\s+)?[\w$.<>?\[\]]+\s+)?([A-Za-z_$][\w$]*)\s*=/);
    if (forHeader?.[1]) add(forHeader[1], "loop-counter", "Declared as the initializer variable in this for-loop header.");

    const bracketPattern = /([A-Za-z_$][\w$]*)\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/g;
    let bracket: RegExpExecArray | null;
    while ((bracket = bracketPattern.exec(line)) !== null) {
        const arrayName = bracket[1];
        const indexName = bracket[2];
        if (arrayName && indexName) {
            add(indexName, "array-index", "Used as an index into " + arrayName + " on the highlighted source line.", arrayName);
        }
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
        const variableRoles = variableRoleHints(line, event);
        const targets = targetsFromRuntimeEvents(event);
        const annotation: SemanticStepAnnotation = {
            schemaVersion: SEMANTIC_TRACE_SCHEMA_VERSION,
            provider: "local-fallback",
            lineKind: classifyLine(line),
            confidence: line ? 0.65 : 0.25,
            variableRoles,
            targets,
            animationIntents: animationIntentsFrom(event, targets, variableRoles)
        };
        if (typeof data.conditionResult === "boolean") annotation.conditionResult = data.conditionResult;
        if (typeof data.executionPhase === "string" && EXECUTION_PHASES.has(data.executionPhase)) {
            annotation.executionPhase = data.executionPhase as "initialization" | "condition" | "increment" | "body" | "unknown";
        }
        annotations.push({ eventSequence: event.sequence, annotation });
    }
    return { schemaVersion: SEMANTIC_TRACE_SCHEMA_VERSION, annotations };
}


function stableJson(value: unknown): string {
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    if (isRecord(value)) {
        return "{" + Object.keys(value).sort().map((key) =>
            JSON.stringify(key) + ":" + stableJson(value[key])
        ).join(",") + "}";
    }
    return JSON.stringify(value) ?? "undefined";
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every((key) => allowed.includes(key));
}

function validateProposal(value: unknown, trace: ExecutionTrace, source: string): SemanticTraceProposal | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "annotations"]) ||
        value.schemaVersion !== SEMANTIC_TRACE_SCHEMA_VERSION || !Array.isArray(value.annotations)) return undefined;
    const stepEvents = new Map(trace.events.filter((event) => event.type === "STEP").map((event) => [event.sequence, event]));
    const seen = new Set<number>();
    const annotations: SemanticTraceProposal["annotations"] = [];

    for (const item of value.annotations) {
        if (!isRecord(item) || !hasOnlyKeys(item, ["eventSequence", "annotation"]) ||
            typeof item.eventSequence !== "number" || !Number.isInteger(item.eventSequence) ||
            seen.has(item.eventSequence)) return undefined;
        const sourceEvent = stepEvents.get(item.eventSequence);
        const annotation = item.annotation;
        if (!sourceEvent || !isRecord(annotation) ||
            !hasOnlyKeys(annotation, ["schemaVersion", "provider", "lineKind", "confidence", "variableRoles", "targets", "animationIntents", "conditionResult", "executionPhase"]) ||
            annotation.schemaVersion !== SEMANTIC_TRACE_SCHEMA_VERSION ||
            (annotation.provider !== "ai" && annotation.provider !== "local-fallback") ||
            typeof annotation.lineKind !== "string" || !LINE_KINDS.has(annotation.lineKind as SemanticLineKind) ||
            typeof annotation.confidence !== "number" || !Number.isFinite(annotation.confidence) ||
            annotation.confidence < 0 || annotation.confidence > 1 ||
            !Array.isArray(annotation.variableRoles) || !Array.isArray(annotation.targets) ||
            !Array.isArray(annotation.animationIntents)) return undefined;

        const variables = isRecord(sourceEvent.data?.variables) ? sourceEvent.data.variables : {};
        const sourceLine = sourceLineFor(sourceEvent, source.split(/\r?\n/));
        const sourceIndexRoles = variableRoleHints(sourceLine, sourceEvent)
            .filter((hint) => hint.role === "array-index");
        for (const hint of annotation.variableRoles) {
            if (!isRecord(hint) || !hasOnlyKeys(hint, ["name", "role", "confidence", "evidence", "structureName"]) ||
                typeof hint.name !== "string" || !(hint.name in variables) ||
                typeof hint.role !== "string" || !VARIABLE_ROLES.has(hint.role as SemanticVariableRole) ||
                typeof hint.confidence !== "number" || !Number.isFinite(hint.confidence) ||
                hint.confidence < 0 || hint.confidence > 1 ||
                typeof hint.evidence !== "string" || hint.evidence.length > 240 ||
                (hint.structureName !== undefined && (typeof hint.structureName !== "string" || !(hint.structureName in variables))) ||
                (hint.role === "array-index" && (
                    typeof hint.structureName !== "string" ||
                    !(hint.structureName in variables) ||
                    !sourceIndexRoles.some((expected) =>
                        expected.name === hint.name && expected.structureName === hint.structureName
                    )
                ))) return undefined;
        }
        for (const target of annotation.targets) {
            if (!isRecord(target) || !hasOnlyKeys(target, ["eventType", "operation", "name", "indices", "key", "path", "changeKind"]) ||
                typeof target.eventType !== "string" ||
                typeof target.operation !== "string" || !TARGET_OPERATIONS.has(target.operation as SemanticTargetOperation) ||
                (target.name !== undefined && typeof target.name !== "string") ||
                (target.changeKind !== undefined && !["insert", "update", "delete"].includes(String(target.changeKind))) ||
                (target.indices !== undefined && (!Array.isArray(target.indices) ||
                    !target.indices.every((index) => typeof index === "number" && Number.isFinite(index))) )) return undefined;
        }
        const proposalTargets = annotation.targets as SemanticVisualTarget[];
        const proposalRoles = annotation.variableRoles as SemanticVariableRoleHint[];
        const seenIntents = new Set<string>();
        for (const intent of annotation.animationIntents) {
            if (!isRecord(intent) || !hasOnlyKeys(intent, ["action", "targetIndex", "variableName", "confidence", "evidence"]) ||
                typeof intent.action !== "string" || !ANIMATION_ACTIONS.has(intent.action as SemanticAnimationAction) ||
                typeof intent.targetIndex !== "number" || !Number.isInteger(intent.targetIndex) ||
                intent.targetIndex < 0 || intent.targetIndex >= proposalTargets.length ||
                typeof intent.confidence !== "number" || !Number.isFinite(intent.confidence) ||
                intent.confidence < 0 || intent.confidence > 1 ||
                typeof intent.evidence !== "string" || intent.evidence.length > 240 ||
                (intent.variableName !== undefined && (typeof intent.variableName !== "string" || !(intent.variableName in variables)))) {
                return undefined;
            }
            const target = proposalTargets[intent.targetIndex];
            if (!target) return undefined;
            const intentKey = stableJson(intent);
            if (seenIntents.has(intentKey)) return undefined;
            seenIntents.add(intentKey);

            if (intent.action === "highlight-read" && target.eventType !== "ARRAY_ACCESS") return undefined;
            if (intent.action === "highlight-write" && !["ARRAY_WRITE", "OBJECT_FIELD_WRITE"].includes(target.eventType)) return undefined;
            if (intent.action === "insert" && !(target.eventType === "MAP_WRITE" && target.changeKind === "insert")) return undefined;
            if (intent.action === "update" && !(target.eventType === "OBJECT_FIELD_WRITE" ||
                (target.eventType === "MAP_WRITE" && target.changeKind === "update"))) return undefined;
            if (intent.action === "delete" && !(target.eventType === "MAP_WRITE" && target.changeKind === "delete")) return undefined;
            if (intent.action === "create" && target.eventType !== "OBJECT_CREATE") return undefined;
            if (intent.action === "pointer-move") {
                const matchingRole = typeof intent.variableName === "string" && proposalRoles.find((role) =>
                    role.name === intent.variableName && role.role === "array-index" && role.structureName === target.name
                );
                if (target.eventType !== "ARRAY_ACCESS" || !matchingRole ||
                    typeof target.name !== "string" ||
                    !Array.isArray(target.indices) || target.indices.length !== 1 ||
                    variables[matchingRole.name] !== target.indices[0]) return undefined;
            }
        }

        if (annotation.conditionResult !== undefined &&
            (typeof annotation.conditionResult !== "boolean" ||
                sourceEvent.data?.conditionResult !== annotation.conditionResult)) return undefined;
        if (typeof sourceEvent.data?.conditionResult === "boolean" &&
            annotation.conditionResult !== sourceEvent.data.conditionResult) return undefined;

        if (annotation.executionPhase !== undefined &&
            (typeof annotation.executionPhase !== "string" ||
                !EXECUTION_PHASES.has(annotation.executionPhase) ||
                sourceEvent.data?.executionPhase !== annotation.executionPhase)) return undefined;
        if (sourceEvent.data?.executionPhase !== undefined &&
            annotation.executionPhase !== sourceEvent.data.executionPhase) return undefined;

        const expectedTargets = targetsFromRuntimeEvents(sourceEvent)
            .map((target) => stableJson(target)).sort();
        const proposedTargets = (annotation.targets as unknown[])
            .map((target) => stableJson(target)).sort();
        if (JSON.stringify(proposedTargets) !== JSON.stringify(expectedTargets)) return undefined;

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
    let validated: SemanticTraceProposal;
    if (!analyzer) {
        // The local analyzer is our own typed implementation; avoid running the
        // expensive untrusted-provider validator against our own generated output.
        validated = localProposal(source, trace);
    } else {
        let proposal: unknown;
        try {
            proposal = await analyzer.analyze(source, trace);
        } catch {
            proposal = undefined;
        }
        validated = validateProposal(proposal, trace, source) ?? localProposal(source, trace);
    }
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
