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
import { sameLineLoopStates, SAME_LINE_LOOP_SOURCE } from '../test/sameLineLoopTrace';
import { highlightEditorLine } from '../leetcode/editor-overlay';

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
  it('steps through enriched same-line loop visits, restores structures, and resumes the caller', () => {
    const states = sameLineLoopStates();
    const visitStates = states
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.method === 'helper' && item.lastEvent?.type === 'STEP' && typeof item.variables.visits === 'number');
    const loopVisitStates = visitStates.filter(({ item }) => item.lastEvent?.line === 9);
    expect(loopVisitStates.map(({ item }) => item.variables.visits)).toEqual([0, 1, 2, 3]);
    expect(new Set(visitStates.map(({ item }) => item.sequence)).size).toBe(visitStates.length);

    editor = mountMonacoHarness(SAME_LINE_LOOP_SOURCE);
    const mounted = mountVisualizer(SAME_LINE_LOOP_SOURCE, {
      success: true,
      kind: 'OK',
      result: '4',
      states,
    });
    root = mounted.root;
    const panel = mounted.host.shadowRoot!;

    // Advance one checkpoint at a time; consecutive genuine visits share the
    // same source highlight while the locals and array snapshot keep changing.
    const loopVisit = loopVisitStates.find(({ item }) => item.variables.visits === 1)!;
    while (sessionStore.get().index < loopVisit.index) clickButton(panel, 'Next →');
    expect(sessionStore.get().index).toBe(loopVisit.index);
    expect(highlightedSourceLine(editor!)).toBe(9);
    expect(panel.querySelector('.yv-statement')?.textContent).toContain('while (visits++ < 3)');

    const visitsRow = () => [...panel.querySelectorAll<HTMLElement>('.yv-var')]
      .find(row => row.querySelector('.yv-var-name')?.textContent === 'visits');
    const arrayValues = () => [...panel.querySelectorAll('.yv-cell-value')].map(cell => cell.textContent);
    expect(visitsRow()?.textContent).toContain('1');
    expect(arrayValues()).toEqual(['1', '0', '0']);

    clickButton(panel, 'Next →');
    expect(sessionStore.get().index).toBe(loopVisit.index + 1);
    expect(highlightedSourceLine(editor!)).toBe(9);
    expect(visitsRow()?.textContent).toContain('2');
    expect(arrayValues()).toEqual(['1', '2', '0']);

    clickButton(panel, '← Prev');
    expect(sessionStore.get().index).toBe(loopVisit.index);
    expect(highlightedSourceLine(editor!)).toBe(9);
    expect(visitsRow()?.textContent).toContain('1');
    expect(arrayValues()).toEqual(['1', '0', '0']);
    clickButton(panel, 'Next →');
    clickButton(panel, 'Next →');
    expect(visitsRow()?.textContent).toContain('3');
    expect(arrayValues()).toEqual(['1', '2', '3']);

    const helperReturn = states.findIndex(item => item.method === 'helper' && item.line === 10 && item.lastEvent?.type === 'METHOD_EXIT');
    while (sessionStore.get().index < helperReturn) clickButton(panel, 'Next →');
    expect(highlightedSourceLine(editor!)).toBe(10);
    expect(panel.querySelector('.yv-statement')?.textContent).toContain('return visits;');
    expect(visitsRow()?.textContent).toContain('4');

    const callerResume = states.findIndex((item, index) => index > helperReturn && item.method === 'run' && item.line === 3 && item.lastEvent?.type === 'STEP');
    while (sessionStore.get().index < callerResume) clickButton(panel, 'Next →');
    expect(highlightedSourceLine(editor!)).toBe(3);
    expect(panel.querySelector('.yv-statement')?.textContent).toContain('int result = helper();');
    expect(panel.querySelector('.yv-stack')?.textContent).toContain('run');
    expect(panel.querySelector('.yv-stack')?.textContent).not.toContain('helper');

    clickButton(panel, 'Next →');
    clickButton(panel, 'Next →');
    expect(highlightedSourceLine(editor!)).toBe(4);
    expect(panel.querySelector('.yv-statement')?.textContent).toContain('return result;');
    clickButton(panel, 'Next →');
    expect(panel.querySelector('.yv-output .yv-code')?.textContent).toBe('4');
  });

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

  it('highlights the editor containing the traced source when other Monaco editors are present', () => {
    const decoy = mountMonacoHarness('class Example {\n  public int sample() {\n    return 99;\n  }\n}');
    editor = mountMonacoHarness(VISUALIZER_SOURCE);
    const mounted = mountVisualizer(VISUALIZER_SOURCE);
    root = mounted.root;

    expect(highlightedSourceLine(editor)).toBe(2);
    expect(decoy.querySelector<HTMLElement>('[data-line="2"]')?.style.getPropertyValue('box-shadow')).toBe('');
  });

  it('cancels a delayed highlight when navigation has moved to another source line', () => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn() } });
    editor = mountMonacoHarness(VISUALIZER_SOURCE);
    editor.querySelector('.margin-view-overlays .line-numbers:nth-child(2)')?.remove();

    highlightEditorLine(2, VISUALIZER_SOURCE);
    highlightEditorLine(3, VISUALIZER_SOURCE);
    vi.advanceTimersByTime(50);

    expect(highlightedSourceLine(editor)).toBe(3);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders a traced graph with active, visited, and frontier nodes', () => {
    editor = mountMonacoHarness();
    const response = {
      success: true,
      kind: 'OK' as const,
      result: '3',
      states: [{
        ...sameLineLoopStates()[0],
        variables: { start: { $objectId: 'a' } },
        dataStructures: {
          queue: { $collectionId: 'q', $type: 'ArrayDeque', $kind: 'queue', values: [{ $objectId: 'b' }], size: 1 },
          seen: { $collectionId: 's', $type: 'HashSet', $kind: 'set', values: [{ $objectId: 'a' }], size: 1 },
        },
        objects: {
          a: { $objectId: 'a', $type: 'Node', fields: { val: 1, neighbors: [{ $objectId: 'b' }] } },
          b: { $objectId: 'b', $type: 'Node', fields: { val: 2, neighbors: [{ $objectId: 'c' }] } },
          c: { $objectId: 'c', $type: 'Node', fields: { val: 3, neighbors: [] } },
        },
      }],
    };
    const mounted = mountVisualizer(SAME_LINE_LOOP_SOURCE, response);
    root = mounted.root;
    const panel = mounted.host.shadowRoot!;
    expect(panel.querySelector('.yv-graph-view')).not.toBeNull();
    expect(panel.querySelectorAll('.yv-graph-node')).toHaveLength(3);
    expect(panel.querySelectorAll('.yv-graph-edge')).toHaveLength(2);
    expect(panel.querySelector('.yv-graph-active')).not.toBeNull();
    expect(panel.querySelector('.yv-graph-visited')).not.toBeNull();
    expect(panel.querySelector('.yv-graph-frontier')).not.toBeNull();
  });

  it('shows backing array snapshots for stacks, queues, sets and priority queues', () => {
    editor = mountMonacoHarness();
    const response = {
      success: true,
      kind: 'OK' as const,
      result: '—',
      states: [{
        ...sameLineLoopStates()[0],
        dataStructures: {
          stack: { $collectionId: 'stack-1', $type: 'Stack', $kind: 'stack', values: [1, 2], size: 2 },
          queue: { $collectionId: 'queue-1', $type: 'ArrayDeque', $kind: 'queue', values: [3, 4], size: 2 },
          set: { $collectionId: 'set-1', $type: 'HashSet', $kind: 'set', values: [5, 6], size: 2 },
          heap: { $collectionId: 'heap-1', $type: 'PriorityQueue', $kind: 'priorityQueue', values: [7, 8], size: 2 },
        },
      }],
    };
    const mounted = mountVisualizer(SAME_LINE_LOOP_SOURCE, response);
    root = mounted.root;
    const panel = mounted.host.shadowRoot!;
    expect(panel.querySelectorAll('.yv-collection-backing')).toHaveLength(4);
    expect([...panel.querySelectorAll('.yv-collection-backing')].map(node => node.textContent)).toEqual([
      expect.stringContaining('1'), expect.stringContaining('3'),
      expect.stringContaining('5'), expect.stringContaining('7'),
    ]);
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
  it('renders algorithm-specific narrative markers from runtime state', () => {
    const source = `class Solution {
  public int search(int[] nums,int target) {
    int lo = 0;
    int hi = nums.length - 1;
    while (lo <= hi) {
      int mid = lo + (hi - lo) / 2;
      if (nums[mid] == target) return mid;
      if (nums[mid] < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }
}`;
    editor = mountMonacoHarness(source);
    const states = sameLineLoopStates().map((state,index) => ({
      ...state,
      line: index % 2 === 0 ? 6 : 7,
      variables: { lo: 0, mid: 2, hi: 5, nums: [1,3,5,7,9,11] },
      arrays: { nums: { $arrayId: 'nums', $type: 'int[]', values: [1,3,5,7,9,11] } },
    }));
    const mounted = mountVisualizer(source, {
      success: true,
      kind: 'OK',
      result: '2',
      states,
    });
    root = mounted.root;
    const panel = mounted.host.shadowRoot!;
    expect(panel.querySelector('.yv-algorithm-narrative')).not.toBeNull();
    expect(panel.querySelector('.yv-algo-marker')?.textContent).toContain('MID');
    expect(panel.querySelectorAll('.yv-algo-active').length).toBeGreaterThan(0);
  });

});
