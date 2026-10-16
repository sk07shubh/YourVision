# YourVision — Synchronized Function-Call Tree & Execution Workspace

**Status:** Proposed feature specification; implementation and verification are not yet complete.  
**Scope:** Generic function invocation history, recursion, frame-scoped state, timeline navigation, and synchronized workspace layout.

## 1. Product goal

Replace the standalone flat Call Stack section with an interactive, runtime-driven function-call tree. Learners should see **which invocation called which other invocation** while the existing variables and data-structure visualizations show **what that exact invocation is doing**.

The tree, source highlight, variables, data structures, return values, and execution controller must always refer to one canonical historical execution checkpoint. This is a general execution feature, not a Word Search-specific visualization.

## 2. Explicit layout boundaries

Keep these parts unchanged:
- The complete test-case section and its DOM/layout boundary. It remains at the top and does not participate in the slide/reflow animation.
- The floating execution controller/window, including Restart, Prev, Play, Next, executed-line display, and execution-result display.
- Existing variable-row styling, data-structure cards/animations, orange source-line highlight, and output flow.

Remove only the old standalone **Call Stack** section. Its invocation-hierarchy role moves to the tree.

### Default / collapsed workspace
- Preserve the current YourVision dark LeetCode visual language.
- Tree panel starts collapsed.
- Existing variables and data-structure panels stay in their familiar position and retain their behavior.
- Provide an obvious, keyboard-accessible toggle for opening the tree.

### Expanded workspace
- The tree opens by sliding in from the left of the visualization workspace.
- The existing variables/data-structure workspace shifts right with it; do not overlay or hide that workspace.
- The test-case section and floating execution controller stay outside this reflow.
- Both tree mutations and state/data-structure mutations remain visible at the same time.
- Opening/closing the panel must not reset, skip, or advance execution.

### Sizing and navigation
- Tree width is adjustable with sensible minimum/maximum limits.
- Tree viewport has independent horizontal and vertical scrolling; deep recursion and broad branching must remain navigable.
- Keep the selected/current node visible when useful, but do not auto-scroll aggressively on every trace event.
- Prevent overlapping nodes, connectors, labels, and state panels. On narrow viewports, use a controlled responsive layout or explicit constraints rather than silent overlap.
- Respect reduced-motion preferences. Motion should communicate reflow and state transitions, not become decorative noise.

## 3. Tree structure and node design

### Root: solution class
- Start with the actual LeetCode solution class (usually `Solution`), identified from the runtime/program model.
- The class node has no return-value partition because a class is not a function invocation.
- Its context can expose applicable class-level state in the existing variables/data-structures UI. Respect Java static-field versus instance-field semantics and actual object lifetime.
- Do not invent a constructor or claim class initialization happened unless the runtime confirms it.

### Function invocation node
Each actual invocation is a distinct node with two partitions:
1. **Identity partition:** actual method name and signature, including declared parameter types where available, e.g. `int binarySearch(int[] nums, int target)`.
2. **Outcome partition:** initially pending/in-progress; after the observed return, show the actual returned value and actual type. A `void` method gets an explicit `void` completion state. Distinguish `null` from pending/missing. If the runtime captures exceptional exits, distinguish those from normal returns.

Method identity must distinguish overloads and repeated/recursive invocations, even if the same method is called with identical arguments. A pending node must never display a guessed return value. State should not depend on color alone; use labels/icons/shape as well.

### Invocation lifecycle
Conceptual states are:
- **Entered:** invocation exists and entry parameters are known.
- **Active:** execution is currently inside this invocation.
- **Suspended:** it called a child and is waiting.
- **Returned:** a real return event and outcome are known.
- **Exceptional:** captured abnormal exit, if supported.
- **Not reached / future:** calls that have not happened at the selected historical point must not appear as executed.

State is computed from actual trace events and the selected timeline position. Source scanning may help resolve method metadata, but must not fabricate calls or call order.

## 4. Entry point and root context

The runtime must invoke the method designated by the LeetCode integration contract, not simply the first method declared in source order. Users may define helper methods above the question-provided method. The entry method must still be selected correctly.

Before entry, show applicable class-level/static/instance state only when supported by actual runtime semantics. Do not display unrelated method locals at the class root. The class root is context for the designated question method, not a reason to visualize every declared method.

Audit existing entry-point selection before changing it. Test helpers-before-entry ordering, overloads, and primitive-parameter methods to ensure an unrelated helper is never called with fabricated or incompatible arguments.

## 5. Function entry and frame-scoped visualization

When an invocation begins, create a fresh view for that frame:
- Show the parameters actually passed, with types where available.
- Show applicable class-level state according to language semantics.
- Preserve references, object identity, aliases, and shared mutable objects.
- Do not show the caller's local variables as if they belong to the callee.
- Do not leak stale locals from the previously selected frame.
- Do not pre-populate locals merely because their declarations are visible in source; locals appear when runtime execution initializes them.

At the entry checkpoint, highlight the actual first executable line using runtime/source mapping. If the trace does not have an executed-line event yet, represent the entry state honestly rather than inventing one.

As the function executes, use the existing variable and data-structure UI and animations. A child that receives an array/object must show the same object identity and current contents as the caller, not a copied fictional object. Changes to shared objects remain visible to every frame that references them when that historical state is selected.

## 6. Calls, recursion, and returns

- Create a child node only when an actual function call is observed.
- Support recursive calls and ordinary helper calls identically.
- Do not open nodes for helper methods merely because they are declared in the class.
- A child stays nested beneath the actual caller. Multiple calls to the same helper create distinct invocation nodes.
- Short-circuit expressions create nodes only for calls that truly execute.
- On return, update the active invocation's outcome partition from the actual return event and type.
- When the child returns, restore the parent at the real post-call/resumption checkpoint, with the parent's locals and data structures accurate to that time.
- For a void method, record completion without inventing a return value.
- Preserve early returns, nested returns, exceptions when captured, and parent resumption.
- When the designated entry method finishes, retain the actual final answer in the existing testcase/output flow. Do not fabricate an answer if execution fails or the trace is incomplete.

## 7. Tree interaction and historical navigation

- Tree begins collapsed and has an accessible expand/collapse control.
- Nodes are clickable and keyboard-operable.
- Selecting a node jumps to that invocation's exact **entry checkpoint**, as if the user had stepped backward/forward to that moment.
- On selection, synchronize source highlight, variables, data structures, shared-object contents, executed-line/result display, active/suspended/returned node states, and playback cursor.
- A selected returned node still navigates to its entry checkpoint by default; any separate return-checkpoint action must be clearly distinguished if later added.
- Play and Next continue from the selected timeline position. Prev moves backward through the same canonical history. Navigation across call/return boundaries must not duplicate nodes or corrupt snapshots.
- After stepping backward, future-only calls/returns must no longer appear completed. As execution advances again, events replay deterministically.
- Keep the selected node visible when practical, without surprising jumps in the user's tree viewport.

The tree is not a second independent timeline. Every visible element must be derived from the same trace history or from a deterministic projection of it.

## 8. Snapshot, trace, and runtime requirements

Before UI work, audit whether the trace model already records enough metadata. At minimum, reliable navigation needs:
- Stable invocation/frame ID for every call.
- Parent invocation ID (or equivalent trustworthy call relationship).
- Method identity/signature and passed parameter values.
- Entry checkpoint and source mapping.
- Actual return/exit event, return type/value, and caller-resumption location.
- Correct event order, including repeated events on one source line.
- Object identity/reference graph sufficient to preserve aliases, cycles, and shared mutations.
- Snapshot/history semantics that can restore every visible section at a selected time.

If metadata is missing, extend the generic runtime/trace contract and add backend regression tests before relying on frontend inference. Do not guess call nesting from indentation, function names, or line adjacency. Trace cap, timeout, missing metadata, or incomplete execution must be represented as incomplete/failure rather than success.

## 9. Visual direction

Blend into the existing dark LeetCode/YourVision palette:
- Preserve existing backgrounds, borders, spacing, typography, subdued separators, and orange execution highlight.
- Use restrained surface contrast to distinguish root class, active call, suspended ancestors, returned calls, and pending calls without turning the tree into a colorful unrelated UI.
- Function identity is the primary label; signature remains legible at realistic widths.
- Return partition is compact, readable, and type-aware. Long values should be safely truncated with a way to inspect details, not force the whole tree wider.
- Connectors should clearly express parent/child relationships and remain attached during expansion, scrolling, and layout changes.
- Avoid heavy shadows, neon gradients, excessive badges, large decorative icons, or animated branches that distract from code/state.
- Use subtle, short transitions for panel reflow, node entry, and outcome updates. Avoid layout thrash on deep recursion.
- Ensure focus indicators, sufficient contrast, accessible names, keyboard navigation, and reduced-motion support.

Exact colors and tokens should be taken from the current codebase during implementation, not guessed from this written spec.

## 10. Edge cases

Plan for:
- Deep recursion and wide branching; trace/event caps.
- Repeated identical arguments and recursive calls to the same method.
- Overloaded methods and helper-before-entry source ordering.
- Early returns, multiple return paths, void methods, null, arrays/objects returned.
- Shared mutable arrays/objects, aliases, cycles, and mutations later restored by backtracking.
- Short-circuit expressions where later calls never execute.
- Exceptions/abnormal exits where captured.
- Selecting an old invocation after the program has advanced or completed.
- Prev/Next through entry, child call, child return, and parent resume.
- Incomplete source mapping, missing trace metadata, and unsupported constructs.
- Small screens, very wide trees, long signatures, and huge return values.

When the runtime cannot establish a relationship reliably, do not silently invent one. Communicate a degraded/incomplete state or record the limitation for a targeted fix.

## 11. Acceptance criteria

### Runtime/trace
- [ ] The designated LeetCode entry method is selected regardless of helper declaration order.
- [ ] Only actually executed calls create invocation nodes.
- [ ] Every invocation has stable identity and correct parent-child ordering.
- [ ] Parameters, return values/types, void completion, and caller resumption are real.
- [ ] Shared object identity and mutations remain correct.
- [ ] Original source lines, same-line events, and short-circuit order are preserved.
- [ ] Trace truncation/timeouts are not presented as successful complete execution.

### State/history
- [ ] Child entry contains parameters and applicable class state, but no leaked caller locals.
- [ ] Locals appear when initialized by runtime execution.
- [ ] Selecting any node restores its exact entry checkpoint across all state panels.
- [ ] Prev/Next and Play stay synchronized with tree, source highlight, variables, and structures.
- [ ] Historical navigation neither duplicates nodes nor leaks future state.
- [ ] Final output remains in the unchanged testcase/output UI.

### Layout/accessibility
- [ ] Testcase section is untouched and excluded from reflow.
- [ ] Floating execution controller is untouched and excluded from reflow.
- [ ] Old standalone Call Stack section is removed.
- [ ] Tree starts collapsed; opening it shifts the existing state workspace right without overlap.
- [ ] Tree is resizable, independently scrollable, and responsive.
- [ ] Existing variable/data-structure visuals and animations are preserved.
- [ ] Keyboard interaction, visible focus, contrast, and reduced-motion preferences are supported.

### Generality/testing
- [ ] Works for recursion and non-recursive helpers, including void and early-return paths.
- [ ] Does not display uncalled helper declarations as calls.
- [ ] Backend tests verify invocation IDs, parent links, entry/return snapshots, object identity, and replay.
- [ ] Extension tests verify selection/navigation and synchronized layout behavior.
- [ ] Live LeetCode testing is performed separately from mock/fixture tests.
- [ ] `PROJECT_MEMORY.md` records each code/doc change and actual verification.

## 12. Validation sequence

Use distinct cases so a failure can be localized:
1. A simple entry method calling one helper and returning its result.
2. A helper declared before the entry method.
3. A void helper that mutates shared state.
4. Early return from multiple branches.
5. Recursion with repeated arguments and multiple branches.
6. A child mutating an array/object that the caller also references.
7. A short-circuit expression with a later call that should not run.
8. Prev/Next across entry, child entry, child return, and caller resume.
9. LeetCode 79 — Word Search — as a stress test for 2D-array mutation, recursion, bounds checks, short-circuiting, and backtracking.
10. Deep/wide tree to exercise scrolling, resizing, stable node placement, and trace-limit handling.

Mocks can test deterministic UI behavior but do not prove live LeetCode integration. Test the real extension on LeetCode before calling the feature complete.

## 13. Implementation plan

1. **Audit:** read current runtime entry selection, Java tracing, trace schema, state builder, source mapping, session/timeline, and current VisualizerPanel layout. Record which requirements already exist.
2. **Trace foundation:** add/repair generic invocation IDs, parent relationships, entry/return events, return types/values, and exact caller resumption. Add backend tests first.
3. **Historical frame snapshots:** make invocation entry selectable and reconstruct every state panel at that timeline position. Verify shared references and backward/forward replay.
4. **Tree component:** implement root and invocation cards, connectors, lifecycle states, expansion, accessibility, and independent scroll/resize.
5. **Workspace reflow:** integrate tree with existing layout and current colors/tokens. Exclude testcase and floating controller from movement. Remove old Call Stack section only when tree data is trustworthy.
6. **Verification:** run focused tests, relevant backend and extension suites, typecheck/build/E2E, inspect CI for the exact commit, and manually test live LeetCode. Update project memory with real results.

## 14. Prohibited shortcuts

Do not add Word Search-specific logic; infer calls from source layout; display uncalled methods; leak caller locals into a child; show return values before actual returns; restore variables while leaving later data-structure state visible; create a tree timeline separate from the playback cursor; replace the existing visualizer; change testcase/controller layout as part of this redesign; weaken tests; or claim tests/manual validation passed unless they actually did.

## 15. Summary

The workspace has three synchronized layers: (1) the unchanged testcase area, (2) an expandable function-call tree, and (3) the existing execution-state visualizer that shifts right when the tree opens. Clicking a node is a deterministic jump to its invocation-entry checkpoint. The tree, source highlight, variables, data structures, mutations, and return values must agree at every point in history.

This is a proposal, not evidence that the feature has been implemented.
