/**
 * In-preview navigation — TDD: demo links stay inside the preview frame.
 */
import { describe, expect, it } from "vitest";
import {
  applyDemoFocus,
  previewTemplateForHref,
  resolveDemoFocus,
  resolveThemePreview,
} from "./theme-preview-nav";

describe("previewTemplateForHref", () => {
  it("maps collection permalinks to the collection template", () => {
    expect(previewTemplateForHref("/c/heritage-handloom")).toBe("collection");
    expect(previewTemplateForHref("/c/wedding")).toBe("collection");
  });

  it("maps product links to the product template", () => {
    expect(previewTemplateForHref("/p/dhakai-jamdani-silk-saree")).toBe(
      "product",
    );
  });

  it("maps search links (with queries) to the search template", () => {
    expect(previewTemplateForHref("/search")).toBe("search");
    expect(previewTemplateForHref("/search?q=saree")).toBe("search");
  });

  it("maps cart and checkout to their templates", () => {
    expect(previewTemplateForHref("/cart")).toBe("cart");
    expect(previewTemplateForHref("/checkout")).toBe("checkout");
  });

  it("maps content links to page/blog templates", () => {
    expect(previewTemplateForHref("/pages/about")).toBe("page");
    expect(previewTemplateForHref("/blog/master-weavers")).toBe("blog");
    expect(previewTemplateForHref("/")).toBe("index");
  });

  it("leaves external, special and anchor links alone", () => {
    expect(previewTemplateForHref("https://aarong.com/")).toBeNull();
    expect(previewTemplateForHref("tel:16212")).toBeNull();
    expect(previewTemplateForHref("mailto:x@y.zz")).toBeNull();
    expect(previewTemplateForHref("#size-guide")).toBeNull();
    expect(previewTemplateForHref("")).toBeNull();
  });
});

describe("resolveThemePreview (Task 5: restored preview route)", () => {
  it("resolves the songoskriti key with brand tokens and homepage AST", () => {
    const preset = resolveThemePreview("songoskriti");
    expect(preset).not.toBeNull();
    expect(preset!.key).toBe("songoskriti");
    expect(preset!.tokens.brand).toBe("#8A3B1F");
    // The SECTION-track blueprint doubles the rail (new arrivals +
    // festive bestsellers); franchise updates reorder sections and add
    // flagship outlets — this pins the authored order, whatever it is.
    expect(preset!.templates.index.main.map((s) => s.type)).toEqual([
      "announcement_bar",
      "hero_carousel",
      "circle_categories",
      "trust_footer",
      "product_rail",
      "product_rail",
      "finder_row",
      "store_locator",
      "craft_story",
      "testimonials",
    ]);
    expect(preset!.templates.index.header.length).toBeGreaterThan(0);
    expect(preset!.templates.index.footer.length).toBeGreaterThan(0);
  });

  it("returns null for unknown keys (route renders 404)", () => {
    expect(resolveThemePreview("not-a-theme")).toBeNull();
    expect(resolveThemePreview("")).toBeNull();
  });

  it("authors demo content for every template (no empty sub-pages)", () => {
    const preset = resolveThemePreview("songoskriti")!;
    for (const key of [
      "index",
      "product",
      "collection",
      "account",
      "page",
      "blog",
      "cart",
      "checkout",
      "search",
    ] as const) {
      const ast = preset.templates[key];
      expect(ast.header.length, `${key} header`).toBeGreaterThan(0);
      expect(ast.main.length, `${key} main`).toBeGreaterThan(0);
      expect(ast.footer.length, `${key} footer`).toBeGreaterThan(0);
      // Main opens with a heading (index opens with its announcement
      // marquee) so every preview sub-page owns the page h1.
      expect(ast.main[0]!.type, `${key} first section`).toBe(
        key === "index" ? "announcement_bar" : "heading",
      );
    }
    // Spot-check demo bodies use proven renderers.
    expect(preset.templates.collection.main.map((s) => s.type)).toContain(
      "product_rail",
    );
    expect(preset.templates.product.main.map((s) => s.type)).toContain(
      "product_media",
    );
    expect(preset.templates.account.main.map((s) => s.type)).toEqual([
      "heading",
      "profile_card",
      "orders_list",
    ]);
    // Section ids stay unique across templates sharing one counter.
    const ids = (
      Object.values(preset.templates) as (typeof preset.templates.index)[]
    ).flatMap((t) => [...t.header, ...t.main, ...t.footer].map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("synthesizes generic demo bodies for templates a theme omits", async () => {
    const { assemblePreviewTemplates } = await import("./theme-preview-nav");
    const { DEFAULT_TOKENS } = await import("./builder-ast");
    const stub = {
      key: "stub",
      themeName: "Stub",
      author: "test",
      tokens: DEFAULT_TOKENS,
      header: () => [],
      footer: () => [],
      main: () => null,
    };
    const templates = assemblePreviewTemplates(stub);
    for (const key of Object.keys(templates) as (keyof typeof templates)[]) {
      expect(templates[key].main.length, `${key} main`).toBeGreaterThan(0);
      expect(templates[key].main[0]!.type).toBe("heading");
    }
  });
});

describe("demo focus (slug-aware collection preview)", () => {
  it("resolves known catalog slugs to their rows and names", () => {
    expect(resolveDemoFocus("songoskriti", "collection", "bestsellers")).toEqual(
      {
        template: "collection",
        slug: "bestsellers",
        title: "Bestsellers",
        collection: "bestsellers",
      },
    );
  });

  it("falls back to new-in rows under a humanized title for unknown slugs", () => {
    expect(
      resolveDemoFocus("songoskriti", "collection", "contemporary"),
    ).toEqual({
      template: "collection",
      slug: "contemporary",
      title: "Contemporary",
      collection: "new-in",
    });
  });

  it("resolves product titles from the demo catalog", () => {
    const focus = resolveDemoFocus(
      "songoskriti",
      "product",
      "dhakai-jamdani-heritage-saree",
    );
    expect(focus?.title).toBe("Dhakai Jamdani Heritage Saree");
  });

  it("returns null without a slug or for non-focus templates", () => {
    expect(resolveDemoFocus("songoskriti", "collection", null)).toBeNull();
    expect(resolveDemoFocus("songoskriti", "search", "saree")).toBeNull();
  });

  it("overrides the first heading and first collection rail, keeping ids", async () => {
    const { newSection } = await import("./builder-ast");
    const heading = { ...newSection("heading"), props: { text: "New in" } };
    const rail = {
      ...newSection("product_rail"),
      props: { source: "collection", collection: "new-in", heading: "New" },
    };
    const tail = { ...newSection("product_rail"), props: {} };
    const focus = {
      template: "collection" as const,
      slug: "women",
      title: "Women",
      collection: "women",
    };
    const out = applyDemoFocus([heading, rail, tail], focus);
    expect(out[0]!.props["text"]).toBe("Women");
    expect(out[1]!.props["collection"]).toBe("women");
    expect(out[1]!.props["heading"]).toBe("Women");
    expect(out[2]).toBe(tail);
    expect(out.map((s) => s.id)).toEqual(
      [heading, rail, tail].map((s) => s.id),
    );
  });

  it("passes sections through without focus", async () => {
    const { newSection } = await import("./builder-ast");
    const sections = [newSection("heading")];
    expect(applyDemoFocus(sections, null)).toBe(sections);
  });
});
