import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { TraceState } from '../types/trace';
import {
  collectionDelta,
  collectionOperation,
  compareArrayValues,
  compareMapEntries,
  executionCondition,
  executionSubstatement,
  eventEffects,
  dataStructureResults,
  isForLoopUpdateStep,
  pointerTargets,
  unorderedCollectionDelta,
  semanticRoleForVariable,
  pointerLabels,
  Variables,
  ArrayView,
  DataStructures,
  StringView,
  Variables,
} from './VisualizerPanel';

function state(patch: Partial<TraceState> = {}): TraceState {
  return {
    sequence: 1,
    depth: 1,
    variables: {},
    arrays: {},
    dataStructures: {},
    objects: {},
    callStack: [],
    ...patch,
  };
}

function markup(nodes: ReactNode[]): string {
  return renderToStaticMarkup(<>{nodes}</>);
}


describe('string data structure visualization', () => {
  it('keeps strings in Variables and also renders them as indexed character cells', () => {
    const current = state({ variables: { s: '({[]})', count: 6 } });
    const html = renderToStaticMarkup(<DataStructures state={current} source="s.charAt(i)" />);
    expect(html).toContain('data-string-structure="s"');
    expect(html).toContain('data-string-index="0"');
    expect(html).toContain('data-string-index="5"');
    expect(html).toContain('({[]})');
    const variablesHtml = renderToStaticMarkup(<Variables state={current} />);
    expect(variablesHtml).toContain('s');
    expect(variablesHtml).toContain('({[]})');
  });

  it('highlights the exact character index reported by a string access event', () => {
    const current = state({
      variables: { s: 'stack' },
      lastEvent: { type: 'STEP', line: 4, data: { executionEvents: [
        { type: 'ARRAY_ACCESS', data: { name: 's', indices: [2], value: 'a', kind: 'read' } },
      ] } },
    });
    const html = renderToStaticMarkup(<StringView value="stack" state={current} name="s" />);
    expect(html).toContain('data-string-index="2"');
    expect(html).toContain('class="yv-array-cell yv-cell-read" data-string-index="2"');
    expect(html).not.toContain('class="yv-array-cell yv-cell-read" data-string-index="1"');
  });
});

describe('execution visualization feature matrix', () => {
  it('resolves pointer destinations from actual in-range integer index variables only', () => {
    const current = state({
      variables: {
        i: 2,
        left: 0,
        right: 4,
        row: 1,
        invalid: 8,
        negative: -1,
        fractional: 1.5,
        textIndex: '2',
      },
    });

    expect(pointerTargets(
      current,
      5,
      new Set(['i', 'left', 'right', 'invalid', 'negative', 'fractional', 'textIndex'])
    )).toEqual([
      { name: 'i', index: 2 },
      { name: 'left', index: 0 },
      { name: 'right', index: 4 },
    ]);
  });

  it('reads runtime TRUE/FALSE without inventing a result', () => {
    expect(executionCondition(state({
      lastEvent: { type: 'STEP', line: 4, data: { conditionResult: true } },
    }))).toBe(true);
    expect(executionCondition(state({
      lastEvent: { type: 'STEP', line: 4, data: { conditionResult: false } },
    }))).toBe(false);
    expect(executionCondition(state({
      lastEvent: { type: 'STEP', line: 4, data: {} },
    }))).toBeUndefined();
  });

  it('shows the exact for-loop clause for initialization, condition, and update', () => {
    const statement = 'for (int i = 0; i < n; i++)';

    const init = state({
      lastEvent: {
        type: 'STEP',
        line: 4,
        data: {
          variables: { i: 0, n: 4 },
          executionEvents: [
            { type: 'VARIABLE_UPDATE', data: { name: 'i', value: 0 } },
          ],
        },
      },
    });

    const update = state({
      lastEvent: {
        type: 'STEP',
        line: 4,
        data: {
          variables: { i: 1, n: 4 },
          executionEvents: [
            { type: 'VARIABLE_UPDATE', data: { name: 'i', before: 0, value: 1 } },
          ],
          conditionResult: true,
        },
      },
    });

    const condition = state({
      lastEvent: {
        type: 'STEP',
        line: 4,
        data: { variables: { i: 1, n: 4 }, conditionResult: true },
      },
    });

    expect(executionSubstatement(statement, init)).toBe('int i = 0;');
    expect(executionSubstatement(statement, update, init)).toBe('i++');
    expect(executionSubstatement(statement, condition, update)).toBe('i < n');
    expect(isForLoopUpdateStep(statement, update, init)).toBe(true);
    expect(isForLoopUpdateStep(statement, condition, update)).toBe(false);
  });

  it('renders every enhanced-for header generically', () => {
    const cases = [
      ['for (char ch : s.toCharArray())', 'char ch : s.toCharArray()'],
      ['for (int n : nums)', 'int n : nums'],
      ['for (String word : words)', 'String word : words'],
      ['for (Node node : nodes)', 'Node node : nodes'],
      ['for (List<String> row : rows)', 'List<String> row : rows'],
      ['for (Map.Entry<Integer, String> entry : map.entrySet())', 'Map.Entry<Integer, String> entry : map.entrySet()'],
      ['for (final var value : values)', 'final var value : values'],
    ] as const;

    for (const [statement, expected] of cases) {
      expect(executionSubstatement(statement, state())).toBe(expected);
    }
  });

  it('keeps if/while conditions complete, including nested calls and negation', () => {
    expect(executionSubstatement('if (!Character.isLetterOrDigit(ch))', state({}))).toBe(
      'if(!Character.isLetterOrDigit(ch))'
    );
    expect(executionSubstatement('while (i < n && !done)', state({}))).toBe(
      'while(i < n && !done)'
    );
  });

  it('detects array deltas including nested array paths', () => {
    const changes: Array<{ indices: number[]; before: unknown; after: unknown }> = [];
    compareArrayValues(
      [1, { $arrayId: 'nested', values: [2, 3] }],
      [1, { $arrayId: 'nested', values: [2, 7] }],
      [],
      changes
    );
    expect(changes).toEqual([{ indices: [1, 1], before: 3, after: 7 }]);

    expect(collectionDelta([1, 2], [1, 3])).toEqual({
      removed: 2,
      added: 3,
      index: 1,
    });
    expect(collectionDelta([1, 2], [1, 2, 3])).toEqual({
      added: 3,
      index: 2,
    });
    expect(collectionDelta([1, 2, 3], [1, 3])).toEqual({
      removed: 2,
      index: 1,
    });
  });

  it('handles unordered collection deltas without assuming Set order', () => {
    expect(unorderedCollectionDelta([1, 2], [1, 2, 3])).toEqual({
      added: 3,
    });
    expect(unorderedCollectionDelta([1, 2], [2])).toEqual({
      removed: 1,
    });
    expect(unorderedCollectionDelta([1, 2], [2, 1])).toBeUndefined();
  });

  it('maps stack, queue, deque, priority queue, list, and set operations', () => {
    expect(collectionOperation('stack', 'push', { added: 5 })).toEqual({
      operation: 'Push', value: 5, position: 'Top',
    });
    expect(collectionOperation('stack', 'pop', { removed: 5 })).toEqual({
      operation: 'Pop', value: 5, position: 'Top',
    });
    expect(collectionOperation('queue', 'offer', { added: 5 })).toEqual({
      operation: 'Enqueue', value: 5, position: 'Rear',
    });
    expect(collectionOperation('queue', 'poll', { removed: 5 })).toEqual({
      operation: 'Dequeue', value: 5, position: 'Front',
    });
    expect(collectionOperation('deque', 'addFirst', { added: 5 })).toEqual({
      operation: 'addFirst', value: 5, position: 'Front',
    });
    expect(collectionOperation('deque', 'addLast', { added: 8 })).toEqual({
      operation: 'addLast', value: 8, position: 'Back',
    });
    expect(collectionOperation('deque', 'pop', { removed: 5 })).toEqual({
      operation: 'Pop', value: 5, position: 'Front',
    });
    expect(collectionOperation('priorityQueue', 'offer', { added: 5 })).toEqual({
      operation: 'Offer', value: 5, position: 'Queue',
    });
    expect(collectionOperation('priorityQueue', 'poll', { removed: 2 })).toEqual({
      operation: 'Poll', value: 2, position: 'Priority',
    });
    expect(collectionOperation('list', 'add', { added: 5 }, 1)).toEqual({
      operation: 'Add', value: 5, position: 'End',
    });
    expect(collectionOperation('list', 'add', { added: 5, index: 2 }, 2)).toEqual({
      operation: 'Insert', value: 5, position: 'Index: 2',
    });
    expect(collectionOperation('list', 'set', { added: 7, removed: 3, index: 2 })).toEqual({
      operation: 'Set', value: 7, oldValue: 3, position: 'Index: 2', showOld: true,
    });
    expect(collectionOperation('set', 'add', { added: 5 })).toEqual({
      operation: 'Add', value: 5, position: 'Element',
    });
    expect(collectionOperation('set', 'remove', { removed: 5 })).toEqual({
      operation: 'Remove', value: 5, position: 'Element',
    });
  });

  it('classifies map insert/update/delete transitions', () => {
    expect(compareMapEntries(
      [{ key: 2, value: 1 }],
      [{ key: 2, value: 3 }, { key: 4, value: 7 }],
    )).toEqual([
      { kind: 'update', key: 2, before: 1, after: 3 },
      { kind: 'insert', key: 4, after: 7 },
    ]);

    expect(compareMapEntries(
      [{ key: 2, value: 1 }],
      [],
    )).toEqual([{ kind: 'delete', key: 2, before: 1 }]);
  });

  it('turns authoritative execution events into visible effects', () => {
    const current = state({
      lastEvent: {
        type: 'STEP',
        line: 7,
        data: {
          executionEvents: [
            {
              type: 'ARRAY_ACCESS',
              data: { name: 'nums', indices: [2], value: 11 },
            },
            {
              type: 'MAP_WRITE',
              data: {
                changes: [{ kind: 'update', key: 2, before: 1, after: 3 }],
              },
            },
          ],
        },
      },
    });

    const effects = eventEffects(current);
    expect(effects.map(effect => effect.text)).toEqual([
      'nums[2] = 11',
      '2  1  →  3',
    ]);
  });

  it('renders map, array, and collection operations into the execution result', () => {
    const previous = state({
      arrays: {
        nums: { $arrayId: 'a', values: [1, 2] },
      },
      dataStructures: {
        mp: {
          $mapId: 'm',
          entries: [{ key: 2, value: 1 }],
        },
      },
    });

    const current = state({
      arrays: {
        nums: { $arrayId: 'a', values: [1, 7] },
      },
      dataStructures: {
        mp: {
          $mapId: 'm',
          entries: [{ key: 2, value: 3 }, { key: 4, value: 9 }],
        },
      },
      lastEvent: {
        type: 'STEP',
        line: 8,
        data: {
          variables: {},
          executionEvents: [],
        },
      },
    });

    const rows = dataStructureResults(current, previous, 'mp.put(4, 9);');
    const html = markup(rows);
    expect(html).toContain('mp');
    expect(html).toContain('[Put]');
    expect(html).toContain('Key: 4');
    expect(html).toContain('nums');
    expect(html).toContain('[Set]');
    expect(html).toContain('Index: 1');
  });
});


describe('deterministic semantic pointer roles', () => {
  it('exposes boundary roles even when variables are not array indices', () => {
    const current = state({ variables: { left: 1, right: 4 }, lastEvent: { type: 'STEP', line: 6, data: { semanticRoles: [
      { name: 'left', role: 'left-bound', confidence: 0.88, evidence: 'loop boundary', structureName: 'nums' },
      { name: 'right', role: 'right-bound', confidence: 0.96, evidence: 'loop boundary', structureName: 'nums' },
    ] } } });
    expect(semanticRoleForVariable(current, 'left')?.role).toBe('left-bound');
    expect(semanticRoleForVariable(current, 'right')?.role).toBe('right-bound');
  });
  it('labels array cells from semantic bounds without array-index source usage', () => {
    const current = state({ variables: { left: 1, right: 3 }, lastEvent: { type: 'STEP', line: 5, data: { semanticRoles: [
      { name: 'left', role: 'left-bound', confidence: 0.88, evidence: 'interval boundary', structureName: 'nums' },
      { name: 'right', role: 'right-bound', confidence: 0.96, evidence: 'interval boundary', structureName: 'nums' },
    ] } } });
    expect(pointerLabels(current, 5, new Set(), 'nums')).toEqual(new Map([[1, ['left']], [3, ['right']]]));
  });
  it('keeps binary-search boundary pointers visible when the current step omits the midpoint role', () => {
    // While evaluating the while condition, mid has not been assigned for this
    // iteration yet. The trace still contains gh/df, so their pointer labels
    // must not depend on a midpoint semantic role being present in this step.
    const current = state({
      variables: { n: 6, gh: 0, df: 5, target: 9 },
      arrays: { nums: [-1, 0, 3, 5, 9, 12] },
      lastEvent: { type: 'STEP', line: 5, data: { semanticRoles: [
        { name: 'gh', role: 'left-bound', confidence: 0.94, evidence: 'boundary updates are derived from a midpoint' },
        { name: 'df', role: 'right-bound', confidence: 0.94, evidence: 'boundary updates are derived from a midpoint' },
      ] } },
    });
    const source = [
      'int mid = gh + (df - gh) / 2;',
      'while (gh <= df) {',
      '  if (nums[mid] == target) {',
      '    return mid;',
      '  }',
    ].join('\n');

    const html = renderToStaticMarkup(
      <ArrayView value={[-1, 0, 3, 5, 9, 12]} state={current} source={source} arrayName="nums" />,
    );
    expect(html).toContain('>gh</div>');
    expect(html).toContain('>df</div>');
    expect(pointerLabels(current, 6, new Set(['mid']), 'nums', source)).toEqual(
      new Map([[0, ['gh']], [5, ['df']]]),
    );
  });
});

describe('semantic roles in rendered visualization', () => {
  it('renders boundary badges in the variable panel', () => {
    const current = state({
      variables: { left: 1, right: 3 },
      lastEvent: { type: 'STEP', line: 5, data: { semanticRoles: [
        { name: 'left', role: 'left-bound', confidence: 0.9, evidence: 'loop boundary', structureName: 'nums' },
        { name: 'right', role: 'right-bound', confidence: 0.9, evidence: 'loop boundary', structureName: 'nums' },
      ] } },
    });
    const html = renderToStaticMarkup(<Variables state={current} />);
    expect(html).toContain('LEFT BOUND');
    expect(html).toContain('RIGHT BOUND');
  });

  it('renders pointer labels over cells when source has no array indexing', () => {
    const current = state({
      variables: { left: 1, right: 3 },
      arrays: { nums: [10, 20, 30, 40] },
      lastEvent: { type: 'STEP', line: 5, data: { semanticRoles: [
        { name: 'left', role: 'left-bound', confidence: 0.9, evidence: 'interval boundary', structureName: 'nums' },
        { name: 'right', role: 'right-bound', confidence: 0.9, evidence: 'interval boundary', structureName: 'nums' },
      ] } },
    });
    const html = renderToStaticMarkup(<ArrayView value={[10, 20, 30, 40]} state={current} source="" arrayName="nums" />);
    expect(html).toContain('>left</div>');
    expect(html).toContain('>right</div>');
  });
  it('renders binary-search pointers from real array-index expressions when roles omit structureName', () => {
    const current = state({
      variables: { n: 9, left: 0, right: 8, mid: 4 },
      lastEvent: { type: 'STEP', line: 18, data: { semanticRoles: [
        { name: 'left', role: 'left-bound', confidence: 0.96, evidence: 'left boundary updates are derived from midpoint' },
        { name: 'right', role: 'right-bound', confidence: 0.96, evidence: 'right boundary updates are derived from midpoint' },
        { name: 'mid', role: 'midpoint', confidence: 0.96, evidence: 'mid is computed from both interval boundaries' },
      ] } },
    });
    const source = [
      'int mid = left + (right - left) / 2;',
      'if (nums[mid - 1] != nums[mid] && nums[mid + 1] != nums[mid]) {',
      '  left = mid + 1;',
      '  right = mid - 1;',
    ].join('\n');
    const html = renderToStaticMarkup(
      <ArrayView value={[1, 1, 2, 3, 3, 4, 4, 8, 8]} state={current} source={source} arrayName="nums" />,
    );
    expect(html).toContain('>left</div>');
    expect(html).toContain('>right</div>');
    expect(html).toContain('>mid</div>');
    expect(pointerLabels(current, 9, new Set(['left', 'right', 'mid', 'n']), 'nums')).toEqual(
      new Map([[0, ['left']], [8, ['right']], [4, ['mid']]]),
    );
  });

  it('places matrix traversal pointers at the active row and column intersection', () => {
    const current = state({
      variables: { row: 1, col: 2 },
      lastEvent: { type: 'STEP', line: 12, data: { semanticRoles: [
        { name: 'row', role: 'pointer', confidence: 0.9, evidence: 'row is updated as the first index of a two-dimensional array access', structureName: 'matrix' },
        { name: 'col', role: 'pointer', confidence: 0.9, evidence: 'col is updated as the second index of a two-dimensional array access', structureName: 'matrix' },
      ] } },
    });
    const html = renderToStaticMarkup(
      <ArrayView value={[[1, 2, 3], [4, 5, 6]]} state={current} source="matrix[row][col]" arrayName="matrix" />,
    );
    expect(html).toContain('row · col');
    expect(html).toContain('[1,2]');
  });

  it('does not invent an active matrix cell while row and column assignments are between checkpoints', () => {
    const current = state({
      variables: { row: 0, col: 1, mid: 2, n: 4 },
      lastEvent: { type: 'STEP', line: 13, data: {
        executionEvents: [
          { type: 'VARIABLE_UPDATE', data: { name: 'row', value: 0 } },
        ],
        semanticRoles: [
          { name: 'row', role: 'pointer', confidence: 0.99, evidence: 'first index in matrix access', structureName: 'matrix' },
          { name: 'col', role: 'pointer', confidence: 0.99, evidence: 'second index in matrix access', structureName: 'matrix' },
        ],
      } },
    });
    const html = renderToStaticMarkup(
      <ArrayView value={[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]]}
        state={current} source="matrix[row][col]" arrayName="matrix" />,
    );
    expect(html).not.toContain('yv-matrix-cell-active');
    expect(html).not.toContain('data-matrix-intersection=');
  });

  it('uses the recorded two-dimensional ARRAY_ACCESS as the active cell', () => {
    const current = state({
      variables: { row: 0, col: 2, mid: 2, n: 4 },
      lastEvent: { type: 'STEP', line: 15, data: {
        executionEvents: [
          { type: 'ARRAY_ACCESS', data: { name: 'matrix', indices: [0, 2], value: 5, kind: 'read' } },
        ],
        semanticRoles: [
          { name: 'row', role: 'pointer', confidence: 0.99, evidence: 'first index in matrix access', structureName: 'matrix' },
          { name: 'col', role: 'pointer', confidence: 0.99, evidence: 'second index in matrix access', structureName: 'matrix' },
        ],
      } },
    });
    const html = renderToStaticMarkup(
      <ArrayView value={[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]]}
        state={current} source="matrix[row][col]" arrayName="matrix" />,
    );
    expect(html.match(/yv-matrix-cell-active/g)).toHaveLength(1);
    expect(html).toContain('data-matrix-cell="[0,2]"');
    expect(html).toContain('yv-matrix-cell-active');
  });

  it('keeps matrix traversal pointers separate from outer answer-search boundaries', () => {
    const current = state({
      variables: { sd: 9, hg: 15, mid: 12, row: 1, col: 2 },
      lastEvent: { type: 'STEP', line: 15, data: { semanticRoles: [
        { name: 'sd', role: 'left-bound', confidence: 0.94, evidence: 'sd is derived from the midpoint of both search bounds' },
        { name: 'hg', role: 'right-bound', confidence: 0.94, evidence: 'hg is derived from the midpoint of both search bounds' },
        { name: 'mid', role: 'midpoint', confidence: 0.82, evidence: 'mid is computed from both inferred interval boundaries' },
        { name: 'row', role: 'pointer', confidence: 0.99, evidence: 'row is updated as the first index of a two-dimensional array access', structureName: 'matrix' },
        { name: 'col', role: 'pointer', confidence: 0.99, evidence: 'col is updated as the second index of a two-dimensional array access', structureName: 'matrix' },
      ] } },
    });

    expect(semanticRoleForVariable(current, 'sd')?.role).toBe('left-bound');
    expect(semanticRoleForVariable(current, 'hg')?.role).toBe('right-bound');
    expect(semanticRoleForVariable(current, 'mid')?.role).toBe('midpoint');
    expect(semanticRoleForVariable(current, 'row')?.role).toBe('pointer');
    expect(semanticRoleForVariable(current, 'col')?.role).toBe('pointer');

    const variablesHtml = renderToStaticMarkup(<Variables state={current} />);
    expect(variablesHtml).toContain('LEFT BOUND');
    expect(variablesHtml).toContain('RIGHT BOUND');
    expect(variablesHtml).toContain('MIDPOINT');
    expect(variablesHtml).toContain('POINTER');

    const matrixHtml = renderToStaticMarkup(
      <ArrayView value={[[1, 2, 3], [4, 5, 6]]} state={current} source="matrix[row][col]" arrayName="matrix" />,
    );
    expect(matrixHtml).toContain('row · col');
    expect(matrixHtml).not.toContain('sd · hg');
    expect(pointerLabels(current, 3, new Set(), 'matrix')).toEqual(
      new Map([[1, ['row']], [2, ['col']]]),
    );
  });

});
