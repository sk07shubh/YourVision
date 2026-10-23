# Vercel Sandbox proof of concept

This is an isolated proof of concept. It does not change the current Render deployment or enable public Java execution.

It tests the actual YourVision Java/JDI tracer inside a Vercel Sandbox:
- Installs a JDK in a temporary sandbox for the initial compatibility check, or uses a prebuilt image when `YV_SANDBOX_IMAGE` is set.
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

Then run the proof using the default image (the first run installs Java):

```sh
node --env-file=.env.local smoke.mjs
```

## Build a prebuilt Java image

The repository includes a Dockerfile with OpenJDK 21 and the required `jdk.jdi` module. Publishing the image to Vercel Container Registry avoids running `apt-get update` and installing the JDK for every new sandbox.

1. Ensure Docker Desktop is installed and running, and that this folder is linked to the Vercel test project.
2. Pull the local Vercel environment and load its project-scoped OIDC token:

   ```sh
   npx vercel link
   npx vercel env pull .env.local
   set -a
   source .env.local
   set +a
   ```

3. Log in to the Vercel Container Registry. Replace the team and project slugs with the slugs shown in your Vercel dashboard:

   ```sh
   printf '%s' "$VERCEL_OIDC_TOKEN" | docker login vcr.vercel.com --username oidc --password-stdin
   docker buildx build --platform linux/amd64 --provenance=false --output=type=image,push=true,compression=zstd,compression-level=3,force-compression=true -t vcr.vercel.com/<team-slug>/<project-slug>/yourvision-java:openjdk-21 -f Dockerfile .
   ```

4. Run the smoke test with the image repository and tag (not the full registry URL):

   ```sh
   YV_SANDBOX_IMAGE=yourvision-java:openjdk-21 node --env-file=.env.local smoke.mjs
   ```

The image is scoped to the Vercel project that stores it. Keep registry credentials and OIDC tokens private; OIDC tokens expire and should be refreshed rather than committed.

If the pulled environment does not include a usable `VERCEL_OIDC_TOKEN`, set `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID` in your local shell. Never commit `.env.local` or paste tokens into chat.

## Important limits

- This is a compatibility/security smoke test, not yet a production integration.
- It installs the JDK on each fresh sandbox to prove the workflow. Production should use a custom Vercel Container Registry image with a pinned JDK and the required tooling already installed.
- The test confirms a valid trace from a small method, not the entire LeetCode corpus.
- Public API deployment, request limits, command-level termination for infinite loops, concurrency, cost, and latency still need separate tests before switching production traffic.
- Current Render deployment and its fail-closed execution behavior remain unchanged until the proof passes and a Vercel deployment is ready.


## Deploy the isolated execution worker

Deploy this directory as a **separate Vercel project**, with the Vercel project root set to `vercel-sandbox-prototype`. The API exposes `/visualize` and `/readyz`; the rewrite configuration maps these to the Vercel functions.

Configure these project environment variables before deployment:

- `YV_EXECUTION_WORKER_TOKEN`: a long random bearer secret shared only with the backend.
- `YV_SANDBOX_IMAGE`: the published Java image tag, for example `yourvision-java:openjdk-21`.
- Use Vercel OIDC where supported, or set `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID` as server-side environment variables.

The readiness endpoint deliberately reports not-ready until the prebuilt Java image and sandbox credentials are configured. This prevents the backend from routing production traffic to a worker that would need to install a JDK on each request.

On the backend deployment, set `YV_EXECUTION_WORKER_URL` to this worker's HTTPS origin and set `YV_EXECUTION_WORKER_TOKEN` to the same secret. Do not expose the token to the extension or browser. The backend sends the approved runtime Java source files with each request; the worker accepts only the expected filenames and returns raw tracer output for the backend to turn into YourVision trace/state snapshots.

Before enabling traffic, run `npm run test:syntax` here and `npm run test:execution-worker-http` from `backend` against the deployed worker. This is an integration path, not a production switch: keep the backend fail-closed until the deployed isolation smoke test passes.
