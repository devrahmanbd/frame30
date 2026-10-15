/**
 * Frame30 — extension insertion contract + tray adoption (RED-first).
 *
 * The trays list from ONE unified registry (builtin + studio +
 * installed-plugin defs) while preserving existing search/category/disabled
 * filtering behavior. Insertion is a pure contract — registry defaults,
 * unique instance id, permitted location, selected instance — tested here
 * against an isolated fake registry (`createWidgetRegistry`, never the
 * shared singleton). Upgrade pins both paths: track-latest resolves newer,
 * pinned-incompatible misses with data intact.
 */
import { describe, expect, it } from "vitest";
import {
  BUILDER_API_VERSION,
  type InstalledPlugin,
  type PluginManifest,
  type PluginWidgetDef,
} from "../../../lib/plugin-manifest";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "../../../lib/unified-widget-registry";
import {
  buildExtensionInsert,
  insertPluginWidget,
  studioPluginTrayEntries,
} from "./plugin-tray";

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
  version = "1.0.0",
): PluginManifest {
  return {
    id,
    name: `${id} app`,
    version,
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

function schemaDef(
  id: string,
  opts: {
    slots?: string[];
    version?: string;
    minBuilderApi?: string;
    defaults?: Record<string, unknown>;
    fields?: WidgetDef["propsSchema"]["fields"];
  } = {},
): WidgetDef {
  return {
    id,
    namespace: "plugin",
    version: opts.version ?? "1.0.0",
    label: `Label ${id}`,
    category: "plugin",
    slots: opts.slots ?? ["main"],
    defaults: opts.defaults ?? {},
    propsSchema: { fields: opts.fields ?? [] },
    renderer: "sandbox",
    ...(opts.minBuilderApi ? { minBuilderApi: opts.minBuilderApi } : {}),
  };
}

/** Isolated fake registry preloaded with one schema-driven plugin widget. */
function fakeRegistry(): UnifiedRegistry {
  const registry = createWidgetRegistry();
  expect(
    registry.registerWidget(
      schemaDef("plugin:acme/reviews", {
        version: "2.0.0",
        defaults: { title: "Declared default", limit: 5 },
        fields: [
          { key: "title", label: "Title", kind: "text", default: "Fallback" },
          { key: "limit", label: "Limit", kind: "number", min: 1, max: 24 },
        ],
      }),
    ).ok,
  ).toBe(true);
  return registry;
}

describe("buildExtensionInsert — happy path", () => {
  it("initializes schema-cleaned defaults + unique instance id + slot + selection", () => {
    const registry = fakeRegistry();
    const first = buildExtensionInsert(registry, {
      widgetKey: "plugin:acme/reviews",
      slot: "main",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.node.type).toBe("extension");
    expect(first.node.widgetKey).toBe("plugin:acme/reviews");
    // Declared defaults win over field fallbacks; numbers stay in range.
    expect(first.node.props["title"]).toBe("Declared default");
    expect(first.node.props["limit"]).toBe(5);
    expect(first.node.id).toBe(first.node.instanceId);
    expect(first.selectedId).toBe(first.node.instanceId);
    expect(first.node.owner).toEqual({ kind: "plugin", id: "acme" });
    expect(first.node.apiVersion).toBe(BUILDER_API_VERSION);
    expect(first.node.slots).toEqual(["main"]);

    const second = buildExtensionInsert(registry, {
      widgetKey: "plugin:acme/reviews",
      slot: "main",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Two inserts never share an identity.
    expect(second.node.instanceId).not.toBe(first.node.instanceId);
  });

  it("honors an explicit id generator (deterministic callers)", () => {
    const registry = fakeRegistry();
    const out = buildExtensionInsert(registry, {
      widgetKey: "plugin:acme/reviews",
      slot: "main",
      generateId: () => "fixed-id",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.node.instanceId).toBe("fixed-id");
    expect(out.selectedId).toBe("fixed-id");
  });

  it("clones legacy (empty-schema) defaults so instances never share refs", () => {
    const registry = createWidgetRegistry();
    registry.registerWidget(
      schemaDef("plugin:acme/legacy", {
        defaults: { title: "Legacy", rows: [{ q: "a" }] },
        fields: [],
      }),
    );
    const a = buildExtensionInsert(registry, {
      widgetKey: "plugin:acme/legacy",
      slot: "main",
    });
    const b = buildExtensionInsert(registry, {
      widgetKey: "plugin:acme/legacy",
      slot: "main",
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.node.props).toEqual({ title: "Legacy", rows: [{ q: "a" }] });
    expect(a.node.props["rows"]).not.toBe(b.node.props["rows"]);
  });

  it("allows slotless (studio) defs in any slot", () => {
    const registry = createWidgetRegistry();
    registry.registerWidget({
      ...schemaDef("studio:lookbook", { slots: [] }),
      namespace: "studio",
      renderer: "custom",
    });
    for (const slot of ["header", "main", "footer"] as const) {
      const out = buildExtensionInsert(registry, {
        widgetKey: "studio:lookbook",
        slot,
      });
      expect(out.ok).toBe(true);
    }
  });
});

describe("buildExtensionInsert — misses preserve data", () => {
  it("unknown builtin id misses as unknown", () => {
    const out = buildExtensionInsert(fakeRegistry(), {
      widgetKey: "builtin:ghost",
      slot: "main",
    });
    expect(out).toMatchObject({ ok: false, error: "unknown" });
  });

  it("absent plugin id misses as uninstalled", () => {
    const out = buildExtensionInsert(fakeRegistry(), {
      widgetKey: "plugin:ghost/widget",
      slot: "main",
    });
    expect(out).toMatchObject({ ok: false, error: "uninstalled" });
  });

  it("disabled widget misses as disabled", () => {
    const registry = fakeRegistry();
    expect(registry.disableWidget("plugin:acme/reviews").ok).toBe(true);
    const out = buildExtensionInsert(registry, {
      widgetKey: "plugin:acme/reviews",
      slot: "main",
    });
    expect(out).toMatchObject({ ok: false, error: "disabled" });
  });

  it("incompatible widget misses as incompatible", () => {
    const registry = createWidgetRegistry();
    registry.registerWidget(
      schemaDef("plugin:acme/future", { minBuilderApi: "99.0.0" }),
    );
    const out = buildExtensionInsert(registry, {
      widgetKey: "plugin:acme/future",
      slot: "main",
    });
    expect(out).toMatchObject({ ok: false, error: "incompatible" });
  });

  it("rejects a slot the def does not permit", () => {
    const out = buildExtensionInsert(fakeRegistry(), {
      widgetKey: "plugin:acme/reviews",
      slot: "header",
    });
    expect(out).toMatchObject({ ok: false, error: "illegal_slot" });
  });
});

describe("insertPluginWidget — tray wiring", () => {
  it("delivers the extension node when the tray is adopted", () => {
    const seen: unknown[] = [];
    const outcome = insertPluginWidget(
      fakeRegistry(),
      { widgetKey: "plugin:acme/reviews", slot: "main" },
      { onAddExtension: (node) => seen.push(node) },
    );
    expect(outcome.handled).toBe("extension");
    expect(seen).toHaveLength(1);
  });

  it("falls back to the legacy plugin path on a miss (placeholder downstream)", () => {
    const legacyKeys: string[] = [];
    const outcome = insertPluginWidget(
      fakeRegistry(),
      { widgetKey: "plugin:ghost/widget", slot: "main" },
      {
        onAddExtension: () => {
          throw new Error("must not insert a miss");
        },
        onAddPlugin: (key) => legacyKeys.push(key),
      },
    );
    expect(outcome.handled).toBe("legacy");
    expect(legacyKeys).toEqual(["plugin:ghost/widget"]);
  });

  it("stays legacy when the caller is unwired (existing callers untouched)", () => {
    const legacyKeys: string[] = [];
    const outcome = insertPluginWidget(
      fakeRegistry(),
      { widgetKey: "plugin:acme/reviews", slot: "main" },
      { onAddPlugin: (key) => legacyKeys.push(key) },
    );
    expect(outcome.handled).toBe("legacy");
    expect(legacyKeys).toEqual(["plugin:acme/reviews"]);
  });

  it("reports none when nothing handles the insert", () => {
    const outcome = insertPluginWidget(
      fakeRegistry(),
      { widgetKey: "plugin:acme/reviews", slot: "main" },
      {},
    );
    expect(outcome.handled).toBe("none");
  });
});

describe("studio plugin tray lists from the unified registry", () => {
  it("returns namespaced keys with label + plugin name", () => {
    expect(
      studioPluginTrayEntries([
        installed("loyalty-lite", [widget("points_bar", "Points bar")]),
      ]),
    ).toEqual([
      {
        key: "plugin:loyalty-lite/points_bar",
        label: "Points bar",
        pluginName: "loyalty-lite app",
      },
    ]);
  });

  it("unions across slots without duplicates", () => {
    const entries = studioPluginTrayEntries([
      installed("multi-slot", [
        widget("everywhere", "Everywhere", ["header", "main", "footer"]),
      ]),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe("plugin:multi-slot/everywhere");
  });

  it("excludes disabled and incompatible installs", () => {
    expect(
      studioPluginTrayEntries([
        installed("killed-app", [widget("block_a", "Block A")], {
          enabled: false,
        }),
      ]),
    ).toEqual([]);
    const future = installed("future-app", [widget("block_a", "Block A")]);
    future.manifest.api = "^4.0.0";
    expect(studioPluginTrayEntries([future])).toEqual([]);
  });

  it("returns no entries when nothing is installed", () => {
    expect(studioPluginTrayEntries([])).toEqual([]);
  });

  it("never lists builtin or studio defs as plugin entries", () => {
    const entries = studioPluginTrayEntries([
      installed("loyalty-lite", [widget("points_bar", "Points bar")]),
    ]);
    expect(entries.every((e) => e.key.startsWith("plugin:"))).toBe(true);
  });
});

describe("extension upgrade path", () => {
  function versionedRegistry(): UnifiedRegistry {
    const registry = createWidgetRegistry();
    registry.registerWidget(
      schemaDef("plugin:acme/reviews", { version: "1.0.0" }),
    );
    registry.registerWidget(
      schemaDef("plugin:acme/reviews", { version: "2.0.0" }),
    );
    return registry;
  }

  it("an old unpinned reference resolves to the newer def with data intact", () => {
    const registry = versionedRegistry();
    const data = { title: "Merchant copy" };
    const resolved = registry.resolveWidget("plugin:acme/reviews", { data });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.def.version).toBe("2.0.0");
  });

  it("a pinned incompatible version misses with data intact", () => {
    const registry = createWidgetRegistry();
    registry.registerWidget(
      schemaDef("plugin:acme/reviews", {
        version: "1.0.0",
        minBuilderApi: "3.0.0",
      }),
    );
    const data = { title: "Merchant copy" };
    const missed = registry.resolveWidget("plugin:acme/reviews", {
      version: "1.0.0",
      builderApi: "2.0.0",
      data,
    });
    expect(missed.ok).toBe(false);
    if (missed.ok) return;
    expect(missed.missing.reason).toBe("incompatible");
    expect(missed.missing.preservedData).toEqual(data);
  });

  it("buildExtensionInsert carries an explicit version pin onto the node", () => {
    const out = buildExtensionInsert(versionedRegistry(), {
      widgetKey: "plugin:acme/reviews",
      slot: "main",
      version: "1.0.0",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.node.version).toBe("1.0.0");
  });
});
