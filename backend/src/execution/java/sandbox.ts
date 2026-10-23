import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const SANDBOX_MODE = "bubblewrap";
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
        command: "prlimit",
        args: [
            "--cpu=20", "--fsize=16777216", "--nofile=128", "--core=0", "--",
            "bwrap",
            "--unshare-all", "--die-with-parent", "--new-session", "--cap-drop", "ALL",
            "--ro-bind", "/usr", "/usr",
            "--ro-bind", "/etc", "/etc",
            "--dev", "/dev",
            "--proc", "/proc",
            "--tmpfs", "/tmp",
            "--dir", workDir,
            "--bind", workDir, workDir,
            "--chdir", workDir,
            "--clearenv",
            "--setenv", "PATH", "/usr/bin:/bin",
            "--setenv", "HOME", "/tmp",
            "--setenv", "LANG", "C.UTF-8",
            "--setenv", "LC_ALL", "C.UTF-8",
            "--",
            command,
            ...args
        ]
    };
}

export interface SandboxHealth {
    configured: boolean;
    available: boolean;
    mode: "bubblewrap" | "disabled";
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
            message: "Set YV_EXECUTION_SANDBOX=bubblewrap to enable isolated execution."
        };
    }

    let tempDir: string | undefined;
    try {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yourvision-sandbox-check-"));
        const probe = sandboxCommand("sh", [
            "-c",
            "test ! -w /etc/passwd && test -w /tmp && test ! -e /app/backend/package.json && test \"$(wc -l < /proc/net/route)\" -le 1"
        ], tempDir);
        await execFileAsync(probe.command, probe.args, {
            timeout: 4000,
            maxBuffer: MAX_OUTPUT_BYTES,
            env: { PATH: "/usr/bin:/bin" }
        });
        return {
            configured: true,
            available: true,
            mode: "bubblewrap",
            message: "Read-only filesystem, isolated temporary directory, and network namespace probe passed."
        };
    } catch {
        return {
            configured: true,
            available: false,
            mode: "bubblewrap",
            message: "The bubblewrap namespace probe failed; execution is disabled."
        };
    } finally {
        if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
