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


describe('exact graph traversal targeting',()=>{
  it('emits the traversed edge when a runtime node pointer advances',()=>{
    const before={sequence:0,depth:0,variables:{cur:{$objectId:'n1'}},arrays:{},dataStructures:{},objects:{},callStack:[]} as TraceState;
    const after={sequence:1,depth:0,variables:{cur:{$objectId:'n2'}},arrays:{},dataStructures:{},objects:{},callStack:[]} as TraceState;
    const events=semanticEventsBetween(before,after);
    expect(events.some(event=>event.type==='traverse'&&event.target.kind==='edge'&&event.target.structureId==='n1->n2')).toBe(true);
  });
});


describe('exact collection, map, and object reads', () => {
  it('targets the exact list index for get(i)', () => {
    const before = makeState({
      variables: { i: 1 },
      dataStructures: { list: { $collectionId: 'list-1', $kind: 'list', values: [10, 20, 30] } },
    });
    const after = makeState({
      sequence: 1,
      line: 3,
      variables: { i: 1 },
      dataStructures: { list: { $collectionId: 'list-1', $kind: 'list', values: [10, 20, 30] } },
    });
    const events = semanticEventsBetween(before, after, 'int x = list.get(i);');
    expect(events).toContainEqual({
      type: 'highlight',
      target: { structureId: 'list-1', kind: 'collection', index: 1 },
    });
  });

  it('targets the exact map key for get(key)', () => {
    const before = makeState({
      variables: { key: 'b' },
      dataStructures: { freq: { $mapId: 'map-1', entries: [{ key: 'a', value: 1 }, { key: 'b', value: 2 }] } },
    });
    const after = makeState({
      sequence: 1,
      line: 4,
      variables: { key: 'b' },
      dataStructures: { freq: { $mapId: 'map-1', entries: [{ key: 'a', value: 1 }, { key: 'b', value: 2 }] } },
    });
    const events = semanticEventsBetween(before, after, 'int x = freq.get(key);');
    expect(events).toContainEqual({
      type: 'highlight',
      target: { structureId: 'map-1', kind: 'collection', field: '"b"' },
    });
  });

  it('targets an exact object field read', () => {
    const before = makeState({
      variables: { cur: { $objectId: 'node-1' } },
    });
    const after = makeState({
      sequence: 1,
      line: 5,
      variables: { cur: { $objectId: 'node-1' } },
    });
    const events = semanticEventsBetween(before, after, 'Node next = cur.next;');
    expect(events).toContainEqual({
      type: 'highlight',
      target: { structureId: 'node-1', kind: 'node', objectId: 'node-1', field: 'next' },
    });
  });

  it('targets both matching collection values for contains(x)', () => {
    const before = makeState({
      variables: { x: 7 },
      dataStructures: { list: { $collectionId: 'list-1', $kind: 'list', values: [7, 2, 7] } },
    });
    const after = makeState({
      sequence: 1,
      line: 2,
      variables: { x: 7 },
      dataStructures: { list: { $collectionId: 'list-1', $kind: 'list', values: [7, 2, 7] } },
    });
    const events = semanticEventsBetween(before, after, 'list.contains(x);');
    const indexes = events
      .filter(event => event.type === 'highlight')
      .map(event => event.type === 'highlight' ? event.target.index : undefined)
      .filter((index): index is number => index !== undefined);
    expect(indexes).toEqual([0, 2]);
  });
});


describe('array alias targeting', () => {
  it('targets an aliased array variable', () => {
    const before = makeState({
      variables: {
        i: 2,
        row: { $arrayId: 'row-1', values: [4, 8, 15, 16] },
      },
    });
    const after = makeState({
      sequence: 1,
      line: 3,
      variables: {
        i: 2,
        row: { $arrayId: 'row-1', values: [4, 8, 15, 16] },
      },
    });
    const events = semanticEventsBetween(before, after, 'int x = row[i];');
    expect(events).toContainEqual({
      type: 'highlight',
      target: { structureId: 'row-1', kind: 'array', index: 2 },
    });
  });

  it('targets a matrix alias with both runtime indices', () => {
    const before = makeState({
      variables: {
        r: 1,
        c: 2,
        grid: { $arrayId: 'grid-1', values: [[1, 2, 3], [4, 5, 6]] },
      },
    });
    const after = makeState({
      sequence: 1,
      line: 4,
      variables: {
        r: 1,
        c: 2,
        grid: { $arrayId: 'grid-1', values: [[1, 2, 3], [4, 5, 6]] },
      },
    });
    const events = semanticEventsBetween(before, after, 'int x = grid[r][c];');
    expect(events).toContainEqual({
      type: 'highlight',
      target: { structureId: 'grid-1', kind: 'matrix', row: 1, column: 2 },
    });
  });
});
