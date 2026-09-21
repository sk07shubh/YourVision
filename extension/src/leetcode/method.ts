import type { JavaMethod } from '../types/leetcode';

const MODIFIERS = String.raw`(?:public|private|protected|static|final|synchronized|native|abstract|strictfp|default)\s+`;

export function inferJavaMethods(source: string): JavaMethod[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');

  const rx = new RegExp(
    String.raw`(?:${MODIFIERS})*([\w$<>\[\].?,\s]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{`,
    'g'
  );
  const methods: JavaMethod[] = [];
  for (const m of withoutComments.matchAll(rx)) {
    const name = m[2];
    if (['if','for','while','switch','catch','new'].includes(name)) continue;
    const params = splitParams(m[3]);
    methods.push({
      name,
      parameterTypes: params.map(p => p.type),
      parameterNames: params.map(p => p.name),
    });
  }
  return methods;
}

export function inferMethod(source: string): JavaMethod {
  const methods = inferJavaMethods(source).filter(m => m.name !== 'main');
  if (!methods.length) throw new Error('Could not find a Java solution method.');
  return methods[0];
}

function splitParams(text: string): Array<{ type: string; name: string }> {
  if (!text.trim()) return [];
  const parts: string[] = [];
  let angle = 0, square = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '<') angle++;
    else if (ch === '>') angle = Math.max(0, angle - 1);
    else if (ch === '[') square++;
    else if (ch === ']') square = Math.max(0, square - 1);
    else if (ch === ',' && angle === 0 && square === 0) {
      parts.push(text.slice(start, i)); start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(raw => {
    const clean = raw.trim().replace(/\bfinal\s+/g, '').replace(/@[\w.]+(?:\([^)]*\))?\s*/g, '');
    const match = clean.match(/^(.*?)\s+(\w+)$/);
    if (!match) return { type: clean, name: `arg${parts.indexOf(raw)}` };
    return { type: match[1].trim(), name: match[2].trim() };
  });
}

export function orderArguments(inputs: Record<string, string>, method: JavaMethod): string[] {
  const values = Object.values(inputs);
  return method.parameterNames.map((name, index) => inputs[name] ?? values[index] ?? 'null');
}
