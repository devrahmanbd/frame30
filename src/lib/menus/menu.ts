/**
 * Phase 16 — navigation menus, pure half.
 *
 * The screen edits a flat, ordered list with a `parentId`, exactly like
 * WordPress. Nesting, reordering, indenting and validation all happen here so
 * the UI can stay a thin renderer and the server can trust one shape.
 */

export type MenuItemKind = "page" | "post" | "collection" | "product" | "custom";

export type MenuItem = {
  id: string;
  parentId: string | null;
  position: number;
  kind: MenuItemKind;
  label: string;
  url: string;
  refId: string | null;
  titleAttr: string;
  newTab: boolean;
  cssClass: string;
};

export type MenuLocation = "header" | "footer" | "mobile";

export const MENU_LOCATIONS: { key: MenuLocation; label: string; hint: string }[] = [
  { key: "header", label: "Header menu", hint: "Shown in the storefront top bar." },
  { key: "footer", label: "Footer menu", hint: "Shown in the storefront footer columns." },
  { key: "mobile", label: "Mobile menu", hint: "Shown inside the mobile slide-out." },
];

export type NavMenu = {
  id: string;
  name: string;
  handle: string;
  locations: MenuLocation[];
  items: MenuItem[];
};

export const MAX_MENU_DEPTH = 3;

export const KIND_LABEL: Record<MenuItemKind, string> = {
  page: "Page",
  post: "Post",
  collection: "Collection",
  product: "Product",
  custom: "Custom link",
};

/* ------------------------------------------------------------------ handle */

export function menuHandle(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "menu"
  );
}

export function uniqueHandle(name: string, taken: Iterable<string>): string {
  const base = menuHandle(name);
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; i < 200; i += 1) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/* -------------------------------------------------------------- tree shape */

export type MenuNode = MenuItem & { depth: number; children: MenuNode[] };

/** Nested tree, sorted by position at every level. Orphans surface at root. */
export function buildTree(items: readonly MenuItem[]): MenuNode[] {
  const known = new Set(items.map((item) => item.id));
  const byParent = new Map<string | null, MenuItem[]>();
  for (const item of items) {
    const parent = item.parentId && known.has(item.parentId) ? item.parentId : null;
    const bucket = byParent.get(parent) ?? [];
    bucket.push(item);
    byParent.set(parent, bucket);
  }
  const walk = (parentId: string | null, depth: number, seen: Set<string>): MenuNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
      .filter((item) => !seen.has(item.id))
      .map((item) => {
        seen.add(item.id);
        return { ...item, depth, children: walk(item.id, depth + 1, seen) };
      });
  return walk(null, 0, new Set());
}

/** Depth-first order — what the editor list actually renders. */
export function flattenTree(nodes: readonly MenuNode[]): MenuNode[] {
  const out: MenuNode[] = [];
  const walk = (list: readonly MenuNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function flatten(items: readonly MenuItem[]): MenuNode[] {
  return flattenTree(buildTree(items));
}

export function depthOf(items: readonly MenuItem[], id: string): number {
  return flatten(items).find((node) => node.id === id)?.depth ?? 0;
}

export function subtreeIds(items: readonly MenuItem[], id: string): string[] {
  const nodes = flatten(items);
  const start = nodes.findIndex((node) => node.id === id);
  if (start < 0) return [];
  const base = nodes[start]!.depth;
  const ids = [id];
  for (let i = start + 1; i < nodes.length; i += 1) {
    if (nodes[i]!.depth <= base) break;
    ids.push(nodes[i]!.id);
  }
  return ids;
}

export function subtreeHeight(items: readonly MenuItem[], id: string): number {
  const nodes = flatten(items);
  const start = nodes.findIndex((node) => node.id === id);
  if (start < 0) return 0;
  const base = nodes[start]!.depth;
  let max = 0;
  for (let i = start + 1; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    if (node.depth <= base) break;
    max = Math.max(max, node.depth - base);
  }
  return max;
}

/* --------------------------------------------------------------- mutations */

/** Re-numbers `position` per parent so saved order is stable and gap-free. */
export function normalise(items: readonly MenuItem[]): MenuItem[] {
  const nodes = flatten(items);
  const counters = new Map<string | null, number>();
  return nodes.map((node) => {
    const parent = node.parentId;
    const next = counters.get(parent) ?? 0;
    counters.set(parent, next + 1);
    const { depth: _depth, children: _children, ...item } = node;
    return { ...item, position: next };
  });
}

export function addItem(items: readonly MenuItem[], item: MenuItem): MenuItem[] {
  const roots = items.filter((current) => current.parentId === null);
  const position = roots.reduce((max, current) => Math.max(max, current.position + 1), 0);
  return normalise([...items, { ...item, parentId: null, position }]);
}

export function updateItem(items: readonly MenuItem[], id: string, patch: Partial<MenuItem>): MenuItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item));
}

export function removeItem(items: readonly MenuItem[], id: string): MenuItem[] {
  const doomed = new Set(subtreeIds(items, id));
  return normalise(items.filter((item) => !doomed.has(item.id)));
}

/**
 * Indent = become a child of the previous sibling, the way dragging right
 * works in WordPress. Refused when there is no sibling above, or when the
 * subtree would exceed the maximum depth.
 */
export function canIndent(items: readonly MenuItem[], id: string): boolean {
  const nodes = flatten(items);
  const index = nodes.findIndex((node) => node.id === id);
  if (index <= 0) return false;
  const node = nodes[index]!;
  const previous = nodes[index - 1]!;
  const target = previous.depth >= node.depth ? node.depth + 1 : previous.depth + 1;
  if (target > node.depth + 1) return false;
  return target + subtreeHeight(items, id) <= MAX_MENU_DEPTH - 1;
}

export function indentItem(items: readonly MenuItem[], id: string): MenuItem[] {
  if (!canIndent(items, id)) return [...items];
  const nodes = flatten(items);
  const index = nodes.findIndex((node) => node.id === id);
  const node = nodes[index]!;
  // Walk back to the nearest node at the same depth — that is the sibling the
  // item slots under.
  let parentId: string | null = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (nodes[i]!.depth === node.depth) {
      parentId = nodes[i]!.id;
      break;
    }
    if (nodes[i]!.depth < node.depth) break;
  }
  if (!parentId) return [...items];
  return normalise(updateItem(items, id, { parentId, position: 999 }));
}

export function canOutdent(items: readonly MenuItem[], id: string): boolean {
  return depthOf(items, id) > 0;
}

export function outdentItem(items: readonly MenuItem[], id: string): MenuItem[] {
  const nodes = flatten(items);
  const node = nodes.find((current) => current.id === id);
  if (!node || node.parentId === null) return [...items];
  const parent = nodes.find((current) => current.id === node.parentId);
  return normalise(
    updateItem(items, id, { parentId: parent?.parentId ?? null, position: (parent?.position ?? 0) + 1 }),
  );
}

export type MenuDropPosition = "before" | "after" | "child";

/** Drag-and-drop move. Dropping an item into its own subtree is a no-op. */
export function moveItem(
  items: readonly MenuItem[],
  dragId: string,
  targetId: string,
  position: MenuDropPosition,
): MenuItem[] {
  if (dragId === targetId) return [...items];
  const doomed = new Set(subtreeIds(items, dragId));
  if (doomed.has(targetId)) return [...items];
  const nodes = flatten(items);
  const target = nodes.find((node) => node.id === targetId);
  const drag = nodes.find((node) => node.id === dragId);
  if (!target || !drag) return [...items];

  const parentId = position === "child" ? target.id : target.parentId;
  const depth = position === "child" ? target.depth + 1 : target.depth;
  if (depth + subtreeHeight(items, dragId) > MAX_MENU_DEPTH - 1) return [...items];

  const offset = position === "before" ? -0.5 : 0.5;
  const nextPosition = position === "child" ? 999 : target.position + offset;
  return normalise(updateItem(items, dragId, { parentId, position: nextPosition }));
}

export function moveVertical(items: readonly MenuItem[], id: string, step: 1 | -1): MenuItem[] {
  const siblings = flatten(items)
    .filter((node) => node.parentId === (items.find((item) => item.id === id)?.parentId ?? null))
    .sort((a, b) => a.position - b.position);
  const index = siblings.findIndex((node) => node.id === id);
  const swap = siblings[index + step];
  if (index < 0 || !swap) return [...items];
  const current = siblings[index]!;
  return normalise(
    updateItem(updateItem(items, id, { position: swap.position }), swap.id, {
      position: current.position,
    }),
  );
}

/* -------------------------------------------------------------- validation */

export type MenuIssue = { id: string; field: "label" | "url"; message: string };

export function validateMenu(items: readonly MenuItem[]): MenuIssue[] {
  const issues: MenuIssue[] = [];
  for (const item of items) {
    if (!item.label.trim()) issues.push({ id: item.id, field: "label", message: "Give this item a label." });
    const url = item.url.trim();
    if (!url) {
      issues.push({ id: item.id, field: "url", message: "Give this item an address." });
    } else if (!/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(url)) {
      issues.push({
        id: item.id,
        field: "url",
        message: "Use a full https address or one starting with /.",
      });
    }
  }
  return issues;
}

export function isMenuValid(items: readonly MenuItem[]): boolean {
  return validateMenu(items).length === 0;
}

/* ------------------------------------------------------------- add sources */

export type MenuSource = {
  id: string;
  kind: MenuItemKind;
  label: string;
  url: string;
  hint?: string;
};

export type SourceGroup = { kind: MenuItemKind; label: string; items: MenuSource[] };

export function searchSources(sources: readonly MenuSource[], query: string): MenuSource[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...sources];
  return sources.filter((source) => `${source.label} ${source.url}`.toLowerCase().includes(needle));
}

export function sourceToItem(source: MenuSource, id: string): MenuItem {
  return {
    id,
    parentId: null,
    position: 0,
    kind: source.kind,
    label: source.label,
    url: source.url,
    refId: source.kind === "custom" ? null : source.id,
    titleAttr: "",
    newTab: false,
    cssClass: "",
  };
}

export function locationsLabel(locations: readonly MenuLocation[]): string {
  if (locations.length === 0) return "Not displayed";
  return MENU_LOCATIONS.filter((entry) => locations.includes(entry.key))
    .map((entry) => entry.label.replace(" menu", ""))
    .join(", ");
}

export function toggleLocation(
  locations: readonly MenuLocation[],
  location: MenuLocation,
): MenuLocation[] {
  return locations.includes(location)
    ? locations.filter((entry) => entry !== location)
    : [...locations, location];
}

/** True when the on-screen list differs from what was loaded. */
export function menuDirty(saved: readonly MenuItem[], draft: readonly MenuItem[]): boolean {
  return JSON.stringify(normalise(saved)) !== JSON.stringify(normalise(draft));
}
