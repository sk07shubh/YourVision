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
  let current: HTMLElement | null = region.parentElement;

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

  const label =
    textOf(active) ||
    'Selected testcase';

  const panelText =
    textOf(panel);

  const source =
    detectSource(
      label,
      panelText
    );

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
}(?:\bOutput\b|$)