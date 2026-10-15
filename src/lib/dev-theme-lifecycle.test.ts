/**
 * Level B per-widget lifecycle — TDD vectors (frame30 task).
 *
 * Pass 1 (per-widget schemas): theme-level `settings` stay SHARED (every
 * section def carries them); a section's own `settings` array (forward-
 * compatible — the frozen manifest gate ignores it) becomes that def's
 * per-widget extension. Declarative modifiers select richer EXISTING kinds
 * only (`multiline` text → richtext, `multiple` product-selection →
 * repeater-of-product); no new kind vocabulary is invented.
 *
 * Pass 2 (lifecycle): manifest → defs → fresh-registry registration →
 * themeTrayEntries discovery → extension insert → validateProps →
 * bridge preview payload (component id + validated instance data).
 *
 * Pass 3 (adversarial): unapproved/inactive/foreign manifests never yield
 * defs; foreign-theme ids never resolve to an owner definition; hostile
 * values are neutralized by validateProps with the bridge as backstop;
 * theme switching swaps definitions cleanly (fresh registry per theme).
 */
import { describe, expect, it } from "vitest";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";
import { PROP_KINDS, defaultsFor, validateProps } from "./widget-props";
import {
  activeDevThemeWidgetDefs,
  fromDevThemeManifest,
} from "./dev-theme-widgets";
import { createWidgetRegistry } from "./unified-widget-registry";
import {
  checkThemeCompatibility,
  resolvePresentation,
  themeTrayEntries,
} from "./widget-presentation";
import { buildExtensionInsert } from "@/components/builder/studio/plugin-tray";
import { buildThemePreviewEnvelope } from "@/components/theme-runtime/bridge-v2";

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

describe("per-widget schemas — shared stays shared, section fields stay local", () => {
  it("every def carries the shared settings; section settings land only on their owner", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        sections: [
          {
            key: "hero",
            slot: "main",
            component: "HeroCanvas",
            settings: [
              { key: "kicker", label: "Kicker", type: "text" },
              { key: "palette", label: "Palette", type: "color" },
            ],
          },
          { key: "webgl-scene", slot: "main", component: "WebglScene" },
        ],
      }),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const [hero, scene] = verdict.defs;
    const heroKeys = hero!.propsSchema.fields.map((f) => f.key);
    const sceneKeys = scene!.propsSchema.fields.map((f) => f.key);
    // Shared across sections stays shared.
    for (const shared of [
      "headline",
      "backdrop",
      "accent",
      "gap",
      "featured",
      "motion",
    ]) {
      expect(heroKeys).toContain(shared);
      expect(sceneKeys).toContain(shared);
    }
    // Widget-specific becomes per-widget propsSchema + defaults.
    expect(heroKeys).toContain("kicker");
    expect(heroKeys).toContain("palette");
    expect(sceneKeys).not.toContain("kicker");
    expect(sceneKeys).not.toContain("palette");
    expect(Object.keys(hero!.defaults)).toContain("kicker");
    expect(Object.keys(scene!.defaults)).not.toContain("kicker");
  });

  it("modifier grades map onto existing kinds only (multiline→richtext, multiple→repeater)", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        settings: [
          { key: "body", label: "Body", type: "text", multiline: true },
          {
            key: "lineup",
            label: "Lineup",
            type: "product-selection",
            multiple: true,
          },
          { key: "title", label: "Title", type: "text" },
          { key: "pick", label: "Pick", type: "product-selection" },
        ],
      }),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const byKey = new Map(
      verdict.defs[0]!.propsSchema.fields.map((f) => [f.key, f]),
    );
    expect(byKey.get("body")?.kind).toBe("richtext");
    expect(byKey.get("title")?.kind).toBe("text");
    const lineup = byKey.get("lineup");
    expect(lineup?.kind).toBe("repeater");
    expect(lineup?.fields?.map((f) => f.kind)).toEqual(["product"]);
    expect(byKey.get("pick")?.kind).toBe("product");
    // No new kind vocabulary anywhere.
    const kinds = new Set(PROP_KINDS as readonly string[]);
    for (const def of verdict.defs) {
      const walk = (fields: typeof def.propsSchema.fields): void => {
        for (const f of fields) {
          expect(kinds.has(f.kind)).toBe(true);
          if (f.fields) walk(f.fields);
        }
      };
      walk(def.propsSchema.fields);
    }
  });

  it("carries declared modifiers (required/default/help/bounds) and defaults validate", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        settings: [
          {
            key: "title",
            label: "Title",
            type: "text",
            required: true,
            default: "Hello",
            help: "Card heading",
            max: 120,
          },
        ],
      }),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const field = verdict.defs[0]!.propsSchema.fields[0]!;
    expect(field.required).toBe(true);
    expect(field.default).toBe("Hello");
    expect(field.help).toBe("Card heading");
    expect(field.max).toBe(120);
    expect(verdict.defs[0]!.defaults.title).toBe("Hello");
    // Declared defaults always validate through the shared value layer.
    for (const def of verdict.defs) {
      const checked = validateProps(def.propsSchema, def.defaults);
      expect(checked.errors).toEqual([]);
    }
  });

  it("claims its theme so the tray can discover it, with a usable label", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        sections: [
          {
            key: "hero",
            slot: "main",
            component: "HeroCanvas",
            label: "Lookbook hero",
          },
        ],
      }),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.defs[0]!.themes).toEqual(["aurora-lookbook"]);
    expect(verdict.defs[0]!.label).toBe("Lookbook hero");
    expect(verdict.defs[0]!.category).toBe("aurora-lookbook");
  });

  it("sections without extras stay byte-compatible (shared schema, key label)", () => {
    const verdict = fromDevThemeManifest(manifest());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
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
    expect(verdict.defs[0]!.label).toBe("hero");
  });

  it("defs never share schema references (mutating one def cannot move another)", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        settings: [
          {
            key: "lineup",
            label: "Lineup",
            type: "product-selection",
            multiple: true,
          },
        ],
      }),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const [a, b] = verdict.defs;
    expect(a!.propsSchema.fields).not.toBe(b!.propsSchema.fields);
    expect(a!.propsSchema.fields[0]).not.toBe(b!.propsSchema.fields[0]);
    expect(a!.propsSchema.fields[0]!.fields).not.toBe(
      b!.propsSchema.fields[0]!.fields,
    );
    expect(a!.defaults).not.toBe(b!.defaults);
  });
});

describe("per-widget refusals — fail closed, never partial", () => {
  it("refuses an unknown section-setting type without inventing a kind", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        sections: [
          {
            key: "hero",
            slot: "main",
            component: "HeroCanvas",
            settings: [{ key: "code", label: "Code", type: "code" }],
          },
          { key: "webgl-scene", slot: "main", component: "WebglScene" },
        ],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/unknown_setting_type/);
  });

  it("refuses keys shared between theme settings and section settings (no silent mixing)", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        sections: [
          {
            key: "hero",
            slot: "main",
            component: "HeroCanvas",
            settings: [{ key: "headline", label: "Other", type: "text" }],
          },
          { key: "webgl-scene", slot: "main", component: "WebglScene" },
        ],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/duplicate_setting:headline/);
  });

  it("refuses duplicate shared setting keys", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        settings: [
          { key: "headline", label: "A", type: "text" },
          { key: "headline", label: "B", type: "text" },
        ],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/duplicate_setting:headline/);
  });

  it("refuses the reserved bp key (responsive layers are host-owned)", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        settings: [{ key: "bp", label: "BP", type: "text" }],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/reserved_setting_key/);
  });

  it("refuses malformed section settings (non-array, shapeless entries)", () => {
    const badArray = fromDevThemeManifest(
      manifest({
        sections: [
          {
            key: "hero",
            slot: "main",
            component: "HeroCanvas",
            settings: "headline",
          },
          { key: "webgl-scene", slot: "main", component: "WebglScene" },
        ],
      }),
    );
    expect(badArray.ok).toBe(false);
    const badEntry = fromDevThemeManifest(
      manifest({
        sections: [
          {
            key: "hero",
            slot: "main",
            component: "HeroCanvas",
            settings: [{ key: "!!!", label: "", type: "text" }],
          },
          { key: "webgl-scene", slot: "main", component: "WebglScene" },
        ],
      }),
    );
    expect(badEntry.ok).toBe(false);
  });

  it("refuses a def that would exceed the field cap", () => {
    const shared = Array.from({ length: 100 }, (_, i) => ({
      key: `s${i}`,
      label: `S ${i}`,
      type: "text",
    }));
    const extra = Array.from({ length: 30 }, (_, i) => ({
      key: `w${i}`,
      label: `W ${i}`,
      type: "text",
    }));
    const verdict = fromDevThemeManifest(
      manifest({
        settings: shared,
        sections: [
          {
            key: "hero",
            slot: "main",
            component: "HeroCanvas",
            settings: extra,
          },
          { key: "webgl-scene", slot: "main", component: "WebglScene" },
        ],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/too_many_fields:hero/);
  });
});

describe("lifecycle — discover → insert → edit → preview (uploaded theme)", () => {
  function adaptedRegistry() {
    const verdict = fromDevThemeManifest(
      manifest({
        sections: [
          {
            key: "hero",
            slot: "main",
            component: "HeroCanvas",
            settings: [{ key: "kicker", label: "Kicker", type: "text" }],
          },
          { key: "webgl-scene", slot: "main", component: "WebglScene" },
        ],
      }),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("fixture manifest refused");
    const registry = createWidgetRegistry();
    for (const def of verdict.defs) {
      expect(registry.registerWidget(def).ok).toBe(true);
    }
    return { verdict, registry };
  }

  it("discovers theme entries for the active theme only", () => {
    const { registry } = adaptedRegistry();
    const active = themeTrayEntries("aurora-lookbook", { registry });
    expect(active.ok).toBe(true);
    if (!active.ok) return;
    expect(active.entries.map((e) => e.id).sort()).toEqual([
      "theme:aurora-lookbook/hero",
      "theme:aurora-lookbook/webgl-scene",
    ]);
    expect(themeTrayEntries("some-other-theme", { registry }).ok).toBe(false);
  });

  it("inserts via the extension contract with schema-cleaned defaults", () => {
    const { verdict, registry } = adaptedRegistry();
    const def = verdict.defs[0]!;
    const inserted = buildExtensionInsert(
      registry,
      { widgetKey: def.id, slot: "main" },
      // buildExtensionInsert takes (registry, req) — exercised positionally.
    );
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.node.widgetKey).toBe("theme:aurora-lookbook/hero");
    expect(inserted.node.props.headline).toBe(
      defaultsFor(def.propsSchema).headline,
    );
    expect(inserted.node.props.kicker).toBe("");
    // Illegal slots fail closed (overlay sections never mis-slot into main).
    const overlay = fromDevThemeManifest(
      manifest({
        id: "overlay-theme",
        sections: [{ key: "drawer", slot: "drawer", component: "Drawer" }],
        settings: [],
      }),
    );
    expect(overlay.ok).toBe(true);
    if (!overlay.ok) return;
    const overlayRegistry = createWidgetRegistry();
    for (const d of overlay.defs) overlayRegistry.registerWidget(d);
    const refused = buildExtensionInsert(overlayRegistry, {
      widgetKey: "theme:overlay-theme/drawer",
      slot: "main",
    });
    expect(refused.ok).toBe(false);
  });

  it("edits validate through the shared value layer and preview the bridge payload", () => {
    const { verdict } = adaptedRegistry();
    const def = verdict.defs[0]!;
    // Hostile merchant values are neutralized: markup stripped, overlong
    // truncated with an error, unknown keys (price) dropped, not stored.
    const hostile = {
      headline: "<script>alert(1)</script>Sale",
      accent: "not-a-color",
      kicker: "x".repeat(9000),
      price: "9.99",
    };
    const checked = validateProps(def.propsSchema, hostile);
    expect(checked.ok).toBe(false);
    expect(checked.clean.headline).toBe("Sale");
    expect(checked.clean.accent).toBe("#000000");
    expect("price" in checked.clean).toBe(false);
    // The bridge consumes the intended component id + validated data —
    // assert the payload, not just frame existence.
    const built = buildThemePreviewEnvelope({
      widgetId: def.id,
      component: def.component,
      props: checked.clean,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.envelope.component).toBe("HeroCanvas");
    expect(built.envelope.widgetId).toBe("theme:aurora-lookbook/hero");
    expect(built.envelope.props).toEqual(checked.clean);
    // A later merchant edit re-validates and re-payloads cleanly.
    const edited = validateProps(def.propsSchema, {
      ...checked.clean,
      headline: "New headline",
    });
    expect(edited.ok).toBe(true);
    const rebuilt = buildThemePreviewEnvelope({
      widgetId: def.id,
      component: def.component,
      props: edited.clean,
    });
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;
    expect(rebuilt.envelope.props).toMatchObject({ headline: "New headline" });
  });
});

describe("adversarial — approval, foreign themes, switching, hostile data", () => {
  it("only the approved ACTIVE theme's own manifest adapts (all-or-nothing)", () => {
    const good = manifest();
    expect(
      activeDevThemeWidgetDefs({
        themeKey: "aurora-lookbook",
        manifest: good,
        isActive: true,
      }),
    ).toHaveLength(2);
    // Inactive, unkeyed, absent, malformed, wrong-lane, foreign → no defs.
    expect(
      activeDevThemeWidgetDefs({
        themeKey: "aurora-lookbook",
        manifest: good,
        isActive: false,
      }),
    ).toEqual([]);
    expect(
      activeDevThemeWidgetDefs({
        themeKey: "",
        manifest: good,
        isActive: true,
      }),
    ).toEqual([]);
    expect(
      activeDevThemeWidgetDefs({
        themeKey: "aurora-lookbook",
        manifest: null,
        isActive: true,
      }),
    ).toEqual([]);
    expect(
      activeDevThemeWidgetDefs({
        themeKey: "aurora-lookbook",
        manifest: { nope: true },
        isActive: true,
      }),
    ).toEqual([]);
    expect(
      activeDevThemeWidgetDefs({
        themeKey: "other-theme",
        manifest: good,
        isActive: true,
      }),
    ).toEqual([]);
    expect(
      activeDevThemeWidgetDefs({
        themeKey: "aurora-lookbook",
        manifest: { key: "aurora-lookbook", api: "^3.0.0" },
        isActive: true,
      }),
    ).toEqual([]);
    expect(
      activeDevThemeWidgetDefs({
        themeKey: null,
        manifest: undefined,
        isActive: true,
      }),
    ).toEqual([]);
  });

  it("foreign-theme ids never resolve to an owner definition", () => {
    const verdict = fromDevThemeManifest(manifest());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const registry = createWidgetRegistry();
    for (const def of verdict.defs) registry.registerWidget(def);
    const foreign = resolvePresentation({
      widgetId: "theme:aurora-lookbook/hero",
      themeKey: "some-other-theme",
      registry,
      props: {},
    });
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) return;
    expect(foreign.mode).toBe("theme-owned");
    if (foreign.mode !== "theme-owned") return;
    expect(foreign.presentation).toBe("recoverable-fallback");
    expect(foreign.renderer).toBeNull();
    const report = checkThemeCompatibility(
      "some-other-theme",
      ["theme:aurora-lookbook/hero"],
      { registry },
    );
    expect(report.results[0]).toMatchObject({
      compatible: false,
      reason: "foreign-theme",
    });
  });

  it("theme switching swaps definitions cleanly (stale theme absent)", () => {
    const a = fromDevThemeManifest(manifest());
    const b = fromDevThemeManifest(
      manifest({
        id: "midnight-bazaar",
        version: "2.0.0",
        sections: [{ key: "banner", slot: "main", component: "Banner" }],
      }),
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // The route builds a FRESH registry per active theme — never mutates a
    // shared one — so the stale theme's widgets are simply absent.
    const registryB = createWidgetRegistry();
    for (const def of b.defs) registryB.registerWidget(def);
    expect(registryB.resolveWidget("theme:aurora-lookbook/hero").ok).toBe(
      false,
    );
    expect(
      themeTrayEntries("aurora-lookbook", { registry: registryB }).ok,
    ).toBe(false);
    const trayB = themeTrayEntries("midnight-bazaar", { registry: registryB });
    expect(trayB.ok).toBe(true);
    if (!trayB.ok) return;
    expect(trayB.entries.map((e) => e.id)).toEqual([
      "theme:midnight-bazaar/banner",
    ]);
  });

  it("unapproved theme defs never enter the registry (wrong-lane + unknown type)", () => {
    const registry = createWidgetRegistry();
    const wrongLane = fromDevThemeManifest({
      key: "aurora-lookbook",
      api: "^3.0.0",
      presentationSurfaces: ["header"],
    });
    expect(wrongLane.ok).toBe(false);
    const unknownKind = fromDevThemeManifest(
      manifest({
        settings: [{ key: "code", label: "Code", type: "code" }],
      }),
    );
    expect(unknownKind.ok).toBe(false);
    // Nothing to register on refusal — the registry stays empty.
    expect(registry.widgetIds()).toEqual([]);
  });

  it("a schema-carried price key is sanitized by validateProps AND rejected by the bridge", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        settings: [{ key: "price", label: "Price note", type: "text" }],
      }),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const def = verdict.defs[0]!;
    const checked = validateProps(def.propsSchema, {
      price: "<img src=x onerror=alert(1)>100",
    });
    // Value layer: executable markup is gone (but the key survives — it is
    // schema-declared), so the bridge backstop must refuse the payload.
    expect(String(checked.clean.price)).not.toContain("<");
    const built = buildThemePreviewEnvelope({
      widgetId: def.id,
      component: def.component,
      props: checked.clean,
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toMatch(/theme\.forbidden_field/);
  });

  it("__proto__ payloads cannot pollute validated props", () => {
    const verdict = fromDevThemeManifest(manifest());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const def = verdict.defs[0]!;
    const hostile = JSON.parse(
      '{"headline":"hi","__proto__":{"polluted":true}}',
    );
    const checked = validateProps(def.propsSchema, hostile);
    expect(({} as Record<string, unknown>).polluted).toBe(undefined);
    expect(Object.getPrototypeOf(checked.clean)).toBe(Object.prototype);
    expect("polluted" in checked.clean).toBe(false);
  });

  it("oversize instance data is refused by the bridge, never truncated silently", () => {
    const verdict = fromDevThemeManifest(manifest());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const def = verdict.defs[0]!;
    const built = buildThemePreviewEnvelope({
      widgetId: def.id,
      component: def.component,
      props: { headline: "x".repeat(70 * 1024) },
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toMatch(/theme\.oversize/);
  });
});
