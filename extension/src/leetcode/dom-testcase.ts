import type { JavaMethod, LeetCodeTestcase } from '../types/leetcode';
import { detectSource, makeTestcase } from './testcase';
import { findActiveTestcaseTab, findTestcaseRegion } from './selectors';

function clean(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

function textOf(el: Element | null): string { return clean(el?.textContent ?? ''); }

function pickExpected(region: HTMLElement): string | undefined {
  const labels = [...region.querySelectorAll<HTMLElement>('*')];
  for (const el of labels) {
    if (!/^expected(?:\s+output)?\s*:?$/i.test(textOf(el))) continue;
    const parent = el.parentElement;
    const siblings = parent ? [...parent.children] : [];
    const idx = siblings.indexOf(el);
    if (idx >= 0 && siblings[idx + 1]) {
      const value = textOf(siblings[idx + 1]);
      if (value && !/^expected/i.test(value)) return value;
    }
    const next = el.nextElementSibling;
    const value = textOf(next);
    if (value) return value;
  }
  return undefined;
}

function pickRawInput(region: HTMLElement, active: HTMLElement | null): string {
  const activePanelId = active?.getAttribute('aria-controls');
  if (activePanelId) {
    const panel = document.getElementById(activePanelId);
    const t = textOf(panel);
    if (t) return stripResultNoise(t);
  }

  const candidates = [...region.querySelectorAll<HTMLElement>('textarea, pre, code, [contenteditable="true"], [role="tabpanel"]')];
  for (const el of candidates) {
    const t = el instanceof HTMLTextAreaElement ? clean(el.value) : textOf(el);
    if (t.includes('=') && t.length < 8000) return stripResultNoise(t);
  }

  const text = textOf(region);
  const inputMatch = text.match(/(?:^|\n)Input\s*:?\s*([\s\S]*?)(?=\n(?:Output|Expected|Explanation|Run|Submit|Test Result)\b|$)/i);
  if (inputMatch?.[1]?.includes('=')) return clean(inputMatch[1]);

  const assignmentLines = text.split('\n').filter(line => /^\s*[A-Za-z_$][\w$]*\s*=/.test(line));
  return assignmentLines.join('\n').trim();
}

function stripResultNoise(text: string): string {
  const normalized = clean(text);
  return normalized
    .replace(/\n(?:Output|Expected|Stdout|Runtime|Memory|Test Result)[\s\S]*$/i, '')
    .replace(/^Input\s*:?\s*/i, '')
    .trim();
}

export function readSelectedTestcase(method: JavaMethod): LeetCodeTestcase {
  const region = findTestcaseRegion();
  if (!region) throw new Error('Could not find LeetCode testcase panel. Open the Testcase/Test Result panel and try again.');

  const active = findActiveTestcaseTab(region);
  const label = textOf(active) || 'Selected testcase';
  const panelText = textOf(region);
  const source = detectSource(label, panelText);
  const raw = pickRawInput(region, active);
  if (!raw) throw new Error('Could not read the selected testcase input.');
  return makeTestcase(raw, label, source, method, pickExpected(region));
}
