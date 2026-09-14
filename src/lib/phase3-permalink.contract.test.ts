/**
 * Phase 3 exit gate — permalinks, redirect collapsing and CSV interchange.
 *
 * These are the rules that decide whether a merchant keeps their traffic after
 * changing a URL structure, so they are asserted as a contract rather than as
 * incidental unit tests. Anything that loosens one of these is a regression
 * that costs rankings, not just a failing assertion.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMALINKS,
  PermalinkError,
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
} from "./permalink";

const article: PermalinkEntity = { kind: "article", slug: "hello-world", date: "2024-03-09T10:00:00Z" };

describe("permalink settings validation", () => {
  it("normalises bases to a single leading slash without a trailing one", () => {
    const settings = validateSettings({ articleBase: "Blog/", productBase: "//shop//" });
    expect(settings.articleBase).toBe("/blog");
    expect(settings.productBase).toBe("/shop");
  });

  it("refuses reserved application prefixes", () => {
    expect(() => validateSettings({ articleBase: "/admin" })).toThrow(PermalinkError);
    expect(isReservedBase("/api")).toBe(true);
    expect(isReservedBase("/journal")).toBe(false);
  });

  it("refuses two kinds sharing one base", () => {
    expect(() => validateSettings({ articleBase: "/x", productBase: "/x" })).toThrow(PermalinkError);
  });

  it("refuses an unsupported pattern instead of silently defaulting", () => {
    expect(() => validateSettings({ articlePattern: "/%postid%" as never })).toThrow(PermalinkError);
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
      const settings = validateSettings({ ...DEFAULT_PERMALINKS, articlePattern: pattern });
      const path = buildPermalink(settings, { ...article, category: "news" });
      const parsed = parsePath(settings, path);
      expect(parsed?.kind).toBe("article");
      expect(parsed?.slug).toBe("hello-world");
    });
  }

  it("keeps kinds apart when bases differ", () => {
    const settings = validateSettings(DEFAULT_PERMALINKS);
    expect(parsePath(settings, buildPermalink(settings, { kind: "product", slug: "tee" }))?.kind).toBe("product");
    expect(parsePath(settings, buildPermalink(settings, { kind: "collection", slug: "sale" }))?.kind).toBe("collection");
    expect(parsePath(settings, buildPermalink(settings, { kind: "page", slug: "about" }))?.kind).toBe("page");
  });

  it("returns null for a path the settings do not own", () => {
    expect(parsePath(validateSettings(DEFAULT_PERMALINKS), "/checkout")).toBeNull();
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
    const after = validateSettings({ ...DEFAULT_PERMALINKS, articlePattern: "/%year%/%slug%" });
    const moves = planPermalinkChange(before, after, [article, { kind: "product", slug: "tee" }]);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: "/blog/hello-world", to: "/blog/2024/hello-world" });
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
    const { rules } = collapseRedirects([], [{ from: "/a", to: "/a", kind: "page", slug: "a" }]);
    expect(rules).toHaveLength(0);
  });
});

describe("CSV interchange", () => {
  it("imports a WordPress-style export with a header row", () => {
    const { rows, errors } = parseRedirectCsv("source,target,type\n/old,/new,301\n/gone,,410\n");
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { from: "/old", to: "/new", status: 301 },
      { from: "/gone", to: "", status: 410 },
    ]);
  });

  it("reports bad lines with line numbers instead of failing the whole import", () => {
    const { rows, errors } = parseRedirectCsv("/ok,/fine,301\ngarbage\n/next,/also,302\n");
    expect(rows).toHaveLength(2);
    expect(errors[0]?.line).toBe(2);
  });

  it("round-trips through the exporter", () => {
    const csv = toRedirectCsv([{ from: "/a", to: "/b", status: 301 }]);
    expect(parseRedirectCsv(csv).rows).toEqual([{ from: "/a", to: "/b", status: 301 }]);
  });
});

describe("path normalisation", () => {
  it("is idempotent and case-insensitive", () => {
    expect(normaliseBase("/A/B/")).toBe("/a/b");
    expect(normaliseBase(normaliseBase("/A/B/"))).toBe("/a/b");
  });
});
