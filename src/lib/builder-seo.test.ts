import { describe, expect, it } from "vitest";
import { EMPTY_AST, newSection, type ThemeAst } from "./builder-ast";
import {
  MIN_WORDS,
  SEO_TITLE_PX_MAX,
  analyseTemplate,
  hasSkippedLevel,
  isSitemapEligible,
  pageSeoHead,
  parsePageSeo,
  pixelWidth,
  safeUrl,
  scoreBuilderSeo,
  serpPreview,
  EMPTY_PAGE_SEO,
} from "./builder-seo";
import {
  classifyIssue,
  classifyIssues,
  defaultCountdownEnd,
  isActionable,
  planFix,
} from "./builder-lint-fixes";

function ast(main: ReturnType<typeof newSection>[]): ThemeAst {
  return { ...EMPTY_AST, main };
}

function withProps(type: Parameters<typeof newSection>[0], props: Record<string, unknown>) {
  const node = newSection(type);
  return { ...node, props: { ...node.props, ...props } } as ReturnType<typeof newSection>;
}

describe("page SEO parsing", () => {
  it("collapses whitespace, clamps length and rejects unsafe URLs", () => {
    const seo = parsePageSeo({
      title: "  Spring   sale  ",
      canonical: "javascript:alert(1)",
      ogImage: "https://cdn.example.com/a.jpg",
      noindex: "true",
      description: "x".repeat(1000),
    });
    expect(seo.title).toBe("Spring sale");
    expect(seo.canonical).toBe("");
    expect(seo.ogImage).toBe("https://cdn.example.com/a.jpg");
    expect(seo.noindex).toBe(true);
    expect(seo.description.length).toBe(320);
  });

  it("treats junk input as an empty record rather than throwing", () => {
    expect(parsePageSeo(null)).toEqual(EMPTY_PAGE_SEO);
    expect(parsePageSeo("nope")).toEqual(EMPTY_PAGE_SEO);
    expect(safeUrl("ftp://x/y")).toBe("");
  });
});

describe("pixel-width SERP preview", () => {
  it("measures wide and narrow characters differently", () => {
    expect(pixelWidth("mmmmmmmmmm")).toBeGreaterThan(pixelWidth("iiiiiiiiii"));
  });

  it("flags truncation past the Google limit", () => {
    const preview = serpPreview(
      { ...EMPTY_PAGE_SEO, title: "W".repeat(120) },
      { title: "fallback", description: "" },
    );
    expect(preview.titlePx).toBeGreaterThan(SEO_TITLE_PX_MAX);
    expect(preview.titleTruncated).toBe(true);
  });

  it("falls back to the route title when no override is set", () => {
    expect(serpPreview(EMPTY_PAGE_SEO, { title: "Home — Store", description: "d" }).title).toBe(
      "Home — Store",
    );
  });
});

describe("template analysis", () => {
  it("counts h1 claims, alt coverage and internal links from the AST", () => {
    const report = analyseTemplate(
      ast([
        withProps("hero", { title: "Spring drop", image: "https://cdn/x.jpg", image_alt: "" }),
        withProps("rich_text", { body: "Lorem ipsum copy that a crawler can read." }),
        withProps("banner", { ctaHref: "/collections/new", text: "Shop new" }),
      ]),
    );
    expect(report.h1Claims).toBeGreaterThanOrEqual(1);
    expect(report.images.total).toBe(1);
    expect(report.images.withAlt).toBe(0);
    expect(report.internalLinks).toBe(1);
    expect(report.words).toBeGreaterThan(3);
  });

  it("reports duplicate singleton JSON-LD types", () => {
    const faq = withProps("faq", { q1: "Delivery?", a1: "1-3 days", q2: "Returns?", a2: "7 days" });
    const report = analyseTemplate(ast([faq, { ...faq, id: `${faq.id}-2` }]));
    expect(report.duplicateJsonLdTypes).toContain("FAQPage");
  });

  it("detects skipped heading levels", () => {
    expect(hasSkippedLevel([1, 2, 3])).toBe(false);
    expect(hasSkippedLevel([1, 3])).toBe(true);
  });
});

describe("scoring", () => {
  const base = {
    ast: ast([withProps("hero", { title: "Spring drop", image: "https://cdn/x.jpg", image_alt: "Model" })]),
    template: "index" as const,
    storeName: "Framique",
  };

  it("is deterministic and bounded", () => {
    const a = scoreBuilderSeo({ ...base, seo: EMPTY_PAGE_SEO });
    const b = scoreBuilderSeo({ ...base, seo: EMPTY_PAGE_SEO });
    expect(a.score).toBe(b.score);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });

  it("rewards a filled-in record over an empty one", () => {
    const empty = scoreBuilderSeo({ ...base, seo: EMPTY_PAGE_SEO });
    const filled = scoreBuilderSeo({
      ...base,
      seo: parsePageSeo({
        title: "Spring drop — Framique",
        description: "Shop the spring drop: light cottons, easy layers and free delivery over BDT 2,000.",
        canonical: "https://framique.com/",
        ogImage: "https://framique.com/og.jpg",
        focusKeyword: "spring drop",
      }),
    });
    expect(filled.score).toBeGreaterThan(empty.score);
  });

  it("fails the blocker check when the template has errors", () => {
    const report = scoreBuilderSeo({
      ...base,
      seo: EMPTY_PAGE_SEO,
      issues: [{ level: "error", message: "Empty container", sectionId: "a" }],
    });
    expect(report.checks.find((c) => c.id === "content.lints")?.status).toBe("fail");
  });

  it("warns about thin copy", () => {
    const report = scoreBuilderSeo({ ...base, seo: EMPTY_PAGE_SEO });
    expect(report.content.words).toBeLessThan(MIN_WORDS);
    expect(report.checks.find((c) => c.id === "content.words")?.status).not.toBe("pass");
  });
});

describe("head fragments", () => {
  it("drops the canonical and adds robots when noindex is set", () => {
    const head = pageSeoHead(parsePageSeo({ canonical: "https://x.com/a", noindex: true }), {
      title: "T",
      description: "D",
    });
    expect(head.links).toHaveLength(0);
    expect(head.meta).toEqual(expect.arrayContaining([{ name: "robots", content: "noindex, nofollow" }]));
  });

  it("emits hreflang alternates alongside an indexable canonical", () => {
    const head = pageSeoHead(parsePageSeo({ canonical: "https://x.com/a" }), { title: "T", description: "D" });
    expect(head.links.length).toBeGreaterThan(1);
    expect(head.links[0]).toEqual({ rel: "canonical", href: "https://x.com/a" });
  });

  it("gates the sitemap on published and indexable", () => {
    expect(isSitemapEligible({ published: true, seo: EMPTY_PAGE_SEO })).toBe(true);
    expect(isSitemapEligible({ published: true, seo: { ...EMPTY_PAGE_SEO, noindex: true } })).toBe(false);
    expect(isSitemapEligible({ published: false, seo: EMPTY_PAGE_SEO })).toBe(false);
  });
});

describe("lint fixes", () => {
  it("classifies known messages and still surfaces unknown ones", () => {
    expect(classifyIssue({ level: "warn", message: "Image is missing alt text", sectionId: null }).code).toBe(
      "media.alt_missing",
    );
    expect(classifyIssue({ level: "warn", message: "Something new we never saw", sectionId: null }).code).toBe(
      "template.other",
    );
  });

  it("sorts errors before warnings", () => {
    const sorted = classifyIssues([
      { level: "warn", message: "Image is missing alt text", sectionId: null },
      { level: "error", message: "Duplicate node id abc", sectionId: null },
    ]);
    expect(sorted[0]!.level).toBe("error");
  });

  it("never invents copy for a missing translation", () => {
    const plan = planFix(classifyIssue({ level: "warn", message: "Title has no বাংলা translation", sectionId: null }), null);
    expect(plan?.kind).toBe("focus");
  });

  it("resets raw colours to the catalog default", () => {
    const node = withProps("hero", { bg: "#ff0055" });
    const plan = planFix(
      classifyIssue({ level: "warn", message: "Raw colour value on bg", sectionId: node.id }),
      node,
    );
    expect(plan?.kind).toBe("props");
    if (plan?.kind === "props") expect(plan.props["bg"]).not.toBe("#ff0055");
  });

  it("does not offer a no-op props fix", () => {
    const node = withProps("hero", {});
    const plan = planFix(
      classifyIssue({ level: "warn", message: "Raw colour value on bg", sectionId: node.id }),
      node,
    );
    expect(isActionable(plan)).toBe(false);
  });

  it("derives a stable countdown end from the injected clock", () => {
    const at = defaultCountdownEnd(Date.UTC(2026, 0, 1));
    expect(at).toBe("2026-01-08T00:00:00.000Z");
  });
});
