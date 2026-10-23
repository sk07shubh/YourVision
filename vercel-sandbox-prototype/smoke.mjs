import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Sandbox } from "@vercel/sandbox";

const here = path.dirname(fileURLToPath(import.meta.url));
const javaDir = path.resolve(here, "../backend/src/execution/java");
const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. See this directory's README.md.`);
  return value;
};

const sandboxOptions = {
  timeout: 180_000,
  resources: { vcpus: 2 },
  persistent: false,
  networkPolicy: "allow-all",
};

if (!process.env.VERCEL_OIDC_TOKEN) {
  sandboxOptions.token = requiredEnv("VERCEL_TOKEN");
  sandboxOptions.teamId = requiredEnv("VERCEL_TEAM_ID");
  sandboxOptions.projectId = requiredEnv("VERCEL_PROJECT_ID");
}

const startedAt = Date.now();
let sandbox;

async function runChecked(cmd, args, options = {}) {
  const result = await sandbox.runCommand({ cmd, args, ...options });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed (${cmd} ${args.join(" ")}) with exit code ${result.exitCode}\n${stderr || stdout}`
    );
  }
  return { stdout, stderr };
}

async function installJdk() {
  await runChecked("apt-get", ["update"], { sudo: true });
  let result = await sandbox.runCommand({
    cmd: "apt-get",
    args: ["install", "-y", "openjdk-21-jdk-headless"],
    sudo: true,
  });
  if (result.exitCode !== 0) {
    result = await sandbox.runCommand({
      cmd: "apt-get",
      args: ["install", "-y", "openjdk-25-jdk-headless"],
      sudo: true,
    });
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `Could not install a JDK in Vercel Sandbox. Tried OpenJDK 21 and 25. ${await result.stderr()}`
    );
  }
  await runChecked("java", ["--list-modules"]);
  const modules = await runChecked("java", ["--list-modules"]);
  if (!modules.stdout.split("\n").some((line) => line.startsWith("jdk.jdi@"))) {
    throw new Error("Installed JDK does not include the jdk.jdi module required by YourVisionTracer.");
  }
  await runChecked("javac", ["-version"]);
}

async function main() {
  sandbox = await Sandbox.create(sandboxOptions);
  console.log(`Created Vercel Sandbox in ${Date.now() - startedAt} ms`);

  await installJdk();
  await sandbox.update({ networkPolicy: "deny-all" });
  console.log("Installed JDK and changed sandbox egress policy to deny-all.");

  const homeResult = await runChecked("sh", ["-lc", 'printf "%s" "$HOME"']);
  const workspace = path.posix.join(homeResult.stdout.trim(), "yourvision-smoke");
  await sandbox.mkDir(workspace);

  const names = [
    "YourVisionRuntime.java",
    "YourVisionTracer.java",
    "LeetCodeListNode.java",
    "LeetCodeTreeNode.java",
    "LeetCodeGraphNode.java",
  ];
  const files = await Promise.all(
    names.map(async (name) => ({
      path: path.posix.join(workspace, name),
      content: await readFile(path.join(javaDir, name)),
    }))
  );

  const solution = `import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;

class Solution {
    public int add(int a, int b) {
        int total = a + b;
        return total;
    }

    public boolean verifySandbox() {
        boolean secretsHidden = System.getenv("VERCEL_TOKEN") == null
            && System.getenv("VERCEL_OIDC_TOKEN") == null;
        boolean protectedFile = !Files.isWritable(Path.of("/etc/passwd"));
        boolean networkBlocked;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("1.1.1.1", 53), 700);
            networkBlocked = false;
        } catch (Exception expected) {
            networkBlocked = true;
        }
        return secretsHidden && protectedFile && networkBlocked;
    }
}`;

  files.push({
    path: path.posix.join(workspace, "Solution.java"),
    content: solution,
  });
  await sandbox.writeFiles(files.map((file) => ({
    path: file.path,
    content: Buffer.from(file.content),
  })));

  const compile = await sandbox.runCommand({
    cmd: "javac",
    cwd: workspace,
    args: [
      "-J-Xmx192m",
      "-J-XX:MaxMetaspaceSize=96m",
      "-J-XX:+UseSerialGC",
      `-J-Djava.io.tmpdir=${workspace}`,
      "--add-modules", "jdk.jdi",
      "-g",
      "-d", workspace,
      "Solution.java",
      "LeetCodeListNode.java",
      "LeetCodeTreeNode.java",
      "LeetCodeGraphNode.java",
      "YourVisionRuntime.java",
      "YourVisionTracer.java",
    ],
  });
  if (compile.exitCode !== 0) {
    throw new Error(`YourVision Java sources failed to compile inside Vercel Sandbox.\n${await compile.stderr()}`);
  }
  console.log("PASS: YourVisionTracer and runtime compiled inside Vercel Sandbox.");

  const runMethod = async (method, values) => {
    const encoded = values.length
      ? values.map((value) => "__YV_B64__" + Buffer.from(value, "utf8").toString("base64"))
      : ["__YV_NO_ARGS__"];
    const result = await sandbox.runCommand({
      cmd: "java",
      cwd: workspace,
      args: [
        "-Xmx128m",
        "-XX:MaxMetaspaceSize=64m",
        "-XX:+UseSerialGC",
        "-XX:-UsePerfData",
        `-Djava.io.tmpdir=${workspace}`,
        "--add-modules", "jdk.jdi",
        "-cp", workspace,
        "YourVisionTracer",
        workspace,
        "YourVisionRuntime",
        "Solution",
        method,
        ...encoded,
      ],
    });
    const stdout = await result.stdout();
    const stderr = await result.stderr();
    if (result.exitCode !== 0) {
      throw new Error(`Tracer invocation ${method} failed with exit code ${result.exitCode}.\n${stderr}\n${stdout}`);
    }
    if (!stdout.includes("__YV_EVENT__=") || !stdout.includes("__YV_RESULT__=")) {
      throw new Error(`Tracer invocation ${method} did not return both trace events and a result marker.\n${stdout}\n${stderr}`);
    }
    return stdout;
  };

  const additionTrace = await runMethod("add", ["2", "3"]);
  if (!additionTrace.split(/\r?\n/).some((line) => line.trim() === "__YV_RESULT__=5")) {
    throw new Error(`Expected add(2, 3) to return 5. Trace output:\n${additionTrace}`);
  }
  console.log("PASS: Vercel Sandbox ran YourVisionTracer and returned add(2, 3) = 5 with trace events.");

  const isolationTrace = await runMethod("verifySandbox", []);
  if (!isolationTrace.split(/\r?\n/).some((line) => line.trim() === "__YV_RESULT__=true")) {
    throw new Error(`Vercel Sandbox isolation probe failed. Trace output:\n${isolationTrace}`);
  }
  console.log("PASS: sandbox probe found no Vercel credentials, no write access to /etc/passwd, and blocked outbound network access.");
  console.log(`PASS: Vercel Sandbox Java/JDI proof completed in ${Date.now() - startedAt} ms.`);
}

try {
  await main();
} finally {
  if (sandbox) {
    await sandbox.stop().catch((error) => {
      console.error("Sandbox cleanup failed:", error instanceof Error ? error.message : String(error));
    });
  }
}
