import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedResponse, mountMonacoHarness, VISUALIZER_SOURCE } from '../test/visualizerHarness';
import { sessionStore } from '../state/store';
import { injectYourVisionTab, injectVisualizeButton, uninstallLeetCodeIntegration } from './integration';
import { findTestResultContainers } from './selectors';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

type Flow = {
  name: string;
  kind: 'default' | 'custom' | 'failed';
  buttonLabel: string;
  input: string;
};

const flows: Flow[] = [
  { name: 'selected default testcase', kind: 'default', buttonLabel: 'Case 2', input: '[1,2]' },
  { name: 'custom testcase', kind: 'custom', buttonLabel: 'Custom', input: '[4,5]' },
  { name: 'failed submission Use Testcase result', kind: 'failed', buttonLabel: 'Case 1', input: '[7,8]' },
];

function addVisibleRects(): void {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 800,
      height: 30,
      top: 100,
      left: 0,
      right: 800,
      bottom: 130,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }),
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

function makePage(flow: Flow): void {
  const cases = flow.kind === 'custom'
    ? '<button data-e2e-locator="console-testcase-tag" class="bg-fill-3">Custom</button>'
    : flow.kind === 'failed'
      ? '<button data-e2e-locator="console-testcase-tag" class="bg-fill-3">Case 1</button>'
      : '<button data-e2e-locator="console-testcase-tag" class="bg-fill-3">Case 1</button><button data-e2e-locator="console-testcase-tag">Case 2</button>';

  const testcaseRegion = `<div class="case-region">${cases}</div>`;
  const testcasePanel = flow.kind === 'failed'
    ? `<div class="result-panel"><h2>Test Result</h2><div class="result-details"><div>Wrong Answer — Use Testcase</div><div>Input <input data-e2e-locator="console-testcase-input" value="${flow.input}"> Output <span></span></div>${testcaseRegion}</div></div>`
    : `<div class="testcase-panel"><div class="console-tabs"><button>Testcase</button><button>Test Result</button></div>${testcaseRegion}<div>Input <input data-e2e-locator="console-testcase-input" value="${flow.input}"> Output —</div><div class="result-panel" style="display:none" aria-hidden="true"><h2>Test Result</h2><div>Wrong Answer</div>Input ${flow.input} Output mismatch${testcaseRegion}</div></div>`;

  document.body.innerHTML = `
    <div class="flexlayout__tabset">
      <div class="flexlayout__tabset_tabbar_inner">
        <div class="flexlayout__tabset_tabbar_inner_tab_container_top">
          <div class="flexlayout__tab_button_top flexlayout__tab_button--selected"><div class="flexlayout__tab_button_content">Description</div></div>
          <div class="flexlayout__tab_button_top flexlayout__tab_button--unselected"><div class="flexlayout__tab_button_content">Solutions</div></div>
          <div class="flexlayout__tab_button_top flexlayout__tab_button--unselected"><div class="flexlayout__tab_button_content">Editorial</div></div>
        </div>
      </div>
      <div class="flexlayout__tabset_content"><div class="native-content">Description pane</div></div>
    </div>
    ${testcasePanel}
  `;
  document.querySelectorAll<HTMLButtonElement>('[data-e2e-locator="console-testcase-tag"]')
    .forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('[data-e2e-locator="console-testcase-tag"]')
        .forEach(tab => tab.classList.remove('bg-fill-3'));
      button.classList.add('bg-fill-3');
    }));
  mountMonacoHarness(VISUALIZER_SOURCE);
}

beforeEach(() => addVisibleRects());

afterEach(() => {
  act(() => uninstallLeetCodeIntegration());
  sessionStore.set({ open: false, loading: false, playing: false });
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('LeetCode testcase to visualizer flow harness', () => {
  it('adds a result Visualize button when a failure panel has no native button to copy classes from', () => {
    makePage(flows[0]);
    document.querySelector('.result-panel')?.remove();

    const failurePanel = document.createElement('section');
    failurePanel.className = 'result-panel';
    failurePanel.innerHTML = '<h2>Test Result</h2><div>Wrong Answer</div><div>Input <input value="[1,2]"> Output mismatch</div>';
    document.body.append(failurePanel);

    expect(findTestResultContainers()).toContain(failurePanel);
    expect(() => act(() => injectVisualizeButton())).not.toThrow();
    expect(failurePanel.querySelector('[data-yourvision-result-visualize="true"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-yourvision-visualize="true"]:not([data-yourvision-result-visualize="true"])')).toHaveLength(1);
  });

  it.each(flows)('visualizes the $name and replays its deterministic trace', async flow => {
    makePage(flow);
    expect(findTestResultContainers()).toHaveLength(flow.kind === 'failed' ? 1 : 0);
    const messages: Array<Record<string, unknown>> = [];
    const sendMessage = vi.fn(async (message: Record<string, unknown>) => {
      messages.push(message);
      if (message.type === 'READ_SOURCE') {
        return { ok: true, source: VISUALIZER_SOURCE };
      }
      if (message.type === 'RUN_VISUALIZATION') {
        return { ok: true, data: fixedResponse() };
      }
      return { ok: true };
    });
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`,
        sendMessage,
      },
    });

    let tabInjected = false;
    let buttonInjected = false;
    act(() => {
      tabInjected = injectYourVisionTab();
      buttonInjected = injectVisualizeButton();
    });
    expect(tabInjected).toBe(true);
    expect(buttonInjected).toBe(true);
    act(() => { injectVisualizeButton(); });

    const selectedCase = [...document.querySelectorAll<HTMLButtonElement>('[data-e2e-locator="console-testcase-tag"]')]
      .find(button => button.textContent === flow.buttonLabel)!;
    act(() => selectedCase.click());
    expect(selectedCase.classList.contains('bg-fill-3')).toBe(true);

    const visualizeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-yourvision-visualize="true"]')];
    expect(visualizeButtons.filter(button => !button.hasAttribute('data-yourvision-result-visualize'))).toHaveLength(1);
    expect(document.querySelectorAll('[data-yourvision-result-visualize="true"]')).toHaveLength(flow.kind === 'failed' ? 1 : 0);
    const visualize = flow.kind === 'failed'
      ? document.querySelector<HTMLButtonElement>('[data-yourvision-result-visualize="true"]')!
      : visualizeButtons.find(button => button.textContent === 'Visualize')!;

    await act(async () => {
      visualize.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const state = sessionStore.get();
    expect(state.loading).toBe(false);
    expect(state.error).toBeUndefined();
    expect(state.testcase?.source).toBe(flow.kind);
    expect(state.testcase?.label).toBe(flow.buttonLabel);
    expect(state.testcase?.orderedArguments).toEqual([flow.input]);
    expect(document.querySelector<HTMLElement>('[data-yourvision-tab="true"]')?.getAttribute('aria-selected')).toBe('true');
    expect(messages.find(message => message.type === 'RUN_VISUALIZATION')).toMatchObject({
      source: VISUALIZER_SOURCE,
      method: 'sum',
      arguments: [flow.input],
    });

    const panelHost = document.querySelector<HTMLElement>('[data-yourvision-host="true"]')!;
    const panel = panelHost.shadowRoot!;
    expect(panel.querySelector('.yv-statement')?.textContent).toContain('public int sum');
    expect(panel.querySelector('.yv-output .yv-code')?.textContent).toBe('—');
    const next = [...panel.querySelectorAll('button')].find(button => button.textContent?.includes('Next →'))!;
    for (let index = 1; index < fixedResponse().states!.length; index++) {
      act(() => next.click());
    }
    expect(panel.querySelector('.yv-output .yv-code')?.textContent).toBe('3');
    expect(panel.querySelector('.yv-var-name')?.textContent).toBe('nums');
  });
});
