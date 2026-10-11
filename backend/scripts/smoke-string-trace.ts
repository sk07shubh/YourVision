import { runJava } from "../src/execution/java/runner.js";

function assert(ok: boolean, message: string): asserts ok {
    if (!ok) throw new Error(message);
}

const source = [
    "class Solution {",
    " public String probe() {",
    '  String s = "banana";',
    "  int i = 2;",
    "  char c = s.charAt(i);",
    "  String part = s.substring(1, 4);",
    "  String upper = s.toUpperCase();",
    "  return part + c + upper;",
    " }",
    "}"
].join("\n");

const result = await runJava(source, { method: "probe", arguments: [] });
assert(result.success && result.result === "ananBANANA", "Java string fixture failed: " + result.kind);
const steps = result.trace?.events.filter(event => event.type === "STEP") ?? [];
const effects = steps.flatMap(step => Array.isArray(step.data?.executionEvents) ? step.data.executionEvents : []);
const access = effects.find(event => event.type === "STRING_ACCESS");
assert(Boolean(access), "charAt must emit STRING_ACCESS");
const accessData = access?.data ?? {};
assert(accessData.name === "s" && accessData.index === 2 && accessData.value === "n", "incorrect charAt event: " + JSON.stringify(accessData));
const range = effects.find(event => event.type === "STRING_RANGE_ACCESS");
assert(Boolean(range), "substring must emit STRING_RANGE_ACCESS");
assert(range?.data?.start === 1 && range.data.end === 4, "substring range must be [1,4)");
const results = effects.filter(event => event.type === "STRING_RESULT");
assert(results.some(event => event.data?.resultName === "part" && event.data.after === "ana"), "substring result missing");
assert(results.some(event => event.data?.resultName === "upper" && event.data.after === "BANANA"), "case-conversion result missing");
console.log("PASS: real Java string access, ranges, and derived results");
