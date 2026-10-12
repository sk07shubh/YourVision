import type {
  JavaMethod,
  LeetCodeTestcase,
} from '../types/leetcode';

import {
  detectSource,
  makeTestcase,
} from './testcase';

import {
  findActiveTestcaseTab,
  findTestcasePanel,
  findTestcaseRegion,
} from './selectors';

function clean(
  text: string
): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function textOf(
  el: Element | null
): string {
  return clean(
    el?.textContent ?? ''
  );
}

function readInputValue(
  input: HTMLElement
): string {
  if (
    input instanceof HTMLInputElement ||
    input instanceof HTMLTextAreaElement
  ) {
    return clean(input.value);
  }

  return clean(
    input.textContent ?? ''
  );
}

function fallbackResultInput(
  panel: HTMLElement
): string {
  const text = clean(panel.textContent ?? '');
  const match = text.match(/\bInput\b\s*([\s\S]*?)\bOutput\b/i);
  return clean(match?.[1] ?? '');
}

function findResultPanel(
  region: HTMLElement
): HTMLElement | null {
  let current: HTMLElement | null = region;

  for (let depth = 0; current && depth < 6; depth++, current = current.parentElement) {
    const text = textOf(current);
    if (/\bInput\b/i.test(text) && /\bOutput\b/i.test(text)) {
      return current;
    }
  }

  return null;
}

function pickRawInput(
  panel: HTMLElement,
  method: JavaMethod
): string {
  const inputs = [
    ...panel.querySelectorAll<HTMLElement>(
      '[data-e2e-locator="console-testcase-input"]'
    ),
  ];

  if (inputs.length === 0) {
    return fallbackResultInput(panel);
  }

  const assignments: string[] = [];

  for (
    let i = 0;
    i < inputs.length;
    i++
  ) {
    const value =
      readInputValue(inputs[i]);

    if (!value) {
      continue;
    }

    const parameterName =
      method.parameterNames[i] ??
      `arg${i}`;

    assignments.push(
      `${parameterName} = ${value}`
    );
  }

  return assignments.join('\n');
}


export function readDesignTestcaseArrays(region?: HTMLElement): { names: string[]; values: unknown[][]; label: string; raw: string } {
  const root = region ?? findTestcaseRegion();
  if (!root) throw new Error('Could not find the LeetCode testcase tabs.');
  const panel = root.dataset.yourvisionResultRegion === 'true'
    ? findResultPanel(root) ?? findTestcasePanel(root)
    : findTestcasePanel(root) ?? findResultPanel(root);
  if (!panel) throw new Error('Could not find the design testcase panel.');
  const inputs = [...panel.querySelectorAll<HTMLElement>('[data-e2e-locator="console-testcase-input"]')]
    .map(readInputValue).filter(Boolean);
  if (inputs.length < 2) throw new Error('Design testcase must include operation names and argument arrays.');
  let names: unknown, values: unknown;
  try { names = JSON.parse(inputs[0]); values = JSON.parse(inputs[1]); }
  catch { throw new Error('Could not parse design testcase arrays.'); }
  if (!Array.isArray(names) || !names.every(v => typeof v === 'string') ||
      !Array.isArray(values) || values.length !== names.length ||
      !values.every(Array.isArray)) throw new Error('Invalid design testcase operation arrays.');
  const activeLabel = textOf(findActiveTestcaseTab(root));
  return { names, values, label: /^default$/i.test(activeLabel) ? 'Testcase' : activeLabel || 'Selected testcase', raw: JSON.stringify({names, values}) };
}

export function readSelectedTestcase(
  method: JavaMethod,
  preferredRegion?: HTMLElement
): LeetCodeTestcase {
  const region =
    preferredRegion ??
    findTestcaseRegion();

  if (!region) {
    throw new Error(
      'Could not find the LeetCode testcase tabs.'
    );
  }

  const panel =
    region.dataset.yourvisionResultRegion === 'true'
      ? findResultPanel(region) ?? findTestcasePanel(region)
      : findTestcasePanel(region) ?? findResultPanel(region);

  if (!panel) {
    throw new Error(
      'Could not find the LeetCode testcase inputs.'
    );
  }

  const active =
    findActiveTestcaseTab(region);

  const activeLabel =
    textOf(active);

  // LeetCode may call its built-in testcase tab "Default".
  // YourVision does not need a redundant Default badge.
  const label =
    /^default$/i.test(activeLabel)
      ? 'Testcase'
      : activeLabel ||
        'Selected testcase';

  const panelText =
    textOf(panel);

  const source = region.dataset.yourvisionResultRegion === 'true'
    ? 'failed'
    : detectSource(label, '');

  const raw =
    pickRawInput(
      panel,
      method
    );

  if (!raw) {
    throw new Error(
      'Could not read the selected testcase input.'
    );
  }

  return makeTestcase(
    raw,
    label,
    source,
    method
  );
}
