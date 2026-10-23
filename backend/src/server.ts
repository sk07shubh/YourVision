import { runJava } from "./execution/java/runner.js";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

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

    const ready = checks.java && checks.javac && checks.jdi;
    res.status(ready ? 200 : 503).json({
        status: ready ? "ready" : "not_ready",
        dependencies: checks,
        executionEnabled: process.env.NODE_ENV !== "production",
        executionNote: process.env.NODE_ENV === "production"
            ? "Execution is fail-closed until a separately isolated execution worker is integrated."
            : "Local execution mode; do not expose this service to untrusted public traffic."
    });
});

app.post("/visualize", async (req, res, next) => {
    if (process.env.NODE_ENV === "production") {
        res.status(503).json({
            success: false,
            code: "EXECUTION_SANDBOX_UNAVAILABLE",
            message: "Code execution is temporarily unavailable until the isolated execution worker is configured."
        });
        return;
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
