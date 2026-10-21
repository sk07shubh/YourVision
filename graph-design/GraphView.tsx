// REPLACES the block in VisualizerPanel.tsx from `export function GraphView(`
// up to (not including) `export function LinkedListView(`.
// Same props and same node-layout policy (existing vertices never move).
// Every behaviour below comes from captured snapshots only.
const GRAPH_R = 27;
const GRAPH_METADATA_FIELDS = ['visited', 'dist', 'distance', 'depth', 'level', 'color', 'state', 'status', 'weight', 'indegree', 'inDegree', 'component', 'low', 'disc', 'time', 'rank'];

export function GraphView({ objects, variables = {}, state }: {
  objects: Record<string, unknown>;
  variables?: Record<string, unknown>;
  state?: TraceState;
}) {
  const session = sessionStore.get();
  const selectedIndex = state ? session.states.indexOf(state) : -1;
  const previous = selectedIndex > 0 ? session.states[selectedIndex - 1] : undefined;
  const previousObjects = previous?.objects ?? {};
  const [hoverId, setHoverId] = useState<string | undefined>(undefined);
  const changedNodeIds = new Set<string>();
  const enteredNodeIds = new Set<string>();
  const createdNodeIds = new Set<string>();
  const previousLabels = new Map<string, unknown>();
  const changedMetadata = new Map<string, string[]>();
  const hasPair = Boolean(state && previous && session.states.includes(state));
  if (hasPair && previous) {
    for (const [key, value] of Object.entries(objects)) {
      if (!isPlainObject(value) || !looksGraphNode(value)) continue;
      const id = typeof value.$objectId === 'string' ? value.$objectId : key;
      const before = previousObjects[id];
      if (before === undefined) { createdNodeIds.add(id); continue; }
      if (stableStringify(before) === stableStringify(value)) continue;
      changedNodeIds.add(id);
      if (isPlainObject(before)) {
        const beforeFields = objectFields(before);
        const afterFields = objectFields(value);
        if (valueChanged(nodeValue(beforeFields), nodeValue(afterFields))) previousLabels.set(id, nodeValue(beforeFields));
        const names = GRAPH_METADATA_FIELDS.filter(name => name in afterFields && valueChanged(beforeFields[name], afterFields[name]));
        if (names.length) changedMetadata.set(id, names);
      }
    }
    for (const [name, value] of Object.entries(variables)) {
      const currentId = graphReferenceId(value, objects);
      const previousId = graphReferenceId(previous.variables[name], previousObjects);
      if (currentId && currentId !== previousId) enteredNodeIds.add(currentId);
    }
  }
  const nodes = Object.entries(objects).flatMap(([key, value]) => {
    if (!isPlainObject(value) || !looksGraphNode(value)) return [];
    const id = typeof value.$objectId === 'string' ? value.$objectId : key;
    return [{ id, value, label: nodeValue(value), neighbors: graphNeighborValues(value) ?? [] }];
  }).slice(0, 80);
  const ids = new Set(nodes.map(node => node.id));
  const positionSession = useRef(session.states[0]);
  const stableGraphPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  if (positionSession.current !== session.states[0]) {
    stableGraphPositions.current.clear();
    positionSession.current = session.states[0];
  }
  const stablePositions = stableGraphPositions.current;
  // Lay out the first observed snapshot once. Later vertices take an unused
  // slot; existing vertices never orbit/reflow merely because another is added.
  if (stablePositions.size === 0 && nodes.length) {
    nodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, nodes.length);
      stablePositions.set(node.id, {
        x: 300 + (nodes.length <= 1 ? 0 : 205 * Math.cos(angle)),
        y: 160 + (nodes.length <= 1 ? 0 : 112 * Math.sin(angle)),
      });
    });
  } else {
    const slots = Array.from({ length: 80 }, (_, index) => ({
      x: 30 + (index % 10) * 60,
      y: 20 + Math.floor(index / 10) * 40,
    }));
    for (const node of nodes) {
      if (stablePositions.has(node.id)) continue;
      let hash = 0;
      for (let index = 0; index < node.id.length; index++) hash = (hash * 31 + node.id.charCodeAt(index)) >>> 0;
      let chosen: { x: number; y: number } | undefined;
      let bestDistance = -1;
      for (let offset = 0; offset < slots.length; offset++) {
        const candidate = slots[(hash + offset) % slots.length]!;
        const minDistance = stablePositions.size
          ? Math.min(...[...stablePositions.values()].map(point => Math.hypot(point.x - candidate.x, point.y - candidate.y)))
          : Infinity;
        if (minDistance > bestDistance) {
          bestDistance = minDistance;
          chosen = candidate;
        }
        if (minDistance >= 50) break;
      }
      stablePositions.set(node.id, chosen ?? { x: 300, y: 160 });
    }
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const position = stablePositions.get(node.id);
    if (position) positions.set(node.id, position);
  }
  // Vertices that were captured last step and are gone now keep a fading ghost.
  const ghostNodes = hasPair ? Object.entries(previousObjects).flatMap(([key, value]) => {
    if (!isPlainObject(value) || !looksGraphNode(value)) return [];
    const id = typeof value.$objectId === 'string' ? value.$objectId : key;
    return ids.has(id) || !stablePositions.has(id) ? [] : [{ id, label: nodeValue(value) }];
  }).slice(0, 20) : [];
  const ghostIds = new Set(ghostNodes.map(node => node.id));
  for (const ghost of ghostNodes) positions.set(ghost.id, stablePositions.get(ghost.id)!);
  const traversedEdgePairs = new Set<string>();
  if (previous) {
    for (const [name, currentValue] of Object.entries(variables)) {
      const from = graphReferenceId(previous.variables[name], previousObjects);
      const to = graphReferenceId(currentValue, objects);
      if (from && to && from !== to) traversedEdgePairs.add(from + ':' + to);
    }
  }
  const trail = selectedIndex >= 0 ? graphVisitTrail(session.states, selectedIndex) : undefined;
  // Compare edge multiplicities, not just endpoint pairs. Adjacency lists can
  // contain parallel edges, so adding/removing one occurrence must not make all
  // edges between the same two nodes look unchanged.
  const edgePairKey = (from: string, to: string) => JSON.stringify([from, to]);
  const previousEdgeCounts = new Map<string, number>();
  const previousEdgeOccurrences: Array<{ key: string; from: string; to: string; occurrence: number }> = [];
  if (previous) {
    for (const [objectKey, value] of Object.entries(previousObjects)) {
      if (!isPlainObject(value) || !looksGraphNode(value)) continue;
      const from = typeof value.$objectId === 'string' ? value.$objectId : objectKey;
      if (!ids.has(from) && !ghostIds.has(from)) continue;
      (graphNeighborValues(value) ?? []).forEach((neighbor, index) => {
        const to = graphReferenceId(neighbor, previousObjects);
        if (!to || (!ids.has(to) && !ghostIds.has(to))) return;
        const pair = edgePairKey(from, to);
        const occurrence = previousEdgeCounts.get(pair) ?? 0;
        previousEdgeCounts.set(pair, occurrence + 1);
        previousEdgeOccurrences.push({ key: pair + ':' + index, from, to, occurrence });
      });
    }
  }
  type GraphEdge = { key: string; from: string; to: string; occurrence: number; status: 'steady' | 'added' | 'removed' | 'traversed' | 'trail' };
  const currentEdgeCounts = new Map<string, number>();
  const edges: GraphEdge[] = nodes.flatMap(node => node.neighbors.flatMap((neighbor, index) => {
    const target = graphReferenceId(neighbor, objects);
    if (!target || !ids.has(target)) return [];
    const pair = edgePairKey(node.id, target);
    const occurrence = currentEdgeCounts.get(pair) ?? 0;
    currentEdgeCounts.set(pair, occurrence + 1);
    const added = Boolean(previous && occurrence >= (previousEdgeCounts.get(pair) ?? 0));
    const status: GraphEdge['status'] = added ? 'added'
      : traversedEdgePairs.has(node.id + ':' + target) ? 'traversed'
        : trail?.hops.has(node.id + '>' + target) ? 'trail' : 'steady';
    return [{ key: pair + ':' + index, from: node.id, to: target, occurrence, status }];
  }));
  const removedCounts = new Map<string, number>();
  const removedEdges: GraphEdge[] = previousEdgeOccurrences.flatMap(edge => {
    const pair = edgePairKey(edge.from, edge.to);
    const occurrence = removedCounts.get(pair) ?? 0;
    removedCounts.set(pair, occurrence + 1);
    if (occurrence < (currentEdgeCounts.get(pair) ?? 0)) return [];
    return [{ key: 'removed:' + edge.key, from: edge.from, to: edge.to, occurrence: edge.occurrence, status: 'removed' as const }];
  });
  const allEdges = [...edges, ...removedEdges];
  const directed = new Set(allEdges.map(edge => edge.from + '>' + edge.to));
  const pointerNames = new Map<string, string[]>();
  for (const [name, value] of Object.entries(variables)) {
    const id = graphReferenceId(value, objects);
    if (!id || !ids.has(id)) continue;
    pointerNames.set(id, [...(pointerNames.get(id) ?? []), name]);
  }
  const neighborOfHover = new Set<string>();
  if (hoverId) for (const edge of allEdges) { if (edge.from === hoverId) neighborOfHover.add(edge.to); if (edge.to === hoverId) neighborOfHover.add(edge.from); }

  if (!nodes.length) return <div className="yv-empty">No graph nodes captured.</div>;

  return (
    <div className={'yv-graph' + (hoverId ? ' is-hovering' : '')} data-graph-node-count={nodes.length} data-graph-edge-count={edges.length}>
      <div className="yv-collection-meta">
        <span>Adjacency graph</span>
        <span>{nodes.length} nodes · {edges.length} links{nodes.length === 80 ? ' · display limit reached' : ''}</span>
      </div>
      <div className="yv-graph-scroll">
        <div className="yv-graph-canvas">
          <svg className="yv-graph-links" width="600" height="320" viewBox="0 0 600 320" aria-label="Graph links">
            <defs>
              {(['steady', 'added', 'removed', 'traversed', 'trail'] as const).map(status => (
                <marker key={status} id={'yv-graph-arrow-' + status} className={'yv-graph-arrow yv-graph-arrow-' + status} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" />
                </marker>
              ))}
            </defs>
            {allEdges.map(edge => {
              const from = positions.get(edge.from);
              const to = positions.get(edge.to);
              if (!from || !to) return null;
              const geometry = graphEdgeGeometry(from, to, edge.from === edge.to ? 0 : (directed.has(edge.to + '>' + edge.from) ? 15 : 0) + edge.occurrence * 17, edge.from === edge.to);
              const incident = hoverId !== undefined && (edge.from === hoverId || edge.to === hoverId);
              return <path key={edge.key + (edge.status !== 'steady' && edge.status !== 'trail' ? ':' + selectedIndex : '')}
                className={`yv-graph-edge yv-graph-edge-${edge.status}` + (incident ? ' is-incident' : '')}
                data-graph-edge-from={edge.from} data-graph-edge-to={edge.to} data-graph-edge-status={edge.status}
                d={geometry.d} fill="none" pathLength={1} markerEnd={`url(#yv-graph-arrow-${edge.status})`} />;
            })}
          </svg>
          {allEdges.filter(edge => edge.status === 'added' || edge.status === 'removed' || edge.status === 'traversed').map(edge => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const geometry = graphEdgeGeometry(from, to, edge.from === edge.to ? 0 : (directed.has(edge.to + '>' + edge.from) ? 15 : 0) + edge.occurrence * 17, edge.from === edge.to);
            return <span key={'badge:' + edge.key + ':' + selectedIndex} className={'yv-graph-edge-badge yv-tree-operation-badge is-' + edge.status} style={{ left: geometry.mx, top: geometry.my }}>{edge.status.toUpperCase()}</span>;
          })}
          {ghostNodes.map(ghost => {
            const point = positions.get(ghost.id)!;
            return <div key={'ghost:' + ghost.id + ':' + selectedIndex} className="yv-graph-node yv-graph-node-removed" data-graph-node-id={ghost.id} data-graph-removed="true"
              style={{ left: point.x - GRAPH_R, top: point.y - GRAPH_R }}>
              <span className="yv-graph-node-badges"><span className="yv-graph-node-badge is-removed yv-tree-operation-badge">NODE REMOVED</span></span>
              <span className="yv-graph-node-value">{compactValue(ghost.label)}</span>
              <span className="yv-graph-node-id">{ghost.id}</span>
            </div>;
          })}
          {nodes.map(node => {
            const point = positions.get(node.id)!;
            const pointers = pointerNames.get(node.id) ?? [];
            const changed = changedNodeIds.has(node.id);
            const entered = enteredNodeIds.has(node.id);
            const created = createdNodeIds.has(node.id);
            const previousLabel = previousLabels.get(node.id);
            const valueUpdated = previousLabels.has(node.id);
            const metadata = Object.entries(objectFields(node.value)).filter(([name, metadataValue]) =>
              GRAPH_METADATA_FIELDS.includes(name) && (typeof metadataValue === 'string' || typeof metadataValue === 'number' || typeof metadataValue === 'boolean'));
            const flashed = changedMetadata.get(node.id) ?? [];
            const orders = trail?.orders.get(node.id);
            const classes = 'yv-graph-node' + (changed ? ' yv-graph-node-changed' : '') + (entered ? ' yv-graph-node-entered' : '') + (created ? ' yv-graph-node-created' : '')
              + (valueUpdated ? ' yv-graph-node-value-changed' : '') + (pointers.length ? ' yv-graph-node-pointed' : '')
              + (hoverId === node.id ? ' is-hovered' : '') + (hoverId && neighborOfHover.has(node.id) ? ' is-neighbor' : '');
            return <div key={node.id + ((changed || entered || created) ? ':' + selectedIndex : '')} className={classes} tabIndex={0}
              data-graph-node-id={node.id} data-graph-changed={changed ? 'true' : undefined} data-graph-entered={entered ? 'true' : undefined}
              data-graph-created={created ? 'true' : undefined}
              aria-label={'Graph node ' + displayValue(node.label) + ', ' + node.neighbors.length + ' outgoing links' + (created ? ', created' : '') + (entered ? ', visited' : '')}
              style={{ left: point.x - GRAPH_R, top: point.y - GRAPH_R }}
              onMouseEnter={() => setHoverId(node.id)} onMouseLeave={() => setHoverId(undefined)}
              onFocus={() => setHoverId(node.id)} onBlur={() => setHoverId(undefined)}>
              {(created || valueUpdated || (changed && !valueUpdated) || entered) && <span className="yv-graph-node-badges">
                {created && <span className="yv-graph-node-badge is-created yv-tree-operation-badge">NODE CREATED</span>}
                {valueUpdated && <span className="yv-graph-node-badge is-changed yv-tree-operation-badge">{compactValue(previousLabel)} → {compactValue(node.label)}</span>}
                {changed && !valueUpdated && !created && <span className="yv-graph-node-badge is-changed yv-tree-operation-badge">NODE UPDATED</span>}
                {entered && <span className="yv-graph-node-badge is-current yv-tree-operation-badge">VISITED</span>}
              </span>}
              {pointers.length > 0 && <span className="yv-graph-node-flags">
                {pointers.map(name => <span className="yv-graph-node-flag" key={name} title={name + ' points to this vertex'}>{name}</span>)}
              </span>}
              <span className="yv-graph-node-value">{compactValue(node.label)}</span>
              {orders && orders.length > 0 && <span className="yv-graph-node-trail" title={'Visit order: ' + orders.join(', ')}>{orders.slice(-3).join('·')}</span>}
              <span className="yv-graph-node-id">{node.id}</span>
              {metadata.length > 0 && <span className="yv-graph-node-meta">
                {metadata.map(([name, metadataValue]) => <span key={name} className={'yv-graph-chip' + (flashed.includes(name) ? ' yv-graph-chip-changed' : '')}
                  data-meta-name={name} data-meta-value={String(metadataValue)}>{name}={displayValue(metadataValue)}</span>)}
              </span>}
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}

// Curved when a reverse edge or a parallel edge exists, so every arrow stays visible.
function graphEdgeGeometry(a: { x: number; y: number }, b: { x: number; y: number }, bend: number, loop: boolean) {
  if (loop) {
    return { d: `M ${a.x - 14} ${a.y - 23} C ${a.x - 44} ${a.y - 82}, ${a.x + 44} ${a.y - 82}, ${a.x + 14} ${a.y - 26}`, mx: a.x, my: a.y - 64 };
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const cx = (a.x + b.x) / 2 + (-dy / length) * bend * 2;
  const cy = (a.y + b.y) / 2 + (dx / length) * bend * 2;
  const sx = cx - a.x, sy = cy - a.y, sl = Math.max(1, Math.hypot(sx, sy));
  const ex = cx - b.x, ey = cy - b.y, el = Math.max(1, Math.hypot(ex, ey));
  const x1 = a.x + sx / sl * GRAPH_R, y1 = a.y + sy / sl * GRAPH_R;
  const x2 = b.x + ex / el * (GRAPH_R + 4), y2 = b.y + ey / el * (GRAPH_R + 4);
  return { d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, mx: 0.25 * x1 + 0.5 * cx + 0.25 * x2, my: 0.25 * y1 + 0.5 * cy + 0.25 * y2 };
}

// Real visit order: each time a captured variable starts pointing at a new vertex.
const graphTrailCache = new WeakMap<object, { index: number; value: { orders: Map<string, number[]>; hops: Set<string> } }>();
function graphVisitTrail(states: TraceState[], index: number) {
  const cached = graphTrailCache.get(states);
  if (cached && cached.index === index) return cached.value;
  const orders = new Map<string, number[]>();
  const hops = new Set<string>();
  let last: string | undefined;
  let count = 0;
  for (let i = 1; i <= index && i < states.length; i += 1) {
    const before = states[i - 1]!;
    const after = states[i]!;
    for (const [name, pointerValue] of Object.entries(after.variables ?? {})) {
      const target = graphReferenceId(pointerValue, after.objects ?? {});
      if (!target || target === graphReferenceId(before.variables?.[name], before.objects ?? {}) || target === last) continue;
      count += 1;
      const list = orders.get(target) ?? [];
      list.push(count);
      orders.set(target, list);
      if (last) hops.add(last + '>' + target);
      last = target;
    }
  }
  const value = { orders, hops };
  graphTrailCache.set(states, { index, value });
  return value;
}
