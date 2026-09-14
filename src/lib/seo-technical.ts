/**
 * Phase 7.1 — technical SEO contract.
 *
 * Pure helpers shared by every storefront route so crawl behaviour is decided
 * in one audited place: locale alternates, faceted-URL index policy, crawlable
 * pagination and the per-store robots policy. No React, no network, no theme.
 */
import {
  FACET_KEYS,
  INDEXABLE_FACETS,
  facetHref,
  facetValue,
  isIndexableFacetState,
  pageCount,
  withPage,
  type SearchParams,
} from "./facet-url";

/** URL locale marker. Cookie-free, so a crawler and a shopper see one URL. */
export const LOCALE_PARAM = "lang";
export const LOCALES = ["en", "bn"] as const;
export type SeoLocale = (typeof LOCALES)[number];

/** `hreflang` value per locale; Bangla is region-qualified for Bangladesh. */
export const HREFLANG: Record<SeoLocale, string> = { en: "en", bn: "bn-BD" };

export function isSeoLocale(value: unknown): value is SeoLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The same URL, pinned to a locale. Returns null when the base is not absolute. */
export function localeUrl(canonical: string | null | undefined, locale: SeoLocale): string | null {
  if (!canonical || !/^https?:\/\//.test(canonical)) return null;
  try {
    const url = new URL(canonical);
    url.searchParams.set(LOCALE_PARAM, locale);
    return url.toString();
  } catch {
    return null;
  }
}

/** Reads the locale a URL (or query string) pins itself to. */
export function localeFromSearch(search: string | URLSearchParams | null | undefined): SeoLocale | null {
  if (!search) return null;
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const value = params.get(LOCALE_PARAM);
  return isSeoLocale(value) ? value : null;
}

/**
 * Real per-locale alternates plus `x-default` pointing at the unpinned URL.
 * Emitting three identical hrefs (the old behaviour) tells Google nothing;
 * these are distinct, self-referencing and reciprocal.
 */
export function hreflangAlternates(canonical: string | null | undefined): Record<string, string>[] {
  if (!canonical || !/^https?:\/\//.test(canonical)) return [];
  const links: Record<string, string>[] = [];
  for (const locale of LOCALES) {
    const href = localeUrl(canonical, locale);
    if (href) links.push({ rel: "alternate", hrefLang: HREFLANG[locale], href });
  }
  links.push({ rel: "alternate", hrefLang: "x-default", href: canonical });
  return links;
}

export type IndexPolicy = {
  /** Robots directive for this URL. */
  robots: string;
  /** Path this URL should canonicalise to (clean collection when filtered). */
  canonicalPath: string;
  /** Why the decision was made — surfaced in the merchant SEO panel. */
  reason: "indexable" | "query" | "facet-combo" | "facet-not-allowlisted" | "paged";
};

/**
 * Canonical discipline for faceted URLs. One allowlisted facet on page 1 stays
 * indexable and self-canonical; everything else is `noindex,follow` with a
 * canonical back to the clean collection so link equity is not shredded across
 * permutations. Free-text queries are never indexable.
 */
export function facetIndexPolicy(basePath: string, params: SearchParams): IndexPolicy {
  const clean = basePath;
  if (params.q.trim()) return { robots: "noindex,follow", canonicalPath: clean, reason: "query" };
  const active = FACET_KEYS.filter((key) => facetValue(params, key) !== null);
  if (params.page > 1) {
    // Paged URLs stay crawlable and self-canonical (rel prev/next does the
    // sequencing); canonicalising page 2 to page 1 would hide deep products.
    return {
      robots: "index,follow",
      canonicalPath: facetHref(clean, params),
      reason: "paged",
    };
  }
  if (isIndexableFacetState(params)) {
    return {
      robots: "index,follow",
      canonicalPath: active.length ? facetHref(clean, params) : clean,
      reason: "indexable",
    };
  }
  return {
    robots: "noindex,follow",
    canonicalPath: clean,
    reason: active.length > 1 ? "facet-combo" : "facet-not-allowlisted",
  };
}

/** Facets a merchant is allowed to expose as their own indexable URL. */
export const INDEXABLE_FACET_KEYS = INDEXABLE_FACETS;

export type PaginationLinks = {
  prev: string | null;
  next: string | null;
  last: number;
};

/**
 * Crawlable pagination. Load-more is progressive enhancement only — these
 * hrefs must exist as real `<a>` elements so a crawler (and a shopper without
 * JS) can walk the whole result set.
 */
export function paginationLinks(basePath: string, params: SearchParams, total: number): PaginationLinks {
  const last = pageCount(total);
  const prev =
    params.page > 1 ? facetHref(basePath, withPage(params, params.page - 1, total)) : null;
  const next =
    params.page < last ? facetHref(basePath, withPage(params, params.page + 1, total)) : null;
  return { prev, next, last };
}

/** `rel=prev` / `rel=next` head links for a paged listing. */
export function paginationHeadLinks(
  origin: string | null | undefined,
  basePath: string,
  params: SearchParams,
  total: number,
): Record<string, string>[] {
  const { prev, next } = paginationLinks(basePath, params, total);
  const abs = (path: string | null) =>
    path && origin && /^https?:\/\//.test(origin) ? `${origin.replace(/\/+$/, "")}${path}` : null;
  const links: Record<string, string>[] = [];
  const prevHref = abs(prev);
  const nextHref = abs(next);
  if (prevHref) links.push({ rel: "prev", href: prevHref });
  if (nextHref) links.push({ rel: "next", href: nextHref });
  return links;
}

/**
 * AI answer-surface crawlers. Merchants opt in per store; the platform never
 * decides on their behalf, and an unindexed store blocks them outright.
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
] as const;

export type RobotsPolicy = {
  /** Store is indexable at all (SEO panel toggle). */
  indexable: boolean;
  /** Merchant opted this store into AI answer crawlers. */
  aiCrawlers: boolean;
  /** Absolute origin used for the Sitemap directive. */
  origin: string;
  /** Store slug — every path is scoped to the tenant. */
  slug: string;
};

/** Per-store robots.txt. Never leaks another tenant's paths. */
export function renderStoreRobots(policy: RobotsPolicy): string {
  const base = `/store/${policy.slug}`;
  const lines: string[] = ["User-agent: *"];
  if (!policy.indexable) {
    lines.push("Disallow: /");
  } else {
    lines.push(`Allow: ${base}`);
    lines.push(`Disallow: ${base}/checkout`);
    lines.push(`Disallow: ${base}/account`);
    lines.push(`Disallow: ${base}/order`);
    lines.push(`Disallow: ${base}/track`);
    // Facet permutations outside the allowlist are noindex anyway; keeping the
    // crawler off them saves budget instead of spending it to learn that.
    lines.push(`Disallow: ${base}/search?*`);
  }
  lines.push("");
  for (const agent of AI_CRAWLERS) {
    lines.push(`User-agent: ${agent}`);
    lines.push(policy.indexable && policy.aiCrawlers ? `Allow: ${base}` : "Disallow: /");
    lines.push("");
  }
  lines.push(`Sitemap: ${policy.origin.replace(/\/+$/, "")}${base}/sitemap.xml`);
  // Phase 7.4: answer engines get a catalogue map, but only where the merchant
  // let them in — the same opt-in the AI-crawler blocks above use.
  if (policy.indexable && policy.aiCrawlers) {
    lines.push(`# llms.txt: ${policy.origin.replace(/\/+$/, "")}${base}/llms.txt`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Heading order for a rendered template. Exactly one `h1`, and no level may be
 * skipped on the way down — screen readers and answer engines both read the
 * outline, not the font size.
 */
export function headingIssues(levels: number[]): string[] {
  const issues: string[] = [];
  const h1s = levels.filter((l) => l === 1).length;
  if (h1s === 0) issues.push("Template has no <h1> — one widget must claim the primary heading.");
  if (h1s > 1) issues.push(`Template has ${h1s} <h1> headings — exactly one is allowed.`);
  let previous = 0;
  for (const level of levels) {
    if (previous && level > previous + 1) {
      issues.push(`Heading level jumps from h${previous} to h${level}.`);
      break;
    }
    previous = level;
  }
  return issues;
}
