import { getJavaRuntimeSources, interpretRemoteJavaExecution } from "../src/execution/java/runner.js";

const baseUrl = process.env.YV_EXECUTION_WORKER_URL?.trim().replace(/\/$/, "");
const token = process.env.YV_EXECUTION_WORKER_TOKEN?.trim();
const bypassSecret = process.env.YV_WORKER_VERCEL_BYPASS_SECRET?.trim();

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

assert(typeof baseUrl === "string" && /^https:\/\//.test(baseUrl), "Set YV_EXECUTION_WORKER_URL to the deployed worker HTTPS URL");
assert(typeof token === "string" && token.length > 0, "Set YV_EXECUTION_WORKER_TOKEN to the worker bearer token");
assert(typeof bypassSecret === "string" && bypassSecret.length > 0, "Set YV_WORKER_VERCEL_BYPASS_SECRET to the worker deployment protection bypass secret");

const readinessResponse = await fetch(new URL("/readyz", baseUrl), {
    headers: { "x-vercel-protection-bypass": bypassSecret },
    signal: AbortSignal.timeout(8000)
});
assert(readinessResponse.ok, `execution worker readiness failed with HTTP ${readinessResponse.status}`);
const readiness = await readinessResponse.json() as {
    status?: string;
    sandbox?: { available?: boolean; message?: string };
};
assert(readiness.status === "ready", "execution worker did not report ready");
assert(readiness.sandbox?.available === true, `platform sandbox is not ready: ${readiness.sandbox?.message ?? "no details"}`);

const source = `import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

class Solution {
    public String verifySandbox() {
        boolean workerSecretHidden = System.getenv("YV_EXECUTION_WORKER_TOKEN") == null;
        boolean systemFileWriteBlocked;
        try (var ignored = Files.newByteChannel(Path.of("/etc/passwd"), StandardOpenOption.WRITE)) {
            systemFileWriteBlocked = false;
        } catch (IOException | SecurityException expected) {
            systemFileWriteBlocked = true;
        }
        boolean outboundNetworkBlocked;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("1.1.1.1", 53), 750);
            outboundNetworkBlocked = false;
        } catch (Exception expected) {
            outboundNetworkBlocked = true;
        }
        return "workerSecretHidden=" + workerSecretHidden
            + ",systemFileWriteBlocked=" + systemFileWriteBlocked
            + ",outboundNetworkBlocked=" + outboundNetworkBlocked;
    }
}`;

const runtimeSources = await getJavaRuntimeSources();
const response = await fetch(new URL("/visualize", baseUrl), {
    method: "POST",
    headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-vercel-protection-bypass": bypassSecret
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
assert(payload.protocol === "yv-java-raw-v1" && (payload.phase === "compile" || payload.phase === "run") && typeof payload.stdout === "string" &&
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
const sandboxChecks = String(execution.result);
assert(
    sandboxChecks === "workerSecretHidden=true,systemFileWriteBlocked=true,outboundNetworkBlocked=true",
    `sandbox boundary assertion failed: ${sandboxChecks}`
);

console.log("PASS: deployed worker hides its bearer secret from Java, blocks actual system-file write access, and blocks outbound network access");
