import { describe, expect, it } from "vitest";
import {
  SECTION_CATALOG,
  catalogEntry,
  type SectionType,
} from "@/lib/builder-ast";
import {
  STUDIO_KEY_ALIASES,
  STUDIO_OWNED_DEFAULTS,
  WIDGET_BY_KEY,
  newWidgetNode,
  resolveStudioKey,
} from "./catalog";

/**
 * P7 dedup — Elementor/Woo-flavoured names resolve onto the canonical
 * SECTION_CATALOG keys. Aliases never merge widget identity (each alias
 * keeps its own WIDGETS entry and hand-authored defaults); they exist so
 * loaders/seeders can follow a foreign `el` to the canonical schema.
 */
describe("P7 studio key aliases", () => {
  it("maps the documented Elementor/Woo names onto canonical keys", () => {
    expect(STUDIO_KEY_ALIASES["text-editor"]).toBe("rich_text");
    expect(STUDIO_KEY_ALIASES["grid"]).toBe("columns");
    expect(STUDIO_KEY_ALIASES["products"]).toBe("product_grid");
    expect(STUDIO_KEY_ALIASES["product-categories"]).toBe("collection_grid");
    expect(STUDIO_KEY_ALIASES["add-to-cart"]).toBe("add_to_cart");
    expect(STUDIO_KEY_ALIASES["checkout"]).toBe("checkout_steps");
    expect(STUDIO_KEY_ALIASES["reviews"]).toBe("review_list");
  });

  it("passes canonical and unknown keys through untouched", () => {
    expect(resolveStudioKey("rich_text")).toBe("rich_text");
    expect(resolveStudioKey("product_grid")).toBe("product_grid");
    expect(resolveStudioKey("faq")).toBe("faq");
    expect(resolveStudioKey("nope-unknown-widget")).toBe("nope-unknown-widget");
    expect(resolveStudioKey("")).toBe("");
  });

  it("resolves every alias exactly like the table", () => {
    for (const [alias, canonical] of Object.entries(STUDIO_KEY_ALIASES)) {
      expect(resolveStudioKey(alias), alias).toBe(canonical);
    }
  });

  it("points every alias at a real SECTION_CATALOG entry", () => {
    for (const [alias, canonical] of Object.entries(STUDIO_KEY_ALIASES)) {
      expect(
        catalogEntry(canonical as SectionType),
        `${alias} -> ${canonical}`,
      ).toBeDefined();
    }
  });

  it("only aliases foreign names (no canonical key is its own alias)", () => {
    const catalogTypes = new Set(SECTION_CATALOG.map((entry) => entry.type));
    for (const alias of Object.keys(STUDIO_KEY_ALIASES)) {
      expect(catalogTypes.has(alias as SectionType), alias).toBe(false);
    }
  });

  it("keeps aliased widgets as distinct entries (no identity merge)", () => {
    // `grid` stays the Elementor grid container, `text-editor` the rich
    // editor, `products` the Woo compat card — none inherits its target's
    // generated defaults.
    expect(WIDGET_BY_KEY["grid"]).toBeDefined();
    expect(WIDGET_BY_KEY["text-editor"]).toBeDefined();
    expect(WIDGET_BY_KEY["products"]).toBeDefined();
    expect(WIDGET_BY_KEY["grid"]!.defaults).not.toEqual(
      catalogEntry("columns")!.defaults,
    );
    expect(WIDGET_BY_KEY["text-editor"]!.defaults).not.toEqual(
      catalogEntry("rich_text")!.defaults,
    );
    expect(WIDGET_BY_KEY["products"]!.defaults).not.toEqual(
      catalogEntry("product_grid")!.defaults,
    );
  });
});

/**
 * P7 dedup proof — every catalog-shared widget the studio did not
 * intentionally diverge carries the SECTION_CATALOG defaults verbatim
 * (builder-ast is the single source; studio/catalog.ts only references it).
 * Intentional divergences live in STUDIO_OWNED_DEFAULTS with a reason each.
 */
describe("P7 generated-defaults equality", () => {
  const EXCLUDED_CATALOG = new Set(["page_content", "plugin_block"]);
  const sharedTypes = SECTION_CATALOG.map((entry) => entry.type).filter(
    (type) => !EXCLUDED_CATALOG.has(type),
  );

  it("covers the full shared surface (159 keys)", () => {
    expect(sharedTypes.length).toBe(159);
  });

  for (const type of sharedTypes) {
    if ((STUDIO_OWNED_DEFAULTS as Readonly<Record<string, string>>)[type]) {
      continue;
    }
    it(`${type} studio defaults deep-equal the catalog defaults`, () => {
      const twin = WIDGET_BY_KEY[type];
      expect(twin, `${type}: no studio twin`).toBeDefined();
      expect(twin!.defaults).toEqual(catalogEntry(type)!.defaults);
    });
  }

  it("documents every intentional divergence with a reason", () => {
    const owned = STUDIO_OWNED_DEFAULTS as Readonly<Record<string, string>>;
    for (const [key, reason] of Object.entries(owned)) {
      expect(typeof reason === "string" && reason.length > 0, key).toBe(true);
      expect(
        WIDGET_BY_KEY[key],
        `${key}: divergence listed but twin missing`,
      ).toBeDefined();
    }
  });

  it("new nodes clone (never share) the catalog defaults", () => {
    const node = newWidgetNode("product_grid");
    expect(node.settings).toEqual(catalogEntry("product_grid")!.defaults);
    expect(node.settings).not.toBe(
      catalogEntry("product_grid")!.defaults as unknown,
    );
    (node.settings as Record<string, unknown>)["limit"] = -1;
    expect(catalogEntry("product_grid")!.defaults["limit"]).toBe(12);
  });
});
