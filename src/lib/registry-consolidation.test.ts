/**
 * Registry consolidation (P1/P2/P4/P5) — TDD contract.
 *
 * - P1: `WIDGET_REGISTRY` entries are a view over `catalogEntry(type)` +
 *   `OVERRIDES` + computed seo/skeleton/data: label/group/slots/fields/
 *   container are the catalogue's own references, overrides only add
 *   data/skeleton/seo.
 * - P2: `fromBuiltinWidgets` imports the widget registry and carries real
 *   inspector fields into `propsSchema` (never `[]` for catalogue widgets);
 *   every emitted def registers cleanly.
 * - P4: exact-version manifests are admitted when pinned to the running API
 *   and rejected otherwise — one semantics in both `satisfiesApiRange` and
 *   the `minApiFromRange` path behind `fromPluginManifest`.
 * - P5: `buildTrayRegistry(installed)` seeds one registry with every tier
 *   (builtin + studio + compatible plugins + best-effort singleton).
 */
import { describe, expect, it } from "vitest";
import { SECTION_CATALOG, catalogEntry, type SectionType } from "./builder-ast";
import {
  BUILDER_API_VERSION,
  satisfiesApiRange,
  type InstalledPlugin,
} from "./plugin-manifest";
import { WIDGET_REGISTRY, widgetMeta } from "./widget-registry";
import {
  buildTrayRegistry,
  createWidgetRegistry,
  fromBuiltinWidgets,
  fromPluginManifest,
} from "./unified-widget-registry";

function pluginInstall(
  id: string,
  opts: { api?: string; enabled?: boolean; version?: string } = {},
): InstalledPlugin {
  return {
    installId: `inst-${id}`,
    manifest: {
      id,
      name: `${id} plugin`,
      version: opts.version ?? "1.2.0",
      api: opts.api ?? "^3.0.0",
      permissions: ["render_storefront"],
      widgets: [
        {
          key: "reviews",
          label: "Reviews",
          slots: ["main"],
          entry: "reviews-entry.js",
          height: 320,
        },
      ],
      hooks: [],
      settings: [],
      i18n: { en: {}, bn: {} },
      budget: { jsKb: 10, mainThreadMs: 5 },
    },
    grantedScopes: ["render_storefront"],
    settings: {},
    enabled: opts.enabled ?? true,
  };
}

describe("P1 — registry is a view over the catalogue", () => {
  it("delegates label/group/slots/fields/container to the catalogue entry", () => {
    for (const entry of SECTION_CATALOG) {
      const meta = widgetMeta(entry.type)!;
      expect(meta, entry.type).toBeDefined();
      expect(meta.label, entry.type).toBe(entry.label);
      expect(meta.group, entry.type).toBe(entry.group);
      expect(meta.slots, entry.type).toBe(entry.slots);
      expect(meta.fields, entry.type).toBe(entry.fields);
      expect(meta.container, entry.type).toBe(entry.container === true);
    }
  });

  it("reads through catalogEntry, not a stale copy", () => {
    for (const type of Object.keys(WIDGET_REGISTRY) as SectionType[]) {
      const live = catalogEntry(type)!;
      const meta = WIDGET_REGISTRY[type];
      expect(meta.slots).toBe(live.slots);
      expect(meta.fields).toBe(live.fields);
    }
  });

  it("defaults seo.heading to the catalogue heading unless overridden", () => {
    const plain = SECTION_CATALOG.find(
      (e) => widgetMeta(e.type)?.seo.jsonLd === undefined,
    )!;
    expect(widgetMeta(plain.type)!.seo.heading).toBe(plain.heading);
    // Overridden entries keep their override (urgency_rail precedent).
    expect(widgetMeta("urgency_rail" as SectionType)!.data?.source).toBe(
      "collection",
    );
    expect(widgetMeta("category_header" as SectionType)!.seo.heading).toBe(
      true,
    );
  });
});

describe("P2 — builtin adapter carries real fields", () => {
  it("emits non-empty schemas for catalogue widgets, never the legacy []", () => {
    const defs = fromBuiltinWidgets();
    const byId = new Map(defs.map((d) => [d.id, d]));
    const hero = byId.get("builtin:hero")!;
    expect(hero).toBeDefined();
    expect(hero.propsSchema.fields.length).toBeGreaterThan(0);
    expect(hero.propsSchema.fields.length).toBe(
      catalogEntry("hero")!.fields.filter((f) => f.kind !== "menu").length,
    );
    // nav_menu carries everything: the menu tree adapts to a repeater of
    // flat link rows (label/href/type) instead of being dropped.
    const navMenu = byId.get("builtin:nav_menu");
    if (navMenu) {
      expect(navMenu.propsSchema.fields.length).toBe(
        catalogEntry("nav_menu")!.fields.length,
      );
      const items = navMenu.propsSchema.fields.find((f) => f.key === "items");
      expect(items?.kind).toBe("repeater");
      expect(items?.fields?.map((f) => f.key)).toEqual([
        "label",
        "href",
        "type",
      ]);
    }
  });

  it("maps every catalogue field kind to a registered prop kind", () => {
    const kinds = new Set(
      fromBuiltinWidgets().flatMap((d) =>
        d.propsSchema.fields.map((f) => f.kind),
      ),
    );
    // Live catalogue kinds today (census: text/textarea/number/select/url/
    // boolean/embed/bitext/image/menu/html/array). taxonomy/color/range/unit/
    // group have mapper branches but no live fields — they stay covered by
    // the "every def registers cleanly" test above.
    for (const kind of [
      "text",
      "richtext",
      "number",
      "boolean",
      "select",
      "link",
      "image",
      "repeater",
    ] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    expect(kinds.has("menu" as never)).toBe(false);
  });

  it("every emitted builtin def registers cleanly (no hostile drops)", () => {
    const reg = createWidgetRegistry();
    for (const def of fromBuiltinWidgets()) {
      const verdict = reg.registerWidget(def);
      expect(verdict.ok, def.id).toBe(true);
    }
  });

  it("carries select options and array row schemas", () => {
    const byId = new Map(fromBuiltinWidgets().map((d) => [d.id, d]));
    const grid = byId.get("builtin:product_grid")!;
    const density = grid.propsSchema.fields.find((f) => f.key === "density");
    expect(density?.kind).toBe("select");
    expect(density?.options?.length).toBeGreaterThan(0);
    const faq = byId.get("builtin:faq");
    if (faq) {
      const rows = faq.propsSchema.fields.find((f) => f.kind === "repeater");
      expect(rows?.fields?.length).toBeGreaterThan(0);
    }
  });
});

describe("P4 — one exact-version semantics", () => {
  it("admits an exact pin equal to the running API", () => {
    expect(satisfiesApiRange(BUILDER_API_VERSION)).toBe(true);
    expect(satisfiesApiRange(` ${BUILDER_API_VERSION} `)).toBe(true);
  });

  it("rejects an exact pin for any other API line", () => {
    expect(satisfiesApiRange("3.0.0", BUILDER_API_VERSION)).toBe(false);
    expect(satisfiesApiRange("2.9.9", BUILDER_API_VERSION)).toBe(false);
    expect(satisfiesApiRange("4.0.0", BUILDER_API_VERSION)).toBe(false);
  });

  it("keeps caret/pair/garbage behavior unchanged", () => {
    expect(satisfiesApiRange("^3.0.0")).toBe(true);
    expect(satisfiesApiRange("^2.0.0")).toBe(false);
    expect(satisfiesApiRange(">=3.0.0 <4.0.0")).toBe(true);
    expect(satisfiesApiRange("latest")).toBe(false);
  });

  it("fromPluginManifest admits the exact pin and records it as the floor", () => {
    const defs = fromPluginManifest([
      pluginInstall("acme", { api: BUILDER_API_VERSION }),
    ]);
    expect(defs).toHaveLength(1);
    expect(defs[0]!.minBuilderApi).toBe(BUILDER_API_VERSION);
    expect(
      fromPluginManifest([pluginInstall("acme", { api: "2.0.0" })]),
    ).toEqual([]);
  });
});

describe("P5 — single tray registry builder", () => {
  it("seeds builtin, studio and compatible plugin tiers in one registry", () => {
    const registry = buildTrayRegistry([pluginInstall("acme")]);
    expect(registry.resolveWidget("builtin:hero").ok).toBe(true);
    expect(registry.resolveWidget("builtin:product_grid").ok).toBe(true);
    const studioId = registry
      .widgetIds()
      .find((id) => id.startsWith("studio:"));
    expect(studioId).toBeDefined();
    expect(registry.resolveWidget("plugin:acme/reviews").ok).toBe(true);
  });

  it("excludes disabled and incompatible installs like the resolver", () => {
    const registry = buildTrayRegistry([
      pluginInstall("off", { enabled: false }),
      pluginInstall("ancient", { api: "^1.0.0" }),
    ]);
    expect(
      registry.resolveWidget("plugin:off/reviews", { data: {} }),
    ).toMatchObject({ ok: false });
    expect(
      registry.resolveWidget("plugin:ancient/reviews", { data: {} }),
    ).toMatchObject({ ok: false });
  });
});
