import type { JavaMethod, LeetCodeTestcase, TestcaseSource } from '../types/leetcode';
import { orderArguments } from './method';

export function parseAssignments(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const text = raw.replace(/\r/g, '').trim();
  if (!text) return result;

  const chunks = splitTopLevelAssignments(text);
  for (const chunk of chunks) {
    const eq = findTopLevelEquals(chunk);
    if (eq < 1) continue;
    const key = chunk.slice(0, eq).trim().replace(/^Input:\s*/i, '');
    const value = chunk.slice(eq + 1).trim();
    if (/^[A-Za-z_$][\w$]*$/.test(key) && value) result[key] = value;
  }
  return result;
}

function splitTopLevelAssignments(text: string): string[] {
  const out: string[] = [];
  let quote: string | null = null, escape = false, depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (quote && ch === '\\') { escape = true; continue; }
    if (ch === '"' || ch === "'") { quote = quote === ch ? null : quote ?? ch; continue; }
    if (quote) continue;
    if ('[{('.includes(ch)) depth++;
    else if (']})'.includes(ch)) depth--;
    else if ((ch === ',' || ch === '\n') && depth === 0) {
      const piece = text.slice(start, i).trim();
      if (piece) out.push(piece);
      start = i + 1;
    }
  }
  const final = text.slice(start).trim(); if (final) out.push(final);
  return out;
}

function findTopLevelEquals(text: string): number {
  let quote: string | null = null, escape = false, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (quote && ch === '\\') { escape = true; continue; }
    if (ch === '"' || ch === "'") { quote = quote === ch ? null : quote ?? ch; continue; }
    if (quote) continue;
    if ('[{('.includes(ch)) depth++;
    else if (']})'.includes(ch)) depth--;
    else if (ch === '=' && depth === 0) return i;
  }
  return -1;
}

export function detectSource(label: string, panelText: string): TestcaseSource {
  const hay = `${label} ${panelText}`.toLowerCase();
  if (/failed|wrong answer|runtime error|time limit|use testcase/.test(hay)) return 'failed';
  if (/custom|testcase\s*\d+.*custom/.test(hay)) return 'custom';
  if (/case\s*\d+|testcase/.test(hay)) return 'default';
  return 'unknown';
}

export function makeTestcase(raw: string, label: string, source: TestcaseSource, method: JavaMethod, expected?: string): LeetCodeTestcase {
  const inputs = parseAssignments(raw);
  return {
    id: `${source}:${label}:${raw}`,
    label: label || 'Selected testcase',
    source,
    raw,
    inputs,
    orderedArguments: orderArguments(inputs, method),
    expected,
  };
}
