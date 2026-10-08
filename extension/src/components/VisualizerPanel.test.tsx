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
  unorderedCollectionDelta,
} from './VisualizerPanel';

function state(patch: Partial<TraceState>): TraceState {
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

describe('execution visualization feature matrix', () => {
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

  it('keeps if/while conditions complete, including nested calls and negation', () => {
    expect(executionSubstatement('if (!Character.isLetterOrDigit(ch))', state())).toBe(
      'if (!Character.isLetterOrDigit(ch))'
    );
    expect(executionSubstatement('while (i < n && !done)', state())).toBe(
      'while (i < n && !done)'
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
    expect(unorderedCollectionDelta([1, 2], [2, 3])).toEqual({
      added: 3,
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
      { kind: 'insert', key: 4, after: 7 },
      { kind: 'update', key: 2, before: 1, after: 3 },
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
