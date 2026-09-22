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
  pluginTrayEntries as basePluginTrayEntries,
  type InstalledPlugin,
} from "@/lib/plugin-manifest";
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
  const seen = new Set<string>();
  const out: PluginTrayEntry[] = [];
  for (const slot of BLOCK_SLOTS) {
    for (const entry of basePluginTrayEntries(installed, slot)) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      out.push(entry);
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
