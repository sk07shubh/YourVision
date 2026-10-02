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

  it('emits connect and disconnect when a node link changes', () => {
    const previous = state({
      objects: {
        n1: { $objectId: 'n1', fields: { val: 1, next: { $ref: 'n2' } } },
        n2: { $objectId: 'n2', fields: { val: 2, next: null } },
      },
    });
    const current = state({
      objects: {
        n1: { $objectId: 'n1', fields: { val: 1, next: { $ref: 'n3' } } },
        n2: { $objectId: 'n2', fields: { val: 2, next: null } },
        n3: { $objectId: 'n3', fields: { val: 3, next: null } },
      },
    });
    const events = diffStates(previous, current);
    expect(events.some(event => event.type === 'disconnect')).toBe(true);
    expect(events.some(event => event.type === 'connect')).toBe(true);
  });


describe('map mutation targets',()=>{
  it('targets only the changed map key',()=>{
    const previous=state({dataStructures:{freq:{$mapId:'map-1',entries:[{key:'a',value:1},{key:'b',value:2}]}}});
    const current=state({dataStructures:{freq:{$mapId:'map-1',entries:[{key:'a',value:1},{key:'b',value:3}]}}});
    const events=diffStates(previous,current);
    expect(events).toEqual([{type:'update',target:{structureId:'map-1',kind:'collection',field:'"b"'},from:2,to:3}]);
  });
});
