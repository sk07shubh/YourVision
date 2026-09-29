# YourVision Engineering Guide

YourVision is a LeetCode Chrome extension that traces and visualizes the user's own Java program. Read [AUTOMATION.md](AUTOMATION.md) for current architecture, test commands, CI workflows, coverage, and known limitations.

## Product invariants

- Runtime events and source locations from the backend are authoritative. The frontend must not invent execution steps, state, or line mappings.
- A displayed state must match its highlighted source line. Preserve real same-line loop visits, method re-entry, method-entry parameters, actual return lines, caller resume, and object identity.
- Keep the orange source-line highlight; do not add an execution arrow. Keep the Output panel; do not restore Expected UI or placeholder values.
- Keep solutions generic. Do not add problem-, testcase-, variable-, or source-line-specific behavior.
- Preserve the existing Java runtime and data-structure behavior. C++ is future scope; do not implement it unless requested.
- Bound tracing and graph traversal. A reached limit or timeout must be reported as incomplete/failure, never as successful execution.
- The local backend must bind only to loopback and allow browser CORS only for Chrome extension origins. Never claim Java subprocess execution is OS-sandboxed unless isolation is actually implemented and verified.

## Architecture

The Java execution path is `backend/src/execution/java/runner.ts` → `YourVisionTracer.java` / `YourVisionRuntime.java` → `backend/src/execution/trace/stateBuilder.ts` / `enrichTrace.ts` → the extension's `VisualizerPanel.tsx`. LeetCode DOM selectors and testcase extraction live under `extension/src/leetcode/`.

Trace bugs should be followed through each layer to their source. Preserve original source-line mapping through compilation and compatibility support. Do not patch a frontend symptom when the runtime trace is wrong.

## Engineering workflow

1. Inspect the current implementation and tests before editing.
2. Reproduce confirmed defects and add regression coverage.
3. Make the smallest general fix; do not weaken tests to get a pass.
4. Run focused tests, then the relevant full suites and browser regression for browser-visible changes.
5. Review `git diff`, run `git diff --check`, remove temporary artifacts, and keep the worktree clean.
6. Commit coherent, verified milestones. When pushed, inspect the workflow result for that exact commit.

Useful commands:

```bash
# backend/
npm run test:all

# extension/
npm test
npm run typecheck
npm run build
npm run test:e2e
```

The browser suite uses Playwright Chromium in GitHub Actions. A local managed-Chrome restriction is an environment limitation; retain browser coverage and use CI for browser verification.
