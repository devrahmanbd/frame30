/**
 * Phase 1.5 — global (synced) blocks: the pure layer.
 *
 * A *placement* is an ordinary container node that carries two reserved props:
 *
 *   __gbId  — the global block it is linked to
 *   __gbRev — the revision it was linked at (staleness display only)
 *
 * The placement stores **no children of its own**. At render time
 * `resolveGlobalBlocks` grafts the block's nodes in, giving every grafted node
 * a deterministic id derived from the placement, so:
 *
 *  - editing the block updates every placement on the next resolve,
 *  - two placements of the same block never collide on node ids,
 *  - a placement can be *detached* into plain nodes with fresh ids.
 *
 * The resolver is defensive because block content is merchant data: it guards
 * against self-reference and mutual recursion (a block that places itself),
 * caps total grafted nodes, and reports missing/stale references so the studio
 * can show a real error instead of an empty box.
 */
import { MAX_NODES_PER_TEMPLATE, type Section } from "./builder-ast";

export const GB_ID_PROP = "__gbId";
export const GB_REV_PROP = "__gbRev";

/** Node type used when the studio creates a placement. */
export const GB_PLACEMENT_TYPE = "container" as const;

export type GlobalBlock = {
  id: string;
  name: string;
  nodes: Section[];
  revision: number;
  updatedAt: string;
};

export type ResolveReport = {
  /** placementId -> blockId, for every graft that happened. */
  resolved: Record<string, string>;
  /** Placements pointing at a block that no longer exists (or is not readable). */
  missing: string[];
  /** Placements whose recorded revision is behind the block's current one. */
  stale: string[];
  /** Placements skipped because grafting would recurse or blow the node cap. */
  skipped: string[];
};

export function linkedBlockId(node: Section): string | null {
  const value = node.props[GB_ID_PROP];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function linkedRevision(node: Section): number | null {
  const value = node.props[GB_REV_PROP];
  return typeof value === "number" ? value : null;
}

/** Turns a node into a placement: its own children are dropped. */
export function asPlacement(node: Section, block: Pick<GlobalBlock, "id" | "revision">): Section {
  const next: Section = {
    ...node,
    props: { ...node.props, [GB_ID_PROP]: block.id, [GB_REV_PROP]: block.revision },
  };
  delete next.children;
  return next;
}

/** Removes the link, leaving whatever nodes are passed as real children. */
export function detachPlacement(node: Section, children: Section[]): Section {
  const props = { ...node.props };
  delete props[GB_ID_PROP];
  delete props[GB_REV_PROP];
  return { ...node, props, children };
}

/** Every placement of `blockId` inside a tree, deepest-last. */
export function placementsOf(sections: Section[], blockId: string): string[] {
  const out: string[] = [];
  const walk = (nodes: Section[]) => {
    for (const node of nodes) {
      if (linkedBlockId(node) === blockId) out.push(node.id);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(sections);
  return out;
}

/** Count of placements per block id across every slot passed in. */
export function placementCounts(trees: Section[][]): Record<string, number> {
  const counts: Record<string, number> = {};
  const walk = (nodes: Section[]) => {
    for (const node of nodes) {
      const id = linkedBlockId(node);
      if (id) counts[id] = (counts[id] ?? 0) + 1;
      if (node.children?.length) walk(node.children);
    }
  };
  for (const tree of trees) walk(tree);
  return counts;
}

function graftIds(nodes: Section[], placementId: string, budget: { left: number }): Section[] {
  const out: Section[] = [];
  for (const node of nodes) {
    if (budget.left <= 0) break;
    budget.left -= 1;
    const copy: Section = { ...node, id: `${placementId}~${node.id}`, props: { ...node.props } };
    if (node.children?.length) copy.children = graftIds(node.children, placementId, budget);
    out.push(copy);
  }
  return out;
}

export type ResolveOptions = {
  /** Total grafted nodes allowed; defaults to the template node cap. */
  budget?: number;
};

/**
 * Replaces every placement's children with its block's content.
 * Pure: the input tree is never mutated.
 */
export function resolveGlobalBlocks(
  sections: Section[],
  blocks: readonly GlobalBlock[],
  options: ResolveOptions = {},
): { sections: Section[]; report: ResolveReport } {
  const index = new Map(blocks.map((block) => [block.id, block]));
  const report: ResolveReport = { resolved: {}, missing: [], stale: [], skipped: [] };
  const budget = { left: options.budget ?? MAX_NODES_PER_TEMPLATE };

  const walk = (nodes: Section[], ancestry: readonly string[]): Section[] =>
    nodes.map((node) => {
      const blockId = linkedBlockId(node);
      if (!blockId) {
        return node.children?.length ? { ...node, children: walk(node.children, ancestry) } : node;
      }
      const block = index.get(blockId);
      if (!block) {
        report.missing.push(node.id);
        return { ...node, children: [], invalid: "global_block.missing" };
      }
      if (ancestry.includes(blockId)) {
        // Self- or mutual reference: refuse rather than recurse.
        report.skipped.push(node.id);
        return { ...node, children: [], invalid: "global_block.recursive" };
      }
      if (budget.left <= 0) {
        report.skipped.push(node.id);
        return { ...node, children: [], invalid: "global_block.budget" };
      }
      const recorded = linkedRevision(node);
      if (recorded !== null && recorded < block.revision) report.stale.push(node.id);
      report.resolved[node.id] = blockId;
      const grafted = graftIds(block.nodes, node.id, budget);
      return {
        ...node,
        props: { ...node.props, [GB_REV_PROP]: block.revision },
        children: walk(grafted, [...ancestry, blockId]),
      };
    });

  return { sections: walk(sections, []), report };
}

/** True when a node id belongs to grafted (read-only) block content. */
export function isGraftedId(id: string): boolean {
  return id.includes("~");
}

/** Placement id that owns a grafted node id. */
export function placementOwnerOf(id: string): string | null {
  const index = id.indexOf("~");
  return index > 0 ? id.slice(0, index) : null;
}
