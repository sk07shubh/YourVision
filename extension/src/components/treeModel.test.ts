import { describe, expect, it } from 'vitest';
import { buildObjectStructureModel } from './treeModel';

describe('shared object structure model', () => {
  it('normalizes binary children into labelled child edges while preserving object IDs', () => {
    const objects = {
      root: { $objectId: 'root', $type: 'TreeNode', val: 10, left: { $ref: 'left' }, right: { $ref: 'right' } },
      left: { $objectId: 'left', $type: 'TreeNode', val: 5, left: null, right: null },
      right: { $objectId: 'right', $type: 'TreeNode', val: 15, left: null, right: null },
    };
    const model = buildObjectStructureModel({ $ref: 'root' }, objects);
    expect(model.kind).toBe('tree');
    expect(model.roots).toEqual(['root']);
    expect(model.nodes.map(node => node.id)).toEqual(['root', 'left', 'right']);
    expect(model.edges.filter(edge => edge.kind === 'child').map(edge => [edge.source, edge.target, edge.slot])).toEqual([
      ['root', 'left', 'left'],
      ['root', 'right', 'right'],
    ]);
  });

  it('supports arbitrary N-ary child collections and keeps slot labels', () => {
    const objects = {
      root: { $objectId: 'root', $type: 'Node', val: 'root', children: [{ $ref: 'a' }, { $ref: 'b' }, { $ref: 'c' }] },
      a: { $objectId: 'a', val: 'a' },
      b: { $objectId: 'b', val: 'b' },
      c: { $objectId: 'c', val: 'c' },
    };
    const model = buildObjectStructureModel({ $ref: 'root' }, objects);
    expect(model.kind).toBe('tree');
    expect(model.edges.filter(edge => edge.kind === 'child').map(edge => edge.label)).toEqual(['0', '1', '2']);
  });

  it('records parent/next/thread pointers as extra references, not child edges', () => {
    const objects = {
      root: { $objectId: 'root', val: 1, left: { $ref: 'child' }, parent: { $ref: 'outside' }, next: { $ref: 'child' } },
      child: { $objectId: 'child', val: 2 },
      outside: { $objectId: 'outside', val: 0 },
    };
    const model = buildObjectStructureModel({ $ref: 'root' }, objects);
    expect(model.kind).toBe('tree');
    expect(model.edges.filter(edge => edge.kind === 'child').map(edge => edge.target)).toEqual(['child']);
    expect(model.edges.filter(edge => edge.kind === 'reference').map(edge => edge.label)).toEqual(['parent', 'next']);
  });

  it('keeps cycles and shared child references as graph topology without duplicating nodes', () => {
    const objects = {
      a: { $objectId: 'a', val: 'a', left: { $ref: 'b' } },
      b: { $objectId: 'b', val: 'b', left: { $ref: 'a' }, right: { $ref: 'a' } },
    };
    const model = buildObjectStructureModel({ $ref: 'a' }, objects);
    expect(model.kind).toBe('graph');
    expect(model.nodes.map(node => node.id).sort()).toEqual(['a', 'b']);
    expect(model.edges.filter(edge => edge.kind === 'child')).toHaveLength(3);
  });
});
