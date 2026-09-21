/**
 * Tenant blog surface (T5+D3) — hermetic tests.
 *
 * `extractStoreArticleSlug` is pure over `parsePath`, so patterned remainders
 * are pinned without a database; the head builders are pinned against the
 * merchant's live pattern so a pattern change flows to canonicals and
 * JSON-LD without a second code path. Store URLs always win in tenant mode;
 * platform `/blog/*` paths never appear in tenant heads.
 */
import { describe, expect, it } from "vitest";
import { extractStoreArticleSlug } from "./store-blog.functions";
import {
  storeArticleCanonical,
  storeArticlePath,
  storeBlogBasePath,
  storeArticleHead,
  storeListingHead,
} from "./store-blog-head";
import { DEFAULT_PERMALINKS, type PermalinkSettings } from "./permalink";

const DATED: PermalinkSettings = {
  ...DEFAULT_PERMALINKS,
  articlePattern: "/%year%/%month%/%slug%",
};

const NEWS_BASE: PermalinkSettings = {
  ...DEFAULT_PERMALINKS,
  articleBase: "/news",
};

const JOURNAL: PermalinkSettings = {
  ...DEFAULT_PERMALINKS,
  articleBase: "/journal",
  articlePattern: "/%category%/%slug%",
};

const ROOT_CATEGORY: PermalinkSettings = {
  ...DEFAULT_PERMALINKS,
  articleBase: "",
  articlePattern: "/%category%/%slug%",
};

describe("extractStoreArticleSlug", () => {
  it("passes a bare slug through", () => {
    expect(extractStoreArticleSlug(DEFAULT_PERMALINKS, "hello")).toBe("hello");
    expect(extractStoreArticleSlug(DATED, "hello")).toBe("hello");
  });

  it("parses full store-relative paths under the default pattern", () => {
    expect(extractStoreArticleSlug(DEFAULT_PERMALINKS, "/blog/hello")).toBe(
      "hello",
    );
    expect(extractStoreArticleSlug(DEFAULT_PERMALINKS, "blog/hello")).toBe(
      "hello",
    );
  });

  it("extracts the slug from dated remainders (e.g. /2026/09/x)", () => {
    expect(extractStoreArticleSlug(DATED, "2026/09/hello")).toBe("hello");
    expect(extractStoreArticleSlug(DATED, "/2026/09/hello")).toBe("hello");
    expect(extractStoreArticleSlug(DATED, "/blog/2026/09/hello")).toBe("hello");
  });

  it("extracts the slug from custom-base remainders (e.g. /news/x)", () => {
    expect(extractStoreArticleSlug(NEWS_BASE, "news/hello")).toBe("hello");
    expect(extractStoreArticleSlug(NEWS_BASE, "/news/hello")).toBe("hello");
    expect(extractStoreArticleSlug(JOURNAL, "tech/hello")).toBe("hello");
    expect(extractStoreArticleSlug(JOURNAL, "/journal/tech/hello")).toBe(
      "hello",
    );
  });

  it("parses root-based category patterns", () => {
    expect(extractStoreArticleSlug(ROOT_CATEGORY, "/news/hello")).toBe("hello");
  });

  it("falls back to the last segment for unparseable tails", () => {
    expect(extractStoreArticleSlug(DATED, "hello")).toBe("hello");
    expect(extractStoreArticleSlug(DATED, "weird/tail")).toBe("tail");
  });

  it("returns null for empty input", () => {
    expect(extractStoreArticleSlug(DEFAULT_PERMALINKS, "")).toBeNull();
    expect(extractStoreArticleSlug(DEFAULT_PERMALINKS, "   ")).toBeNull();
    expect(extractStoreArticleSlug(DEFAULT_PERMALINKS, "/")).toBeNull();
  });

  it("strips query and fragment before parsing", () => {
    expect(extractStoreArticleSlug(DATED, "2026/09/hello?utm=x#top")).toBe(
      "hello",
    );
  });
});

describe("store-blog-head", () => {
  it("prefers the request origin for the article canonical", () => {
    expect(
      storeArticleCanonical("https://shop.example", DEFAULT_PERMALINKS, {
        slug: "hello",
      }),
    ).toBe("https://shop.example/blog/hello");
  });

  it("builds patterned article paths via buildPermalink", () => {
    expect(
      storeArticlePath(DATED, {
        slug: "hello",
        publishedAt: "2026-09-04T00:00:00Z",
      }),
    ).toBe("/blog/2026/09/hello");
    expect(
      storeArticleCanonical("https://shop.example", JOURNAL, {
        slug: "hello",
        categorySlug: "tech",
      }),
    ).toBe("https://shop.example/journal/tech/hello");
  });

  it("honours an explicit author canonical first", () => {
    expect(
      storeArticleCanonical("https://shop.example", DEFAULT_PERMALINKS, {
        slug: "hello",
        canonical: "https://other.example/x",
      }),
    ).toBe("https://other.example/x");
  });

  it("degrades to store-relative paths without an origin", () => {
    expect(
      storeArticleCanonical(null, DEFAULT_PERMALINKS, { slug: "hello" }),
    ).toBe("/blog/hello");
  });

  it("serves the listing at the merchant base, defaulting to /blog", () => {
    expect(storeBlogBasePath(DEFAULT_PERMALINKS)).toBe("/blog");
    expect(storeBlogBasePath(NEWS_BASE)).toBe("/news");
    expect(storeBlogBasePath(ROOT_CATEGORY)).toBe("/blog");
  });

  const article = {
    slug: "hello",
    title: "Hello",
    titleEn: null,
    excerpt: "Excerpt",
    body: "Body",
    coverImageUrl: null,
    publishedAt: "2026-09-04T00:00:00Z",
    updatedAt: null,
    metaTitle: null,
    metaDescription: null,
    canonical: null,
    robots: null,
    readingMinutes: 2,
    merchant: { name: "Flame", slug: "flame-fashion-bd" },
    category: null,
  };

  it("emits store canonicals and store item URLs in listing head", () => {
    const head = storeListingHead({
      origin: "https://shop.example",
      settings: DATED,
      merchantName: "Flame",
      paging: {
        page: 1,
        pageSize: 12,
        total: 1,
        lastPage: 1,
        from: 0,
        to: 11,
        overrun: false,
        prevPath: null,
        nextPath: null,
      },
      articles: [
        {
          slug: "hello",
          title: "Hello",
          publishedAt: "2026-09-04T00:00:00Z",
          categorySlug: null,
        },
      ],
    });
    const canonical = head.links.find((l) => l["rel"] === "canonical");
    expect(canonical?.["href"]).toBe("https://shop.example/blog");
    const graph = JSON.parse(head.scripts[0]!.children) as {
      mainEntity: { itemListElement: { url: string }[] };
    };
    expect(graph.mainEntity.itemListElement[0]!.url).toBe(
      "https://shop.example/blog/2026/09/hello",
    );
    // Platform RSS alternates stay global-mode-only.
    expect(head.links.some((l) => (l["href"] ?? "").includes("blog.xml"))).toBe(
      false,
    );
  });

  it("emits the store canonical for the article head", () => {
    const head = storeArticleHead({
      origin: "https://shop.example",
      settings: DATED,
      merchantName: "Flame",
      article,
    });
    const canonical = head.links.find((l) => l["rel"] === "canonical");
    expect(canonical?.["href"]).toBe("https://shop.example/blog/2026/09/hello");
    const graph = JSON.parse(head.scripts[0]!.children) as { url: string };
    expect(graph.url).toBe("https://shop.example/blog/2026/09/hello");
  });
});
