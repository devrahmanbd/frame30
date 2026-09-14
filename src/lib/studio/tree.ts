/**
 * Phase 14 — tree operations and drag/drop geometry.
 *
 * All functions are pure and return new trees, which keeps undo/redo honest
 * and lets the drop indicator be unit-tested without a DOM.
 */
import { isContainerNode, uid, type StudioNode } from "./model";

export type Path = number[];

export function findNode(nodes: StudioNode[], id: string): StudioNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.children ? findNode(node.children, id) : undefined;
    if (child) return child;
  }
  return undefined;
}

export function findPath(nodes: StudioNode[], id: string, prefix: Path = []): Path | undefined {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    const path = [...prefix, i];
    if (node.id === id) return path;
    if (node.children) {
      const nested = findPath(node.children, id, path);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function parentOf(nodes: StudioNode[], id: string): StudioNode | undefined {
  for (const node of nodes) {
    if (node.children?.some((child) => child.id === id)) return node;
    const nested = node.children ? parentOf(node.children, id) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

export function siblingsOf(nodes: StudioNode[], id: string): StudioNode[] {
  const parent = parentOf(nodes, id);
  return parent?.children ?? nodes;
}

function mapNodes(nodes: StudioNode[], fn: (node: StudioNode) => StudioNode | null): StudioNode[] {
  const out: StudioNode[] = [];
  for (const node of nodes) {
    const mapped = fn(node);
    if (!mapped) continue;
    out.push(mapped.children ? { ...mapped, children: mapNodes(mapped.children, fn) } : mapped);
  }
  return out;
}

export function updateNode(
  nodes: StudioNode[],
  id: string,
  patch: (node: StudioNode) => StudioNode,
): StudioNode[] {
  return mapNodes(nodes, (node) => (node.id === id ? patch(node) : node));
}

export function removeNode(nodes: StudioNode[], id: string): StudioNode[] {
  return mapNodes(nodes, (node) => (node.id === id ? null : node));
}

export function cloneNode(node: StudioNode): StudioNode {
  return {
    ...structuredClone(node),
    id: uid(),
    children: node.children?.map(cloneNode),
  };
}

/** Insert `node` inside `parentId` at `index`; a null parent means the root. */
export function insertNode(
  nodes: StudioNode[],
  parentId: string | null,
  index: number,
  node: StudioNode,
): StudioNode[] {
  if (parentId === null) {
    const next = [...nodes];
    next.splice(clampIndex(index, next.length), 0, node);
    return next;
  }
  return mapNodes(nodes, (candidate) => {
    if (candidate.id !== parentId) return candidate;
    const children = [...(candidate.children ?? [])];
    children.splice(clampIndex(index, children.length), 0, node);
    return { ...candidate, children };
  });
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.round(index), length);
}

export function duplicateNode(nodes: StudioNode[], id: string): StudioNode[] {
  const parent = parentOf(nodes, id);
  const list = parent?.children ?? nodes;
  const index = list.findIndex((node) => node.id === id);
  if (index < 0) return nodes;
  const copy = cloneNode(list[index]!);
  return insertNode(nodes, parent?.id ?? null, index + 1, copy);
}

/** True when `maybeAncestorId` contains `id` (or is `id`). */
export function containsNode(nodes: StudioNode[], maybeAncestorId: string, id: string): boolean {
  if (maybeAncestorId === id) return true;
  const ancestor = findNode(nodes, maybeAncestorId);
  if (!ancestor?.children) return false;
  return Boolean(findNode(ancestor.children, id));
}

export type DropPosition = "before" | "after" | "inside";

export type DropTarget = { id: string | null; position: DropPosition };

/** A move is illegal when it would place a node inside itself. */
export function canMove(nodes: StudioNode[], dragId: string, target: DropTarget): boolean {
  if (!target.id) return true;
  if (target.id === dragId) return false;
  if (containsNode(nodes, dragId, target.id)) return false;
  if (target.position === "inside") {
    const node = findNode(nodes, target.id);
    if (!node || !isContainerNode(node)) return false;
  }
  return true;
}

export function moveNode(nodes: StudioNode[], dragId: string, target: DropTarget): StudioNode[] {
  if (!canMove(nodes, dragId, target)) return nodes;
  const node = findNode(nodes, dragId);
  if (!node) return nodes;
  const detached = removeNode(nodes, dragId);
  return dropInto(detached, node, target);
}

export function dropInto(nodes: StudioNode[], node: StudioNode, target: DropTarget): StudioNode[] {
  if (!target.id) return insertNode(nodes, null, nodes.length, node);
  if (target.position === "inside") {
    const parent = findNode(nodes, target.id);
    return insertNode(nodes, target.id, parent?.children?.length ?? 0, node);
  }
  const parent = parentOf(nodes, target.id);
  const list = parent?.children ?? nodes;
  const index = list.findIndex((candidate) => candidate.id === target.id);
  if (index < 0) return insertNode(nodes, null, nodes.length, node);
  return insertNode(nodes, parent?.id ?? null, target.position === "before" ? index : index + 1, node);
}

/**
 * Where the 4px indicator goes for a pointer at `y` over a rect.
 * Containers accept an "inside" drop through the middle 40 % band.
 */
export function dropPositionFor(
  y: number,
  rect: { top: number; height: number },
  acceptsInside: boolean,
): DropPosition {
  const ratio = rect.height > 0 ? (y - rect.top) / rect.height : 0;
  if (!acceptsInside) return ratio < 0.5 ? "before" : "after";
  if (ratio < 0.3) return "before";
  if (ratio > 0.7) return "after";
  return "inside";
}

export function flatten(nodes: StudioNode[], depth = 0): { node: StudioNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...(node.children ? flatten(node.children, depth + 1) : []),
  ]);
}

/** Next/previous node id in document order — powers arrow-key selection. */
export function neighbourId(nodes: StudioNode[], id: string, direction: 1 | -1): string | undefined {
  const flat = flatten(nodes).map((entry) => entry.node.id);
  const index = flat.indexOf(id);
  if (index < 0) return flat[0];
  return flat[index + direction];
}
