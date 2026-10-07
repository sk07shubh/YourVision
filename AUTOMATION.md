# YourVision Automation & Testing

This document is the operational testing/CI reference for the current YourVision repository. It describes what is actually automated today, how to run it, what the browser harness covers, and the rules future coding agents should follow.

It is intentionally not a copy of the full product specification.

## Current baseline

- Latest verified commit: `7a5fb75` (`fix: restrict local execution backend access`)
- Default branch: `main`
- Backend Regression run #228 (`36546537125`) — passed on Eclipse Temurin JDK 17.0.20
- Extension Browser Regression run #60 (`36546537118`) — passed; Playwright Chromium installed successfully
- Historical baseline `ec9a06f` and its runs are retained in the verification record below.

The browser suite contains 15 tests (12 declared cases plus the three testcase-flow variants). It uses deterministic LeetCode-shaped pages and a local mock `/visualize` backend.

## Test layers

### 1. Backend TypeScript typecheck

From `backend/`:

```bash
npm run typecheck
```

This runs:

```bash
tsc --noEmit
```

### 2. Backend regression/smoke suite

The main command is:

```bash
npm run test:all
```

Current `backend/package.json` expands this into:

```text
npm run typecheck
npm run test:trace-state
npm run test:trace-enrichment
npm run test:trace-replay
npm run test:java-runtime
npm run test:java-same-line-loop
npm run test:java-state
npm run test:leetcode-nodes
npm run test:leetcode-structures
npm run test:leetcode-algorithms
npm run test:backend-readiness
npm run test:server-security
npm run test:java-safety
npm run test:java-exception-unwind
npm run test:array-discovery
npm run test:data-structures
```

The individual scripts are useful when debugging a specific layer.

Important backend coverage currently includes:
- trace-state replay
- trace enrichment
- trace replay
- Java runtime execution
- same-source-line loop execution
- Java/state integration
- LeetCode ListNode/TreeNode handling
- LeetCode structure inputs
- algorithm smoke coverage
- backend readiness
- loopback-only backend binding and extension-origin CORS policy
- Java safety/timeout behavior
- Java exception unwind
- Java array-access discovery
- Java data-structure snapshots

### 3. Extension unit/component tests

From `extension/`:

```bash
npm test
```

Equivalent non-watch command:

```bash
npm run test
```

This uses Vitest.

### 4. Extension typecheck

```bash
npm run typecheck
```

This runs:

```bash
tsc --noEmit
```

### 5. Extension production build

```bash
npm run build
```

This runs the TypeScript typecheck followed by the Vite build.

### 6. Browser/E2E regression

From `extension/`:

```bash
npm run test:e2e
```

This first builds the extension and then runs Playwright:

```bash
npm run build && playwright test
```

The Playwright configuration uses:
- `extension/e2e` as the test directory
- one worker
- `fullyParallel: false`
- 45-second test timeout
- 10-second assertion timeout

The browser test loads the built extension into Chromium and uses a deterministic local LeetCode-shaped page plus a local mock `/visualize` backend. It does not depend on a live LeetCode account.

## Current browser regression coverage

The Playwright suite currently covers testcase integration, trace replay, data structures, returns, errors, and safety behavior.

### Selected/default testcase

Verifies:
- Visualize is available from the testcase area
- the selected testcase is used
- the Visualizer opens
- method-entry content is shown
- the orange editor source-line highlight appears on the correct line
- ArrowRight advances the visualizer
- the next source line is highlighted
- the final output is displayed
- the request sent to the backend contains Java source and the selected testcase argument

### Custom testcase

Verifies the same core execution flow while the testcase is marked as Custom.

### Failed submission -> Use Testcase

Verifies that a failed submission's testcase can be used by Visualize and that the Visualizer identifies it as a failed testcase.

### Repeated same-line loop -> return -> caller resume

Uses deterministic states representing a helper method with repeated execution on the same `while` line.

Verifies:
- repeated checkpoints on the same source line are retained
- the displayed variable values advance across those checkpoints
- the displayed array snapshot advances with the loop
- Previous navigation restores the earlier checkpoint
- the helper's actual `return` line is highlighted
- execution then resumes at the caller's call line
- the helper disappears from the displayed call stack after returning
- the backend request is made with the expected source

### Keyboard controls and data-structure views

Browser coverage verifies ArrowLeft, ArrowRight, Space, and `R`, including previous-state restoration, reset, focus behavior, stable testcase selection, and prevention of key events bubbling into the page.

Structure rendering coverage includes indexed arrays, key/value maps, unordered set chips without array indexes, vertically displayed stacks, queue/deque directions, priority-queue heap layout, linked-list identity, tree relationships, nested objects, aliases, and cycles.

## What browser tests currently assert

The browser suite currently asserts these user-visible behaviors:

- keyboard stepping with ArrowRight
- previous/next checkpoint navigation
- final output rendering
- orange source-line highlighting
- repeated same-line checkpoint navigation
- variable state changes at repeated checkpoints
- array state changes at repeated checkpoints
- helper return-line highlighting
- caller-resume behavior
- call-stack transition after a helper returns
- default/custom/failed-testcase integration

The browser tests intentionally assert the observable UI behavior rather than internal implementation details.

## CI

There are currently two GitHub Actions workflows.

### Backend Regression

Workflow file:

```text
.github/workflows/backend.yml
```

Workflow name:

```text
Backend Regression
```

Environment:
- `ubuntu-latest`
- Node.js 22
- Eclipse Temurin Java 17

The workflow:
1. checks out the repository
2. installs Node 22
3. installs Temurin JDK 17
4. runs `npm ci` in `backend/`
5. runs `npm run test:all`

### Extension Browser Regression

Workflow file:

```text
.github/workflows/extension-browser.yml
```

Workflow name:

```text
Extension Browser Regression
```

Environment:
- `ubuntu-latest`
- Node.js 22
- Playwright Chromium with OS dependencies

The workflow:
1. checks out the repository
2. installs Node 22
3. runs `npm ci` in `extension/`
4. runs `npx playwright install --with-deps chromium`
5. runs `xvfb-run --auto-servernum npm run test:e2e`

Both workflows run on pushes to `main` and `yourvision-safety-hardened`, and on pull requests targeting `main`.

## Runtime/trace regression coverage

### Same-line loop execution

Java execution uses JDI line stepping plus targeted breakpoints for genuine backward-branch re-entry when a loop returns to the same source line.

The regression checks that a same-line condition is observed on every genuine visit rather than only once.

The live regression currently checks a four-visit loop and verifies:
- all four checkpoints exist
- the exact source line is retained
- the pre-increment variable values are `0, 1, 2, 3`
- method entry is preserved
- the actual return statement line is preserved

### Runtime-to-visualizer integration

The same-line integration regression verifies that runtime checkpoints survive state building and replay.

It checks:
- repeated checkpoints remain distinct
- array snapshots advance at each checkpoint
- helper return state keeps the helper's actual return line and final locals
- caller resume returns to the call line
- the returned value is present in the caller
- replay checkpoints correspond to distinct enriched events

### 5,000-event safety limit

The Java runtime/trace pipeline has a 5,000-event safety limit. The returned/enriched trace and replayed states are checked so they do not exceed this limit.

This is a safety boundary against pathological or unexpectedly large traces; it is not a guarantee that arbitrary programs can be fully visualized.

### StateBuilder repeated checkpoints

Adjacent identical `STEP` events are intentionally retained when they represent real runtime checkpoints at the same source line.

Duplicate boundary behavior may still be collapsed where it is an artifact of method-return/caller-resume replay rather than a separate execution checkpoint.

### Return/caller replay

A method exit preserves the callee's actual return statement location. A subsequent caller checkpoint restores the caller line, caller locals, and call stack.

This distinction is important because the visualizer must show the line that actually returned before showing the caller resuming.

## Known limitations

### JDI bytecode/location support

Same-line backward-branch capture relies on JDI access to method bytecode/location information. The targeted-breakpoint implementation therefore depends on the Java VM/debugging implementation exposing the required bytecode locations.

The current CI environment uses Temurin JDK 17 and exercises this path successfully. Compatibility with other JVM implementations should be treated as a separate verification item.

### Java process isolation

The backend runs the Java tracer as a child process with execution timeouts and trace-size limits. It is not an OS-level sandbox: submitted Java may otherwise use the backend process user's filesystem and network permissions. Do not describe the execution as sandboxed. A cross-platform process-isolation strategy remains a separate security design milestone.

### Local managed Chrome environment

The local development Chrome installation has previously been administrator-managed and did not allow the unpacked extension to be loaded normally.

The browser regression therefore has a repository-owned Playwright/Chromium path that can run independently of that local Chrome policy.

A local Chrome policy failure is an environment limitation, not evidence that the extension regression itself failed.

### Browser harness scope

The browser harness uses a deterministic LeetCode-shaped fixture and mocked `/visualize` responses. It verifies extension/UI integration without depending on the real LeetCode site or a live Java backend.

Backend correctness and real-browser integration are therefore covered by separate test layers.

### C++

C++ support is planned product scope but is not part of the current implementation baseline. Do not implement or start C++ work unless explicitly requested.

## Rules for future AI coding agents

1. Inspect the repository and existing tests before changing behavior.
2. Run the smallest relevant regression first, then the broader suite after the fix.
3. Add regression coverage for every confirmed functional bug.
4. Do not weaken or delete an assertion merely to make a test pass.
5. Do not claim browser verification without actually executing a browser test or having a successful CI browser run.
6. Use the existing Playwright/browser harness instead of creating duplicate browser infrastructure.
7. Keep backend runtime tests separate from browser/UI tests when that separation makes failures easier to diagnose.
8. Distinguish environment failures (for example local Chrome policy or missing Playwright browser) from product failures.
9. Preserve source-line semantics: a displayed line must correspond to a real runtime checkpoint, not a guessed frontend mapping.
10. Preserve repeated same-line checkpoints when they represent real execution.
11. Preserve the actual callee return line before showing the caller resume.
12. Respect the 5,000-event safety limit.
13. When changing trace semantics, update both backend regression coverage and any affected browser/state fixtures.
14. When changing Visualizer behavior, prefer a user-visible browser regression where practical.
15. Do not implement C++ unless explicitly requested.
16. Avoid unrelated refactors in a functional-correctness milestone.
17. Before considering a milestone complete, check formatting/diff hygiene with `git diff --check` in a local checkout.
18. Leave the working tree clean after the milestone.
19. Commit coherent milestones separately so regressions can be bisected.
20. Treat CI as verification, not as a substitute for understanding the failure.

## Current verification record

At the latest verified commit `7a5fb75`:
- Backend Regression: passed (run #228, Eclipse Temurin JDK 17.0.20)
- Local backend `npm run test:all`: passed on OpenJDK 26.0.1, including `test:server-security`
- Extension Vitest: 6 files / 15 tests passed
- Extension typecheck and production build: passed
- Extension Browser Regression: passed (run #60; Chromium installed; 15/15 tests passed)
- The local machine has no Playwright Chromium executable; browser behavior was verified by GitHub Actions.

At the historical `ec9a06f` baseline:
- Backend Regression: passed (`36330294140`, run #174)
- Extension Browser Regression: passed (`36330294112`, run #6)
- Browser coverage at that time: 4 flows
- Backend `test:all`: included in the successful Backend Regression run
- Extension browser suite: included in the successful Extension Browser Regression run
- This is historical verification, not the current main branch baseline.

## Next-audit rule

After the earlier automation-documentation milestone, the repository was audited against the product/test context. The latest audit fixed these gaps: the cyclic snapshot regression selected an earlier pre-assignment state; HashSet was displayed with array-style indexes despite having no guaranteed order; browser coverage omitted Space/`R` controls and some collection semantics; and the local execution backend was exposed on all interfaces with permissive CORS. Fixes and regression coverage are recorded above.

Do not immediately implement that next gap in the same documentation milestone. First identify:
- the exact user-visible failure or missing guarantee
- the relevant backend/frontend path
- whether existing tests already cover it
- the smallest deterministic regression that would reproduce it
- whether the gap is a correctness bug or simply future scope

Only then begin the next implementation milestone.

<!-- temporary CI verification marker -->
