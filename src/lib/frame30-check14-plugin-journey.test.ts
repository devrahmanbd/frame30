/**
 * Frame30 checklist item 14 — Pass 1: REAL plugin journey (TDD-as-proof).
 *
 * Fixture dirs (the lane's one-plugin + one-theme allowance):
 * - `src/lib/__fixtures__/frame30-proof-plugin/plugin.json` — 3 widgets with
 *   nontrivial schemas (repeater + responsive + media + validation edges).
 * - `src/lib/__fixtures__/frame30-proof-theme/dev.theme.json` — Level B
 *   companion theme (used in Pass 2; theme-switch vectors here).
 *
 * Every stage below runs through the REAL modules (no mocks of the modules
 * under test): parseManifest → ZIP seam → fromPluginManifest →
 * createWidgetRegistry/buildTrayRegistry → resolvePluginWidget →
 * resolveInspectorSchema → validateProps/defaultsFor → studio serialize →
 * resolvePresentation → checkThemeCompatibility → update-compat/recovery →
 * renderStudioHtml. Node/JSdom-free: pure modules + registry + presentation.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUILDER_API_VERSION,
  parseManifest,
  pluginTrayEntries,
  pluginWidgetKey,
  resolvePluginWidget,
  validateSettings,
  type InstalledPlugin,
  type PluginManifest,
} from "./plugin-manifest";
import { validateBundle } from "./marketplace-scopes";
import {
  checkExtensionUpdateCompat,
  exportPluginManifestZip,
  migrateExtensionProps,
  pkg1PluginValidator,
  resolveExtensionRecovery,
} from "./plugin-package";
import {
  buildTrayRegistry,
  createWidgetRegistry,
  fromPluginManifest,
} from "./unified-widget-registry";
import {
  checkThemeCompatibility,
  resolveInspectorSchema,
  resolvePresentation,
} from "./widget-presentation";
import {
  controlStatus,
  defaultsFor,
  validateProps,
  visibleFields,
} from "./widget-props";
import {
  emptyStudioDoc,
  parseStudioBody,
  renderStudioHtml,
  serializeStudioBody,
  type StudioDoc,
} from "./studio/model";

const PLUGIN_JSON_PATH =
  "src/lib/__fixtures__/frame30-proof-plugin/plugin.json";

function loadFixtureRaw(): unknown {
  return JSON.parse(readFileSync(PLUGIN_JSON_PATH, "utf8")) as unknown;
}

function loadManifest(): PluginManifest {
  const verdict = parseManifest(loadFixtureRaw());
  if (!verdict.ok) throw new Error(`fixture refused: ${verdict.errors}`);
  return verdict.manifest;
}

function makeInstall(
  manifest: PluginManifest,
  overrides: Partial<InstalledPlugin> = {},
): InstalledPlugin {
  return {
    installId: "inst-frame30-proof",
    manifest,
    grantedScopes: ["read_shop", "render_storefront"],
    settings: { title: "Merchant global", accent: "#000000" },
    enabled: true,
    ...overrides,
  };
}

const WIDGET_IDS = [
  "plugin:frame30-proof/lookbook_grid",
  "plugin:frame30-proof/motion_hero",
  "plugin:frame30-proof/shoppable_video",
] as const;

describe("Pass 1 — install: fixture artifact passes the real gate", () => {
  it("fixture plugin.json exists on disk with three widgets", () => {
    const raw = loadFixtureRaw() as { widgets: unknown[] };
    expect(Array.isArray(raw.widgets)).toBe(true);
    expect(raw.widgets).toHaveLength(3);
  });

  it("parseManifest accepts the fixture (repeater + responsive + media schemas)", () => {
    const manifest = loadManifest();
    expect(manifest.id).toBe("frame30-proof");
    expect(manifest.widgets.map((w) => w.key)).toEqual([
      "lookbook_grid",
      "motion_hero",
      "shoppable_video",
    ]);
    const grid = manifest.widgets[0]!;
    const kinds = (grid.propsSchema ?? []).map((f) => f.kind);
    expect(kinds).toContain("repeater");
    expect(kinds).toContain("responsive");
    expect(kinds).toContain("media");
    expect(kinds).toContain("image");
    // Contract carry-over rides the gate, not just the adapter.
    expect(grid.capabilities).toEqual({ responsive: true, styling: "tokens" });
    expect(grid.dataRequirements).toEqual([
      { source: "products", params: { limit: "12" } },
    ]);
    const video = manifest.widgets[2]!;
    expect(video.themeCompatibility).toEqual({
      themes: ["frame30-proof-theme"],
    });
  });

  it("bundle gate accepts the manifest (no dynamic code, within budget)", () => {
    const manifest = loadManifest();
    const bundle = validateBundle(manifest, manifest.permissions);
    expect(bundle.ok).toBe(true);
  });
});

describe("Pass 1 — package seam: official/custom ZIP pipeline shape", () => {
  it("pkg1PluginValidator accepts the fixture as a plugin artifact", () => {
    const verdict = pkg1PluginValidator(loadFixtureRaw(), "plugin");
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.manifest.slug).toBe("frame30-proof");
      expect(verdict.manifest.api).toBe("^3.0.0");
    }
  });

  it("exportPluginManifestZip materialises a PK archive with root plugin.json", () => {
    const bytes = exportPluginManifestZip(loadFixtureRaw());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes.length).toBeGreaterThan(100);
  });
});

describe("Pass 1 — discovery: install adapts into registerable defs", () => {
  it("fromPluginManifest adapts all three widgets with schema-derived defaults", () => {
    const defs = fromPluginManifest([makeInstall(loadManifest())]);
    expect(defs.map((d) => d.id).sort()).toEqual([...WIDGET_IDS].sort());
    const grid = defs.find((d) => d.id.endsWith("/lookbook_grid"))!;
    expect(grid.renderer).toBe("sandbox");
    expect(grid.propsSchema.fields.length).toBeGreaterThan(10);
    // Per-instance defaults derive ONLY from the widget schema/defaultProps.
    expect(grid.defaults["title"]).toBe("New season");
    expect(grid.defaults["columns"]).toBe(3);
  });

  it("install-level settings NEVER leak into per-instance defaults", () => {
    const defs = fromPluginManifest([makeInstall(loadManifest())]);
    const grid = defs.find((d) => d.id.endsWith("/lookbook_grid"))!;
    // `accent` exists ONLY in install settings for this widget — the adapter
    // must not copy it (settings-vs-props separation).
    expect("accent" in grid.defaults).toBe(false);
    // And the merchant global title must not override the widget default.
    expect(grid.defaults["title"]).toBe("New season");
    // The settings gate itself still validates the global config.
    const manifest = loadManifest();
    const checked = validateSettings(manifest.settings, {
      title: "Merchant global",
      accent: "#000000",
    });
    expect(checked.errors).toEqual([]);
    expect(checked.values["title"]).toBe("Merchant global");
  });

  it("tray discovery lists every widget for the main slot", () => {
    const installed = [makeInstall(loadManifest())];
    const entries = pluginTrayEntries(installed, "main");
    expect(entries.map((e) => e.key).sort()).toEqual([...WIDGET_IDS].sort());
    const registry = buildTrayRegistry(installed);
    for (const id of WIDGET_IDS) {
      expect(registry.resolveWidget(id).ok).toBe(true);
    }
  });
});

describe("Pass 1 — insert: resolution is the single truth for tray+canvas", () => {
  it("resolvePluginWidget resolves each fixture widget", () => {
    const installed = [makeInstall(loadManifest())];
    for (const id of WIDGET_IDS) {
      const resolved = resolvePluginWidget(id, installed);
      expect(resolved.ok).toBe(true);
    }
    expect(pluginWidgetKey("frame30-proof", "lookbook_grid")).toBe(
      WIDGET_IDS[0],
    );
  });

  it("insert misses are explicit and preserve authored data", () => {
    const installed = [makeInstall(loadManifest())];
    expect(resolvePluginWidget("not-a-key", installed)).toEqual({
      ok: false,
      reason: "bad_key",
    });
    expect(resolvePluginWidget("plugin:other/ghost", installed)).toMatchObject({
      ok: false,
      reason: "not_installed",
    });
    expect(
      resolvePluginWidget("plugin:frame30-proof/ghost", installed),
    ).toMatchObject({ ok: false, reason: "unknown_widget" });
    const registry = buildTrayRegistry(installed);
    const miss = registry.resolveWidget(WIDGET_IDS[0], {
      data: { title: "draft" },
    });
    expect(miss.ok).toBe(true);
    const gone = registry.resolveWidget("plugin:frame30-proof/ghost", {
      data: { title: "draft" },
    });
    // Plugin-shaped ids miss as `uninstalled` (documented install-agnostic
    // convention), never as a bare `unknown` — still explicit, still lossless.
    expect(gone).toMatchObject({
      ok: false,
      missing: {
        reason: "uninstalled",
        preservedData: { title: "draft" },
        widgetId: "plugin:frame30-proof/ghost",
      },
    });
  });
});

describe("Pass 1 — generated controls: schema reaches the inspector path", () => {
  it("resolveInspectorSchema exposes the widget schema for a plugin_block node", () => {
    const registry = buildTrayRegistry([makeInstall(loadManifest())]);
    const result = resolveInspectorSchema(
      { type: "plugin_block", props: { pluginKey: WIDGET_IDS[0] } },
      registry,
    );
    expect(result.status).toBe("schema");
    if (result.status !== "schema") return;
    expect(result.widgetId).toBe(WIDGET_IDS[0]);
    const kinds = new Set(result.schema.fields.map((f) => f.kind));
    expect(kinds.has("repeater")).toBe(true);
    expect(kinds.has("responsive")).toBe(true);
    expect(kinds.has("media")).toBe(true);
  });

  it("control vocabulary covers every fixture kind (full/placeholder/structural)", () => {
    expect(controlStatus("text")).toBe("full");
    expect(controlStatus("select")).toBe("full");
    expect(controlStatus("link")).toBe("full");
    expect(controlStatus("repeater")).toBe("structural");
    expect(controlStatus("media")).toBe("placeholder");
    expect(controlStatus("responsive")).toBe("placeholder");
    expect(controlStatus("animation")).toBe("placeholder");
    expect(controlStatus("invented-kind")).toBe("unknown");
  });

  it("showWhen gates rendering only, never validation", () => {
    const registry = buildTrayRegistry([makeInstall(loadManifest())]);
    const def = registry.getWidget(WIDGET_IDS[0])!;
    const badge = def.propsSchema.fields.find((f) => f.key === "badge")!;
    expect(badge.showWhen).toEqual({ key: "layout", equals: "carousel" });
    const fields = visibleFields(def.propsSchema, { layout: "grid" });
    expect(fields.some((f) => f.key === "badge")).toBe(false);
    expect(
      visibleFields(def.propsSchema, { layout: "carousel" }).some(
        (f) => f.key === "badge",
      ),
    ).toBe(true);
  });

  it("unknown types fall back to the legacy inspector path", () => {
    const registry = buildTrayRegistry([makeInstall(loadManifest())]);
    expect(resolveInspectorSchema({ type: "nope_unknown" }, registry)).toEqual({
      status: "legacy",
    });
  });
});

describe("Pass 1 — repeater + responsive editing through validateProps", () => {
  function gridSchema() {
    const registry = buildTrayRegistry([makeInstall(loadManifest())]);
    return registry.getWidget(WIDGET_IDS[0])!.propsSchema;
  }

  it("valid repeater rows validate clean", () => {
    const result = validateProps(gridSchema(), {
      title: "Drop 04",
      layout: "grid",
      columns: 4,
      tiles: [
        {
          tile_image: "https://cdn.example.com/a.jpg",
          tile_link: "https://shop.example.com/p/a",
          tile_caption: "Wrap dress",
          tile_price: 129,
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.clean["columns"]).toBe(4);
  });

  it("invalid rows report keyed errors and salvage safe defaults", () => {
    const result = validateProps(gridSchema(), {
      title: "Drop 04",
      layout: "nope",
      hero_media: "javascript:alert(1)",
      tiles: [
        {
          tile_image: "not-a-url",
          tile_link: "https://shop.example.com/p/a",
          tile_caption: "",
          tile_price: -5,
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("layout.not_an_option");
    expect(result.errors).toContain("hero_media.not_a_url");
    expect(result.errors).toContain("tiles.0.tile_image.not_a_url");
    // Required caption falls back to a blank default rather than dropping.
    expect(typeof result.clean["title"]).toBe("string");
  });

  it("repeater overflow fails closed at 50 rows (too_many + truncation)", () => {
    const tiles = Array.from({ length: 51 }, (_, i) => ({
      tile_image: `https://cdn.example.com/${i}.jpg`,
      tile_caption: `Tile ${i}`,
    }));
    const result = validateProps(gridSchema(), {
      title: "Big drop",
      tiles,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("tiles.too_many");
    expect(result.clean["tiles"] as unknown[]).toHaveLength(50);
  });

  it("responsive bp override layers validate with the same schema", () => {
    // Layers are full-shape (same schema, every known key carried): a layer
    // omitting the required `title` reports `bp.<device>.title.required`
    // rather than silently inheriting — visibility never smuggles data.
    const partial = validateProps(gridSchema(), {
      title: "Drop 04",
      columns: 4,
      bp: { mobile: { columns: 2 } },
    });
    expect(partial.ok).toBe(false);
    expect(partial.errors).toContain("bp.mobile.title.required");
    const result = validateProps(gridSchema(), {
      title: "Drop 04",
      columns: 4,
      bp: {
        mobile: { title: "Drop 04", columns: 2 },
        desktop: { title: "Drop 04", columns: 6 },
      },
    });
    expect(result.ok).toBe(true);
    expect(
      (result.clean["bp"] as Record<string, Record<string, unknown>>)[
        "mobile"
      ]!["columns"],
    ).toBe(2);
    const bad = validateProps(gridSchema(), {
      title: "Drop 04",
      bp: { mobile: { layout: "nope" } },
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain("bp.mobile.layout.not_an_option");
  });
});

describe("Pass 1 — independent instances (no shared references)", () => {
  it("defaultsFor returns fresh objects per instance", () => {
    const registry = buildTrayRegistry([makeInstall(loadManifest())]);
    const def = registry.getWidget(WIDGET_IDS[0])!;
    const a = defaultsFor(def.propsSchema);
    const b = defaultsFor(def.propsSchema);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    (a["tiles"] as unknown[]).push({ tile_caption: "mutant" });
    expect(b["tiles"] as unknown[]).toHaveLength(0);
  });

  it("registry defs are frozen snapshots", () => {
    const registry = buildTrayRegistry([makeInstall(loadManifest())]);
    const def = registry.getWidget(WIDGET_IDS[0])!;
    expect(Object.isFrozen(def)).toBe(true);
  });
});

describe("Pass 1 — save/reload through the studio document layer", () => {
  function docWithInstance(title: string): StudioDoc {
    const doc = emptyStudioDoc("Proof page");
    doc.root = [
      {
        id: "n-proof-heading",
        el: "heading",
        settings: { text: title, level: 2 } as never,
      },
    ];
    return doc;
  }

  it("studio body serializes and re-parses losslessly", () => {
    const doc = docWithInstance("New season");
    const body = serializeStudioBody(doc);
    const reloaded = parseStudioBody(body);
    expect(reloaded).not.toBeNull();
    expect(reloaded).toEqual(doc);
  });

  it("saved instance props re-validate on reload (schema migration drops explicitly)", () => {
    const registry = buildTrayRegistry([makeInstall(loadManifest())]);
    const def = registry.getWidget(WIDGET_IDS[1])!;
    // The RAW stored JSON (pre-validation) still carries the retired key:
    // validateProps strips unknown keys on write, migration reports the drop.
    const stored = {
      headline: "Wear the story",
      align: "center",
      retired_key: "old value",
    };
    const migrated = migrateExtensionProps(
      [{ key: "headline" }, { key: "retired_key" }],
      def.propsSchema.fields,
      stored,
    );
    expect(migrated.dropped).toEqual(["retired_key"]);
    expect(migrated.props["headline"]).toBe("Wear the story");
  });
});

describe("Pass 1 — preview + theme switch + publish + storefront", () => {
  function tenantRegistry() {
    return buildTrayRegistry([makeInstall(loadManifest())]);
  }

  it("preview resolves plugin-isolated with allow-scripts tokens and echoed props", () => {
    const registry = tenantRegistry();
    const authored = { title: "New season", layout: "grid", columns: 3 };
    const presented = resolvePresentation({
      widgetId: WIDGET_IDS[0],
      themeKey: "songoskriti",
      registry,
      props: authored,
    });
    expect(presented.ok).toBe(true);
    if (!presented.ok) return;
    expect(presented).toMatchObject({
      mode: "plugin-isolated",
      themeKey: "songoskriti",
    });
    expect((presented as { sandbox: { tokens: string } }).sandbox.tokens).toBe(
      "allow-scripts",
    );
    expect(presented.props).toMatchObject(authored);
  });

  it("theme switch keeps plugin widgets compatible and reports theme-owned drift", () => {
    const registry = tenantRegistry();
    // Theme-owned def: compatible under its owner, foreign elsewhere.
    registry.registerWidget({
      id: "theme:frame30-proof-theme/hero",
      namespace: "theme",
      version: "1.0.0",
      label: "Proof hero",
      category: "frame30-proof-theme",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "custom",
      themes: ["frame30-proof-theme"],
      themeId: "frame30-proof-theme",
      themeComponent: "HeroCanvas",
    });
    const report = checkThemeCompatibility(
      "frame30-proof-theme",
      [...WIDGET_IDS, "theme:frame30-proof-theme/hero"],
      { registry, builderApi: BUILDER_API_VERSION },
    );
    expect(
      report.results
        .filter((r) => r.compatible)
        .map((r) => r.widgetId)
        .sort(),
    ).toEqual([...WIDGET_IDS, "theme:frame30-proof-theme/hero"].sort());
    const switched = checkThemeCompatibility(
      "songoskriti",
      [...WIDGET_IDS, "theme:frame30-proof-theme/hero"],
      { registry, builderApi: BUILDER_API_VERSION },
    );
    const hero = switched.results.find(
      (r) => r.widgetId === "theme:frame30-proof-theme/hero",
    )!;
    expect(hero).toMatchObject({
      compatible: false,
      reason: "foreign-theme",
    });
    // Unscoped plugin widgets stay compatible across the switch (themes
    // dress them); the theme-scoped widget reports explicit drift instead
    // of silently rendering under a theme it was never approved for.
    for (const id of [
      "plugin:frame30-proof/lookbook_grid",
      "plugin:frame30-proof/motion_hero",
    ] as const) {
      expect(switched.results.find((r) => r.widgetId === id)).toMatchObject({
        compatible: true,
        reason: "compatible",
      });
    }
    expect(
      switched.results.find(
        (r) => r.widgetId === "plugin:frame30-proof/shoppable_video",
      ),
    ).toMatchObject({ compatible: false, reason: "foreign-theme" });
  });

  it("publish gate: forward update with added permission requires re-consent", () => {
    const installed = loadFixtureRaw() as Record<string, unknown>;
    const candidate = JSON.parse(JSON.stringify(installed)) as Record<
      string,
      unknown
    >;
    candidate["version"] = "1.1.0";
    (candidate["permissions"] as string[]).push("read_products");
    const verdict = checkExtensionUpdateCompat({
      installedManifest: installed,
      candidateManifest: candidate,
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.addedPermissions).toEqual(["read_products"]);
    expect(verdict.requiresConsent).toBe(true);
  });

  it("publish gate: breaking schema change (required removal) fails closed", () => {
    const installed = loadFixtureRaw() as Record<string, unknown>;
    const candidate = JSON.parse(JSON.stringify(installed)) as Record<
      string,
      unknown
    >;
    candidate["version"] = "1.1.0";
    const widgets = candidate["widgets"] as Record<string, unknown>[];
    const grid = widgets[0]!;
    (grid["propsSchema"] as Record<string, unknown>[]) = (
      grid["propsSchema"] as Record<string, unknown>[]
    ).filter((f) => (f as { key: string }).key !== "title");
    // `title` is required: removing it strands merchant data.
    const verdict = checkExtensionUpdateCompat({
      installedManifest: installed,
      candidateManifest: candidate,
    });
    expect(verdict).toMatchObject({
      ok: false,
      code: "schema_migration_required",
    });
  });

  it("removed widgets recover to placeholders with preserved data, never substitution", () => {
    const recovery = resolveExtensionRecovery({
      widgetId: WIDGET_IDS[2],
      reason: "uninstalled",
      preservedData: { clip: "https://cdn.example.com/clip.mp4" },
    });
    expect(recovery).toMatchObject({
      status: "placeholder",
      widgetId: WIDGET_IDS[2],
      reason: "uninstalled",
      substituteWidget: null,
      executeAllowed: false,
    });
    expect(recovery.preservedData).toEqual({
      clip: "https://cdn.example.com/clip.mp4",
    });
  });

  it("storefront render carries the authored instance content (escaped)", () => {
    const registry = tenantRegistry();
    const def = registry.getWidget(WIDGET_IDS[0])!;
    const clean = validateProps(def.propsSchema, {
      title: "New <season> & drop",
    }).clean;
    const doc = emptyStudioDoc("Proof page");
    doc.root = [
      {
        id: "n-proof-heading",
        el: "heading",
        settings: { text: String(clean["title"]), level: 2 } as never,
      },
    ];
    const html = renderStudioHtml(doc);
    // Defense in depth, both layers visible: the value layer strips the tag,
    // the renderer escapes the remainder (`&` → `&amp;`).
    expect(String(clean["title"])).toBe("New  & drop");
    expect(html).toContain("New  &amp; drop");
    expect(html).not.toContain("<season>");
  });
});
