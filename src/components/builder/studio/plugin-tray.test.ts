import { describe, expect, it } from "vitest";
import {
  parsePluginWidgetKey,
  resolvePluginWidget,
  type InstalledPlugin,
  type PluginManifest,
  type PluginWidgetDef,
} from "../../../lib/plugin-manifest";
import { WIDGET_BY_KEY } from "../../../lib/studio/catalog";
import {
  appBlockNodeForPlugin,
  filterPluginTrayEntries,
  pluginTrayEntries,
  type PluginTrayEntry,
} from "./plugin-tray";

/**
 * Studio (new editor) plugin gaps: tray entries, app-block node construction
 * with `plugin:`-namespaced keys, and resolution incl. disabled/kill-switch.
 */

function widget(
  key: string,
  label: string,
  slots: PluginWidgetDef["slots"] = ["main"],
): PluginWidgetDef {
  return { key, label, slots, entry: `framique.mount("${key}")`, height: 320 };
}

function manifest(
  id: string,
  widgets: PluginWidgetDef[],
  api = "^3.0.0",
): PluginManifest {
  return {
    id,
    name: `${id} app`,
    version: "1.0.0",
    api,
    permissions: ["render_storefront"],
    widgets,
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
    budget: { jsKb: 120, mainThreadMs: 50 },
  };
}

function installed(
  id: string,
  widgets: PluginWidgetDef[],
  overrides: Partial<InstalledPlugin> = {},
): InstalledPlugin {
  return {
    installId: `install-${id}`,
    manifest: manifest(id, widgets),
    grantedScopes: ["render_storefront"],
    settings: {},
    enabled: true,
    ...overrides,
  };
}

const KEY = "plugin:loyalty-lite/points_bar";

describe("studio plugin tray entries", () => {
  it("returns namespaced keys with label + plugin name", () => {
    const entries = pluginTrayEntries([
      installed("loyalty-lite", [widget("points_bar", "Points bar")]),
    ]);
    expect(entries).toEqual([
      {
        key: KEY,
        label: "Points bar",
        pluginName: "loyalty-lite app",
      },
    ]);
  });

  it("unions across slots without duplicates", () => {
    const entries = pluginTrayEntries([
      installed("multi-slot", [
        widget("everywhere", "Everywhere", ["header", "main", "footer"]),
      ]),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe("plugin:multi-slot/everywhere");
  });

  it("excludes disabled plugins (merchant-off and kill-switch both surface as enabled:false)", () => {
    const entries = pluginTrayEntries([
      installed("killed-app", [widget("block_a", "Block A")], {
        enabled: false,
      }),
    ]);
    expect(entries).toEqual([]);
  });

  it("excludes incompatible builder-API plugins", () => {
    const plugin = installed("future-app", [widget("block_a", "Block A")]);
    plugin.manifest.api = "^4.0.0";
    expect(pluginTrayEntries([plugin])).toEqual([]);
  });

  it("returns no entries when nothing is installed", () => {
    expect(pluginTrayEntries([])).toEqual([]);
  });
});

describe("filterPluginTrayEntries", () => {
  const entries: PluginTrayEntry[] = [
    { key: KEY, label: "Points bar", pluginName: "Loyalty Lite" },
    {
      key: "plugin:reviews-pro/carousel",
      label: "Review carousel",
      pluginName: "Reviews Pro",
    },
  ];

  it("empty query returns everything", () => {
    expect(filterPluginTrayEntries(entries, "")).toEqual(entries);
    expect(filterPluginTrayEntries(entries, "   ")).toEqual(entries);
  });

  it("matches labels case-insensitively", () => {
    expect(filterPluginTrayEntries(entries, "POINTS")).toHaveLength(1);
  });

  it("matches plugin names case-insensitively", () => {
    const out = filterPluginTrayEntries(entries, "reviews pro");
    expect(out).toEqual([entries[1]]);
  });

  it("returns [] on no match", () => {
    expect(filterPluginTrayEntries(entries, "checkout")).toEqual([]);
  });
});

describe("appBlockNodeForPlugin", () => {
  it("builds an app-block node pre-pointed at the namespaced key", () => {
    const node = appBlockNodeForPlugin(KEY);
    expect(node.el).toBe("app-block");
    expect(node.id).toBeTruthy();
    expect(node.settings.pluginKey).toBe(KEY);
    expect(node.settings.height).toBe(320);
  });

  it("the produced key resolves against installed plugins", () => {
    const plugins = [
      installed("loyalty-lite", [widget("points_bar", "Points bar")]),
    ];
    const node = appBlockNodeForPlugin(KEY);
    const resolved = resolvePluginWidget(
      String(node.settings.pluginKey),
      plugins,
    );
    expect(resolved.ok).toBe(true);
  });
});

describe("app-block resolution (disabled / kill-switch)", () => {
  const plugins = [
    installed("loyalty-lite", [widget("points_bar", "Points bar")]),
  ];

  it("disabled plugin resolves to the disabled reason, never a crash", () => {
    const off = plugins.map((p) => ({ ...p, enabled: false }));
    expect(resolvePluginWidget(KEY, off)).toEqual({
      ok: false,
      reason: "disabled",
      pluginId: "loyalty-lite",
    });
  });

  it("unknown plugin resolves to not_installed", () => {
    expect(resolvePluginWidget("plugin:ghost-app/block", plugins)).toEqual({
      ok: false,
      reason: "not_installed",
      pluginId: "ghost-app",
    });
  });

  it("unknown widget resolves to unknown_widget", () => {
    expect(resolvePluginWidget("plugin:loyalty-lite/gone", plugins)).toEqual({
      ok: false,
      reason: "unknown_widget",
      pluginId: "loyalty-lite",
    });
  });

  it("empty key resolves to bad_key (renderer shows the picker placeholder)", () => {
    expect(resolvePluginWidget("", plugins)).toEqual({
      ok: false,
      reason: "bad_key",
    });
  });
});

describe("app-block manifest keys", () => {
  it("defaults use plugin:-namespaced keys, not the legacy shortcode shape", () => {
    const def = WIDGET_BY_KEY["app-block"];
    expect(def).toBeDefined();
    expect(def.defaults).toMatchObject({ pluginKey: "", height: 320 });
    expect(def.defaults).not.toHaveProperty("block");
    expect(def.defaults).not.toHaveProperty("params");
  });

  it("pluginKey default parses as an unselected plugin widget key", () => {
    const def = WIDGET_BY_KEY["app-block"];
    // Empty = nothing picked yet; any picked value must be plugin:-namespaced.
    expect(
      parsePluginWidgetKey(String(def.defaults.pluginKey ?? "")),
    ).toBeNull();
    expect(parsePluginWidgetKey(KEY)).toEqual({
      pluginId: "loyalty-lite",
      widget: "points_bar",
    });
  });
});
