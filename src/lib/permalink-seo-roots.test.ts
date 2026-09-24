/**
 * Permalink SEO roots (custom-domain cutover).
 *
 * Merchant SEO roots must be reachable on the merchant's own host: a crawler
 * asks a custom domain for `/sitemap.xml`, `/robots.txt`, `/llms.txt` and
 * `/sitemaps/<kind>-<n>.xml` — never for `/store/<slug>/…`. Every advertised
 * URL is an `absolutePermalink` canonical from the merchant's own permalink
 * settings, and platform hosts keep serving the platform documents.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  absolutePermalink,
  buildPermalink,
  type PermalinkSettings,
} from "./permalink";
import {
  buildMerchantLlmsTxt,
  buildMerchantSitemapEntries,
} from "./store-sitemap.server";
import {
  DEFAULT_CRAWL_SETTINGS,
  renderRobotsTxt,
  renderSitemapIndexXml,
} from "./sitemap-config";

const CUSTOM: PermalinkSettings = {
  articleBase: "/journal",
  articlePattern: "/%year%/%slug%",
  productBase: "/shop/items",
  collectionBase: "/shop/groups",
  pageBase: "/info",
};

describe("merchant sitemap entries follow permalink settings", () => {
  it("builds every kind from the merchant bases, not hardcoded /p /c /pages", () => {
    const entries = buildMerchantSitemapEntries({
      products: [{ slug: "shirt" }],
      collections: [{ slug: "shoes" }],
      pages: [{ slug: "about" }],
      articles: [{ slug: "jute", published_at: "2026-08-04T00:00:00Z" }],
      settings: CUSTOM,
    });
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("/shop/items/shirt");
    expect(paths).toContain("/shop/groups/shoes");
    expect(paths).toContain("/info/about");
    expect(paths).toContain("/journal/2026/jute");
    expect(paths).not.toContain("/p/shirt");
    expect(paths).not.toContain("/c/shoes");
    expect(paths).not.toContain("/pages/about");
    expect(paths).not.toContain("/blog/2026/jute");
  });

  it("derives the blog index from the article base", () => {
    const entries = buildMerchantSitemapEntries({
      products: [],
      collections: [],
      pages: [],
      articles: [],
      settings: CUSTOM,
    });
    expect(entries.map((e) => e.path)).toContain("/journal");
  });

  it("absolutePermalink canonicals are origin + built path", () => {
    const origin = "https://shop.test";
    expect(
      absolutePermalink(origin, CUSTOM, { kind: "product", slug: "shirt" }),
    ).toBe("https://shop.test/shop/items/shirt");
    expect(
      absolutePermalink(origin, CUSTOM, {
        kind: "article",
        slug: "jute",
        date: "2026-08-04T00:00:00Z",
      }),
    ).toBe("https://shop.test/journal/2026/jute");
    expect(buildPermalink(CUSTOM, { kind: "product", slug: "shirt" })).toBe(
      "/shop/items/shirt",
    );
  });
});

describe("merchant llms.txt advertises permalink canonicals", () => {
  it("links every kind via absolutePermalink with no /store/ leak", () => {
    const body = buildMerchantLlmsTxt("https://shop.test", {
      storeName: "Acme",
      products: [{ slug: "shirt", title: "Shirt" }],
      collections: [{ slug: "shoes", name: "Shoes" }],
      pages: [{ slug: "about", title: "About" }],
      articles: [
        { slug: "jute", title: "Jute", published_at: "2026-08-04T00:00:00Z" },
      ],
      settings: CUSTOM,
    });
    expect(body).toContain("https://shop.test/shop/items/shirt");
    expect(body).toContain("https://shop.test/shop/groups/shoes");
    expect(body).toContain("https://shop.test/info/about");
    expect(body).toContain("https://shop.test/journal/2026/jute");
    expect(body).toContain("Sitemap: https://shop.test/sitemap.xml");
    expect(body).not.toContain("/store/");
    expect(body).not.toContain("/p/shirt");
  });
});

describe("robots.txt rebases to root on a custom host", () => {
  it("custom-host root shape keeps safety rules with no /store/ leak", () => {
    const body = renderRobotsTxt({
      origin: "https://shop.test",
      storeSlug: "acme",
      settings: DEFAULT_CRAWL_SETTINGS.robots,
      storeBase: "",
      sitemapPath: "/sitemap.xml",
      llmsPath: "/llms.txt",
    });
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /checkout");
    expect(body).toContain("Disallow: /account");
    expect(body).toContain("Disallow: /order");
    expect(body).toContain("Sitemap: https://shop.test/sitemap.xml");
    expect(body).not.toContain("/store/");
  });

  it("path storefront shape is unchanged off-host", () => {
    const body = renderRobotsTxt({
      origin: "https://platform.test",
      storeSlug: "acme",
      settings: DEFAULT_CRAWL_SETTINGS.robots,
      llmsPath: "/store/acme/llms.txt",
    });
    expect(body).toContain("Allow: /store/acme");
    expect(body).toContain(
      "Sitemap: https://platform.test/store/acme/sitemap.xml",
    );
  });
});

describe("sitemap index locs rebase to root on a custom host", () => {
  const shards = [
    { kind: "products" as const, page: 1, count: 3 },
    { kind: "pages" as const, page: 1, count: 2 },
  ];

  it("custom-host index points at /sitemaps/ with no /store/ leak", () => {
    const xml = renderSitemapIndexXml(
      "https://shop.test",
      "acme",
      shards,
      {},
      { root: true },
    );
    expect(xml).toContain("https://shop.test/sitemaps/products-1.xml");
    expect(xml).toContain("https://shop.test/sitemaps/pages-1.xml");
    expect(xml).not.toContain("/store/");
  });

  it("path storefront index is unchanged off-host", () => {
    const xml = renderSitemapIndexXml("https://platform.test", "acme", shards);
    expect(xml).toContain(
      "https://platform.test/store/acme/sitemaps/products-1.xml",
    );
  });
});

describe("custom-host root route wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("platform roots gate on the request host and keep the platform fallthrough", () => {
    expect(read("src/routes/sitemap[.]xml.ts")).toContain(
      "resolveStorefrontHost",
    );
    expect(read("src/routes/sitemap[.]xml.ts")).toContain(
      "marketingSitemapEntries",
    );
    expect(read("src/routes/robots[.]txt.ts")).toContain(
      "resolveStorefrontHost",
    );
    expect(read("src/routes/robots[.]txt.ts")).toContain("marketingAllowPaths");
    expect(read("src/routes/llms[.]txt.ts")).toContain("resolveStorefrontHost");
    expect(read("src/routes/llms[.]txt.ts")).toContain(
      "renderMarketingLlmsTxt",
    );
  });

  it("custom-host branches render merchant documents from permalink settings", () => {
    expect(read("src/routes/sitemap[.]xml.ts")).toContain(
      "renderStoreSitemapIndex",
    );
    expect(read("src/routes/sitemap[.]xml.ts")).toContain("root");
    expect(read("src/routes/robots[.]txt.ts")).toContain(
      "renderStoreRobotsTxt",
    );
    expect(read("src/routes/llms[.]txt.ts")).toContain("buildMerchantLlmsTxt");
    expect(read("src/routes/llms[.]txt.ts")).toContain("permalinkSettingsFor");
  });

  it("a host-gated /sitemaps/$kind root route mirrors the per-store shard loader", () => {
    const src = read("src/routes/sitemaps.$kind.ts");
    expect(src).toContain("resolveStorefrontHost");
    expect(src).toContain("renderStoreSitemapShard");
    expect(src).toContain("root");
    expect(src).toContain("Not found");
  });
});
