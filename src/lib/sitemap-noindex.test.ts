/**
 * A URL must never be advertised in a sitemap and de-indexed at the same time.
 *
 * Three independent sources can hide a URL: a per-entity `seo_meta` row
 * (`robots_index=false` or `sitemap_exclude=true`), a per-row `robots` column
 * on the entity itself, and a builder template marked noindex. The last one is
 * the subtle case: sitemap entity types are not template keys — articles are
 * rendered by the `blog` template — so the mapping is asserted here rather
 * than assumed.
 */
import { describe, expect, it } from "vitest";
import { isExcluded } from "./sitemap-config.server";

const ctx = (excluded: string[] = [], hidden: string[] = []) => ({
  excluded: new Set(excluded),
  hiddenTemplates: new Set(hidden),
});

describe("sitemap noindex exclusion", () => {
  it("keeps an ordinary indexable entity", () => {
    expect(isExcluded(ctx(), "product", "p1")).toBe(false);
  });

  it("drops an entity excluded through seo_meta", () => {
    expect(isExcluded(ctx(["product:p1"]), "product", "p1")).toBe(true);
    expect(isExcluded(ctx(["product:p1"]), "product", "p2")).toBe(false);
  });

  it("drops a row whose own robots value starts with noindex", () => {
    expect(isExcluded(ctx(), "page", "x", "noindex,follow")).toBe(true);
    expect(isExcluded(ctx(), "page", "x", "index,follow")).toBe(false);
  });

  it("drops every entity of a template the merchant hid", () => {
    expect(isExcluded(ctx([], ["product"]), "product", "p1")).toBe(true);
    expect(isExcluded(ctx([], ["page"]), "page", "pg1")).toBe(true);
    expect(isExcluded(ctx([], ["collection"]), "collection", "c1")).toBe(true);
  });

  it("maps articles onto the blog template", () => {
    // Regression: the shard used the entity type as the template key, so a
    // noindex `blog` template still advertised every post.
    expect(isExcluded(ctx([], ["blog"]), "article", "a1")).toBe(true);
    expect(isExcluded(ctx([], ["article"]), "article", "a1")).toBe(false);
  });

  it("hiding one template does not hide the others", () => {
    const c = ctx([], ["blog"]);
    expect(isExcluded(c, "product", "p1")).toBe(false);
    expect(isExcluded(c, "page", "pg1")).toBe(false);
  });
});
