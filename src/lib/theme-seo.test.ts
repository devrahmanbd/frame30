import { describe, expect, it } from "vitest";
import { THEME_PRESETS } from "./theme-presets";
import {
  DESC_MAX,
  TITLE_MAX,
  THEME_SEO_CATEGORY,
  absUrl,
  buildPageHead,
  buildProductHead,
  buildSearchHead,
  buildStoreHead,
  clamp,
  performanceLinks,
  priceString,
  seoProfileFor,
} from "./theme-seo";

const ORIGIN = "https://shop.example.com";

function meta(head: { meta: Record<string, string>[] }, key: string, value: string) {
  return head.meta.find((m) => m[key] === value);
}
function content(head: { meta: Record<string, string>[] }, key: string, value: string) {
  return meta(head, key, value)?.["content"];
}
function ld(head: { scripts: { type: string; children: string }[] }, type: string) {
  return head.scripts
    .map((s) => JSON.parse(s.children.replace(/\\u003c/g, "<")) as Record<string, unknown>)
    .find((n) => n["@type"] === type) as unknown as never;
}

describe("theme seo profiles", () => {
  it("covers every official theme and matches preset categories", () => {
    for (const preset of THEME_PRESETS) {
      expect(THEME_SEO_CATEGORY[preset.key], preset.key).toBe(preset.category);
    }
    expect(Object.keys(THEME_SEO_CATEGORY).sort()).toEqual(THEME_PRESETS.map((p) => p.key).sort());
  });

  it("falls back to the default profile for unknown themes", () => {
    expect(seoProfileFor(null).jsonld.product).toBe(true);
    expect(seoProfileFor("does-not-exist").socialCard).toBe("summary_large_image");
    expect(seoProfileFor("b2b").socialCard).toBe("summary");
  });
});

describe("primitives", () => {
  it("clamps on a word boundary and marks the cut", () => {
    const out = clamp("a".repeat(10) + " " + "b".repeat(80), 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
    expect(clamp("  short   title ", 60)).toBe("short title");
  });

  it("only builds absolute URLs from a real origin", () => {
    expect(absUrl(ORIGIN, "/store/a")).toBe("https://shop.example.com/store/a");
    expect(absUrl(ORIGIN + "/", "store/a")).toBe("https://shop.example.com/store/a");
    expect(absUrl(null, "/store/a")).toBeNull();
    expect(absUrl("shop.example.com", "/a")).toBeNull();
  });

  it("renders minor units without float arithmetic", () => {
    expect(priceString(199900, "BDT")).toBe("1999.00");
    expect(priceString(5, "BDT")).toBe("0.05");
    expect(priceString(0, "USD")).toBe("0.00");
  });
});

describe("store head", () => {
  const head = buildStoreHead({
    origin: ORIGIN,
    path: "/store/char-bazaar",
    storeName: "Char Bazaar",
    themeKey: "classic",
    tagline: "Fresh goods delivered across Dhaka",
    products: [
      { title: "Rice 5kg", slug: "rice-5kg", image_url: "https://cdn.example.com/rice.jpg" },
      { title: "Tea", slug: "tea", image_url: null },
    ],
  });

  it("emits canonical, hreflang and og:url", () => {
    expect(head.links).toContainEqual({ rel: "canonical", href: `${ORIGIN}/store/char-bazaar` });
    expect(head.links.filter((l) => l.rel === "alternate")).toHaveLength(3);
    expect(content(head, "property", "og:url")).toBe(`${ORIGIN}/store/char-bazaar`);
  });

  it("keeps title and description within search limits", () => {
    expect(head.meta[0]?.["title"]?.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(content(head, "name", "description")!.length).toBeLessThanOrEqual(DESC_MAX);
  });

  it("emits Organization, WebSite search action and ItemList", () => {
    expect(ld(head, "Organization")).toBeTruthy();
    const site = ld(head, "WebSite") as { potentialAction?: { target: string } };
    expect(site.potentialAction?.target).toContain("/search?q={search_term_string}");
    const list = ld(head, "ItemList") as { itemListElement: unknown[] };
    expect(list.itemListElement).toHaveLength(2);
  });

  it("preconnects to media origins and preloads the hero image", () => {
    expect(head.links).toContainEqual({
      rel: "preconnect",
      href: "https://cdn.example.com",
      crossOrigin: "anonymous",
    });
    expect(head.links).toContainEqual({
      rel: "preload",
      as: "image",
      href: "https://cdn.example.com/rice.jpg",
      fetchpriority: "high",
    });
  });
});

describe("product head", () => {
  const head = buildProductHead({
    origin: ORIGIN,
    path: "/store/char-bazaar/p/rice-5kg",
    storePath: "/store/char-bazaar",
    storeName: "Char Bazaar",
    themeKey: "classic",
    product: {
      title: "Rice 5kg",
      slug: "rice-5kg",
      description: "Premium aromatic rice",
      image_url: "https://cdn.example.com/rice.jpg",
      sku: "RICE-5",
    },
    currency: "BDT",
    priceMinor: 89900,
    inStock: true,
  });

  it("emits a Product offer in integer-derived currency", () => {
    const product = ld(head, "Product") as {
      offers: { price: string; priceCurrency: string; availability: string };
    };
    expect(product.offers.price).toBe("899.00");
    expect(product.offers.priceCurrency).toBe("BDT");
    expect(product.offers.availability).toBe("https://schema.org/InStock");
  });

  it("emits a two-step breadcrumb", () => {
    const crumbs = ld(head, "BreadcrumbList") as { itemListElement: { name: string }[] };
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Char Bazaar", "Rice 5kg"]);
  });

  it("marks out-of-stock products correctly", () => {
    const oos = buildProductHead({
      origin: ORIGIN,
      path: "/store/a/p/b",
      storePath: "/store/a",
      storeName: "A",
      product: { title: "B", slug: "b" },
      currency: "BDT",
      priceMinor: 100,
      inStock: false,
    });
    const product = ld(oos, "Product") as { offers: { availability: string } };
    expect(product.offers.availability).toBe("https://schema.org/OutOfStock");
  });
});

describe("page head", () => {
  it("honours the page robots directive and drops canonical when noindex", () => {
    const head = buildPageHead({
      origin: ORIGIN,
      path: "/store/a/pages/policy",
      storePath: "/store/a",
      storeName: "A",
      noindex: true,
      page: { title: "Policy", excerpt: "How returns work" },
    });
    expect(content(head, "name", "robots")).toBe("noindex,nofollow");
    expect(head.links.find((l) => l.rel === "canonical")).toBeUndefined();
  });

  it("prefers author meta fields and can emit FAQPage", () => {
    const head = buildPageHead({
      origin: ORIGIN,
      path: "/store/a/pages/faq",
      storePath: "/store/a",
      storeName: "A",
      page: { title: "FAQ", meta_title: "Delivery FAQ", meta_description: "Everything about delivery" },
      faq: [{ question: "When?", answer: "1-2 days" }],
    });
    expect(head.meta[0]?.["title"]).toBe("Delivery FAQ");
    expect(ld(head, "FAQPage")).toBeTruthy();
    expect(ld(head, "Article")).toBeTruthy();
  });
});

describe("search head", () => {
  it("keeps query pages out of the index but follows links", () => {
    const head = buildSearchHead({
      path: "/store/a/search",
      storePath: "/store/a",
      storeName: "A",
      query: "rice",
      total: 3,
    });
    expect(content(head, "name", "robots")).toBe("noindex,follow");
    expect(head.links.find((l) => l.rel === "canonical")).toBeUndefined();
  });
});

describe("performance links", () => {
  it("ignores malformed and relative media URLs", () => {
    const links = performanceLinks(seoProfileFor("classic"), {
      heroImage: "/local.png",
      imageUrls: ["not a url", null, undefined],
    });
    expect(links).toHaveLength(0);
  });
});
