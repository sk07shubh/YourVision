# YourVision — Engineering Handoff for AI Contributors

> **Purpose:** This document is the working technical handoff for an engineer or external AI agent taking over YourVision. Read it before changing code. It records the architecture, current behavior, design constraints, important paths, test strategy, recent fixes, and repository links.
>
> **Last documented:** 2026-10-09. The repository evolves; verify the branch and CI status before relying on any status below.

## 1. Project at a glance

**YourVision** is a Chrome-extension-plus-local-backend project for visualizing actual execution of Data Structures and Algorithms (DSA) solutions on LeetCode. The intended experience is not a fake animation built around a known problem or a manually simulated algorithm. It runs the submitted Java code, captures runtime checkpoints and state, enriches the trace with observable effects and semantic hints, and lets the extension replay those states alongside the real editor.

- **Repository:** https://github.com/sk07shubh/YourVision
- **Current development PR:** https://github.com/sk07shubh/YourVision/pull/52
- **Current working branch:** `feat/deterministic-semantic-visualization`
- **Latest branch commit at handoff:** `0348f9920a817bf2ec12821d9326c27ce93df030`
- **Extension source:** https://github.com/sk07shubh/YourVision/tree/feat/deterministic-semantic-visualization/extension
- **Backend source:** https://github.com/sk07shubh/YourVision/tree/feat/deterministic-semantic-visualization/backend
- **Actions:** https://github.com/sk07shubh/YourVision/actions
- **Open PR #52:** https://github.com/sk07shubh/YourVision/pull/52
- **Related earlier PR #51:** https://github.com/sk07shubh/YourVision/pull/51

The root `README.md` is currently empty on the documented branch, so this handoff is intentionally more detailed than a normal README.

## 2. Product goals and non-negotiable UX principles

The product should make code execution observable so the learner can infer the algorithm, rather than narrating every line in a tutorial.

1. **Real execution, not problem-specific mock behavior.** Do not special-case Binary Search, Two Sum, or a specific LeetCode problem to make its visual look correct. Derive behavior from source, runtime trace, and generic structure/role inference.
2. **Effects belong to the line that caused them.** If a highlighted line updates a variable or data structure, show that effect with that same line/state—not one step later as a post-line replay mismatch.
3. **Keep the current layout and refine it.** The established panel places the data-structure visualization beside execution/code context. The execution panel and controls should remain visible/sticky while the surrounding visualization content scrolls.
4. **Show actual data changes.** Highlight array cells that are accessed/changed; do not move an array cell out of its normal position just to indicate access.
5. **Pointers should be attached to the right data structure and index.** Binary-search `left`, `right`, and `mid` should be visible over the correct array cells. Matrix traversal variables such as `row` and `col` are not the same thing as outer binary-search boundaries.
6. **Make loop-header execution meaningful.** For a `for` header, distinguish initialization, condition evaluation, and increment/decrement. A line may be highlighted as a whole, while the executed substatement/result communicates which clause ran.
7. **Use restrained, legible effects.** The user rejected noisy `+/-` change labels. Show the changed value or structural effect with consistent typography and visual emphasis. A true/false condition is itself an execution result and should be presented in the result area, not as unrelated duplicate explanation.
8. **Avoid noisy scope cleanup.** Do not clutter the variables panel with a flood of variables disappearing merely because a loop or scope ended.
9. **Preserve source-line mapping.** Instrumentation/imports must not shift the user's original Java line numbers, since the extension highlights the corresponding LeetCode editor line.
10. **Fix the general rule and add a real regression.** Each bug fix should include a reproducible test using representative source code and execution data. Do not claim success based only on one happy-path example.

## 3. System architecture

At a high level:

```text
LeetCode page / editor
        |
        v
Chrome content integration
  - find editor and source
  - extract selected method / testcase
  - open and control visualizer
        |
        v
Extension API client
        |
        | POST /visualize
        v
Local Express backend (127.0.0.1:3000)
  - validate request
  - compile Java with debug info
  - run under Java JDI tracer
  - emit execution trace
        |
        v
Trace enrichment
  - normalize / associate runtime checkpoints
  - derive variable, array, map, object effects
  - annotate conditions and semantic variable roles
        |
        v
Trace state builder
  - replay events into immutable-ish snapshots
        |
        v
Extension session store
  - response, states, current index, play/pause
        |
        v
VisualizerPanel
  - source line highlight
  - current substatement / condition result
  - variable and data-structure views
  - Previous / Next / Play controls
```

The backend currently explicitly supports **Java only**. The HTTP endpoint rejects other languages; do not describe Python/C++ support as implemented unless the code has changed.

## 4. Main repository layout

### Extension

- `extension/package.json` — scripts and dependencies. React 19, Vite 8, TypeScript, Vitest.
- `extension/vite.config.ts` — builds the content script and service worker as separate entries into `extension/dist`.
- `extension/tsconfig.json` — strict TypeScript checking for extension source/tests/config.
- `extension/src/content/main.tsx` — content-script entry point.
- `extension/src/leetcode/integration.tsx` — integration with the LeetCode page and visualizer.
- `extension/src/leetcode/selectors.ts` — locate LeetCode/editor DOM elements.
- `extension/src/leetcode/code-source.ts` — source extraction.
- `extension/src/leetcode/method.ts` — selected method discovery.
- `extension/src/leetcode/testcase.ts` and `dom-testcase.ts` — testcase extraction/parsing.
- `extension/src/leetcode/editor-overlay.ts` — highlights the currently executed editor line; can request line reveal through the extension messaging layer.
- `extension/src/background/service-worker.ts` — background/service-worker message handling.
- `extension/src/api/backend.ts` — backend request boundary (inspect this for exact request URL/error behavior).
- `extension/src/state/store.ts` — session state and playback actions.
- `extension/src/state/session.ts` — React subscription to the external session store via `useSyncExternalStore`.
- `extension/src/types/trace.ts` — frontend trace/state/response contracts.
- `extension/src/types/leetcode.ts` — LeetCode testcase and integration types.
- `extension/src/types/messages.ts` — extension message contracts.
- `extension/src/utils/value.ts` — value display, stable serialization, plain-object helpers.
- `extension/src/theme/leetcode-theme.ts` — theme integration.
- `extension/src/components/VisualizerPanel.tsx` — core execution-panel UI and interpretation of current trace state: event effects, condition result, substatement display, pointer labels, variable/data-structure rendering, and controls.
- `extension/src/components/styles.css` — panel and visualization styling.
- `extension/src/components/VisualizerPanel.test.tsx` — visualizer component regression tests.
- Other tests include `store.test.ts`, `selectors.test.ts`, `method.test.ts`, and `testcase.test.ts`.

Useful links:
- [VisualizerPanel.tsx](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/extension/src/components/VisualizerPanel.tsx)
- [VisualizerPanel tests](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/extension/src/components/VisualizerPanel.test.tsx)
- [Extension state store](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/extension/src/state/store.ts)
- [Editor overlay](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/extension/src/leetcode/editor-overlay.ts)
- [Extension package scripts](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/extension/package.json)

### Backend

- `backend/package.json` — runtime and smoke/regression scripts.
- `backend/src/server.ts` — Express server, CORS restrictions, `GET /health`, `POST /visualize`.
- `backend/src/execution/java/runner.ts` — validates the testcase, writes temporary Java source/runtime files, compiles with `javac -g` and JDI, runs the tracer, parses output, builds states, and reports errors/timeouts/trace limits.
- `backend/src/execution/java/YourVisionRuntime.java` — runtime support for invoking submitted solutions and compatible argument/node handling.
- `backend/src/execution/java/YourVisionTracer.java` — Java/JDI tracing implementation. Read this when debugging which checkpoints/events are captured.
- `backend/src/execution/java/LeetCodeListNode.java` and `LeetCodeTreeNode.java` — compatibility node types where a submission does not declare its own.
- `backend/src/execution/trace/schema.ts` — trace event and state contracts.
- `backend/src/execution/trace/enrichTrace.ts` — trace enrichment, condition annotation, derived effects, line association, checkpoint normalization.
- `backend/src/execution/trace/semanticRoles.ts` — source-based semantic variable role inference.
- `backend/src/execution/trace/stateBuilder.ts` — folds trace events into replayable visible state snapshots.
- `backend/scripts/smoke-*.ts` — feature-specific smoke/regression tests. The scripts are not disposable demos; preserve and extend them.

Useful links:
- [Backend server](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/server.ts)
- [Java runner](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/java/runner.ts)
- [Trace enrichment](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/trace/enrichTrace.ts)
- [Semantic roles](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/trace/semanticRoles.ts)
- [State builder](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/trace/stateBuilder.ts)
- [Trace schema](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/trace/schema.ts)
- [Backend package scripts](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/package.json)

## 5. Runtime and trace model

### Actual execution

The Java runner validates the method/testcase, creates a temporary directory, prepares the submitted source, compiles with debug information and the JDI module, runs the tracer with a time limit, parses the trace, and creates state snapshots. It preserves source line mapping: if it needs to add `java.util.*`, it inserts the import on the package line or before the source without adding a separate line that would shift source lines.

The trace is intended to represent observed runtime behavior. A hard trace-event cap (`MAX_TRACE_EVENTS = 5000`) prevents unbounded traces. The runner distinguishes validation, compilation, runtime, timeout, and harness failures. Check the actual result kind before rendering a success state.

### Event contract

The trace schema includes event types such as:

- `PROGRAM_START`, `PROGRAM_END`
- `METHOD_ENTER`, `METHOD_EXIT`
- `STEP` — a line/checkpoint for replay
- `VARIABLE_UPDATE`
- `ARRAY_REFERENCE`, `ARRAY_ACCESS`, `ARRAY_WRITE`
- `OBJECT_CREATE`, `OBJECT_FIELD_WRITE`
- `MAP_WRITE`
- `ERROR`, `TIMEOUT`, `TRACE_LIMIT`

Events may contain line, method, depth, sequence and type-specific data. The exact data shape is defined in the backend schema and tracer; inspect it before adding a new event type.

### The pre-state/post-state distinction matters

JDI commonly pauses at checkpoints before a line's effects have been fully reflected in the snapshot. YourVision enriches the trace by comparing neighboring runtime checkpoints and attaching observed effects to the step that caused them. In the state builder, a `STEP` uses `postVariables ?? variables` where available. The goal is that the currently highlighted line and the visible changes describe the same execution—not the next line's effect.

When changing replay order or deriving events, test:
- first body line after method entry;
- final line before method exit/return;
- caller resume after nested method call and assignment;
- repeated loop-header checkpoints;
- array/map/object changes;
- condition true/false results;
- exceptions, timeouts, and trace limit behavior.

### State snapshots

A frontend `TraceState` contains at least:
- `sequence`, `line`, `method`, `depth`
- `variables`
- `arrays`
- `dataStructures`
- `objects`
- `callStack`
- `lastEvent`
- optional `error`

The state builder applies events in sequence and emits checkpoints suitable for Next/Previous/Play. It suppresses some adjacent identical visible checkpoints, but deliberately preserves repeated `STEP` events because the same line can execute multiple times even when no displayed value changes.

## 6. Semantic roles and pointer visualization

`backend/src/execution/trace/semanticRoles.ts` infers semantic hints from source rather than relying only on variable names. Roles include:

- `left-bound`
- `right-bound`
- `midpoint`
- `loop-counter`
- `pointer`
- `derived-value`
- `answer-value`
- `unused`

Hints can include name, role, confidence, evidence, structure name, usage, and method. The enrichment layer attaches active roles to relevant STEP events. The frontend uses these hints to make variables visually meaningful without hard-coding a particular problem.

### Important recent pointer fix

In PR #52, pointer labels were missing in a real binary-search visualizer case. The underlying issues were:
1. array-index expression detection used an incorrectly escaped regex;
2. `left` and `right` did not necessarily appear directly inside `nums[...]`, so looking only at names used as array indices was insufficient;
3. semantic role hints could omit `structureName`, so strict array-name matching excluded valid boundary roles.

The fix:
- corrected the array index expression regex;
- when array-specific role hints are absent, detects a one-dimensional binary-search array indexed by a variable inferred as `midpoint`, then associates inferred `left-bound`, `right-bound`, `midpoint`, and pointer roles with that array;
- keeps matrix visualization separate, so matrix `row`/`col` traversal pointers do not get conflated with outer binary-search bounds;
- added a regression test in `VisualizerPanel.test.tsx`: `renders binary-search pointers from real array-index expressions when roles omit structureName`.

This is a **general fallback**, not a Binary Search problem-specific branch. If changing it, preserve the test and add cases for matrix traversal and arrays with multiple candidate structures.

## 7. Current visualizer behavior and UX intent

The panel uses the current `TraceState` to derive:
- the editor line to highlight;
- the executed substatement for a multi-clause `for` header (initialization, condition, increment/decrement);
- condition result when the current event includes `conditionResult`;
- variable changes and structural effects associated with the current line;
- array accesses/writes and pointer labels;
- map writes and object-field updates;
- method/return/error/timeout/trace-limit states;
- current playback position and navigation.

`eventEffects()` reads `executionEvents` attached to the current step, including array accesses/writes, map writes, and object-field writes. The enrichment layer's convention that those events belong to the line currently highlighted is important. Avoid adding a second effect rendering path that duplicates the same effect.

The editor overlay marks the line with a subtle orange background/left accent. If the line is not mounted/visible, it can send a `REVEAL_LINE` message and retry. Clear the old marker when changing steps/sessions so decorations do not accumulate.

## 8. Backend API

The server listens on `127.0.0.1:3000` by default.

### Health check

```http
GET /health
```

Returns a small JSON health status.

### Visualize

```http
POST /visualize
Content-Type: application/json

{
  "language": "java",
  "source": "class Solution { ... }",
  "testcase": {
    "method": "methodName",
    "arguments": ["..."]
  }
}
```

The response includes `language`, `testcase`, and `execution`; the execution result can contain `success`, `kind`, result/stdout/stderr, message/error information, trace, and states. Testcase argument values are passed as strings and parsed by the Java runtime. Verify exact argument conventions in `extension/src/types/leetcode.ts`, `backend/src/execution/java/runner.ts`, and the Java runtime before changing them.

CORS accepts Chrome extension origins matching the extension ID shape; do not casually broaden this to arbitrary web origins. The service binds to localhost rather than all network interfaces.

## 9. Development setup

Requirements:
- Node.js/npm compatible with the lockfiles and toolchain.
- A JDK with `javac`, `java`, and the `jdk.jdi` module available.
- Chrome and access to a LeetCode problem page for end-to-end extension testing.

Clone and install:

```bash
git clone https://github.com/sk07shubh/YourVision.git
cd YourVision
git checkout feat/deterministic-semantic-visualization
git pull origin feat/deterministic-semantic-visualization

cd extension
npm install
npm run typecheck
npm test
npm run build
```

In a second terminal:

```bash
cd YourVision/backend
npm install
npm run typecheck
npm run dev
```

Backend defaults to `http://127.0.0.1:3000`. Confirm it with `curl http://127.0.0.1:3000/health`.

For local Chrome testing, build the extension and load the generated `extension/dist` directory as an unpacked extension. Confirm the current manifest location and packaging instructions before changing the build; the tree currently has `extension/src` and a Vite build, and a root-level `extension/manifest.json` was not found at the time this document was written.

## 10. Testing and CI

### Extension scripts

From `extension/`:
- `npm run typecheck`
- `npm test` (Vitest)
- `npm run build` (TypeScript check plus Vite production build)

Add UI regressions to `extension/src/components/VisualizerPanel.test.tsx` or the relevant focused test file. Prefer assertions against actual rendered behavior rather than only helper implementation details.

### Backend scripts

From `backend/`:
- `npm run typecheck`
- `npm run test:trace-state`
- `npm run test:trace-enrichment`
- `npm run test:semantic-roles`
- `npm run test:trace-replay`
- `npm run test:java-runtime`
- `npm run test:java-same-line-loop`
- `npm run test:java-state`
- `npm run test:array-discovery`
- `npm run test:data-structures`
- `npm run test:leetcode-nodes`
- `npm run test:leetcode-structures`
- `npm run test:leetcode-algorithms`
- `npm run test:leetcode-execution-corpus`
- `npm run test:feature-matrix`
- `npm run test:condition-evaluator`
- `npm run test:backend-readiness`
- `npm run test:server-security`
- `npm run test:java-safety`
- `npm run test:java-exception-unwind`
- `npm run test:all` (full backend sequence)

CI workflows currently include:
- [Backend workflow](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/.github/workflows/backend.yml)
- [Full regression workflow](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/.github/workflows/full-regression.yml)
- [All GitHub Actions runs](https://github.com/sk07shubh/YourVision/actions)

**Do not say CI is green based on one job or one test.** Check all required workflow runs on the exact latest commit, inspect failed job logs, fix the underlying regression, and rerun until complete. The user has previously encountered false confidence from narrow, problem-specific fixes and expects genuine verification.

## 11. Debugging workflow for a trace bug

1. Reproduce with a small Java method and a real input; write down expected states and exact source lines.
2. Capture/export the actual debug trace from the visualizer (when possible). Compare event sequence, line, method, depth, variables, arrays, data structures, objects, semantic roles, and execution events.
3. Decide which layer is wrong:
   - missing runtime observation → inspect `YourVisionTracer.java` / `runner.ts`;
   - correct raw events but wrong effect association/order → inspect `enrichTrace.ts`;
   - correct events but wrong snapshots → inspect `stateBuilder.ts`;
   - correct states but wrong role/pointer association → inspect `semanticRoles.ts` and `VisualizerPanel.tsx`;
   - correct state/UI model but wrong screen/editor interaction → inspect component/styles and `editor-overlay.ts`.
4. Add a regression at the lowest useful layer **and** a UI regression when the bug is visible in the panel.
5. Run the focused test first, then relevant feature-matrix tests, then full backend and extension checks.
6. Inspect actual CI run/job results on the new commit. Never infer that a workflow passed from an earlier commit.
7. Review the rendered experience: line highlight, effect timing, pointer location, data structure state, scroll behavior, and repeated stepping.

### Trace-specific edge cases to protect

- `for` initialization should show only initialization (for example `i = 0`) on that execution phase, not prematurely show the condition as executed.
- Condition and increment/decrement are separate phases even though the source line is shared.
- A failed condition at loop end is a real condition result; do not create an extra phantom body iteration.
- Enhanced-for headers may have an initial checkpoint before the loop variable is assigned and an exhausted-iterator checkpoint; normalize these without losing real iterations.
- The first body line after method entry must not be skipped or duplicated.
- A return value/last mutation must remain associated with the line that produced it.
- Nested method return values assigned in the caller should map back to the call line correctly.
- Matrix `row`/`col` are traversal indices, not necessarily the binary-search `left`/`right` bounds.
- Arrays, maps, linked nodes, trees, objects, and primitive variables should remain represented by runtime data, not assumed from a named problem.
- Do not flood the variable pane with scope-exit deletion noise.

## 12. Known design and implementation constraints

- **Language:** Java is the only language accepted by the current API.
- **Trace is bounded:** max 5,000 events and runtime timeouts are deliberate safeguards.
- **Line numbers are contract data:** avoid source transformations that add/remove lines before user code.
- **Semantic role inference is heuristic.** It is a hint layer, not a compiler-grade proof. Keep evidence/confidence useful and avoid overconfident associations when the source does not support them.
- **Structure association can be missing.** The frontend may need safe, evidence-based fallbacks, but those fallbacks must not cross-associate unrelated arrays/matrices.
- **Runtime snapshots are authoritative.** Prefer captured values/events to guessing what an algorithm “should” do.
- **The extension is coupled to LeetCode DOM/editor behavior.** Selectors and source/testcase extraction need focused tests because site markup may change.
- **Security:** preserve input validation, local-only binding, restrictive CORS, bounded execution and safe error reporting. Review the Java execution boundary before accepting untrusted source changes.

## 13. Current branch and recent work

### PR #52 — deterministic semantic visualization

PR: https://github.com/sk07shubh/YourVision/pull/52

Branch: `feat/deterministic-semantic-visualization`

This branch builds a generic semantic layer to make variable/pointer visualization more reliable. Recent work included semantic-role inference/enrichment, runtime metadata and regressions for loops, replay, and UI pointer rendering. The latest documented change fixes pointer labels when role hints lack a structure name, with an actual array-index expression regression test.

Latest commit recorded when this handoff was assembled:
`0348f9920a817bf2ec12821d9326c27ce93df030`

### PR #51 — API-ready semantic trace layer

PR: https://github.com/sk07shubh/YourVision/pull/51

This is related earlier work. Check its actual status and diff before assuming it is merged or safe to change. Do not modify unrelated PRs/branches as part of a focused task.

**Branch/CI status can change after this document is written.** Open the PR and Actions links and check the current head SHA, merge status, required checks, and latest run conclusions before continuing. Do not merge PRs unless the repository owner explicitly asks.

## 14. Working agreement for an external AI agent

Before editing:
- Read this document, then inspect the current branch and working tree.
- Read the exact implementation and tests involved; this document is orientation, not a substitute for source.
- Establish a baseline by running the relevant tests and checking current CI.
- Reproduce the issue from real source/input or an exported trace.
- Explain the root cause in terms of data flow, not just the visible symptom.

When implementing:
- Make the smallest general fix that matches the architecture.
- Do not add a special case for a specific LeetCode title, signature, input, or sample.
- Preserve existing UI/layout and only refine the behavior requested.
- Add regression tests for both successful and adversarial/neighboring cases.
- Avoid broad unrelated refactors while trace semantics are under active development.
- Do not silently delete tests or weaken assertions to make CI green.
- Never fabricate trace output or claim a test ran if it did not.

Before declaring completion:
- List files changed and explain the causal fix.
- Give exact test commands and actual outcomes.
- Verify every required CI workflow on the latest commit.
- Report failures honestly; continue fixing if the user asked for green.
- Leave PRs unmerged unless explicitly instructed.

## 15. High-value starting points

For a new trace/pointer/loop bug, start here in this order:

1. [Visualiser panel and event interpretation](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/extension/src/components/VisualizerPanel.tsx)
2. [Visualizer UI regressions](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/extension/src/components/VisualizerPanel.test.tsx)
3. [Trace enrichment and event association](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/trace/enrichTrace.ts)
4. [Semantic role inference](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/trace/semanticRoles.ts)
5. [State replay builder](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/trace/stateBuilder.ts)
6. [Java runner](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/java/runner.ts)
7. [JDI tracer](https://github.com/sk07shubh/YourVision/blob/feat/deterministic-semantic-visualization/backend/src/execution/java/YourVisionTracer.java)
8. [Backend smoke/regression tests](https://github.com/sk07shubh/YourVision/tree/feat/deterministic-semantic-visualization/backend/scripts)
9. [GitHub Actions](https://github.com/sk07shubh/YourVision/actions)

---

## Final reminder

YourVision's central technical challenge is maintaining a truthful mapping between **real Java execution**, **trace events**, **replay state**, and **what the learner sees on the highlighted source line**. Every layer must agree. A visual that looks plausible for one problem is not sufficient; the implementation should work across different valid programs and be protected by regression tests.
