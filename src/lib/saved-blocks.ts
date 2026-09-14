import type { Section } from "@/lib/builder-ast";
import { parseAst } from "@/lib/builder-ast";

/**
 * Phase 0.5 — saved blocks ("section presets").
 *
 * Reusable chunks of tree the merchant can drop into any template. They are
 * scoped per theme and stored on the merchant's own device, so a preset never
 * leaks between stores and never enters the published theme payload.
 */
export type SavedBlock = {
  id: string;
  name: string;
  createdAt: string;
  nodes: Section[];
};

const KEY = "framique.builder.blocks";
const MAX_BLOCKS = 50;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storeKey(themeId: string) {
  return `${KEY}.${themeId}`;
}

/** Round-trips nodes through the AST parser so a tampered store can't inject junk. */
export function sanitiseBlockNodes(nodes: unknown): Section[] {
  return parseAst({ header: [], main: nodes, footer: [] }).main;
}

export function listBlocks(themeId: string | null): SavedBlock[] {
  const store = storage();
  if (!store || !themeId) return [];
  try {
    const raw = JSON.parse(store.getItem(storeKey(themeId)) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const value = entry as Record<string, unknown>;
      const nodes = sanitiseBlockNodes(value["nodes"]);
      if (!nodes.length || typeof value["id"] !== "string") return [];
      return [
        {
          id: value["id"],
          name: typeof value["name"] === "string" ? value["name"].slice(0, 60) : "Block",
          createdAt: typeof value["createdAt"] === "string" ? value["createdAt"] : "",
          nodes,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function saveBlock(themeId: string | null, name: string, nodes: Section[]): SavedBlock[] {
  const store = storage();
  if (!store || !themeId || nodes.length === 0) return listBlocks(themeId);
  const block: SavedBlock = {
    id: `block-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 60) || "Block",
    createdAt: new Date().toISOString(),
    nodes: sanitiseBlockNodes(nodes),
  };
  const next = [block, ...listBlocks(themeId)].slice(0, MAX_BLOCKS);
  try {
    store.setItem(storeKey(themeId), JSON.stringify(next));
  } catch {
    /* quota or private mode — the preset simply is not persisted */
  }
  return next;
}

export function deleteBlock(themeId: string | null, id: string): SavedBlock[] {
  const store = storage();
  if (!store || !themeId) return [];
  const next = listBlocks(themeId).filter((block) => block.id !== id);
  try {
    store.setItem(storeKey(themeId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/* --------------------------------------------- Phase 3.3: JSON portability */

/** Envelope version: bump only if the node shape stops round-tripping. */
export const BLOCK_EXPORT_VERSION = 1;

export type BlockEnvelope = {
  v: number;
  theme: string | null;
  exportedAt: string;
  blocks: { name: string; nodes: Section[] }[];
};

/** Serialises a whole library (or a single section) for download / paste. */
export function exportBlocks(themeId: string | null, blocks?: SavedBlock[]): string {
  const list = blocks ?? listBlocks(themeId);
  const envelope: BlockEnvelope = {
    v: BLOCK_EXPORT_VERSION,
    theme: themeId,
    exportedAt: new Date().toISOString(),
    blocks: list.map((block) => ({ name: block.name, nodes: block.nodes })),
  };
  return JSON.stringify(envelope, null, 2);
}

export function exportSection(name: string, nodes: Section[]): string {
  const envelope: BlockEnvelope = {
    v: BLOCK_EXPORT_VERSION,
    theme: null,
    exportedAt: new Date().toISOString(),
    blocks: [{ name, nodes: sanitiseBlockNodes(nodes) }],
  };
  return JSON.stringify(envelope, null, 2);
}

/** Anything bigger than this is not a block library; refuse before parsing. */
export const MAX_IMPORT_BYTES = 512 * 1024;

export type ImportResult = { added: number; skipped: number; blocks: SavedBlock[] };

/**
 * Imports an envelope. Every node goes through the AST parser, so unknown
 * widgets and junk props are dropped rather than trusted; names already in the
 * library are skipped instead of silently overwriting a merchant's work.
 */
export function importBlocks(themeId: string | null, json: string): ImportResult {
  const existing = listBlocks(themeId);
  if (!themeId || json.length > MAX_IMPORT_BYTES) {
    return { added: 0, skipped: 0, blocks: existing };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { added: 0, skipped: 0, blocks: existing };
  }

  const envelope = parsed as Partial<BlockEnvelope>;
  const incoming = Array.isArray(envelope?.blocks) ? envelope.blocks : [];
  const names = new Set(existing.map((block) => block.name));
  let added = 0;
  let skipped = 0;
  let current = existing;

  for (const entry of incoming) {
    const name = typeof entry?.name === "string" ? entry.name.trim().slice(0, 60) : "";
    const nodes = sanitiseBlockNodes((entry as { nodes?: unknown })?.nodes);
    if (!name || nodes.length === 0 || names.has(name) || current.length >= MAX_BLOCKS) {
      skipped += 1;
      continue;
    }
    current = saveBlock(themeId, name, nodes);
    names.add(name);
    added += 1;
  }

  return { added, skipped, blocks: current };
}
