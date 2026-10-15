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

## Function-call-tree initial architecture audit (2026-10-15)
- Inspected live `main` versions of `backend/src/execution/trace/schema.ts`, `stateBuilder.ts`, `enrichTrace.ts`, `backend/src/execution/java/YourVisionTracer.java`, `YourVisionRuntime.java`, and `extension/src/types/trace.ts` / `VisualizerPanel.tsx` at a first-pass level.
- Current trace schema has `METHOD_ENTER` and `METHOD_EXIT`, plus method/depth and a string `callStack`, but no explicit stable invocation ID, parent invocation ID, or typed return payload in the top-level event contract. This is a likely foundational gap for reliable selectable per-invocation history; verify actual event payload generation and runtime call/return capture before implementation.
- `stateBuilder.ts` creates timeline checkpoints for STEP, METHOD_ENTER, METHOD_EXIT, errors, timeout, and trace limit; its snapshots shallow-copy top-level state maps. Need audit nested snapshot/object-history behavior and event emission semantics before claiming entry checkpoints can be restored exactly.
- `YourVisionTracer.java` uses JDI and captures frame locals/object identities. The first implementation slice now assigns a monotonic `call-N` invocation ID on each traced method entry, records its parent invocation ID, method signature, declaring type, return type and parameter types, and attaches matching identity plus return metadata to normal method-exit events. The stack is tracked per JDI thread to distinguish recursive/repeated invocations. This is an initial runtime foundation; exceptional synthetic exits and overload/method-exit edge cases still require review and regression tests.
- Backend replay state and extension `TraceState` now expose invocation identity, signature, return metadata and an invocation status so UI work can consume these fields. The tree UI has **not** been implemented yet, and exact historical invocation selection is not complete.
- Entry-point selection in `YourVisionRuntime.java` must be audited with the existing LeetCode integration contract and regression tests before changing it. No source files were edited during this audit; no tests were run.

## Update log
- 2026-10-15: Initial project memory drafted from repository tree, key code entry points, package scripts, `AUTOMATION.md`, and PR #58 metadata/description. This was a first-pass audit, not a line-by-line review of every source file or every historical chat. Read relevant code/history as future tasks require.
- 2026-10-15: Added a non-negotiable rule requiring every future project change to update this file, keep the update with the same coherent commit/PR, log actual checks, and reread live memory at the start of each future project chat. Documentation-only change; tests not run.
- 2026-10-15: PR #59 merged into `main` as `92b294a8f081a25ea9088520158979bd91d14976`; `PROJECT_MEMORY.md` is now on main. This merge contains only the memory documentation/rule; tests not run.
- 2026-10-15: Created `feat/synchronized-function-call-tree` from `main` and added `docs/FUNCTION_CALL_TREE_SPECIFICATION.md` describing generic function-call tree behavior, synchronized state/timeline, layout boundaries, interaction, trace requirements, visuals, acceptance criteria, and staged implementation. Documentation-only; tests not run. The branch/file write was verified through the GitHub connector; the full feature has not been implemented.

- 2026-10-15: Started the runtime/data-contract slice on `feat/synchronized-function-call-tree`. Commits: `28eb25d752cc48df5c1726cff54e0aaf716c7091` (JDI invocation IDs/parent IDs/signatures and normal return metadata), `548f13e3c654943435e147d6e7c27f47e96e67bb` (replay-state invocation fields/status), `5bac9eb4d2d5b54542ca3262160d1d1e9b5f03bc` (state builder propagation), and `bbb9dab1800292350514bc22c53a4cd652464c25` (extension trace types). These writes were verified via GitHub responses. **No local compile, unit tests, or CI results have been run/verified yet.** Before UI implementation, validate Java tracer compilation and event nesting/return behavior, then add targeted replay tests.

- 2026-10-15: Follow-up fix `55a0cf856ab33d29cc62d46ed55b1c8eb7b077c4` attaches invocation identity while synthesizing exceptional frame-unwind exits and marks those outcomes exceptional. No compile/tests/CI verified yet.

- 2026-10-15: Added the first UI slice on `feat/synchronized-function-call-tree`: invocation-tree projection keyed by runtime invocation IDs, distinct recursive/repeated-call nodes, parent-child branches, actual return/void/exception status, entry-checkpoint selection, a collapsible sidebar that reflows the variables/data-structure workspace, independent tree scrolling/resizing, reduced-motion handling, and two focused extension tests. Relevant commits include `5d271f095d6696dff63844d991606c30e179702d`, `fcffa61d5143fff6a03077984d160473b306d9af`, `62ad76c0d1b8d445e51de17813844f607ea6433d`, and `2bf1d3d10c082470636f636e4da6cc3785abfa7b`. Follow-up JDI type-metadata guard: `293394724f1d03fa2245470ff25e46179f747331`. This is an initial implementation slice, not a verified release: no local test runner was available in this session and the branch has no GitHub Actions runs yet. Compile/typecheck and targeted runtime/replay tests remain required; exact full-frame history restoration and root-class derivation still need follow-up.

- 2026-10-15: Refined invocation-tree labels to derive the class root from runtime `declaringType` metadata and include return type in displayed method signatures (commit `29c00d3371cfc96d71766c518374cf235546bebd`). Still awaiting compiler, unit, and runtime verification.

- 2026-10-15: Fixed replay deduplication to include invocation identity/signature/return outcome in visible-state equality and clear stale parent/return metadata on a new method entry (`02f4d4fabebf9d062fe152cd387305aa88179893`). This specifically prevents identical recursive/repeated sibling invocations from losing their entry checkpoint. Draft PR #60 is open at https://github.com/sk07shubh/YourVision/pull/60. GitHub reported three checks queued on head `ba2696dbcdc3e66122535fab10609c257b5039aa`; the latest follow-up commit is newer, so check status must be refreshed. No check has been claimed green yet.

- 2026-10-15: First PR CI run exposed backend TS2375 under `exactOptionalPropertyTypes`: replay intentionally clears optional invocation metadata with `undefined`. Updated backend and extension trace contracts to permit explicit undefined for the new optional fields (commits `185c4281986834fff78891aefcdded5ac42baa63`, `61d92080c83b8ee89424dc3b312409781dd8e3fe`). This is a CI-driven correction; rerun status must be checked on the newest PR head. The earlier run failed at typecheck before executing backend tests.

- 2026-10-15: Added backend trace-state regression coverage for identical repeated method invocations, entry identity preservation, typed return values/status, and clearing the previous return value on the next invocation (commit `b3cfe78f38f4bf683680715239db0bbd667534f8`). CI results for the newer head remain pending at this point.

- 2026-10-15: Replaced imperative DOM-only sidebar toggling with React state so `aria-expanded` and the workspace reflow remain synchronized across playback rerenders (`cf97c36735b2c6a09422d901dcba223672457746`).

- 2026-10-15: Corrected the tree projection to consume only checkpoints up to the selected playback index, preventing future invocations/returns from leaking into a historical Prev state (`9e1259384d628ce11b6073c87239a77313dfe059`). Newest head requires fresh CI status; earlier extension matrix passed on the preceding code head, while backend regression was still running at last poll.

- 2026-10-15: Extended the focused UI tests to assert that a tree projection at an earlier timeline prefix does not contain a future recursive child and leaves the parent in progress (`49034588b897d88c495e1b2c77540ed111aa6ff3`). CI is queued for the newer head.

- 2026-10-15: Corrected caller/callee selection across returns: the METHOD_EXIT checkpoint remains associated with the returning callee, while the next caller-resume STEP restores the caller invocation ID, parent ancestry, signature, declaring type, return type, and active status. The Java tracer now includes caller ancestry/type metadata in exit events (commits `60e712194a63288dda7ff7fb0dd5facc203cbdb4`, `a2f58c9a3713210a049775410238d505f4c27ad3`, `7f692dafe40cdd1134f052c94be5e591ab695b2b`, `387edeead542f9afa6cdfd7c4cbaf44444e2ac2f`, `f6490c6ff6d50d2b5c91b120a16cbc3ba2b4b0b6`). This was added after reasoning through return-step synchronization; CI must verify it.

- 2026-10-15: Detailed function-tree refinement pass on PR #60. Every Java `STEP` now carries the active invocation ID/parent/signature/type, so the UI can maintain isolated frame-local snapshots during recursion (commit `8e66088c6710a0515ebda03f7dc36c3a9833a99a`). Tree nodes now show up to four current parameters/locals and overflow count; added isolation coverage (`916e1ce83132d6fe19040f8bf4fc8b25f6904a0a`, test cleanup `c0c2c4c87041a5c9888b8780295c952936cad0d0`) and styling (`41d58d689a87ee78d7c4989682cc31eddaeee08f`). Added root class static-field snapshots from JDI (`d732f55c4f480d12d73a79a1a012c6a3007d7a89`) and tree-root rendering (`be3e75870349315ad2e731fa1f6cf0fc261fa997`). Distinguished a non-void `null` return from `void` (`60cfcd14bc2feca467ed330b97fcb5c01b46bd5f`, `713913cc24b4eaf34cab2939b878fbece3761d09`, `ef47f43858965ff25d19da59d7a6541d5a8296ef`). Fixed caller ancestry restoration (`fa30cf83b648f1a7b2d18c91ede89ec6848d4a6f`) and hide the visual workspace at completion while preserving testcase output (`a35f2f09c96460f07237b92e90358b9b8f55626e`). Added an accessible width slider for the tree (`71fdedd18d25c0a65e544ff9c1328361d1762932`, `84f064f8174f8a138550513b17a93b5eb7ed31d9`). CI has been repeatedly triggered; results for the newest head must be checked before considering the slice stable. Browser/live-LeetCode behavior and true caller frame restoration remain verification requirements.

- 2026-10-15: Follow-up edge-case pass: invocation exits now carry `hasReturnValue` so reference-returning methods that return Java `null` are represented as `null`, not `void` (`60cfcd14bc2feca467ed330b97fcb5c01b46bd5f`, `713913cc24b4eaf34cab2939b878fbece3761d09`, `ef47f43858965ff25d19da59d7a6541d5a8296ef`); added explicit UI coverage (`3c7aac38606019654edf9f9a1f31a50ed53e24a4`). Simplified exit status classification (`15af80404a1f29bb7e8d8f30f6bd21928c56a104`). The tree width is now adjustable with an accessible range control rather than relying on a CSS resize handle. Latest CI is still running; no green claim yet.

- 2026-10-15: Responsive-layout correction for the tree width slider: the tree now fills its sidebar container with a controlled max width, the legacy CSS resize handle is disabled, and mobile styling can expand the tree to full width without the inline width clipping it (`593899e101de2fb184ac97a08ad79a1fa15ee6ff`, `cf198b26bdae7afee184b56329cb0ee4db52af9f`).

- 2026-10-15: Signature fallback now uses JVM descriptor text when JDI parameter type names are unavailable, instead of falsely rendering a zero-argument method signature (`6cdaccccf3939d3c19281e2dca8f150cc3ccb947`).

- 2026-10-15: Added assertions for runtime-derived class root and root static-field snapshot projection in the invocation-tree test suite (`ee8aaf8dcec98757f55696e51c1e687e45d96d24`).

- 2026-10-15: Updated draft PR #60 description to reflect the expanded invocation tree scope, null/void semantics, per-frame snapshots, root fields, responsive sizing, and the explicit remaining verification checklist. PR remains open/draft; current head `7697b3ca8837a1f871ce5d8d8a74eb12f81c90e5`. Backend Regression and Full Regression Lab are both running on that head, with no conclusion available yet.

- 2026-10-15: Added a backend trace-state regression fixture for parent → child → child return → caller resume. It asserts the return checkpoint stays on the child, the next checkpoint restores the parent invocation/signature/active status, child return metadata and locals do not leak, and caller locals are independently restored (`a606dc4e772c7b155b77f995265091a30154b938`). CI must validate this new fixture on the resulting head.

- 2026-10-15: Backend Regression and both Full Regression Lab matrices completed successfully on the prior head `86f40e7bb5ce7f825a8130d1d1cf6961c4133f71` (including extension tests, extension typecheck/build, and complete backend regression matrix). Added a deeper three-level invocation regression (`solve → search → matches → search resumes → solve resumes`) asserting each return restores its immediate caller's invocation identity, ancestry, signature, active status, and isolated locals (test commit `88f630cda7db648a7e2c667d58bbc5f5eebba27f`). The new test has not yet been run by CI; verify the resulting head before relying on it. Live LeetCode/browser verification remains outstanding; PR #60 stays draft.

- 2026-10-15: User pushed a real Subsets recursion screenshot to `debug-artifacts/subsets-recursion/Screenshot 2026-10-15 at 8.09.17 PM.png`. Follow-up UI fix commit `6115bb993190e60281195541dbb91e2ecf255663` bounds the function-tree workspace and recursive branches, constrains the tree to a viewport-sized height, removes the legacy manual resize behavior, and stacks the tree below the state workspace at widths up to 900px to avoid off-screen horizontal overflow in Chrome extension panels. CSS-only change. No local browser test or CI result verified yet; must check CI and retest the same Subsets trace in the actual extension before considering fixed.

- 2026-10-15: Inspected the user's copied live DOM/text for the Subsets recursion tree. The frame-local renderer was printing raw serialized array/collection/object snapshots with `displayValue`, making long `$arrayId`/`$collectionId` JSON dominate the sidebar width. Updated `InvocationTree` frame locals to render through the existing `variableSummary` formatter and preserve the full raw representation in the value element's `title` for inspection (commit `235c0e9452703789c7eea57178a8152c7b86b9c8`). The captured six-call tree is a historical prefix at the selected playback step, not proof that only six calls happen in the complete run; projection intentionally uses `states.slice(0, currentIndex + 1)`. Current CI on the prior head `ad40d6615ba5b9b7c43349ac011d9c6f0ff15818` passed both Full Regression Lab and Backend Regression, but the new UI commit has not yet been validated by CI. Live extension/browser retest remains outstanding.

- 2026-10-15: User reported the function-tree panel was no longer vertically expandable. Root cause confirmed in `styles.css`: the viewport-containment override explicitly set `.yv-function-tree { resize: none; }`, overriding the original horizontal resize behavior and preventing manual vertical resizing. Restored `resize: vertical`, set a useful minimum height, expanded the viewport-relative max-height, and applied the same vertical-resize behavior to narrow/mobile layouts (commit `0e4e92145cb5f52afe0d377356102701e87ea24b`). CSS-only change; no tests run yet. Verify the actual extension panel can be dragged vertically and that inner tree scrolling remains independent.

- 2026-10-15: Corrected the function-call tree to follow the required two-part invocation box instead of displaying a “Frame locals” section. The upper partition shows the method signature and entry-time parameter values; parameter values are captured separately from the evolving frame snapshot so later locals do not leak into the parameter partition. The lower partition shows the invocation outcome (in progress, actual typed return value, `void`, or exception); the class root remains the no-return-partition exception. Added partition separators/styles and removed obsolete frame-local UI styles. Commits: `1e9f7836a7c11377fddeab7e31dabbe5eaebae76`, `664ae45b42690b564bacf7bf31e78ba205d71a5b`, `3c18cc75e000c3661dc8cca5d31fa7a91e256a36`. GitHub content writes succeeded; tests/typecheck/CI and browser rendering have not yet been verified.
