/**
 * Level B theme-owned widget schemas — TDD vectors.
 *
 * A reviewed theme's sections surface in the editor as `theme:` WidgetDefs
 * through the SAME value-layer shape every other tier uses (`PropField` from
 * `src/lib/widget-props.ts`, validated by `validateProps`/`defaultsFor`):
 * no new kind vocabulary is invented — the six closed Level B setting types
 * map 1:1 onto existing prop kinds (text→text, image→image, color→color,
 * spacing→spacing, product-selection→product, animation→animation).
 *
 * Storefront execution is NOT granted here: defs carry `renderer: "custom"`
 * (editor-only) and the storefront runs approved bundles exclusively inside
 * the sandboxed `ThemeRuntime` frame (see `dev-theme-sandbox.test.tsx`).
 * Registration itself goes through the shared `registerWidget` gate, so a
 * theme def that fails the registry contract never resolves.
 */
import { describe, expect, it } from "vitest";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";
import { PROP_KINDS, defaultsFor, validateProps } from "./widget-props";
import { devThemeWidgetId, fromDevThemeManifest } from "./dev-theme-widgets";

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "aurora-lookbook",
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation"],
    dependencies: [],
    sections: [
      { key: "hero", slot: "main", component: "HeroCanvas" },
      { key: "webgl-scene", slot: "main", component: "WebglScene" },
    ],
    settings: [
      { key: "headline", label: "Headline", type: "text" },
      { key: "backdrop", label: "Backdrop", type: "image" },
      { key: "accent", label: "Accent", type: "color" },
      { key: "gap", label: "Gap", type: "spacing" },
      { key: "featured", label: "Featured", type: "product-selection" },
      { key: "motion", label: "Motion", type: "animation" },
    ],
    ...over,
  };
}

describe("dev-theme widgets — theme-owned schemas in the value-layer shape", () => {
  it("maps one section to one theme: WidgetDef with the shared settings schema", () => {
    const verdict = fromDevThemeManifest(manifest());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.defs.map((d) => d.id)).toEqual([
      "theme:aurora-lookbook/hero",
      "theme:aurora-lookbook/webgl-scene",
    ]);
    for (const def of verdict.defs) {
      expect(def.namespace).toBe("theme");
      expect(def.renderer).toBe("custom");
      expect(def.version).toBe("1.0.0");
      expect(def.slots).toEqual(["main"]);
    }
  });

  it("invents no kinds: every field kind already exists in PROP_KINDS", () => {
    const verdict = fromDevThemeManifest(manifest());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const kinds = new Set(PROP_KINDS as readonly string[]);
    for (const def of verdict.defs) {
      for (const field of def.propsSchema.fields) {
        expect(kinds.has(field.kind)).toBe(true);
      }
    }
    expect(
      verdict.defs[0]!.propsSchema.fields.map((f) => `${f.key}:${f.kind}`),
    ).toEqual([
      "headline:text",
      "backdrop:image",
      "accent:color",
      "gap:spacing",
      "featured:product",
      "motion:animation",
    ]);
  });

  it("resolves through the shared registry gate and validates props", async () => {
    const verdict = fromDevThemeManifest(manifest());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const { createWidgetRegistry } = await import("./unified-widget-registry");
    const registry = createWidgetRegistry();
    for (const def of verdict.defs) {
      expect(registry.registerWidget(def).ok).toBe(true);
    }
    const resolved = registry.resolveWidget("theme:aurora-lookbook/hero");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.def.propsSchema.fields).toHaveLength(6);
    // Same value-layer shape: defaults + validation round-trip.
    const defaults = defaultsFor(resolved.def.propsSchema);
    expect(Object.keys(defaults).sort()).toEqual(
      ["accent", "backdrop", "featured", "gap", "headline", "motion"].sort(),
    );
    const checked = validateProps(resolved.def.propsSchema, {
      headline: "Hello",
      accent: "#ff0000",
    });
    expect(checked.clean.headline).toBe("Hello");
    expect(checked.clean.accent).toBe("#ff0000");
  });

  it("builds stable widget ids", () => {
    expect(devThemeWidgetId("aurora-lookbook", "hero")).toBe(
      "theme:aurora-lookbook/hero",
    );
  });

  it("a theme with no sections exposes no widgets (still valid)", () => {
    const verdict = fromDevThemeManifest(manifest({ sections: [] }));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.defs).toEqual([]);
  });
});

describe("dev-theme widgets — refusals", () => {
  it("refuses an unknown setting type without inventing a kind", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        settings: [{ key: "code", label: "Code", type: "code" }],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(
      /unknown settings type|unknown_setting_type/,
    );
  });

  it("refuses a data-only manifest with a wrong-lane code (frozen lane untouched)", () => {
    const verdict = fromDevThemeManifest({
      key: "aurora-lookbook",
      name: "Aurora",
      nameBn: "Aurora",
      version: "1.0.0",
      api: "^3.0.0",
      templates: ["index"],
      presentationSurfaces: ["header"],
      locales: ["en"],
      capabilities: ["render_storefront"],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/wrong_lane/);
  });

  it("refuses duplicate section keys", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        sections: [
          { key: "hero", slot: "main", component: "A" },
          { key: "hero", slot: "main", component: "B" },
        ],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/duplicate/);
  });

  it("refuses a non-object manifest", () => {
    expect(fromDevThemeManifest(null).ok).toBe(false);
  });
});
