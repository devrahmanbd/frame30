/**
 * In-preview navigation — TDD: demo links stay inside the preview frame.
 */
import { describe, expect, it } from "vitest";
import {
  previewTemplateForHref,
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
    expect(preset!.templates.index.main.map((s) => s.type)).toEqual([
      "announcement_bar",
      "hero_carousel",
      "circle_categories",
      "finder_row",
      "product_rail",
      "craft_story",
      "testimonials",
      "trust_footer",
    ]);
    expect(preset!.templates.index.header.length).toBeGreaterThan(0);
    expect(preset!.templates.index.footer.length).toBeGreaterThan(0);
  });

  it("returns null for unknown keys (route renders 404)", () => {
    expect(resolveThemePreview("not-a-theme")).toBeNull();
    expect(resolveThemePreview("")).toBeNull();
  });
});
