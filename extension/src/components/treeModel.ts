export type StructureEdgeKind = 'child' | 'reference';

export interface StructureNode {
  id: string;
  value: unknown;
  type?: string;
  fields: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface StructureEdge {
  id: string;
  source: string;
  target: string;
  kind: StructureEdgeKind;
  label?: string;
  slot?: number | string;
  metadata: Record<string, unknown>;
}

export interface StructureModel {
  kind: 'tree' | 'forest' | 'graph';
  roots: string[];
  nodes: StructureNode[];
  edges: StructureEdge[];
}

export interface ChildEdgeDescriptor {
  target: unknown;
  label?: string;
  slot?: number | string;
  metadata?: Record<string, unknown>;
}

export interface StructureModelOptions {
  /** Fields or custom semantics that define hierarchical child edges. */
  getChildren?: (value: Record<string, unknown>, fields: Record<string, unknown>) => ChildEdgeDescriptor[];
  /** Extra pointer fields captured as references, never used to expand the tree. */
  referenceFields?: string[];
  /** Safety cap for hostile, malformed, or unexpectedly large runtime snapshots. */
  maxNodes?: number;
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fieldsOf(value: RecordValue): RecordValue {
  return isRecord(value.fields) ? value.fields : value;
}

function identityOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.$objectId === 'string') return value.$objectId;
  if (typeof value.$ref === 'string') return value.$ref;
  return undefined;
}

function resolveObject(value: unknown, objects: Record<string, unknown>): RecordValue | undefined {
  if (!isRecord(value)) return undefined;
  const id = identityOf(value);
  const resolved = id ? objects[id] : value;
  return isRecord(resolved) ? resolved : undefined;
}

function defaultChildren(_value: RecordValue, fields: RecordValue): ChildEdgeDescriptor[] {
  const children: ChildEdgeDescriptor[] = [];
  for (const field of ['left', 'right']) {
    if (fields[field] == null) continue;
    const weight = fields[field + 'Weight'] ?? fields[field + 'EdgeWeight'];
    children.push({
      target: fields[field],
      label: field.toUpperCase(),
      slot: field,
      metadata: weight === undefined ? {} : { weight },
    });
  }

  if (Array.isArray(fields.children)) {
    fields.children.forEach((target, index) => {
      if (target == null) return;
      const weights = Array.isArray(fields.weights) ? fields.weights : undefined;
      children.push({
        target, label: String(index), slot: index,
        metadata: weights && weights[index] !== undefined ? { weight: weights[index] } : {},
      });
    });
  } else if (isRecord(fields.children)) {
    const childContainer = fields.children;
    if (Array.isArray(childContainer.values)) {
      childContainer.values.forEach((target, index) => {
        if (target != null) children.push({ target, label: String(index), slot: index });
      });
    } else if (Array.isArray(childContainer.entries)) {
      childContainer.entries.forEach((entry) => {
        if (!isRecord(entry) || entry.value == null) return;
        const label = String(entry.key);
        children.push({ target: entry.value, label, slot: label, metadata: entry.weight === undefined ? {} : { weight: entry.weight } });
      });
    } else {
      for (const [label, target] of Object.entries(childContainer)) {
        if (target != null) children.push({ target, label, slot: label });
      }
    }
  }
  return children;
}

function defaultValue(fields: RecordValue): unknown {
  return fields.val ?? fields.value ?? fields.data ?? fields.keys ?? fields.key ?? '?';
}

/**
 * Normalize captured object snapshots into a stable node/edge graph.
 *
 * Child edges describe layout/topology. Extra pointer fields are recorded as
 * reference edges only; they never silently become tree children. Object IDs
 * are preserved, and repeated references/cycles are represented by edges
 * rather than duplicated nodes.
 */
export function buildObjectStructureModel(
  root: unknown,
  objects: Record<string, unknown>,
  options: StructureModelOptions = {},
): StructureModel {
  const maxNodes = Math.max(1, options.maxNodes ?? 1000);
  const referenceFields = options.referenceFields ?? ['parent', 'next', 'prev', 'thread', 'random'];
  const getChildren = options.getChildren ?? defaultChildren;
  const nodes = new Map<string, StructureNode>();
  const edges = new Map<string, StructureEdge>();
  const expanded = new Set<string>();
  const active = new Set<string>();
  let anonymousSequence = 0;
  const anonymousIds = new WeakMap<object, string>();

  const ensureNode = (raw: unknown): StructureNode | undefined => {
    const value = resolveObject(raw, objects);
    if (!value) return undefined;
    const knownId = identityOf(value) ?? identityOf(raw);
    let anonymousId: string | undefined;
    if (!knownId) {
      anonymousId = anonymousIds.get(value);
      if (!anonymousId) {
        anonymousId = `anonymous:${anonymousSequence++}`;
        anonymousIds.set(value, anonymousId);
      }
    }
    const id = knownId ?? anonymousId!;
    const existing = nodes.get(id);
    if (existing) return existing;
    if (nodes.size >= maxNodes) return undefined;
    const fields = fieldsOf(value);
    const node: StructureNode = {
      id,
      value: defaultValue(fields),
      type: typeof value.$type === 'string' ? value.$type : undefined,
      fields,
      metadata: Object.fromEntries(Object.entries(fields).filter(([key]) =>
        !['left', 'right', 'children', ...referenceFields].includes(key)
      )),
    };
    nodes.set(id, node);
    return node;
  };

  const addEdge = (edge: StructureEdge) => {
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  };

  const expand = (raw: unknown) => {
    const node = ensureNode(raw);
    if (!node || expanded.has(node.id) || active.has(node.id)) return;
    expanded.add(node.id);
    active.add(node.id);
    const rawValue = resolveObject(raw, objects);
    if (!rawValue) { active.delete(node.id); return; }
    const fields = fieldsOf(rawValue);

    for (const [index, child] of getChildren(rawValue, fields).entries()) {
      const target = ensureNode(child.target);
      if (!target) continue;
      const edgeId = `child:${node.id}:${String(child.slot ?? child.label ?? index)}:${target.id}`;
      addEdge({
        id: edgeId,
        source: node.id,
        target: target.id,
        kind: 'child',
        ...(child.label !== undefined ? { label: child.label } : {}),
        ...(child.slot !== undefined ? { slot: child.slot } : {}),
        metadata: child.metadata ?? {},
      });
      expand(child.target);
    }

    for (const field of referenceFields) {
      const targetRaw = fields[field];
      if (targetRaw == null) continue;
      const targetId = identityOf(targetRaw);
      const resolvedTarget = targetId ? objects[targetId] : targetRaw;
      const target = ensureNode(resolvedTarget);
      if (!target) continue;
      addEdge({
        id: `reference:${node.id}:${field}:${target.id}`,
        source: node.id,
        target: target.id,
        kind: 'reference',
        label: field,
        metadata: {},
      });
    }
    active.delete(node.id);
  };

  const rootNode = ensureNode(root);
  if (rootNode) expand(root);
  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()];
  const childParentCounts = new Map<string, number>();
  for (const edge of edgeList) {
    if (edge.kind === 'child') childParentCounts.set(edge.target, (childParentCounts.get(edge.target) ?? 0) + 1);
  }
  const referenceTargets = new Set(edgeList.filter(edge => edge.kind === 'reference').map(edge => edge.target));
  const roots = nodeList.filter(node => !childParentCounts.has(node.id) &&
    (node.id === rootNode?.id || !referenceTargets.has(node.id))).map(node => node.id);
  const hasCycle = edgeList.some(edge => edge.kind === 'child' && (
    edge.source === edge.target || reaches(edge.target, edge.source, edgeList)
  ));
  const hasSharedChild = [...childParentCounts.values()].some(count => count > 1);
  // Extra pointer edges are metadata about the object graph; they do not
  // change the hierarchical layout into a graph layout by themselves.
  const kind = hasCycle || hasSharedChild
    ? 'graph'
    : roots.length > 1 ? 'forest' : 'tree';

  return {
    kind,
    roots: roots.length ? roots : rootNode ? [rootNode.id] : [],
    nodes: nodeList,
    edges: edgeList,
  };
}

function reaches(from: string, target: string, edges: StructureEdge[]): boolean {
  const pending = [from];
  const seen = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.kind === 'child' && edge.source === current && !seen.has(edge.target)) pending.push(edge.target);
    }
  }
  return false;
}


/** Adapt a heap's flat array representation to the shared node/edge contract. */
export function buildHeapStructureModel(values: unknown[]): StructureModel {
  const nodes: StructureNode[] = values.map((value, index) => ({
    id: `heap:${index}`,
    value,
    type: 'HeapNode',
    fields: { value, index },
    metadata: { index },
  }));
  const edges: StructureEdge[] = [];
  for (let parent = 0; parent < values.length; parent += 1) {
    for (const [slot, child] of [['left', parent * 2 + 1], ['right', parent * 2 + 2]] as const) {
      if (child >= values.length) continue;
      edges.push({
        id: `child:heap:${parent}:${slot}:heap:${child}`,
        source: `heap:${parent}`,
        target: `heap:${child}`,
        kind: 'child',
        label: slot.toUpperCase(),
        slot,
        metadata: { parentIndex: parent, childIndex: child },
      });
    }
  }
  return { kind: values.length ? 'tree' : 'forest', roots: values.length ? ['heap:0'] : [], nodes, edges };
}
