import type { JavaMethod } from '../types/leetcode';

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

function splitParams(text: string): Array<{ type: string; name: string }> {
  if (!text.trim()) return [];
  const parts: string[] = [];
  let angle = 0;
  let square = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '<') angle++;
    else if (ch === '>') angle = Math.max(0, angle - 1);
    else if (ch === '[') square++;
    else if (ch === ']') square = Math.max(0, square - 1);
    else if (ch === ',' && angle === 0 && square === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((raw, index) => {
    const clean = raw.trim()
      .replace(/\bfinal\s+/g, '')
      .replace(/@[\w.]+(?:\([^)]*\))?\s*/g, '');
    const match = clean.match(/^(.*?)\s+(\w+)$/);
    return match
      ? { type: match[1].trim(), name: match[2].trim() }
      : { type: clean, name: 'arg' + index };
  });
}

export function inferJavaMethods(source: string): JavaMethod[] {
  const code = stripComments(source);
  const rx = /(?:public|private|protected|static|final|synchronized|native|abstract|strictfp|default)\s+|(?:)/g;
  // Method declarations are parsed separately from call expressions so helper calls
  // cannot be mistaken for declarations.
  const declaration = /(?:(?:public|private|protected|static|final|synchronized|native|abstract|strictfp|default)\s+)*([\w$<>\[\].?,\s]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{/g;
  const methods: JavaMethod[] = [];
  for (const match of code.matchAll(declaration)) {
    const name = match[2];
    if (!name || ['if', 'for', 'while', 'switch', 'catch', 'new', 'synchronized'].includes(name)) continue;
    const params = splitParams(match[3] ?? '');
    methods.push({
      name,
      parameterTypes: params.map(param => param.type),
      parameterNames: params.map(param => param.name),
    });
  }
  return methods;
}

/** Best-effort only; use matchEntryMethod for actual LeetCode integrations. */
export function inferMethod(source: string): JavaMethod {
  const methods = inferJavaMethods(source).filter(method => method.name !== 'main');
  if (!methods.length) throw new Error('Could not find a Java solution method.');
  const code = stripComments(source);
  const publicNames = new Set<string>();
  const publicMethodRx = /\bpublic\s+(?:(?:static|final|synchronized|native|abstract|strictfp)\s+)*[\w$<>\[\].?,\s]+?\s+(\w+)\s*\(/g;
  for (const match of code.matchAll(publicMethodRx)) {
    if (match[1] && match[1] !== 'main') publicNames.add(match[1]);
  }
  const candidates = methods.filter(method => publicNames.has(method.name));
  const pool = candidates.length ? candidates : methods;
  const uncalled = pool.filter(method => {
    const escaped = method.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const callRx = new RegExp('\\b' + escaped + '\\s*\\(', 'g');
    return [...code.matchAll(callRx)].length <= 1;
  });
  if (uncalled.length === 1) return uncalled[0];
  if (pool.length === 1) return pool[0];
  throw new Error('Could not uniquely identify the Java entry method. Use the original LeetCode starter signature.');
}

export function orderArguments(inputs: Record<string, string>, method: JavaMethod): string[] {
  const values = Object.values(inputs);
  return method.parameterNames.map((name, index) => inputs[name] ?? values[index] ?? 'null');
}

export function matchEntryMethod(source: string, starterSource: string): JavaMethod {
  const starterMethods = inferJavaMethods(starterSource).filter(method => method.name !== 'main');
  if (starterMethods.length !== 1) {
    throw new Error('Could not uniquely read the Java entry method from LeetCode starter code.');
  }
  const starterMethod = starterMethods[0];
  const methods = inferJavaMethods(source);
  const normalize = (type: string) => type.replace(/\s+/g, '').replace(/\.\.\./g, '[]');
  const match = methods.find(method =>
    method.name === starterMethod.name &&
    method.parameterTypes.length === starterMethod.parameterTypes.length &&
    method.parameterTypes.every((type, index) =>
      normalize(type) === normalize(starterMethod.parameterTypes[index] ?? '')
    )
  );
  if (!match) {
    throw new Error(
      "Your solution must preserve LeetCode's entry signature: " +
      starterMethod.name + '(' + starterMethod.parameterTypes.join(', ') +
      '). Check that the method name and parameter types match the original starter code.'
    );
  }
  return match;
}
