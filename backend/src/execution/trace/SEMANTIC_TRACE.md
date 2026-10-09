# Semantic trace layer

## Pipeline

`runJava` remains the authority for Java execution. The existing trace is enriched first, then `prepareSemanticTrace` attaches semantic metadata to `STEP.data.visualization`, and only then does the runner build the replay states:

1. Compile and execute the submitted Java source using the existing JDI runner.
2. Parse the runner's actual runtime events.
3. Enrich checkpoints with source-aligned runtime reads, writes, and mutations.
4. Run the semantic analyzer once for the whole execution trace (not once per step).
5. Validate the proposal against the source and trace. If it fails or throws, use the deterministic local fallback.
6. Build the states consumed by the existing visualizer.

The optional `SemanticTraceAnalyzer` injection point is deliberately provider-neutral. No API client, credentials, or network call is configured.

## Trust boundaries

The analyzer proposes meaning; it does not execute code and cannot become the source of truth for runtime values.

- Every actual `STEP` must have exactly one annotation, and non-STEP events are not annotated.
- Variable-role names must exist in that step's variable snapshot.
- An `array-index` role must match a direct array/index-variable pair present on the highlighted source line. Its `structureName` is required so a pointer cannot bleed across arrays.
- Visualization targets must exactly match the targets derived from the nested runtime events, including concrete indices, keys, paths, and map change kinds.
- `conditionResult` is copied only from the actual trace.
- A proposed loop phase is accepted only if it matches explicit runtime metadata or can be supported by the source line and corresponding runtime events.
- Animation intents are descriptive plans only. Each must reference an existing target and its action must match that target's runtime event. They do not start or modify animations.
- Malformed output, incomplete annotations, unsupported targets, or provider errors are rejected in favor of the local fallback.

## Metadata consumers

The current extension uses validated, structure-specific array-index roles for pointer labels. When semantic metadata has no applicable role, the safe source fallback remains available. The fallback intentionally avoids labeling `nums[i + 1]` as though the pointer were at `i`; it only emits a variable label when the index expression is the variable itself.

The new `animationIntents` field records future renderer intent (for example, an array read highlight, an array write highlight, a map insert/update/delete, object creation, or a pointer move). This work does **not** implement or change the animation engine.

## Future AI adapter requirements

When an AI provider is connected later, it should receive the source and the enriched trace in one request per execution/code version, subject to explicit context budgeting. It must return the proposal contract in `semanticTracePrompt.ts`. Provider credentials must remain server-side. Provider output must always pass the deterministic validator; the local fallback must continue to work with no provider configured.

## Regression coverage

- `npm run test:semantic-trace`: schema/prompt contract, multi-array scoping, loop phases, animation intent grounding, valid provider acceptance, malicious proposal rejection, and outage fallback.
- `npm run test:semantic-java-e2e`: binary search and two sum through the real Java runner, checking actual results, semantic metadata, runtime-grounded read targets, and pointer intents.
- `npm run test:all`: runs these checks alongside the existing backend regressions.
