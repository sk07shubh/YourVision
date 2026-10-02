import { describe, expect, it } from 'vitest';
import type { TraceState } from '../../types/trace';
import { diffStates } from './stateDiff';

function state(overrides: Partial<TraceState> = {}): TraceState {
  return {
    sequence: 0,
    depth: 0,
    variables: {},
    arrays: {},
    dataStructures: {},
    objects: {},
    callStack: [],
    ...overrides,
  };
}

describe('diffStates', () => {
  it('emits only the changed array cell', () => {
    const previous = state({
      arrays: {
        nums: { $arrayId: 'nums', values: [2, 7, 11, 15] },
      },
    });
    const current = state({
      arrays: {
        nums: { $arrayId: 'nums', values: [2, 7, 20, 15] },
      },
    });

    expect(diffStates(previous, current)).toEqual([
      {
        type: 'update',
        target: { structureId: 'nums', kind: 'array', index: 2 },
        from: 11,
        to: 20,
      },
    ]);
  });

  it('does not create visual work for an unchanged state', () => {
    const snapshot = state({ variables: { i: 2 } });
    expect(diffStates(snapshot, snapshot)).toEqual([]);
  });

  it('tracks scalar pointer updates as variable changes', () => {
    const previous = state({ variables: { left: 1 } });
    const current = state({ variables: { left: 2 } });

    expect(diffStates(previous, current)).toEqual([
      {
        type: 'update',
        target: { structureId: 'left', kind: 'variable' },
        from: 1,
        to: 2,
      },
    ]);
  });
});
