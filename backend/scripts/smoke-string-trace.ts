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
    "  String suffix = s.substring(3, s.length());",
    "  String upper = s.toUpperCase();",
    '  String replaced = s.replace("a", "o");',
    '  String compact = s.replaceAll("a", "");',
    '  String padded = "  hi  "; ',
    "  String trimmed = padded.trim();",
    '  String joined = s.concat("x");',
    "  String combined = s + c;",
    '  String appended = "a";',
    '  appended += "b";',
    "  boolean found = s.contains(\"ana\");",
    "  int foundAt = s.indexOf(\"na\");",
    "  int length = s.length();",
    "  boolean empty = s.isEmpty();",
    "  boolean blank = s.isBlank();",
    "  int comparison = s.compareTo(\"banana\");",
    "  StringBuilder builder = new StringBuilder(\"abc\");",
    "  builder.reverse();",
    "  builder.deleteCharAt(1);",
    "  builder.insert(1, 'b');",
    '  builder.replace(0, 1, "z");',
    "  builder.append('d');",
    "  builder.setCharAt(0, 'x');",
    "  builder.delete(1, 2);",
    "  return part + c + upper;",
    " }",
    "}"
].join("\n");

const result = await runJava(source, { method: "probe", arguments: [] });
assert(result.success && result.result === JSON.stringify("ananBANANA"), "Java string fixture failed: " + result.kind + " result=" + JSON.stringify(result.result) + " message=" + (result.message ?? ""));
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
assert(results.some(event => event.data?.resultName === "suffix" && event.data.after === "ana"), "substring with nested length() result missing");
assert(effects.some(event => event.type === "STRING_RANGE_ACCESS" && event.data?.start === 3 && event.data.end === 6), "substring with nested length() range missing");
assert(results.some(event => event.data?.resultName === "upper" && event.data.after === "BANANA"), "case-conversion result missing");
assert(results.some(event => event.data?.resultName === "replaced" && event.data.after === "bonono" && event.data.operation === "replace"), "replace result missing");
assert(results.some(event => event.data?.resultName === "compact" && event.data.after === "bnn" && event.data.operation === "replaceAll"), "replaceAll result missing");
assert(results.some(event => event.data?.resultName === "trimmed" && event.data.after === "hi" && event.data.operation === "trim"), "trim result missing");
assert(results.some(event => event.data?.resultName === "joined" && event.data.after === "bananax" && event.data.operation === "concat"), "concat result missing");
assert(results.some(event => event.data?.resultName === "combined" && event.data.after === "bananan" && event.data.operation === "concatenate"), "string plus result missing");
assert(results.some(event => event.data?.resultName === "appended" && event.data.after === "ab" && event.data.operation === "concatenate"), "compound string concatenation result missing");
const search = effects.find(event => event.type === "STRING_SEARCH_RESULT" && event.data?.operation === "contains");
assert(search?.data?.matched === true && search.data.query === "ana", "contains must expose the confirmed match");
assert(effects.some(event => event.type === "STRING_SEARCH_RESULT" && event.data?.operation === "length" && event.data.result === 6), "length must emit metadata without a character access");
assert(effects.some(event => event.type === "STRING_SEARCH_RESULT" && event.data?.operation === "isBlank" && event.data.result === false), "isBlank must emit its boolean result");
assert(effects.some(event => event.type === "STRING_SEARCH_RESULT" && event.data?.operation === "compareTo" && event.data.result === 0), "compareTo must emit its comparison result");
const mutation = effects.find(event => event.type === "STRING_MUTATION" && event.data?.name === "builder");
assert(mutation?.data?.operation === "reverse" && mutation.data.before === "abc" && mutation.data.after === "cba",
    "StringBuilder reverse must expose its real before/after snapshot: " + JSON.stringify(mutation?.data));
const deletion = effects.find(event => event.type === "STRING_MUTATION" && event.data?.operation === "deleteCharAt");
assert(deletion?.data?.index === 1 && deletion.data.removed === "b" && deletion.data.after === "ca", "deleteCharAt must expose the removed character and index");
const insertion = effects.find(event => event.type === "STRING_MUTATION" && event.data?.operation === "insert");
assert(insertion?.data?.index === 1 && insertion.data.inserted === "b" && insertion.data.after === "cba", "insert must expose the inserted range and index");
const replacement = effects.find(event => event.type === "STRING_MUTATION" && event.data?.operation === "replace");
assert(replacement?.data?.index === 0 && replacement.data.removed === "c" && replacement.data.inserted === "z", "replace must expose both changed ranges");
const append = effects.find(event => event.type === "STRING_MUTATION" && event.data?.operation === "append");
assert(append?.data?.index === 3 && append.data.inserted === "d", "append must expose newly appended characters");
const setChar = effects.find(event => event.type === "STRING_MUTATION" && event.data?.operation === "setCharAt");
assert(setChar?.data?.index === 0 && setChar.data.removed === "z" && setChar.data.inserted === "x", "setCharAt must expose the replaced character");
const deleteRange = effects.find(event => event.type === "STRING_MUTATION" && event.data?.operation === "delete");
assert(deleteRange?.data?.index === 1 && deleteRange.data.removed === "b", "delete must expose the removed range");

console.log("PASS: real Java string access, ranges, and derived results");
