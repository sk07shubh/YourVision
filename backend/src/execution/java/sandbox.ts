import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const SANDBOX_MODE = "cloud-run";
const SANDBOX_CLI = "/usr/local/gcp/bin/sandbox";
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export interface SandboxedCommand {
    command: string;
    args: string[];
}

export function isSandboxConfigured(): boolean {
    return process.env.YV_EXECUTION_SANDBOX === SANDBOX_MODE;
}

export function sandboxCommand(command: string, args: string[], workDir: string): SandboxedCommand {
    if (!isSandboxConfigured()) return { command, args };

    return {
        command: SANDBOX_CLI,
        args: [
            "do",
            "--mount",
            `type=bind,source=${workDir},destination=${workDir}`,
            "--",
            command,
            ...args
        ]
    };
}

export interface SandboxHealth {
    configured: boolean;
    available: boolean;
    mode: "cloud-run" | "disabled";
    message: string;
}

let healthPromise: Promise<SandboxHealth> | undefined;

export function checkExecutionSandbox(): Promise<SandboxHealth> {
    if (!healthPromise) healthPromise = runSandboxHealthCheck();
    return healthPromise;
}

async function runSandboxHealthCheck(): Promise<SandboxHealth> {
    if (!isSandboxConfigured()) {
        return {
            configured: false,
            available: false,
            mode: "disabled",
            message: "Set YV_EXECUTION_SANDBOX=cloud-run and enable the Cloud Run sandbox launcher."
        };
    }

    let tempDir: string | undefined;
    try {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yourvision-sandbox-check-"));
        await execFileAsync(SANDBOX_CLI, [
            "do",
            "--mount",
            `type=bind,source=${tempDir},destination=${tempDir}`,
            "--",
            "/bin/sh",
            "-c",
            'test ! -w /etc/passwd && test -w "$1" && test -z "${YV_SANDBOX_PROBE_SECRET+x}"',
            "sh",
            tempDir
        ], {
            timeout: 8000,
            maxBuffer: MAX_OUTPUT_BYTES
        });
        return {
            configured: true,
            available: true,
            mode: "cloud-run",
            message: "Cloud Run sandbox launcher, writable per-request workspace, read-only system filesystem, and isolated environment probe passed."
        };
    } catch (error) {
        const detail = error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
            ? error.stderr.trim().slice(0, 240)
            : error instanceof Error ? error.message.slice(0, 240) : "unknown sandbox error";
        return {
            configured: true,
            available: false,
            mode: "cloud-run",
            message: `Cloud Run sandbox probe failed; execution is disabled. ${detail}`
        };
    } finally {
        if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
