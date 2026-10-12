# YourVision — Remaining Data Structures Visualization Plan

> **Scope:** design and implement every remaining data-structure visualizer in one focused branch, using the existing Array and Linked List work as the interaction-quality baseline. This is a design contract, not permission to replace the current UI wholesale. Preserve the current split layout, sticky execution controls, editor-line highlighting, and the rule that the visual state—not a paragraph explaining the line—is the primary explanation.

## Branch and working rules

- Branch: `feat/all-remaining-ds-visualization`
- Base: current `main`
- Keep this work separate from the closed semantic-trace/AI PR #51. No AI integration, provider calls, credentials, or semantic-trace dependency belongs in this branch.
- Inspect current trace events and existing renderers before changing them. Prefer small, tested adapters and shared visual primitives over a large rewrite.
- Do not call a structure supported just because it can be serialized as an object. A renderer must identify the structure, show its shape, animate actual mutations, and pass behavior tests.
- Preserve current behavior for arrays and linked lists while extending the same principles to the remaining structures.
- Avoid fake events inferred only from variable names. Runtime-observed changes and before/after snapshots are authoritative; any heuristic must be conservative and have a safe generic fallback.

## 1. Product principles shared by every structure

### Visual language

1. **Stable identity:** each element/node/bucket has a stable identity across steps. Values can change without the visualizer pretending the element was deleted and recreated.
2. **One operation, one clear transition:** animate only the affected cells, edges, nodes, buckets, or frontier entries. Unchanged content should remain still.
3. **Highlight, do not relocate:** reads/accesses highlight the real element in place. Do not make array cells or nodes physically jump to a separate “accessed” row.
4. **Pointers are first-class:** references such as `head`, `tail`, `curr`, `prev`, `left`, `right`, `top`, `front`, and `rear` should appear as labelled pointer chips/arrows anchored to the target, not as fake data nodes. Show them only when the trace supports them.
5. **Actual state wins:** a null pointer points to a visible `null` endpoint; an absent child is not silently connected to another node; a failed lookup does not invent a value.
6. **Operation cues are compact:** use the current execution-effect area for concise facts (for example, `map.put(4, 9)`, `heap root changed`, `edge removed`). Do not add a second verbose explanation panel.
7. **Readable motion:** short transitions, reduced-motion support, no continuous bouncing, and no layout shifts in unrelated panels. If many items change, animate the meaningful region and summarize overflow rather than animating hundreds of elements.
8. **Responsive layouts:** horizontal structures may scroll horizontally; trees and graphs should fit their panel or provide controlled pan/zoom. Never shrink labels until unreadable.
9. **History correctness:** Prev/Next must render the exact stored snapshot for that step. Reverse animation is optional; reverse state reconstruction is mandatory.
10. **Identity vs equality:** two equal values can be distinct nodes/items. Never merge them solely because their values match.
11. **Aliasing:** two variables referencing one object should point to the same rendered object. Mutating it should update the shared object, not clone it per variable.
12. **Fallback:** unknown or ambiguous objects remain available in Variables / generic Object view. Do not misclassify them as a known structure.

### Per-step rendering contract

For each supported structure, the implementation should derive:

- a structure kind and stable structure identity;
- ordered items/nodes and their stable IDs;
- references/edges and relevant pointer variables;
- operation type (read, insert, update, delete, link/unlink, lookup, traversal, resize, etc.);
- affected identities/indices/keys/edges;
- before and after values/snapshots when available;
- operation result (found/not found, returned value, condition result) when runtime-observed;
- a confidence/ambiguity fallback for inferred structure shapes.

Use existing runtime events where they are accurate. If the current trace format cannot express a required operation, extend it narrowly and add regression tests. Do not make the frontend reverse-engineer every operation from display strings.

## 2. Structures in scope

Arrays and linked lists are the reference implementations and are **not** to be rewritten as part of this plan. The remaining coverage is grouped below. Some algorithms use a combination of these structures; visualize the underlying structure and its real operations rather than inventing a special “algorithm visualizer”.

---

## 3. Stack

### Shape
- Vertical stack of cards, bottom at the bottom and top at the top.
- Label the observed top pointer/index if available; show capacity only when the implementation exposes it.
- Do not show a fake top pointer if Java `Stack`, a custom stack, or a Deque-backed stack does not expose one in the trace.
- Empty stack has a clear empty state, not an invisible container.

### Operations and visual behavior
- **Create / initialize:** draw an empty container; initial values appear in their actual order, with the top item at the top.
- **push(x):** new card enters at the top; existing cards shift only enough to make room. Highlight the new card briefly.
- **peek():** highlight top card in place; show returned value in the execution effect. No structural movement.
- **pop():** highlight top, then remove it; remaining cards close the gap. Return value should be associated with the pop line.
- **empty / size:** no movement; show the observed boolean/count in the effect area.
- **replace/update top:** highlight only that card and transition old value to new value.
- **clear:** remove contents as one bounded transition; do not run a long cascade for large stacks.
- **underflow / exception:** preserve the last valid visual snapshot, surface the real error/exception state, and do not animate a nonexistent pop.
- **custom linked-node stack:** if the actual implementation mutates node links, prefer the real node/link topology over pretending it is an array-backed stack.

### Edge cases
Empty pop/peek; duplicate values; null values if legal; repeated push/pop; a stack that aliases an external node; large stack; mutation and return occurring on the same source line.

### Acceptance checks
Every push/pop changes exactly one logical item; peek does not mutate; Prev restores the removed item; duplicate values retain distinct identities; pointer labels follow actual nodes.

---

## 4. Queue and Deque

### Queue shape
- Show a horizontal lane in logical FIFO order: front on the left, rear on the right. If the implementation is circular-array-backed, render physical slots as a ring/slot strip and show front/rear indices separately from logical order.
- Distinguish logical order from backing-array indices; never imply a dequeue shifts every item if the implementation is a circular queue.

### Queue operations
- **offer/add/enqueue(x):** item enters at rear; highlight rear and show the real return/exception behavior for the API used.
- **peek/element:** highlight front; no movement.
- **poll/remove/dequeue:** highlight and remove front; update front marker. If circular, show slot advancement and wraparound.
- **empty/size:** no movement, show actual result.
- **wraparound:** animate index wrap from last slot to first without rearranging logical order.
- **resize (dynamic queue):** show capacity change as a discrete backing-storage event, preserving logical FIFO order. Do not animate a resize unless the trace supports it.
- **clear:** bounded transition to empty.
- **failed poll/remove:** respect API semantics: e.g. null result vs thrown exception, based on actual call.

### Deque operations
- **addFirst / offerFirst:** insert at front.
- **addLast / offerLast:** insert at rear.
- **removeFirst / pollFirst:** remove front.
- **removeLast / pollLast:** remove rear.
- **peekFirst / peekLast:** highlight corresponding endpoint without mutation.
- **push/pop aliases:** label the actual invoked operation, but visualize its equivalent end operation.
- **descending iteration:** indicate traversal direction; do not reverse the underlying deque.

### Edge cases
Empty/full bounded queues; capacity wrap; single element where front equals rear; duplicate values; both-end operations; null restrictions; PriorityQueue must not be rendered as FIFO.

### Acceptance checks
Front/rear are not confused with variables called `left`/`right`; circular slot and logical order remain consistent; failed operations leave state unchanged unless runtime says otherwise.

---

## 5. HashMap / Map

### Shape
- Render a key-value collection as stable entry cards or a bucket grid when bucket metadata is actually available.
- Each entry has distinct key and value regions. The visualizer must not pretend a HashMap is a sequential array or sorted list.
- Stable entry identity should be based on the trace's key/entry identity when available; key equality must follow the language/runtime semantics, not stringified display equality.
- Only display hash codes, bucket numbers, collisions, resizing, or rehash movement if the runtime exposes enough reliable information. Otherwise show the logical map and a subtle “bucket layout unavailable” fallback instead of inventing buckets.

### Operations
- **Create:** empty map shell; no fake entries.
- **put(k, v), insert:** add one entry, highlight key and value; existing entries remain stationary.
- **put existing key:** update only the value of that entry (old → new); do not show a duplicate key.
- **get(k):** highlight the matching entry and its returned value. If absent, highlight the lookup as not found without creating an entry.
- **containsKey / containsValue:** highlight a found entry if trace identifies it; otherwise show the observed boolean only. Do not claim a specific scan order for hash-based lookup.
- **remove(k):** highlight and remove the exact entry; preserve all others.
- **putIfAbsent / replace / compute / merge:** distinguish insert from value update and show only the runtime-observed final result. If callbacks or multi-write effects are present, replay the actual ordered writes.
- **clear:** remove entries as one bounded transition.
- **size / isEmpty:** no structural movement.
- **iteration / entrySet / keySet / values:** highlight entries in observed traversal order only when trace order is available; do not sort keys for aesthetics.
- **resize / rehash:** if observed, show capacity/bucket change as a separate operation; logical key-value mapping must stay the same.
- **null keys/values:** preserve language-specific rules (e.g. Java HashMap differs from ConcurrentHashMap).

### Edge cases
Different keys with equal display strings; null; overwrite; absent remove/get; collision; nested map; map values aliasing a node or collection; large maps; same-line multiple puts.

### Acceptance checks
Put on an existing key never creates a second entry; absent get never mutates; map values that reference nodes remain aliased; no fabricated bucket/hash detail; replay restores key/value pairs exactly.

---

## 6. HashSet / Set

### Shape
- Render distinct item chips in a collection area; use insertion/iteration order only if the concrete set implementation and runtime trace guarantee it.
- For HashSet, do not imply sorted or stable order. A stable visual arrangement may reduce layout jitter, but it must be clearly a presentation arrangement, not claimed as iteration order.

### Operations
- **add(x):** add a chip only if the runtime reports it was newly added; highlight an existing equal item if insertion is rejected as a duplicate.
- **contains(x):** highlight found item or show not-found result without mutation.
- **remove(x):** remove matching item if present; absent removal leaves the set unchanged.
- **size / isEmpty:** no movement.
- **clear:** bounded removal.
- **union / intersection / difference:** only render as operations on multiple sets when source code actually builds/updates those results. Show source sets and result set distinctly; do not mutate inputs unless they were mutated.
- **iteration:** preserve observed order where available; do not invent sorting.
- **backing HashMap:** hide implementation detail unless the user is explicitly examining that map or the trace makes the underlying map the actual named structure.

### Edge cases
Duplicate insert; equality/hash semantics; null support varies by implementation; equal but non-identical objects; set of node references; empty set; remove missing value.

### Acceptance checks
Duplicate add never increases cardinality; membership checks do not mutate; set rendering doesn't falsely claim order; equal values are not collapsed when the runtime treats them as unequal.

---

## 7. Heap / PriorityQueue

### Shape
- Primary view: a binary tree showing parent-child relationships.
- Optional synchronized array strip below it showing heap indices, but only when useful and kept visually secondary.
- Explicitly label **min-heap** or **max-heap** only when comparator/order semantics are known. Java PriorityQueue defaults to min-priority but custom comparators must not be guessed.
- A heap is not a fully sorted tree. Show the heap property, not a fake sorted order.

### Operations
- **Create:** empty heap; initial collection items are inserted in observed order only if trace exposes incremental insertion. Otherwise show the final valid heap without fabricating intermediate sift operations.
- **offer/add(x):** new node appears at the actual heap slot, then highlight each observed swap/parent-child move during sift-up. If intermediate swaps aren't traced, use a single transition from before to after and don't fabricate a swap path.
- **peek:** highlight root; no structural change.
- **poll/remove root:** highlight root as returned value; last heap item moves to root if supported by the snapshot, then show actual sift-down transitions when observed.
- **remove arbitrary item:** target the actual removed element; show replacement and sift direction only when trace proves it.
- **replace root / heapify:** show changed heap shape and order; don't assume incremental operations if runtime gives only a snapshot.
- **size / isEmpty / contains:** no movement except target highlight where found.
- **comparator changes / custom priority:** only claim priorities/comparisons when observed.
- **duplicate priorities:** keep elements distinct and show ties without forcing an unsupported tie order.

### Edge cases
Empty poll/peek; duplicates; comparator ties; custom comparator; arbitrary remove; heap with one element; resize; large heap.

### Acceptance checks
Root is always the actual next-priority element; tree and optional array views agree on indices; no invented swap animation; Prev restores exact heap order and item identities.

---

## 8. Trees: binary tree and binary search tree

### Shape
- Render actual node links as a tree with stable node identities, values inside nodes, and child edges labelled/positioned left and right only when the actual fields/links support that distinction.
- Preserve empty child slots enough to make structure understandable; do not draw an absent child as a real node.
- Pointer variables such as `root`, `curr`, `node`, `parent`, `successor` appear as external labelled pointers, not duplicated nodes.
- Avoid reflowing the entire tree for every value change. Keep unaffected subtrees as stable as possible.

### Core operations
- **Create/root assignment:** show the root pointer move to the existing node or new root. If a root variable changes but old nodes remain reachable elsewhere, don't delete those nodes.
- **Read node value:** highlight node; no topology change.
- **left/right traversal:** highlight the visited node and actual edge in execution order. The traversal path should follow observed node references, not guessed recursive order.
- **Insert BST:** highlight each observed comparison/current node, then add a leaf at the actual null child. Show comparison result only when runtime condition result exists. For duplicate values, follow actual implementation policy (ignore, count, left/right) rather than assuming one.
- **Search:** highlight path; found target remains highlighted; not-found terminates at the actual null branch.
- **Delete leaf:** remove node and edge.
- **Delete one-child node:** reconnect parent to child and animate only affected edge.
- **Delete two-child node:** highlight successor/predecessor and show the actual value-copy or node-relink operation used by code. Do not impose one textbook implementation.
- **Rotations (left/right):** show the exact changed edges and pivot; preserve node identities and values. A rotation is topology change, not node-value swap.
- **Traversal outputs (inorder/preorder/postorder/level-order):** highlight visit sequence and show emitted result as an array/list only if the program actually builds/returns it.
- **Height/depth/count/leaf test:** highlight the nodes actually read when trace permits; otherwise show the computed result without fabricated traversal steps.
- **Subtree replacement / root change:** keep external references and aliases accurate.

### Edge cases
Empty tree; one node; skewed tree; duplicate values; shared references/DAGs; cycles in malformed structures; null root; node object depth; value-copy deletion; left/right fields missing or named differently.

### Acceptance checks
No invented left/right when not grounded; rotations preserve identity; pointer variables target correct node; root updates are visible; all reachable nodes survive depth limits; traversal highlights follow real execution.

---

## 9. Trie / prefix tree

### Shape
- Prefix tree with character/token labels on edges or nodes, and an explicit terminal marker on nodes representing complete words.
- If implementation stores a `children` map/array, show logical child edges while keeping the underlying children container available through the generic view if necessary.
- Do not assume English lowercase alphabet or one character per edge. Use the actual key/token type; Unicode code points and compressed/radix edges need safe labels.

### Operations
- **Insert(word):** animate path token by token; existing prefix nodes highlight, newly created nodes/edges appear only when created. Mark terminal state at the final node.
- **Search(word):** highlight the traversed path; show success only if the path exists and terminal marker is true.
- **startsWith(prefix):** highlight prefix path; result depends on path existence, not terminal status.
- **Delete(word):** unmark terminal when longer words share the prefix; prune only nodes actually removed by implementation, from leaf upward.
- **Enumerate words:** highlight terminal nodes in observed output order if available; don't invent lexicographic ordering.
- **Count prefix/children:** highlight relevant node and show observed count.
- **Wildcard search:** only show branches the runtime actually visits; don't generate a fake search tree from the result alone.
- **Compressed trie/radix tree:** visualize edge-label split/merge only if implementation really mutates those labels.

### Edge cases
Empty string; duplicate insertion; one word prefix of another; shared prefixes; Unicode; deletion of missing word; root terminal; children stored in a map; compressed edges.

### Acceptance checks
Prefix existence and full-word membership are visually distinct; deleting a word preserves shared prefixes; only actual node creations/prunes animate.

---

## 10. Graphs

### Shape
- Render vertices as nodes and edges as explicit connections; support directed/undirected and weighted/unweighted edges only when known from the actual representation.
- Stable node placement across steps is crucial. Use deterministic layout for initial placement and preserve positions during ordinary traversal. Don't re-layout the whole graph every step.
- Adjacency-list/matrix representation and graph topology are related but distinct: expose the logical graph as the main view and optionally show the backing adjacency structure when it materially helps explain the code.
- Distinguish a graph node identity from its displayed label/value; duplicate labels are possible.

### Operations
- **Create vertex:** add node at a stable position; do not invent edges.
- **Add edge:** animate only that edge. Directed arrows and weights must reflect actual stored values.
- **Remove edge / vertex:** remove observed edge(s), and incident edges when the implementation does so.
- **Adjacency lookup / hasEdge:** highlight the queried endpoints and actual edge or absence; no mutation.
- **BFS:** highlight queue/frontier, current vertex, visited set, and newly discovered edge. The queue should correspond to the real queue variable if one exists; do not show a second fabricated queue.
- **DFS:** highlight the active path/stack/recursion frontier and visited vertices. Distinguish recursion stack from an explicit Stack object.
- **Connected components:** visually separate components only if the graph or algorithm result supports it.
- **Cycle detection:** highlight the actual back/cross edge or condition that proves a cycle when trace exposes it; do not mark arbitrary edges.
- **Shortest path (Dijkstra/Bellman-Ford/etc.):** display distance labels and predecessor edges only when the algorithm's variables/runtime state supports them. Highlight relaxations with old → new distance; don't label a path “shortest” before the algorithm's observed state warrants it.
- **Topological sort:** highlight indegree/frontier changes if those are the actual variables; output order should match observed result.
- **Union/merge or graph clone:** preserve node identity mapping and show cloned nodes separately; never conflate original and clone.
- **Adjacency matrix/list updates:** if those are the actual DS being manipulated, highlight the exact matrix cell or neighbor entry alongside the graph edge.

### Edge cases
Self-loops; parallel edges; disconnected graph; isolated vertices; directed/undirected; weighted edges; cycles; duplicate labels; vertex removal; large/dense graphs; graph represented by custom objects, maps, lists, or arrays.

### Acceptance checks
No invented edges; directed arrows correct; repeated values do not merge nodes; layout remains stable; traversal order comes from execution; matrix/list representation stays consistent with the logical graph.

---

## 11. Union-Find / Disjoint Set Union (DSU)

### Shape
- Show each element as a node with a parent arrow; distinguish representative/root from non-root nodes.
- Optional component colors are only visual grouping cues, not data values. Keep colors stable where possible and accessible without color alone.
- If the implementation uses parent/rank/size arrays, show a compact aligned row for those arrays, synchronized with the parent forest.

### Operations
- **Initialize:** every element is its own representative unless the code says otherwise.
- **find(x):** highlight the parent path followed by actual execution; show representative at the end.
- **Path compression:** animate each changed parent pointer individually or as a short grouped transition, only for links that actually changed.
- **union(a,b):** show both representatives; if already same, show no merge. Otherwise connect roots according to the actual union-by-rank/size rule and update rank/size values only when changed.
- **connected(a,b):** highlight both find paths and show the observed boolean result.
- **component size/count:** highlight affected root and observed size/count variable.
- **rollback/persistent DSU:** if present, show the actual restored parent/rank snapshot rather than assuming standard DSU semantics.

### Edge cases
Already-connected elements; path compression without union; union by rank/size ties; invalid indices; disconnected singleton sets; rollback variants.

### Acceptance checks
Parent arrows are acyclic for valid DSU; root changes match runtime; path compression only changes observed pointers; component count changes only on successful merges.

---

## 12. Strings and character sequences

Strings already have trace events for access, range access, search results, split, conversion, result, and mutation. The visualizer must treat a String/character sequence as a first-class structure in the Data Structures area when the trace reliably identifies it, instead of always leaving it buried in Variables. This does not mean pretending immutable Java strings mutate in place.

### Shape
- Show characters as indexed cells; include a compact index row. For long strings, window around affected indices and show an overflow/scroll affordance.
- Distinguish UTF-16 code-unit indexing (Java String semantics) from Unicode code points/grapheme clusters. The visualization must not silently claim a user-perceived character equals one Java index.
- Preserve the original string identity/value and show returned strings as separate values when operations create a new string.

### Operations
- **Read charAt / indexing:** highlight the indexed cell; no movement.
- **Substring / range:** highlight the exact half-open range and show the returned substring as a separate result, not as a deletion from the source.
- **equals / compare / startsWith / endsWith / contains / indexOf:** highlight compared/search range only when the trace gives exact positions; otherwise show the actual result without inventing a match path.
- **concat / +:** show the resulting string separately; highlight contributing operands if trace makes them known.
- **replace / replaceAll / replaceFirst:** show source and result separately, marking changed ranges only if exact positions are known.
- **split:** show source and result pieces in returned order; empty pieces must be preserved if Java returns them.
- **toCharArray:** show a new array result; do not change source string.
- **StringBuilder/StringBuffer append/insert/delete/replace/reverse:** because these are mutable, animate actual character changes and index shifts; show before/after state and preserve object identity when supported by trace.
- **parse/format conversions:** show the new value/type in result effects; don't fabricate per-character activity.
- **loop traversal:** highlight current character cell and index variable together.

### Edge cases
Empty string; empty substring; out-of-range exception; overlapping search; repeated characters; Unicode/surrogate pairs; split trailing-empty behavior; mutable builder vs immutable String; many concatenations.

### Acceptance checks
String is rendered in the structure section when correctly detected; immutable source never appears mutated; range boundaries match runtime; index semantics are documented; conversion creates a separate array/result.

---

## 13. Matrix / 2D arrays

### Shape
- Render as a grid with row and column indices, not as a flattened strip.
- Highlight a cell and row/column separately when source operations support that distinction.
- Preserve jagged rows: row lengths may differ. Never force a rectangular grid if actual arrays are jagged.
- Show traversal pointers such as `row`, `col`, `r`, `c` as pointer/index chips next to the grid. These are traversal variables, not outer algorithm boundaries unless the code says so.

### Operations
- **Read/write cell:** highlight exactly `matrix[r][c]`; writes transition old → new.
- **Row/column scan:** highlight each actual visited cell in trace order; don't infer a rectangular scan past a jagged row.
- **Swap rows/cells:** animate only the swapped elements; for a whole-row swap, preserve values and clearly indicate row identity/index changes.
- **Transpose/rotate:** highlight actual writes and show intermediate state only if trace has those steps; never replace observed in-place mutation with a magical final-only transformation.
- **Search/region algorithms:** show visited cells and observed condition outcomes, avoiding guessed flood-fill/BFS frontier.
- **Create/copy:** distinguish aliasing from deep copy. A copied matrix is separate; a reference assignment points to the same matrix.
- **Bounds/error:** preserve state on failed access and show real exception.

### Edge cases
Empty matrix; zero columns; jagged rows; aliasing rows; negative/out-of-range indices; same-line writes; large matrices.

### Acceptance checks
2D indices never flatten incorrectly; row/col pointers remain independent; jagged shape preserved; reference aliasing accurate; no fabricated cells visited.

---

## 14. Dynamic arrays and Java collections beyond the core types

### ArrayList / List
- Show logical indexed order as cells; distinguish logical size from backing capacity, which is usually unavailable.
- **add(index,x):** insert at index; animate shifted logical elements after the insertion point.
- **add(x):** append at end.
- **get(index):** highlight cell, no mutation.
- **set(index,x):** transition only the selected value.
- **remove(index/value):** remove the exact item and shift following logical items if that is the List semantics.
- **contains/indexOf:** highlight a found value/index only when the trace establishes it.
- **clear:** bounded clear.
- **subList:** show a view vs copy only if semantics/aliasing are known; Java subList is a view.
- **iterator/listIterator:** highlight cursor and actual traversal order; show mutation effects such as remove/set/add when performed.
- **capacity growth:** only show backing storage resize if runtime instrumentation captures it; never infer capacity from logical size.

### LinkedList as Java List/Deque
Use the linked-list topology when actual node links are available. If runtime exposes only collection values without node references, render a list lane and don't invent internal nodes. Deque operations use the Deque rules above.

### Vector / other List implementations
Use the List behavior contract, but do not claim internal array capacity/synchronization details unless the runtime provides them.

### Acceptance checks
Indexing, shifting, size, and order are correct; list and linked-node representations are not conflated; view/copy aliasing remains correct.

---

## 15. Other common collection families

### SortedMap / TreeMap
- Show logical key-value entries in the concrete implementation's observed sorted order when comparator/order semantics are known.
- If the actual tree nodes/links are available, optionally expose balanced-tree topology; otherwise keep it as an ordered map rather than fabricating red-black rotations.
- put/get/remove/contains/firstKey/lastKey/floor/ceiling/range views should highlight the actual key/result and affected entry range.
- Preserve comparator semantics; don't assume natural order with custom comparator.

### SortedSet / TreeSet
- Render unique values in observed comparator order; use ordered-set rules, not HashSet's unordered treatment.
- add duplicate/remove absent/contains/range queries should show actual membership and range.
- Do not invent balancing internals without node links or explicit rotation events.

### LinkedHashMap / LinkedHashSet
- Show insertion/access order only if the concrete implementation guarantees it and trace supports the relevant mode. Access-order LinkedHashMap may reorder on get; animate that only when it actually does.

### Multiset / frequency map / Counter
- Usually a Map from value to count: show count increments/decrements on the exact key. Do not present it as a Set if duplicates are represented by counts.

### Custom objects and pointer-rich structures
- A generic object graph should be available when fields reference other objects. Render references as edges when safe and useful; use object IDs to preserve aliases/cycles.
- Only promote an object to a specialized structure when its topology/fields and trace evidence match a supported detector. Otherwise keep the generic object inspector.
- Never duplicate shared subobjects as if each parent owned a separate copy.

---

## 16. Cross-cutting operation behaviors

Every structure renderer should explicitly cover the following event classes. This checklist applies even when a particular operation is uncommon.

| Event class | Visual response | Must not happen |
|---|---|---|
| Initialization | Create empty shell, then render actual initial state | Fake intermediate inserts when only final snapshot exists |
| Read/access | Highlight target in place | Move target into a separate row |
| Successful insert | Add the exact item/node/entry and animate affected neighborhood | Rebuild/reorder unrelated content |
| Duplicate insert | Highlight existing equal item or show rejected insertion | Add a duplicate to Set/Map key space |
| Update/overwrite | Show before → after at stable identity | Remove/recreate whole structure unnecessarily |
| Delete/remove | Highlight then remove exact target; repair only actual links/order | Delete a similar-valued but different identity |
| Lookup success | Highlight found target and actual result | Claim traversal details not in trace |
| Lookup failure | Show not found / observed result | Mutate structure or highlight a nonexistent item |
| Pointer/reference assignment | Move pointer label to target | Treat pointer variable as a new node |
| Link/edge change | Animate only affected connection(s) | Keep stale links or invent new links |
| Traversal | Highlight actual visit order/current item | Sort or reorder visits for visual neatness |
| Resize/rebalance | Show only when observed; preserve logical contents | Invent capacity, buckets, swaps, or rotations |
| Return value | Tie result to executed line and highlight the returned structure/item | Delay the effect to the next line |
| Exception/timeout | Freeze last valid state and show actual terminal status | Apply a speculative partial mutation |
| Aliasing | One shared object with multiple references | Duplicate shared object state |
| Null/empty | Explicit null/empty representation | Hide null or substitute zero/empty string |
| Multiple writes on one line | Replay observed event order or group exact changes compactly | Drop writes or apply them on a later line |

## 17. Implementation sequence

All structures are in the scope of this branch, but work should be delivered in dependency-aware slices so regression risk stays controlled:

1. **Audit and contract:** inventory current trace event payloads, structure detectors, snapshots, renderer branches, and tests. Write down gaps before coding.
2. **Shared rendering contract:** stable identity, operation normalization, exact snapshots, pointer overlays, accessible highlight tokens, motion preferences, and safe fallback.
3. **Collections:** Stack → Queue/Deque → HashMap/Map → HashSet/Set → ArrayList/List → PriorityQueue/Heap.
4. **Node topology:** binary tree/BST → Trie → DSU → generic graph. Reuse existing linked-list identity/edge principles where appropriate.
5. **Sequence views:** Strings/character sequences → Matrix/2D arrays → remaining ordered collection families and generic object graph.
6. **Regression pass:** run focused smoke tests after each slice, then typecheck, existing visualizer tests, Java state/trace tests, and full regression CI. Never declare CI green from typecheck alone.

The sequence is an implementation order, not a reason to leave a structure permanently unsupported. If a family cannot be truthfully visualized from current events, add the smallest required runtime event first.

## 18. Testing strategy

### Fixture matrix per structure
For each structure, create compact deterministic Java fixtures that exercise:
- creation and non-empty initial state;
- every core mutating operation;
- read-only access and lookup success/failure;
- duplicate values and distinct identities;
- empty/singleton cases;
- aliases and nested references;
- operation sequences on the same source line where Java permits them;
- exceptions/invalid indices;
- long structure/deep nesting;
- forward and backward step replay.

### Assertions
- Correct structure kind and data-structure panel placement.
- Correct identity/count/order/links after each step.
- Correct affected item highlight for reads and mutations.
- No changes to unrelated structures.
- Correct variable pointer targets and alias behavior.
- Execution effect appears on the same highlighted line that caused it.
- Prev/Next returns exact snapshots; end-of-program state remains visible.
- No regression in existing Array and Linked List visuals.
- Unknown shapes safely fall back to generic Variables/Object view.
- Tests assert actual node/entry/cell contents, not only that a panel exists.

### Commands and evidence
Read the current `backend/package.json` scripts and workflow files before choosing commands. Run the focused tests, typecheck, then full CI/regression suite. Report the exact commands and outcomes; don't describe unrun tests as passing.

## 19. Definition of done

- Each listed structure is detected only with sufficient runtime evidence and appears in the appropriate data-structure view.
- Every listed core operation has a defined and tested visual response.
- Visual state reflects runtime truth, not guessed algorithm semantics.
- Stable identities and aliasing are preserved.
- Current execution effects remain attached to the correct source line.
- Prev/Next, terminal snapshots, and errors behave correctly.
- Arrays and linked lists remain unchanged and their existing tests pass.
- No AI/API/semantic-trace integration is added as part of this branch.
- The implementation is reviewed and all relevant CI checks pass before a PR is opened or merged.


---

## Implementation progress — feature branch

This section records code that has been implemented after the design audit. It does not imply that CI has passed; the focused regression tests listed below must run before merging.

### Implemented slices

- **Ordered collections:** runtime snapshots distinguish TreeSet (sortedSet) and LinkedHashSet (insertionOrderedSet) from unordered HashSet. The visualizer labels sorted and insertion-ordered sets accurately.
- **Ordered maps:** TreeMap snapshots use the existing in-order tree traversal and the UI labels sorted-key order. LinkedHashMap snapshots now follow the linked entry chain (head / after) rather than hash-table bucket order, preserving its observable insertion order.
- **Priority queues:** the UI says HEAP, not MIN-HEAP, because the snapshot does not establish whether a custom comparator reverses priority. Heap and unordered-set deltas are computed independently of snapshot iteration order.
- **Adjacency graphs:** an initial graph view renders captured nodes with neighbors fields, their recorded references, cycles, self-links, and variable aliases. It caps rendering at 80 nodes.
- **Trie nodes:** an initial trie view renders captured child relationships, map-key or array-index edge labels, and common terminal flags (isEnd, isWord, endOfWord, isEndOfWord, terminal, isTerminal). Rendering is depth-bounded and node-bounded.
- **Binary trees:** left/right branch labels and stable node identities are visible; cyclic references render as references instead of repeated nodes.
- **Disjoint sets:** an initial parent-forest view is enabled only when the source contains conventional find/union and parent/parents/par array patterns. It displays parent relationships and highlights recorded parent-array writes. It supports self-parent roots and -1 root sentinels.

### Regression coverage added

- extension/src/components/VisualizerPanel.test.tsx: sorted/insertion-ordered collection labels, comparator-agnostic heap label, unordered-set membership deltas, graph cycles/self-loops, trie child edges and terminal nodes, disjoint-set forest rendering, and binary-tree branch/cycle handling.
- backend/scripts/smoke-java-data-structures.ts: TreeSet comparator order, LinkedHashSet insertion order, LinkedHashMap insertion order, TreeMap key order, and captured GraphNode/TrieNode snapshots.

### Remaining verification and scope

- Run the extension test suite, typecheck, and production build.
- Run the full backend regression suite, especially test:data-structures.
- Confirm graph/trie/DSU rendering against actual runtime traces from representative Java solutions; synthetic component tests alone are not sufficient.
- Expand structure-specific behavior only after inspecting the corresponding runtime snapshot/event shape. Keep arrays and linked lists as the established baseline and avoid problem-specific rules.


## Implementation log — collection insertion motion

- Added a trace-backed insertion entrance animation for stack, queue/deque, set, and priority-queue entries.
- The renderer compares the current collection snapshot with the immediately preceding captured snapshot for the same collection identity. It animates only occurrences newly present in that snapshot; it does not infer an insertion from a method name alone.
- Duplicate values are counted by occurrence, rather than collapsed into a set. The animation respects `prefers-reduced-motion`.
- Added a regression test for a stack push where the previous snapshot contains `[1, 2]` and the current snapshot contains `[1, 2, 3]`.
- **Verification status:** code and test are committed, but tests/typecheck/build have not yet been executed in this environment. This is one operation slice, not completion of collection animations or the full DS scope.


## Implementation log — trace-backed mutation and pointer transitions

- **Collection removals:** stack, queue/deque, set, and heap views compare adjacent snapshots of the same collection identity. Values absent from the current multiset are shown in a compact REMOVED cue; the live structure remains an exact rendering of the current snapshot. Duplicate occurrences are handled by counts, and the cue respects reduced-motion preferences.
- **Graph traversal/mutation cues:** nodes reached by a variable pointer movement are accented; changed node snapshots receive a separate highlight. Newly added edges use the accent color. Removed edges remain briefly visible as dashed transition cues when both endpoint nodes still exist in the current snapshot.
- **Trie traversal/mutation cues:** pointer arrivals and changed node snapshots are highlighted from adjacent trace states, without relying on method names.
- **Binary-tree traversal/mutation cues:** pointer arrivals and changed node snapshots are highlighted while retaining existing left/right labels and cycle guards.
- **Regression tests:** added stack removal, graph pointer movement, trie pointer movement, tree mutation/pointer movement, and graph edge-removal coverage.
- **Verification status:** CI is running for the latest feature-branch commit. Do not treat this slice as verified until the extension test/typecheck/build and full backend regression jobs complete successfully. Real trace checks remain required in addition to component-level synthetic tests.


## Implementation log — follow-up motion and mutation pass

- Collection insertions/removals now animate surviving stack, queue/deque, set, indexed-list, and heap items through layout changes. The implementation uses stable occurrence keys, cancels overlapping FLIP animations during rapid stepping, and honors reduced-motion preferences. Nested unnamed collections can animate because snapshot identity—not a variable label—selects the previous snapshot.
- Indexed list collections have a dedicated horizontal cell lane with aligned indices. Heap nodes participate in the same stable-position transition.
- Map writes to the same key within one trace step are coalesced into a single before-to-final-state cue. Deletions pulse the map in place rather than rendering a detached removed-entry row.
- String deletion no longer renders a detached removed-character overlay; surviving characters show the actual index shift. String pointers account for the enhanced-for card offset.
- Generic object fields animate only when an `OBJECT_FIELD_WRITE` change matches the exact object identity. Tree views show pointer labels and highlight child edges when a runtime-observed variable pointer moves into that child. Trie edge labels and graph edges similarly highlight pointer-observed traversal.
- Graph vertex positions persist across trace steps; adding a vertex does not cause existing vertices to be redistributed.
- **Verification status:** these follow-up edits have not been regression-tested or typechecked yet, per the requested plan to run one consolidated check after the implementation pass. Do not treat this log as a passing test report.


## Implementation log — endpoint and object-field cues

- Stack top replacement is distinguished from a new push when the captured stack length is unchanged and the top value changes; this is a bounded in-place cue, not a detached removal animation.
- Queue/deque endpoint changes are highlighted on the new front/rear cells when adjacent snapshots show a genuine endpoint identity change. Layout movement remains handled by stable-item FLIP transitions.
- Generic object fields now distinguish trace-snapshot-confirmed newly added fields from ordinary field writes. When an observed field write targets a field absent from the current object snapshot, the containing object receives a brief in-place removal cue; no removed-field card or overlay is fabricated.
- These additions remain unverified until the consolidated regression/typecheck/build pass at the end of the implementation priorities.

- Empty PriorityQueue and Map snapshots now show explicit empty-state content rather than a blank visual container. The map empty state spans both key/value columns.
- If a trace-confirmed object-field deletion removes the final field, the object now retains its in-place removal cue for that step and labels the resulting empty object; it no longer falls back to a plain code label that hides the mutation cue.
- PriorityQueue now draws parent-to-child connectors from measured node positions, so edges remain attached to the actual rendered nodes when values have different widths, the heap lane scrolls horizontally, or its container resizes. Heap ordering and array indices remain sourced from the captured heap snapshot.
- Graph adjacency deltas now compare edge occurrence counts per directed endpoint pair. Adding or removing one parallel edge highlights only that occurrence instead of treating all same-endpoint edges as unchanged; focused component regression cases cover both directions. These checks are added but intentionally not run until the consolidated verification pass.
- Binary-tree and trie renderers now retain an in-place edge-removal cue for the step that detaches a node's final child. Trie child-removal cues compare observed child-label/target occurrences, render the removed label without fabricating a live child node, and respect reduced-motion preferences. Focused component regression cases cover both final-child cases; tests remain deferred to the consolidated pass.
- Collection snapshots now mark the exact step when a non-empty stack, queue/deque, set, indexed list, or heap becomes empty. The empty-state surface gets a brief in-place mutation cue, with no detached removal box; reduced-motion preferences are respected. Added a focused stack-to-empty component regression case, pending the consolidated test run.
- Matrix rendering now distinguishes an empty two-dimensional array from an ordinary empty one-dimensional array when the source has an observed two-index access, and renders an explicit zero-row empty state instead of a blank grid. A focused component regression case is added; consolidated tests remain deferred.
- String range events now require valid integer UTF-16 half-open coordinates within the captured string before they can highlight cells or place pointer labels; malformed/out-of-range trace coordinates are ignored. A regression case covers invalid bounds. A string mutation that removes the final character also gets an in-place empty-state cue, respecting reduced-motion settings and without detached character overlays.


## Implementation log — matrix pointer and string-range edge cases

- Matrix row pointers now anchor to the rendered row fragment instead of assuming every row has a column-zero cell. This preserves row targeting for jagged matrices that contain empty rows.
- Matrix row/column pointer intersections are only rendered when the corresponding cell actually exists. A missing cell in a jagged row is not represented as a real intersection or access.
- String search-result ranges now require integer UTF-16 start/end offsets in addition to valid bounds, matching the strict range-access contract and ignoring malformed fractional coordinates.
- Added focused component tests for empty matrix rows and fractional string search ranges. As requested, tests/typecheck/build remain deferred to the consolidated verification pass.
