# Specialized Data Structure Visualizations

Branch: `feat/specialized-tree-range-visualizations`
Base: `main`

This work extends the existing YourVision visualization system. Preserve the established dark theme, current node/cell/edge primitives, stable object identities, trace-authoritative state, step replay, and reduced-motion behavior. Do not replace the visualizer layout or introduce explanatory overlays as a substitute for showing actual state.

## Implementation checklist

### Specialized tree semantics
- [x] Red-black tree node color styling when the captured object explicitly exposes `color`, `isRed`, or `isBlack`.
- [x] Height-balanced tree candidate detection when captured nodes expose `height`, `bf`, or `balanceFactor`.
- [x] Reuse multi-key node cells for B-tree-shaped nodes.
- [x] Distinguish explicitly flagged multiway-tree leaves (e.g. B-tree/B+ tree leaf nodes).
- [x] Highlight trie terminal nodes only when a captured terminal flag is explicitly true.
- [x] Add conservative rotation/recolor transition cues only when adjacent snapshots establish the changed links, middle-subtree transfer, or explicit red/black metadata change.
- [x] Add focused regression tests for snapshot-backed left/right rotations, null middle-subtree handling, ordinary reparenting false-positive prevention, and red-black recoloring.
- [x] Add focused regression tests for root replacement after rotation and historical replay at the first captured snapshot.
- [x] Add snapshot-backed AVL left-right/right-left grouping with identity-checked transferred subtrees and false-positive regression coverage.\n- [ ] Validate double-rotation grouping against real AVL/red-black traces.

### Tree families to implement
- [x] AVL trees: conservative single- and double-rotation cues when adjacent snapshots prove topology changes.\n- [ ] AVL trees: richer balance-factor/height transition summaries and real-trace validation.
- [ ] Red-black trees: red/black properties, recoloring, rotations, root-black state when observed.
- [x] Treaps: identify explicit priority fields and expose priority metadata in the existing node theme.
- [ ] Treaps: trace-backed rotation/heap-order transitions.
- [x] B-tree-shaped nodes: multi-key cells and explicit leaf styling.
- [ ] B-trees and B+ trees: child-key range semantics, internal-vs-leaf behavior inference where reliable, split/merge transitions.
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

The first specialized tree styling slice now includes snapshot-backed single-rotation pivot/demotion cues and explicit red-black recolor cues, with focused regression cases for left/right and left-right/right-left rotations, null middle subtrees, root replacement, historical replay, false-positive prevention, and recoloring. The cues are deliberately conservative: single and double rotations are inferred only from adjacent snapshots with stable identities and matching subtree transfers. Full AVL/red-black operation animations and real-trace validation remain outstanding. Tests, typecheck, build, and real-trace checks have not yet been run for this branch.
