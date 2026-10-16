/**
 * Frame30 menu bindings — AST `menu` fields schema-editable end to end (TDD).
 *
 * The builtin adapter maps the catalogue `menu` kind to a `repeater` of flat
 * link rows (label text / href link / type select) instead of dropping it:
 * pick → `validateProps` → save → render (`staticMenuItems` reads
 * `label`/`href` rows). Nested subtrees cannot ride a repeater row
 * (repeaters do not nest by value-layer design), so `children`/`mega` extras
 * are dropped at validation, never stored — the top level still registers
 * with every other field intact. Menu cycles (self-referential or deeply
 * nested hostile rows) terminate: the repeater path never recurses into
 * values, and cyclic scalars fail closed to their fallback.
 */
import { describe, expect, it } from "vitest";
import { catalogEntry } from "./builder-ast";
import { staticMenuItems } from "./studio/model";
import type { StudioNode } from "./studio/model";
import {
  createWidgetRegistry,
  fromBuiltinWidgets,
} from "./unified-widget-registry";
import { validateProps, type PropSchema } from "./widget-props";

function navMenuSchema(): PropSchema {
  const def = fromBuiltinWidgets().find((d) => d.id === "builtin:nav_menu");
  expect(def).toBeDefined();
  return def!.propsSchema as unknown as PropSchema;
}

function renderableItems(clean: Record<string, unknown>): StudioNode {
  return {
    id: "n1",
    el: "app-block",
    settings: { items: clean.items },
  } as unknown as StudioNode;
}

describe("menu adaptation — no longer dropped", () => {
  it("adapts the nav_menu items tree to a flat link-row repeater", () => {
    const schema = navMenuSchema();
    const items = (schema as { fields: { key: string }[] }).fields.find(
      (f) => f.key === "items",
    ) as unknown as {
      kind: string;
      fields: { key: string; kind: string }[];
    };
    expect(items.kind).toBe("repeater");
    expect(items.fields.map((f) => f.key)).toEqual(["label", "href", "type"]);
    expect(items.fields.find((f) => f.key === "type")).toMatchObject({
      kind: "select",
    });
  });

  it("keeps the sibling menuId binding beside the adapted rows", () => {
    const schema = navMenuSchema();
    const keys = (schema as { fields: { key: string }[] }).fields.map(
      (f) => f.key,
    );
    expect(keys).toContain("menuId");
    expect(keys).toContain("items");
    expect(keys).toEqual(catalogEntry("nav_menu")!.fields.map((f) => f.key));
  });

  it("registers the adapted def cleanly through the registry gate", () => {
    const reg = createWidgetRegistry();
    for (const def of fromBuiltinWidgets().filter((d) =>
      d.id.endsWith("nav_menu"),
    )) {
      expect(reg.registerWidget(def).ok, def.id).toBe(true);
    }
  });
});

describe("menu end to end — pick, validate, save, render", () => {
  it("round-trips manual picks from the catalogue defaults to rendered rows", () => {
    const schema = navMenuSchema();
    const picked = {
      heading: "Shop",
      menuId: "",
      items: [
        { label: "Home", href: "/", type: "link" },
        { label: "Shop", href: "/collections", type: "collection" },
      ],
    };
    const validated = validateProps(schema, picked);
    expect(validated.ok).toBe(true);
    expect(validated.errors).toEqual([]);
    // Save shape: rows keep label/href/type, nothing else.
    expect(validated.clean.items).toEqual(picked.items);
    // Render shape: the studio twin reads label/href rows.
    expect(staticMenuItems(renderableItems(validated.clean))).toEqual([
      { label: "Home", href: "/" },
      { label: "Shop", href: "/collections" },
    ]);
  });

  it("cleans catalogue default rows (typeless) without errors", () => {
    const schema = navMenuSchema();
    const defaults = catalogEntry("nav_menu")!.defaults;
    const validated = validateProps(schema, {
      ...defaults,
      items: defaults.items,
    });
    expect(validated.errors).toEqual([]);
    const rendered = staticMenuItems(renderableItems(validated.clean));
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered[0]).toEqual({ label: "Home", href: "/" });
  });
});

describe("menu adversarial — cycles, depth, hostile rows", () => {
  it("strips nested subtrees and unknown row keys, never stores them", () => {
    const schema = navMenuSchema();
    const validated = validateProps(schema, {
      items: [
        {
          label: "Parent",
          href: "/",
          type: "link",
          id: "row-1",
          children: [
            { label: "Child", href: "/child", type: "link", id: "row-2" },
          ],
          mega: { enabled: true, columns: 3 },
        },
      ],
    });
    expect(validated.errors).toEqual([]);
    expect(validated.clean.items).toEqual([
      { label: "Parent", href: "/", type: "link" },
    ]);
  });

  it("terminates on cyclic hostile rows without throwing", () => {
    const schema = navMenuSchema();
    const cyclic: Record<string, unknown> = { label: "Loop", href: "/" };
    cyclic.self = cyclic;
    (cyclic as Record<string, unknown>).children = [cyclic];
    const validated = validateProps(schema, { items: [cyclic] });
    // Unknown keys (self/children) are stripped, scalars survive; the
    // option-less select falls back to its first option.
    expect(validated.clean.items).toEqual([
      { label: "Loop", href: "/", type: "link" },
    ]);
    const evil: Record<string, unknown> = {};
    evil.label = evil;
    const evilResult = validateProps(schema, { items: [evil] });
    expect(evilResult.clean.items).toEqual([
      { label: "", href: "", type: "link" },
    ]);
  });

  it("neutralizes script labels and javascript hrefs in rows", () => {
    const schema = navMenuSchema();
    const validated = validateProps(schema, {
      items: [
        {
          label: "<script>evil()</script>Home",
          href: "javascript:evil()",
          type: "link",
        },
      ],
    });
    expect(validated.ok).toBe(false);
    expect(validated.errors).toContain("items.0.href.not_a_url");
    const rows = validated.clean.items as Record<string, unknown>[];
    expect(rows[0]!.label).toBe("Home");
    expect(rows[0]!.href).toBe("");
  });

  it("caps oversized menus and rejects non-array values", () => {
    const schema = navMenuSchema();
    const rows = Array.from({ length: 60 }, (_, i) => ({
      label: `Item ${i}`,
      href: "/",
      type: "link",
    }));
    const capped = validateProps(schema, { items: rows });
    expect(capped.errors).toContain("items.too_many");
    expect((capped.clean.items as unknown[]).length).toBe(50);
    expect(validateProps(schema, { items: "not-rows" }).errors).toContain(
      "items.type",
    );
  });
});
