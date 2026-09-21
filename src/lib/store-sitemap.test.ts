/**
 * Merchant sitemap entries — TDD: root shapes, article patterns, no
 * path-shaped (/store/*) locs ever.
 */
import { describe, expect, it } from "vitest";
import { buildMerchantSitemapEntries } from "./store-sitemap.server";

describe("buildMerchantSitemapEntries", () => {
  it("emits root-shape locs for every catalogue kind", () => {
    const entries = buildMerchantSitemapEntries({
      products: [{ slug: "saree" }],
      collections: [{ slug: "eid" }],
      pages: [{ slug: "about" }],
      articles: [{ slug: "hello", published_at: "2026-09-21T00:00:00Z" }],
    });
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/p/saree");
    expect(paths).toContain("/c/eid");
    expect(paths).toContain("/pages/about");
    expect(paths).toContain("/blog");
    expect(paths).toContain("/blog/hello");
    for (const p of paths) {
      expect(p.startsWith("/store/"), p).toBe(false);
    }
  });

  it("honors dated article patterns", () => {
    const entries = buildMerchantSitemapEntries({
      products: [],
      collections: [],
      pages: [],
      articles: [{ slug: "x", published_at: "2026-09-21T00:00:00Z" }],
      settings: {
        articleBase: "/blog",
        articlePattern: "/%year%/%month%/%slug%",
        productBase: "/p",
        collectionBase: "/c",
        pageBase: "/pages",
      },
    });
    expect(entries.map((e) => e.path)).toContain("/blog/2026/09/x");
  });
});
