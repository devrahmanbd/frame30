import { describe, expect, it } from "vitest";
import {
  AI_CRAWLERS,
  HREFLANG,
  LOCALE_PARAM,
  facetIndexPolicy,
  headingIssues,
  hreflangAlternates,
  localeFromSearch,
  localeUrl,
  paginationHeadLinks,
  paginationLinks,
  renderStoreRobots,
} from "./seo-technical";
import { normalizeSearchParams } from "./storefront-search";
import { buildStoreHead, TITLE_MAX, DESC_MAX } from "./theme-seo";
import { lintTemplate, newSection, parseAst } from "./builder-ast";

const params = (q: Record<string, unknown> = {}) => normalizeSearchParams(q);

describe("Phase 7.1 — locale alternates", () => {
  it("emits distinct per-locale hrefs plus x-default", () => {
    const links = hreflangAlternates("https://shop.test/store/acme");
    expect(links.map((l) => l["hreflang"])).toEqual([HREFLANG.en, HREFLANG.bn, "x-default"]);
    expect(links[0]!["href"]).toBe(`https://shop.test/store/acme?${LOCALE_PARAM}=en`);
    expect(links[1]!["href"]).toBe(`https://shop.test/store/acme?${LOCALE_PARAM}=bn`);
    expect(links[2]!["href"]).toBe("https://shop.test/store/acme");
  });

  it("refuses relative or missing origins", () => {
    expect(hreflangAlternates("/store/acme")).toEqual([]);
    expect(localeUrl(null, "bn")).toBeNull();
  });

  it("reads the pinned locale back out of a URL", () => {
    expect(localeFromSearch("?lang=bn")).toBe("bn");
    expect(localeFromSearch("?lang=fr")).toBeNull();
    expect(localeFromSearch("")).toBeNull();
  });

  it("wires alternates into the storefront head, never on a noindex page", () => {
    const head = buildStoreHead({
      origin: "https://shop.test",
      path: "/store/acme",
      storeName: "Acme",
    });
    const alts = head.links.filter((l) => l["rel"] === "alternate");
    expect(alts).toHaveLength(3);
    expect(new Set(alts.map((l) => l["href"]))).toHaveProperty("size", 3);
    const hidden = buildStoreHead({
      origin: "https://shop.test",
      path: "/store/acme",
      storeName: "Acme",
      noindex: true,
    });
    expect(hidden.links.filter((l) => l["rel"] === "alternate")).toHaveLength(0);
    expect(hidden.meta.find((m) => m["name"] === "robots")?.["content"]).toBe("noindex,nofollow");
  });

  it("keeps titles and descriptions inside the crawl limits", () => {
    const head = buildStoreHead({
      origin: "https://shop.test",
      path: "/store/acme",
      storeName: "A very long Bangladeshi storefront name that would blow the limit outright",
      tagline: "x".repeat(400),
    });
    expect((head.meta[0]!["title"] ?? "").length).toBeLessThanOrEqual(TITLE_MAX);
    const desc = head.meta.find((m) => m["name"] === "description")?.["content"] ?? "";
    expect(desc.length).toBeLessThanOrEqual(DESC_MAX);
  });
});

describe("Phase 7.1 — faceted canonical discipline", () => {
  const base = "/store/acme/search";

  it("keeps the clean listing indexable and self-canonical", () => {
    expect(facetIndexPolicy(base, params())).toEqual({
      robots: "index,follow",
      canonicalPath: base,
      reason: "indexable",
    });
  });

  it("indexes a single allowlisted facet on its own URL", () => {
    const policy = facetIndexPolicy(base, params({ category: "sarees" }));
    expect(policy.robots).toBe("index,follow");
    expect(policy.canonicalPath).toContain("category=sarees");
  });

  it("de-indexes facet combinations and non-allowlisted facets", () => {
    const combo = facetIndexPolicy(base, params({ category: "sarees", stock: "1" }));
    expect(combo).toMatchObject({ robots: "noindex,follow", canonicalPath: base, reason: "facet-combo" });
    const single = facetIndexPolicy(base, params({ stock: "1" }));
    expect(single).toMatchObject({ robots: "noindex,follow", canonicalPath: base });
  });

  it("never indexes a free-text query", () => {
    expect(facetIndexPolicy(base, params({ q: "shirt" }))).toMatchObject({
      robots: "noindex,follow",
      canonicalPath: base,
      reason: "query",
    });
  });

  it("keeps deep pages crawlable and self-canonical", () => {
    const policy = facetIndexPolicy(base, params({ page: "3" }));
    expect(policy.robots).toBe("index,follow");
    expect(policy.canonicalPath).toContain("page=3");
  });
});

describe("Phase 7.1 — crawlable pagination", () => {
  const base = "/store/acme/search";

  it("builds prev/next hrefs bounded by the real page count", () => {
    const first = paginationLinks(base, params(), 100);
    expect(first.prev).toBeNull();
    expect(first.next).toContain("page=2");
    const middle = paginationLinks(base, params({ page: "2" }), 100);
    expect(middle.prev).toBe(base);
    expect(middle.next).toContain("page=3");
    const last = paginationLinks(base, params({ page: String(first.last) }), 100);
    expect(last.next).toBeNull();
  });

  it("emits absolute rel=prev/next head links only with a real origin", () => {
    const links = paginationHeadLinks("https://shop.test", base, params({ page: "2" }), 100);
    expect(links.map((l) => l["rel"])).toEqual(["prev", "next"]);
    expect(links[1]!["href"]).toMatch(/^https:\/\/shop\.test/);
    expect(paginationHeadLinks(null, base, params({ page: "2" }), 100)).toEqual([]);
  });
});

describe("Phase 7.1 — per-store robots", () => {
  it("scopes every directive to the tenant and points at its sitemap", () => {
    const txt = renderStoreRobots({ indexable: true, aiCrawlers: true, origin: "https://shop.test", slug: "acme" });
    expect(txt).toContain("Allow: /store/acme");
    expect(txt).toContain("Disallow: /store/acme/checkout");
    expect(txt).toContain("Sitemap: https://shop.test/store/acme/sitemap.xml");
    expect(txt).not.toContain("/store/other");
  });

  it("blocks AI crawlers unless the merchant opted in", () => {
    const opted = renderStoreRobots({ indexable: true, aiCrawlers: true, origin: "https://s.test", slug: "acme" });
    const out = renderStoreRobots({ indexable: true, aiCrawlers: false, origin: "https://s.test", slug: "acme" });
    for (const agent of AI_CRAWLERS) {
      expect(opted).toContain(`User-agent: ${agent}\nAllow: /store/acme`);
      expect(out).toContain(`User-agent: ${agent}\nDisallow: /`);
    }
  });

  it("locks the whole store out when indexing is off", () => {
    const txt = renderStoreRobots({ indexable: false, aiCrawlers: true, origin: "https://s.test", slug: "acme" });
    expect(txt).toContain("User-agent: *\nDisallow: /");
    expect(txt).not.toContain("Allow: /store/acme");
  });
});

describe("Phase 7.1 — heading outline", () => {
  it("requires exactly one h1 and forbids level jumps", () => {
    expect(headingIssues([1, 2, 3])).toEqual([]);
    expect(headingIssues([])[0]).toMatch(/no <h1>/);
    expect(headingIssues([1, 1])[0]).toMatch(/2 <h1>/);
    expect(headingIssues([1, 3]).some((m) => /jumps from h1 to h3/.test(m))).toBe(true);
  });

  it("flags a template where two widgets claim the primary heading", () => {
    const hero = newSection("hero");
    const header = newSection("category_header");
    const ast = parseAst({
      main: [
        { ...hero, id: "a" },
        { ...header, id: "b" },
      ],
    });
    const issues = lintTemplate(ast, "index");
    expect(issues.some((i) => i.sectionId === "b" && /claims the page <h1>/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.sectionId === "a" && /claims the page <h1>/.test(i.message))).toBe(false);
  });

  it("flags a skipped level between the h1 and the next heading", () => {
    const ast = parseAst({
      main: [
        { ...newSection("hero"), id: "a" },
        { ...newSection("heading"), id: "b", props: { ...newSection("heading").props, level: "h3" } },
      ],
    });
    expect(lintTemplate(ast, "index").some((i) => /jumps from h1 to h3/.test(i.message))).toBe(true);
  });
});
