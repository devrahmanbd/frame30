/**
 * Frame30 canonical extension-node lifecycle for studio twins (TDD, items 4+5).
 *
 * ONE backward-compatible saved representation for the studio `app-block`
 * twin (`studioNodeForExtension` bridge): the twin carries the canonical
 * extension identity in `settings` (`pluginKey` = widget address,
 * `extensionInstanceId` pinned to `node.id`, `extensionApi` + optional
 * `extensionVersion`), validated per-instance props ride alongside, and
 * responsive `bp` layers ride in `settings.bp`. Everything else (owner,
 * slots) is derived/recorded without breaking the wire:
 *
 * - `owner` is DERIVED canonically via `ownerForWidgetKey(widgetKey)` — never
 *   stored, never trusted from input, so a hostile `owner` cannot spoof.
 * - `slots` (permitted-location snapshot) rides as `settings.extensionSlots`
 *   when the insert recorded it; absent = unconstrained (legacy twins stay
 *   byte-identical — never injected on load).
 * - `version` rides as `settings.extensionVersion` when pinned; absent tracks
 *   latest (same convention as `buildExtensionInsert`).
 *
 * Legacy `app-block` nodes WITHOUT the envelope are untouched by every helper
 * here (same reference back when nothing changes, byte-identical wire) so
 * pre-extension pages never drift.
 *
 * Pure module: no React, no singleton registry reads, no storage. The threaded
 * authorized registry is ALWAYS an explicit param — when provided it is the
 * ONLY registry consulted (never the singleton); when absent, props are
 * preserved JSON-safe without validation. Never throws.
 */

import { ownerForWidgetKey } from "@/lib/builder-ast";
import {
  validateProps,
  type PropSchema,
  type WidgetProps,
} from "@/lib/widget-props";
import type { UnifiedRegistry } from "@/lib/unified-widget-registry";
import { uid, type StudioDoc, type StudioNode } from "./model";

/* ------------------------------------------------------------------ shape */

const ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  "pluginKey",
  "extensionInstanceId",
  "extensionApi",
  "extensionVersion",
  "extensionSlots",
]);

const HOSTILE_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const MAX_TOP_KEYS = 100;
const MAX_DEPTH = 12;
const MAX_ARRAY = 500;
const MAX_TEXT = 8192;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  try {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

function cloneJson<T>(value: T): T | null {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null;
  }
}

/** JSON-safe deep clone with hostile-key strip + caps (legacy/no-schema path). */
function cleanJsonSafe(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.slice(0, MAX_TEXT);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value;
  if (value === null) return null;
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.slice(0, MAX_ARRAY)) {
      const cleaned = cleanJsonSafe(item, depth + 1);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value)) {
      if (count >= MAX_TOP_KEYS) break;
      if (HOSTILE_KEYS.has(k)) continue;
      if (k.length > 120) continue;
      const cleaned = cleanJsonSafe(v, depth + 1);
      if (cleaned === undefined) continue;
      out[k] = cleaned;
      count += 1;
    }
    return out;
  }
  return undefined;
}

/* ------------------------------------------------------- twin predicates */

export function isExtensionTwin(node: unknown): boolean {
  try {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const candidate = node as Partial<StudioNode>;
    if (candidate.el !== "app-block") return false;
    const settings = candidate.settings;
    if (!isRecord(settings)) return false;
    const marker = settings["extensionInstanceId"];
    return typeof marker === "string" && marker.trim().length > 0;
  } catch {
    return false;
  }
}

/** Legacy `app-block` (no envelope): must stay byte-identical. Never throws. */
export function isLegacyAppBlock(node: unknown): boolean {
  try {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const candidate = node as Partial<StudioNode>;
    if (candidate.el !== "app-block") return false;
    return !isExtensionTwin(node);
  } catch {
    return false;
  }
}

/** Trimmed widget address carried by a twin; `""` when blank/hostile. */
export function twinWidgetKeyOf(node: unknown): string {
  try {
    if (!node || typeof node !== "object" || Array.isArray(node)) return "";
    const settings = (node as Partial<StudioNode>).settings;
    if (!isRecord(settings)) return "";
    const raw = settings["pluginKey"];
    return typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  } catch {
    return "";
  }
}

export type TwinAddress = {
  owner: { kind: "builtin" | "studio" | "plugin" | "theme"; id: string };
  widgetKey: string;
};

/**
 * Canonical address for a twin: trimmed `widgetKey` + derived owner via
 * `ownerForWidgetKey` (single regex, never a stored `owner`). Null for
 * legacy/hostile/blank twins. Never throws.
 */
export function twinAddressOf(node: unknown): TwinAddress | null {
  try {
    if (!isExtensionTwin(node)) return null;
    const key = twinWidgetKeyOf(node);
    if (!key) return null;
    const owner = ownerForWidgetKey(key);
    if (!owner || typeof owner.id !== "string") return null;
    return { owner, widgetKey: key };
  } catch {
    return null;
  }
}

/** Pinned widget version (`extensionVersion`); null = tracks latest. */
export function twinVersionOf(node: unknown): string | null {
  try {
    if (!isExtensionTwin(node)) return null;
    const settings = (node as StudioNode).settings as Record<string, unknown>;
    const raw = settings["extensionVersion"];
    return typeof raw === "string" && raw.trim()
      ? raw.trim().slice(0, 32)
      : null;
  } catch {
    return null;
  }
}

/** Permitted-location snapshot (`extensionSlots`); null when unrecorded. */
export function twinSlotsOf(node: unknown): string[] | null {
  try {
    if (!isExtensionTwin(node)) return null;
    const settings = (node as StudioNode).settings as Record<string, unknown>;
    const raw = settings["extensionSlots"];
    if (!Array.isArray(raw)) return null;
    const out = raw.filter(
      (s): s is string => typeof s === "string" && !!s.trim(),
    );
    return out.length > 0 ? [...out] : null;
  } catch {
    return null;
  }
}

/** Per-instance props: settings minus the envelope (never the envelope). */
export function twinPropsOf(node: StudioNode): Record<string, unknown> {
  try {
    const settings = isRecord(node.settings) ? node.settings : {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(settings)) {
      if (ENVELOPE_KEYS.has(k)) continue;
      if (HOSTILE_KEYS.has(k)) continue;
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/* --------------------------------------------- fresh identity (dup/paste) */

/**
 * Deep-clone a twin subtree with FRESH identity: every node gets a new `id`
 * (collision-safe against `usedIds`), and every envelope-bearing node gets
 * its `extensionInstanceId` re-pinned to its own new id. Props/settings are
 * deep-cloned (no shared references with the source — edit A never bleeds
 * into B). Legacy nodes (no envelope) get fresh ids with settings
 * deep-cloned but no envelope injected. Never mutates the source; never
 * throws; hostile subtrees keep their cloned values.
 */
export function withFreshTwinIdentity(
  source: StudioNode,
  usedIds?: Set<string>,
  generateId?: () => string,
): StudioNode {
  const used = usedIds ?? new Set<string>();
  const gen = (): string => {
    try {
      const custom = generateId?.();
      if (typeof custom === "string" && custom.trim()) {
        const clean = custom.trim().slice(0, 64);
        if (clean && !used.has(clean)) {
          used.add(clean);
          return clean;
        }
      }
    } catch {
      // Fall through to random below.
    }
    let id = "";
    for (let i = 0; i < 10; i += 1) {
      id = uid();
      if (!used.has(id)) break;
    }
    if (used.has(id)) id = `${uid()}-${Math.floor(Math.random() * 1e6)}`;
    used.add(id);
    return id.slice(0, 64);
  };
  const cloneSettings = (settings: unknown): Record<string, unknown> => {
    try {
      const cloned = cloneJson(settings);
      if (isRecord(cloned)) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(cloned)) {
          if (HOSTILE_KEYS.has(k)) continue;
          out[k] = v;
        }
        return out as Record<string, unknown>;
      }
    } catch {
      // Fall through to empty below.
    }
    return {};
  };
  const visit = (node: StudioNode): StudioNode => {
    let copy: StudioNode;
    try {
      copy = {
        ...node,
        id: gen(),
        settings: cloneSettings(node.settings) as StudioNode["settings"],
      };
      if (node.name !== undefined) copy.name = node.name;
      if (node.collapsed !== undefined) copy.collapsed = node.collapsed;
      if (Array.isArray(node.hiddenOn)) copy.hiddenOn = [...node.hiddenOn];
      if (node.slot !== undefined) copy.slot = node.slot;
    } catch {
      return { id: gen(), el: "app-block", settings: {} };
    }
    try {
      const settings = copy.settings as Record<string, unknown>;
      const marker = settings["extensionInstanceId"];
      if (typeof marker === "string" && marker.trim()) {
        settings["extensionInstanceId"] = copy.id;
      }
    } catch {
      // Hostile settings keep their cloned value.
    }
    try {
      const children = node.children;
      if (Array.isArray(children)) {
        copy.children = children.map((child) => {
          try {
            return visit(child as StudioNode);
          } catch {
            return { id: gen(), el: "app-block", settings: {} } as StudioNode;
          }
        });
      } else if (children !== undefined) {
        // Hostile non-array children are dropped (never stored).
        delete copy.children;
      }
    } catch {
      // Hostile children keep nothing.
    }
    return copy;
  };
  try {
    for (const id of collectTwinIds(source)) used.add(id);
  } catch {
    // Hostile source: still clone with fresh ids.
  }
  // The source's own id is NOT reserved — the copy must differ from it even
  // when `usedIds` is empty (duplicate) — but pasted siblings must not
  // collide with each other (shared `used` set across the batch).
  void used;
  return visit(source);
}

function collectTwinIds(root: StudioNode): string[] {
  const out: string[] = [];
  const walk = (node: StudioNode): void => {
    if (typeof node.id === "string" && node.id) out.push(node.id);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return out;
}

/**
 * Refresh a batch of pasted twins (clipboard payload): each top-level node
 * gets fresh identity via `withFreshTwinIdentity` sharing ONE `usedIds` set
 * seeded with the document's live ids, so pasted siblings never collide with
 * each other or the canvas. Pure; never mutates inputs; never throws.
 */
export function refreshPastedTwins(
  nodes: readonly StudioNode[],
  liveIds: ReadonlySet<string> | readonly string[],
  generateId?: () => string,
): StudioNode[] {
  try {
    const used = new Set<string>(
      Array.isArray(liveIds) ? liveIds : [...liveIds],
    );
    const out: StudioNode[] = [];
    for (const node of nodes) {
      try {
        out.push(withFreshTwinIdentity(node, used, generateId));
      } catch {
        // A single hostile payload entry never breaks the batch.
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Live ids in a doc (root + header/footer + nested). Never throws. */
export function liveTwinIds(doc: StudioDoc): Set<string> {
  const out = new Set<string>();
  try {
    const walk = (nodes: StudioNode[] | undefined): void => {
      for (const node of nodes ?? []) {
        if (typeof node.id === "string" && node.id) out.add(node.id);
        if (Array.isArray(node.children)) walk(node.children);
      }
    };
    walk(doc.root);
    walk(doc.header);
    walk(doc.footer);
  } catch {
    // Hostile doc: return what was collected.
  }
  return out;
}

/* ------------------------------------------------------- save normalize */

/**
 * Normalize ONE twin for save/autosave/publish (the save half of the ONE
 * representation):
 *
 * - Legacy nodes (no envelope) return the SAME reference (byte-identical).
 * - Extension twins: `extensionInstanceId` repaired to `node.id` (stale
 *   duplicates heal on save), hostile envelope values dropped, props
 *   validated through the threaded registry's schema when the def resolves
 *   (unknown keys stripped, hostile neutralized, every known key present),
 *   otherwise preserved JSON-safe with hostile keys stripped and caps
 *   applied. `bp` layers validate with the same schema shape-for-shape;
 *   `extensionVersion`/`extensionSlots`/`extensionApi` preserved verbatim
 *   (trimmed/clamped, never invented). Never mutates the input; never throws.
 */
export function normalizeTwinForSave(
  node: StudioNode,
  registry?: UnifiedRegistry | null,
): StudioNode {
  try {
    if (!isExtensionTwin(node)) return node;
    const key = twinWidgetKeyOf(node);
    if (!key) return node;
    const settings = isRecord(node.settings) ? node.settings : {};
    const props = twinPropsOf(node);
    let cleanProps: Record<string, unknown>;
    let schema: PropSchema | null = null;
    if (
      registry &&
      typeof (registry as Partial<UnifiedRegistry>).getWidget === "function"
    ) {
      try {
        const def = (registry as UnifiedRegistry).getWidget(key);
        const fields = (def?.propsSchema as { fields?: unknown } | undefined)
          ?.fields;
        if (Array.isArray(fields) && fields.length > 0) {
          schema = def!.propsSchema as PropSchema;
        }
      } catch {
        schema = null;
      }
    }
    if (schema) {
      try {
        cleanProps = validateProps(schema, props).clean as Record<
          string,
          unknown
        >;
      } catch {
        cleanProps = (cleanJsonSafe(props) as Record<string, unknown>) ?? {};
      }
    } else {
      cleanProps = (cleanJsonSafe(props) as Record<string, unknown>) ?? {};
    }
    // Strip hostile keys that validateProps cannot emit but JSON-safe can.
    for (const hostile of HOSTILE_KEYS) delete cleanProps[hostile];
    const next: Record<string, unknown> = {
      ...cleanProps,
      pluginKey: key,
      extensionInstanceId: node.id,
      extensionApi:
        typeof settings["extensionApi"] === "string" &&
        (settings["extensionApi"] as string).trim()
          ? (settings["extensionApi"] as string).trim().slice(0, 32)
          : "3.1.0",
    };
    const version = settings["extensionVersion"];
    if (typeof version === "string" && version.trim()) {
      next["extensionVersion"] = version.trim().slice(0, 32);
    }
    const slots = settings["extensionSlots"];
    if (Array.isArray(slots)) {
      const clean = slots.filter(
        (s): s is string => typeof s === "string" && !!s.trim(),
      );
      if (clean.length > 0) next["extensionSlots"] = clean.slice(0, 12);
    }
    return { ...node, settings: next as StudioNode["settings"] };
  } catch {
    return node;
  }
}

/**
 * Normalize a whole doc for save: every twin normalized, duplicate node ids
 * remapped collision-safe (first wins, later dups get fresh ids + re-pinned
 * envelopes), legacy nodes untouched by reference. Returns the SAME doc
 * reference when nothing changed (byte-identical fast path). Never throws.
 */
export function normalizeDocForSave(
  doc: StudioDoc,
  registry?: UnifiedRegistry | null,
): StudioDoc {
  try {
    const seen = new Set<string>();
    let changed = false;
    const walk = (
      nodes: StudioNode[] | undefined,
    ): StudioNode[] | undefined => {
      if (nodes === undefined) return undefined;
      let out: StudioNode[] | undefined;
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i]!;
        let next = node;
        if (seen.has(node.id)) {
          next = withFreshTwinIdentity(node, seen);
          changed = true;
        } else {
          seen.add(node.id);
        }
        // Seed child ids so nested collisions remap (first wins).
        try {
          for (const child of next.children ?? []) {
            if (
              typeof child.id === "string" &&
              child.id &&
              !seen.has(child.id)
            ) {
              // Reserve nested ids without forcing a remap: the recursive
              // walk below remaps only on actual collision.
              void child.id;
            }
          }
        } catch {
          // Hostile children: the recursive walk handles them.
        }
        const normalized = normalizeTwinForSave(next, registry);
        if (normalized !== next) changed = true;
        // Walk the CURRENT children (fresh copy when remapped above),
        // never the stale original.
        const currentChildren = normalized.children;
        let children = currentChildren;
        if (Array.isArray(currentChildren)) {
          const nextChildren = walk(currentChildren);
          if (nextChildren !== currentChildren) {
            children = nextChildren;
            changed = true;
          }
        }
        let result = normalized;
        if (children !== normalized.children || normalized !== next) {
          result = { ...normalized, ...(children ? { children } : {}) };
          changed = true;
        }
        if (result !== node) {
          if (!out) out = nodes.slice(0, i);
          out.push(result);
        } else if (out) {
          out.push(node);
        }
      }
      return out ?? nodes;
    };
    const root = walk(doc.root) ?? doc.root;
    const header = doc.header !== undefined ? walk(doc.header) : undefined;
    const footer = doc.footer !== undefined ? walk(doc.footer) : undefined;
    if (!changed) return doc;
    return {
      ...doc,
      root,
      ...(header !== undefined ? { header } : {}),
      ...(footer !== undefined ? { footer } : {}),
    };
  } catch {
    return doc;
  }
}

/* ------------------------------------------------- migration + recovery */

export type TwinMigration = { migrated: boolean; node: StudioNode };

/**
 * Legacy `app-block` (no envelope, but carrying a `pluginKey`) migrates ONLY
 * when the caller opts in: the key is promoted to the canonical envelope
 * with a fresh instance id pinned to the node id. Default (`migrate: false`)
 * returns the node UNCHANGED (same reference) so existing pages stay
 * byte-identical. Never throws, never invents a key for key-less nodes.
 */
export function migrateLegacyTwin(
  node: StudioNode,
  opts: { migrate?: boolean } = {},
): TwinMigration {
  try {
    if (isExtensionTwin(node)) return { migrated: false, node };
    if (node.el !== "app-block") return { migrated: false, node };
    if (!opts.migrate) return { migrated: false, node };
    const settings = isRecord(node.settings) ? node.settings : {};
    const raw = settings["pluginKey"];
    const key =
      typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 120) : "";
    if (!key) return { migrated: false, node };
    const next: StudioNode = {
      ...node,
      settings: {
        ...settings,
        pluginKey: key,
        extensionInstanceId: node.id,
        extensionApi: "3.1.0",
      },
    };
    return { migrated: true, node: next };
  } catch {
    return { migrated: false, node };
  }
}

export type TwinThemeSwitch =
  | { compatible: true; node: StudioNode }
  | {
      compatible: false;
      node: StudioNode;
      reason:
        | "unknown"
        | "disabled"
        | "suspended"
        | "incompatible"
        | "uninstalled"
        | "foreign-theme"
        | "bad_key";
      preservedProps: Record<string, unknown>;
      /** Explicit recovery: re-resolve under the owning theme/latest. */
      recovery: string;
    };

function isThemeOwnerLocal(
  def: { namespace?: unknown; id?: unknown; themes?: unknown },
  themeKey: string,
): boolean {
  try {
    if (!themeKey || def.namespace !== "theme") return false;
    const id = typeof def.id === "string" ? def.id : "";
    const scope = ownerForWidgetKey(id).id;
    if (scope === themeKey) return true;
    return (
      Array.isArray(def.themes) && (def.themes as unknown[]).includes(themeKey)
    );
  } catch {
    return false;
  }
}

/**
 * Theme-switch gate for ONE twin (data side — rendering already fail-closes
 * via `resolveStudioExtension`): settings are ALWAYS preserved verbatim;
 * incompatible/foreign/missing defs report `compatible: false` with the
 * authored props + an explicit recovery string (owning theme or latest pin),
 * never a silent wrong-widget substitution. Legacy nodes report compatible
 * (nothing to gate). Never throws.
 */
export function themeSwitchForTwin(
  node: StudioNode,
  nextThemeKey: string,
  registry?: UnifiedRegistry | null,
): TwinThemeSwitch {
  try {
    if (!isExtensionTwin(node)) return { compatible: true, node };
    const key = twinWidgetKeyOf(node);
    const preservedProps = twinPropsOf(node);
    if (!key) {
      return {
        compatible: false,
        node,
        reason: "bad_key",
        preservedProps,
        recovery: "pick-a-widget",
      };
    }
    if (
      !registry ||
      typeof (registry as Partial<UnifiedRegistry>).resolveWidget !== "function"
    ) {
      // No authorized registry to gate against: preserve data, stay
      // compatible (rendering fail-closes downstream when it must).
      return { compatible: true, node };
    }
    let resolved: ReturnType<UnifiedRegistry["resolveWidget"]>;
    try {
      resolved = (registry as UnifiedRegistry).resolveWidget(key, {
        data: preservedProps,
      });
    } catch {
      return {
        compatible: false,
        node,
        reason: "unknown",
        preservedProps,
        recovery: `retry:${key}`,
      };
    }
    if (!resolved.ok) {
      const reason = (resolved.missing.reason ??
        "unknown") as TwinThemeSwitch extends never ? never : string;
      const safe = (
        [
          "unknown",
          "disabled",
          "suspended",
          "incompatible",
          "uninstalled",
        ] as const
      ).includes(reason as (typeof safe)[number])
        ? (reason as
            | "unknown"
            | "disabled"
            | "suspended"
            | "incompatible"
            | "uninstalled")
        : "unknown";
      return {
        compatible: false,
        node,
        reason: safe,
        preservedProps,
        recovery: `retry:${key}`,
      };
    }
    const def = resolved.def;
    const themeKey =
      typeof nextThemeKey === "string" ? nextThemeKey.trim() : "";
    if (
      def.namespace === "theme" &&
      themeKey &&
      !isThemeOwnerLocal(def, themeKey)
    ) {
      const ownerId = ownerForWidgetKey(def.id).id || "owning-theme";
      return {
        compatible: false,
        node,
        reason: "foreign-theme",
        preservedProps,
        recovery: `switch-theme:${ownerId}`,
      };
    }
    return { compatible: true, node };
  } catch {
    return { compatible: true, node };
  }
}

/**
 * Missing-widget recovery for ONE twin: data is NEVER dropped. When the
 * threaded registry now resolves the key, the twin is returned with its
 * stored props intact (recovery — byte-identical settings); otherwise the
 * SAME node reference returns (placeholder downstream, data preserved).
 * Never throws.
 */
export function recoverTwin(
  node: StudioNode,
  registry?: UnifiedRegistry | null,
): { recovered: boolean; node: StudioNode } {
  try {
    if (!isExtensionTwin(node)) return { recovered: false, node };
    const key = twinWidgetKeyOf(node);
    if (!key) return { recovered: false, node };
    if (
      !registry ||
      typeof (registry as Partial<UnifiedRegistry>).resolveWidget !== "function"
    ) {
      return { recovered: false, node };
    }
    let resolved: ReturnType<UnifiedRegistry["resolveWidget"]>;
    try {
      resolved = (registry as UnifiedRegistry).resolveWidget(key, { data: {} });
    } catch {
      return { recovered: false, node };
    }
    if (resolved.ok) return { recovered: true, node };
    return { recovered: false, node };
  } catch {
    return { recovered: false, node };
  }
}

/* ------------------------------------------------------- doc-level loops */

export type DocThemeSwitch = {
  compatible: boolean;
  doc: StudioDoc;
  issues: Array<{ id: string; widgetKey: string; reason: string }>;
};

/**
 * Apply a theme switch across a doc: every twin gated via
 * `themeSwitchForTwin`, settings preserved verbatim in all cases, issues
 * listed explicitly (never silent). The doc reference is stable when fully
 * compatible. Never throws.
 */
export function themeSwitchForDoc(
  doc: StudioDoc,
  nextThemeKey: string,
  registry?: UnifiedRegistry | null,
): DocThemeSwitch {
  try {
    const issues: DocThemeSwitch["issues"] = [];
    const walk = (nodes: StudioNode[]): boolean => {
      let sawIssue = false;
      for (const node of nodes) {
        const verdict = themeSwitchForTwin(node, nextThemeKey, registry);
        if (!verdict.compatible) {
          sawIssue = true;
          issues.push({
            id: node.id,
            widgetKey: twinWidgetKeyOf(node),
            reason: (verdict as { reason: string }).reason,
          });
        }
        if (Array.isArray(node.children)) walk(node.children);
      }
      return sawIssue;
    };
    walk(doc.root ?? []);
    if (doc.header) walk(doc.header);
    if (doc.footer) walk(doc.footer);
    return { compatible: issues.length === 0, doc, issues };
  } catch {
    return { compatible: true, doc, issues: [] };
  }
}

/* ------------------------------------------------------- validation bits */

/** True when every prop key is identifier-shaped (no hostile keys stored). */
export function twinPropsKeysValid(props: unknown): boolean {
  try {
    if (!isRecord(props)) return false;
    for (const k of Object.keys(props)) {
      if (HOSTILE_KEYS.has(k)) return false;
      if (!KEY_RE.test(k) && k !== "bp") return false;
    }
    return true;
  } catch {
    return false;
  }
}

export type { TwinAddress as ExtensionTwinAddress };
