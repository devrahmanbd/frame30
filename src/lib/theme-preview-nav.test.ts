/**
 * In-preview navigation — TDD: demo links stay inside the preview frame.
 */
import { describe, expect, it } from "vitest";
import { previewTemplateForHref } from "./theme-preview-nav";

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
