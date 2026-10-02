import { describe, expect, it } from 'vitest';
import type { TraceState } from '../../types/trace';
import { primaryVisualOperation, semanticEventsBetween, visualOperationLabel } from './operationSemantics';

const makeState = (overrides: Partial<TraceState> = {}): TraceState => ({
  sequence: 0, depth: 0, variables: {}, arrays: {}, dataStructures: {},
  objects: {}, callStack: [], ...overrides,
});

describe('operation semantics', () => {
  it('detects comparison targets', () => {
    const before = makeState({
      variables: { i: 0, j: 1 },
      arrays: { nums: { $arrayId: 'a', values: [2, 7, 9] } },
    });
    const after = makeState({
      line: 4,
      variables: { i: 0, j: 1 },
      arrays: { nums: { $arrayId: 'a', values: [2, 7, 9] } },
    });
    const events = semanticEventsBetween(before, after, 'if(nums[i] < nums[j])');
    expect(primaryVisualOperation(events)).toBe('compare');
    expect(events.some(event => event.type === 'compare')).toBe(true);
  });

  it('detects swaps', () => {
    const before = makeState({ arrays: { nums: { $arrayId: 'a', values: [2, 7] } } });
    const after = makeState({ arrays: { nums: { $arrayId: 'a', values: [7, 2] } } });
    expect(primaryVisualOperation(semanticEventsBetween(before, after))).toBe('swap');
  });

  it('labels a read when the state is unchanged', () => {
    const before = makeState({
      variables: { i: 1 },
      arrays: { nums: { $arrayId: 'a', values: [2, 7, 9] } },
    });
    const after = makeState({
      line: 2,
      variables: { i: 1 },
      arrays: { nums: { $arrayId: 'a', values: [2, 7, 9] } },
    });
    expect(visualOperationLabel(primaryVisualOperation(
      semanticEventsBetween(before, after, 'value = nums[i]')
    ))).toBe('READ');
  });
});

  it('turns a runtime node pointer change into TRAVERSE', () => {
    const before = {
      sequence: 0, depth: 0, variables: { cur: { $objectId: 'n1' } },
      arrays: {}, dataStructures: {}, objects: {}, callStack: []
    } as TraceState;
    const after = {
      sequence: 1, depth: 0, variables: { cur: { $objectId: 'n2' } },
      arrays: {}, dataStructures: {}, objects: {}, callStack: []
    } as TraceState;
    const events = semanticEventsBetween(before, after);
    expect(events.some(event => event.type === 'traverse')).toBe(true);
    expect(primaryVisualOperation(events)).toBe('move');
  });
