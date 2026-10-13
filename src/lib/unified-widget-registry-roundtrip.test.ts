/**
 * Unified widget registry — plugin lifecycle round-trip (RED-first).
 *
 * In-memory only, no DB: register fixture plugin widgets → resolve →
 * disable → placeholder-with-data → re-enable → resolve → update version →
 * old references still resolve → remove → data preserved.
 */
import { describe, expect, it } from "vitest";
import {
  pluginWidgetKey,
  type InstalledPlugin,
  type PluginWidgetDef,
} from "./plugin-manifest";
import {
  createWidgetRegistry,
  fromPluginManifest,
} from "./unified-widget-registry";

function widget(key: string, label: string): PluginWidgetDef {
  return { key, label, slots: ["main"], entry: `${key}-entry.js`, height: 320 };
}

function install(
  id: string,
  widgets: PluginWidgetDef[],
  version = "1.0.0",
): InstalledPlugin {
  return {
    installId: `inst-${id}`,
    manifest: {
      id,
      name: `${id} plugin`,
      version,
      api: "^3.0.0",
      permissions: ["render_storefront"],
      widgets,
      hooks: [],
      settings: [],
      i18n: { en: {}, bn: {} },
      budget: { jsKb: 10, mainThreadMs: 5 },
    },
    grantedScopes: ["render_storefront"],
    settings: {},
    enabled: true,
  };
}

describe("unified registry — plugin round-trip", () => {
  it("register → resolve → disable → placeholder → re-enable → update → remove", () => {
    const reg = createWidgetRegistry();
    const installed = [
      install("acme", [widget("reviews", "Reviews"), widget("faq", "FAQ")]),
    ];

    // 1. Register fixture plugin widgets through the adapter.
    const defs = fromPluginManifest(installed);
    expect(defs.map((d) => d.id)).toEqual(
      expect.arrayContaining([
        pluginWidgetKey("acme", "reviews"),
        pluginWidgetKey("acme", "faq"),
      ]),
    );
    for (const def of defs) expect(reg.registerWidget(def).ok).toBe(true);

    // 2. Resolve with authored data.
    const data = { handle: "silk-saree", limit: 6 };
    const hit = reg.resolveWidget(pluginWidgetKey("acme", "reviews"), { data });
    expect(hit.ok).toBe(true);
    if (hit.ok) expect(hit.def.version).toBe("1.0.0");

    // 3. Disable → labelled-placeholder semantics: miss + data preserved.
    expect(reg.disableWidget(pluginWidgetKey("acme", "reviews")).ok).toBe(true);
    const miss = reg.resolveWidget(pluginWidgetKey("acme", "reviews"), {
      data,
    });
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.missing.reason).toBe("disabled");
      expect(miss.missing.preservedData).toEqual(data);
    }
    // The sibling widget on the same page is unaffected.
    expect(reg.resolveWidget(pluginWidgetKey("acme", "faq")).ok).toBe(true);

    // 4. Re-enable → resolves again with identical data.
    expect(reg.enableWidget(pluginWidgetKey("acme", "reviews")).ok).toBe(true);
    const restored = reg.resolveWidget(pluginWidgetKey("acme", "reviews"), {
      data,
    });
    expect(restored.ok).toBe(true);

    // 5. Update version → latest moves, old pinned references still resolve.
    const v2 = {
      ...defs.find((d) => d.id === pluginWidgetKey("acme", "reviews"))!,
      version: "2.0.0",
      label: "Reviews v2",
    };
    expect(reg.updateWidget(pluginWidgetKey("acme", "reviews"), v2).ok).toBe(
      true,
    );
    const latest = reg.resolveWidget(pluginWidgetKey("acme", "reviews"));
    expect(latest.ok && latest.ok ? latest.def.version : "").toBe("2.0.0");
    const oldRef = reg.resolveWidget(pluginWidgetKey("acme", "reviews"), {
      version: "1.0.0",
      data,
    });
    expect(oldRef.ok).toBe(true);
    if (oldRef.ok) {
      expect(oldRef.def.version).toBe("1.0.0");
      expect(oldRef.def.label).toBe("Reviews");
    }

    // 6. Remove → data preserved for the placeholder; sibling intact.
    expect(reg.removeWidget(pluginWidgetKey("acme", "reviews")).ok).toBe(true);
    const removed = reg.resolveWidget(pluginWidgetKey("acme", "reviews"), {
      data,
    });
    expect(removed.ok).toBe(false);
    if (!removed.ok) expect(removed.missing.preservedData).toEqual(data);
    expect(reg.resolveWidget(pluginWidgetKey("acme", "faq")).ok).toBe(true);
  });

  it("registry instances are isolated in-memory snapshots", () => {
    const a = createWidgetRegistry();
    const b = createWidgetRegistry();
    const installed = [install("acme", [widget("reviews", "Reviews")])];
    for (const def of fromPluginManifest(installed)) a.registerWidget(def);
    expect(a.resolveWidget(pluginWidgetKey("acme", "reviews")).ok).toBe(true);
    expect(b.resolveWidget(pluginWidgetKey("acme", "reviews")).ok).toBe(false);
  });
});
