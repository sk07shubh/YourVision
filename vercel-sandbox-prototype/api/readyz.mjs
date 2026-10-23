export default function handler(_req, res) {
  const workerTokenConfigured = Boolean(process.env.YV_EXECUTION_WORKER_TOKEN?.trim());
  const sandboxCredentialsConfigured = Boolean(
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
      (process.env.VERCEL_TOKEN?.trim() && process.env.VERCEL_TEAM_ID?.trim() && process.env.VERCEL_PROJECT_ID?.trim())
  );
  const configured = workerTokenConfigured && sandboxCredentialsConfigured;
  const ready = configured && Boolean(process.env.YV_SANDBOX_IMAGE?.trim());
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    sandbox: {
      configured,
      available: ready,
      mode: "vercel-sandbox",
      message: ready
        ? "Worker authentication, Vercel Sandbox credentials, and the prebuilt Java image are configured."
        : "Configure YV_EXECUTION_WORKER_TOKEN, Vercel Sandbox credentials, and YV_SANDBOX_IMAGE before enabling execution.",
    },
  });
}
