export default function handler(_req, res) {
  const configured = Boolean(
    process.env.YV_EXECUTION_WORKER_TOKEN &&
    (process.env.VERCEL_OIDC_TOKEN ||
      (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID))
  );
  const ready = configured && Boolean(process.env.YV_SANDBOX_IMAGE?.trim());
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    sandbox: {
      configured,
      available: ready,
      mode: "vercel-sandbox",
      message: ready
        ? "Authenticated worker credentials and the prebuilt Java sandbox image are configured."
        : "Configure worker credentials and YV_SANDBOX_IMAGE before enabling execution.",
    },
  });
}
