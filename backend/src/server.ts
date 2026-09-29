import { runJava } from "./execution/java/runner.js";
import express from "express";
import cors from "cors";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const CHROME_EXTENSION_ORIGIN =
    /^chrome-extension:\/\/[a-p]{32}$/;

export const app = express();

app.use(cors({
    origin(origin, callback) {
        callback(
            null,
            typeof origin === "string" &&
                CHROME_EXTENSION_ORIGIN.test(origin)
        );
    }
}));
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        message: "YourVision backend is running"
    });
});

app.post("/visualize", async (req, res) => {
    const {
        language,
        source,
        testcase
    } = req.body;

    if (!language || !source) {
        return res.status(400).json({
            success: false,
            message:
                "language and source are required"
        });
    }

    if (language !== "java") {
        return res.status(400).json({
            success: false,
            message:
                "Only Java is supported right now"
        });
    }

    const result =
        await runJava(
            source,
            testcase
        );

    const status =
        result.kind ===
            "VALIDATION_ERROR"
            ? 400
            : 200;

    res.status(status).json({
        language,
        testcase,
        execution: result
    });
});

export function startServer(port = 3000) {
    return app.listen(port, "127.0.0.1", () => {
        if (port !== 0) {
            console.log(
                `YourVision backend running on http://127.0.0.1:${port}`
            );
        }
    });
}

const invokedPath = process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href
    : undefined;

if (invokedPath === import.meta.url) {
    startServer();
}
