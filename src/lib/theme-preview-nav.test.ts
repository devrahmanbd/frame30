/**
 * In-preview navigation — TDD: demo links stay inside the preview frame.
 */
import { describe, expect, it } from "vitest";
import {
  applyDemoFocus,
  parsePreviewSearchQuery,
  previewSearchForSwitch,
  previewTargetForHref,
  previewTemplateForHref,
  resolveDemoFocus,
  resolveThemePreview,
  validateThemePreviewSearch,
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
    expect(preset!.tokens.brand).toBe("#1a1a1a");
    // The SECTION-track blueprint intentionally doubles the rail (new
    // arrivals + festive bestsellers); franchise updates reorder sections
    // and add flagship outlets — this pins the authored order, whatever
    // the theme builders produce.
    expect(preset!.templates.index.main.length).toEqual(20);
    expect(preset!.templates.index.header.length).toEqual(0);
    expect(preset!.templates.index.footer.length).toBeGreaterThan(0);
  });

  it("returns null for unknown keys (route renders 404)", () => {
    expect(resolveThemePreview("not-a-theme")).toBeNull();
    expect(resolveThemePreview("")).toBeNull();
  });

  it("resolves registered themes generically, without engine hardcoding", () => {
    const preset = resolveThemePreview("somvabona")!;
    expect(preset.key).toBe("somvabona");
    expect(preset.tokens.brand).toBe("#7C2A1A");
    for (const key of Object.keys(
      preset.templates,
    ) as (keyof typeof preset.templates)[]) {
      expect(preset.templates[key].main.length, `${key} main`).toBeGreaterThan(
        0,
      );
    }
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
      expect(ast.header.length, `${key} header`).toBeGreaterThanOrEqual(0);
      expect(ast.main.length, `${key} main`).toBeGreaterThan(0);
      expect(ast.footer.length, `${key} footer`).toBeGreaterThan(0);
      // Main opens with a heading (index opens with its hero_carousel)
      // so every preview sub-page owns the page h1.
      expect(ast.main[0]!.type, `${key} first section`).toBe(
        key === "index"
          ? "hero_carousel"
          : key === "collection"
            ? "category_header"
            : "heading",
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
    expect(
      resolveDemoFocus("songoskriti", "collection", "bestsellers"),
    ).toEqual({
      template: "collection",
      slug: "bestsellers",
      title: "Bestsellers",
      collection: "bestsellers",
    });
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

  it("focus keeps authored _bn twins", () => {
    const sections = [
      {
        id: "h",
        type: "heading",
        props: { text: "New in", text_bn: "নতুন এসেছে" },
      },
    ];
    const out = applyDemoFocus(sections as never, {
      template: "collection",
      slug: "festive",
      title: "Eid & Festive",
      collection: "festive",
    });
    expect(out[0].props.text).toBe("Eid & Festive");
    expect(out[0].props.text_bn).toBe("নতুন এসেছে"); // currently blanked
  });

  it("focus keeps the rail authored heading_bn twin", async () => {
    const { newSection } = await import("./builder-ast");
    const rail = {
      ...newSection("product_rail"),
      props: {
        source: "collection",
        collection: "new-in",
        heading: "New",
        heading_bn: "নতুন",
      },
    };
    const out = applyDemoFocus([rail], {
      template: "collection",
      slug: "festive",
      title: "Eid & Festive",
      collection: "festive",
    });
    expect(out[0]!.props["heading"]).toBe("Eid & Festive");
    expect(out[0]!.props["heading_bn"]).toBe("নতুন");
  });

  it("passes sections through without focus", async () => {
    const { newSection } = await import("./builder-ast");
    const sections = [newSection("heading")];
    expect(applyDemoFocus(sections, null)).toBe(sections);
  });

  it("feeds focused product catalog art into product_media", () => {
    const preset = resolveThemePreview("songoskriti")!;
    const focus = resolveDemoFocus(
      "songoskriti",
      "product",
      "rajshahi-silk-festive-panjabi",
    )!;
    expect(focus.title).toBe("Rajshahi Silk Festive Panjabi");
    const out = applyDemoFocus(preset.templates.product.main, focus);
    const media = out.find((s) => s.type === "product_media")!;
    expect(media.props["image1"]).toBe("/ph/songoskriti/prod-panjabi.png");
  });

  it("keeps static product_media for unknown product slugs", () => {
    const preset = resolveThemePreview("songoskriti")!;
    const before = preset.templates.product.main.find(
      (s) => s.type === "product_media",
    )!;
    const focus = resolveDemoFocus(
      "songoskriti",
      "product",
      "no-such-product-xyz",
    )!;
    const out = applyDemoFocus(preset.templates.product.main, focus);
    const media = out.find((s) => s.type === "product_media")!;
    expect(media.props).toMatchObject({ ...before.props });
  });
});

describe("resolveThemePreview (somvabona)", () => {
  it("resolves the somvabona key with its tokens and 11-section homepage", () => {
    const preset = resolveThemePreview("somvabona");
    expect(preset).not.toBeNull();
    expect(preset!.key).toBe("somvabona");
    expect(preset!.tokens.brand).toBe("#7C2A1A");
    expect(preset!.templates.index.main.map((s) => s.type)).toEqual([
      "announcement_bar",
      "hero_carousel",
      "trust_marquee",
      "circle_categories",
      "price_buckets",
      "urgency_rail",
      "urgency_rail",
      "occasion_matrix",
      "store_locator",
      "craft_story",
      "testimonials",
    ]);
    expect(preset!.templates.index.header.map((s) => s.type)).toEqual([
      "mega_menu",
    ]);
    expect(preset!.templates.index.footer.length).toBeGreaterThan(0);
  });

  it("authors demo content for every somvabona template", () => {
    const preset = resolveThemePreview("somvabona")!;
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
    }
    const ids = (
      Object.values(preset.templates) as (typeof preset.templates.index)[]
    ).flatMap((t) => [...t.header, ...t.main, ...t.footer].map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("previewTargetForHref slug-aware", () => {
  it("preserves collection slug", () => {
    expect(previewTargetForHref("/c/women")).toEqual({
      template: "collection",
      slug: "women",
      query: null,
    });
    expect(previewTargetForHref("/c/WOMEN")).toEqual({
      template: "collection",
      slug: "women",
      query: null,
    });
  });
  it("preserves product slug", () => {
    expect(previewTargetForHref("/p/dhakai-jamdani")).toEqual({
      template: "product",
      slug: "dhakai-jamdani",
      query: null,
    });
  });
  it("preserves search query", () => {
    expect(previewTargetForHref("/search?max=99900")).toEqual({
      template: "search",
      slug: null,
      query: "max=99900",
    });
  });
  it("maps account (was null in old lib)", () => {
    expect(previewTargetForHref("/account")?.template).toBe("account");
  });
  it("does not block hyphenated track-order", () => {
    expect(previewTargetForHref("/pages/track-order")?.template).toBe("page");
  });
  it("trims surrounding whitespace", () => {
    expect(previewTargetForHref("  /c/festive  ")).toEqual({
      template: "collection",
      slug: "festive",
      query: null,
    });
  });
});

describe("click-routing single source", () => {
  it("maps /products/ list form exactly once", () => {
    expect(previewTemplateForHref("/products/")).toBe("product");
    expect(previewTargetForHref("/products/")).toEqual({
      template: "product",
      slug: null,
      query: null,
    });
  });
});

describe("resolveDemoFocus categories", () => {
  it("resolves a category slug to category-filtered rows", () => {
    const f = resolveDemoFocus("songoskriti", "collection", "women")!;
    expect(f.title).toBe("Women");
    expect(f.slug).toBe("women");
    // Category signal must survive so rails filter by product.category,
    // not fall back to new-in rows.
    expect(f.collection).toBe("women");
  });
  it("unknown slugs still fall back to new-in", () => {
    expect(
      resolveDemoFocus("songoskriti", "collection", "nope-xyz")?.collection,
    ).toBe("new-in");
  });
});

describe("preview search query round-trip", () => {
  it("parses raw in-canvas query into separate keys", () => {
    expect(parsePreviewSearchQuery("max=99900")).toEqual({ max: "99900" });
    expect(parsePreviewSearchQuery("q=saree&max=99900")).toEqual({
      q: "saree",
      max: "99900",
    });
    expect(parsePreviewSearchQuery(null)).toEqual({});
    expect(parsePreviewSearchQuery("page=2")).toEqual({});
  });

  it("writes search clicks as separate keys, never raw string as q", () => {
    const next = previewSearchForSwitch("search", null, "max=99900", {});
    expect(next).toMatchObject({ template: "search", max: "99900" });
    expect(next).not.toHaveProperty("q", "max=99900");
  });

  it("writes focus clicks under the ?focus= contract, never ?slug=", () => {
    const next = previewSearchForSwitch("collection", "festive", null, {});
    expect(next).toMatchObject({ template: "collection", focus: "festive" });
    expect(next).not.toHaveProperty("slug");
  });

  it("clears q/max when leaving the search template", () => {
    const prev = { template: "search", max: "99900", q: "saree" };
    const next = previewSearchForSwitch("collection", "festive", null, prev);
    expect(next).toMatchObject({ template: "collection", focus: "festive" });
    // Explicit undefined: TanStack Router strips these keys on navigate.
    expect(next.q).toBeUndefined();
    expect(next.max).toBeUndefined();
  });

  it("clears focus when switching to a template with no slug", () => {
    const prev = { template: "collection", focus: "festive" };
    const next = previewSearchForSwitch("search", null, "q=saree", prev);
    expect(next).toMatchObject({ template: "search", q: "saree" });
    expect(next.focus).toBeUndefined();
  });

  it("validateSearch preserves focus and q/max (≤200) so refresh keeps them", () => {
    expect(
      validateThemePreviewSearch({
        template: "search",
        max: "99900",
        q: "saree",
      }),
    ).toEqual({
      template: "search",
      focus: undefined,
      q: "saree",
      max: "99900",
    });
    expect(
      validateThemePreviewSearch({
        template: "collection",
        focus: "bestsellers",
      }),
    ).toMatchObject({ template: "collection", focus: "bestsellers" });
    const long = "x".repeat(300);
    const capped = validateThemePreviewSearch({ q: long, max: long });
    expect(capped.q).toHaveLength(200);
    expect(capped.max).toHaveLength(200);
    expect(
      validateThemePreviewSearch({ template: "nope" }).template,
    ).toBeUndefined();
    expect(
      validateThemePreviewSearch({ focus: "NOT A SLUG" }).focus,
    ).toBeUndefined();
  });
});
