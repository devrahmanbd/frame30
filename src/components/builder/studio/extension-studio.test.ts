/**
 * Frame30 swap-in 5 — extension inserts (builder + studio) (TDD).
 *
 * - New path engages: `buildExtensionInsert` builds a canonical extension
 *   node; `studioNodeForExtension` bridges it to the studio `app-block`
 *   twin (pluginKey preserved, instance id kept); `insertPluginWidget`
 *   prefers `onAddExtension` when wired.
 * - Old path byte-identical when inactive: registry misses keep the legacy
 *   `plugin_block` / `app-block` placeholder path (existing
 *   `extension-insert.test.ts` is the legacy proof — this file only adds the
 *   studio bridge).
 */
import { describe, expect, it } from "vitest";
import {
  BUILDER_API_VERSION,
  type InstalledPlugin,
} from "@/lib/plugin-manifest";
import {
  createWidgetRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import {
  buildExtensionInsert,
  insertPluginWidget,
  studioNodeForExtension,
  appBlockNodeForPlugin,
} from "@/components/builder/studio/plugin-tray";

function schemaDef(id: string): WidgetDef {
  return {
    id,
    namespace: "plugin",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "plugin",
    slots: ["main"],
    defaults: { title: "Default" },
    propsSchema: { fields: [] },
    renderer: "sandbox",
  };
}

function registryWithPlugin(): ReturnType<typeof createWidgetRegistry> {
  const registry = createWidgetRegistry();
  expect(registry.registerWidget(schemaDef("plugin:acme/reviews")).ok).toBe(
    true,
  );
  return registry;
}

describe("studio extension bridge", () => {
  it("builds a canonical node and bridges it to the app-block twin", () => {
    const built = buildExtensionInsert(registryWithPlugin(), {
      widgetKey: "plugin:acme/reviews",
      slot: "main",
      generateId: () => "ext-fixed",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.node.type).toBe("extension");
    expect(built.node.widgetKey).toBe("plugin:acme/reviews");
    expect(built.node.instanceId).toBe("ext-fixed");

    const studio = studioNodeForExtension(built.node);
    expect(studio.el).toBe("app-block");
    expect(studio.id).toBe("ext-fixed");
    expect(studio.settings.pluginKey).toBe("plugin:acme/reviews");
    expect(studio.settings.title).toBe("Default");
  });

  it("keeps the app-block fallback when the registry misses", () => {
    const missed = buildExtensionInsert(registryWithPlugin(), {
      widgetKey: "plugin:ghost/missing",
      slot: "main",
    });
    expect(missed.ok).toBe(false);
    const fallback = appBlockNodeForPlugin("plugin:ghost/missing");
    expect(fallback.el).toBe("app-block");
    expect(fallback.settings.pluginKey).toBe("plugin:ghost/missing");
  });

  it("prefers onAddExtension when wired, legacy otherwise", () => {
    const seen: unknown[] = [];
    const legacy: string[] = [];
    const ok = insertPluginWidget(
      registryWithPlugin(),
      { widgetKey: "plugin:acme/reviews", slot: "main" },
      {
        onAddExtension: (node) => seen.push(node),
        onAddPlugin: (key) => legacy.push(key),
      },
    );
    expect(ok.handled).toBe("extension");
    expect(seen).toHaveLength(1);
    expect(legacy).toHaveLength(0);

    const miss = insertPluginWidget(
      registryWithPlugin(),
      { widgetKey: "plugin:ghost/missing", slot: "main" },
      {
        onAddExtension: () => {
          throw new Error("must not insert a miss");
        },
        onAddPlugin: (key) => legacy.push(key),
      },
    );
    expect(miss.handled).toBe("legacy");
    expect(legacy).toContain("plugin:ghost/missing");
  });

  it("records the builder API line on the node", () => {
    const built = buildExtensionInsert(registryWithPlugin(), {
      widgetKey: "plugin:acme/reviews",
      slot: "main",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.node.apiVersion).toBe(BUILDER_API_VERSION);
  });
});
