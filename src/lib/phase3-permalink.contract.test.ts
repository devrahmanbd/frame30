/**
 * Phase 3 exit gate — permalinks, redirect collapsing and CSV interchange.
 *
 * These are the rules that decide whether a merchant keeps their traffic after
 * changing a URL structure, so they are asserted as a contract rather than as
 * incidental unit tests. Anything that loosens one of these is a regression
 * that costs rankings, not just a failing assertion.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PERMALINKS,
  PermalinkError,
  absolutePermalink,
  buildPermalink,
  collapseRedirects,
  isReservedBase,
  normaliseBase,
  parsePath,
  parseRedirectCsv,
  planPermalinkChange,
  toRedirectCsv,
  validateSettings,
  validateSlug,
  type PermalinkEntity,
  type PermalinkSettings,
} from "./permalink";
import { buildMerchantSitemapEntries } from "./store-sitemap.server";
import { slugChangeRule, tombstoneRule } from "./url-lifecycle";

const article: PermalinkEntity = {
  kind: "article",
  slug: "hello-world",
  date: "2024-03-09T10:00:00Z",
};

describe("permalink settings validation", () => {
  it("normalises bases to a single leading slash without a trailing one", () => {
    const settings = validateSettings({
      articleBase: "Blog/",
      productBase: "//shop//",
    });
    expect(settings.articleBase).toBe("/blog");
    expect(settings.productBase).toBe("/shop");
  });

  it("refuses reserved application prefixes", () => {
    expect(() => validateSettings({ articleBase: "/dashboard" })).toThrow(
      PermalinkError,
    );
    expect(isReservedBase("/api")).toBe(true);
    expect(isReservedBase("/journal")).toBe(false);
  });

  it("refuses two kinds sharing one base", () => {
    expect(() =>
      validateSettings({ articleBase: "/x", productBase: "/x" }),
    ).toThrow(PermalinkError);
  });

  it("refuses an unsupported pattern instead of silently defaulting", () => {
    expect(() =>
      validateSettings({ articlePattern: "/%postid%" as never }),
    ).toThrow(PermalinkError);
  });
});

describe("building and parsing are inverse", () => {
  const patterns = [
    "/%slug%",
    "/%year%/%slug%",
    "/%year%/%month%/%slug%",
    "/%year%/%month%/%day%/%slug%",
    "/%category%/%slug%",
  ] as const;

  for (const pattern of patterns) {
    it(`round-trips ${pattern}`, () => {
      const settings = validateSettings({
        ...DEFAULT_PERMALINKS,
        articlePattern: pattern,
      });
      const path = buildPermalink(settings, { ...article, category: "news" });
      const parsed = parsePath(settings, path);
      expect(parsed?.kind).toBe("article");
      expect(parsed?.slug).toBe("hello-world");
    });
  }

  it("keeps kinds apart when bases differ", () => {
    const settings = validateSettings(DEFAULT_PERMALINKS);
    expect(
      parsePath(
        settings,
        buildPermalink(settings, { kind: "product", slug: "tee" }),
      )?.kind,
    ).toBe("product");
    expect(
      parsePath(
        settings,
        buildPermalink(settings, { kind: "collection", slug: "sale" }),
      )?.kind,
    ).toBe("collection");
    expect(
      parsePath(
        settings,
        buildPermalink(settings, { kind: "page", slug: "about" }),
      )?.kind,
    ).toBe("page");
  });

  it("returns null for a path the settings do not own", () => {
    expect(
      parsePath(validateSettings(DEFAULT_PERMALINKS), "/checkout"),
    ).toBeNull();
  });
});

describe("slug validation", () => {
  it("accepts kebab-case and rejects the rest", () => {
    expect(validateSlug(" Hello-World ")).toBe("hello-world");
    expect(() => validateSlug("hello world")).toThrow(PermalinkError);
    expect(() => validateSlug("")).toThrow(PermalinkError);
    expect(() => validateSlug("--")).toThrow(PermalinkError);
  });
});

describe("change planning", () => {
  it("plans one move per live entity whose URL actually changes", () => {
    const before = validateSettings(DEFAULT_PERMALINKS);
    const after = validateSettings({
      ...DEFAULT_PERMALINKS,
      articlePattern: "/%year%/%slug%",
    });
    const moves = planPermalinkChange(before, after, [
      article,
      { kind: "product", slug: "tee" },
    ]);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      from: "/blog/hello-world",
      to: "/blog/2024/hello-world",
    });
  });

  it("plans nothing when the settings are unchanged", () => {
    const settings = validateSettings(DEFAULT_PERMALINKS);
    expect(planPermalinkChange(settings, settings, [article])).toHaveLength(0);
  });
});

describe("redirect collapsing", () => {
  it("re-points an existing hop instead of creating a chain", () => {
    const { rules } = collapseRedirects(
      [{ from: "/a", to: "/b" }],
      [{ from: "/b", to: "/c", kind: "article", slug: "b" }],
    );
    const map = new Map(rules.map((r) => [r.from, r.to]));
    expect(map.get("/a")).toBe("/c");
    expect(map.get("/b")).toBe("/c");
  });

  it("drops a rule that would loop back onto itself", () => {
    const { rules, dropped } = collapseRedirects(
      [{ from: "/a", to: "/b" }],
      [{ from: "/b", to: "/a", kind: "article", slug: "a" }],
    );
    expect(dropped.some((d) => d.reason === "loop")).toBe(true);
    expect(rules.every((r) => r.from !== r.to)).toBe(true);
  });

  it("never emits a self-redirect", () => {
    const { rules } = collapseRedirects(
      [],
      [{ from: "/a", to: "/a", kind: "page", slug: "a" }],
    );
    expect(rules).toHaveLength(0);
  });
});

describe("CSV interchange", () => {
  it("imports a WordPress-style export with a header row", () => {
    const { rows, errors } = parseRedirectCsv(
      "source,target,type\n/old,/new,301\n/gone,,410\n",
    );
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { from: "/old", to: "/new", status: 301 },
      { from: "/gone", to: "", status: 410 },
    ]);
  });

  it("reports bad lines with line numbers instead of failing the whole import", () => {
    const { rows, errors } = parseRedirectCsv(
      "/ok,/fine,301\ngarbage\n/next,/also,302\n",
    );
    expect(rows).toHaveLength(2);
    expect(errors[0]?.line).toBe(2);
  });

  it("round-trips through the exporter", () => {
    const csv = toRedirectCsv([{ from: "/a", to: "/b", status: 301 }]);
    expect(parseRedirectCsv(csv).rows).toEqual([
      { from: "/a", to: "/b", status: 301 },
    ]);
  });
});

describe("path normalisation", () => {
  it("is idempotent and case-insensitive", () => {
    expect(normaliseBase("/A/B/")).toBe("/a/b");
    expect(normaliseBase(normaliseBase("/A/B/"))).toBe("/a/b");
  });
});

const CUSTOM_BASES: PermalinkSettings = validateSettings({
  ...DEFAULT_PERMALINKS,
  articleBase: "/journal",
  productBase: "/shop",
  collectionBase: "/collections",
  pageBase: "/info",
});

describe("custom bases — writers honour merchant settings", () => {
  it("builds every kind under its own base, never the default", () => {
    expect(
      buildPermalink(CUSTOM_BASES, { kind: "article", slug: "hello-world" }),
    ).toBe("/journal/hello-world");
    expect(buildPermalink(CUSTOM_BASES, { kind: "product", slug: "tee" })).toBe(
      "/shop/tee",
    );
    expect(
      buildPermalink(CUSTOM_BASES, { kind: "collection", slug: "sale" }),
    ).toBe("/collections/sale");
    expect(buildPermalink(CUSTOM_BASES, { kind: "page", slug: "about" })).toBe(
      "/info/about",
    );
  });

  it("builds absolute URLs from the same settings", () => {
    expect(
      absolutePermalink("https://shop.example", CUSTOM_BASES, {
        kind: "product",
        slug: "tee",
      }),
    ).toBe("https://shop.example/shop/tee");
  });

  it("honours dated and categorised article patterns under a custom base", () => {
    const dated = validateSettings({
      ...CUSTOM_BASES,
      articlePattern: "/%year%/%slug%",
    });
    expect(buildPermalink(dated, { ...article, category: "news" })).toBe(
      "/journal/2024/hello-world",
    );
    const categorised = validateSettings({
      ...CUSTOM_BASES,
      articlePattern: "/%category%/%slug%",
    });
    expect(buildPermalink(categorised, { ...article, category: "news" })).toBe(
      "/journal/news/hello-world",
    );
  });
});

describe("custom bases — parsing stays inverse for every kind", () => {
  it("round-trips all four kinds under custom bases", () => {
    const entities: PermalinkEntity[] = [
      { ...article, category: "news" },
      { kind: "product", slug: "tee" },
      { kind: "collection", slug: "sale" },
      { kind: "page", slug: "about" },
    ];
    for (const entity of entities) {
      const path = buildPermalink(CUSTOM_BASES, entity);
      const parsed = parsePath(CUSTOM_BASES, path);
      expect(parsed?.kind).toBe(entity.kind);
      expect(parsed?.slug).toBe(entity.slug);
    }
  });

  it("no longer owns the default base once it is customised", () => {
    expect(parsePath(CUSTOM_BASES, "/p/tee")).toBeNull();
    expect(parsePath(CUSTOM_BASES, "/blog/hello-world")).toBeNull();
    expect(parsePath(CUSTOM_BASES, "/pages/about")).toBeNull();
  });
});

describe("custom bases — a base change plans moves for the affected kind", () => {
  it("moves products when /p becomes /shop and leaves pages alone", () => {
    const before = validateSettings(DEFAULT_PERMALINKS);
    const moves = planPermalinkChange(before, CUSTOM_BASES, [
      { kind: "product", slug: "tee" },
      { kind: "page", slug: "about" },
    ]);
    const bySlug = new Map(moves.map((m) => [m.slug, m]));
    expect(bySlug.get("tee")).toMatchObject({
      from: "/p/tee",
      to: "/shop/tee",
    });
    expect(bySlug.get("about")).toMatchObject({
      from: "/pages/about",
      to: "/info/about",
    });
  });
});

describe("custom bases — merchant sitemap advertises permalink URLs", () => {
  it("uses every custom base, not the literal route shapes", () => {
    const entries = buildMerchantSitemapEntries({
      products: [{ slug: "tee" }],
      collections: [{ slug: "sale" }],
      pages: [{ slug: "about" }],
      articles: [{ slug: "hello-world" }],
      settings: CUSTOM_BASES,
    });
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("/shop/tee");
    expect(paths).toContain("/collections/sale");
    expect(paths).toContain("/info/about");
    expect(paths).toContain("/journal/hello-world");
    expect(paths).not.toContain("/p/tee");
    expect(paths).not.toContain("/c/sale");
    expect(paths).not.toContain("/pages/about");
    expect(paths).not.toContain("/blog/hello-world");
  });

  it("falls back to defaults when no settings are provided", () => {
    const entries = buildMerchantSitemapEntries({
      products: [{ slug: "tee" }],
      collections: [],
      pages: [],
      articles: [],
    });
    expect(entries.map((e) => e.path)).toContain("/p/tee");
  });
});

describe("custom bases — lifecycle rules are built from permalink bases", () => {
  it("builds rename and tombstone rules under a custom product base", () => {
    expect(slugChangeRule("/shop", "old", "new")).toEqual({
      from: "/shop/old",
      to: "/shop/new",
      status: 301,
    });
    expect(tombstoneRule("/shop", "gone")).toEqual({
      from: "/shop/gone",
      to: null,
      status: 410,
    });
  });
});

const CMS_SERVER = readFileSync("src/lib/cms.server.ts", "utf8");
const EDITOR_SERVER = readFileSync("src/lib/editor/editor.server.ts", "utf8");
const LIFECYCLE_SERVER = readFileSync(
  "src/lib/url-lifecycle.server.ts",
  "utf8",
);
const LIFECYCLE_FN = readFileSync("src/lib/url-lifecycle.functions.ts", "utf8");
const STOREFRONT_SEARCH_SERVER = readFileSync(
  "src/lib/storefront-search.server.ts",
  "utf8",
);
const URL_RESOLVE_SERVER = readFileSync(
  "src/lib/url-resolve.server.ts",
  "utf8",
);

describe("custom bases — writers route through buildPermalink", () => {
  it("cms slug redirects use the merchant permalink settings", () => {
    expect(CMS_SERVER).toContain("buildPermalink");
    expect(CMS_SERVER).toContain("permalinkSettingsFor");
    expect(CMS_SERVER).not.toContain("`/blog/${");
  });

  it("editor redirects and seo urls use the merchant permalink settings", () => {
    expect(EDITOR_SERVER).toContain("buildPermalink");
    expect(EDITOR_SERVER).toContain("permalinkSettingsFor");
    expect(EDITOR_SERVER).not.toContain("`/blog/${");
    expect(EDITOR_SERVER).not.toContain("`/pages/${");
  });

  it("url lifecycle exposes permalink-aware slug-change and tombstone helpers", () => {
    expect(LIFECYCLE_SERVER).toContain("buildPermalink");
    expect(LIFECYCLE_SERVER).toContain("recordPermalinkSlugChange");
    expect(LIFECYCLE_SERVER).toContain("recordPermalinkTombstone");
  });

  it("lifecycle callers derive bases from permalink settings", () => {
    expect(LIFECYCLE_FN).toContain("permalinkSettingsFor");
    expect(LIFECYCLE_FN).not.toContain("/store/${storeSlug}/p");
    expect(STOREFRONT_SEARCH_SERVER).toContain("permalinkSettingsFor");
    expect(STOREFRONT_SEARCH_SERVER).not.toContain(
      "`/store/${storeSlug}/pages`",
    );
  });

  it("url resolution covers products, collections and pages via parsePath", () => {
    expect(URL_RESOLVE_SERVER).toContain("parsePath");
    expect(URL_RESOLVE_SERVER).toContain('from("products")');
    expect(URL_RESOLVE_SERVER).toContain('from("collections")');
    expect(URL_RESOLVE_SERVER).toContain('from("storefront_pages")');
  });
});
