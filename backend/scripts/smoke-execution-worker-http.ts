import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getJavaRuntimeSources, interpretRemoteJavaExecution } from "../src/execution/java/runner.js";

const baseUrl = process.env.YV_EXECUTION_WORKER_URL?.trim().replace(/\/$/, "");
const token = process.env.YV_EXECUTION_WORKER_TOKEN?.trim();

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

assert(typeof baseUrl === "string" && /^https:\/\//.test(baseUrl), "Set YV_EXECUTION_WORKER_URL to the deployed worker HTTPS URL");
assert(typeof token === "string" && token.length > 0, "Set YV_EXECUTION_WORKER_TOKEN to the worker bearer token");

const readinessResponse = await fetch(new URL("/readyz", baseUrl), {
    signal: AbortSignal.timeout(8000)
});
assert(readinessResponse.ok, `execution worker readiness failed with HTTP ${readinessResponse.status}`);
const readiness = await readinessResponse.json() as {
    status?: string;
    sandbox?: { available?: boolean; message?: string };
};
assert(readiness.status === "ready", "execution worker did not report ready");
assert(readiness.sandbox?.available === true, `platform sandbox is not ready: ${readiness.sandbox?.message ?? "no details"}`);

const source = `import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;

class Solution {
    public boolean verifySandbox() {
        boolean workerSecretHidden = System.getenv("YV_EXECUTION_WORKER_TOKEN") == null;
        boolean systemFilesReadOnly = !Files.isWritable(Path.of("/etc/passwd"));
        boolean outboundNetworkBlocked;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("1.1.1.1", 53), 750);
            outboundNetworkBlocked = false;
        } catch (Exception expected) {
            outboundNetworkBlocked = true;
        }
        return workerSecretHidden && systemFilesReadOnly && outboundNetworkBlocked;
    }
}`;

const runtimeSources = await getJavaRuntimeSources();
const response = await fetch(new URL("/visualize", baseUrl), {
    method: "POST",
    headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
        language: "java",
        source,
        testcase: { method: "verifySandbox", arguments: [] },
        runtimeSources
    }),
    signal: AbortSignal.timeout(115_000)
});
const payload = await response.json() as {
    protocol?: string;
    phase?: "compile" | "run";
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    timedOut?: boolean;
    code?: string;
    message?: string;
};
assert(response.ok, `sandbox verification request failed with HTTP ${response.status}: ${payload.code ?? payload.message ?? "no details"}`);
assert(payload.protocol === "yv-java-raw-v1" && payload.phase && typeof payload.stdout === "string" &&
    typeof payload.stderr === "string" && typeof payload.timedOut === "boolean",
    `worker returned an unexpected protocol: ${payload.message ?? "no details"}`);
const execution = interpretRemoteJavaExecution(source, {
    phase: payload.phase,
    stdout: payload.stdout,
    stderr: payload.stderr,
    exitCode: payload.exitCode ?? null,
    timedOut: payload.timedOut
});
assert(execution.kind === "OK", `sandbox test did not execute successfully: ${execution.kind} ${execution.message ?? ""}`);
assert(execution.result === "true", `sandbox boundary assertion failed: ${String(execution.result)}`);

console.log("PASS: deployed worker hides its bearer secret from Java, blocks system-file writes, and blocks outbound network access");
