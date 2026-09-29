import { once } from "node:events";
import { startServer } from "../src/server.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const server = startServer(0);
await once(server, "listening");

try {
    const address = server.address();
    if (address === null || typeof address === "string") {
        throw new Error("backend did not bind a TCP address");
    }
    assert(
        address.address === "127.0.0.1",
        `backend should bind to loopback only, got ${address.address}`
    );

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;
    const extensionPreflight = await fetch(`${baseUrl}/visualize`, {
        method: "OPTIONS",
        headers: {
            Origin: extensionOrigin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"
        }
    });

    assert(
        extensionPreflight.headers.get("access-control-allow-origin") === extensionOrigin,
        "Chrome extension origin was not allowed to call the backend"
    );
    assert(
        extensionPreflight.headers.get("access-control-allow-methods")?.includes("POST") === true,
        "Chrome extension POST preflight was not allowed"
    );

    const webpagePreflight = await fetch(`${baseUrl}/visualize`, {
        method: "OPTIONS",
        headers: {
            Origin: "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"
        }
    });
    assert(
        webpagePreflight.headers.get("access-control-allow-origin") === null,
        "untrusted webpage origin must not receive CORS access"
    );

    const localHealth = await fetch(`${baseUrl}/health`);
    assert(localHealth.status === 200, "local backend health check failed");

    console.log("PASS: backend listens on loopback and allows only Chrome extension CORS origins");
} finally {
    await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
}
