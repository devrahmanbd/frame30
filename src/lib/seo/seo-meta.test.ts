import { describe, expect, it } from "vitest";
import {
  EMPTY_ENTITY_SEO,
  FOCUS_KEYWORDS_MAX,
  analyseEntitySeo,
  applyTokens,
  buildJsonLd,
  metaMeters,
  parseEntitySeo,
  rankMathBand,
  robotsContent,
  robotsFromContent,
  safeAbsoluteUrl,
  safeTarget,
} from "./seo-meta";
import {
  DEFAULT_SITE_SEO,
  normalisePath,
  parseSiteSeo,
  resolveTemplate,
  validateRedirect,
} from "./site-seo";

const base = { url: "https://shop.test/blog/hello", origin: "https://shop.test", siteName: "Acme" };

describe("Phase 13 — entity SEO parsing", () => {
  it("fills every field from an empty document", () => {
    const seo = parseEntitySeo(undefined);
    expect(seo).toEqual(EMPTY_ENTITY_SEO);
  });

  it("caps focus keywords, trims them and drops duplicates", () => {
    const seo = parseEntitySeo({
      focusKeywords: ["  saree ", "SAREE", "cotton", "silk", "linen", "jute", "khadi", "muslin"],
    });
    expect(seo.focusKeywords.length).toBeLessThanOrEqual(FOCUS_KEYWORDS_MAX);
    expect(seo.focusKeywords[0]).toBe("saree");
    expect(seo.focusKeywords.filter((k) => k.toLowerCase() === "saree")).toHaveLength(1);
  });

  it("refuses a javascript: canonical or share image", () => {
    expect(safeAbsoluteUrl("javascript:alert(1)")).toBe("");
    expect(safeAbsoluteUrl("https://cdn.test/a.jpg")).toBe("https://cdn.test/a.jpg");
    expect(safeTarget("javascript:alert(1)")).toBe("");
    expect(safeTarget("/new-page")).toBe("/new-page");
  });

  it("round-trips the robots flags through the meta content string", () => {
    const seo = parseEntitySeo({ robots: { index: false, follow: false, noarchive: true } });
    const content = robotsContent(seo);
    expect(content).toContain("noindex");
    expect(content).toContain("nofollow");
    expect(content).toContain("noarchive");
    const flags = robotsFromContent(content);
    expect(flags.index).toBe(false);
    expect(flags.follow).toBe(false);
    expect(flags.noarchive).toBe(true);
  });
});

describe("Phase 13 — tokens", () => {
  it("substitutes every known variable and clears the unknown ones", () => {
    const out = applyTokens("%title% %sep% %sitename% %nope%", {
      title: "Hello",
      sep: "-",
      sitename: "Acme",
    });
    expect(out).toBe("Hello - Acme");
  });

  it("resolves site templates per content type", () => {
    const resolved = resolveTemplate(DEFAULT_SITE_SEO, "product", {
      title: "Saree",
      sitename: "Acme",
      excerpt: "Soft.",
    });
    expect(resolved.title).toBe("Saree - Acme");
    expect(resolved.description).toBe("Soft.");
  });
});

describe("Phase 13 — structured data", () => {
  it("emits nothing when the merchant picked no schema", () => {
    expect(
      buildJsonLd(EMPTY_ENTITY_SEO, {
        ...base,
        authorName: "",
        publishedAt: null,
        updatedAt: null,
        imageUrl: "",
      }),
    ).toBeNull();
  });

  it("emits an Article graph with the headline and author", () => {
    const seo = parseEntitySeo({ schema: { type: "Article", headline: "Hello world" } });
    const ld = buildJsonLd(seo, {
      ...base,
      authorName: "Rina",
      publishedAt: "2026-01-01",
      updatedAt: null,
      imageUrl: "",
    });
    expect(ld).toMatchObject({ "@type": "Article", headline: "Hello world" });
  });

  it("skips FAQPage markup when there are no questions", () => {
    const empty = parseEntitySeo({ schema: { type: "FAQPage", faq: [] } });
    expect(
      buildJsonLd(empty, {
        ...base,
        authorName: "",
        publishedAt: null,
        updatedAt: null,
        imageUrl: "",
      }),
    ).toBeNull();
    const filled = parseEntitySeo({
      schema: { type: "FAQPage", faq: [{ q: "Ships?", a: "Yes." }] },
    });
    expect(
      buildJsonLd(filled, {
        ...base,
        authorName: "",
        publishedAt: null,
        updatedAt: null,
        imageUrl: "",
      }),
    ).toMatchObject({
      "@type": "FAQPage",
    });
  });
});

describe("Phase 13 — analysis", () => {
  const input = {
    seo: parseEntitySeo({
      focusKeywords: ["cotton saree"],
      title: "Cotton saree guide",
      description: "How to pick a cotton saree that lasts.",
    }),
    fallbackTitle: "Cotton saree guide",
    fallbackDescription: "How to pick a cotton saree.",
    content: `Cotton saree buyers ask the same question every season. ${"A cotton saree lasts longer when washed cold. ".repeat(30)}`,
    ...base,
  };

  it("scores, bands and groups every check", () => {
    const report = analyseEntitySeo(input);
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.groups.length).toBeGreaterThan(0);
    for (const group of report.groups) {
      expect(group.total).toBeGreaterThanOrEqual(group.pass);
      expect(group.checks.length).toBeGreaterThan(0);
    }
  });

  it("puts failures before passes so the fix list reads top-down", () => {
    const report = analyseEntitySeo(input);
    for (const group of report.groups) {
      const ranks = group.checks.map((c) =>
        c.status === "fail" ? 0 : c.status === "warn" ? 1 : c.status === "pass" ? 2 : 3,
      );
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    }
  });

  it("resolves the preview title through the tokens, so preview and meters agree", () => {
    const report = analyseEntitySeo({
      ...input,
      seo: parseEntitySeo({ title: "%title% %sep% %sitename%" }),
    });
    expect(report.resolved.title).toContain("Acme");
    const meters = metaMeters(report.resolved.title, report.resolved.description, "desktop");
    expect(meters.title.px).toBeGreaterThan(0);
  });

  it("scores an empty document lower than a complete one", () => {
    const bare = analyseEntitySeo({ ...input, seo: EMPTY_ENTITY_SEO, content: "Too short." });
    expect(bare.score).toBeLessThan(analyseEntitySeo(input).score);
  });

  it("uses Rank Math's bands", () => {
    expect(rankMathBand(90).tone).toBe("success");
    expect(rankMathBand(60).tone).toBe("warning");
    expect(rankMathBand(20).tone).toBe("danger");
  });
});

describe("Phase 13 — site settings and redirects", () => {
  it("falls back to safe defaults for a corrupt document", () => {
    const settings = parseSiteSeo({ separator: "!!!!!", sitemap: { perPage: 99999 } });
    expect(settings.separator).toBe("-");
    expect(settings.sitemap.perPage).toBeLessThanOrEqual(1000);
  });

  it("normalises redirect paths and rejects loops", () => {
    expect(normalisePath("old-page")).toBe("/old-page");
    expect(normalisePath("https://shop.test/old")).toBe("/old");
    expect(validateRedirect("/a", "/b")).toBeNull();
    expect(validateRedirect("", "/b")).toBe("source");
    expect(validateRedirect("/a", "")).toBe("target");
    expect(validateRedirect("/a", "/a")).toBe("loop");
    expect(validateRedirect("/", "/b")).toBe("source");
  });
});
