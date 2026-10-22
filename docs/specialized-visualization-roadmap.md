# Specialized Data Structure Visualizations

Branch: `feat/specialized-tree-range-visualizations`
Base: `main`

This work extends the existing YourVision visualization system. Preserve the established dark theme, current node/cell/edge primitives, stable object identities, trace-authoritative state, step replay, and reduced-motion behavior. Do not replace the visualizer layout or introduce explanatory overlays as a substitute for showing actual state.

## Implementation checklist

### Specialized tree semantics
- [x] Red-black tree node color styling when the captured object explicitly exposes `color`, `isRed`, or `isBlack`.
- [x] Height-balanced tree candidate detection when captured nodes expose `height`, `bf`, or `balanceFactor`.
- [x] Reuse multi-key node cells for B-tree-shaped nodes.
- [x] Highlight trie terminal nodes only when a captured terminal flag is explicitly true.
- [ ] Add rotation/recolor transition cues only when trace snapshots establish the changed links or metadata.
- [ ] Add focused regression tests for tree rotations, root replacement, null children, and historical replay.

### Tree families to implement
- [ ] AVL trees: balance factors/heights and trace-backed rotations.
- [ ] Red-black trees: red/black properties, recoloring, rotations, root-black state when observed.
- [x] Treaps: identify explicit priority fields and expose priority metadata in the existing node theme.
- [ ] Treaps: trace-backed rotation/heap-order transitions.
- [ ] B-trees and B+ trees: multi-key nodes, child ranges, leaf distinction, split/merge transitions.
- [ ] Trie: insertion/search/prefix-search/deletion and pruning transitions, including empty keys and Unicode.
- [ ] Finish DSU/union-find: parent forest, path compression, union by rank/size, component changes.

### Range-query structures
- [x] Segment-tree node candidates: identify explicit interval bounds plus aggregate fields and style them in the existing tree renderer.
- [ ] Segment tree: dedicated range/query highlighting and trace-backed build/update/query transitions.
- [ ] Fenwick/Binary Indexed Tree: index coverage, update propagation, prefix/range-query traversal.
- [ ] Sparse table: range intervals and overlapping query blocks where a concrete implementation is recognized.

### Additional specialized structures
- [ ] Skip list: levels and forward pointers.
- [ ] Suffix array/tree: suffix/index labels and construction/search state where runtime snapshots support it.
- [ ] Sparse matrix: nonzero entries and row/column coordinates.
- [ ] Monotonic stack/queue: distinguish the actual stack/deque state and show trace-backed candidate removals; do not infer monotonic behavior from names alone.

## Acceptance criteria

1. Structure recognition is conservative and based on captured runtime fields/topology and source context; ambiguous objects retain the generic fallback.
2. Node/entry identity is stable across adjacent snapshots. Equal values do not collapse distinct objects.
3. Only observed mutations are animated. Reads highlight in place; updates, links, rotations, splits, merges, and removals must reflect actual snapshots.
4. Previous/Next renders the exact stored state, including references, cycles, aliases, nulls, and disconnected components where relevant.
5. Add focused tests for every new adapter/view and run the extension test suite, typecheck, production build, and backend regression suite before treating the work as verified.
6. Validate with representative real Java traces in addition to synthetic component tests.

## Current verification status

The first specialized tree styling slice, explicit trie-terminal highlighting, treap priority metadata, segment-tree candidate metadata, and focused component tests have been committed on the feature branch. Tests, typecheck, build, and real-trace checks have not yet been run for this branch.
