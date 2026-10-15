/**
 * Frame30 — optional per-widget props schema (`propsSchema`/`defaultProps`).
 *
 * Covers: gate acceptance + normalization, keyed rejections (bad
 * kind/options/keys, unknown widget- and field-level keys), legacy
 * byte-identical behavior when the new keys are absent, adapter carry-over
 * (per-widget failure granularity), and a reviews-carousel-shaped fixture
 * end-to-end through parse → adapter → `validateProps`/`defaultsFor`.
 */
import { describe, expect, it } from "vitest";
import {
  parseManifest,
  type InstalledPlugin,
  type PluginWidgetDef,
} from "./plugin-manifest";
import {
  createWidgetRegistry,
  fromPluginManifest,
} from "./unified-widget-registry";
import { defaultsFor, validateProps } from "./widget-props";

const ENTRY = "framique.mount(document.createTextNode('reviews'))";

function baseManifest(widgets: unknown[]) {
  return {
    id: "reviews-co",
    name: "Reviews Co",
    version: "1.0.0",
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets,
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
  };
}

function legacyWidget() {
  return { key: "badge", label: "Badge", slots: ["main"], entry: ENTRY };
}

/** Reviews-carousel shape: heading text, color, image, repeater of slides. */
function carouselWidget() {
  return {
    key: "reviews_carousel",
    label: "Reviews carousel",
    slots: ["main"],
    entry: ENTRY,
    propsSchema: [
      {
        key: "heading",
        label: "Heading",
        kind: "text",
        default: "Loved by shoppers",
      },
      { key: "accent", label: "Accent", kind: "color", default: "#0f766e" },
      { key: "banner", label: "Banner", kind: "image" },
      {
        key: "slides",
        label: "Slides",
        kind: "repeater",
        fields: [
          { key: "quote", label: "Quote", kind: "text" },
          { key: "author", label: "Author", kind: "text" },
          { key: "photo", label: "Photo", kind: "image" },
        ],
      },
    ],
    defaultProps: {
      heading: "What shoppers say",
      slides: [
        {
          quote: "Fast delivery, great quality.",
          author: "Ayesha",
          photo: "",
        },
        { quote: "Will order again.", author: "Rahim", photo: "" },
      ],
    },
  };
}

function installOf(widget: PluginWidgetDef): InstalledPlugin {
  return {
    installId: "inst-reviews-co",
    manifest: {
      id: "reviews-co",
      name: "Reviews Co",
      version: "1.0.0",
      api: "^3.0.0",
      permissions: ["read_shop", "render_storefront"],
      widgets: [widget],
      hooks: [],
      settings: [],
      i18n: { en: {}, bn: {} },
      budget: { jsKb: 10, mainThreadMs: 5 },
    },
    grantedScopes: ["read_shop", "render_storefront"],
    settings: {},
    enabled: true,
  };
}

describe("plugin per-widget schema — gate", () => {
  it("leaves legacy widgets byte-identical when the new keys are absent", () => {
    const verdict = parseManifest(baseManifest([legacyWidget()]));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const w = verdict.manifest.widgets[0]!;
    expect("propsSchema" in w).toBe(false);
    expect("defaultProps" in w).toBe(false);
    expect(Object.keys(w).sort()).toEqual(
      ["entry", "height", "key", "label", "slots"].sort(),
    );
  });

  it("accepts and normalizes propsSchema + defaultProps", () => {
    const verdict = parseManifest(baseManifest([carouselWidget()]));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const w = verdict.manifest.widgets[0]!;
    expect(w.propsSchema).toHaveLength(4);
    expect(w.propsSchema![0]).toMatchObject({
      key: "heading",
      label: "Heading",
      kind: "text",
      default: "Loved by shoppers",
    });
    const slides = w.propsSchema!.find((f) => f.key === "slides")!;
    expect(slides.kind).toBe("repeater");
    expect(slides.fields!.map((f) => f.key)).toEqual([
      "quote",
      "author",
      "photo",
    ]);
    expect(w.defaultProps).toMatchObject({ heading: "What shoppers say" });
  });

  it("rejects a bad kind with a keyed error", () => {
    const verdict = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          propsSchema: [{ key: "xx", label: "X", kind: "slider" }],
        },
      ]),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("widgets[0].propsSchema[0].kind");
  });

  it("rejects an option-less select with a keyed error", () => {
    const verdict = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          propsSchema: [{ key: "layout", label: "Layout", kind: "select" }],
        },
      ]),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("widgets[0].propsSchema[0].options");
  });

  it("rejects a bad field key with its index in the error", () => {
    const verdict = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          propsSchema: [
            { key: "ok_key", label: "Ok", kind: "text" },
            { key: "Bad Key!", label: "Bad", kind: "text" },
          ],
        },
      ]),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("widgets[0].propsSchema[1].key");
  });

  it("rejects unknown widget-level keys", () => {
    const verdict = parseManifest(
      baseManifest([{ ...legacyWidget(), bogus: 1 }]),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("widgets[0].bogus");
  });

  it("rejects unknown field-level keys", () => {
    const verdict = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          propsSchema: [{ key: "x", label: "X", kind: "text", bogus: 1 }],
        },
      ]),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("widgets[0].propsSchema[0].bogus");
  });

  it("rejects a non-array schema and non-record defaultProps", () => {
    const badSchema = parseManifest(
      baseManifest([{ ...legacyWidget(), propsSchema: { heading: 1 } }]),
    );
    expect(badSchema.ok).toBe(false);
    if (!badSchema.ok)
      expect(badSchema.errors).toContain("widgets[0].propsSchema");
    const badDefaults = parseManifest(
      baseManifest([{ ...legacyWidget(), defaultProps: ["nope"] }]),
    );
    expect(badDefaults.ok).toBe(false);
    if (!badDefaults.ok)
      expect(badDefaults.errors).toContain("widgets[0].defaultProps");
  });

  it("rejects malformed nested repeater fields with nested paths", () => {
    const notArray = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          propsSchema: [
            { key: "slides", label: "Slides", kind: "repeater", fields: {} },
          ],
        },
      ]),
    );
    expect(notArray.ok).toBe(false);
    if (!notArray.ok)
      expect(notArray.errors).toContain("widgets[0].propsSchema[0].fields");
    const badNestedKind = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          propsSchema: [
            {
              key: "slides",
              label: "Slides",
              kind: "repeater",
              fields: [
                { key: "quote", label: "Quote", kind: "text" },
                { key: "photo", label: "Photo", kind: "pic" },
              ],
            },
          ],
        },
      ]),
    );
    expect(badNestedKind.ok).toBe(false);
    if (!badNestedKind.ok)
      expect(badNestedKind.errors).toContain(
        "widgets[0].propsSchema[0].fields[1].kind",
      );
  });

  it("dedupes repeated schema keys first-wins, like manifest settings", () => {
    const verdict = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          propsSchema: [
            { key: "heading", label: "First", kind: "text" },
            { key: "heading", label: "Second", kind: "text" },
          ],
        },
      ]),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.manifest.widgets[0]!.propsSchema).toHaveLength(1);
    expect(verdict.manifest.widgets[0]!.propsSchema![0]!.label).toBe("First");
  });
});

describe("plugin per-widget schema — adapter", () => {
  it("keeps legacy widgets exactly on defaults {} + empty schema", () => {
    const verdict = parseManifest(baseManifest([legacyWidget()]));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const defs = fromPluginManifest([
      {
        ...installOf(verdict.manifest.widgets[0]!),
        manifest: verdict.manifest,
      },
    ]);
    expect(defs).toHaveLength(1);
    expect(defs[0]!.defaults).toEqual({});
    expect(defs[0]!.propsSchema).toEqual({ fields: [] });
  });

  it("carries a real schema and validated defaults into the WidgetDef", () => {
    const verdict = parseManifest(baseManifest([carouselWidget()]));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const defs = fromPluginManifest([
      {
        ...installOf(verdict.manifest.widgets[0]!),
        manifest: verdict.manifest,
      },
    ]);
    expect(defs).toHaveLength(1);
    const def = defs[0]!;
    expect(def.propsSchema.fields.map((f) => f.key)).toEqual([
      "heading",
      "accent",
      "banner",
      "slides",
    ]);
    // defaultProps wins over the schema default; missing keys fall back.
    expect(def.defaults.heading).toBe("What shoppers say");
    expect(def.defaults.accent).toBe("#0f766e");
    expect(def.defaults.banner).toBe("");
    expect(def.defaults.slides).toHaveLength(2);
    // Adapter output registers through the same path as every other tier.
    expect(createWidgetRegistry().registerWidget(def).ok).toBe(true);
  });

  it("strips defaultProps keys outside the schema", () => {
    const widget = {
      ...carouselWidget(),
      defaultProps: { ...(carouselWidget().defaultProps as object), rogue: 1 },
    };
    const verdict = parseManifest(baseManifest([widget]));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const defs = fromPluginManifest([
      {
        ...installOf(verdict.manifest.widgets[0]!),
        manifest: verdict.manifest,
      },
    ]);
    expect(defs[0]!.defaults).not.toHaveProperty("rogue");
  });

  it("fails an invalid per-widget schema for that widget only, never the manifest", () => {
    const good = parseManifest(baseManifest([carouselWidget()]));
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    // Hand-built past the gate: a bad kind the gate would reject.
    const badWidget = {
      key: "broken",
      label: "Broken",
      slots: ["main"],
      entry: ENTRY,
      propsSchema: [{ key: "x", label: "X", kind: "slider" }],
    } as unknown as PluginWidgetDef;
    const installed: InstalledPlugin = {
      ...installOf(good.manifest.widgets[0]!),
      manifest: {
        ...good.manifest,
        widgets: [good.manifest.widgets[0]!, badWidget],
      },
    };
    const defs = fromPluginManifest([installed]);
    expect(defs.map((d) => d.id)).toEqual([
      "plugin:reviews-co/reviews_carousel",
    ]);
  });

  it("skips a widget with non-record defaultProps instead of failing the manifest", () => {
    const good = parseManifest(baseManifest([carouselWidget()]));
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    const badWidget = {
      key: "broken",
      label: "Broken",
      slots: ["main"],
      entry: ENTRY,
      defaultProps: 42,
    } as unknown as PluginWidgetDef;
    const installed: InstalledPlugin = {
      ...installOf(good.manifest.widgets[0]!),
      manifest: {
        ...good.manifest,
        widgets: [good.manifest.widgets[0]!, badWidget],
      },
    };
    expect(fromPluginManifest([installed]).map((d) => d.id)).toEqual([
      "plugin:reviews-co/reviews_carousel",
    ]);
  });
});

describe("plugin per-widget schema — reviews-carousel end to end", () => {
  function adapted() {
    const verdict = parseManifest(baseManifest([carouselWidget()]));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("fixture rejected");
    const defs = fromPluginManifest([
      {
        ...installOf(verdict.manifest.widgets[0]!),
        manifest: verdict.manifest,
      },
    ]);
    if (defs.length !== 1) throw new Error("adapter dropped the widget");
    return defs[0]!;
  }

  it("validates merchant props through the value layer", () => {
    const def = adapted();
    const out = validateProps(def.propsSchema, {
      heading: "Top reviews",
      accent: "#ff0000",
      banner: "https://cdn.example.com/b.png",
      slides: [
        { quote: "Excellent.", author: "Nusrat", photo: "" },
        { quote: "Superb.", author: "Karim", photo: "" },
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.clean.heading).toBe("Top reviews");
    expect(
      (out.clean.slides as { author: string }[]).map((s) => s.author),
    ).toEqual(["Nusrat", "Karim"]);
  });

  it("reports keyed value errors for bad merchant input", () => {
    const def = adapted();
    const out = validateProps(def.propsSchema, { accent: "red" });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain("accent.not_a_color");
  });

  it("derives deep defaults for every schema key", () => {
    const def = adapted();
    const d = defaultsFor(def.propsSchema);
    expect(Object.keys(d).sort()).toEqual(
      ["accent", "banner", "heading", "slides"].sort(),
    );
    expect(d.heading).toBe("Loved by shoppers");
  });
});
