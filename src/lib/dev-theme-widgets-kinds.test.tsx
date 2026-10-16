/**
 * Level B inspector parity — nine new setting→kind mappings (TDD vectors).
 *
 * The value layer (`widget-props.ts`) + `SchemaControls` already support
 * far more than the six original Level B setting types. This suite proves
 * the adapter (`dev-theme-widgets.ts`) + allow-list
 * (`dev-theme-manifest.ts`) close the gap without weakening security:
 * number, boolean, select (closed options), link, group (nested,
 * flattened), repeater (rows), media, video, icon — each with the same
 * modifiers discipline (`required`/`default`/`help`/`min`/`max` only),
 * the existing hostile-shape rejections, depth/count limits on nesting,
 * and adversarial coverage (kind confusion, option injection, nested
 * bombs, media URL schemes, select without options).
 *
 * Rendering precedent: `renderToStaticMarkup` (see
 * `SchemaControls.test.tsx`) — the vitest environment is `node`, so
 * interaction is covered by `validateProps` round-trips, not DOM events.
 * `SchemaControls.tsx` itself is NOT modified here: these tests verify it
 * renders what the adapter emits.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  DEV_THEME_RUNTIME_VERSION,
  parseDevThemeManifest,
} from "./dev-theme-manifest";
import { PROP_KINDS, defaultsFor, validateProps } from "./widget-props";
import { fromDevThemeManifest } from "./dev-theme-widgets";
import { SchemaControls } from "@/components/builder/SchemaControls";
import { buildThemePreviewEnvelope } from "@/components/theme-runtime/bridge-v2";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

const noop = () => {};

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "aurora-lookbook",
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation"],
    dependencies: [],
    sections: [{ key: "hero", slot: "main", component: "HeroCanvas" }],
    settings: [],
    ...over,
  };
}

function firstDef(input: Record<string, unknown>) {
  const verdict = fromDevThemeManifest(input);
  expect(verdict.ok).toBe(true);
  if (!verdict.ok) throw new Error(verdict.errors.join(" "));
  return verdict.defs[0]!;
}

function refused(input: Record<string, unknown>): string {
  const verdict = fromDevThemeManifest(input);
  expect(verdict.ok).toBe(false);
  if (verdict.ok) throw new Error("expected refusal, adapted clean");
  return verdict.errors.join(" ");
}

const SELECT_SETTING = {
  key: "align",
  label: "Align",
  type: "select",
  options: [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
  ],
};

describe("pass 1 — allow-list + 1:1 mapping for the nine new kinds", () => {
  it("the manifest gate accepts all fifteen closed setting types", () => {
    const m = manifest();
    m.settings = (
      [
        "text",
        "image",
        "color",
        "spacing",
        "product-selection",
        "animation",
        "number",
        "boolean",
        "select",
        "link",
        "group",
        "repeater",
        "media",
        "video",
        "icon",
      ] as const
    ).map((type, i) => {
      const base: Record<string, unknown> = {
        key: `field-${i}`,
        label: `F ${i}`,
        type,
      };
      if (type === "select") base.options = [{ value: "a", label: "A" }];
      if (type === "group" || type === "repeater") {
        base.fields = [{ key: `leaf-${i}`, label: `Leaf ${i}`, type: "text" }];
      }
      return base;
    });
    expect(parseDevThemeManifest(m).ok).toBe(true);
  });

  it("maps each new setting type onto its existing prop kind", () => {
    const def = firstDef(
      manifest({
        settings: [
          { key: "qty", label: "Qty", type: "number" },
          { key: "flag", label: "Flag", type: "boolean" },
          { ...SELECT_SETTING },
          { key: "cta", label: "CTA", type: "link" },
          { key: "clip", label: "Clip", type: "media" },
          { key: "reel", label: "Reel", type: "video" },
          { key: "glyph", label: "Glyph", type: "icon" },
          {
            key: "card",
            label: "Card",
            type: "group",
            fields: [{ key: "subtitle", label: "Subtitle", type: "text" }],
          },
          {
            key: "items",
            label: "Items",
            type: "repeater",
            fields: [{ key: "title", label: "Title", type: "text" }],
          },
        ],
      }),
    );
    expect(def.propsSchema.fields.map((f) => `${f.key}:${f.kind}`)).toEqual([
      "qty:number",
      "flag:boolean",
      "align:select",
      "cta:link",
      "clip:media",
      "reel:video",
      "glyph:icon",
      "card:group",
      "items:repeater",
    ]);
  });

  it("invents no kinds: every emitted kind (incl. nested) exists in PROP_KINDS", () => {
    const def = firstDef(
      manifest({
        settings: [
          { key: "qty", label: "Qty", type: "number" },
          { key: "flag", label: "Flag", type: "boolean" },
          { ...SELECT_SETTING },
          { key: "cta", label: "CTA", type: "link" },
          { key: "clip", label: "Clip", type: "media" },
          { key: "reel", label: "Reel", type: "video" },
          { key: "glyph", label: "Glyph", type: "icon" },
          {
            key: "card",
            label: "Card",
            type: "group",
            fields: [
              { key: "count", label: "Count", type: "number" },
              { ...SELECT_SETTING, key: "pick", label: "Pick" },
            ],
          },
          {
            key: "items",
            label: "Items",
            type: "repeater",
            fields: [
              { key: "url", label: "URL", type: "link" },
              { key: "on", label: "On", type: "boolean" },
            ],
          },
        ],
      }),
    );
    const kinds = new Set(PROP_KINDS as readonly string[]);
    const walk = (fields: typeof def.propsSchema.fields): void => {
      for (const f of fields) {
        expect(kinds.has(f.kind)).toBe(true);
        if (f.fields) walk(f.fields);
      }
    };
    walk(def.propsSchema.fields);
  });

  it("defs with new kinds register through the shared registry gate", async () => {
    const { createWidgetRegistry } = await import("./unified-widget-registry");
    const def = firstDef(
      manifest({
        settings: [
          { key: "qty", label: "Qty", type: "number", min: 0, max: 10 },
          { key: "flag", label: "Flag", type: "boolean" },
          { ...SELECT_SETTING },
          { key: "cta", label: "CTA", type: "link" },
          { key: "clip", label: "Clip", type: "media" },
          { key: "reel", label: "Reel", type: "video" },
          { key: "glyph", label: "Glyph", type: "icon" },
          {
            key: "card",
            label: "Card",
            type: "group",
            fields: [{ key: "subtitle", label: "Subtitle", type: "text" }],
          },
          {
            key: "items",
            label: "Items",
            type: "repeater",
            fields: [{ key: "title", label: "Title", type: "text" }],
          },
        ],
      }),
    );
    const registry = createWidgetRegistry();
    expect(registry.registerWidget(def).ok).toBe(true);
    expect(registry.resolveWidget(def.id).ok).toBe(true);
  });

  it("section-level new types adapt per-widget (shared stays shared)", () => {
    const verdict = fromDevThemeManifest(
      manifest({
        sections: [
          {
            key: "hero",
            slot: "main",
            component: "HeroCanvas",
            settings: [
              { key: "qty", label: "Qty", type: "number" },
              { ...SELECT_SETTING },
              {
                key: "items",
                label: "Items",
                type: "repeater",
                fields: [{ key: "title", label: "Title", type: "text" }],
              },
            ],
          },
          { key: "footer", slot: "footer", component: "Footer" },
        ],
      }),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const [hero, footer] = verdict.defs;
    for (const k of ["qty", "align", "items"]) {
      expect(hero!.propsSchema.fields.map((f) => f.key)).toContain(k);
      expect(footer!.propsSchema.fields.map((f) => f.key)).not.toContain(k);
    }
  });
});

describe("pass 1/2 — modifiers discipline (required/default/help/min/max only)", () => {
  it("carries required/default/help/bounds on number + boolean + link + icon", () => {
    const def = firstDef(
      manifest({
        settings: [
          {
            key: "qty",
            label: "Qty",
            type: "number",
            required: true,
            default: 3,
            help: "How many",
            min: 0,
            max: 10,
          },
          { key: "flag", label: "Flag", type: "boolean", default: true },
          { key: "cta", label: "CTA", type: "link", default: "/sale" },
          { key: "glyph", label: "Glyph", type: "icon", default: "Star" },
        ],
      }),
    );
    const byKey = new Map(def.propsSchema.fields.map((f) => [f.key, f]));
    expect(byKey.get("qty")).toMatchObject({
      required: true,
      default: 3,
      help: "How many",
      min: 0,
      max: 10,
    });
    expect(byKey.get("flag")?.default).toBe(true);
    expect(byKey.get("cta")?.default).toBe("/sale");
    expect(byKey.get("glyph")?.default).toBe("Star");
    expect(def.defaults.qty).toBe(3);
    expect(def.defaults.flag).toBe(true);
  });

  it("ignores cross-kind modifiers without confusing the kind", () => {
    const def = firstDef(
      manifest({
        settings: [
          {
            key: "title",
            label: "Title",
            type: "text",
            fields: [{ key: "x", label: "X", type: "text" }],
            options: [{ value: "a", label: "A" }],
            multiple: true,
          },
          {
            key: "qty",
            label: "Qty",
            type: "number",
            options: [{ value: "a", label: "A" }],
            multiline: true,
            fields: [{ key: "y", label: "Y", type: "text" }],
          },
          {
            key: "card",
            label: "Card",
            type: "group",
            options: [{ value: "a", label: "A" }],
            fields: [{ key: "subtitle", label: "Subtitle", type: "text" }],
          },
          {
            key: "items",
            label: "Items",
            type: "repeater",
            options: [{ value: "a", label: "A" }],
            fields: [{ key: "title", label: "Title", type: "text" }],
          },
        ],
      }),
    );
    const byKey = new Map(def.propsSchema.fields.map((f) => [f.key, f]));
    expect(byKey.get("title")?.kind).toBe("text");
    expect(byKey.get("title")).not.toHaveProperty("fields");
    expect(byKey.get("title")).not.toHaveProperty("options");
    expect(byKey.get("qty")?.kind).toBe("number");
    expect(byKey.get("qty")).not.toHaveProperty("options");
    expect(byKey.get("card")?.kind).toBe("group");
    expect(byKey.get("card")).not.toHaveProperty("options");
    expect(byKey.get("items")?.kind).toBe("repeater");
    expect(byKey.get("items")).not.toHaveProperty("options");
  });

  it("declared defaults for every new kind validate through the value layer", () => {
    const def = firstDef(
      manifest({
        settings: [
          {
            key: "qty",
            label: "Qty",
            type: "number",
            default: 3,
            min: 0,
            max: 10,
          },
          { key: "flag", label: "Flag", type: "boolean", default: true },
          { ...SELECT_SETTING, default: "center" },
          { key: "cta", label: "CTA", type: "link", default: "/sale" },
          { key: "clip", label: "Clip", type: "media", default: "/m.mp4" },
          { key: "reel", label: "Reel", type: "video", default: "/v.mp4" },
          { key: "glyph", label: "Glyph", type: "icon", default: "Star" },
          {
            key: "card",
            label: "Card",
            type: "group",
            fields: [
              {
                key: "subtitle",
                label: "Subtitle",
                type: "text",
                default: "Hi",
              },
            ],
          },
          {
            key: "items",
            label: "Items",
            type: "repeater",
            fields: [{ key: "title", label: "Title", type: "text" }],
          },
        ],
      }),
    );
    const checked = validateProps(def.propsSchema, def.defaults);
    expect(checked.errors).toEqual([]);
    expect(checked.clean.qty).toBe(3);
    expect(checked.clean.align).toBe("center");
    expect(checked.clean.subtitle).toBe("Hi");
  });

  it("min/max clamp numbers through validateProps", () => {
    const def = firstDef(
      manifest({
        settings: [
          { key: "qty", label: "Qty", type: "number", min: 0, max: 10 },
        ],
      }),
    );
    expect(validateProps(def.propsSchema, { qty: 99 }).clean.qty).toBe(10);
    expect(validateProps(def.propsSchema, { qty: -5 }).clean.qty).toBe(0);
  });
});

describe("pass 2/3 — group + repeater nesting, depth/count limits", () => {
  it("group leaves store flat and validate like top-level fields", () => {
    const def = firstDef(
      manifest({
        settings: [
          {
            key: "card",
            label: "Card",
            type: "group",
            fields: [
              { key: "subtitle", label: "Subtitle", type: "text" },
              { key: "count", label: "Count", type: "number", min: 0, max: 5 },
            ],
          },
        ],
      }),
    );
    const group = def.propsSchema.fields[0]!;
    expect(group.kind).toBe("group");
    expect(group.fields?.map((f) => `${f.key}:${f.kind}`)).toEqual([
      "subtitle:text",
      "count:number",
    ]);
    // Flat storage: leaves live at the top level of clean/defaults.
    expect(Object.keys(def.defaults).sort()).toEqual(["count", "subtitle"]);
    const checked = validateProps(def.propsSchema, {
      subtitle: "<script>alert(1)</script>Hi",
      count: 99,
    });
    expect(checked.clean.subtitle).toBe("Hi");
    expect(checked.clean.count).toBe(5);
    expect("card" in checked.clean).toBe(false);
  });

  it("one nested group level flattens into the parent and renders", () => {
    const def = firstDef(
      manifest({
        settings: [
          {
            key: "card",
            label: "Card",
            type: "group",
            fields: [
              { key: "subtitle", label: "Subtitle", type: "text" },
              {
                key: "inner",
                label: "Inner",
                type: "group",
                fields: [{ key: "note", label: "Note", type: "text" }],
              },
            ],
          },
        ],
      }),
    );
    const group = def.propsSchema.fields[0]!;
    expect(group.fields?.map((f) => f.key)).toEqual(["subtitle", "note"]);
    const out = html(
      <SchemaControls
        schema={def.propsSchema}
        props={{ subtitle: "S", note: "N" }}
        onChange={noop}
      />,
    );
    expect(out).toContain("Card");
    expect(out).toContain("Subtitle");
    expect(out).toContain("Note");
  });

  it("repeater rows validate per-row and render rows + Add item", () => {
    const def = firstDef(
      manifest({
        settings: [
          {
            key: "items",
            label: "Items",
            type: "repeater",
            fields: [
              { key: "title", label: "Title", type: "text" },
              { key: "qty", label: "Qty", type: "number", min: 0, max: 9 },
            ],
          },
        ],
      }),
    );
    expect(def.defaults.items).toEqual([]);
    const checked = validateProps(def.propsSchema, {
      items: [
        { title: "A", qty: 2 },
        { title: "<b>B</b>", qty: 99, injected: "dropped" },
      ],
    });
    expect(checked.errors).toEqual([]);
    expect(checked.clean.items).toEqual([
      { title: "A", qty: 2 },
      { title: "B", qty: 9 },
    ]);
    const out = html(
      <SchemaControls
        schema={def.propsSchema}
        props={{ items: [{ title: "R1", qty: 1 }] }}
        onChange={noop}
      />,
    );
    expect(out).toContain("Items");
    expect(out).toContain("R1");
    expect(out).toContain("Add item");
  });

  it("repeater-of-group flattens to row leaves and renders", () => {
    const def = firstDef(
      manifest({
        settings: [
          {
            key: "items",
            label: "Items",
            type: "repeater",
            fields: [
              {
                key: "row",
                label: "Row",
                type: "group",
                fields: [
                  { key: "title", label: "Title", type: "text" },
                  { key: "on", label: "On", type: "boolean" },
                ],
              },
            ],
          },
        ],
      }),
    );
    const repeater = def.propsSchema.fields[0]!;
    expect(repeater.fields?.map((f) => `${f.key}:${f.kind}`)).toEqual([
      "title:text",
      "on:boolean",
    ]);
    const checked = validateProps(def.propsSchema, {
      items: [{ title: "A", on: true }],
    });
    expect(checked.errors).toEqual([]);
    const out = html(
      <SchemaControls
        schema={def.propsSchema}
        props={{ items: [{ title: "A", on: true }] }}
        onChange={noop}
      />,
    );
    expect(out).toContain("Title");
    expect(out).toContain("Add item");
  });

  it("refuses group nesting two levels deep (nested_too_deep)", () => {
    const err = refused(
      manifest({
        settings: [
          {
            key: "card",
            label: "Card",
            type: "group",
            fields: [
              {
                key: "l1",
                label: "L1",
                type: "group",
                fields: [
                  {
                    key: "l2",
                    label: "L2",
                    type: "group",
                    fields: [{ key: "deep", label: "Deep", type: "text" }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(err).toMatch(/nested_too_deep/);
  });

  it("refuses nested repeaters anywhere (nested_repeater)", () => {
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "items",
              label: "Items",
              type: "repeater",
              fields: [
                {
                  key: "sub",
                  label: "Sub",
                  type: "repeater",
                  fields: [{ key: "tx", label: "T", type: "text" }],
                },
              ],
            },
          ],
        }),
      ),
    ).toMatch(/nested_repeater/);
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "card",
              label: "Card",
              type: "group",
              fields: [
                {
                  key: "sub",
                  label: "Sub",
                  type: "repeater",
                  fields: [{ key: "tx", label: "T", type: "text" }],
                },
              ],
            },
          ],
        }),
      ),
    ).toMatch(/nested_repeater/);
    // A nested `multiple` product-selection grades to a repeater: refused.
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "card",
              label: "Card",
              type: "group",
              fields: [
                {
                  key: "lineup",
                  label: "Lineup",
                  type: "product-selection",
                  multiple: true,
                },
              ],
            },
          ],
        }),
      ),
    ).toMatch(/nested_repeater/);
  });

  it("refuses oversize/empty/missing nested shapes", () => {
    const big = Array.from({ length: 33 }, (_, i) => ({
      key: `f${i}`,
      label: `F ${i}`,
      type: "text",
    }));
    expect(
      refused(
        manifest({
          settings: [
            { key: "card", label: "Card", type: "group", fields: big },
          ],
        }),
      ),
    ).toMatch(/too_many_nested/);
    expect(
      refused(
        manifest({
          settings: [{ key: "card", label: "Card", type: "group", fields: [] }],
        }),
      ),
    ).toMatch(/bad_nested_settings/);
    expect(
      refused(
        manifest({ settings: [{ key: "card", label: "Card", type: "group" }] }),
      ),
    ).toMatch(/bad_nested_settings/);
    expect(
      refused(
        manifest({
          settings: [
            { key: "card", label: "Card", type: "group", fields: "x" },
          ],
        }),
      ),
    ).toMatch(/bad_nested_settings/);
    // `fields` + `settings` both present is ambiguous.
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "card",
              label: "Card",
              type: "group",
              fields: [{ key: "a", label: "A", type: "text" }],
              settings: [{ key: "b", label: "B", type: "text" }],
            },
          ],
        }),
      ),
    ).toMatch(/bad_nested_settings/);
  });

  it("refuses hostile nested keys, duplicates, reserved keys, unknown types", () => {
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "card",
              label: "Card",
              type: "group",
              fields: [{ key: "__proto__", label: "P", type: "text" }],
            },
          ],
        }),
      ),
    ).toMatch(/bad_nested_setting/);
    expect(
      refused(
        manifest({
          settings: [
            { key: "title", label: "Title", type: "text" },
            {
              key: "card",
              label: "Card",
              type: "group",
              fields: [{ key: "title", label: "Other", type: "text" }],
            },
          ],
        }),
      ),
    ).toMatch(/duplicate_setting:title/);
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "items",
              label: "Items",
              type: "repeater",
              fields: [
                { key: "tx", label: "T", type: "text" },
                { key: "tx", label: "T2", type: "text" },
              ],
            },
          ],
        }),
      ),
    ).toMatch(/duplicate_setting:tx/);
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "card",
              label: "Card",
              type: "group",
              fields: [{ key: "bp", label: "BP", type: "text" }],
            },
          ],
        }),
      ),
    ).toMatch(/reserved_setting_key/);
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "card",
              label: "Card",
              type: "group",
              fields: [{ key: "code", label: "Code", type: "code" }],
            },
          ],
        }),
      ),
    ).toMatch(/unknown_setting_type/);
  });

  it("refuses a select without usable options", () => {
    expect(
      refused(
        manifest({ settings: [{ key: "sl", label: "S", type: "select" }] }),
      ),
    ).toMatch(/bad_select_options/);
    expect(
      refused(
        manifest({
          settings: [{ key: "sl", label: "S", type: "select", options: [] }],
        }),
      ),
    ).toMatch(/bad_select_options/);
    expect(
      refused(
        manifest({
          settings: [{ key: "sl", label: "S", type: "select", options: "a" }],
        }),
      ),
    ).toMatch(/bad_select_options/);
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "sl",
              label: "S",
              type: "select",
              options: Array.from({ length: 33 }, (_, i) => ({
                value: `v${i}`,
                label: `V ${i}`,
              })),
            },
          ],
        }),
      ),
    ).toMatch(/bad_select_options/);
  });
});

describe("pass 2 — every new kind renders in SchemaControls (read-only verify)", () => {
  function defWith(settings: Record<string, unknown>[]) {
    return firstDef(manifest({ settings }));
  }

  it("full kinds render labelled controls", () => {
    const def = defWith([
      { key: "qty", label: "Qty label", type: "number" },
      { key: "flag", label: "Flag label", type: "boolean" },
      { ...SELECT_SETTING },
      { key: "cta", label: "CTA label", type: "link" },
      { key: "glyph", label: "Glyph label", type: "icon" },
    ]);
    const out = html(
      <SchemaControls
        schema={def.propsSchema}
        props={{ ...defaultsFor(def.propsSchema), align: "left" }}
        onChange={noop}
      />,
    );
    for (const label of [
      "Qty label",
      "Flag label",
      "Align",
      "CTA label",
      "Glyph label",
    ]) {
      expect(out, label).toContain(label);
    }
    expect(out).toContain('type="number"');
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("<select");
    expect(out).toContain("<option");
    expect(out).toContain('type="url"');
  });

  it("media + video render placeholder pickers on the shared contract", () => {
    const def = defWith([
      { key: "clip", label: "Clip label", type: "media" },
      { key: "reel", label: "Reel label", type: "video" },
    ]);
    const out = html(
      <SchemaControls schema={def.propsSchema} props={{}} onChange={noop} />,
    );
    expect(out).toContain('data-placeholder="media"');
    expect(out).toContain('data-placeholder="video"');
    expect(out).toContain("Clip label");
    expect(out).toContain("Reel label");
  });

  it("group renders a fieldset legend with its leaves", () => {
    const def = defWith([
      {
        key: "card",
        label: "Card label",
        type: "group",
        fields: [{ key: "subtitle", label: "Subtitle label", type: "text" }],
      },
    ]);
    const out = html(
      <SchemaControls
        schema={def.propsSchema}
        props={{ subtitle: "S" }}
        onChange={noop}
      />,
    );
    expect(out).toContain("Card label");
    expect(out).toContain("Subtitle label");
    expect(out).toContain("<fieldset");
  });

  it("select renders its closed options and nothing else", () => {
    const def = defWith([{ ...SELECT_SETTING }]);
    const out = html(
      <SchemaControls
        schema={def.propsSchema}
        props={{ align: "left" }}
        onChange={noop}
      />,
    );
    expect(out).toContain('value="left"');
    expect(out).toContain('value="center"');
    expect(out).not.toContain("injected-option");
  });
});

describe("pass 2/3 — validates, saves, executes nothing", () => {
  function defWith(settings: Record<string, unknown>[]) {
    return firstDef(manifest({ settings }));
  }

  it("hostile values are neutralized per kind (markup stripped, URLs gated)", () => {
    const def = defWith([
      { key: "qty", label: "Qty", type: "number" },
      { key: "flag", label: "Flag", type: "boolean" },
      { ...SELECT_SETTING },
      { key: "cta", label: "CTA", type: "link" },
      { key: "clip", label: "Clip", type: "media" },
      { key: "reel", label: "Reel", type: "video" },
      { key: "glyph", label: "Glyph", type: "icon" },
    ]);
    const checked = validateProps(def.propsSchema, {
      qty: "<script>alert(1)</script>",
      flag: "yes",
      align: "<img src=x onerror=alert(1)>",
      cta: "javascript:alert(1)",
      clip: "javascript:alert(1)",
      reel: "data:text/html,<script>alert(1)</script>",
      glyph: "<img src=x onerror=alert(1)>Star",
      price: "9.99",
    });
    expect(checked.ok).toBe(false);
    for (const [, v] of Object.entries(checked.clean)) {
      expect(String(JSON.stringify(v))).not.toContain("<script>");
      expect(String(JSON.stringify(v))).not.toContain("javascript:");
    }
    expect(checked.clean.glyph).toBe("Star");
    expect("price" in checked.clean).toBe(false);
  });

  it("no code-shaped declared default survives into saved props", () => {
    const def = defWith([
      {
        key: "qty",
        label: "Qty",
        type: "number",
        default: "<script>1</script>",
      },
      {
        key: "cta",
        label: "CTA",
        type: "link",
        default: "javascript:alert(1)",
      },
      {
        key: "clip",
        label: "Clip",
        type: "media",
        default: "javascript:alert(1)",
      },
      { ...SELECT_SETTING, default: "injected" },
      { key: "glyph", label: "Glyph", type: "icon", default: "<b>Star</b>" },
    ]);
    const saved = validateProps(def.propsSchema, def.defaults).clean;
    for (const [, v] of Object.entries(saved)) {
      expect(String(JSON.stringify(v))).not.toContain("<");
      expect(String(JSON.stringify(v))).not.toContain("javascript:");
    }
    // Invalid select default falls back to the first closed option.
    expect(saved.align).toBe("left");
    expect(saved.qty).toBe(0);
    expect(saved.cta).toBe("");
    expect(saved.glyph).toBe("Star");
  });

  it("legit values save clean and build a preview envelope", () => {
    const def = defWith([
      { key: "qty", label: "Qty", type: "number", min: 0, max: 10 },
      { key: "flag", label: "Flag", type: "boolean" },
      { ...SELECT_SETTING },
      { key: "cta", label: "CTA", type: "link" },
      { key: "clip", label: "Clip", type: "media" },
      { key: "reel", label: "Reel", type: "video" },
      { key: "glyph", label: "Glyph", type: "icon" },
      {
        key: "card",
        label: "Card",
        type: "group",
        fields: [{ key: "subtitle", label: "Subtitle", type: "text" }],
      },
      {
        key: "items",
        label: "Items",
        type: "repeater",
        fields: [{ key: "title", label: "Title", type: "text" }],
      },
    ]);
    const checked = validateProps(def.propsSchema, {
      qty: 4,
      flag: true,
      align: "center",
      cta: "/sale",
      clip: "https://cdn.example.com/m.mp4",
      reel: "/v.mp4",
      glyph: "Star",
      subtitle: "Hello",
      items: [{ title: "Row" }],
    });
    expect(checked.errors).toEqual([]);
    const built = buildThemePreviewEnvelope({
      widgetId: def.id,
      component: def.component,
      props: checked.clean,
    });
    expect(built.ok).toBe(true);
  });

  it("select admits only its closed options (injection rejected)", () => {
    const def = defWith([{ ...SELECT_SETTING }]);
    expect(validateProps(def.propsSchema, { align: "left" }).errors).toEqual(
      [],
    );
    const bad = validateProps(def.propsSchema, { align: "drop-table" });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/not_an_option/);
  });
});

describe("pass 4 — adversarial", () => {
  it("kind confusion cannot smuggle structure across kinds", () => {
    const def = firstDef(
      manifest({
        settings: [
          {
            key: "cta",
            label: "CTA",
            type: "link",
            multiline: true,
            fields: [{ key: "x", label: "X", type: "text" }],
            options: [{ value: "a", label: "A" }],
          },
          {
            key: "pick",
            label: "Pick",
            type: "select",
            options: [{ value: "a", label: "A" }],
            fields: [{ key: "y", label: "Y", type: "text" }],
            multiline: true,
          },
        ],
      }),
    );
    const byKey = new Map(def.propsSchema.fields.map((f) => [f.key, f]));
    expect(byKey.get("cta")?.kind).toBe("link");
    expect(byKey.get("cta")).not.toHaveProperty("fields");
    expect(byKey.get("cta")).not.toHaveProperty("options");
    expect(byKey.get("pick")?.kind).toBe("select");
    expect(byKey.get("pick")).not.toHaveProperty("fields");
    expect(byKey.get("pick")?.options).toEqual([{ value: "a", label: "A" }]);
  });

  it("option injection is refused (proto keys, non-strings, empties)", () => {
    for (const options of [
      [{ value: "__proto__", label: "P" }],
      [{ value: "constructor", label: "C" }],
      [{ value: "prototype", label: "P" }],
      [{ value: 42, label: "N" }],
      [{ value: "", label: "Empty" }],
      ["left"],
      [{ label: "No value" }],
    ]) {
      expect(
        refused(
          manifest({
            settings: [{ key: "sl", label: "S", type: "select", options }],
          }),
        ),
        JSON.stringify(options),
      ).toMatch(/bad_select_options/);
    }
  });

  it("nested bombs fail closed (deep nesting, wide rows, hostile keys)", () => {
    // 10-deep group nesting.
    let deep: Record<string, unknown> = {
      key: "leaf",
      label: "Leaf",
      type: "text",
    };
    for (let i = 0; i < 10; i++) {
      deep = { key: `g${i}`, label: `G ${i}`, type: "group", fields: [deep] };
    }
    expect(
      refused(
        manifest({
          settings: [
            { key: "card", label: "Card", type: "group", fields: [deep] },
          ],
        }),
      ),
    ).toMatch(/nested_too_deep/);
    // 100-wide repeater.
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "items",
              label: "Items",
              type: "repeater",
              fields: Array.from({ length: 100 }, (_, i) => ({
                key: `f${i}`,
                label: `F ${i}`,
                type: "text",
              })),
            },
          ],
        }),
      ),
    ).toMatch(/too_many_nested/);
    // Hostile nested key.
    expect(
      refused(
        manifest({
          settings: [
            {
              key: "items",
              label: "Items",
              type: "repeater",
              fields: [{ key: "constructor", label: "C", type: "text" }],
            },
          ],
        }),
      ),
    ).toMatch(/bad_nested_setting/);
  });

  it("media/video/link URL schemes: allow-listed pass, executable refused", () => {
    const def = firstDef(
      manifest({
        settings: [
          { key: "clip", label: "Clip", type: "media" },
          { key: "reel", label: "Reel", type: "video" },
          { key: "cta", label: "CTA", type: "link" },
        ],
      }),
    );
    for (const good of [
      "https://cdn.example.com/a.mp4",
      "/relative/a.mp4",
      "#anchor",
      "mailto:a@b.c",
      "tel:+123",
    ]) {
      const checked = validateProps(def.propsSchema, {
        clip: good,
        reel: good,
        cta: good,
      });
      expect(checked.errors, good).toEqual([]);
    }
    for (const evil of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      const checked = validateProps(def.propsSchema, {
        clip: evil,
        reel: evil,
        cta: evil,
      });
      expect(checked.ok, evil).toBe(false);
      expect(checked.clean.clip).toBe("");
      expect(checked.clean.reel).toBe("");
      expect(checked.clean.cta).toBe("");
    }
  });

  it("__proto__ payloads and oversize instance data stay refused", () => {
    const def = firstDef(
      manifest({
        settings: [
          { key: "qty", label: "Qty", type: "number" },
          {
            key: "items",
            label: "Items",
            type: "repeater",
            fields: [{ key: "title", label: "Title", type: "text" }],
          },
        ],
      }),
    );
    const hostile = JSON.parse(
      '{"qty":1,"__proto__":{"polluted":true},"items":[{"title":"ok"}]}',
    );
    const checked = validateProps(def.propsSchema, hostile);
    expect(({} as Record<string, unknown>).polluted).toBe(undefined);
    expect("polluted" in checked.clean).toBe(false);
    const oversize = buildThemePreviewEnvelope({
      widgetId: def.id,
      component: def.component,
      props: { qty: 1, items: [{ title: "x".repeat(70 * 1024) }] },
    });
    expect(oversize.ok).toBe(false);
  });
});
