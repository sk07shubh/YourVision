import { Sandbox } from "@vercel/sandbox";

const MAX_SOURCE_BYTES = 128 * 1024;
const MAX_TESTCASE_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const RUNTIME_FILES = [
  "YourVisionRuntime.java",
  "YourVisionTracer.java",
  "LeetCodeListNode.java",
  "LeetCodeTreeNode.java",
  "LeetCodeGraphNode.java",
];

function response(res, status, body) {
  res.status(status).json(body);
}

function prepareSource(source) {
  if (/^\s*import\s+java\.util\.\*;/m.test(source)) return source;
  const packageDeclaration = /(^[ \t]*package[ \t]+[\w.]+[ \t]*;)/m;
  if (packageDeclaration.test(source)) return source.replace(packageDeclaration, "$1 import java.util.*;");
  return `import java.util.*; ${source}`;
}

function declaresType(source, typeName) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\r\n]*/g, " ");
  return new RegExp("\\bclass\\s+" + typeName + "\\b").test(code);
}

function encodeArguments(values) {
  return values.length
    ? values.map((value) => "__YV_B64__" + Buffer.from(value, "utf8").toString("base64"))
    : ["__YV_NO_ARGS__"];
}

function invocationArguments(testcase) {
  if (testcase.mode !== "design") {
    if (typeof testcase.method !== "string" || !testcase.method.trim()) {
      throw new Error("testcase.method is required");
    }
    if (testcase.arguments !== undefined && (!Array.isArray(testcase.arguments) || testcase.arguments.some((x) => typeof x !== "string"))) {
      throw new Error("testcase.arguments must be an array of strings");
    }
    return [testcase.method, ...encodeArguments(testcase.arguments ?? [])];
  }
  if (typeof testcase.className !== "string" || !/^[A-Za-z_$][\w$]*$/.test(testcase.className) ||
      !Array.isArray(testcase.operations) || testcase.operations.length === 0) {
    throw new Error("Provide a valid design testcase with className and operations.");
  }
  const constructorArguments = testcase.constructorArguments ?? [];
  if (!Array.isArray(constructorArguments) || constructorArguments.some((x) => typeof x !== "string")) {
    throw new Error("testcase.constructorArguments must be an array of strings");
  }
  if (testcase.operations.some((operation) => !operation || typeof operation.method !== "string" ||
      !/^[A-Za-z_$][\w$]*$/.test(operation.method) ||
      (operation.arguments !== undefined && (!Array.isArray(operation.arguments) || operation.arguments.some((x) => typeof x !== "string"))))) {
    throw new Error("Every design operation must have a valid method and string arguments.");
  }
  return [
    "__YV_DESIGN__", String(constructorArguments.length), ...encodeArguments(constructorArguments),
    String(testcase.operations.length),
    ...testcase.operations.flatMap((operation) => [
      operation.method, String(operation.arguments?.length ?? 0), ...encodeArguments(operation.arguments ?? []),
    ]),
  ];
}

async function readCommand(result) {
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  return {
    stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
    stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
    exitCode: result.exitCode,
    timedOut: result.exitCode === 124 || result.exitCode === 137,
  };
}

export default async function handler(req, res) {
  if (req.method === "GET" && req.url?.split("?")[0] === "/readyz") {
    return response(res, 200, {
      status: "ready",
      sandbox: { configured: Boolean(process.env.YV_EXECUTION_WORKER_TOKEN), available: true, mode: "vercel-sandbox" },
    });
  }
  if (req.method !== "POST") return response(res, 405, { success: false, message: "Method not allowed." });
  const token = process.env.YV_EXECUTION_WORKER_TOKEN?.trim();
  if (!token || req.headers.authorization !== `Bearer ${token}`) {
    return response(res, 401, { success: false, code: "EXECUTION_WORKER_UNAUTHORIZED", message: "Unauthorized execution worker request." });
  }

  const body = req.body;
  if (!body || body.language !== "java" || typeof body.source !== "string" ||
      !body.testcase || typeof body.testcase !== "object" || Array.isArray(body.testcase)) {
    return response(res, 400, { success: false, message: "A Java source and testcase object are required." });
  }
  if (Buffer.byteLength(body.source, "utf8") > MAX_SOURCE_BYTES ||
      Buffer.byteLength(JSON.stringify(body.testcase), "utf8") > MAX_TESTCASE_BYTES) {
    return response(res, 413, { success: false, message: "Source or testcase exceeds the configured limit." });
  }
  if (!body.runtimeSources || typeof body.runtimeSources !== "object" || Array.isArray(body.runtimeSources) ||
      !RUNTIME_FILES.every((name) => typeof body.runtimeSources[name] === "string")) {
    return response(res, 400, { success: false, message: "The backend must provide the approved YourVision Java runtime sources." });
  }

  let args;
  try {
    args = invocationArguments(body.testcase);
  } catch (error) {
    return response(res, 400, { success: false, message: error instanceof Error ? error.message : "Invalid testcase." });
  }

  let sandbox;
  const requestStartedAt = performance.now();
  const stageTimings = {};
  let stageStartedAt = requestStartedAt;
  let failureStage = "sandbox.create";
  const startStage = (stage) => {
    const now = performance.now();
    stageTimings[failureStage] = Math.round((now - stageStartedAt) * 100) / 100;
    failureStage = stage;
    stageStartedAt = now;
    console.info("[YourVision worker] stage started", JSON.stringify({ stage }));
  };
  try {
    const configuredImage = process.env.YV_SANDBOX_IMAGE?.trim();
    const options = {
      timeout: 90_000,
      resources: { vcpus: 2 },
      persistent: false,
      networkPolicy: "allow-all",
      ...(configuredImage ? { image: configuredImage } : {}),
    };
    if (!process.env.VERCEL_OIDC_TOKEN) {
      if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_TEAM_ID || !process.env.VERCEL_PROJECT_ID) {
        return response(res, 503, { success: false, code: "SANDBOX_CREDENTIALS_MISSING", message: "Vercel Sandbox credentials are not configured." });
      }
      options.token = process.env.VERCEL_TOKEN;
      options.teamId = process.env.VERCEL_TEAM_ID;
      options.projectId = process.env.VERCEL_PROJECT_ID;
    }
    if (!configuredImage) {
      return response(res, 503, {
        success: false,
        code: "SANDBOX_IMAGE_MISSING",
        message: "A prebuilt Java sandbox image must be configured before execution.",
      });
    }
    console.info("[YourVision worker] sandbox creation requested", JSON.stringify({ imageConfigured: Boolean(configuredImage) }));
    sandbox = await Sandbox.create(options);
    console.info("[YourVision worker] sandbox created");
    startStage("sandbox.network-policy");
    await sandbox.update({ networkPolicy: "deny-all" });
    console.info("[YourVision worker] sandbox network policy applied");
    startStage("sandbox.hostname-resolution");
    const hostnameCommand = await sandbox.runCommand({ cmd: "hostname" });
    const sandboxHostname = (await hostnameCommand.stdout()).trim();
    if (!/^[a-zA-Z0-9.-]{1,253}$/.test(sandboxHostname)) {
      throw new Error("Sandbox returned an invalid hostname.");
    }
    const hostnameMap = await sandbox.runCommand({
      cmd: "sh",
      args: ["-lc", "grep -Fq \" " + sandboxHostname + "\" /etc/hosts || printf \"\\n127.0.0.1 " + sandboxHostname + "\\n\" >> /etc/hosts"],
    });
    if (hostnameMap.exitCode !== 0) {
      throw new Error("Could not map the sandbox hostname in /etc/hosts.");
    }
    console.info("[YourVision worker] sandbox hostname mapped");
    startStage("sandbox.unprivileged-user");
    const javaUser = await sandbox.createUser("yv-executor");
    console.info("[YourVision worker] unprivileged user created");
    startStage("sandbox.workspace-create");
    const workspace = `${javaUser.homeDir}/yourvision-run`;
    await javaUser.mkDir(workspace);
    console.info("[YourVision worker] workspace created");

    const source = prepareSource(body.source);
    const files = [{ name: "Solution.java", content: source }];
    for (const name of RUNTIME_FILES) {
      if (name === "LeetCodeListNode.java" && declaresType(source, "ListNode")) continue;
      if (name === "LeetCodeTreeNode.java" && declaresType(source, "TreeNode")) continue;
      if (name === "LeetCodeGraphNode.java" && declaresType(source, "Node")) continue;
      files.push({ name, content: body.runtimeSources[name] });
    }
    startStage("sandbox.write-files");
    await javaUser.writeFiles(files.map(({ name, content }) => ({
      path: `${workspace}/${name}`,
      content: Buffer.from(content, "utf8"),
    })));
    console.info("[YourVision worker] source files written", JSON.stringify({ fileCount: files.length }));

    const compileNames = files.map((file) => file.name);
    startStage("java.compile");
    const compile = await javaUser.runCommand({
      cmd: "timeout",
      args: ["20s", "javac", "-J-Xmx192m", "-J-XX:MaxMetaspaceSize=96m", "-J-XX:+UseSerialGC",
        `-J-Djava.io.tmpdir=${workspace}`, "--add-modules", "jdk.jdi", "-g", "-d", workspace, ...compileNames],
      cwd: workspace,
    });
    console.info("[YourVision worker] Java compilation command completed");
    const compiled = await readCommand(compile);
    if (compiled.exitCode !== 0) {
      return response(res, 200, { protocol: "yv-java-raw-v1", phase: "compile", ...compiled });
    }

    const className = body.testcase.mode === "design" ? body.testcase.className : "Solution";
    startStage("java.execute");
    const run = await javaUser.runCommand({
      cmd: "timeout",
      args: ["15s", "java", "-Xmx128m", "-XX:MaxMetaspaceSize=64m", "-XX:+UseSerialGC", "-XX:-UsePerfData",
        `-Djava.io.tmpdir=${workspace}`, "--add-modules", "jdk.jdi", "-cp", workspace,
        "YourVisionTracer", workspace, "YourVisionRuntime", className, ...args],
      cwd: workspace,
    });
    console.info("[YourVision worker] Java execution command completed");
    const execution = await readCommand(run);
    return response(res, 200, { protocol: "yv-java-raw-v1", phase: "run", ...execution });
  } catch (error) {
    const candidate = error && typeof error === "object" ? error : {};
    const errorName = candidate instanceof Error && /^[A-Za-z][A-Za-z0-9]*Error$/.test(candidate.name)
      ? candidate.name
      : typeof candidate.name === "string" && /^[A-Za-z][A-Za-z0-9]*Error$/.test(candidate.name)
        ? candidate.name
        : "UnknownError";
    const rawMessage = typeof candidate.message === "string" ? candidate.message : "";
    const safeMessage = rawMessage
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/(?:token|secret|authorization|api[_-]?key)(\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
      .replace(/https?:\/\/[^\s?]+\?[^\s]+/gi, "[URL_REDACTED]")
      .slice(0, 300);
    const errorCode = typeof candidate.code === "string" || typeof candidate.code === "number"
      ? String(candidate.code).slice(0, 80)
      : undefined;
    const status = Number.isInteger(candidate.status) ? candidate.status
      : Number.isInteger(candidate.statusCode) ? candidate.statusCode
        : undefined;
    console.error("[YourVision worker] sandbox request failed", {
      stage: failureStage,
      errorName,
      ...(errorCode ? { errorCode } : {}),
      ...(status ? { status } : {}),
      ...(safeMessage ? { message: safeMessage } : {}),
    });
    return response(res, 503, {
      success: false,
      code: "VERCEL_SANDBOX_FAILED",
      message: "The isolated Java execution sandbox could not complete the request.",
    });
  } finally {
    const now = performance.now();
    stageTimings[failureStage] = Math.round((now - stageStartedAt) * 100) / 100;
    if (sandbox) {
      const cleanupStartedAt = performance.now();
      await sandbox.stop().catch(() => undefined);
      stageTimings["sandbox.cleanup"] = Math.round((performance.now() - cleanupStartedAt) * 100) / 100;
    }
    stageTimings.total = Math.round((performance.now() - requestStartedAt) * 100) / 100;
    console.info("[YourVision worker] execution timing", JSON.stringify(stageTimings));
  }
}
