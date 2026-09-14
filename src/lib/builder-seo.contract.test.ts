/**
 * Phase 3 exit gate.
 *
 * Asserts the contract a *published* builder page must satisfy: a unique
 * title/description, exactly one `<h1>`, a self-referencing canonical, one
 * JSON-LD graph per type and full image alt coverage — plus the two places that
 * contract can silently break in production: the entity/template precedence
 * merge, and the sitemap agreeing with the page's own robots directive.
 */
import { describe, expect, it } from "vitest";
import { lintTemplate, newSection, parseAst, type ThemeAst } from "./builder-ast";
import {
  EMPTY_PAGE_SEO,
  analyseTemplate,
  isSitemapEligible,
  pageSeoHead,
  parsePageSeo,
  scoreBuilderSeo,
  type PageSeo,
} from "./builder-seo";
import {
  mergeSeoOverride,
  templateIndexable,
  templateSeoToOverride,
} from "./template-seo";

const CANONICAL = "https://shop.test/store/acme";

const seoOf = (patch: Partial<PageSeo> = {}): PageSeo => ({ ...EMPTY_PAGE_SEO, ...patch });

/** A well-formed home template: one h1 claimant, an image with alt, copy. */
function goodAst(): ThemeAst {
  const hero = newSection("hero");
  const rich = newSection("rich_text");
  return parseAst({
    main: [
      {
        ...hero,
        id: "hero",
        props: {
          ...hero.props,
          image: "https://cdn.test/hero.jpg",
          image_alt: "Handloom sarees on a rack",
          ctaHref: "/store/acme/search",
        },
      },
      {
        ...rich,
        id: "copy",
        props: {
          ...rich.props,
          body: Array.from({ length: 140 }, (_, i) => `word${i}`).join(" "),
          href: "/store/acme/pages/about",
        },
      },
    ],
  });
}

describe("Phase 3 exit gate — published page contract", () => {
  const ast = goodAst();

  it("has exactly one widget claiming the page heading and no skipped level", () => {
    const content = analyseTemplate(ast);
    expect(content.h1Claims).toBe(1);
    const report = scoreBuilderSeo({ seo: seoOf(), ast, template: "index", storeName: "Acme" });
    expect(report.checks.find((c) => c.id === "content.h1")?.status).toBe("pass");
    expect(report.checks.find((c) => c.id === "content.heading_order")?.status).toBe("pass");
  });

  it("counts every image and requires alt text on all of them", () => {
    const content = analyseTemplate(ast);
    expect(content.images.total).toBeGreaterThan(0);
    expect(content.images.withAlt).toBe(content.images.total);

    const bare = newSection("hero");
    const missing = parseAst({
      main: [{ ...bare, id: "h", props: { ...bare.props, image: "https://cdn.test/x.jpg" } }],
    });
    const report = scoreBuilderSeo({ seo: seoOf(), ast: missing, template: "index", storeName: "Acme" });
    expect(report.checks.find((c) => c.id === "content.alt")?.status).toBe("fail");
  });

  it("emits at most one graph per structured-data type", () => {
    const content = analyseTemplate(ast);
    expect(content.duplicateJsonLdTypes).toEqual([]);
    expect(new Set(content.jsonLdTypes).size).toBe(content.jsonLdTypes.length);
  });

  it("self-references its canonical and drops it entirely when hidden", () => {
    const visible = pageSeoHead(seoOf({ title: "Acme", canonical: CANONICAL }), {
      title: "Acme",
      description: "",
    });
    expect(visible.links.find((l) => l["rel"] === "canonical")?.["href"]).toBe(CANONICAL);
    expect(visible.links.filter((l) => l["rel"] === "alternate").length).toBeGreaterThan(0);

    const hidden = pageSeoHead(seoOf({ title: "Acme", canonical: CANONICAL, noindex: true }), {
      title: "Acme",
      description: "",
    });
    expect(hidden.links.find((l) => l["rel"] === "canonical")).toBeUndefined();
    expect(hidden.meta.find((m) => m["name"] === "robots")?.["content"]).toBe("noindex, nofollow");
  });

  it("keeps titles and descriptions distinct per template", () => {
    const home = scoreBuilderSeo({ seo: seoOf(), ast, template: "index", storeName: "Acme" });
    const product = scoreBuilderSeo({ seo: seoOf(), ast, template: "product", storeName: "Acme" });
    expect(home.preview.title).not.toBe(product.preview.title);
  });

  it("refuses unsafe canonical and social URLs at the parse boundary", () => {
    const parsed = parsePageSeo({
      canonical: "javascript:alert(1)",
      ogImage: "/relative.png",
      title: "  spaced\n\ntitle  ",
    });
    expect(parsed.canonical).toBe("");
    expect(parsed.ogImage).toBe("");
    expect(parsed.title).toBe("spaced title");
  });

  it("blocks the score on template errors so publish cannot pass a broken page", () => {
    const report = scoreBuilderSeo({
      seo: seoOf({ title: "Acme", description: "d", canonical: CANONICAL }),
      ast,
      template: "index",
      storeName: "Acme",
      issues: [{ level: "error", sectionId: "hero", message: "boom" }],
    });
    expect(report.checks.find((c) => c.id === "content.lints")?.status).toBe("fail");
  });

  it("agrees with lintTemplate about a second h1 claimant", () => {
    const twin = parseAst({
      main: [
        { ...newSection("hero"), id: "a" },
        { ...newSection("category_header"), id: "b" },
      ],
    });
    expect(analyseTemplate(twin).h1Claims).toBe(2);
    expect(lintTemplate(twin, "index").some((i) => /h1/.test(i.message))).toBe(true);
  });
});

describe("Phase 3 exit gate — entity over template precedence", () => {
  it("prefers the entity value and falls through on blanks", () => {
    const merged = mergeSeoOverride(
      { metaTitle: "Rice 5kg — Acme", metaDescription: "" },
      templateSeoToOverride(seoOf({ title: "Products — Acme", description: "Every product we stock" })),
    );
    expect(merged?.metaTitle).toBe("Rice 5kg — Acme");
    expect(merged?.metaDescription).toBe("Every product we stock");
  });

  it("lets either layer hide the page, and neither layer un-hide it", () => {
    const templateHides = mergeSeoOverride({ robotsIndex: true }, templateSeoToOverride(seoOf({ noindex: true })));
    expect(templateHides?.robotsIndex).toBe(false);
    const entityHides = mergeSeoOverride({ robotsIndex: false }, templateSeoToOverride(seoOf({ title: "x" })));
    expect(entityHides?.robotsIndex).toBe(false);
  });

  it("returns null when neither layer says anything", () => {
    expect(mergeSeoOverride(null, templateSeoToOverride(seoOf()))).toBeNull();
  });

  it("never lets a non-absolute canonical through the merge", () => {
    const merged = mergeSeoOverride({ canonical: "/store/acme" }, null);
    expect(merged?.canonical).toBeUndefined();
  });
});

describe("Phase 3 exit gate — sitemap agrees with robots", () => {
  it("drops a hidden template from the sitemap and keeps a visible one", () => {
    expect(templateIndexable(seoOf({ noindex: true }))).toBe(false);
    expect(templateIndexable(seoOf())).toBe(true);
    expect(isSitemapEligible({ published: true, seo: seoOf() })).toBe(true);
    expect(isSitemapEligible({ published: true, seo: seoOf({ noindex: true }) })).toBe(false);
    expect(isSitemapEligible({ published: false, seo: seoOf() })).toBe(false);
  });
});
