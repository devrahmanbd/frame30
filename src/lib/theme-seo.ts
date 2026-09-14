/**
 * Theme SEO + delivery-performance layer (BUILD 2.3, official themes).
 *
 * Official themes are not just layout: each one declares how its pages should
 * describe themselves to crawlers and how the browser should prioritise the
 * first paint. This module is pure and isomorphic — it takes loader data and
 * returns TanStack `head()` output (meta, links, scripts) so every storefront
 * route emits canonical URLs, Open Graph / Twitter cards, hreflang alternates,
 * schema.org JSON-LD and resource hints from one audited implementation.
 *
 * Rules enforced here:
 *  - titles clamp at 60 chars, descriptions at 160
 *  - canonical + og:url are absolute or omitted (never relative placeholders)
 *  - money in JSON-LD is derived from integer minor units, never floats
 *  - noindex wins over every other directive
 */
/**
 * Theme key → category. Duplicated deliberately as a tiny literal so shopper
 * pages never pull the full preset ASTs into the client bundle;
 * `theme-seo.test.ts` asserts it stays in sync with `THEME_PRESETS`.
 */
export const THEME_SEO_CATEGORY: Record<string, string> = {
  classic: "general",
  modern: "general",
  landing: "landing",
  "heavy-shop": "general",
  supershop: "grocery",
  b2b: "wholesale",
  "clothing-modern": "fashion",
  "clothing-classic": "fashion",
  sensory: "accessible",
  festivity: "seasonal",
  atelier: "fashion",
  bazaar: "marketplace",
  circuit: "electronics",
  rupaboti: "beauty",
};

import { hreflangAlternates } from "./seo-technical";
import {
  ITEM_CONDITIONS,
  aggregateRating,
  returnPolicyNode,
  reviewNodes,
  shippingDetailsNode,
  type ItemCondition,
  type ReturnPolicyInput,
  type ReviewInput,
  type ShippingInput,
} from "./structured-data";

export const TITLE_MAX = 60;
export const DESC_MAX = 160;

export type MetaTag = Record<string, string>;
export type LinkTag = Record<string, string>;
export type ScriptTag = { type: string; children: string };
export type HeadOutput = { meta: MetaTag[]; links: LinkTag[]; scripts: ScriptTag[] };

export type ThemeSeoProfile = {
  /** `{page}` and `{store}` placeholders. */
  titleTemplate: string;
  homeTitleTemplate: string;
  socialCard: "summary" | "summary_large_image";
  jsonld: {
    organization: boolean;
    website: boolean;
    product: boolean;
    breadcrumb: boolean;
    faq: boolean;
    itemList: boolean;
  };
  /** Preload the hero/first product image so LCP is not discovered late. */
  preloadHero: boolean;
};

export const DEFAULT_SEO_PROFILE: ThemeSeoProfile = {
  titleTemplate: "{page} — {store}",
  homeTitleTemplate: "{store} — Online store",
  socialCard: "summary_large_image",
  jsonld: { organization: true, website: true, product: true, breadcrumb: true, faq: true, itemList: true },
  preloadHero: true,
};

const CATEGORY_PROFILE: Record<string, Partial<ThemeSeoProfile>> = {
  landing: { homeTitleTemplate: "{store} — {page}", jsonld: { ...DEFAULT_SEO_PROFILE.jsonld, itemList: false } },
  wholesale: { socialCard: "summary", jsonld: { ...DEFAULT_SEO_PROFILE.jsonld, faq: true, itemList: false } },
  fashion: { homeTitleTemplate: "{store} — Shop the collection" },
  grocery: { homeTitleTemplate: "{store} — Daily grocery delivery" },
  marketplace: { homeTitleTemplate: "{store} — Everything you need, delivered", jsonld: { ...DEFAULT_SEO_PROFILE.jsonld, itemList: true } },
  electronics: { homeTitleTemplate: "{store} — Official-warranty electronics", jsonld: { ...DEFAULT_SEO_PROFILE.jsonld, faq: true } },
  beauty: { homeTitleTemplate: "{store} — Beauty matched to your skin" },
};

/** SEO behaviour for an installed official theme (falls back to the default). */
export function seoProfileFor(themeKey?: string | null): ThemeSeoProfile {
  if (!themeKey) return DEFAULT_SEO_PROFILE;
  const category = THEME_SEO_CATEGORY[themeKey];
  if (!category) return DEFAULT_SEO_PROFILE;
  return { ...DEFAULT_SEO_PROFILE, ...(CATEGORY_PROFILE[category] ?? {}) };
}

/* ---------------- Phase 5 — seo_templates shipped with each preset --------- */

export type PresetSeoTemplate = {
  entityType: "product" | "collection" | "page" | "article";
  titleTemplate: string;
  descriptionTemplate: string;
};

const GENERIC_SEO_TEMPLATES: PresetSeoTemplate[] = [
  {
    entityType: "product",
    titleTemplate: "{{title}} — {{store}}",
    descriptionTemplate: "Buy {{title}} from {{store}} at {{price}}. Cash on delivery, bKash and Nagad.",
  },
  {
    entityType: "collection",
    titleTemplate: "{{title}} — {{store}}",
    descriptionTemplate: "Shop {{title}} at {{store}} with nationwide delivery across Bangladesh.",
  },
  {
    entityType: "page",
    titleTemplate: "{{title}} — {{store}}",
    descriptionTemplate: "{{title}} at {{store}}.",
  },
  {
    entityType: "article",
    titleTemplate: "{{title}} — {{store}}",
    descriptionTemplate: "{{title}} — a guide from {{store}}.",
  },
];

/** Category-specific overrides; anything unspecified keeps the generic row. */
const CATEGORY_SEO_TEMPLATES: Record<string, Partial<Record<PresetSeoTemplate["entityType"], Partial<PresetSeoTemplate>>>> = {
  fashion: {
    product: {
      titleTemplate: "{{title}} — {{brand}} | {{store}}",
      descriptionTemplate: "{{title}} by {{brand}} at {{price}}. Size guide, fabric details and easy returns from {{store}}.",
    },
    collection: { descriptionTemplate: "Browse {{title}} at {{store}} — new arrivals, size guides and easy returns." },
  },
  electronics: {
    product: {
      titleTemplate: "{{title}} price in Bangladesh — {{store}}",
      descriptionTemplate: "{{title}} at {{price}} with official warranty, EMI and full specifications from {{store}}.",
    },
    collection: { descriptionTemplate: "Compare {{title}} at {{store}} — specs, warranty and EMI options." },
  },
  beauty: {
    product: {
      titleTemplate: "{{title}} — {{store}}",
      descriptionTemplate: "{{title}} at {{price}}. Shades, ingredients and how to use, from {{store}}.",
    },
  },
  marketplace: {
    product: {
      titleTemplate: "{{title}} — {{category}} | {{store}}",
      descriptionTemplate: "{{title}} at {{price}} from {{store}}. Delivery in {{city}} and nationwide.",
    },
  },
  grocery: {
    product: { descriptionTemplate: "{{title}} at {{price}} — same-day grocery delivery in {{city}} from {{store}}." },
  },
  wholesale: {
    product: { descriptionTemplate: "{{title}} at wholesale pricing from {{store}}. Bulk rates and trade terms." },
  },
};

/**
 * The starter `seo_templates` rows an official theme ships with. Merchants may
 * edit every row afterwards in the SEO panel — this is a default, not a lock.
 */
export function presetSeoTemplates(themeKey?: string | null): PresetSeoTemplate[] {
  const category = themeKey ? THEME_SEO_CATEGORY[themeKey] : undefined;
  const overrides = (category && CATEGORY_SEO_TEMPLATES[category]) || {};
  return GENERIC_SEO_TEMPLATES.map((row) => ({ ...row, ...(overrides[row.entityType] ?? {}) }));
}

export function clamp(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function applyTemplate(template: string, page: string, store: string): string {
  return template.replace("{page}", page).replace("{store}", store);
}

/** Absolute URL, or null when no trustworthy origin is known. */
export function absUrl(origin: string | null | undefined, path: string): string | null {
  if (!origin || !/^https?:\/\//.test(origin)) return null;
  return `${origin.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Minor units → schema.org decimal string. Integer in, string out, no floats. */
export function priceString(minor: number, currency = "BDT"): string {
  const digits = currency === "BDT" || currency === "USD" ? 2 : 0;
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor)).toString().padStart(digits + 1, "0");
  if (digits === 0) return `${sign}${abs}`;
  return `${sign}${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
}

function jsonLd(node: unknown): ScriptTag {
  return {
    type: "application/ld+json",
    // Only server-derived data reaches here; `<` is escaped so the payload can
    // never close the script tag early.
    children: JSON.stringify(node).replace(/</g, "\\u003c"),
  };
}

function origins(urls: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const url of urls) {
    if (!url || !/^https?:\/\//.test(url)) continue;
    try {
      set.add(new URL(url).origin);
    } catch {
      /* ignore malformed media URLs */
    }
  }
  return [...set];
}

/**
 * Resource hints: preconnect to every distinct media origin, and preload the
 * one image the theme designates as the hero so it is not discovered after the
 * CSS is parsed.
 */
export function performanceLinks(
  profile: ThemeSeoProfile,
  opts: { heroImage?: string | null; imageUrls?: (string | null | undefined)[] } = {},
): LinkTag[] {
  const links: LinkTag[] = [];
  for (const origin of origins([opts.heroImage, ...(opts.imageUrls ?? [])])) {
    links.push({ rel: "preconnect", href: origin, crossOrigin: "anonymous" });
    links.push({ rel: "dns-prefetch", href: origin });
  }
  if (profile.preloadHero && opts.heroImage && /^https?:\/\//.test(opts.heroImage)) {
    links.push({ rel: "preload", as: "image", href: opts.heroImage, fetchpriority: "high" });
  }
  return links;
}

/**
 * Merchant-authored SEO panel override (BUILD 2.6). Empty strings mean "keep
 * the theme default" — the override never blanks a field the theme computed.
 */
export type SeoOverride = {
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonical?: string | null;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
  ogImageUrl?: string | null;
  faq?: { q: string; a: string }[];
};

type BaseInput = {
  origin?: string | null;
  path: string;
  storeName: string;
  themeKey?: string | null;
  noindex?: boolean;
  robots?: string | null;
  image?: string | null;
  locale?: "bn" | "en";
  seo?: SeoOverride | null;
};

/** Robots directive from the panel toggles, or null when nothing is set. */
function overrideRobots(seo?: SeoOverride | null): string | null {
  if (!seo || (seo.robotsIndex === undefined && seo.robotsFollow === undefined)) return null;
  const index = seo.robotsIndex === false ? "noindex" : "index";
  const follow = seo.robotsFollow === false ? "nofollow" : "follow";
  return `${index},${follow}`;
}

function baseHead(
  input: BaseInput,
  title: string,
  description: string,
  ogType: string,
  profile: ThemeSeoProfile,
): HeadOutput {
  const seo = input.seo ?? null;
  const seoCanonical = seo?.canonical?.trim();
  const canonical =
    seoCanonical && /^https?:\/\//.test(seoCanonical) ? seoCanonical : absUrl(input.origin, input.path);
  const t = clamp(seo?.metaTitle?.trim() || title, TITLE_MAX);
  const d = clamp(seo?.metaDescription?.trim() || description, DESC_MAX);
  const panelRobots = overrideRobots(seo);
  const robots = input.noindex
    ? "noindex,nofollow"
    : (panelRobots ?? input.robots ?? "index,follow");
  const noindex = input.noindex || robots.startsWith("noindex");
  const candidate = seo?.ogImageUrl?.trim() || input.image;
  const image = candidate && /^https?:\/\//.test(candidate) ? candidate : null;

  const meta: MetaTag[] = [
    { title: t },
    { name: "description", content: d },
    { name: "robots", content: robots },
    { property: "og:site_name", content: input.storeName },
    { property: "og:title", content: t },
    { property: "og:description", content: d },
    { property: "og:type", content: ogType },
    { property: "og:locale", content: input.locale === "en" ? "en_US" : "bn_BD" },
    { name: "twitter:card", content: image ? profile.socialCard : "summary" },
    { name: "twitter:title", content: t },
    { name: "twitter:description", content: d },
  ];
  if (canonical) meta.push({ property: "og:url", content: canonical });
  if (image) {
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
  }

  const links: LinkTag[] = [];
  if (canonical && !noindex) {
    links.push({ rel: "canonical", href: canonical });
    // Phase 7.1: real per-locale alternates (`?lang=`) plus x-default. Three
    // identical hrefs told crawlers nothing about the বাংলা page.
    links.push(...hreflangAlternates(canonical));
  }

  const scripts: ScriptTag[] = [];
  // AEO: merchant-authored answers become FAQPage JSON-LD on any surface.
  const faq = (seo?.faq ?? []).filter((f) => f.q?.trim() && f.a?.trim()).slice(0, 12);
  if (profile.jsonld.faq && faq.length > 0) {
    scripts.push(
      jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q.trim(),
          acceptedAnswer: { "@type": "Answer", text: f.a.trim() },
        })),
      }),
    );
  }
  return { meta, links, scripts };
}


function breadcrumbLd(origin: string | null | undefined, trail: { name: string; path: string }[]) {
  const items = trail
    .map((step, i) => {
      const url = absUrl(origin, step.path);
      return url ? { "@type": "ListItem", position: i + 1, name: step.name, item: url } : null;
    })
    .filter(Boolean);
  if (items.length < 2) return null;
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items };
}

export type StoreHeadInput = BaseInput & {
  tagline?: string | null;
  products?: { title: string; slug: string; image_url?: string | null }[];
  searchPath?: string;
};

/** Storefront home: Organization + WebSite(SearchAction) + ItemList. */
export function buildStoreHead(input: StoreHeadInput): HeadOutput {
  const profile = seoProfileFor(input.themeKey);
  const title = applyTemplate(profile.homeTitleTemplate, "Online store", input.storeName);
  const description =
    input.tagline?.trim() ||
    `Shop ${input.storeName} with cash on delivery, bKash, Nagad and nationwide courier across Bangladesh.`;
  const hero = input.image ?? input.products?.find((p) => p.image_url)?.image_url ?? null;
  const head = baseHead({ ...input, image: hero }, title, description, "website", profile);
  const site = absUrl(input.origin, input.path);

  if (profile.jsonld.organization) {
    head.scripts.push(
      jsonLd({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: input.storeName,
        ...(site ? { url: site } : {}),
        ...(hero ? { logo: hero } : {}),
        areaServed: "BD",
      }),
    );
  }
  if (profile.jsonld.website && site) {
    const search = absUrl(input.origin, input.searchPath ?? `${input.path.replace(/\/$/, "")}/search`);
    head.scripts.push(
      jsonLd({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: input.storeName,
        url: site,
        ...(search
          ? {
              potentialAction: {
                "@type": "SearchAction",
                target: `${search}?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            }
          : {}),
      }),
    );
  }
  if (profile.jsonld.itemList && input.products?.length) {
    const items = input.products
      .slice(0, 20)
      .map((p, i) => {
        const url = absUrl(input.origin, `${input.path.replace(/\/$/, "")}/p/${p.slug}`);
        return url ? { "@type": "ListItem", position: i + 1, name: p.title, url } : null;
      })
      .filter(Boolean);
    if (items.length) {
      head.scripts.push({
        ...jsonLd({ "@context": "https://schema.org", "@type": "ItemList", itemListElement: items }),
      });
    }
  }
  head.links.push(...performanceLinks(profile, { heroImage: hero, imageUrls: input.products?.map((p) => p.image_url) }));
  return head;
}

export type ProductHeadInput = BaseInput & {
  product: {
    title: string;
    slug: string;
    description?: string | null;
    image_url?: string | null;
    sku?: string | null;
  };
  currency: string;
  priceMinor: number;
  compareAtMinor?: number | null;
  inStock: boolean;
  storePath: string;
  /** Phase 7.2 — Offer enrichment. All optional; omitted when unknown. */
  condition?: ItemCondition;
  reviews?: ReviewInput[];
  returnPolicy?: ReturnPolicyInput;
  shipping?: Omit<ShippingInput, "currency">;
};

/** Product detail: Product + Offer + BreadcrumbList. */
export function buildProductHead(input: ProductHeadInput): HeadOutput {
  const profile = seoProfileFor(input.themeKey);
  const title = applyTemplate(profile.titleTemplate, input.product.title, input.storeName);
  const description =
    input.product.description?.trim() ||
    `Buy ${input.product.title} from ${input.storeName} with cash on delivery or mobile payment.`;
  const image = input.image ?? input.product.image_url ?? null;
  const head = baseHead({ ...input, image }, title, description, "product", profile);
  const url = absUrl(input.origin, input.path);

  if (profile.jsonld.product) {
    const reviews = input.reviews ?? [];
    const rating = aggregateRating(reviews);
    const returns = input.returnPolicy ? returnPolicyNode(input.returnPolicy) : null;
    const shipping = input.shipping
      ? shippingDetailsNode({ ...input.shipping, currency: input.currency }, priceString)
      : null;
    head.scripts.push(
      jsonLd({
        "@context": "https://schema.org",
        "@type": "Product",
        name: input.product.title,
        description: clamp(description, 300),
        ...(image ? { image: [image] } : {}),
        ...(input.product.sku ? { sku: input.product.sku } : {}),
        brand: { "@type": "Brand", name: input.storeName },
        ...(rating ? { aggregateRating: rating } : {}),
        ...(reviews.length ? { review: reviewNodes(reviews) } : {}),
        offers: {
          "@type": "Offer",
          price: priceString(input.priceMinor, input.currency),
          priceCurrency: input.currency,
          availability: input.inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          itemCondition: ITEM_CONDITIONS[input.condition ?? "new"],
          ...(url ? { url } : {}),
          ...(returns ? { hasMerchantReturnPolicy: returns } : {}),
          ...(shipping ? { shippingDetails: shipping } : {}),
        },
      }),
    );
  }
  if (profile.jsonld.breadcrumb) {
    const crumbs = breadcrumbLd(input.origin, [
      { name: input.storeName, path: input.storePath },
      { name: input.product.title, path: input.path },
    ]);
    if (crumbs) head.scripts.push(jsonLd(crumbs));
  }
  head.links.push(...performanceLinks(profile, { heroImage: image }));
  return head;
}

export type PageHeadInput = BaseInput & {
  page: {
    title: string;
    excerpt?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    cover_image_url?: string | null;
    updated_at?: string | null;
  };
  storePath: string;
  faq?: { question: string; answer: string }[];
};

/** Content page: Article + BreadcrumbList (+ FAQPage when the page has one). */
export function buildPageHead(input: PageHeadInput): HeadOutput {
  const profile = seoProfileFor(input.themeKey);
  const title =
    input.page.meta_title?.trim() ||
    applyTemplate(profile.titleTemplate, input.page.title, input.storeName);
  const description =
    input.page.meta_description?.trim() || input.page.excerpt?.trim() || `${input.page.title} — ${input.storeName}`;
  const image = input.image ?? input.page.cover_image_url ?? null;
  const head = baseHead({ ...input, image }, title, description, "article", profile);
  const url = absUrl(input.origin, input.path);

  head.scripts.push(
    jsonLd({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: clamp(input.page.title, 110),
      ...(url ? { mainEntityOfPage: url } : {}),
      ...(image ? { image: [image] } : {}),
      ...(input.page.updated_at ? { dateModified: input.page.updated_at } : {}),
      publisher: { "@type": "Organization", name: input.storeName },
    }),
  );
  if (profile.jsonld.breadcrumb) {
    const crumbs = breadcrumbLd(input.origin, [
      { name: input.storeName, path: input.storePath },
      { name: input.page.title, path: input.path },
    ]);
    if (crumbs) head.scripts.push(jsonLd(crumbs));
  }
  if (profile.jsonld.faq && input.faq?.length) {
    head.scripts.push(
      jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: input.faq.slice(0, 10).map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }),
    );
  }
  head.links.push(...performanceLinks(profile, { heroImage: image }));
  return head;
}

export type SearchHeadInput = BaseInput & {
  query?: string | null;
  total?: number;
  storePath: string;
};

/**
 * Search / collection listing. Query result pages are `noindex,follow` so
 * crawl budget stays on the catalogue, while the empty listing stays indexable.
 */
export function buildSearchHead(input: SearchHeadInput): HeadOutput {
  const profile = seoProfileFor(input.themeKey);
  const q = input.query?.trim();
  const page = q ? `Search: ${q}` : "All products";
  const title = applyTemplate(profile.titleTemplate, page, input.storeName);
  const description = q
    ? `${input.total ?? 0} results for “${q}” at ${input.storeName}.`
    : `Browse every product available at ${input.storeName}, with cash on delivery and mobile payments.`;
  const head = baseHead(
    { ...input, robots: q ? "noindex,follow" : (input.robots ?? "index,follow") },
    title,
    description,
    "website",
    profile,
  );
  if (profile.jsonld.breadcrumb) {
    const crumbs = breadcrumbLd(input.origin, [
      { name: input.storeName, path: input.storePath },
      { name: page, path: input.path },
    ]);
    if (crumbs) head.scripts.push(jsonLd(crumbs));
  }
  return head;
}
