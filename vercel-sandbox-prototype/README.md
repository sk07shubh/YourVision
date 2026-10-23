# Vercel Sandbox proof of concept

This is an isolated proof of concept. It does not change the current Render deployment or enable public Java execution.

It tests the actual YourVision Java/JDI tracer inside a Vercel Sandbox:
- Installs a JDK in a temporary sandbox for the initial compatibility check.
- Compiles the repository's `YourVisionRuntime.java` and `YourVisionTracer.java`.
- Runs a real Java method and asserts a result plus trace events are returned.
- Switches sandbox network egress to `deny-all` before compiling/running submitted source.
- Checks the submitted program cannot see the Vercel SDK credentials, write `/etc/passwd`, or make an outbound connection.
- Stops the sandbox when complete.

## Requirements

- Node.js 22 or newer
- A Vercel account and a Vercel project
- Vercel Sandbox enabled for that account/project

## Run locally

From this directory, install the SDK:

```sh
npm install
```

Link the Vercel project and pull local development environment values using the Vercel CLI:

```sh
npx vercel login
npx vercel link
npx vercel env pull .env.local
```

Then run the proof:

```sh
node --env-file=.env.local smoke.mjs
```

If the pulled environment does not include a usable `VERCEL_OIDC_TOKEN`, set `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID` in your local shell. Never commit `.env.local` or paste tokens into chat.

## Important limits

- This is a compatibility/security smoke test, not yet a production integration.
- It installs the JDK on each fresh sandbox to prove the workflow. Production should use a custom Vercel Container Registry image with a pinned JDK and the required tooling already installed.
- The test confirms a valid trace from a small method, not the entire LeetCode corpus.
- Public API deployment, request limits, command-level termination for infinite loops, concurrency, cost, and latency still need separate tests before switching production traffic.
- Current Render deployment and its fail-closed execution behavior remain unchanged until the proof passes and a Vercel deployment is ready.
