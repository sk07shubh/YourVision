# YourVision Project Memory

Last audited: 2026-10-15. Repository: https://github.com/sk07shubh/YourVision. User's usual local checkout: `/Users/shubhamsmacpro/Desktop/YourVision`.

## Non-negotiable memory-maintenance rule
- For **every** YourVision repository change, update `PROJECT_MEMORY.md` in the same working session and include the update in the same commit/PR as the code or documentation change whenever practical. This applies to every code edit, bug fix, test, refactor, UI/animation adjustment, architectural decision, branch/PR change, and test result—no exceptions for “small” changes.
- Before editing code, read this file and the project instructions; after editing, update the affected sections and append an entry to the update log with the date, branch/commit or PR, what changed, and exactly which checks were run (or explicitly state that checks were not run).
- Before finishing a task, verify that the memory-file change is included in the resulting commit/PR and that the working tree/diff is consistent. Never say the memory was updated unless the repository write succeeded.
- At the start of a future YourVision chat, open/read `PROJECT_MEMORY.md` from the live repository before acting, then refresh the live GitHub branch, PR, and CI state. If repository access is unavailable, ask for the file or state that the memory could not be refreshed; do not pretend to remember unverified current state.

## Mandatory for every future session
- Read this file first, then `AGENTS.md`, `AUTOMATION.md`, and `docs/EXTERNAL_AI_HANDOFF.md`. Check live branches, PRs, and CI because this file can become stale.
- **Update this file after every project change, even small edits**, including code, tests, decisions, branch/PR status, and verification. Make the memory update part of the same coherent commit where practical. Never claim it was updated unless the write succeeded.
- Inspect affected code/tests; memory is not a substitute for repository inspection.
- Preserve current UI and product vision. Refine, don't replace.
- User requested to finish animation priorities in coherent units and defer the broad regression pass until those priorities are complete, then run the broad suite at the end. Respect this sequence unless an urgent correctness/safety reason requires otherwise.
- Never weaken tests or claim tests/browser/CI passed unless actually verified.
- Java is implemented. C++ is future scope; don't start it unless explicitly requested.
- PR #51 is not the current animation merge target.
- Don't invent execution events, states, pointer positions, or data.

## Product vision and UI
YourVision is a Chrome Manifest V3 extension integrated into LeetCode. It visualizes the user's **actual Java execution**, not fake problem-specific animations. LeetCode's Monaco editor remains the editor; YourVision highlights the real executing line in orange.

Preserve the existing split layout: data structures/state on the left; execution/code and Play/Next/Previous controls on the right. Keep execution controls accessible while visualization content scrolls. Show actual effects at the checkpoint associated with the highlighted line; never delay effects by a step or fabricate loop phases. Learners should infer behavior from code, values, pointers, and mutations, not verbose “what happened” captions. Keep visuals readable, restrained, stable, and compatible with reduced-motion preferences. Large inputs need sensible focus/virtualization/layout, not microscopic scaling.

Explicitly rejected: detached pop-out/removal boxes or overlays (remove/pop effects should be in-place); noisy +/- labels; scope-exit deletion floods; moving array cells just because an element is accessed; synthetic/reordered loop execution; replacing the UI for a feature; treating a fake LeetCode harness as actual LeetCode validation.

## Architecture
Typical flow:
1. `extension/src/leetcode/`: LeetCode integration, source/testcase extraction and editor integration.
2. Extension MV3/service/API + session state.
3. `backend/src/server.ts`: local backend endpoint.
4. Java execution: `backend/src/execution/java/runner.ts`, `YourVisionTracer.java`, `YourVisionRuntime.java`.
5. Trace processing: `backend/src/execution/trace/enrichTrace.ts`, `semanticRoles.ts`, `stateBuilder.ts`.
6. Rendering/playback: `extension/src/components/VisualizerPanel.tsx`, `styles.css`, state/session store.

Important files:
- `extension/src/components/VisualizerPanel.tsx`, `VisualizerPanel.test.tsx`
- `extension/src/leetcode/integration.tsx`, `editor-overlay.ts`
- `extension/src/state/store.ts`, `session.ts`
- `backend/src/server.ts`
- `backend/src/execution/java/runner.ts`, `YourVisionTracer.java`, `YourVisionRuntime.java`
- `backend/src/execution/trace/enrichTrace.ts`, `semanticRoles.ts`, `stateBuilder.ts`

Trace a visible bug backwards through rendering, snapshots, enrichment, and runtime events; fix the earliest incorrect layer that can be demonstrated.

## Runtime invariants
- Displayed source line must correspond to a genuine runtime checkpoint.
- Preserve genuine repeated same-line checkpoints, especially loops.
- Show callee's actual return line before caller resumes; preserve caller locals, return values, and call stack.
- Preserve source line numbers, event order, object identity, aliases and cycles.
- Linked-list head snapshots must include every reachable node through the tail, even beyond generic object-depth limits; cover long lists and reversal.
- Pointer semantic roles must be grounded in runtime/source evidence. Array pointers `left/right/mid` remain visible while in scope; matrix `row/col` are distinct.
- Represent loop init/condition/increment truthfully, without invented phases.
- Keep trace safety limit at 5,000 events.
- Backend must bind to loopback and restrict CORS to expected extension origins. Do not call it an OS-level sandbox; timeouts and trace limits are not OS isolation.
- Java helper methods may be declared before the LeetCode entry method; runtime dispatch must select the actual entry point.
- Verify LeetCode structures including ListNode, TreeNode, HashMap, and LRUCache from actual traces.

## Animation decisions
### Arrays
- Indices below cells, pointers above cells, smooth snapshot-driven pointer transitions, no pointer arithmetic animation.
- Binary-search pointers must not disappear while variable cards remain.
- 2D arrays render as grids; coordinate pointers use row/column.
- Enhanced for-each iterator moves above the array. Coordinate labels if multiple pointers overlap and avoid overlap with multiple iterators.
- For recognized array-like out-of-bounds accesses, optionally show an aligned same-size extra cell with centered cross and no dotted outline, only when type/source confirms array-like semantics.

### Data structures
- Stable spatial identity; transitions based on adjacent actual snapshots.
- Linked lists show every node/value/link; no missing tail values or placeholders when data exists.
- Cover trees, tries, graphs, DSU, stack, queue/deque, set, lists, heap, maps, strings, matrices and nested objects.
- Don't show backing-array layouts for abstract structures unless runtime exposes physical storage.
- Keep empty-state cues in place when the final item/field is removed.
- String ranges must be valid bounded integer UTF-16 offsets.
- Maps must represent insert/update/delete/reorder correctly; don't invent order for unordered collections.
- Heap connectors track rendered nodes; indices/order come from snapshots.
- No detached removal overlays.

## State at last audit (verify live before acting)
- `main` HEAD observed: `f8bd2760ddfc65776d8b7cf41c921155b29e38ce`.
- Linked-list snapshot fix and regression work are included on main (commits `0b2cb1a`, `d2c3edd` were cherry-picked; `f8bd276` pushed).
- Open draft PR #58: https://github.com/sk07shubh/YourVision/pull/58, title “feat: complete trace-driven data-structure visualization”, branch `feat/all-remaining-ds-visualization`, head `2418b883925a1eb985fdb85593687a903e1edcff`, base main `f8bd276...`.
- PR #58 describes animation work across linked lists, trees, tries, graphs, DSU, collections, strings, objects, maps, heaps, matrices and empty-state cues. Its description reported Full Regression Lab #665 passed (extension tests 106/106, typecheck/build/backend feature matrix) and Backend Regression #1181 passed, but says manual visual review against representative LeetCode traces had not yet happened. Keep it draft until visual review. A status query returned no entries, so current CI was not independently verified.
- PR #51 is not the animation merge target.
- Separate repo `sk07shubh/YourVision-Web` is the marketing/support site, not this extension/backend project. Website glass/background/particles context must not be confused with extension UI.
- New feature branch created: `feat/synchronized-function-call-tree`, based on `main`. The specification is at `docs/FUNCTION_CALL_TREE_SPECIFICATION.md`. This is a docs-only planning milestone; no implementation has begun and no tests were run.

## Tests
From `extension/`:
```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```
From `backend/`:
```bash
npm run typecheck
npm run test:all
```
Backend `test:all` covers trace state, conditions, feature matrix, LeetCode execution corpus, enrichment, strings, semantic roles, replay, Java runtime/same-line loops/state, LeetCode nodes/structures/algorithms, readiness, server security, Java safety/exception unwind, array discovery and data structures.
Playwright E2E uses a deterministic LeetCode-shaped fixture and mocked `/visualize`; it does not prove live LeetCode behavior. Use the existing harness. Local Chrome policy/browser installation failures are environment limitations, not automatically product failures. Run `git diff --check`, inspect the diff, and leave the tree clean after a committed milestone.

## Known regression watchlist
- Linked-list chain truncation/missing final node values.
- Binary-search pointer labels missing while variables remain.
- Java entry-point resolution when helpers precede the entry method, including primitive/null overload ambiguity.
- LRU Cache visualization/eviction state in extension.
- Historical TypeScript/trace-order/loop-state/feature-matrix failures: verify live code rather than assume fixed or still present.
- User previously wanted array work complete and manually tested before merging; confirm intent before merge.
- A test fixture is not actual LeetCode testing.

## Current priorities
1. Continue animation priorities as complete coherent slices, preserve current UI and truthful execution.
2. Verify live branch/PR before modifying or merging.
3. Manually inspect representative actual LeetCode traces when possible, especially pointers, long lists/reversal, maps/collections, strings, matrices and empty states.
4. After animation work is complete, run backend and extension broad regression, typechecks, production build, E2E and inspect CI/diff.
5. For the function-call-tree project, audit runtime and trace semantics before UI work; keep the test-case section and floating controller unchanged, and preserve one synchronized timeline.
6. After every change, update this file and record exact branch/commit, changes and tests actually run.

## Update log
- 2026-10-15: Initial project memory drafted from repository tree, key code entry points, package scripts, `AUTOMATION.md`, and PR #58 metadata/description. This was a first-pass audit, not a line-by-line review of every source file or every historical chat. Read relevant code/history as future tasks require.
- 2026-10-15: Added a non-negotiable rule requiring every future project change to update this file, keep the update with the same coherent commit/PR, log actual checks, and reread live memory at the start of each future project chat. Documentation-only change; tests not run.
- 2026-10-15: PR #59 merged into `main` as `92b294a8f081a25ea9088520158979bd91d14976`; `PROJECT_MEMORY.md` is now on main. This merge contains only the memory documentation/rule; tests not run.
- 2026-10-15: Created `feat/synchronized-function-call-tree` from `main` and added `docs/FUNCTION_CALL_TREE_SPECIFICATION.md` describing generic function-call tree behavior, synchronized state/timeline, layout boundaries, interaction, trace requirements, visuals, acceptance criteria, and staged implementation. Documentation-only; tests not run. The branch/file write was verified through the GitHub connector; the full feature has not been implemented.
