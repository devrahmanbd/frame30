/**
 * Studio (new editor) plugin tray entries.
 *
 * Thin studio-scope wrapper over `pluginTrayEntries` in
 * `@/lib/plugin-manifest` (the same source the old `WidgetTray` reads).
 * The studio canvas has no header/main/footer slot zoning, so entries are
 * the union across every block slot, deduped by the namespaced
 * `plugin:{app}/{widget}` key. Disabled plugins — merchant-off *and* the
 * platform kill switch (both surface as `enabled: false` on the read path)
 * — and incompatible builder-API plugins are excluded by the shared
 * resolver, exactly as in the old path.
 *
 * Do NOT import `ElementsPanel` here: the shell track threads these entries
 * into the panel. This module only shapes the data + the add handler.
 */
import {
  BLOCK_SLOTS,
  BUILDER_API_VERSION,
  parsePluginWidgetKey,
  type InstalledPlugin,
} from "@/lib/plugin-manifest";
import {
  isSlot,
  ownerForWidgetKey,
  type ExtensionNode,
  type Slot,
} from "@/lib/builder-ast";
import {
  createWidgetRegistry,
  fromBuiltinWidgets,
  fromPluginManifest,
  fromStudioCatalog,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import {
  defaultsFor,
  validateProps,
  type PropSchema as ValuePropSchema,
} from "@/lib/widget-props";
import { newWidgetNode } from "@/lib/studio/catalog";
import type { StudioNode } from "@/lib/studio/model";

export type PluginTrayEntry = {
  /** Namespaced widget key, `plugin:{app}/{widget}`. */
  key: string;
  label: string;
  pluginName: string;
};

/** Every app widget installed, enabled and compatible plugins contribute. */
export function pluginTrayEntries(
  installed: readonly InstalledPlugin[],
): PluginTrayEntry[] {
  // Listed from ONE unified registry seeded with every tier (builtin +
  // studio + installed-plugin defs); only the plugin slice is emitted here.
  // Disabled installs and incompatible builder-API manifests contribute
  // nothing — `fromPluginManifest` mirrors the shared resolver filtering, so
  // semantics match the old path exactly (union across block slots, deduped
  // by the namespaced key).
  const registry = createWidgetRegistry();
  for (const def of [
    ...fromBuiltinWidgets(),
    ...fromStudioCatalog(),
    ...fromPluginManifest(installed),
  ]) {
    registry.registerWidget(def);
  }
  const pluginNames = new Map(
    installed.map((item) => [item.manifest.id, item.manifest.name]),
  );
  const seen = new Set<string>();
  const out: PluginTrayEntry[] = [];
  for (const slot of BLOCK_SLOTS) {
    for (const def of registry.listWidgets()) {
      if (def.namespace !== "plugin") continue;
      if (!def.slots.includes(slot)) continue;
      if (seen.has(def.id)) continue;
      seen.add(def.id);
      const parsed = parsePluginWidgetKey(def.id);
      out.push({
        key: def.id,
        label: def.label,
        pluginName: (parsed && pluginNames.get(parsed.pluginId)) ?? def.id,
      });
    }
  }
  return out;
}

/** Mirrors the old `WidgetTray` search: match label or plugin name. */
export function filterPluginTrayEntries(
  entries: readonly PluginTrayEntry[],
  term: string,
): PluginTrayEntry[] {
  const q = term.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter(
    (entry) =>
      entry.label.toLowerCase().includes(q) ||
      entry.pluginName.toLowerCase().includes(q),
  );
}

/**
 * `onAddPlugin` handler shape from the old path (`WidgetTray`
 * `onAddPlugin?: (pluginKey: string) => void`): receives a namespaced
 * `plugin:{app}/{widget}` key. The shell threads this into `ElementsPanel`
 * as `onAddPlugin`; the handler inserts the node built below.
 */
export type OnAddPlugin = (pluginKey: string) => void;

/**
 * Studio equivalent of the old path's `onAddPlugin` body
 * (`dashboard/builder.tsx`: add a `plugin_block`, then set `pluginKey`):
 * an `app-block` node pre-pointed at the widget. The shell inserts it with
 * `studio.addNode(node)` — no `setSetting` round-trip needed.
 */
export function appBlockNodeForPlugin(pluginKey: string): StudioNode {
  const node = newWidgetNode("app-block");
  node.settings = { ...node.settings, pluginKey };
  return node;
}

/* ---------------- Frame30 extension insertion contract -------------------
 *
 * Pure insertion for adopted trays: given a unified registry, a widget key
 * and a target slot, resolve the def and build the canonical extension node
 * — registry defaults (schema-cleaned via `validateProps`/`defaultsFor`
 * when the def ships a schema, cloned verbatim for legacy empty-schema
 * defs), a unique instance id, the permitted location, and the id to select.
 * Resolve misses never throw: they return the reason with preserved data so
 * the caller falls back to the legacy placeholder path.
 */

export type ExtensionInsertRequest = {
  widgetKey: string;
  slot: Slot;
  /** Pin a retained widget version; absent tracks the registry latest. */
  version?: string;
  /** Builder API the caller runs; defaults to `BUILDER_API_VERSION`. */
  builderApi?: string;
  /** Builder API line recorded on the instance; defaults to the running one. */
  apiVersion?: string;
  /** Deterministic id source (tests, imports); default is random. */
  generateId?: () => string;
};

export type ExtensionInsertError =
  "unknown" | "disabled" | "incompatible" | "uninstalled" | "illegal_slot";

export type ExtensionInsertResult =
  | { ok: true; node: ExtensionNode; selectedId: string }
  | {
      ok: false;
      error: ExtensionInsertError;
      preservedData: Record<string, unknown>;
    };

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Instance props for a fresh insert. Schema-driven defs validate the merged
 * declared defaults through the shared value layer (unknown keys stripped,
 * every known key present); legacy empty-schema defs (builtin/studio/plugin
 * adapters today) keep their declared defaults verbatim. Fresh objects every
 * call — two instances never share references.
 */
export function initialExtensionProps(def: WidgetDef): Record<string, unknown> {
  const fields = def.propsSchema?.fields ?? [];
  if (fields.length === 0) return cloneJson(def.defaults) ?? {};
  const declared = cloneJson(def.defaults) ?? {};
  const merged: Record<string, unknown> = {
    ...(defaultsFor(fields as unknown as ValuePropSchema) as Record<
      string,
      unknown
    >),
    ...(declared as Record<string, unknown>),
  };
  return validateProps(fields as unknown as ValuePropSchema, merged)
    .clean as Record<string, unknown>;
}

/** Permitted-location snapshot recorded on the node at insertion. */
function permittedSlots(def: WidgetDef, slot: Slot): Slot[] {
  const declared = (def.slots ?? []).filter((s): s is Slot => isSlot(s));
  return declared.length > 0 ? declared : [slot];
}

export function buildExtensionInsert(
  registry: UnifiedRegistry,
  req: ExtensionInsertRequest,
): ExtensionInsertResult {
  const widgetKey = req.widgetKey.trim();
  const resolved = registry.resolveWidget(widgetKey, {
    ...(req.version ? { version: req.version } : {}),
    builderApi: req.builderApi ?? BUILDER_API_VERSION,
    data: {},
  });
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.missing.reason,
      preservedData: cloneJson(resolved.missing.preservedData) ?? {},
    };
  }
  const def = resolved.def;
  if (def.slots.length > 0 && !def.slots.includes(req.slot)) {
    return {
      ok: false,
      error: "illegal_slot",
      preservedData: cloneJson(def.defaults) ?? {},
    };
  }
  let instanceId = "";
  try {
    instanceId = (req.generateId?.() ?? "").trim().slice(0, 64);
  } catch {
    instanceId = "";
  }
  if (!instanceId) {
    instanceId = `ext-${Math.random().toString(36).slice(2, 10)}`.slice(0, 64);
  }
  const apiVersion = (req.apiVersion ?? BUILDER_API_VERSION)
    .trim()
    .slice(0, 32);
  const node: ExtensionNode = {
    id: instanceId,
    type: "extension",
    instanceId,
    owner: ownerForWidgetKey(widgetKey),
    widgetKey,
    apiVersion: apiVersion || BUILDER_API_VERSION,
    ...(req.version ? { version: req.version.trim().slice(0, 32) } : {}),
    props: initialExtensionProps(def),
    slots: permittedSlots(def, req.slot),
  };
  return { ok: true, node, selectedId: instanceId };
}

/**
 * Tray click wiring shared by adopted trays. Extension-capable callers pass
 * `onAddExtension` and receive the canonical node; everyone else (and every
 * resolve/slot miss, e.g. a disable racing the click) keeps the legacy
 * `onAddPlugin` path whose placeholder renders downstream. Never throws.
 */
export function insertPluginWidget(
  registry: UnifiedRegistry,
  req: ExtensionInsertRequest,
  handlers: {
    onAddExtension?: (node: ExtensionNode) => void;
    onAddPlugin?: (pluginKey: string) => void;
  },
): { handled: "extension" | "legacy" | "none"; result: ExtensionInsertResult } {
  let result: ExtensionInsertResult;
  try {
    result = buildExtensionInsert(registry, req);
  } catch {
    result = { ok: false, error: "unknown", preservedData: {} };
  }
  if (result.ok && handlers.onAddExtension) {
    handlers.onAddExtension(result.node);
    return { handled: "extension", result };
  }
  if (handlers.onAddPlugin) {
    handlers.onAddPlugin(req.widgetKey);
    return { handled: "legacy", result };
  }
  return { handled: "none", result };
}
