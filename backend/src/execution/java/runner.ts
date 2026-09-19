import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import type { ExecutionTrace, ExecutionEvent } from "../trace/schema.js";

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
        await fs.writeFile(
            solutionPath,
            source
        );

        await fs.copyFile(
            RUNTIME_FILE,
            runtimePath
        );

        await fs.copyFile(
            TRACER_FILE,
            tracerPath
        );

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
                    runtimePath,
                    tracerPath
                ],
                {
                    timeout: 5000,
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
                    : rawArguments
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
                        timeout: 3000,
                        maxBuffer:
                            1024 * 1024
                    }
                );

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
                trace:
                    parseTrace(stdout)
            };

        } catch (error: any) {

            if (isTimeout(error)) {
                const stdout =
                    error.stdout ?? "";

                const trace =
                    parseTrace(stdout);

                const lastSequence =
                    trace.events.at(-1)
                        ?.sequence ?? 0;

                trace.events.push({
                    sequence:
                        lastSequence + 1,
                    type: "TIMEOUT",
                    data: {
                        message:
                            "Java execution exceeded 3000 ms"
                    }
                });

                return {
                    success: false,
                    kind: "TIMEOUT",
                    stdout,
                    stderr:
                        error.stderr ?? "",
                    message:
                        "Java execution exceeded 3000 ms",
                    trace
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

            return {
                success: false,
                kind:
                    errorType
                        ? "RUNTIME_ERROR"
                        : "HARNESS_ERROR",
                trace:
                    parseTrace(stdout),
                stdout,
                stderr,
                errorType:
                    errorType || undefined,
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
    stdout: string
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

    return {
        version: 1,
        events
    };
}
