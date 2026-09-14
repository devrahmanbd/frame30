import {
  MAX_NODES_PER_TEMPLATE,
  MAX_TREE_DEPTH,
  catalogEntry,
  type Section,
} from "./builder-ast";

/**
 * Phase 0.5 — pure tree operations for the editor.
 *
 * Every function is immutable: it returns a new array and leaves the input
 * untouched, so the editor's undo/redo history keeps working by reference.
 * Drop legality (containers only, depth cap, node budget, no self-drop) lives
 * here rather than in the UI, so keyboard moves and pointer drags obey exactly
 * the same rules.
 */

export type NodeLocation = {
  node: Section;
  /** `null` when the node sits at the slot root. */
  parentId: string | null;
  /** Index inside its parent's child list (or the slot root). */
  index: number;
  /** 0 for slot-root nodes. */
  depth: number;
};

export type DropPosition = "before" | "after" | "inside";

export function isContainer(section: Section): boolean {
  return catalogEntry(section.type)?.container === true;
}

/** Every node with its parent, index and depth — the layer tree's data source. */
export function outline(sections: Section[]): NodeLocation[] {
  const out: NodeLocation[] = [];
  const walk = (nodes: Section[], parentId: string | null, depth: number) => {
    nodes.forEach((node, index) => {
      out.push({ node, parentId, index, depth });
      if (node.children?.length) walk(node.children, node.id, depth + 1);
    });
  };
  walk(sections, null, 0);
  return out;
}

export function locate(sections: Section[], id: string): NodeLocation | null {
  return outline(sections).find((entry) => entry.node.id === id) ?? null;
}

export function countNodes(sections: Section[]): number {
  return outline(sections).length;
}

/** Height of the subtree rooted at `node` (a leaf is 1). */
export function subtreeHeight(node: Section): number {
  if (!node.children?.length) return 1;
  return 1 + Math.max(...node.children.map(subtreeHeight));
}

export function descendantIds(node: Section): string[] {
  const out: string[] = [];
  const walk = (n: Section) => {
    for (const child of n.children ?? []) {
      out.push(child.id);
      walk(child);
    }
  };
  walk(node);
  return out;
}

/** Apply `fn` to every node in the tree, preserving structure. */
export function mapTree(sections: Section[], fn: (section: Section) => Section): Section[] {
  return sections.map((section) => {
    const next = fn(section);
    if (!next.children) return next;
    return { ...next, children: mapTree(next.children, fn) };
  });
}

/** Remove nodes by id (subtrees included) and hand back what was removed. */
export function removeNodes(
  sections: Section[],
  ids: readonly string[],
): { tree: Section[]; removed: Section[] } {
  const wanted = new Set(ids);
  const removed: Section[] = [];
  const strip = (nodes: Section[]): Section[] =>
    nodes.flatMap((node) => {
      if (wanted.has(node.id)) {
        removed.push(node);
        return [];
      }
      if (!node.children) return [node];
      return [{ ...node, children: strip(node.children) }];
    });
  return { tree: strip(sections), removed };
}

/** Insert nodes at a parent/index. A missing parent leaves the tree untouched. */
export function insertNodes(
  sections: Section[],
  parentId: string | null,
  index: number,
  nodes: Section[],
): Section[] {
  if (nodes.length === 0) return sections;
  if (parentId === null) {
    const at = clampIndex(index, sections.length);
    return [...sections.slice(0, at), ...nodes, ...sections.slice(at)];
  }
  let inserted = false;
  const walk = (list: Section[]): Section[] =>
    list.map((node) => {
      if (node.id === parentId && isContainer(node)) {
        inserted = true;
        const children = node.children ?? [];
        const at = clampIndex(index, children.length);
        return { ...node, children: [...children.slice(0, at), ...nodes, ...children.slice(at)] };
      }
      if (!node.children) return node;
      return { ...node, children: walk(node.children) };
    });
  const tree = walk(sections);
  return inserted ? tree : sections;
}

function clampIndex(index: number, length: number) {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.trunc(index), length);
}

/** Depth of a prospective parent (slot root = -1, so its children land at 0). */
function parentDepth(sections: Section[], parentId: string | null): number {
  if (parentId === null) return -1;
  return locate(sections, parentId)?.depth ?? -1;
}

export type DropCheck = { ok: true } | { ok: false; reason: string };

/**
 * Can `nodes` be dropped into `parentId`? Guards containers, the depth cap,
 * the per-template node budget and self/descendant drops.
 */
export function canDrop(
  sections: Section[],
  nodes: Section[],
  parentId: string | null,
  opts: { moving?: boolean } = {},
): DropCheck {
  if (parentId !== null) {
    const target = locate(sections, parentId);
    if (!target) return { ok: false, reason: "missing_parent" };
    if (!isContainer(target.node)) return { ok: false, reason: "not_a_container" };
    for (const node of nodes) {
      if (node.id === parentId) return { ok: false, reason: "self_drop" };
      if (descendantIds(node).includes(parentId)) return { ok: false, reason: "descendant_drop" };
    }
  }
  const base = parentDepth(sections, parentId) + 1;
  const deepest = Math.max(...nodes.map(subtreeHeight));
  if (base + deepest > MAX_TREE_DEPTH) return { ok: false, reason: "too_deep" };
  if (!opts.moving) {
    const added = nodes.reduce((sum, node) => sum + countNodes([node]), 0);
    if (countNodes(sections) + added > MAX_NODES_PER_TEMPLATE) {
      return { ok: false, reason: "too_many_nodes" };
    }
  }
  return { ok: true };
}

/**
 * Move a node relative to a reference node. `inside` targets a container,
 * `before`/`after` target the reference's own parent. Illegal moves are no-ops.
 */
export function moveRelative(
  sections: Section[],
  dragId: string,
  targetId: string | null,
  position: DropPosition,
): Section[] {
  const source = locate(sections, dragId);
  if (!source) return sections;
  if (targetId === null) {
    if (!canDrop(sections, [source.node], null, { moving: true }).ok) return sections;
    const { tree, removed } = removeNodes(sections, [dragId]);
    return insertNodes(tree, null, tree.length, removed);
  }
  if (targetId === dragId) return sections;
  const target = locate(sections, targetId);
  if (!target) return sections;
  if (descendantIds(source.node).includes(targetId)) return sections;

  const parentId = position === "inside" ? targetId : target.parentId;
  if (!canDrop(sections, [source.node], parentId, { moving: true }).ok) return sections;

  const { tree, removed } = removeNodes(sections, [dragId]);
  if (removed.length === 0) return sections;
  if (position === "inside") {
    const container = locate(tree, targetId);
    return insertNodes(tree, targetId, container?.node.children?.length ?? 0, removed);
  }
  const after = locate(tree, targetId);
  if (!after) return sections;
  return insertNodes(tree, after.parentId, after.index + (position === "after" ? 1 : 0), removed);
}

/** Nudge a node up or down inside its own parent — the keyboard reorder path. */
export function nudge(sections: Section[], id: string, delta: -1 | 1): Section[] {
  const found = locate(sections, id);
  if (!found) return sections;
  const siblings =
    found.parentId === null
      ? sections
      : (locate(sections, found.parentId)?.node.children ?? []);
  const next = found.index + delta;
  if (next < 0 || next >= siblings.length) return sections;
  const { tree, removed } = removeNodes(sections, [id]);
  return insertNodes(tree, found.parentId, next, removed);
}

let cloneCounter = 0;

/** Deep copy with fresh ids so a pasted subtree never collides. */
export function cloneNodes(nodes: Section[]): Section[] {
  const clone = (node: Section): Section => {
    cloneCounter += 1;
    const copy: Section = {
      ...node,
      id: `${node.type}-${Date.now().toString(36)}${cloneCounter.toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      props: { ...node.props },
    };
    if (node.bp) copy.bp = JSON.parse(JSON.stringify(node.bp)) as Section["bp"];
    if (node.hidden) copy.hidden = [...node.hidden];
    if (node.children) copy.children = node.children.map(clone);
    return copy;
  };
  return nodes.map(clone);
}

/**
 * Drop the descendants of any selected node so a multi-node operation never
 * moves or copies the same subtree twice.
 */
export function topMost(sections: Section[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const covered = new Set<string>();
  for (const id of ids) {
    const found = locate(sections, id);
    if (found) for (const child of descendantIds(found.node)) covered.add(child);
  }
  return outline(sections)
    .filter((entry) => wanted.has(entry.node.id) && !covered.has(entry.node.id))
    .map((entry) => entry.node.id);
}
