/**
 * Phase 3 — builder SEO model, page analysis and scoring.
 *
 * The builder edits *templates*, but crawlers see *pages*, so this module is
 * the bridge: a per-template SEO override record, a content analysis of the AST
 * that actually renders, and one deterministic score built from both.
 *
 * Why it lives here (pure, isomorphic):
 *  - the drawer scores while the merchant types,
 *  - `builder-seo.server` scores the identical payload before storing it,
 *  - the publish gate reads the same checks.
 * A stored score can therefore never disagree with what the merchant was shown.
 *
 * No network, no clock, no randomness. Reuses `analyseSeo` for the meta/social/
 * indexing checks so the builder and the SEO desk cannot drift apart, and adds
 * the checks only the AST can answer: `h1` count, heading order, alt coverage,
 * internal links, word count, JSON-LD singletons and hreflang readiness.
 */
import {
  SLOTS,
  biTextKeysOf,
  catalogEntry,
  flattenAst,
  imageKeysOf,
  type AstIssue,
  type Section,
  type TemplateKey,
  type ThemeAst,
} from "./builder-ast";
import { altKey } from "./media";
import { analyseSeo, type SeoCheck, type SeoReport } from "./seo-analysis";
import { hreflangAlternates } from "./seo-technical";
import { JSONLD_SINGLETONS, sectionJsonLd } from "./structured-data";

export const SEO_TITLE_PX_MAX = 580;
export const SEO_DESC_PX_MAX = 990;
export const MIN_WORDS = 120;
export const MIN_INTERNAL_LINKS = 2;

/* ----------------------------------------------------------- the SEO record */

export type PageSeo = {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  focusKeyword: string;
  noindex: boolean;
};

export const EMPTY_PAGE_SEO: PageSeo = {
  title: "",
  description: "",
  canonical: "",
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
  focusKeyword: "",
  noindex: false,
};

const LIMITS = {
  title: 70,
  description: 320,
  canonical: 2048,
  ogTitle: 70,
  ogDescription: 320,
  ogImage: 2048,
  focusKeyword: 60,
} as const;

function str(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Collapse whitespace first: a title of 60 newlines is not a title.
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Untrusted-in, safe-out. Stored rows and client payloads go through the same
 * parse, so a hand-edited request body cannot put a 1MB string or an
 * `javascript:` URL into a `<link rel=canonical>`.
 */
export function parsePageSeo(input: unknown): PageSeo {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    title: str(raw["title"], LIMITS.title),
    description: str(raw["description"], LIMITS.description),
    canonical: safeUrl(str(raw["canonical"], LIMITS.canonical)),
    ogTitle: str(raw["ogTitle"], LIMITS.ogTitle),
    ogDescription: str(raw["ogDescription"], LIMITS.ogDescription),
    ogImage: safeUrl(str(raw["ogImage"], LIMITS.ogImage)),
    focusKeyword: str(raw["focusKeyword"], LIMITS.focusKeyword),
    noindex: raw["noindex"] === true || raw["noindex"] === "true",
  };
}

/** Only absolute http(s) URLs survive; anything else becomes empty. */
export function safeUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function isPageSeoEmpty(seo: PageSeo): boolean {
  return (
    !seo.title &&
    !seo.description &&
    !seo.canonical &&
    !seo.ogTitle &&
    !seo.ogDescription &&
    !seo.ogImage &&
    !seo.focusKeyword &&
    !seo.noindex
  );
}

/* --------------------------------------------------------- pixel-width SERP */

/**
 * Snippet width lives in `seo-pixels.ts` so the builder drawer, the SEO desk,
 * the analysis worker and the server all measure with one implementation.
 * Re-exported here to keep existing builder imports stable.
 */
export { pixelWidth } from "./seo-pixels";
import { pixelWidth } from "./seo-pixels";


export type SerpPreview = {
  title: string;
  description: string;
  titlePx: number;
  descriptionPx: number;
  titleTruncated: boolean;
  descriptionTruncated: boolean;
};

export function serpPreview(seo: PageSeo, fallback: { title: string; description: string }): SerpPreview {
  const title = seo.title || fallback.title;
  const description = seo.description || fallback.description;
  const titlePx = pixelWidth(title, 16);
  const descriptionPx = pixelWidth(description, 13);
  return {
    title,
    description,
    titlePx,
    descriptionPx,
    titleTruncated: titlePx > SEO_TITLE_PX_MAX,
    descriptionTruncated: descriptionPx > SEO_DESC_PX_MAX,
  };
}

/* ------------------------------------------------------- template analysis */

export type TemplateContent = {
  words: number;
  /** Widgets that claim the page `<h1>`. */
  h1Claims: number;
  /** Section heading levels in document order (1 = the claimed h1). */
  headingLevels: number[];
  images: { total: number; withAlt: number };
  internalLinks: number;
  externalLinks: number;
  jsonLdTypes: string[];
  duplicateJsonLdTypes: string[];
  /** Plain-text corpus, used for keyword coverage. */
  text: string;
};

const HREF_KEY = /href$/i;

function isInternal(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (/^https?:\/\//i.test(href)) return false;
  return href.startsWith("/");
}

/**
 * Everything a crawler can read from this template, derived from the AST rather
 * than from a rendered string: the editor has no DOM for an unpublished page,
 * and the server must reach the same numbers as the browser.
 */
export function analyseTemplate(ast: ThemeAst): TemplateContent {
  const sections = flattenAst(ast);
  const words: string[] = [];
  const headingLevels: number[] = [];
  let h1Claims = 0;
  let total = 0;
  let withAlt = 0;
  let internalLinks = 0;
  let externalLinks = 0;
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const section of sections) {
    if (section.invalid) continue;
    const entry = catalogEntry(section.type);
    if (!entry) continue;

    if (section.type === "heading") {
      headingLevels.push(String(section.props["level"] ?? "h2") === "h3" ? 3 : 2);
    } else if (entry.heading) {
      h1Claims += 1;
      headingLevels.push(1);
    }

    for (const key of imageKeysOf(section.type)) {
      const src = String(section.props[key] ?? "").trim();
      if (!src) continue;
      total += 1;
      const alt =
        String(section.props[altKey(key)] ?? "").trim() ||
        String(section.props["alt"] ?? "").trim() ||
        String(section.props["altText"] ?? "").trim();
      if (alt) withAlt += 1;
    }

    for (const [key, value] of Object.entries(section.props)) {
      if (typeof value !== "string") continue;
      if (HREF_KEY.test(key)) {
        if (isInternal(value)) internalLinks += 1;
        else if (/^https?:\/\//i.test(value)) externalLinks += 1;
        continue;
      }
      if (value.length > 2 && /[a-z\u0980-\u09FF]/i.test(value) && !/^https?:\/\//i.test(value)) {
        words.push(value);
      }
    }

    const node = sectionJsonLd(section, { storeName: "Store", url: null });
    const type = node ? String(node["@type"] ?? "") : "";
    if (type) {
      if (seen.has(type) && JSONLD_SINGLETONS.has(type)) duplicates.add(type);
      seen.add(type);
    }
  }

  const text = words.join(" ");
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    h1Claims,
    headingLevels,
    images: { total, withAlt },
    internalLinks,
    externalLinks,
    jsonLdTypes: [...seen],
    duplicateJsonLdTypes: [...duplicates],
    text,
  };
}

/** Bilingual coverage of the copy a crawler indexes, per locale. */
export function banglaCoverage(ast: ThemeAst): { keys: number; translated: number } {
  let keys = 0;
  let translated = 0;
  for (const slot of SLOTS) void slot;
  for (const section of flattenAst(ast)) {
    for (const key of biTextKeysOf(section.type)) {
      const en = String(section.props[key] ?? "").trim();
      if (!en) continue;
      keys += 1;
      if (String(section.props[`${key}_bn`] ?? "").trim()) translated += 1;
    }
  }
  return { keys, translated };
}

/* ------------------------------------------------------------------ scoring */

export type BuilderSeoInput = {
  seo: PageSeo;
  ast: ThemeAst;
  template: TemplateKey;
  /** `lintTemplate` output for the same template, folded into the score. */
  issues?: readonly AstIssue[];
  storeName: string;
  /** Absolute URL this template renders at, when known. */
  url?: string | null;
};

export type BuilderSeoReport = SeoReport & {
  content: TemplateContent;
  preview: SerpPreview;
  /** Checks the AST contributed, kept separate for the "Content" group in UI. */
  contentChecks: SeoCheck[];
};

function fallbackTitle(input: BuilderSeoInput): string {
  const label = TEMPLATE_FALLBACK[input.template] ?? "Page";
  return `${label} — ${input.storeName}`;
}

const TEMPLATE_FALLBACK: Partial<Record<TemplateKey, string>> = {
  index: "Home",
  product: "Product",
  collection: "Collection",
  cart: "Cart",
  checkout: "Checkout",
  page: "Page",
  blog: "Journal",
};

/**
 * One score, two halves: the shared meta/social/indexing checks and the
 * AST-derived content checks. Weights are explicit so the number is explainable
 * — a merchant can always see which check cost them the points.
 */
export function scoreBuilderSeo(input: BuilderSeoInput): BuilderSeoReport {
  const content = analyseTemplate(input.ast);
  const base = analyseSeo({
    metaTitle: input.seo.title,
    metaDescription: input.seo.description,
    canonical: input.seo.canonical,
    robotsIndex: !input.seo.noindex,
    robotsFollow: true,
    ogImageUrl: input.seo.ogImage,
    focusKeyword: input.seo.focusKeyword,
    faq: [],
    content: content.text,
    fallbackTitle: fallbackTitle(input),
    fallbackDescription: "",
  });

  const contentChecks: SeoCheck[] = [];
  const push = (
    id: string,
    label: string,
    status: SeoCheck["status"],
    hint: string,
    weight: number,
  ) => contentChecks.push({ id, group: "aeo", label, labelBn: label, status, hint, hintBn: hint, weight });

  push(
    "content.h1",
    "Single primary heading",
    content.h1Claims === 1 ? "pass" : content.h1Claims === 0 ? "warn" : "fail",
    content.h1Claims === 1
      ? "One widget claims the page heading."
      : content.h1Claims === 0
        ? "No widget claims the page heading — the route title is used instead."
        : `${content.h1Claims} widgets claim the page heading; only one may.`,
    12,
  );

  const skipped = hasSkippedLevel(content.headingLevels);
  push(
    "content.heading_order",
    "Heading order",
    skipped ? "fail" : "pass",
    skipped ? "A heading level is skipped — screen readers lose the outline." : "Heading levels step down one at a time.",
    8,
  );

  const alt = content.images.total === 0 ? 1 : content.images.withAlt / content.images.total;
  push(
    "content.alt",
    "Image alt coverage",
    alt >= 1 ? "pass" : alt >= 0.6 ? "warn" : "fail",
    content.images.total === 0
      ? "No images on this template."
      : `${content.images.withAlt}/${content.images.total} images have alt text.`,
    10,
  );

  push(
    "content.words",
    "Indexable copy",
    content.words >= MIN_WORDS ? "pass" : content.words >= MIN_WORDS / 2 ? "warn" : "fail",
    `${content.words} words of crawlable copy (target ${MIN_WORDS}+).`,
    8,
  );

  push(
    "content.links",
    "Internal links",
    content.internalLinks >= MIN_INTERNAL_LINKS ? "pass" : "warn",
    `${content.internalLinks} internal links (target ${MIN_INTERNAL_LINKS}+).`,
    6,
  );

  push(
    "content.jsonld",
    "Structured data",
    content.duplicateJsonLdTypes.length
      ? "fail"
      : content.jsonLdTypes.length
        ? "pass"
        : "warn",
    content.duplicateJsonLdTypes.length
      ? `Duplicate ${content.duplicateJsonLdTypes.join(", ")} graph — only one per page is valid.`
      : content.jsonLdTypes.length
        ? `Emits ${content.jsonLdTypes.join(", ")}.`
        : "No widget on this template emits structured data.",
    8,
  );

  const alternates = hreflangAlternates(input.seo.canonical || input.url || "");
  const bn = banglaCoverage(input.ast);
  const ratio = bn.keys === 0 ? 1 : bn.translated / bn.keys;
  push(
    "content.hreflang",
    "Locale alternates",
    alternates.length >= 3 && ratio >= 0.9 ? "pass" : alternates.length ? "warn" : "fail",
    alternates.length === 0
      ? "Set a canonical URL so en/bn alternates can be emitted."
      : `${bn.translated}/${bn.keys} strings translated to বাংলা.`,
    8,
  );

  const blocking = (input.issues ?? []).filter((issue) => issue.level === "error").length;
  push(
    "content.lints",
    "Publish blockers",
    blocking === 0 ? "pass" : "fail",
    blocking === 0 ? "No blocking template errors." : `${blocking} blocking template errors must be fixed first.`,
    12,
  );

  const checks = [...base.checks, ...contentChecks];
  const earned = checks.reduce(
    (sum, check) =>
      sum + check.weight * (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0),
    0,
  );
  const denominator =
    checks.reduce((sum, check) => sum + (check.status === "skip" ? 0 : check.weight), 0) || 1;
  const counts = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    skip: checks.filter((c) => c.status === "skip").length,
  };

  return {
    score: Math.round((earned / denominator) * 100),
    checks,
    counts,
    // The AST already answered the content questions; reuse the shared facts
    // block so consumers read one shape whatever produced the report.
    facts: base.facts,
    content,
    contentChecks,
    preview: serpPreview(input.seo, { title: fallbackTitle(input), description: "" }),
  };
}

export function hasSkippedLevel(levels: readonly number[]): boolean {
  let previous = 0;
  for (const level of levels) {
    if (previous && level > previous + 1) return true;
    previous = level;
  }
  return false;
}

/**
 * Whether a template may be advertised in `sitemap.xml`. Published *and* not
 * `noindex` — the two are independent, and the sitemap must agree with the
 * robots directive the page itself emits.
 */
export function isSitemapEligible(input: { published: boolean; seo: PageSeo }): boolean {
  return input.published && !input.seo.noindex;
}

/** Head fragments for a builder-authored page. Absolute URLs only. */
export function pageSeoHead(seo: PageSeo, fallback: { title: string; description: string }) {
  const title = seo.title || fallback.title;
  const description = seo.description || fallback.description;
  const meta: Record<string, string>[] = [{ title }];
  if (description) meta.push({ name: "description", content: description });
  meta.push({ property: "og:title", content: seo.ogTitle || title });
  if (seo.ogDescription || description) {
    meta.push({ property: "og:description", content: seo.ogDescription || description });
  }
  meta.push({ property: "og:type", content: "website" });
  meta.push({ name: "twitter:card", content: seo.ogImage ? "summary_large_image" : "summary" });
  if (seo.ogImage) {
    meta.push({ property: "og:image", content: seo.ogImage });
    meta.push({ name: "twitter:image", content: seo.ogImage });
  }
  // noindex wins over everything else, including a canonical.
  if (seo.noindex) meta.push({ name: "robots", content: "noindex, nofollow" });
  const links: Record<string, string>[] = [];
  if (seo.canonical && !seo.noindex) {
    links.push({ rel: "canonical", href: seo.canonical });
    for (const alternate of hreflangAlternates(seo.canonical)) links.push(alternate);
  }
  return { meta, links };
}
