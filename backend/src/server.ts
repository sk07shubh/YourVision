import { runJava } from "./execution/java/runner.js";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
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

app.listen(3000, () => {
    console.log(
        "YourVision backend running on http://localhost:3000"
    );
});
