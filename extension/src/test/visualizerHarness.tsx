import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VisualizerPanel } from '../components/VisualizerPanel';
import { sessionStore } from '../state/store';
import type { TraceEvent, TraceState, VisualizationResponse } from '../types/trace';
import type { LeetCodeTestcase } from '../types/leetcode';

export const VISUALIZER_SOURCE = [
  'class Solution {',
  '  public int sum(int[] nums) {',
  '    int total = 0;',
  '    for (int i = 0; i < nums.length; i++) {',
  '      total += nums[i];',
  '    }',
  '    return total;',
  '  }',
  '}',
].join('\n');

const arraySnapshot = {
  $arrayId: 'array-1',
  $type: 'int[]',
  values: [1, 2],
};

function state(
  sequence: number,
  line: number,
  type: TraceEvent['type'],
  variables: Record<string, unknown>,
  callStack: string[] = ['sum'],
): TraceState {
  return {
    sequence,
    line,
    method: 'sum',
    depth: callStack.length,
    variables,
    arrays: { nums: arraySnapshot },
    dataStructures: {},
    objects: {},
    callStack,
    lastEvent: { type, line, method: 'sum' },
  };
}

export function fixedTraceStates(): TraceState[] {
  return [
    state(1, 2, 'METHOD_ENTER', { nums: arraySnapshot }),
    state(2, 3, 'STEP', { nums: arraySnapshot, total: 0 }),
    state(3, 4, 'STEP', { nums: arraySnapshot, total: 0, i: 0 }),
    state(4, 5, 'STEP', { nums: arraySnapshot, total: 0, i: 0 }),
    state(5, 4, 'STEP', { nums: arraySnapshot, total: 0, i: 1 }),
    state(6, 5, 'STEP', { nums: arraySnapshot, total: 1, i: 1 }),
    state(7, 4, 'STEP', { nums: arraySnapshot, total: 1, i: 2 }),
    state(8, 7, 'STEP', { nums: arraySnapshot, total: 1 }),
    state(9, 7, 'PROGRAM_END', { nums: arraySnapshot, total: 1 }, []),
  ];
}

export const TESTCASE: LeetCodeTestcase = {
  id: 'default:Case 1',
  label: 'Case 1',
  source: 'default',
  raw: 'nums = [1,2]',
  inputs: { nums: '[1,2]' },
  orderedArguments: ['[1,2]'],
};

export function fixedResponse(): VisualizationResponse {
  return {
    success: true,
    kind: 'OK',
    result: '3',
    states: fixedTraceStates(),
  };
}

function setRect(element: Element, top: number, width = 800): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width,
      height: 20,
      top,
      left: 0,
      right: width,
      bottom: top + 20,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
  });
}

export function mountMonacoHarness(source = VISUALIZER_SOURCE): HTMLElement {
  const editor = document.createElement('div');
  editor.className = 'monaco-editor';
  setRect(editor, 0, 900);

  const viewLines = document.createElement('div');
  viewLines.className = 'view-lines';
  const gutter = document.createElement('div');
  gutter.className = 'margin-view-overlays';

  source.split(/\r?\n/).forEach((text, index) => {
    const lineNumber = index + 1;
    const viewLine = document.createElement('div');
    viewLine.className = 'view-line';
    viewLine.dataset.line = String(lineNumber);
    viewLine.textContent = text;
    setRect(viewLine, lineNumber * 20);
    viewLines.append(viewLine);

    const number = document.createElement('div');
    number.className = 'line-numbers';
    number.textContent = String(lineNumber);
    setRect(number, lineNumber * 20, 30);
    gutter.append(number);
  });

  editor.append(viewLines, gutter);
  document.body.append(editor);
  return editor;
}

export function mountVisualizer(source = VISUALIZER_SOURCE): {
  root: Root;
  host: HTMLDivElement;
} {
  const host = document.createElement('div');
  host.tabIndex = -1;
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const mount = document.createElement('div');
  shadow.append(mount);
  const root = createRoot(mount);

  act(() => {
    sessionStore.begin(source, TESTCASE);
    sessionStore.finish(fixedResponse());
    root.render(<VisualizerPanel />);
  });

  return { root, host };
}

export function unmount(root: Root): void {
  act(() => root.unmount());
  sessionStore.set({ open: false, loading: false, playing: false });
}

export function highlightedSourceLine(editor: HTMLElement): number | undefined {
  const line = [...editor.querySelectorAll<HTMLElement>('.view-line')]
    .find(element => element.style.getPropertyValue('box-shadow').includes('inset 2px'));
  return line?.dataset.line ? Number(line.dataset.line) : undefined;
}
