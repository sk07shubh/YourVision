# YourVision

YourVision is a Chrome Manifest V3 extension and local backend that visualizes **actual Java execution** for LeetCode solutions. It runs the submitted Java program, captures runtime checkpoints and object/collection state, and replays those snapshots alongside the real LeetCode editor. It is not a problem-specific mock animation.

- **Repository:** https://github.com/sk07shubh/YourVision
- **Default branch:** `main`
- **Current language support:** Java
- **Extension:** React, TypeScript, Vite, Vitest
- **Backend:** Node.js, Express, TypeScript, Java/JDI tracer
- **Backend default address:** `http://127.0.0.1:3000`

## Contents

1. [Product and engineering rules](#product-and-engineering-rules)
2. [Architecture](#architecture)
3. [Setup and development](#setup-and-development)
4. [Tests and CI](#tests-and-ci)
5. [Visualization capabilities](#visualization-capabilities)
6. [Data-structure roadmap](#data-structure-roadmap)
7. [Runtime, trace, and API contracts](#runtime-trace-and-api-contracts)
8. [Security and known limitations](#security-and-known-limitations)
9. [Debugging workflow](#debugging-workflow)
10. [Function-call tree proposal](#function-call-tree-proposal)
11. [Contributor checklist](#contributor-checklist)

## Product and engineering rules

These rules are the source of truth for future work:

- **Runtime truth first.** Backend runtime events and captured source locations are authoritative. The frontend must not invent execution steps, values, pointer positions, operation results, or line mappings.
- **Line/effect alignment.** The visible state and highlighted source line must describe the same real checkpoint. Preserve actual same-line loop visits, loop-header phases, method re-entry, method-entry parameters, the callee's actual return line, and caller resumption.
- **Keep the real editor.** LeetCode's Monaco editor remains the code editor. Preserve the orange source-line highlight; do not add an execution arrow.
- **Preserve the current product layout.** Refine the existing dark visual language and established state/data-structure views. Keep testcase UI, output, and execution controls; do not restore Expected UI or placeholder values.
- **Generic behavior only.** Do not add behavior tied to a specific problem, testcase, variable name, or source line. Infer structures and semantic roles conservatively from actual runtime snapshots, source context, and stable identity.
- **Identity, aliases, and cycles matter.** Equal values may be distinct objects. Multiple variables referencing one object must continue to reference the same visual object. Handle cycles and shared references without duplicating identity.
- **Trace-backed motion.** Animate only observed mutations and pointer/edge changes. Reads highlight in place. Do not invent intermediate swaps, sorting, operation names, or traversal order. Respect `prefers-reduced-motion`.
- **Safe bounded execution.** Preserve timeouts and trace-size limits. A timeout, error, or reached trace limit is an incomplete/failure state, never successful completion.
- **Language scope.** Java is implemented. C++ and other languages are future scope; do not add them unless explicitly requested.
- **Security.** The backend must bind to loopback only and restrict browser CORS to Chrome extension origins. Do not claim the Java subprocess is OS-sandboxed: process timeouts and trace caps are not an OS-level sandbox.

## Architecture

```text
LeetCode page / Monaco editor
  └─ extension/src/leetcode/
       ├─ locate editor, source, testcase
       └─ open/control YourVision visualizer
            └─ extension API client
                 └─ POST http://127.0.0.1:3000/visualize
                      └─ backend/src/server.ts
                           └─ backend/src/execution/java/runner.ts
                                ├─ YourVisionRuntime.java
                                └─ YourVisionTracer.java (Java/JDI)
                                     └─ trace events
                                          └─ enrichTrace.ts / semanticRoles.ts
                                               └─ stateBuilder.ts
                                                    └─ replayable snapshots
                                                         └─ VisualizerPanel.tsx
```

### Important implementation paths

| Area | Key paths | Responsibility |
|---|---|---|
| LeetCode integration | `extension/src/leetcode/integration.tsx`, `extension/src/leetcode/` | Page integration, source/testcase extraction, editor interaction |
| Visualizer UI | `extension/src/components/VisualizerPanel.tsx`, `VisualizerPanel.test.tsx` | State, variables, data structures, playback, visible effects |
| Editor highlight | `extension/src/leetcode/editor-overlay.ts` | Highlight and reveal the real executed source line |
| Extension state | `extension/src/state/store.ts`, `extension/src/state/session.ts` | Session, response, state history, playback position |
| Backend server | `backend/src/server.ts` | Health and visualization endpoints, request validation, local server/CORS |
| Java runner | `backend/src/execution/java/runner.ts` | Validation, source preparation, compilation, execution, timeouts, trace parsing |
| Java runtime/tracer | `backend/src/execution/java/YourVisionRuntime.java`, `YourVisionTracer.java` | Runtime invocation, JDI checkpoints and trace capture |
| Trace contract | `backend/src/execution/trace/schema.ts` | Event and state types |
| Trace enrichment | `backend/src/execution/trace/enrichTrace.ts` | Checkpoint normalization, condition/effect association, derived effects |
| Semantic roles | `backend/src/execution/trace/semanticRoles.ts` | Evidence-based variable/pointer role hints |
| State replay | `backend/src/execution/trace/stateBuilder.ts` | Folds ordered events into visible snapshots |
| Backend regressions | `backend/scripts/smoke-*.ts` | Focused runtime, safety, trace, and structure regressions |

Trace visible bugs back through rendering, snapshots, enrichment, and runtime events. Fix the earliest layer shown to be incorrect; do not patch a frontend symptom when the runtime trace itself is wrong.

## Setup and development

### Requirements

- Node.js 22 is the CI baseline; npm and the checked-in lockfiles.
- JDK 17 is the CI baseline, with `javac`, `java`, and the `jdk.jdi` module available.
- Chrome and access to a LeetCode problem page for manual extension testing.

### Install dependencies

From the repository root:

```bash
cd backend
npm ci
cd ../extension
npm ci
```

### Run the backend

In one terminal:

```bash
cd backend
npm run typecheck
npm run dev
```

The server defaults to `http://127.0.0.1:3000`. Check health with:

```bash
curl http://127.0.0.1:3000/health
```

### Build and load the extension

In another terminal:

```bash
cd extension
npm run typecheck
npm test
npm run build
```

Load `extension/dist` as an unpacked extension in Chrome. Confirm that the generated build and manifest are present before loading it.

## Tests and CI

Run commands from the indicated directory. A command listed here is an available script in the current package manifest unless otherwise noted.

### Extension (`extension/`)

| Command | Purpose |
|---|---|
| `npm test` | Run Vitest unit/component tests |
| `npm run typecheck` | Run TypeScript without emitting output |
| `npm run build` | Typecheck and create the Vite production build |
| `npm run dev` | Watch and rebuild with Vite |

**Browser test status:** the current `extension/package.json` does not define `test:e2e`, and the current workflow set does not include the old documented Extension Browser Regression workflow. Earlier documentation described Playwright E2E coverage, but those instructions are stale relative to the current manifests. Do not claim browser/E2E coverage is running until a script, configuration, and CI workflow are verified in the repository.

### Backend (`backend/`)

| Command | Purpose |
|---|---|
| `npm run typecheck` | TypeScript check |
| `npm test` / `npm run test:all` | Full backend regression sequence, including typecheck |
| `npm run test:trace-state` | State-building regressions |
| `npm run test:trace-enrichment` | Trace enrichment and effect association |
| `npm run test:trace-map` | Map mutation enrichment (insert, update, delete) |
| `npm run test:trace-replay` | Trace replay regressions |
| `npm run test:string-trace` | String trace regressions |
| `npm run test:semantic-roles` | Semantic role inference |
| `npm run test:condition-evaluator` | Condition evaluation |
| `npm run test:feature-matrix` | Feature-matrix regression coverage |
| `npm run test:leetcode-execution-corpus` | LeetCode execution corpus |
| `npm run test:java-runtime` | Java runtime integration |
| `npm run test:java-same-line-loop` | Repeated same-line loop checkpoints |
| `npm run test:java-state` | Runtime-to-state integration |
| `npm run test:leetcode-nodes` | LeetCode node compatibility |
| `npm run test:leetcode-graph` | Graph input/trace coverage |
| `npm run test:leetcode-structures` | LeetCode structure handling |
| `npm run test:leetcode-algorithms` | Algorithm smoke tests |
| `npm run test:backend-readiness` | Backend readiness |
| `npm run test:server-security` | Loopback binding and CORS restrictions |
| `npm run test:java-safety` | Java execution safety/limits |
| `npm run test:java-exception-unwind` | Exception and stack unwind behavior |
| `npm run test:array-discovery` | Array access discovery |
| `npm run test:data-structures` | Java data-structure snapshots |

`npm test` is an alias for `npm run test:all`, so the default backend test command runs the complete regression suite.

### Current CI workflows

- `.github/workflows/full-regression.yml` — the single consolidated CI workflow; runs backend regression/typecheck plus extension tests, typecheck, and production build. It preserves the previous push triggers for `main`, `yourvision-safety-hardened`, `automation/comprehensive-regression-lab`, and `feat/all-remaining-ds-visualization`, as well as pull requests targeting `main`.

The duplicate `.github/workflows/backend.yml` was removed so pull requests targeting `main` do not run the backend suite twice. Check the actual workflow run and commit SHA before reporting verification.

### Verification reporting

Do not infer a pass from a previous commit, a focused test, or a manual visual check. For every change, report exactly which commands/CI jobs ran and their actual results. If checks were not run, say so. For browser-visible changes, use a verified browser regression if available; otherwise state the limitation.

## Visualization capabilities

All structure views must be derived from the captured runtime state and preserve stable object identity, references, aliases, cycles, and historical Prev/Next replay. Generic fallback views must remain available for ambiguous structures.

| Structure / behavior | Current approach |
|---|---|
| Arrays and matrices | Indexed cells; actual access/write cues; pointer labels; jagged/empty matrix handling |
| Strings | Character/index view and validated UTF-16 range highlighting; trace-backed mutation cues |
| Linked lists | Node identity and links; preserve reachable nodes, aliases, and cycles |
| Stack | Vertical stack; trace-backed insert/remove/update and empty-state cues |
| Queue / deque | Endpoint-aware view and trace-backed mutation cues |
| Sets | Membership changes; avoid implying order for unordered sets; sorted/insertion-ordered implementations labeled where known |
| Maps | Key/value view; observed key updates/removals; ordered map behavior where runtime evidence supports it |
| Priority queues | Heap layout and connectors; comparator-agnostic labeling unless priority convention is known |
| Binary trees | Left/right edges, stable node identities, pointer traversal and mutation cues, cycle/reference guards |
| Specialized trees | Captured red-black color, AVL-like height/balance, treap priority, B-tree-like multi-key/leaf metadata, segment-tree intervals |
| Tries | Child edges, explicit terminal flags, insertion/pruning cues when adjacent snapshots prove them |
| Graphs | Captured adjacency, directed edges, cycles/self-links, aliases, node/edge changes, bounded rendering |
| Disjoint sets / union-find | Initial parent-forest rendering under conservative source/runtime evidence |
| Generic objects | Field/reference changes, aliases, cycles, and identity-preserving fallback |

### Animation semantics

- Node creation/update, child/edge insertion/removal, reference rewiring, metadata changes, pointer traversal, and collection mutations are animated only when supported by adjacent captured snapshots/events.
- A changed value is not automatically a new object. Parallel graph edges are tracked by occurrence. Empty states and removal of the final child/item must remain visible without detached fake overlays.
- Do not infer that a named algorithm ran merely from a method name or variable name. For ambiguous events, render the observed state change without assigning a guessed algorithm operation.
- The established orange editor-line highlight and output/result panel remain part of the experience.

## Data-structure roadmap

This is the current consolidated roadmap. Completed items below mean the code has an initial implementation; they do **not** imply that all operation types are fully animated or that every behavior has passed real-trace validation.

### Implemented initial coverage

- Generic runtime-backed snapshots and replay for arrays, linked structures, maps, sets, objects, trees, tries, graphs, and common collections.
- Ordered collection distinctions where runtime/source evidence supports them: TreeSet/LinkedHashSet, TreeMap/LinkedHashMap; unordered HashSet does not imply array order.
- Graph adjacency rendering with references, cycles, self-links, aliases, and bounded node count.
- Trie child edges and explicit terminal-state metadata.
- Binary-tree branch labels, stable identities, and cycle protection.
- Initial disjoint-set parent forest for recognizable parent/find/union patterns.
- Specialized metadata and conservative adjacent-snapshot cues: AVL single/double rotations, red-black rotation/recolor pairing, treap priorities/rotation cues, multiway-tree split/merge/redistribution, trie insertion/terminal/pruning, and segment-tree range overlap when bounds are explicit.
- Trace-backed collection insertion/removal and endpoint changes; map write coalescing; object-field updates/deletions; matrix pointer/empty-state handling; string range validation.

### Remaining work / validation priorities

1. **Real-trace validation:** exercise graph, trie, DSU, specialized trees, and range-query structures against representative real Java solutions, not only synthetic component fixtures.
2. **AVL / red-black trees:** richer balance/height transitions; validate complete multi-node red-black fix-up cases and root-black state where captured.
3. **Treaps:** heap-order behavior only where min/max priority convention is explicit.
4. **B-trees / B+ trees:** child-key range semantics and reliable internal/leaf operation distinctions.
5. **Tries:** complete search/prefix-search/deletion traces, including empty keys and Unicode.
6. **Segment trees:** trace-backed build/update/query transitions and interval-boundary conventions.
7. **Fenwick/Binary Indexed Tree:** index coverage, update propagation, prefix/range queries.
8. **Sparse tables:** query-block and interval visualization where implementation is recognized.
9. **Skip lists:** levels and forward pointers.
10. **Suffix arrays/trees:** index labels and construction/search state where captured.
11. **Sparse matrices:** nonzero entries and row/column coordinates.
12. **Monotonic stacks/queues:** candidate removals only when supported by actual execution, never inferred from names alone.
13. **DSU completion:** path compression, union by rank/size, and component changes.
14. **Operation coverage generally:** add focused regression tests and verify both historical replay and representative real runtime traces.

### Shared acceptance criteria

- Conservative structure detection with generic fallback when ambiguous.
- Stable identity across snapshots; equal values do not merge distinct objects.
- Actual observed operations, values, pointer targets, and ordering only.
- Prev/Next restores the exact recorded state, including aliases, cycles, nulls, and relevant disconnected components.
- Focused tests, extension tests/typecheck/build, and full backend regression pass before a slice is called verified.

## Runtime, trace, and API contracts

### Execution pipeline

The Java runner validates the request, prepares source while preserving original line numbers, compiles with debug information and JDI, runs the tracer under a time limit, parses trace output, enriches events, and builds replayable states. When source preparation is required (for example, adding imports), it must not shift user-visible source lines.

The trace includes event families such as:

- `PROGRAM_START`, `PROGRAM_END`
- `METHOD_ENTER`, `METHOD_EXIT`
- `STEP` for a real source-line/checkpoint
- `VARIABLE_UPDATE`
- `ARRAY_REFERENCE`, `ARRAY_ACCESS`, `ARRAY_WRITE`
- `OBJECT_CREATE`, `OBJECT_FIELD_WRITE`
- `MAP_WRITE`
- `ERROR`, `TIMEOUT`, `TRACE_LIMIT`

Inspect `backend/src/execution/trace/schema.ts` and the tracer before changing event shapes.

### Checkpoint and replay semantics

- JDI checkpoints may observe state before a line's effects are fully reflected. Enrichment associates observed before/after effects with the step that caused them.
- The state builder uses post-state data when available and must not associate a later line's effects with the currently highlighted line.
- Genuine repeated `STEP` events on the same source line are retained, even if displayed values appear unchanged.
- Return handling must show the callee's real return statement before the caller's resumption checkpoint; preserve the caller's locals and returned value.
- Trace size is capped at 5,000 events. A limit or timeout is a failure/incomplete trace, not success.

### Backend endpoints

- `GET /health` — health/readiness response.
- `POST /visualize` — accepts Java source and testcase data; returns execution result and trace-derived states.

Example request shape:

```json
{
  "language": "java",
  "source": "class Solution { /* solution */ }",
  "testcase": {
    "method": "methodName",
    "arguments": ["..."]
  }
}
```

Argument strings and accepted input shapes are governed by `extension/src/types/leetcode.ts`, the Java runner, and runtime support. Check those implementations before changing the contract.

## Security and known limitations

- The server should bind to `127.0.0.1`, not all network interfaces.
- CORS should allow only expected Chrome extension origins. Do not broaden to arbitrary websites.
- Java child-process timeouts and trace caps do not provide OS-level filesystem/network isolation. Treat submitted Java as executing with the backend process user's permissions unless a separately verified isolation layer is introduced.
- The 5,000-event cap is a safety boundary, not a guarantee that arbitrary programs finish or can be visualized completely.
- Same-line backward-branch capture relies on JDI bytecode/location support; compatibility beyond the tested Temurin JDK 17 environment needs separate verification.
- LeetCode DOM and Monaco integration can change as the site changes; test source/testcase extraction and editor highlighting.
- Semantic roles are heuristics, not compiler proofs. Evidence/confidence and safe fallback behavior matter.
- Java is the only supported language in the current API.

## Debugging workflow

1. Reproduce the defect with a minimal Java method and concrete input. Write down expected checkpoints, values, and source lines.
2. Capture the actual trace when possible. Compare event order, line, method, depth, variables, arrays, data structures, objects, semantic roles, and execution effects.
3. Locate the earliest incorrect layer:
   - Missing runtime observation: `YourVisionTracer.java` / `runner.ts`.
   - Correct events but wrong effect timing/association: `enrichTrace.ts`.
   - Correct events but wrong snapshots: `stateBuilder.ts`.
   - Correct snapshots but wrong semantic pointer/structure association: `semanticRoles.ts` / `VisualizerPanel.tsx`.
   - Correct state model but wrong panel/editor behavior: component styles, session/store, or `editor-overlay.ts`.
4. Add regression coverage at the lowest useful layer and a UI regression for visible behavior.
5. Run the focused regression, then relevant feature-matrix tests, then full backend and extension checks.
6. Review actual CI results on the exact new commit. Distinguish environment limitations from product failures.
7. Inspect rendered behavior: line highlight, effect timing, pointer anchoring, data structure state, scrolling, repeated stepping, and reduced motion.

Protect these edge cases:
- `for` initialization, condition, and increment/decrement are distinct phases on a shared source line.
- A failed loop condition is a real result; it must not create a phantom body iteration.
- Enhanced-for entry/exhaustion checkpoints must not lose or invent iterations.
- Do not skip or duplicate the first body line.
- Return values and final mutations belong to the line that produced them.
- Nested calls return to the actual caller checkpoint.
- Matrix `row`/`col` pointers must not be confused with binary-search `left`/`right` bounds.
- Avoid noisy scope-exit variable deletion and fabricated operations.

## Function-call tree proposal

**Status: proposed design; implementation and verification are not confirmed complete.** This is a future feature, not a claim of current functionality.

### Goal and layout

Add an interactive runtime-driven function-call tree so learners can see which invocation called which other invocation while the existing variable/data-structure panels show that invocation's state. Keep the testcase area and floating execution controls outside the layout reflow. The tree starts collapsed; opening it slides in from the left and shifts the existing workspace rather than covering it. Preserve the established dark theme, orange source highlight, output flow, and reduced-motion support.

### Data and lifecycle requirements

- Root represents the actual designated LeetCode entry context; do not invent constructors or execute the first declared helper merely because it appears first.
- Every actual invocation has a stable invocation/frame ID, parent relationship, method signature, and observed parameters. Recursive/repeated calls are distinct nodes.
- Invocation states (entered, active, suspended, returned, and exceptional when captured) are derived from trace history and the selected checkpoint. Pending returns must never show guessed values; distinguish `null`, `void`, missing, and pending.
- Create child nodes only for observed calls. Do not show future/unreached calls as executed.
- Selecting a node navigates the canonical execution timeline to its exact entry checkpoint. Source highlight, variables, structures, output/result, call stack, and playback cursor remain synchronized; this is not a second independent timeline.
- Backward/forward replay must deterministically update invocation states and hide future-only events after stepping backward.
- Nodes should be keyboard-accessible, avoid overlap, support deep/broad navigation with controlled scrolling, and not reset/advance execution when the panel opens or closes.

### Before implementation

Audit the trace model for stable frame IDs, parent invocation IDs, method signatures, parameters, entry/exit events, actual return values/types, and exception exits. Add missing runtime metadata narrowly, with regression coverage for helper methods declared before the entry method, overloads, recursion, short-circuit calls, early/void returns, shared mutable objects, exceptions, and historical navigation. Do not begin with UI-only source scanning that fabricates invocation order.

## Contributor checklist

Before editing:
1. Read this README and inspect the current branch, working tree, relevant implementation, tests, and live CI/PR status.
2. Reproduce the problem and identify the earliest incorrect layer.
3. Establish a focused test baseline.

While editing:
1. Make the smallest general change that preserves product invariants.
2. Add regression tests for confirmed defects, including relevant neighboring/adversarial cases.
3. Do not weaken or delete assertions merely to get green checks.
4. Do not introduce AI/API/provider calls or problem-specific behavior unless explicitly requested.
5. Update this README in the same change when architecture, scripts, capabilities, roadmap, safety constraints, or verification status materially changes. Keep the test commands and capability claims synchronized with package manifests and CI workflows.

Before finishing:
1. Review the full diff and run `git diff --check` in a local checkout when available.
2. Run the focused test, then relevant full suites and build/typecheck checks.
3. Inspect CI results for the exact commit and report only checks that actually ran.
4. State limitations and unrun checks honestly; leave changes reviewable and do not merge a PR unless explicitly asked.


## Production deployment preparation (Render)

The backend container is built from the repository root with `backend/Dockerfile`. It pins the current CI baseline (Node.js 22 + OpenJDK 17, including `javac` and `jdk.jdi`) and starts with `npm start`. Render should use Docker runtime, Dockerfile path `./backend/Dockerfile`, Docker context `.`, and health-check path `/health`. A starter `render.yaml` is included at the repository root.

### Configuration

- `PORT`: HTTP port; defaults to 3000 locally and 10000 in the container/Render environment.
- `HOST`: bind address; defaults to `127.0.0.1` locally and `0.0.0.0` in production.
- `NODE_ENV`: set to `production` on Render.
- `MAX_CONCURRENT_EXECUTIONS`: in-process concurrency cap (default 2).
- `JSON_BODY_LIMIT`: request body limit (default `256kb`).
- `VITE_YOURVISION_API_URL`: production extension build-time URL, e.g. `https://yourvision-backend.onrender.com`.
- `YOURVISION_PRODUCTION_BUILD=true`: validates that the extension API URL is HTTPS and replaces the local host permission in the generated manifest.

### Local container smoke test

Run these commands from the repository root:

```bash
docker build -f backend/Dockerfile -t yourvision-backend:local .
docker run --rm -p 3000:10000 -e PORT=10000 -e HOST=0.0.0.0 yourvision-backend:local
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/readyz
```

The container starts the API, but production code execution is deliberately **fail-closed**. Until a separately isolated execution worker is integrated and verified, `POST /visualize` returns HTTP 503 whenever `NODE_ENV=production`. Do not enable public code execution by removing this guard or by treating Docker alone as a sandbox.

### Execution-isolation status — public launch blocker

The current Java runner compiles and launches user-submitted Java in child processes under the backend container's OS identity. Its timeouts and output/trace limits do not provide OS-level isolation. The Render container setup is packaging and deployment reproducibility, not a sandbox.

The API therefore disables visualization in production until an actual isolated-worker adapter is implemented. The required next step is to run the Java compiler/tracer in a separate restricted worker boundary with no access to API credentials, no unnecessary network access, per-execution filesystem isolation, CPU/memory/PID/wall-clock/output limits, and reliable process cleanup. The worker boundary must be tested with filesystem, network, fork-bomb, memory-exhaustion, timeout, and cross-request isolation cases before the production guard is lifted.

### Extension production build

Build the extension with the deployed API origin:

```bash
cd extension
VITE_YOURVISION_API_URL=https://yourvision-backend.onrender.com YOURVISION_PRODUCTION_BUILD=true npm run build
```

The production build injects the API URL into the service worker and rewrites `dist/manifest.json` host permissions to allow that HTTPS origin while removing the localhost permission. For local development, omit these variables; requests continue to use `http://127.0.0.1:3000`.

### Verification and benchmarks

- Backend regressions: `cd backend && npm ci && npm test`.
- Extension regressions/build: `cd extension && npm ci && npm test && npm run typecheck && npm run build`.
- Container build and health checks: use the Docker smoke commands above.
- Measure compile and trace latency separately; the current runner recompiles Java for each request. Record cold container startup, warm `/health`, warm `/readyz`, successful local visualization latency, peak memory, and CPU under concurrent requests.
#### Initial CI benchmark (2026-10-23)

One GitHub-hosted Linux runner run, Docker image already built, Java execution in development mode. These are baseline measurements, not a Render performance guarantee:

| Measurement | Observed |
|---|---:|
| Local container start to first healthy response | 2.228 s |
| Warm `/health` response | 1.45 ms |
| Warm `/readyz` dependency checks | 256 ms |
| First Java compile + trace request | 2.220 s |
| Second Java compile + trace request | 2.284 s |
| Container memory snapshot after the requests | 62.98 MiB |
| Instantaneous CPU snapshot after the requests | 0.03% |

This was a single low-concurrency sample on a runner with substantially more memory than Render Free. The memory value is a post-request snapshot, not peak memory. Render cold-start latency, peak Java memory, concurrent-request performance, and real billing must be measured on the deployed service before production decisions.

#### Render cost envelope (estimate, not a bill quote)

Based on [Render's current pricing page](https://render.com/pricing) and [Free instance limitations](https://render.com/docs/free):

| Plan | Monthly service cost | Relevant limit |
|---|---:|---|
| Free web service | $0 | 512 MB RAM, 0.1 CPU, 750 free instance-hours per workspace/month; spins down after 15 minutes idle |
| Starter web service | $7/month | 512 MB RAM, 0.5 CPU; does not spin down from free-tier inactivity |

The free plan is suitable for a beta, not a production availability promise. Render documents that if a payment method is attached, overages for some workspace-level usage can be billed; without a payment method, services/builds may instead be suspended when certain included limits are exceeded. Check your workspace billing and usage limits before deployment. The $7 plan estimate covers only the web service, not any future isolated execution worker or other add-ons.

No reliable production cost-per-visualization estimate is available yet. It depends on actual request volume, CPU time, memory, bandwidth, build usage, and the sandbox design. Production visualization remains disabled until the isolated worker is implemented and security-tested.



## Render API + isolated execution worker

Render remains the public API host. The API validates requests, enforces request-size and concurrency limits, and forwards Java execution to a separate Cloud Run service configured with the Cloud Run sandbox launcher. This keeps the original Render deployment plan while placing untrusted compilation and tracing inside the platform sandbox rather than inside Render's web container.

### Why execution is split across two services

The Bubblewrap smoke test failed inside the Docker container with `bwrap: Failed to make / slave: Permission denied`. Do not remove the production fail-closed guard or run arbitrary submitted Java directly on Render to bypass this failure.

The execution worker uses Cloud Run's sandbox launcher, which is currently in Preview. The sandbox blocks outbound network access by default and does not inherit the parent workload's environment variables/secrets. It shares the worker's CPU and memory allocation, so the worker is configured for one concurrent request and 1 GiB memory. See the [Cloud Run code-execution guide](https://docs.cloud.google.com/run/docs/code-execution) and [sandbox configuration for services](https://docs.cloud.google.com/run/docs/configuring/services/sandboxes).

Render receives `YV_EXECUTION_WORKER_URL` and `YV_EXECUTION_WORKER_TOKEN` as private environment variables. The worker receives the same token from Google Secret Manager and rejects every `POST /visualize` request without a matching bearer token. The token must be a strong random secret; never commit it or expose it in extension code. The extension calls only the Render API URL.

### Deployment sequence

1. Deploy the execution worker to a Google Cloud project with billing enabled and Cloud Run sandbox access available. This is a second service, not a replacement for Render. Ordinary Cloud Run free-tier allowances are ongoing, but billing is required and usage beyond allowances can be charged; configure budget alerts first.
2. Create a random token and store it in Google Secret Manager as `yourvision-execution-worker-token`. For example, after enabling Secret Manager, run `openssl rand -hex 32 | gcloud secrets create yourvision-execution-worker-token --data-file=-`. Grant the Cloud Run service identity permission to access that secret. If using the default Compute Engine service identity, obtain the project number with `gcloud projects describe PROJECT_ID --format='value(projectNumber)'`, then grant access at the secret level with `gcloud secrets add-iam-policy-binding yourvision-execution-worker-token --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"`. Copy the secret value into Render's `YV_EXECUTION_WORKER_TOKEN` setting through a secure terminal-to-dashboard workflow; do not print it into logs or commit it.
3. Build and push the backend image:
   
   ```bash
   gcloud config set project PROJECT_ID
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
   gcloud artifacts repositories create yourvision --repository-format=docker --location=asia-south1
   gcloud builds submit --config cloudbuild.yaml --substitutions=_IMAGE=asia-south1-docker.pkg.dev/PROJECT_ID/yourvision/yourvision-backend:latest .
   ```

   If the Artifact Registry repository already exists, skip its create command.

4. Deploy the restricted worker. Replace `PROJECT_ID` and ensure the secret exists and the Cloud Run service identity can access it:

   ```bash
   gcloud beta run deploy yourvision-execution-worker --image asia-south1-docker.pkg.dev/PROJECT_ID/yourvision/yourvision-backend:latest --region asia-south1 --platform managed --allow-unauthenticated --sandbox-launcher --port 8080 --memory 1Gi --cpu 1 --concurrency 1 --timeout 30 --max 3 --set-env-vars NODE_ENV=production,YV_EXECUTION_SANDBOX=cloud-run,YV_EXECUTION_WORKER_MODE=true,MAX_CONCURRENT_EXECUTIONS=1,JSON_BODY_LIMIT=256kb --set-secrets YV_EXECUTION_WORKER_TOKEN=yourvision-execution-worker-token:latest
   ```

   The service can be publicly reachable at the HTTP layer, but execution requests are rejected without the secret bearer token. Verify `/readyz` reports `sandbox.available: true` before connecting Render.

5. In the Render dashboard, configure these environment variables for `yourvision-backend`:
   - `YV_EXECUTION_WORKER_URL`: the worker's HTTPS service URL, with no path.
   - `YV_EXECUTION_WORKER_TOKEN`: the same random secret value stored in Secret Manager.

   The included `render.yaml` declares both as unsynced secrets so they are configured privately in Render. Keep `NODE_ENV=production`. Render's `/readyz` should return 200 only when the worker is reachable and the worker token is configured.

6. Verify the Render service and then configure the extension to use its HTTPS URL:
   
   ```bash
   curl --fail https://YOUR_RENDER_SERVICE.onrender.com/health
   curl --fail https://YOUR_RENDER_SERVICE.onrender.com/readyz
   ```

   Do not build the production extension until its API URL setting points to the Render URL. The extension should never contain the worker URL or token.

### Isolation verification gate

Run the HTTP integration test against the actual deployed worker before exposing the extension to users. This sends a real Java test through the authenticated worker endpoint and verifies that the worker's bearer token is invisible to submitted code, system files are not writable, and outbound network access is blocked:

```bash
export YV_EXECUTION_WORKER_URL=https://YOUR_WORKER_URL
export YV_EXECUTION_WORKER_TOKEN="$(gcloud secrets versions access latest --secret=yourvision-execution-worker-token)"
cd backend
npm ci
npm run test:execution-worker-http
unset YV_EXECUTION_WORKER_TOKEN
```

The test must pass against the deployed Cloud Run service before connecting the extension. A passing Render health check alone is not proof of execution isolation. The platform-level test remains unverified until this command has been run against a real deployment.

