# Tree visualization: operations and visual semantics

YourVision's tree panel is snapshot-driven. It compares adjacent captured Java execution states and visualizes only changes supported by those snapshots. It must not invent algorithm-level operations that the trace did not capture.

## Implemented snapshot-level behaviours

| Behaviour detected | Evidence | Intended visual feedback |
| --- | --- | --- |
| Node creation | Object identity is absent from the previous snapshot and present in the current one | New node expands into view; NODE CREATED label; incoming connector draws in |
| Node value update | The same object identity has a different displayed node value | Previous value → current value is shown; orange value-change pulse |
| Other node update | The object snapshot differs, but the node value did not change | NODE UPDATED label and parent-node emphasis |
| Node visit / pointer movement | A variable reference points to a different captured object identity | VISITED label and traversal emphasis on the target and matching child connector |
| Child insertion / replacement | A current child target was not among the previous snapshot's child targets | ADDED edge label, child reveal, and connector draw-in |
| Child removal / replacement | A previous child field no longer points to its previous target | REMOVED edge/empty-slot feedback and parent emphasis |
| Metadata update | Captured scalar metadata changes (for example height, weight, color, balanceFactor, isWord) | The changed metadata chip is emphasized |
| Reference rewiring | Captured parent, next, prev, thread, or random target changes | Reference label is marked REWIRED and emphasized |
| Traversal to a reachable child | A variable's target identity changes to that child | Corresponding edge is emphasized as traversed |
| Null child | The captured child pointer is null | No fabricated node; an empty child slot is shown when the prior child was removed |
| Shared references and cycles | Stable object identities recur or child edges form a cycle/shared target | Preserve object identity and avoid representing the same object as a new object |
| Returned tree | A returned object is recognized as a tree root | Render the returned root and reachable captured structure |
| No observed change | Adjacent snapshots contain no supported tree delta | Keep the structure still; do not animate unrelated nodes |

## Algorithm-level behaviours to support only with reliable runtime evidence

These are common tree operations, but a generic object snapshot does not reliably prove which one happened. They should get explicit, named animations only after runtime instrumentation or a sufficiently unambiguous event exists.

- Search / contains / lookup: highlight each inspected node in actual visit order, then show found/not-found at the actual termination point.
- Insertion: show the search path, the insertion position, and the new node/link.
- Deletion: show the target, any successor/predecessor replacement when actually observed, and the removed link/node.
- BST minimum / maximum / successor / predecessor: trace the actual pointer path to the result.
- Traversals (preorder, inorder, postorder, level-order): reveal the actual visit sequence, not a guessed order.
- AVL / red-black balancing: animate rotations and recoloring only when the changed links/metadata or runtime trace establishes the exact operation and order.
- Heap insert / peek / extract / sift-up / sift-down: animate swaps and heap-property changes from the actual heap snapshots.
- Height, size, balance, rank, or subtree aggregates: emphasize the field only when the captured before/after values are available.
- Serialization / reconstruction / cloning: distinguish new identities from references to existing identities using runtime object IDs.

## Animation rules

1. Animation is explanatory, not decorative: it corresponds to a detected node, value, child-edge, reference, metadata, or traversal change.
2. Stable nodes should not pulse merely because a new execution checkpoint is selected.
3. Previous/current values and identities must come from captured snapshots.
4. If the trace cannot disambiguate an operation, show the observed state change without guessing an algorithm name.
5. Respect prefers-reduced-motion.
