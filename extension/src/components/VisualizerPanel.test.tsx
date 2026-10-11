import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { TraceState } from '../types/trace';
import { sessionStore } from '../state/store';
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
  DisjointSetView,
  GraphView,
  TrieView,
  TreeNodeView,
  LinkedListView,
  StringView,
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



describe('linked-list graph visualization', () => {
  it('preserves node identity, aliases, and explicit null termination', () => {
    const current = state({
      variables: { head: { $objectId: 'n1' }, curr: { $objectId: 'n2' }, prev: null },
      objects: {
        n1: { $objectId: 'n1', $type: 'ListNode', fields: { val: 10, next: { $ref: 'n2' } } },
        n2: { $objectId: 'n2', $type: 'ListNode', fields: { val: 20, next: null } },
      },
    });
    const html = renderToStaticMarkup(<LinkedListView root={{ $objectId: 'n1' }} objects={current.objects} variables={current.variables} />);
    expect(html).toContain('data-node-id="n1"');
    expect(html).toContain('data-node-id="n2"');
    expect(html).toContain('data-edge-kind="next"');
    expect(html).toContain('data-edge-kind="null"');
    expect(html).toContain('data-pointer-name="head"');
    expect(html).toContain('data-pointer-name="curr"');
    expect(html).toContain('prev = null');
    expect(html).toContain('data-next-target="n2"');
    expect(html).toContain('class="yv-node yv-linked-node');
    expect(html).toContain('class="yv-linked-node-next"');
    expect(html).toContain('class="yv-linked-next-port"');
    expect(html).toContain('data-edge-kind="next"');
    expect(html).not.toContain('>→</div>');
  });

  it('groups all runtime ListNode objects into one graph instead of duplicate per-node lists', () => {
    const current = state({
      variables: { head: { $objectId: 'n1' }, curr: { $objectId: 'n2' } },
      objects: {
        n1: { $objectId: 'n1', $type: 'ListNode', fields: { val: 10, next: { $ref: 'n2' } } },
        n2: { $objectId: 'n2', $type: 'ListNode', fields: { val: 20, next: null } },
      },
    });
    const html = renderToStaticMarkup(<DataStructures state={current} source="curr = curr.next;" />);
    expect(html).toContain('Linked List → head / curr');
    expect((html.match(/data-node-id="n1"/g) ?? []).length).toBe(1);
    expect((html.match(/data-node-id="n2"/g) ?? []).length).toBe(1);
  });

  it('keeps disconnected chains visible after a pointer rewrite disconnects them from head', () => {
    const current = state({
      variables: { head: { $objectId: 'n1' }, prev: { $objectId: 'n2' } },
      objects: {
        n1: { $objectId: 'n1', $type: 'ListNode', fields: { val: 10, next: null } },
        n2: { $objectId: 'n2', $type: 'ListNode', fields: { val: 20, next: { $ref: 'n3' } } },
        n3: { $objectId: 'n3', $type: 'ListNode', fields: { val: 30, next: null } },
      },
    });
    const html = renderToStaticMarkup(<LinkedListView root={{ $objectId: 'n1' }} objects={current.objects} variables={current.variables} />);
    expect(html).toContain('data-linked-component="0"');
    expect(html).toContain('data-linked-component="1"');
    expect(html).toContain('data-node-id="n1"');
    expect(html).toContain('data-node-id="n2"');
    expect(html).toContain('data-node-id="n3"');
    expect(html).toContain('data-edge-kind="null"');
  });

  it('renders a cycle as a reference back to an existing node instead of a fake node', () => {
    const current = state({
      variables: { head: { $objectId: 'n1' } },
      objects: {
        n1: { $objectId: 'n1', $type: 'ListNode', fields: { val: 1, next: { $ref: 'n2' } } },
        n2: { $objectId: 'n2', $type: 'ListNode', fields: { val: 2, next: { $ref: 'n1' } } },
      },
    });
    const html = renderToStaticMarkup(<LinkedListView root={{ $objectId: 'n1' }} objects={current.objects} variables={current.variables} />);
    expect(html).toContain('data-edge-kind="cycle"');
    expect(html).toContain('data-edge-to="n1"');
    expect(html).not.toContain('data-node-id="cycle"');
    expect((html.match(/class="yv-node-value"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });


  it('renders each linked-list reversal checkpoint from the actual next references', () => {
    const snapshots = [
      {
        label: 'initial',
        root: 'n1',
        variables: { head: { $objectId: 'n1' }, prev: null, curr: { $objectId: 'n1' }, nextTemp: null },
        next: { n1: 'n2', n2: 'n3', n3: null },
      },
      {
        label: 'first link reversed',
        root: 'n1',
        variables: { head: { $objectId: 'n1' }, prev: { $objectId: 'n1' }, curr: { $objectId: 'n2' }, nextTemp: { $objectId: 'n2' } },
        next: { n1: null, n2: 'n3', n3: null },
      },
      {
        label: 'second link reversed',
        root: 'n1',
        variables: { head: { $objectId: 'n1' }, prev: { $objectId: 'n2' }, curr: { $objectId: 'n3' }, nextTemp: { $objectId: 'n3' } },
        next: { n1: null, n2: 'n1', n3: null },
      },
      {
        label: 'reversed chain completed',
        root: 'n3',
        variables: { head: { $objectId: 'n3' }, prev: { $objectId: 'n3' }, curr: null, nextTemp: null },
        next: { n1: null, n2: 'n1', n3: 'n2' },
      },
    ] as const;

    for (const snapshot of snapshots) {
      const objects = Object.fromEntries(Object.entries(snapshot.next).map(([id, next]) => [
        id,
        { $objectId: id, $type: 'ListNode', fields: { val: Number(id.slice(1)), next: next ? { $ref: next } : null } },
      ]));
      const html = renderToStaticMarkup(
        <LinkedListView root={{ $objectId: snapshot.root }} objects={objects} variables={snapshot.variables} />,
      );

      // The graph must keep every allocated node visible, including the old
      // head after it becomes detached from the new head during reversal.
      for (const id of ['n1', 'n2', 'n3']) expect(html).toContain(`data-node-id="${id}"`);
      for (const [from, to] of Object.entries(snapshot.next)) {
        expect(html).toContain(`data-node-id="${from}"`);
        if (to) {
          expect(html).toContain(`data-next-target="${to}"`);
          expect(html).toContain(`data-edge-to="${to}"`);
        } else {
          expect(html).toContain(`data-next-target="null"`);
        }
      }
      expect(html).toContain('data-pointer-name="head"');
      for (const name of ['prev', 'curr']) {
        const pointerValue = snapshot.variables[name as 'prev' | 'curr'];
        if (pointerValue == null) expect(html).toContain(`${name} = null`);
        else expect(html).toContain(`data-pointer-name="${name}"`);
      }
    }
  });

  it('shows an empty list for a null head without inventing a node', () => {
    const current = state({
      variables: { head: null },
      objects: {},
    });
    const html = renderToStaticMarkup(<LinkedListView root={null} objects={current.objects} variables={current.variables} />);
    expect(html).toContain('empty list');
    expect(html).toContain('head = null');
    expect(html).not.toContain('data-node-id=');
  });
});

describe('binary-tree visualization', () => {
  it('labels left and right branches and keeps stable node ids', () => {
    const html = renderToStaticMarkup(<TreeNodeView
      value={{ $objectId: 't1' }}
      objects={{
        t1: { $objectId: 't1', $type: 'TreeNode', fields: { val: 1, left: { $ref: 't2' }, right: { $ref: 't3' } } },
        t2: { $objectId: 't2', $type: 'TreeNode', fields: { val: 2, left: null, right: null } },
        t3: { $objectId: 't3', $type: 'TreeNode', fields: { val: 3, left: null, right: null } },
      }}
    />);
    expect(html).toContain('data-tree-node-id="t1"');
    expect(html).toContain('data-tree-node-id="t2"');
    expect(html).toContain('data-tree-node-id="t3"');
    expect(html).toContain('data-tree-edge="left"');
    expect(html).toContain('data-tree-edge="right"');
    expect(html).toContain('LEFT');
    expect(html).toContain('RIGHT');
  });

  it('renders a cycle reference instead of recursing into a duplicate tree node', () => {
    const html = renderToStaticMarkup(<TreeNodeView
      value={{ $objectId: 'cycle-root' }}
      objects={{
        'cycle-root': { $objectId: 'cycle-root', $type: 'TreeNode', fields: { val: 7, left: { $ref: 'cycle-root' }, right: null } },
      }}
    />);
    expect(html).toContain('data-tree-cycle-to="cycle-root"');
    expect((html.match(/data-tree-node-id="cycle-root"/g) ?? []).length).toBe(1);
  });
});

describe('disjoint-set visualization', () => {
  it('renders the parent forest and highlights parent-array writes', () => {
    const current = state({
      arrays: {
        parent: { $arrayId: 'parent-array', $type: 'int[]', values: [0, 0, 2, 2, 0] },
        rank: { $arrayId: 'rank-array', $type: 'int[]', values: [1, 0, 1, 0, 0] },
      },
      lastEvent: {
        type: 'STEP',
        line: 8,
        data: {
          executionEvents: [{
            type: 'ARRAY_WRITE',
            data: { name: 'parent', changes: [{ indices: [4], before: 4, after: 0 }] },
          }],
        },
      },
    });
    const source = [
      'int find(int x) {',
      '  return parent[x] == x ? x : find(parent[x]);',
      '}',
      'void union(int a, int b) {',
      '  parent[find(a)] = find(b);',
      '}',
    ].join('\n');
    const html = renderToStaticMarkup(<DataStructures state={current} source={source} />);
    expect(html).toContain('Disjoint Set → parent');
    expect(html).toContain('data-dsu-node-count="5"');
    expect(html).toContain('data-dsu-node-index="0"');
    expect(html).toContain('data-dsu-node-index="4"');
    expect(html).toContain('data-dsu-parent="0"');
    expect(html).toContain('rank 1');
    expect(html).toContain('yv-dsu-changed');
  });

  it('renders the component safely for an empty parent forest', () => {
    const html = renderToStaticMarkup(<DisjointSetView parent={[]} name="parent" />);
    expect(html).toContain('data-dsu-node-count="0"');
    expect(html).toContain('0 roots');
  });
});

describe('trie data structure visualization', () => {
  it('renders child edges and terminal-word state from captured trie nodes', () => {
    const current = state({
      variables: { trie: { $objectId: 'container' } },
      objects: {
        container: { $objectId: 'container', $type: 'Trie', fields: { root: { $ref: 't1' } } },
        t1: {
          $objectId: 't1',
          $type: 'TrieNode',
          fields: { isEnd: false, children: { $mapId: 'children-1', $type: 'java.util.HashMap', entries: [{ key: 'a', value: { $ref: 't2' } }] } },
        },
        t2: {
          $objectId: 't2',
          $type: 'TrieNode',
          fields: { isEnd: true, children: { $mapId: 'children-2', $type: 'java.util.HashMap', entries: [] } },
        },
      },
    });
    const html = renderToStaticMarkup(<DataStructures state={current} source="" />);
    expect(html).toContain('Trie → trie');
    expect(html).toContain('data-trie-node-count="2"');
    expect(html).toContain('data-trie-node-id="t1"');
    expect(html).toContain('data-trie-node-id="t2"');
    expect(html).toContain('data-trie-edge-label="a"');
    expect(html).toContain('WORD END');
    expect(html).not.toContain('Object → trie');
  });
});

describe('graph data structure visualization', () => {
  it('renders actual adjacency links with stable node identities and pointer names', () => {
    const current = state({
      variables: { start: { $objectId: 'g1' } },
      objects: {
        g1: {
          $objectId: 'g1',
          $type: 'Node',
          fields: { val: 1, neighbors: { $collectionId: 'neighbors-1', $kind: 'list', values: [{ $ref: 'g2' }] } },
        },
        g2: {
          $objectId: 'g2',
          $type: 'Node',
          fields: { val: 2, neighbors: { $collectionId: 'neighbors-2', $kind: 'list', values: [{ $ref: 'g1' }] } },
        },
      },
    });
    const html = renderToStaticMarkup(<DataStructures state={current} source="" />);
    expect(html).toContain('Graph → start');
    expect(html).toContain('data-graph-node-count="2"');
    expect(html).toContain('data-graph-edge-count="2"');
    expect(html).toContain('data-graph-node-id="g1"');
    expect(html).toContain('data-graph-node-id="g2"');
    expect(html).toContain('data-graph-edge-from="g1" data-graph-edge-to="g2"');
    expect(html).toContain('data-graph-edge-from="g2" data-graph-edge-to="g1"');
    expect(html).toContain('start');
  });

  it('highlights graph nodes entered by a pointer moving on the current trace step', () => {
    const priorSession = sessionStore.get();
    const previous = state({
      sequence: 81,
      variables: { current: { $objectId: 'g1' } },
      objects: {
        g1: { $objectId: 'g1', $type: 'Node', fields: { val: 1, neighbors: { values: [{ $ref: 'g2' }] } } },
        g2: { $objectId: 'g2', $type: 'Node', fields: { val: 2, neighbors: { values: [{ $ref: 'g1' }] } } },
      },
    });
    const current = state({
      sequence: 82,
      variables: { current: { $objectId: 'g2' } },
      objects: {
        g1: { $objectId: 'g1', $type: 'Node', fields: { val: 1, neighbors: { values: [{ $ref: 'g2' }] } } },
        g2: { $objectId: 'g2', $type: 'Node', fields: { val: 2, neighbors: { values: [{ $ref: 'g1' }] } } },
      },
    });
    try {
      sessionStore.set({ source: 'current = current.neighbors.get(0);', states: [previous, current], index: 1 });
      const html = renderToStaticMarkup(<GraphView objects={current.objects} variables={current.variables} state={current} />);
      expect(html).toContain('data-graph-node-id="g2" data-graph-changed=');
      expect(html).toContain('data-graph-entered="true"');
      expect(html).toContain('yv-graph-node-entered');
      expect(html).not.toContain('data-graph-node-id="g1" data-graph-changed=');
    } finally {
      sessionStore.set(priorSession);
    }
  });

  it('handles a self-loop without duplicating the graph node', () => {
    const html = renderToStaticMarkup(<GraphView
      objects={{
        g1: { $objectId: 'g1', $type: 'Node', fields: { val: 4, neighbors: { values: [{ $ref: 'g1' }] } } },
      }}
      variables={{ node: { $objectId: 'g1' } }}
    />);
    expect(html).toContain('data-graph-node-count="1"');
    expect(html).toContain('data-graph-edge-count="1"');
    expect(html).toContain('data-graph-edge-from="g1" data-graph-edge-to="g1"');
    expect((html.match(/data-graph-node-id="g1"/g) ?? []).length).toBe(1);
  });
});

describe('string data structure visualization', () => {
  it('keeps strings in Variables and also renders them as indexed character cells', () => {
    const current = state({ variables: { s: '({[]})', count: 6 } });
    const html = renderToStaticMarkup(<DataStructures state={current} source="s.charAt(i)" />);
    expect(html).toContain('data-string-structure="s"');
    expect(html).toContain('data-string-index="0"');
    expect(html).toContain('data-string-index="5"');
    for (const character of '({[]})') expect(html).toContain(character);
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
    expect(html).toContain('class="yv-string-cell yv-cell-read " data-string-index="2"');
    expect(html).not.toContain('class="yv-string-cell yv-cell-read " data-string-index="1"');
  });
  it('surfaces string reads, ranges, search results, conversions, results, and mutations in execution effects', () => {
    const current = state({ lastEvent: { type: 'STEP', line: 5, data: { executionEvents: [
      { type: 'STRING_ACCESS', data: { name: 's', index: 2, value: 'n' } },
      { type: 'STRING_RANGE_ACCESS', data: { name: 's', start: 1, end: 4 } },
      { type: 'STRING_SEARCH_RESULT', data: { name: 's', operation: 'indexOf', result: 1 } },
      { type: 'STRING_SPLIT_RESULT', data: { name: 's', resultName: 'parts', partCount: 3 } },
      { type: 'STRING_CONVERSION_RESULT', data: { name: 's', operation: 'toCharArray', resultLength: 6 } },
      { type: 'STRING_RESULT', data: { resultName: 'upper', before: 'banana', after: 'BANANA' } },
      { type: 'STRING_MUTATION', data: { name: 'builder', operation: 'reverse', before: 'abc', after: 'cba' } },
    ] } } });
    const effects = eventEffects(current).map(effect => effect.text);
    expect(effects.some(text => text.includes('s[2]'))).toBe(true);
    expect(effects.some(text => text.includes('s[1:4)'))).toBe(true);
    expect(effects.some(text => text.includes('s.indexOf'))).toBe(true);
    expect(effects.some(text => text.includes('s.split → parts (3 parts)'))).toBe(true);
    expect(effects.some(text => text.includes('s.toCharArray → char[6]'))).toBe(true);
    expect(effects.some(text => text.includes('upper'))).toBe(true);
    expect(effects.some(text => text.includes('builder.reverse'))).toBe(true);
  });

  it('preserves Java UTF-16 indexing for supplementary Unicode characters', () => {
    const html = renderToStaticMarkup(<StringView value="😀" state={state()} name="s" />);
    expect(html).toContain('data-string-length="2"');
    expect(html).toContain('data-string-index="0"');
    expect(html).toContain('data-string-index="1"');
    expect(html).toContain('\\uD83D');
    expect(html).toContain('\\uDE00');
    expect(html).toContain('UTF-16 code unit U+D83D');
    expect(html).toContain('UTF-16 code unit U+DE00');
  });

  it('renders spaces as blank fixed-width cells and keeps every index in its own aligned wrapper', () => {
    const html = renderToStaticMarkup(<StringView value="a b  c" state={state()} name="s" />);
    expect(html).toContain('data-string-length="6"');
    expect(html).toContain('class="yv-string-cell-wrap"');
    expect(html).toContain('class="yv-string-index">0</div>');
    expect(html).toContain('class="yv-string-index">5</div>');
    expect(html).not.toContain('␠');
    expect(html).not.toContain('>sp<');
    expect((html.match(/class="yv-string-cell-wrap"/g) ?? []).length).toBe(6);
  });

  it('uses STRING_ACCESS to highlight the runtime character and display its pointer', () => {
    const current = state({
      line: 4,
      variables: { s: 'banana', i: 2 },
      lastEvent: { type: 'STEP', line: 4, data: { executionEvents: [
        { type: 'STRING_ACCESS', data: { name: 's', index: 2, value: 'n', kind: 'read', indexVariable: 'i' } },
      ] } },
    });
    const html = renderToStaticMarkup(<StringView value="banana" state={current} name="s" source={'char c = s.charAt(i);'} />);
    expect(html).toContain('class="yv-string-cell yv-cell-read " data-string-index="2"');
    expect(html).toContain('data-string-pointer="i"');
    expect(html).not.toContain('class="yv-string-cell yv-cell-read " data-string-index="1"');
  });
  it('keeps left and right string pointers visible on the loop-condition step', () => {
    const source = [
      'while (left < right) {',
      '  if (s.charAt(left) != s.charAt(right)) return false;',
      '}',
    ].join('\n');
    const current = state({ line: 1, variables: { s: 'radar', left: 0, right: 4 } });
    const html = renderToStaticMarkup(<StringView value="radar" state={current} name="s" source={source} />);
    expect(html).toContain('data-string-pointer="left"');
    expect(html).toContain('data-string-pointer="right"');
    expect(html).toContain('data-string-index="0"');
    expect(html).toContain('data-string-index="4"');
  });

  it('highlights half-open substring ranges and animates derived string results', () => {
    const rangeState = state({ lastEvent: { type: 'STEP', line: 4, data: { executionEvents: [
      { type: 'STRING_RANGE_ACCESS', data: { name: 's', start: 1, end: 4, operation: 'substring', kind: 'read' } },
    ] } } });
    const rangeHtml = renderToStaticMarkup(<StringView value="banana" state={rangeState} name="s" />);
    expect(rangeHtml).toContain('class="yv-string-cell yv-cell-range " data-string-index="1"');
    expect(rangeHtml).toContain('class="yv-string-cell yv-cell-range " data-string-index="3"');
    expect(rangeHtml).not.toContain('class="yv-string-cell yv-cell-range " data-string-index="4"');

    const resultState = state({ lastEvent: { type: 'STEP', line: 5, data: { executionEvents: [
      { type: 'STRING_RESULT', data: { resultName: 'upper', sourceName: 's', operation: 'toUpperCase', before: '', after: 'BANANA', kind: 'derived' } },
    ] } } });
    const resultHtml = renderToStaticMarkup(<StringView value="BANANA" state={resultState} name="upper" />);
    expect(resultHtml).toContain('toUpperCase · result');
    expect(resultHtml).toContain('yv-string-cell-added');
  });

  it('groups multiple string pointers on the same character without hiding either label', () => {
    const current = state({
      line: 1,
      variables: { s: 'radar', left: 2, right: 2 },
      lastEvent: { type: 'STEP', line: 1, data: { executionEvents: [
        { type: 'STRING_ACCESS', data: { name: 's', index: 2, value: 'd', kind: 'read', indexVariable: 'left' } },
        { type: 'STRING_ACCESS', data: { name: 's', index: 2, value: 'd', kind: 'read', indexVariable: 'right' } },
      ] } },
    });
    const html = renderToStaticMarkup(<StringView value="radar" state={current} name="s" source="if (s.charAt(left) == s.charAt(right)) return true;" />);
    expect(html).toContain('data-string-pointer-index="2"');
    expect(html).toContain('data-string-pointer="left"');
    expect(html).toContain('data-string-pointer="right"');
  });

  it('highlights all runtime-read characters participating in a character comparison', () => {
    const source = 'if (s.charAt(left) != s.charAt(right)) return false;';
    const current = state({
      line: 1,
      variables: { s: 'radar', left: 0, right: 4 },
      lastEvent: { type: 'STEP', line: 1, data: { executionEvents: [
        { type: 'STRING_ACCESS', data: { name: 's', index: 0, value: 'r', kind: 'read', indexVariable: 'left' } },
        { type: 'STRING_ACCESS', data: { name: 's', index: 4, value: 'r', kind: 'read', indexVariable: 'right' } },
      ] } },
    });
    const html = renderToStaticMarkup(<StringView value="radar" state={current} name="s" source={source} />);
    expect(html).toContain('yv-string-cell yv-cell-read yv-string-cell-compared');
    expect(html).toContain('data-string-index="0"');
    expect(html).toContain('data-string-index="4"');
    expect(html).toContain('data-string-pointer="left"');
    expect(html).toContain('data-string-pointer="right"');
  });

  it('links split results to the source and highlights only literal delimiter ranges', () => {
    const current = state({ lastEvent: { type: 'STEP', line: 5, data: { executionEvents: [
      { type: 'STRING_SPLIT_RESULT', data: {
        name: 's', resultName: 'parts', operation: 'split', delimiter: 'a', partCount: 3,
        delimiterRanges: [{ start: 1, end: 2 }, { start: 3, end: 4 }, { start: 5, end: 6 }],
      } },
    ] } } });
    const html = renderToStaticMarkup(<StringView value="banana" state={current} name="s" />);
    expect(html).toContain('split → 3 parts');
    expect(html).toContain('class="yv-string-cell yv-cell-range " data-string-index="1"');
    expect(html).toContain('class="yv-string-cell yv-cell-range " data-string-index="5"');
  });

  it('shows toCharArray conversion metadata while leaving the result array to the array visualizer', () => {
    const current = state({ lastEvent: { type: 'STEP', line: 5, data: { executionEvents: [
      { type: 'STRING_CONVERSION_RESULT', data: { name: 's', resultName: 'chars', operation: 'toCharArray', resultLength: 6 } },
    ] } } });
    const html = renderToStaticMarkup(<StringView value="banana" state={current} name="s" />);
    expect(html).toContain('toCharArray → 6 chars');
  });

  it('highlights the first differing character for failed equality comparisons', () => {
    const current = state({ lastEvent: { type: 'STEP', line: 5, data: { executionEvents: [
      { type: 'STRING_SEARCH_RESULT', data: {
        name: 's', operation: 'equals', query: 'baxana', index: 2, end: 3, matched: false, result: false,
      } },
    ] } } });
    const html = renderToStaticMarkup(<StringView value="banana" state={current} name="s" />);
    expect(html).toContain('class="yv-string-cell yv-string-cell-compared " data-string-index="2"');
    expect(html).not.toContain('yv-string-cell-compared " data-string-index="1"');
  });

  it('animates reverse as mirrored character swaps while preserving fixed cell positions', () => {
    const current = state({ lastEvent: { type: 'STEP', line: 5, data: { executionEvents: [
      { type: 'STRING_MUTATION', data: { name: 'builder', operation: 'reverse', before: 'abc', after: 'cba', kind: 'mutation' } },
    ] } } });
    const html = renderToStaticMarkup(<StringView value="cba" state={current} name="builder" />);
    expect(html).toContain('yv-string-cell-swap-right');
    expect(html).toContain('yv-string-cell-swap-left');
    expect(html).toContain('data-string-index="0"');
    expect(html).toContain('data-string-index="2"');
  });

  it('animates mutable string-sequence snapshots only when before and after differ', () => {
    const current = state({ lastEvent: { type: 'STEP', line: 6, data: { executionEvents: [
      { type: 'STRING_MUTATION', data: { name: 'builder', operation: 'reverse', before: 'abc', after: 'cba', kind: 'mutation' } },
    ] } } });
    const html = renderToStaticMarkup(<StringView value="cba" state={current} name="builder" />);
    expect(html).toContain('reverse · mutated');
    expect(html).toContain('yv-string-cell-changed');

    const backwards = renderToStaticMarkup(<StringView value="abc" state={current} name="builder" />);
    expect(backwards).toContain('reverse · mutated');
    expect(backwards).toContain('yv-string-cell-changed');
  });
  it('highlights only a confirmed search match range', () => {
    const current = state({ lastEvent: { type: 'STEP', line: 4, data: { executionEvents: [
      { type: 'STRING_SEARCH_RESULT', data: { name: 's', operation: 'indexOf', query: 'ana', index: 1, end: 4, matched: true, result: 1, kind: 'search' } },
    ] } } });
    const html = renderToStaticMarkup(<StringView value="banana" state={current} name="s" />);
    expect(html).toContain("indexOf → 1");
    expect(html).toContain('class="yv-string-cell yv-cell-range " data-string-index="1"');
    expect(html).toContain('class="yv-string-cell yv-cell-range " data-string-index="3"');
    expect(html).not.toContain('class="yv-string-cell yv-cell-range " data-string-index="4"');
  });
  it('shows an exclusive end pointer at length() for substring ranges', () => {
    const current = state({
      line: 1,
      variables: { s: 'banana', start: 3 },
      lastEvent: { type: 'STEP', line: 1, data: { executionEvents: [
        { type: 'STRING_RANGE_ACCESS', data: { name: 's', start: 3, end: 6, startVariable: 'start', endExpression: 's.length()', operation: 'substring', kind: 'read' } },
      ] } },
    });
    const html = renderToStaticMarkup(<StringView value="banana" state={current} name="s" source="String suffix = s.substring(start, s.length());" />);
    expect(html).toContain('data-string-pointer="start"');
    expect(html).toContain('data-string-pointer="end"');
    expect(html).toContain('yv-string-end-marker');
  });

  it('shows scalar string operation results without inventing character reads', () => {
    const current = state({ lastEvent: { type: 'STEP', line: 4, data: { executionEvents: [
      { type: 'STRING_SEARCH_RESULT', data: { name: 's', operation: 'length', index: -1, end: -1, matched: false, result: 6, kind: 'search' } },
    ] } } });
    const html = renderToStaticMarkup(<StringView value="banana" state={current} name="s" />);
    expect(html).toContain('length → 6');
    expect(html).not.toContain('yv-string-meta');
    expect(html).not.toContain('UTF-16 units');
    expect(html).not.toContain('yv-cell-range');
  });

  it('animates StringBuilder insertions and deletion ghosts without moving index labels', () => {
    const deletedState = state({ lastEvent: { type: 'STEP', line: 6, data: { executionEvents: [
      { type: 'STRING_MUTATION', data: { name: 'builder', operation: 'deleteCharAt', before: 'cba', after: 'ca', index: 1, removed: 'b', kind: 'mutation' } },
    ] } } });
    const deletedHtml = renderToStaticMarkup(<StringView value="ca" state={deletedState} name="builder" />);
    expect(deletedHtml).toContain('yv-string-removed-overlay');
    expect(deletedHtml).toContain('>b</div>');

    const insertedState = state({ lastEvent: { type: 'STEP', line: 7, data: { executionEvents: [
      { type: 'STRING_MUTATION', data: { name: 'builder', operation: 'insert', before: 'ca', after: 'cba', index: 1, inserted: 'b', kind: 'mutation' } },
    ] } } });
    const insertedHtml = renderToStaticMarkup(<StringView value="cba" state={insertedState} name="builder" />);
    expect(insertedHtml).toContain('yv-string-cell-added');
    expect(insertedHtml).toContain('data-string-index="1"');
  });

  it('renders StringBuilder snapshots as an indexed mutable character sequence', () => {
    const current = state({
      variables: { builder: { $objectId: '1', $type: 'java.lang.StringBuilder' } },
      objects: { '1': {
        $objectId: '1',
        $type: 'java.lang.StringBuilder',
        fields: {
          count: 3,
          coder: 0,
          value: { $arrayId: '2', $type: 'byte[]', values: [97, 98, 99] },
        },
      } },
    });
    const html = renderToStaticMarkup(<DataStructures state={current} source="builder.append('d')" />);
    expect(html).toContain('data-string-structure="builder"');
    expect(html).toContain('data-string-index="2"');
    expect(html).toContain('>a</div>');
    expect(html).toContain('>b</div>');
    expect(html).toContain('>c</div>');
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

  it('keeps an enhanced-for binding attached to the correct duplicate-valued array cell through body steps', () => {
    const previousSession = sessionStore.get();
    const source = 'for (int x : nums) {\n  consume(x);\n}';
    const checkpoint = (sequence: number, value: number, line: number) => state({
      sequence,
      line,
      variables: { x: value },
      lastEvent: { type: 'STEP', line, data: { executionEvents: [
        { type: 'VARIABLE_UPDATE', line: 1, data: { name: 'x', value } },
      ] } },
    });
    const states = [checkpoint(1, 7, 1), checkpoint(2, 7, 1), state({
      sequence: 3, line: 2, variables: { x: 7 }, lastEvent: { type: 'STEP', line: 2, data: {} },
    })];
    try {
      sessionStore.set({ source, states, index: 2 });
      const html = renderToStaticMarkup(<ArrayView value={[7, 7, 7]} state={states[2]} source={source} arrayName="nums" />);
      expect(html).toContain('data-enhanced-for-variable="x"');
      expect(html).toContain('data-enhanced-for-index="1"');
      expect(html).toContain('x</span><span class="yv-enhanced-for-equals">=</span><span class="yv-enhanced-for-value">7</span>');
    } finally {
      sessionStore.set(previousSession);
    }
  });

  it('renders an enhanced-for char binding above its string cell without creating a second string structure', () => {
    const previousSession = sessionStore.get();
    const source = 'for (char ch : s.toCharArray()) {\n  consume(ch);\n}';
    const checkpoint = (sequence: number, line: number, value: string) => state({
      sequence, line, variables: { ch: value, s: 'aaa' },
      lastEvent: { type: 'STEP', line, data: { executionEvents: [
        { type: 'VARIABLE_UPDATE', line: 1, data: { name: 'ch', value } },
      ] } },
    });
    const states = [checkpoint(1, 1, 'a'), checkpoint(2, 1, 'a'), state({
      sequence: 3, line: 2, variables: { ch: 'a', s: 'aaa' }, lastEvent: { type: 'STEP', line: 2, data: {} },
    })];
    try {
      sessionStore.set({ source, states, index: 2 });
      const html = renderToStaticMarkup(<DataStructures state={states[2]} source={source} />);
      expect(html).toContain('data-enhanced-for-variable="ch"');
      expect(html).toContain('data-enhanced-for-index="1"');
      expect(html).not.toContain('String → ch');
      expect(html).toContain('String → s');
    } finally {
      sessionStore.set(previousSession);
    }
  });

  it('shows structure type and variable name together for strings and char arrays', () => {
    const current = state({
      variables: { s: 'ab' },
      arrays: { S: ['a', 'b'] },
    });
    const html = renderToStaticMarkup(<DataStructures state={current} source="char[] S = s.toCharArray();" />);
    expect(html).toContain('String → s');
    expect(html).toContain('charArray → S');
    expect(html).not.toContain('yv-string-meta');
    expect(html).not.toContain('UTF-16 units');
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

  it('marks a newly inserted map entry from the captured MAP_WRITE delta', () => {
    const current = state({
      dataStructures: {
        lookup: {
          $mapId: 'map-motion',
          $type: 'java.util.HashMap',
          entries: [{ key: 'answer', value: 42 }],
          size: 1,
        },
      },
      lastEvent: {
        type: 'MAP_WRITE',
        data: {
          changes: [{ kind: 'insert', key: 'answer', after: 42 }],
        },
      },
    });
    const html = renderToStaticMarkup(<DataStructures state={current} source="lookup.put('answer', 42);" />);
    expect(html).toContain('class="yv-map-row yv-map-insert"');
    expect(html).toContain('NEW');
    expect(html).toContain('answer');
    expect(html).toContain('42');
  });

  it('classifies HashSet mutations by membership rather than snapshot iteration order', () => {
    const previous = state({
      dataStructures: {
        seen: { $collectionId: 'set-id', $type: 'java.util.HashSet', $kind: 'set', values: [1, 2], size: 2 },
      },
    });
    const current = state({
      dataStructures: {
        seen: { $collectionId: 'set-id', $type: 'java.util.HashSet', $kind: 'set', values: [2, 1, 3], size: 3 },
      },
    });
    const html = markup(dataStructureResults(current, previous, 'seen.add(3);'));
    expect(html).toContain('[Add]');
    expect(html).toContain('3');
    expect(html).not.toContain('[Set]');
  });

  it('animates a newly pushed stack item only when the prior snapshot proves an insertion', () => {
    const previousSession = sessionStore.get();
    const previous = state({
      sequence: 40,
      dataStructures: {
        stack: { $collectionId: 'stack-motion', $type: 'java.util.Stack', $kind: 'stack', values: [1, 2], size: 2 },
      },
    });
    const current = state({
      sequence: 41,
      dataStructures: {
        stack: { $collectionId: 'stack-motion', $type: 'java.util.Stack', $kind: 'stack', values: [1, 2, 3], size: 3 },
      },
    });
    try {
      sessionStore.set({ source: 'stack.push(3);', states: [previous, current], index: 1 });
      const html = renderToStaticMarkup(<DataStructures state={current} source="stack.push(3);" />);
      expect(html).toContain('class="yv-stack-cell yv-collection-item-enter"');
      expect((html.match(/yv-collection-item-enter/g) ?? []).length).toBe(1);
    } finally {
      sessionStore.set(previousSession);
    }
  });

  it('keeps a removed stack value visible as a trace-backed removal cue for the current step', () => {
    const previousSession = sessionStore.get();
    const previous = state({
      sequence: 70,
      dataStructures: {
        stack: { $collectionId: 'stack-remove', $type: 'java.util.Stack', $kind: 'stack', values: [1, 2, 3], size: 3 },
      },
    });
    const current = state({
      sequence: 71,
      dataStructures: {
        stack: { $collectionId: 'stack-remove', $type: 'java.util.Stack', $kind: 'stack', values: [1, 2], size: 2 },
      },
    });
    try {
      sessionStore.set({ source: 'stack.pop();', states: [previous, current], index: 1 });
      const html = renderToStaticMarkup(<DataStructures state={current} source="stack.pop();" />);
      expect(html).toContain('yv-collection-removals');
      expect(html).toContain('REMOVED');
      expect(html).toContain('>3</');
      expect(html).not.toContain('>3</div></div>');
    } finally {
      sessionStore.set(previousSession);
    }
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

  it('renders TreeSet as sorted and keeps its add/remove operations recognizable', () => {
    const current = state({
      dataStructures: {
        ordered: {
          $collectionId: 'tree-set-1',
          $type: 'java.util.TreeSet',
          $kind: 'sortedSet',
          values: [2, 5, 9],
          size: 3,
        },
      },
    });
    const html = renderToStaticMarkup(<DataStructures state={current} source="" />);
    expect(html).toContain('SORTED · 3 elements');
    expect(html).not.toContain('UNORDERED · 3 elements');
    expect(collectionOperation('sortedSet', 'add', { added: 7 })).toEqual({
      operation: 'Add', value: 7, position: 'Element',
    });
    expect(collectionOperation('sortedSet', 'remove', { removed: 5 })).toEqual({
      operation: 'Remove', value: 5, position: 'Element',
    });
  });

  it('does not assume a PriorityQueue uses a min-heap comparator', () => {
    const current = state({
      dataStructures: {
        pq: { $collectionId: 'pq-1', $type: 'java.util.PriorityQueue', $kind: 'priorityQueue', values: [9, 2, 5], size: 3 },
      },
    });
    const html = renderToStaticMarkup(<DataStructures state={current} source="" />);
    expect(html).toContain('HEAP · 3 items');
    expect(html).not.toContain('MIN-HEAP');
    expect(html).toContain('Heap tree · root is index 0');
  });

  it('distinguishes sorted and insertion-ordered collection labels', () => {
    const current = state({
      dataStructures: {
        sorted: { $collectionId: 'sorted', $type: 'java.util.TreeSet', $kind: 'sortedSet', values: [1, 2], size: 2 },
        insertion: { $collectionId: 'insertion', $type: 'java.util.LinkedHashSet', $kind: 'insertionOrderedSet', values: [8, 3], size: 2 },
        treeMap: { $mapId: 'tree-map', $type: 'java.util.TreeMap', entries: [{ key: 1, value: 'a' }, { key: 2, value: 'b' }] },
        linkedMap: { $mapId: 'linked-map', $type: 'java.util.LinkedHashMap', entries: [{ key: 2, value: 'b' }, { key: 1, value: 'a' }] },
      },
    });
    const html = renderToStaticMarkup(<DataStructures state={current} source="" />);
    expect(html).toContain('SORTED · 2 elements');
    expect(html).toContain('INSERTION ORDER · 2 elements');
    expect(html).toContain('SORTED BY KEY · 2 entries');
    expect(html).toContain('INSERTION ORDER · 2 entries');
    expect(collectionOperation('insertionOrderedSet', 'add', { added: 6 })).toEqual({
      operation: 'Add', value: 6, position: 'Element',
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
