/**
 * Frame30 swap-in 2 — tray theme append (TDD).
 *
 * - New path engages: `themeTrayEntries` lists claiming defs; both
 *   `WidgetTray`'s registry seeding and `pluginTrayEntries(themeKey)` append
 *   them for the active theme.
 * - Old path byte-identical when inactive: absent/blank/unknown/disabled
 *   themes append nothing — plugin listings and empty states unchanged.
 */
import { describe, expect, it } from "vitest";
import {
  createWidgetRegistry,
  fromBuiltinWidgets,
  fromStudioCatalog,
} from "@/lib/unified-widget-registry";
import { themeTrayEntries } from "@/lib/widget-presentation";
import { pluginTrayEntries } from "@/components/builder/studio/plugin-tray";
import type { InstalledPlugin, PluginManifest } from "@/lib/plugin-manifest";

function themeDef(id: string, themes: string[]) {
  return {
    id,
    namespace: "theme" as const,
    version: "1.0.0",
    label: `Label ${id}`,
    category: "content",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: "custom" as const,
    themes,
  };
}

function registryWithTheme() {
  const registry = createWidgetRegistry();
  for (const def of [...fromBuiltinWidgets(), ...fromStudioCatalog()]) {
    registry.registerWidget(def);
  }
  expect(
    registry.registerWidget(
      themeDef("theme:songoskriti/finder", ["songoskriti"]),
    ).ok,
  ).toBe(true);
  return registry;
}

function installedStub(): InstalledPlugin[] {
  const manifest: PluginManifest = {
    id: "acme",
    name: "Acme",
    version: "1.0.0",
    api: "^3.0.0",
    permissions: ["render_storefront"],
    widgets: [
      {
        key: "reviews",
        label: "Reviews",
        slots: ["main"],
        entry: "e.js",
        height: 320,
      },
    ],
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
    budget: { jsKb: 10, mainThreadMs: 5 },
  };
  return [
    {
      installId: "i-acme",
      manifest,
      grantedScopes: ["render_storefront"],
      settings: {},
      enabled: true,
    },
  ];
}

describe("theme tray append", () => {
  it("lists the active theme's widgets (new path engages)", () => {
    const out = themeTrayEntries("songoskriti", {
      registry: registryWithTheme(),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected entries");
    expect(out.entries.map((e) => e.id)).toContain("theme:songoskriti/finder");
  });

  it("pluginTrayEntries appends theme widgets only when themed", async () => {
    const { registerWidget, clearRegistry } =
      await import("@/lib/unified-widget-registry");
    expect(
      registerWidget(themeDef("theme:songoskriti/finder", ["songoskriti"])).ok,
    ).toBe(true);
    try {
      const themed = pluginTrayEntries(installedStub(), "songoskriti");
      expect(themed.map((e) => e.key)).toContain("plugin:acme/reviews");
      expect(themed.map((e) => e.key)).toContain("theme:songoskriti/finder");
      const legacy = pluginTrayEntries(installedStub());
      expect(legacy.map((e) => e.key)).toContain("plugin:acme/reviews");
      expect(legacy.map((e) => e.key)).not.toContain(
        "theme:songoskriti/finder",
      );
    } finally {
      clearRegistry();
    }
  });

  it("empty/disabled/unknown themes append nothing (old path identical)", () => {
    const registry = registryWithTheme();
    // Unknown theme: miss, no entries.
    expect(themeTrayEntries("no-such-theme", { registry }).ok).toBe(false);
    // Disabled theme: miss, no entries.
    expect(
      themeTrayEntries("songoskriti", {
        registry,
        installedThemes: [{ key: "songoskriti", enabled: false }],
      }).ok,
    ).toBe(false);
    // Blank key: miss, no entries.
    expect(themeTrayEntries("", { registry }).ok).toBe(false);
    // pluginTrayEntries without a theme never includes theme ids.
    expect(
      pluginTrayEntries([], undefined).some((e) => e.key.startsWith("theme:")),
    ).toBe(false);
    expect(
      pluginTrayEntries([], "").some((e) => e.key.startsWith("theme:")),
    ).toBe(false);
  });
});
