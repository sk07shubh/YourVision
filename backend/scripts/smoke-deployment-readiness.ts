import { once } from "node:events";
import { startServer } from "../src/server.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const server = startServer(0);
await once(server, "listening");

try {
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("backend did not bind a TCP address");
    assert(address.address === "127.0.0.1", `local backend should bind to loopback, got ${address.address}`);

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${baseUrl}/health`);
    assert(health.status === 200, "health endpoint should respond");
    const healthBody = await health.json() as { status?: string };
    assert(healthBody.status === "ok", "health response contract mismatch");

    const ready = await fetch(`${baseUrl}/readyz`);
    assert(ready.status === 200, "Java/JDI runtime should be ready in CI");
    const readyBody = await ready.json() as { dependencies?: Record<string, boolean> };
    assert(readyBody.dependencies?.java === true, "java runtime check failed");
    assert(readyBody.dependencies?.javac === true, "javac runtime check failed");
    assert(readyBody.dependencies?.jdi === true, "jdk.jdi module check failed");

    const oversized = await fetch(`${baseUrl}/visualize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            language: "java",
            source: "class Solution { }",
            testcase: { method: "solve", arguments: [], extra: "x".repeat(140 * 1024) }
        })
    });
    assert(oversized.status === 413, "oversized testcase should be rejected before execution");

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
        const blocked = await fetch(`${baseUrl}/visualize`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ language: "java", source: "class Solution {}", testcase: { method: "solve", arguments: [] } })
        });
        assert(blocked.status === 503, "production must fail closed without an isolated execution worker");
        const blockedBody = await blocked.json() as { code?: string };
        assert(blockedBody.code === "EXECUTION_SANDBOX_UNAVAILABLE", "production isolation guard response mismatch");
    } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
    }

    const previousWorkerUrl = process.env.YV_EXECUTION_WORKER_URL;
    const previousWorkerToken = process.env.YV_EXECUTION_WORKER_TOKEN;
    const previousWorkerMode = process.env.YV_EXECUTION_WORKER_MODE;
    const originalFetch = globalThis.fetch;
    let workerSawAuthorization = false;
    process.env.NODE_ENV = "production";
    process.env.YV_EXECUTION_WORKER_URL = "https://worker.example";
    process.env.YV_EXECUTION_WORKER_TOKEN = "test-only-worker-token";
    delete process.env.YV_EXECUTION_WORKER_MODE;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://worker.example/readyz")) {
            return new Response(JSON.stringify({ status: "ready" }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.startsWith("https://worker.example/visualize")) {
            workerSawAuthorization = new Headers(init?.headers).get("authorization") === "Bearer test-only-worker-token";
            return new Response(JSON.stringify({ success: true, execution: { kind: "OK", success: true } }), {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        }
        return originalFetch(input, init);
    }) as typeof fetch;
    try {
        const readyViaWorker = await originalFetch(`${baseUrl}/readyz`);
        assert(readyViaWorker.status === 200, "production API should become ready when its authenticated worker is reachable");

        const proxied = await originalFetch(`${baseUrl}/visualize`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ language: "java", source: "class Solution {}", testcase: { method: "solve", arguments: [] } })
        });
        assert(proxied.status === 200, "production API should proxy execution to its configured worker");
        assert(workerSawAuthorization, "execution worker proxy must send the bearer token");

        process.env.YV_EXECUTION_WORKER_MODE = "true";
        const unauthorizedWorkerRequest = await originalFetch(`${baseUrl}/visualize`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ language: "java", source: "class Solution {}", testcase: { method: "solve", arguments: [] } })
        });
        assert(unauthorizedWorkerRequest.status === 401, "execution worker must reject unauthenticated execution requests");
    } finally {
        globalThis.fetch = originalFetch;
        if (previousWorkerUrl === undefined) delete process.env.YV_EXECUTION_WORKER_URL;
        else process.env.YV_EXECUTION_WORKER_URL = previousWorkerUrl;
        if (previousWorkerToken === undefined) delete process.env.YV_EXECUTION_WORKER_TOKEN;
        else process.env.YV_EXECUTION_WORKER_TOKEN = previousWorkerToken;
        if (previousWorkerMode === undefined) delete process.env.YV_EXECUTION_WORKER_MODE;
        else process.env.YV_EXECUTION_WORKER_MODE = previousWorkerMode;
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
    }

    console.log("PASS: deployment readiness, request bounds, fail-closed guard, authenticated worker proxy, and worker authorization");
} finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
