import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

export async function runJava(source: string) {
    const tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "yourvision-")
    );

    const filePath = path.join(tempDir, "Main.java");

    await fs.writeFile(filePath, source);

    try {
        // 1. Compile
        await execFileAsync("javac", [filePath]);

        // 2. Run
        const { stdout, stderr } = await execFileAsync(
            "java",
            ["-cp", tempDir, "Main"],
            {
                timeout: 3000
            }
        );

        return {
            success: true,
            stdout,
            stderr
        };

    } catch (error: any) {
        return {
            success: false,
            stdout: error.stdout ?? "",
            stderr: error.stderr ?? error.message
        };

    } finally {
        await fs.rm(tempDir, {
            recursive: true,
            force: true
        });
    }
}