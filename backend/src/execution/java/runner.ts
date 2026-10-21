import { execFile } from "child_process";
import { spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import type { ExecutionTrace, ExecutionEvent, TraceState } from "../trace/schema.js";
import { buildStates } from "../trace/stateBuilder.js";
import { enrichTrace } from "../trace/enrichTrace.js";

const MAX_TRACE_EVENTS = 5000;
const JAVA_EXECUTION_TIMEOUT_MS = 15000;
const JAVA_EXECUTION_MAX_BUFFER = 8 * 1024 * 1024;

const execFileAsync = promisify(execFile);

/**
 * Runs the tracer in its own POSIX process group so a timeout can terminate
 * both the tracer JVM and the JDI-launched debuggee. Output remains buffered
 * and bounded like execFile's stdout/stderr capture.
 */
function runJavaTracer(
    args: string[],
    timeoutMs = JAVA_EXECUTION_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn("java", args, {
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"]
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let timedOut = false;
        let bufferExceeded = false;
        let settled = false;

        const stdoutText = () => Buffer.concat(stdoutChunks).toString("utf8");
        const stderrText = () => Buffer.concat(stderrChunks).toString("utf8");

        const killProcessTree = () => {
            if (child.pid === undefined) return;

            try {
                if (process.platform !== "win32") {
                    // The negative PID targets the entire process group.
                    process.kill(-child.pid, "SIGKILL");
                } else {
                    child.kill("SIGKILL");
                }
            } catch (error) {
                // ESRCH means the process/group has already exited.
                if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
                    // Fall back to killing the direct child if group signalling
                    // is unavailable; do not mask the original timeout.
                    child.kill("SIGKILL");
                }
            }
        };

        const timer = setTimeout(() => {
            timedOut = true;
            killProcessTree();
        }, timeoutMs);

        const fail = (error: NodeJS.ErrnoException & {
            stdout?: string;
            stderr?: string;
            killed?: boolean;
            signal?: NodeJS.Signals | null;
        }) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            error.stdout = stdoutText();
            error.stderr = stderrText();
            reject(error);
        };

        child.stdout.on("data", (chunk: Buffer) => {
            if (settled || bufferExceeded) return;
            stdoutBytes += chunk.length;
            if (stdoutBytes > JAVA_EXECUTION_MAX_BUFFER) {
                bufferExceeded = true;
                killProcessTree();
                return;
            }
            stdoutChunks.push(chunk);
        });

        child.stderr.on("data", (chunk: Buffer) => {
            if (settled || bufferExceeded) return;
            stderrBytes += chunk.length;
            if (stderrBytes > JAVA_EXECUTION_MAX_BUFFER) {
                bufferExceeded = true;
                killProcessTree();
                return;
            }
            stderrChunks.push(chunk);
        });

        child.on("error", (error) => {
            fail(error as NodeJS.ErrnoException & {
                stdout?: string;
                stderr?: string;
            });
        });

        child.on("close", (code, signal) => {
            if (settled) return;
            clearTimeout(timer);

            if (timedOut) {
                const error = Object.assign(
                    new Error(`Java execution exceeded ${timeoutMs} ms`),
                    {
                        code: "ETIMEDOUT",
                        killed: true,
                        signal,
                        stdout: stdoutText(),
                        stderr: stderrText()
                    }
                );
                settled = true;
                reject(error);
                return;
            }

            if (bufferExceeded) {
                const error = Object.assign(
                    new Error("stdout/stderr maxBuffer exceeded"),
                    {
                        code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
                        killed: true,
                        signal,
                        stdout: stdoutText(),
                        stderr: stderrText()
                    }
                );
                settled = true;
                reject(error);
                return;
            }

            if (code !== 0) {
                const error = Object.assign(
                    new Error(`Java tracer exited with code ${code}`),
                    {
                        code,
                        signal,
                        stdout: stdoutText(),
                        stderr: stderrText()
                    }
                );
                settled = true;
                reject(error);
                return;
            }

            settled = true;
            resolve({
                stdout: stdoutText(),
                stderr: stderrText()
            });
        });
    });
}

export interface JavaDesignOperation {
    method: string;
    arguments?: string[];
}

export interface JavaTestcase {
    /** Single-method execution (existing LeetCode format). */
    method?: string;
    arguments?: string[];
    /** Design-class execution: instantiate once, then invoke operations in order. */
    mode?: "method" | "design";
    className?: string;
    constructorArguments?: string[];
    operations?: JavaDesignOperation[];
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
const GRAPH_NODE_FILE = fileURLToPath(
    new URL(
        "./LeetCodeGraphNode.java",
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
function declaresType(source: string, typeName: string): boolean {
    // LeetCode snippets sometimes include the commented-out type definition
    // in their problem boilerplate. It must not suppress our compatibility
    // type, or ordinary references to ListNode/TreeNode/Node fail at javac time.
    const code = source
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\r\n]*/g, " ");
    return new RegExp("\\bclass\\s+" + typeName + "\\b").test(code);
}
export async function runJava(
    source: string,
    testcase?: JavaTestcase
): Promise<JavaExecutionResult> {

    const designMode = testcase?.mode === "design";
    if (!testcase || (!designMode &&
        (typeof testcase.method !== "string" || testcase.method.trim() === "")) ||
        (designMode && (
            typeof testcase.className !== "string" ||
            !/^[A-Za-z_$][\w$]*$/.test(testcase.className) ||
            !Array.isArray(testcase.operations) ||
            testcase.operations.length === 0 ||
            testcase.operations.some(operation =>
                !operation || typeof operation.method !== "string" ||
                !/^[A-Za-z_$][\w$]*$/.test(operation.method) ||
                (operation.arguments !== undefined && !Array.isArray(operation.arguments))
            )
        ))) {
        return {
            success: false,
            kind: "VALIDATION_ERROR",
            stdout: "",
            stderr: "",
            message:
                designMode ? "Provide a valid design testcase with className and operations." : "testcase.method is required"
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

    const rawArguments = designMode
        ? [
            ...(testcase.constructorArguments ?? []),
            ...(testcase.operations ?? []).flatMap(operation => operation.arguments ?? [])
        ]
        : (testcase.arguments ?? []);

    if (designMode && (
        (testcase.constructorArguments !== undefined && !Array.isArray(testcase.constructorArguments)) ||
        (testcase.constructorArguments ?? []).some(value => typeof value !== "string")
    )) {
        return {
            success: false,
            kind: "VALIDATION_ERROR",
            stdout: "",
            stderr: "",
            message: "testcase.constructorArguments must be an array of strings"
        };
    }

    if (designMode && (testcase.operations ?? []).some(operation =>
        (operation.arguments ?? []).some(value => typeof value !== "string")
    )) {
        return {
            success: false,
            kind: "VALIDATION_ERROR",
            stdout: "",
            stderr: "",
            message: "every design operation argument must be a string"
        };
    }

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
            declaresType(preparedSource, "ListNode");
        const declaresTreeNode =
            declaresType(preparedSource, "TreeNode");
        const declaresGraphNode =
            declaresType(preparedSource, "Node");

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

        if (!declaresGraphNode) {
            await fs.copyFile(
                GRAPH_NODE_FILE,
                path.join(tempDir, "LeetCodeGraphNode.java")
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
                    ...(declaresGraphNode
                        ? []
                        : [path.join(tempDir, "LeetCodeGraphNode.java")]),
                    runtimePath,
                    tracerPath
                ],
                {
                    // CI runners can be slower when several Java corpus cases compile in sequence.
                    timeout: 20000,
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

        const encodeArgument = (value: string) =>
            "__YV_B64__" + Buffer.from(value, "utf8").toString("base64");
        const encodedArguments = (values: string[]) =>
            values.length === 0 ? [NO_ARGS] : values.map(encodeArgument);

        const invocationArguments = designMode
            ? [
                "__YV_DESIGN__",
                String((testcase.constructorArguments ?? []).length),
                ...encodedArguments(testcase.constructorArguments ?? []),
                String((testcase.operations ?? []).length),
                ...(testcase.operations ?? []).flatMap(operation => [
                    operation.method,
                    String((operation.arguments ?? []).length),
                    ...encodedArguments(operation.arguments ?? [])
                ])
            ]
            : [
                testcase.method!,
                ...encodedArguments(testcase.arguments ?? [])
            ];

        const childArguments = [
            "--add-modules",
            "jdk.jdi",
            "-cp",
            tempDir,
            "YourVisionTracer",
            tempDir,
            "YourVisionRuntime",
            designMode ? (testcase.className ?? "Solution") : "Solution",
            ...invocationArguments
        ];

        try {
            const {
                stdout,
                stderr
            } =
                await runJavaTracer(childArguments, designMode ? 15000 : JAVA_EXECUTION_TIMEOUT_MS);
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

            const resultMarker = stdout
                .split(/\r?\n/)
                .find(line => line.startsWith("__YV_RESULT__="));

            // A zero exit from the tracer is not enough to call a design
            // session successful: the debuggee can disconnect before the
            // runtime serializes its final result. Returning OK with an
            // undefined result makes the extension appear to fail silently.
            if (resultMarker === undefined) {
                const lastEvent = trace.events.at(-1);
                const diagnostic = lastEvent
                    ? `Last trace event: ${lastEvent.type} (sequence ${lastEvent.sequence}).`
                    : "The tracer produced no structured trace events.";

                return {
                    success: false,
                    kind: "HARNESS_ERROR",
                    stdout,
                    stderr,
                    trace,
                    states: buildStates(trace),
                    message:
                        "Java execution ended before the runtime emitted its final result marker. " +
                        diagnostic +
                        (stderr.trim()
                            ? ` stderr: ${stderr.trim().split(/\\r?\\n/).slice(-4).join(" | ")}`
                            : "")
                };
            }

            return {
                success: true,
                kind: "OK",
                result: resultMarker.slice("__YV_RESULT__=".length),
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
                                `Java execution exceeded ${designMode ? 15000 : JAVA_EXECUTION_TIMEOUT_MS} ms`
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
                        `Java execution exceeded ${designMode ? 15000 : JAVA_EXECUTION_TIMEOUT_MS} ms`,
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
                // Keep the actual tracer failure visible. A generic
                // message hides JDI/harness crashes and makes Java snippets
                // fail without actionable diagnostics in the UI.
                message:
                    message ||
                    (stderr.trim()
                        ? `Java tracer failed: ${stderr.trim().split(/\\r?\\n/).slice(-8).join(" | ")}`
                        : "Java execution failed (the tracer exited without diagnostic output)")
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
        Number(error?.code) ===
            124 ||
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
    }, source);

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
