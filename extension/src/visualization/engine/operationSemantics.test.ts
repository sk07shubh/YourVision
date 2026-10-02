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


describe('exact runtime read targeting',()=>{
  it('highlights every array operand in a non-comparison read',()=>{
    const before=makeState({variables:{left:1,right:3},arrays:{nums:{$arrayId:'nums',values:[4,2,9,7]}}});
    const after=makeState({sequence:1,line:5,variables:{left:1,right:3},arrays:{nums:{$arrayId:'nums',values:[4,2,9,7]}}});
    const events=semanticEventsBetween(before,after,'int x = nums[left] + nums[right];');
    const highlights=events.filter(event=>event.type==='highlight');
    expect(highlights).toHaveLength(2);
    expect(highlights.map(event=>event.type==='highlight'?event.target.index:-1)).toEqual([1,3]);
  });
  it('targets a collection read instead of producing a generic step',()=>{
    const before=makeState({dataStructures:{q:{$collectionId:'queue-1',$kind:'queue',values:[4,5],size:2}}});
    const after=makeState({sequence:1,line:2,dataStructures:{q:{$collectionId:'queue-1',$kind:'queue',values:[4,5],size:2}}});
    const events=semanticEventsBetween(before,after,'int x = q.peek();');
    expect(events.some(event=>event.type==='highlight'&&event.target.structureId==='queue-1')).toBe(true);
  });
});
