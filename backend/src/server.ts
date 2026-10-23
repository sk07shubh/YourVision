import { getJavaRuntimeSources, interpretRemoteJavaExecution, runJava } from "./execution/java/runner.js";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { checkExecutionSandbox, isSandboxConfigured } from "./execution/java/sandbox.js";

const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const execFileAsync = promisify(execFile);
const MAX_SOURCE_BYTES = 128 * 1024;
const MAX_TESTCASE_BYTES = 64 * 1024;
const MAX_CONCURRENT_EXECUTIONS = parsePositiveInteger(process.env.MAX_CONCURRENT_EXECUTIONS, 2);

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    if (value === undefined || value.trim() === "") return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getExecutionWorkerUrl(): string | undefined {
    const value = process.env.YV_EXECUTION_WORKER_URL?.trim();
    if (!value) return undefined;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
        return url.toString().replace(/\/$/, "");
    } catch {
        return undefined;
    }
}

function getExecutionWorkerToken(): string | undefined {
    const value = process.env.YV_EXECUTION_WORKER_TOKEN?.trim();
    return value ? value : undefined;
}

function getWorkerVercelBypassSecret(): string | undefined {
    const value = process.env.YV_WORKER_VERCEL_BYPASS_SECRET?.trim();
    return value ? value : undefined;
}

export const app = express();
let activeExecutions = 0;

app.disable("x-powered-by");
app.use(cors({
    origin(origin, callback) {
        callback(null, typeof origin === "string" && CHROME_EXTENSION_ORIGIN.test(origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "256kb", strict: true }));

app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "yourvision-backend" });
});

app.get("/readyz", async (_req, res) => {
    const checks = { java: false, javac: false, jdi: false };
    try {
        await execFileAsync("java", ["-version"], { timeout: 3000 });
        checks.java = true;
    } catch { /* Keep readiness responses free of process output. */ }
    try {
        await execFileAsync("javac", ["-version"], { timeout: 3000 });
        checks.javac = true;
    } catch { /* Keep readiness responses free of process output. */ }
    try {
        const { stdout } = await execFileAsync("java", ["--list-modules"], { timeout: 3000 });
        checks.jdi = stdout.split("\n").some(line => line.startsWith("jdk.jdi@"));
    } catch { /* Keep readiness responses free of process output. */ }

    const workerUrl = getExecutionWorkerUrl();
    let workerReady = false;
    if (workerUrl) {
        try {
            const bypassSecret = getWorkerVercelBypassSecret();
            const workerResponse = await fetch(new URL("/readyz", workerUrl), {
                headers: bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {},
                signal: AbortSignal.timeout(3500)
            });
            workerReady = workerResponse.ok;
        } catch { /* A failed worker health check keeps this API unready. */ }
    }

    const sandbox = workerUrl
        ? { configured: Boolean(getExecutionWorkerToken()), available: workerReady, mode: "worker" as const,
            message: workerReady ? "Restricted execution worker is reachable." : "Restricted execution worker is unavailable." }
        : await checkExecutionSandbox();
    const productionExecutionReady = process.env.NODE_ENV !== "production" ||
        (workerUrl ? Boolean(getExecutionWorkerToken()) && workerReady : isSandboxConfigured() && sandbox.available);
    const localRuntimeReady = checks.java && checks.javac && checks.jdi;
    const ready = process.env.NODE_ENV === "production" && workerUrl
        ? productionExecutionReady
        : localRuntimeReady && productionExecutionReady;
    res.status(ready ? 200 : 503).json({
        status: ready ? "ready" : "not_ready",
        dependencies: checks,
        sandbox,
        executionEnabled: process.env.NODE_ENV !== "production" || productionExecutionReady,
        executionNote: process.env.NODE_ENV === "production"
            ? "Production execution requires a reachable authenticated execution worker or a verified platform sandbox."
            : "Local execution mode; do not expose this service to untrusted public traffic."
    });
});

app.post("/visualize", async (req, res, next) => {
    if (process.env.YV_EXECUTION_WORKER_MODE === "true") {
        const expectedToken = getExecutionWorkerToken();
        const suppliedToken = req.header("authorization");
        if (!expectedToken || suppliedToken !== `Bearer ${expectedToken}`) {
            res.status(401).json({ success: false, code: "EXECUTION_WORKER_UNAUTHORIZED", message: "Unauthorized execution worker request." });
            return;
        }
    }

    const workerUrl = getExecutionWorkerUrl();
    if (process.env.NODE_ENV === "production" && workerUrl && !getExecutionWorkerToken()) {
        res.status(503).json({
            success: false,
            code: "EXECUTION_WORKER_MISCONFIGURED",
            message: "Code execution is unavailable because the execution worker credentials are not configured."
        });
        return;
    }
    if (process.env.NODE_ENV === "production" && !workerUrl) {
        const sandbox = await checkExecutionSandbox();
        if (!isSandboxConfigured() || !sandbox.available) {
            res.status(503).json({
                success: false,
                code: "EXECUTION_SANDBOX_UNAVAILABLE",
                message: "Code execution is unavailable because no verified production sandbox is ready."
            });
            return;
        }
    }

    if (activeExecutions >= MAX_CONCURRENT_EXECUTIONS) {
        res.setHeader("Retry-After", "2");
        res.status(429).json({
            success: false,
            code: "EXECUTION_CAPACITY_EXCEEDED",
            message: "The execution service is busy. Please retry shortly."
        });
        return;
    }

    const body: unknown = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ success: false, message: "A JSON object body is required." });
        return;
    }

    const { language, source, testcase } = body as Record<string, unknown>;
    if (language !== "java") {
        res.status(400).json({ success: false, message: "Only Java is supported right now." });
        return;
    }
    if (typeof source !== "string" || source.trim() === "") {
        res.status(400).json({ success: false, message: "A non-empty source string is required." });
        return;
    }
    if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
        res.status(413).json({ success: false, message: "Source exceeds the 128 KiB limit." });
        return;
    }
    if (!testcase || typeof testcase !== "object" || Array.isArray(testcase)) {
        res.status(400).json({ success: false, message: "A testcase object is required." });
        return;
    }
    if (Buffer.byteLength(JSON.stringify(testcase), "utf8") > MAX_TESTCASE_BYTES) {
        res.status(413).json({ success: false, message: "Testcase exceeds the 64 KiB limit." });
        return;
    }

    activeExecutions++;
    try {
        if (workerUrl && process.env.YV_EXECUTION_WORKER_MODE !== "true") {
            const token = getExecutionWorkerToken();
            if (!token) {
                res.status(503).json({
                    success: false,
                    code: "EXECUTION_WORKER_MISCONFIGURED",
                    message: "Code execution is unavailable because the execution worker credentials are not configured."
                });
                return;
            }
            let workerResponse: Response;
            try {
                const runtimeSources = await getJavaRuntimeSources();
                const bypassSecret = getWorkerVercelBypassSecret();
                workerResponse = await fetch(new URL("/visualize", workerUrl), {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${token}`,
                        ...(bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {})
                    },
                    body: JSON.stringify({ language, source, testcase, runtimeSources }),
                    signal: AbortSignal.timeout(115_000)
                });
            } catch {
                res.status(502).json({
                    success: false,
                    code: "EXECUTION_WORKER_UNAVAILABLE",
                    message: "The isolated execution worker could not be reached. Please retry shortly."
                });
                return;
            }
            let responseBody: unknown;
            try {
                responseBody = await workerResponse.json();
            } catch {
                res.status(502).json({
                    success: false,
                    code: "EXECUTION_WORKER_INVALID_RESPONSE",
                    message: "The isolated execution worker returned an invalid response."
                });
                return;
            }
            if (responseBody && typeof responseBody === "object" &&
                "protocol" in responseBody && responseBody.protocol === "yv-java-raw-v1") {
                const raw = responseBody as unknown as {
                    phase: "compile" | "run";
                    stdout: string;
                    stderr: string;
                    exitCode: number | null;
                    timedOut: boolean;
                };
                const execution = interpretRemoteJavaExecution(source, raw);
                res.status(200).json({ language, testcase, execution });
                return;
            }
            res.status(workerResponse.status).json(responseBody);
            return;
        }

        const result = await runJava(source, testcase as Parameters<typeof runJava>[1]);
        const status = result.kind === "VALIDATION_ERROR" ? 400 : 200;
        res.status(status).json({ language, testcase, execution: result });
    } catch (error) {
        next(error);
    } finally {
        activeExecutions--;
    }
});

const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = typeof error === "object" && error !== null && "status" in error &&
        typeof error.status === "number" ? error.status : 500;
    if (status >= 500) console.error("YourVision request failed", error instanceof Error ? error.message : "unknown error");
    if (res.headersSent) return;
    res.status(status === 413 ? 413 : status >= 400 && status < 500 ? status : 500).json({
        success: false,
        message: status === 413 ? "Request body is too large." :
            status >= 400 && status < 500 ? "Invalid request." :
                "The backend could not complete the request."
    });
};
app.use(errorHandler);

export function startServer(
    port = parsePositiveInteger(process.env.PORT, 3000),
    host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1")
) {
    const server = app.listen(port, host, () => {
        console.log(`YourVision backend listening on ${host}:${port}`);
    });
    return server;
}

const invokedPath = process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href
    : undefined;

if (invokedPath === import.meta.url) startServer();

export default app;
