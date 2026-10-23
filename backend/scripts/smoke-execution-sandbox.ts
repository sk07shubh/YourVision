import { checkExecutionSandbox, isSandboxConfigured } from "../src/execution/java/sandbox.js";
import { runJava } from "../src/execution/java/runner.js";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

assert(isSandboxConfigured(), "YV_EXECUTION_SANDBOX=bubblewrap must be enabled for this test");
const health = await checkExecutionSandbox();
assert(health.available, `sandbox probe failed: ${health.message}`);

const source = `import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;

class Solution {
    public boolean verifySandbox() {
        boolean appFilesHidden = !Files.exists(Path.of("/app/backend/package.json"));
        boolean filesystemReadOnly = !Files.isWritable(Path.of("/etc/passwd"));
        boolean networkBlocked;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("1.1.1.1", 53), 750);
            networkBlocked = false;
        } catch (Exception expected) {
            networkBlocked = true;
        }
        return appFilesHidden && filesystemReadOnly && networkBlocked;
    }
}`;
const result = await runJava(source, { method: "verifySandbox", arguments: [] });
assert(result.kind === "OK", `sandboxed Java execution failed: ${result.kind} ${result.message ?? ""} ${result.stderr}`);
assert(result.result === "true", `sandbox boundary assertion failed: ${result.result}`);
console.log("PASS: sandboxed Java cannot read app files, write system files, or access outbound network");
