import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Root } from 'react-dom/client';
import { sessionStore } from '../state/store';
import {
  highlightedSourceLine,
  mountMonacoHarness,
  mountVisualizer,
  unmount,
  VISUALIZER_SOURCE,
} from '../test/visualizerHarness';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

let root: Root | undefined;
let editor: HTMLElement | undefined;

afterEach(() => {
  if (root) unmount(root);
  root = undefined;
  editor = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function renderPanel() {
  editor = mountMonacoHarness();
  const mounted = mountVisualizer();
  root = mounted.root;
  return { host: mounted.host, panel: mounted.host.shadowRoot! };
}

function keydown(target: EventTarget, key: string, code = key): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

function clickButton(host: ParentNode, label: string): void {
  const button = [...host.querySelectorAll('button')]
    .find(candidate => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Missing visualizer button: ${label}`);
  act(() => button.click());
}

describe('VisualizerPanel deterministic DOM harness', () => {
  it('keeps line, statement, parameters, variables, and structures synchronized', () => {
    const { panel } = renderPanel();
    expect(highlightedSourceLine(editor!)).toBe(2);
    expect(panel.querySelector('.yv-statement')?.textContent).toContain('public int sum');
    expect([...panel.querySelectorAll('.yv-var-name')].map(node => node.textContent)).toContain('nums');
    expect(panel.querySelector('.yv-array')?.textContent).toContain('1');

    clickButton(panel, 'Next →');
    expect(highlightedSourceLine(editor!)).toBe(3);
    expect(panel.querySelector('.yv-statement')?.textContent).toContain('int total = 0;');
    expect([...panel.querySelectorAll('.yv-var-name')].map(node => node.textContent)).toContain('total');

    clickButton(panel, 'Next →');
    clickButton(panel, 'Next →');
    expect(highlightedSourceLine(editor!)).toBe(5);
    clickButton(panel, 'Next →');
    expect(highlightedSourceLine(editor!)).toBe(4);
    expect(panel.querySelector('.yv-statement')?.textContent).toContain('for (');
    expect([...panel.querySelectorAll('.yv-var-name')].map(node => node.textContent)).toContain('i');
    const indexRow = [...panel.querySelectorAll<HTMLElement>('.yv-var')]
      .find(row => row.querySelector('.yv-var-name')?.textContent === 'i');
    expect(indexRow?.textContent).toContain('1');

    expect(highlightedSourceLine(editor!)).toBe(4);
    const highlighted = editor!.querySelector<HTMLElement>('[data-line="4"]');
    expect(highlighted?.style.getPropertyValue('background')).toContain('255, 161, 22');
    expect(highlighted?.style.getPropertyPriority('background')).toBe('important');
    expect(highlighted?.style.getPropertyValue('box-shadow')).toContain('inset 2px');
    expect(panel.querySelector('.yv-execution-arrow, .yv-arrow-marker')).toBeNull();
  });

  it('restores previous highlights and shows the actual return line and output', () => {
    const { panel } = renderPanel();
    for (let index = 0; index < 7; index++) clickButton(panel, 'Next →');

    expect(highlightedSourceLine(editor!)).toBe(7);
    expect(panel.querySelector('.yv-statement')?.textContent).toContain('return total;');
    expect(panel.querySelector('.yv-output .yv-code')?.textContent).toBe('—');

    clickButton(panel, 'Next →');
    expect(highlightedSourceLine(editor!)).toBe(7);
    expect(panel.querySelector('.yv-output .yv-code')?.textContent).toBe('3');
    clickButton(panel, '← Prev');
    expect(highlightedSourceLine(editor!)).toBe(7);
    expect(panel.querySelector('.yv-output .yv-code')?.textContent).toBe('—');
    clickButton(panel, '← Prev');
    expect(highlightedSourceLine(editor!)).toBe(4);
  });

  it('maps both arrow keys once, ignores page handlers, handles space/R, and clamps edges', () => {
    const { host, panel } = renderPanel();
    const pageKeyHandler = vi.fn();
    window.addEventListener('keydown', pageKeyHandler);

    host.focus();
    let right!: KeyboardEvent;
    act(() => { right = keydown(host, 'ArrowRight'); });
    expect(right.defaultPrevented).toBe(true);
    expect(sessionStore.get().index).toBe(1);
    expect(highlightedSourceLine(editor!)).toBe(3);
    expect(pageKeyHandler).not.toHaveBeenCalled();

    const next = [...panel.querySelectorAll('button')]
      .find(button => button.textContent?.includes('Next →'))!;
    const nextClick = vi.fn();
    next.addEventListener('click', nextClick);
    next.focus();
    act(() => keydown(next, 'ArrowLeft'));
    expect(sessionStore.get().index).toBe(0);
    expect(document.activeElement).not.toBe(next);
    expect(nextClick).not.toHaveBeenCalled();
    expect(pageKeyHandler).not.toHaveBeenCalled();

    act(() => keydown(host, ' ', 'Space'));
    expect(sessionStore.get().index).toBe(1);
    expect(sessionStore.get().playing).toBe(false);
    act(() => keydown(host, 'r'));
    expect(sessionStore.get().index).toBe(0);
    expect(sessionStore.get().playing).toBe(false);

    act(() => keydown(host, 'ArrowLeft'));
    expect(sessionStore.get().index).toBe(0);
    for (let index = 0; index < 20; index++) act(() => sessionStore.next());
    expect(sessionStore.get().index).toBe(sessionStore.get().states.length - 1);
    act(() => keydown(host, 'ArrowRight'));
    expect(sessionStore.get().index).toBe(sessionStore.get().states.length - 1);

    window.removeEventListener('keydown', pageKeyHandler);
  });
});
