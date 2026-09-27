import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import type { ExecutionTrace, ExecutionEvent, TraceState } from "../trace/schema.js";
import { buildStates } from "../trace/stateBuilder.js";
import { enrichTrace } from "../trace/enrichTrace.js";

const MAX_TRACE_EVENTS = 5000;

const execFileAsync = promisify(execFile);

export interface JavaTestcase {
    method: string;
    arguments?: string[];
}

export interface JavaExecutionResult {
    success: boolean;
    kind:
        | "OK"
        | "VALIDATION_ERROR"
        | "COMPILATION_ERROR"
        | "RUNTIME_ERROR"
        | "TIMEOUT"
        | "HARNESS_ERROR";
    result?: string;
    stdout: string;
    stderr: string;
    errorType?: string;
    message?: string;
    trace?: ExecutionTrace;
    states?: TraceState[];
}

const RUNTIME_FILE =
    fileURLToPath(
        new URL(
            "./YourVisionRuntime.java",
            import.meta.url
        )
    );

const NO_ARGS = "__YV_NO_ARGS__";
const TRACER_FILE =
    fileURLToPath(
        new URL(
            "./YourVisionTracer.java",
            import.meta.url
        )
    );
const LIST_NODE_FILE = fileURLToPath(
    new URL(
        "./LeetCodeListNode.java",
        import.meta.url
    )
);
const TREE_NODE_FILE = fileURLToPath(
    new URL(
        "./LeetCodeTreeNode.java",
        import.meta.url
    )
);
function prepareJavaSource(source: string): string {
    const standardImport =
        "import java.util.*;";

    if (
        /^\s*import\s+java\.util\.\*;/m.test(
            source
        )
    ) {
        return source;
    }

    // Keep the user's source line numbers unchanged. JDI reports lines from
    // the compiled Solution.java, so adding an import on its own line would
    // shift every executable line and break editor highlighting.
    const packageDeclaration =
        /(^[ \t]*package[ \t]+[\w.]+[ \t]*;)/m;

    if (packageDeclaration.test(source)) {
        return source.replace(
            packageDeclaration,
            `$1 ${standardImport}`
        );
    }

    return `${standardImport} ${source}`;
}
export async function runJava(
    source: string,
    testcase?: JavaTestcase
): Promise<JavaExecutionResult> {

    if (
        !testcase ||
        typeof testcase.method !== "string" ||
        testcase.method.trim() === ""
    ) {
        return {
            success: false,
            kind: "VALIDATION_ERROR",
            stdout: "",
            stderr: "",
            message:
                "testcase.method is required"
        };
    }

    if (
        testcase.arguments !== undefined &&
        !Array.isArray(testcase.arguments)
    ) {
        return {
            success: false,
            kind: "VALIDATION_ERROR",
            stdout: "",
            stderr: "",
            message:
                "testcase.arguments must be an array of strings"
        };
    }

    const rawArguments =
        testcase.arguments ?? [];

    if (
        rawArguments.some(
            (value) =>
                typeof value !== "string"
        )
    ) {
        return {
            success: false,
            kind: "VALIDATION_ERROR",
            stdout: "",
            stderr: "",
            message:
                "every testcase argument must be a string"
        };
    }

    const tempDir =
        await fs.mkdtemp(
            path.join(
                os.tmpdir(),
                "yourvision-"
            )
        );

    const solutionPath =
        path.join(
            tempDir,
            "Solution.java"
        );

    const runtimePath =
        path.join(
            tempDir,
            "YourVisionRuntime.java"
        );

    const tracerPath =
        path.join(
            tempDir,
            "YourVisionTracer.java"
        );
    try {
       const preparedSource =
            prepareJavaSource(source);

await fs.writeFile(
    solutionPath,
    preparedSource
);

        await fs.copyFile(
            RUNTIME_FILE,
            runtimePath
        );

        await fs.copyFile(
            TRACER_FILE,
            tracerPath
        );
        const declaresListNode =
            /\bclass\s+ListNode\b/.test(preparedSource);
        const declaresTreeNode =
            /\bclass\s+TreeNode\b/.test(preparedSource);

        if (!declaresListNode) {
            await fs.copyFile(
                LIST_NODE_FILE,
                path.join(tempDir, "LeetCodeListNode.java")
            );
        }

        if (!declaresTreeNode) {
            await fs.copyFile(
                TREE_NODE_FILE,
                path.join(tempDir, "LeetCodeTreeNode.java")
            );
        }
        try {
            await execFileAsync(
                "javac",
                [
                    "--add-modules",
                    "jdk.jdi",
                    "-g",
                    "-d",
                    tempDir,
                    solutionPath,
                    ...(declaresListNode
                        ? []
                        : [path.join(tempDir, "LeetCodeListNode.java")]),
                    ...(declaresTreeNode
                        ? []
                        : [path.join(tempDir, "LeetCodeTreeNode.java")]),
                    runtimePath,
                    tracerPath
                ],
                {
                    timeout: 10000,
                    maxBuffer:
                        1024 * 1024
                }
            );
        } catch (error: any) {
            return {
                success: false,
                kind:
                    isTimeout(error)
                        ? "TIMEOUT"
                        : "COMPILATION_ERROR",
                stdout:
                    error.stdout ?? "",
                stderr:
                    error.stderr ??
                    error.message ??
                    "",
                message:
                    isTimeout(error)
                        ? "Java compilation timed out"
                        : "Java compilation failed"
            };
        }

        const childArguments = [
            "--add-modules",
            "jdk.jdi",
            "-cp",
            tempDir,
            "YourVisionTracer",
            tempDir,
            "YourVisionRuntime",
            "Solution",
            testcase.method,
            ...(
                rawArguments.length === 0
                    ? [NO_ARGS]
                    : rawArguments.map(
                        (value) =>
                            "__YV_B64__" +
                            Buffer.from(
                                value,
                                "utf8"
                            ).toString("base64")
                    )
            )
        ];

        try {
            const {
                stdout,
                stderr
            } =
                await execFileAsync(
                    "java",
                    childArguments,
                    {
                        timeout: 5000,
                        maxBuffer:
                            1024 * 1024
                    }
                );
            const trace =
                parseTrace(stdout, source);

            const traceLimited =
                trace.events.some(
                    (event) =>
                        event.type ===
                        "TRACE_LIMIT"
                );

            if (traceLimited) {
                return {
                    success: false,
                    kind: "TIMEOUT",
                    stdout,
                    stderr,
                    trace,
                    states:
                        buildStates(trace),
                    message:
                        "Java execution exceeded trace event limit"
                };
            }

            return {
                success: true,
                kind: "OK",
                result:
                    extractMarker(
                        stdout,
                        "__YV_RESULT__="
                    ),
                stdout,
                stderr,
                trace,
                states:
                    buildStates(trace)
            };

        } catch (error: any) {

            if (isTimeout(error)) {
                const stdout =
                    error.stdout ?? "";

                const trace =
                    parseTrace(stdout, source);

                if (
                    !trace.events.some(
                        (event) => event.type === "TRACE_LIMIT"
                    )
                ) {
                    const lastSequence =
                        trace.events.at(-1)?.sequence ?? 0;
                    const timeoutEvent: ExecutionEvent = {
                        sequence: lastSequence + 1,
                        type: "TIMEOUT",
                        data: {
                            message:
                                "Java execution exceeded 3000 ms"
                        }
                    };

                    if (trace.events.length >= MAX_TRACE_EVENTS) {
                        trace.events[MAX_TRACE_EVENTS - 1] = timeoutEvent;
                    } else {
                        trace.events.push(timeoutEvent);
                    }
                }

                return {
                    success: false,
                    kind: "TIMEOUT",
                    stdout,
                    stderr:
                        error.stderr ?? "",
                    message:
                        "Java execution exceeded 3000 ms",
                    trace,
                    states:
                        buildStates(trace)
                };
            }

            const stdout =
                error.stdout ?? "";

            const stderr =
                error.stderr ??
                error.message ??
                "";

            const errorType =
                extractMarker(
                    stderr,
                    "__YV_EXCEPTION_TYPE__="
                );

            const message =
                extractMarker(
                    stderr,
                    "__YV_EXCEPTION_MESSAGE__="
                );

            const trace =
                    parseTrace(stdout, source);

            return {
                success: false,
                kind:
                    errorType
                        ? "RUNTIME_ERROR"
                        : "HARNESS_ERROR",
                trace,
                states:
                    buildStates(trace),
                stdout,
                stderr,
                ...(errorType
                    ? { errorType }
                    : {}),
                message:
                    message ||
                    "Java execution failed"
            };
        }

    } finally {
        await fs.rm(
            tempDir,
            {
                recursive: true,
                force: true
            }
        );
    }
}

function extractMarker(
    text: string,
    marker: string
): string {

    const line =
        text
            .split(/\r?\n/)
            .find(
                (value) =>
                    value.startsWith(
                        marker
                    )
            );

    if (!line) {
        return "";
    }

    return line.slice(
        marker.length
    );
}

function isTimeout(
    error: any
): boolean {

    return Boolean(
        error?.killed ||
        error?.code ===
            "ETIMEDOUT" ||
        error?.signal ===
            "SIGTERM"
    );
}


function parseTrace(
    stdout: string,
    source: string
): ExecutionTrace {
    const events: ExecutionEvent[] = [];

    for (const line of stdout.split(/\r?\n/)) {
        if (!line.startsWith("__YV_EVENT__=")) {
            continue;
        }

        const payload = line.slice(
            "__YV_EVENT__=".length
        );

        try {
            const parsed =
                JSON.parse(payload) as ExecutionEvent;

            if (
                typeof parsed.sequence !== "number" ||
                typeof parsed.type !== "string"
            ) {
                continue;
            }

            events.push(parsed);

        } catch {
            // Ignore malformed trace records rather than
            // failing the user's program execution.
        }
    }

    events.sort(
        (a, b) =>
            a.sequence - b.sequence
    );

    attachMethodDisplayLines(events, source);

    const enriched = enrichTrace({
        version: 1,
        events
    });

    if (enriched.events.length <= MAX_TRACE_EVENTS) {
        return enriched;
    }

    const existingLimit = enriched.events.findIndex(
        event => event.type === "TRACE_LIMIT"
    );
    const boundedEvents = enriched.events.slice(
        0,
        Math.min(
            MAX_TRACE_EVENTS,
            existingLimit >= 0
                ? existingLimit + 1
                : MAX_TRACE_EVENTS - 1
        )
    );

    if (existingLimit < 0) {
        boundedEvents.push({
            sequence: boundedEvents.length + 1,
            type: "TRACE_LIMIT",
            data: {
                maxEvents: MAX_TRACE_EVENTS
            }
        });
    }

    return {
        version: 1,
        events: boundedEvents
    };
}

function attachMethodDisplayLines(
    events: ExecutionEvent[],
    source: string
): void {
    const candidates = methodDeclarationLines(source);

    for (const event of events) {
        if (
            event.type !== "METHOD_ENTER" ||
            !event.method ||
            typeof event.line !== "number" ||
            event.line < 1
        ) {
            continue;
        }

        const eventLine = event.line;
        const declarations = candidates.get(event.method);
        const declaration = declarations
            ?.filter(line => line <= eventLine)
            .at(-1);

        if (declaration !== undefined) {
            event.data = {
                ...(event.data ?? {}),
                displayLine: declaration
            };
        }
    }
}

function methodDeclarationLines(source: string): Map<string, number[]> {
    const lines = new Map<string, number[]>();
    const methodCall = /\b([A-Za-z_$][\w$]*)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = methodCall.exec(source)) !== null) {
        const name = match[1];
        if (!name) continue;

        let prefix = source.slice(0, match.index);
        const boundary = Math.max(
            prefix.lastIndexOf("{"),
            prefix.lastIndexOf("}"),
            prefix.lastIndexOf(";")
        );
        prefix = prefix.slice(boundary + 1)
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "")
            .replace(/@[^\s(]+(?:\([^)]*\))?\s*/g, "")
            .trim();

        if (/^(return|throw|new|if|while|switch|catch|synchronized)\b/.test(prefix)) {
            continue;
        }

        const declarationPrefix =
            /^(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^>]+>\s*)?[\w$.[\]<>?,]+$/;
        if (!declarationPrefix.test(prefix)) continue;

        const line = source.slice(0, match.index).split(/\r?\n/).length;
        const existing = lines.get(name) ?? [];
        existing.push(line);
        lines.set(name, existing);
    }

    return lines;
}
