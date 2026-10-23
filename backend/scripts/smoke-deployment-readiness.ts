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

    console.log("PASS: deployment readiness, JDK/JDI dependency checks, request bounds, and production execution fail-closed guard");
} finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
