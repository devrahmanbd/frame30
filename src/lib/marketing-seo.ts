/**
 * Phase 10.5 — the marketing site's SEO / AEO contract.
 *
 * Every public marketing URL we own (`/`, `/features`, `/pricing`, `/contact`,
 * `/blog`, `/legal`, …) gets its head tags and its structured data from this
 * one module. The reasons are not cosmetic:
 *
 *  • **One registry, no drift.** A page's title, description, breadcrumb
 *    trail, sitemap priority and internal links are declared once. The route
 *    renders them, the sitemap emits them, `llms.txt` narrates them and the
 *    contract test asserts them. A page cannot be in the sitemap but absent
 *    from the nav graph, or carry a canonical that points somewhere the
 *    sitemap never lists.
 *
 *  • **Validation is part of the build, not a review checklist.** Titles are
 *    capped at 60 characters and descriptions at 160 — the widths Google
 *    actually renders — and `validateRoute`/`validateJsonLd` return machine
 *    codes so `marketing-seo.contract.test.ts` can fail the run rather than a
 *    human noticing a truncated SERP snippet three weeks later.
 *
 *  • **Bilingual by construction.** Every route carries `en` and `bn` copy and
 *    every canonical emits `hreflang` alternates plus `x-default`, reusing the
 *    same `?lang=` grammar the storefront already uses (`seo-technical.ts`).
 *    A locale that has no real Bangla copy is a validation failure, not a
 *    silent English fallback wearing a `bn` tag.
 *
 *  • **Structured data from typed builders.** Organization, WebSite +
 *    SearchAction, SoftwareApplication, FAQPage, BreadcrumbList, Article,
 *    TechArticle and LocalBusiness are functions here, never hand-written JSON
 *    in a route file. Hand-written JSON-LD rots the moment the NAP changes.
 *
 * Pure module: no React, no network, no Supabase, no `process`. It is imported
 * by route `head()` (client and server), by the sitemap handler, by the
 * `llms.txt` handler and by tests, so it must stay free of runtime deps.
 */
import { HREFLANG, LOCALES, type SeoLocale } from "./seo-technical";
import { ORG_NAP, napPostalAddress, organizationSchema, LEGAL_DOCS } from "./legal";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const SITE_NAME = "Framique";

/** SERP-rendered widths. Beyond these the tail is truncated with an ellipsis. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 154;
/** Below these a snippet is thin enough that Google rewrites it for us. */
export const TITLE_MIN = 15;
export const DESCRIPTION_MIN = 60;

/** Bangla codepoint range — used to prove a `bn` string is actually Bangla. */
const BANGLA = /[\u0980-\u09FF]/;

export type Bilingual = { en: string; bn: string };

export type SchemaKind =
  | "Organization"
  | "WebSite"
  | "SoftwareApplication"
  | "FAQPage"
  | "BreadcrumbList"
  | "Article"
  | "TechArticle"
  | "LocalBusiness"
  | "CollectionPage"
  | "ContactPage";

export type MarketingRouteId =
  | "home"
  | "features"
  | "pricing"
  | "contact"
  | "blog"
  | "legal"
  | "status"
  | "docs"
  | "faq"
  // Phase 10.2 — the six product/company deep-dive pages.
  | "builder"
  | "payments"
  | "fulfilment"
  | "customers"
  | "security"
  | "about";

export type MarketingRoute = {
  id: MarketingRouteId;
  /** Path exactly as the router serves it. No trailing slash except `/`. */
  path: string;
  title: Bilingual;
  description: Bilingual;
  /** Short label used in breadcrumbs and the `llms.txt` map. */
  label: Bilingual;
  parent: MarketingRouteId | null;
  /** Routes this page links to in its rendered body or shared chrome. */
  linksTo: readonly MarketingRouteId[];
  /** In the XML sitemap? Non-indexable surfaces stay out of it. */
  indexable: boolean;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: string;
  /** Structured data this route is required to emit. */
  schema: readonly SchemaKind[];
  /** Last meaningful content change, ISO date. Sitemap `lastmod`. */
  lastmod: string;
};

/**
 * The registry. Adding a marketing page means adding a row here first: the
 * contract test fails a route file that renders a public marketing URL with no
 * registry entry, and the orphan check fails an entry nothing links to.
 */
export const MARKETING_ROUTES: readonly MarketingRoute[] = [
  {
    id: "home",
    path: "/",
    title: {
      en: "Framique — commerce CMS for Bangladeshi stores",
      bn: "Framique — বাংলাদেশি স্টোরের কমার্স সিএমএস",
    },
    description: {
      en: "Run a bilingual storefront, catalog, orders, POS and payments in one place. bKash, Nagad, Rocket, bank transfer and cash on delivery, priced in BDT.",
      bn: "একই জায়গায় দ্বিভাষিক স্টোরফ্রন্ট, ক্যাটালগ, অর্ডার, পিওএস ও পেমেন্ট চালান। বিকাশ, নগদ, রকেট, ব্যাংক ট্রান্সফার ও ক্যাশ অন ডেলিভারি — দাম টাকায়।",
    },
    label: { en: "Home", bn: "হোম" },
    parent: null,
    linksTo: [
      "features",
      "pricing",
      "builder",
      "payments",
      "fulfilment",
      "customers",
      "security",
      "about",
      "blog",
      "docs",
      "contact",
      "legal",
      "faq",
    ],
    indexable: true,
    changefreq: "weekly",
    priority: "1.0",
    schema: ["Organization", "WebSite", "SoftwareApplication", "FAQPage"],
    lastmod: "2026-08-14",
  },
  {
    id: "features",
    path: "/features",
    title: {
      en: "Features — Framique commerce CMS",
      bn: "ফিচার — Framique কমার্স সিএমএস",
    },
    description: {
      en: "Page builder, catalog and inventory, orders, POS, shipping, marketing and analytics — everything a Bangladeshi merchant needs in one hosted platform.",
      bn: "পেজ বিল্ডার, ক্যাটালগ ও ইনভেন্টরি, অর্ডার, পিওএস, শিপিং, মার্কেটিং আর অ্যানালিটিকস — একটি হোস্টেড প্ল্যাটফর্মেই সব।",
    },
    label: { en: "Features", bn: "ফিচার" },
    parent: "home",
    linksTo: ["pricing", "builder", "payments", "fulfilment", "security", "docs", "contact", "home"],
    indexable: true,
    changefreq: "monthly",
    priority: "0.8",
    schema: ["BreadcrumbList", "SoftwareApplication"],
    lastmod: "2026-08-14",
  },
  {
    id: "pricing",
    path: "/pricing",
    title: {
      en: "Pricing — Framique plans for merchants",
      bn: "প্রাইসিং — মার্চেন্টদের জন্য Framique প্ল্যান",
    },
    description: {
      en: "Compare Framique plans: product and staff limits, payment methods and trial length. Prices in BDT, VAT added at invoice time, no setup fee.",
      bn: "Framique প্ল্যান তুলনা করুন: পণ্য ও স্টাফ সীমা, পেমেন্ট মাধ্যম এবং ট্রায়ালের মেয়াদ। দাম টাকায়, ইনভয়েসে ভ্যাট যোগ হয়, সেটআপ ফি নেই।",
    },
    label: { en: "Pricing", bn: "প্রাইসিং" },
    parent: "home",
    linksTo: ["features", "customers", "payments", "contact", "legal", "home"],
    indexable: true,
    changefreq: "monthly",
    priority: "0.9",
    schema: ["BreadcrumbList", "SoftwareApplication"],
    lastmod: "2026-08-14",
  },
  {
    id: "contact",
    path: "/contact",
    title: {
      en: "Contact Framique — talk to the merchant team",
      bn: "যোগাযোগ — Framique মার্চেন্ট টিম",
    },
    description: {
      en: "Questions about plans, migrating from another platform, or enterprise terms? Call, email or visit the Framique merchant team in Dhaka.",
      bn: "প্ল্যান, অন্য প্ল্যাটফর্ম থেকে মাইগ্রেশন বা এন্টারপ্রাইজ শর্ত নিয়ে প্রশ্ন? ঢাকায় Framique মার্চেন্ট টিমে কল, ইমেইল বা সরাসরি আসুন।",
    },
    label: { en: "Contact", bn: "যোগাযোগ" },
    parent: "home",
    linksTo: ["pricing", "about", "security", "legal", "home"],
    indexable: true,
    changefreq: "yearly",
    priority: "0.6",
    schema: ["BreadcrumbList", "ContactPage", "LocalBusiness"],
    lastmod: "2026-08-14",
  },
  {
    id: "blog",
    path: "/blog",
    title: {
      en: "Blog — commerce guides for Bangladeshi sellers",
      bn: "ব্লগ — বাংলাদেশি বিক্রেতাদের কমার্স গাইড",
    },
    description: {
      en: "Guides on selling online in Bangladesh: cash on delivery, courier choice, mobile payments, product photography and store SEO — written for merchants.",
      bn: "বাংলাদেশে অনলাইনে বিক্রির গাইড: ক্যাশ অন ডেলিভারি, কুরিয়ার নির্বাচন, মোবাইল পেমেন্ট, পণ্যের ছবি এবং স্টোর এসইও — মার্চেন্টদের জন্য।",
    },
    label: { en: "Blog", bn: "ব্লগ" },
    parent: "home",
    linksTo: ["home", "features"],
    indexable: true,
    changefreq: "daily",
    priority: "0.8",
    schema: ["BreadcrumbList", "CollectionPage"],
    lastmod: "2026-08-14",
  },
  {
    id: "legal",
    path: "/legal",
    title: {
      en: "Legal — Framique terms, privacy and refunds",
      bn: "লিগ্যাল — Framique শর্ত, গোপনীয়তা ও রিফান্ড",
    },
    description: {
      en: "Every agreement that governs a Framique account: terms of service, privacy, refunds, cookies and acceptable use. Bilingual, versioned and dated.",
      bn: "Framique অ্যাকাউন্ট পরিচালনার সব চুক্তি: সেবার শর্ত, গোপনীয়তা, রিফান্ড, কুকি ও গ্রহণযোগ্য ব্যবহার। দ্বিভাষিক, সংস্করণ ও তারিখসহ।",
    },
    label: { en: "Legal", bn: "লিগ্যাল" },
    parent: "home",
    linksTo: ["contact", "home"],
    indexable: true,
    changefreq: "yearly",
    priority: "0.4",
    schema: ["BreadcrumbList", "Organization"],
    lastmod: "2026-08-14",
  },
  {
    id: "docs",
    path: "/docs",
    title: {
      en: "Developer docs — Framique API and webhooks",
      bn: "ডেভেলপার ডকস — Framique এপিআই ও ওয়েবহুক",
    },
    description: {
      en: "Build on Framique: REST API reference, API keys and OAuth, webhook signature verification, rate limits, error codes, theme and app authoring.",
      bn: "Framique-এ ডেভেলপ করুন: REST এপিআই রেফারেন্স, এপিআই কী ও ওএথ, ওয়েবহুক সিগনেচার যাচাই, রেট লিমিট, এরর কোড এবং থিম ও অ্যাপ অথরিং।",
    },
    label: { en: "Docs", bn: "ডকস" },
    parent: "home",
    // The docs are the deepest crawlable branch: each page links back to the
    // index, and the index links out to the commercial pages so link equity
    // does not dead-end in the reference.
    linksTo: ["home", "features", "pricing", "contact"],
    indexable: true,
    changefreq: "weekly",
    priority: "0.7",
    schema: ["BreadcrumbList", "CollectionPage", "TechArticle"],
    lastmod: "2026-02-01",
  },
  {
    id: "status",
    path: "/status",
    title: {
      en: "Platform status — Framique uptime and incidents",
      bn: "প্ল্যাটফর্ম স্ট্যাটাস — Framique আপটাইম ও ইনসিডেন্ট",
    },
    description: {
      en: "Live status of storefronts, checkout, payments and the merchant admin, with the current incident log. Updated automatically from platform monitors.",
      bn: "স্টোরফ্রন্ট, চেকআউট, পেমেন্ট ও মার্চেন্ট অ্যাডমিনের লাইভ অবস্থা এবং চলমান ইনসিডেন্ট লগ। প্ল্যাটফর্ম মনিটর থেকে স্বয়ংক্রিয়ভাবে হালনাগাদ।",
    },
    label: { en: "Status", bn: "স্ট্যাটাস" },
    parent: "home",
    linksTo: ["home", "contact"],
    // Real-time and per-request: indexing it would serve a stale incident
    // state from the SERP cache, which is worse than not ranking at all.
    indexable: false,
    changefreq: "always",
    priority: "0.1",
    schema: ["BreadcrumbList"],
    lastmod: "2026-08-14",
  },
  {
    id: "builder",
    path: "/builder",
    title: {
      en: "Storefront builder — sections, tokens, versions",
      bn: "স্টোরফ্রন্ট বিল্ডার — সেকশন, টোকেন ও ভার্সন",
    },
    description: {
      en: "Assemble a storefront from sections, edit design tokens for the store, publish and roll back in one click. Bangla and English, one catalogue.",
      bn: "সেকশন থেকে স্টোরফ্রন্ট সাজান, পুরো স্টোরের ডিজাইন টোকেন একবারেই বদলান, ভার্সন পাবলিশ করুন এবং এক ক্লিকে রোলব্যাক করুন। এক ক্যাটালগেই বাংলা ও ইংরেজি।",
    },
    label: { en: "Builder", bn: "বিল্ডার" },
    parent: "home",
    linksTo: ["features", "pricing", "customers", "docs", "contact", "home"],
    indexable: true,
    changefreq: "monthly",
    priority: "0.8",
    schema: ["BreadcrumbList", "SoftwareApplication", "FAQPage"],
    lastmod: "2026-08-16",
  },
  {
    id: "payments",
    path: "/payments",
    title: {
      en: "Payments — bKash, Nagad, card and COD, reconciled",
      bn: "পেমেন্ট — বিকাশ, নগদ, কার্ড ও ক্যাশ অন ডেলিভারি",
    },
    description: {
      en: "Accept bKash, Nagad, Rocket, card and cash on delivery in one checkout. Every taka matches an order, with refunds and payouts you can audit line by line.",
      bn: "একটি চেকআউটেই বিকাশ, নগদ, রকেট, উপায়, কার্ড ও ক্যাশ অন ডেলিভারি নিন। প্রতিটি টাকা অর্ডারের সাথে মেলে, রিফান্ড ও পেআউট লাইন ধরে যাচাই করা যায়।",
    },
    label: { en: "Payments", bn: "পেমেন্ট" },
    parent: "home",
    linksTo: ["pricing", "fulfilment", "security", "docs", "contact", "home"],
    indexable: true,
    changefreq: "monthly",
    priority: "0.8",
    schema: ["BreadcrumbList", "SoftwareApplication", "FAQPage"],
    lastmod: "2026-08-16",
  },
  {
    id: "fulfilment",
    path: "/fulfilment",
    title: {
      en: "Fulfilment — courier booking, labels and tracking",
      bn: "ফুলফিলমেন্ট — কুরিয়ার বুকিং, লেবেল ও ট্র্যাকিং",
    },
    description: {
      en: "Book SteadFast, Pathao, RedX and Paperfly pickups, print labels and track delivery from order drawer. Cash-on-delivery returns reconcile automatically.",
      bn: "অর্ডার ড্রয়ার থেকেই স্টেডফাস্ট, পাঠাও, রেডএক্স ও পেপারফ্লাই পিকআপ বুক করুন, লেবেল প্রিন্ট করুন ও ডেলিভারি ট্র্যাক করুন। সিওডি রিটার্ন নিজেই মিলে যায়।",
    },
    label: { en: "Fulfilment", bn: "ফুলফিলমেন্ট" },
    parent: "home",
    linksTo: ["payments", "features", "pricing", "contact", "home"],
    indexable: true,
    changefreq: "monthly",
    priority: "0.8",
    schema: ["BreadcrumbList", "SoftwareApplication", "FAQPage"],
    lastmod: "2026-08-16",
  },
  {
    id: "customers",
    path: "/customers",
    title: {
      en: "Customer stories — verified merchant numbers",
      bn: "মার্চেন্ট গল্প — যাচাই করা প্রকৃত সংখ্যা",
    },
    description: {
      en: "Bangladeshi merchants running catalogue, bKash and courier fulfilment on Framique — with figures read from live dashboards, never from a press release.",
      bn: "বাংলাদেশি মার্চেন্টরা Framique-এ ক্যাটালগ, বিকাশ, নগদ ও কুরিয়ার ফুলফিলমেন্ট চালাচ্ছেন — সংখ্যাগুলো লাইভ ড্যাশবোর্ড থেকে পড়া, প্রেস রিলিজ থেকে নয়।",
    },
    label: { en: "Customers", bn: "কাস্টমার" },
    parent: "home",
    linksTo: ["pricing", "builder", "features", "blog", "contact", "home"],
    indexable: true,
    changefreq: "weekly",
    priority: "0.7",
    schema: ["BreadcrumbList", "CollectionPage"],
    lastmod: "2026-08-16",
  },
  {
    id: "security",
    path: "/security",
    title: {
      en: "Security — RLS tenancy, scoped keys, incidents",
      bn: "সিকিউরিটি — টেন্যান্ট আলাদা, স্কোপড কী, ইনসিডেন্ট",
    },
    description: {
      en: "How Framique isolates merchant data with Postgres RLS, scopes API keys, keeps card data out of scope, and runs incident response. No overclaims.",
      bn: "Framique কীভাবে রো-লেভেল সিকিউরিটিতে মার্চেন্ট ডেটা আলাদা রাখে, এপিআই কী স্কোপ করে, কার্ড ডেটা বাইরে রাখে এবং ইনসিডেন্ট সামলায়। বাড়তি দাবি নেই।",
    },
    label: { en: "Security", bn: "সিকিউরিটি" },
    parent: "home",
    linksTo: ["docs", "legal", "status", "contact", "home"],
    indexable: true,
    changefreq: "monthly",
    priority: "0.7",
    schema: ["BreadcrumbList", "FAQPage"],
    lastmod: "2026-08-16",
  },
  {
    id: "about",
    path: "/about",
    title: {
      en: "About Framique — commerce built for Bangladesh",
      bn: "আমাদের কথা — বাংলাদেশের জন্য তৈরি কমার্স",
    },
    description: {
      en: "Why imported commerce software mis-serves a COD-heavy, Bangla-reading market — our principles, engineering choices, roadmap process and team in Dhaka.",
      bn: "আমদানি করা কমার্স সফটওয়্যার কেন সিওডি-নির্ভর, বাংলা-পাঠক, মোবাইল-মানি বাজারে খাপ খায় না — আমাদের নীতি, ইঞ্জিনিয়ারিং সিদ্ধান্ত, রোডম্যাপ ও দল।",
    },
    label: { en: "About", bn: "আমাদের কথা" },
    parent: "home",
    linksTo: ["customers", "security", "blog", "contact", "home"],
    indexable: true,
    changefreq: "monthly",
    priority: "0.6",
    schema: ["BreadcrumbList", "Organization"],
    lastmod: "2026-08-16",
  },
  {
    id: "faq",
    path: "/faq",
    title: {
      en: "FAQ — pricing, bKash settlement, COD and data",
      bn: "প্রশ্নোত্তর — দাম, বিকাশ সেটেলমেন্ট, সিওডি ও ডেটা",
    },
    description: {
      en: "Plain answers on plans, BDT pricing, bKash-Nagad settlement, cash-on-delivery risk, courier booking, data export, tenant isolation and support hours.",
      bn: "প্ল্যান ও টাকায় দাম, বিকাশ-নগদ সেটেলমেন্ট, ক্যাশ অন ডেলিভারির ঝুঁকি, কুরিয়ার বুকিং, ডেটা এক্সপোর্ট, ডেটা আলাদা রাখা ও সাপোর্ট সময় নিয়ে সোজা উত্তর।",
    },
    label: { en: "FAQ", bn: "প্রশ্নোত্তর" },
    parent: "home",
    linksTo: ["pricing", "security", "legal", "docs", "contact", "home"],
    indexable: true,
    changefreq: "monthly",
    priority: "0.6",
    schema: ["BreadcrumbList", "FAQPage"],
    lastmod: "2026-08-16",
  },
] as const;

const BY_ID = new Map<MarketingRouteId, MarketingRoute>(MARKETING_ROUTES.map((r) => [r.id, r]));
const BY_PATH = new Map<string, MarketingRoute>(MARKETING_ROUTES.map((r) => [r.path, r]));

export function marketingRoute(id: MarketingRouteId): MarketingRoute {
  const route = BY_ID.get(id);
  // Unreachable through the typed API; a throw here means the registry and the
  // union drifted, which is a build-time bug worth surfacing loudly.
  if (!route) throw new Error(`marketing-seo: unknown route id "${id}"`);
  return route;
}

export function marketingRouteByPath(path: string): MarketingRoute | null {
  const clean = path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  return BY_PATH.get(clean) ?? null;
}

/* -------------------------------------------------------------------------- */
/* URL helpers                                                                */
/* -------------------------------------------------------------------------- */

export function isAbsoluteUrl(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/[^\s/]+/.test(value);
}

/** Origin without a trailing slash, or null when we cannot trust it. */
export function normaliseOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const trimmed = origin.trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Absolute URL for a site-relative path.
 *
 * Returns null rather than guessing when no origin is known: a canonical or
 * `og:image` with a relative href is worse than an absent one, because a
 * crawler resolves it against whatever host served the page — including a
 * preview host we do not want indexed.
 */
export function absoluteUrl(origin: string | null | undefined, path: string): string | null {
  const base = normaliseOrigin(origin);
  if (!base) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Origin resolution for `head()`, which runs on the server during SSR and in
 * the browser during client-side navigation. The loader supplies the
 * request-derived origin; the browser can always answer for itself.
 */
export function resolveOrigin(loaderOrigin: string | null | undefined): string | null {
  const fromLoader = normaliseOrigin(loaderOrigin);
  if (fromLoader) return fromLoader;
  if (typeof window !== "undefined" && window.location?.origin) {
    return normaliseOrigin(window.location.origin);
  }
  return null;
}

/** The same URL pinned to a locale, matching the storefront `?lang=` grammar. */
export function localePinned(url: string, locale: SeoLocale): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("lang", locale);
    return parsed.toString();
  } catch {
    return url;
  }
}

/* -------------------------------------------------------------------------- */
/* Head builder                                                               */
/* -------------------------------------------------------------------------- */

export type HeadTag = Record<string, string>;

export type MarketingHead = {
  meta: HeadTag[];
  links: HeadTag[];
  scripts: { type: string; children: string }[];
};

export type BuildHeadInput = {
  route: MarketingRouteId;
  origin: string | null | undefined;
  /** Primary locale of the rendered document. Defaults to English. */
  lang?: SeoLocale;
  /** Overrides for dynamic leaves (paged blog, a single legal doc). */
  title?: string;
  description?: string;
  /** Path override for dynamic children of a registered section. */
  path?: string;
  /** Absolute https URL only. A relative value is dropped, never emitted. */
  ogImage?: string | null;
  /** Robots directive override, e.g. `noindex,follow` on an unknown slug. */
  robots?: string;
  /** Extra JSON-LD nodes merged into the page `@graph`. */
  extraSchema?: Record<string, unknown>[];
};

/** Clamp on a word boundary so a truncated title never ends mid-word. */
export function clampText(value: string, max: number): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—-]+$/, "");
}

/**
 * The whole head for one marketing route: title, description, canonical,
 * hreflang alternates, Open Graph, Twitter, robots, and the JSON-LD `@graph`.
 *
 * Everything absolute-URL-shaped is omitted when the origin is unknown rather
 * than emitted relative. Everything length-bounded is clamped, so a long
 * override cannot ship a truncated SERP snippet.
 */
export function buildMarketingHead(input: BuildHeadInput): MarketingHead {
  const route = marketingRoute(input.route);
  const lang: SeoLocale = input.lang ?? "en";
  const origin = normaliseOrigin(input.origin);
  const path = input.path ?? route.path;

  const title = clampText(input.title ?? route.title[lang] ?? route.title.en, TITLE_MAX);
  const description = clampText(
    input.description ?? route.description[lang] ?? route.description.en,
    DESCRIPTION_MAX,
  );
  const canonical = absoluteUrl(origin, path);
  const robots = input.robots ?? (route.indexable ? null : "noindex,follow");
  const ogImage = isAbsoluteUrl(input.ogImage) ? input.ogImage : null;
  const ogType = route.id === "blog" || route.id === "legal" ? "website" : "website";

  const meta: HeadTag[] = [
    { title },
    { name: "description", content: description },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: ogType },
    { property: "og:locale", content: lang === "bn" ? "bn_BD" : "en_US" },
    {
      property: "og:locale:alternate",
      content: lang === "bn" ? "en_US" : "bn_BD",
    },
    { name: "twitter:card", content: ogImage ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
  if (canonical) meta.push({ property: "og:url", content: canonical });
  // og:image belongs on leaf pages with a real, absolute asset. A placeholder
  // or a relative path is dropped: hosting generates a screenshot preview,
  // which beats a broken image card.
  if (ogImage) {
    meta.push({ property: "og:image", content: ogImage });
    meta.push({ name: "twitter:image", content: ogImage });
  }
  if (robots) meta.push({ name: "robots", content: robots });

  const links: HeadTag[] = [];
  if (canonical) {
    links.push({ rel: "canonical", href: canonical });
    // Reciprocal, self-referencing alternates. Emitting three identical hrefs
    // (a common mistake) tells a crawler nothing at all.
    for (const locale of LOCALES) {
      links.push({
        rel: "alternate",
        hrefLang: HREFLANG[locale],
        href: localePinned(canonical, locale),
      });
    }
    links.push({ rel: "alternate", hrefLang: "x-default", href: canonical });
  }

  const graph = buildGraph({ route: route.id, origin, path, extra: input.extraSchema ?? [] });
  const scripts = graph
    ? [{ type: "application/ld+json", children: JSON.stringify(graph) }]
    : [];

  return { meta, links, scripts };
}

/* -------------------------------------------------------------------------- */
/* JSON-LD builders                                                           */
/* -------------------------------------------------------------------------- */

type Node = Record<string, unknown>;

/** Organization — the NAP source of truth lives in `legal.ts`, not here. */
export function organizationNode(origin: string | null): Node {
  const node = { ...organizationSchema(origin) } as Node;
  delete node["@context"];
  node["@id"] = origin ? `${origin}/#organization` : "#organization";
  return node;
}

/** WebSite + SearchAction. The target must be a real, working search URL. */
export function websiteNode(origin: string | null): Node {
  const node: Node = {
    "@type": "WebSite",
    "@id": origin ? `${origin}/#website` : "#website",
    name: SITE_NAME,
    inLanguage: ["en", "bn"],
    ...(origin ? { url: `${origin}/` } : {}),
    ...(origin ? { publisher: { "@id": `${origin}/#organization` } } : {}),
  };
  if (origin) {
    // `/blog?q=` is the only site-wide search surface we actually serve;
    // pointing SearchAction at a 404 is a structured-data lie.
    node["potentialAction"] = {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${origin}/blog?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    };
  }
  return node;
}

export type PlanOffer = {
  name: string;
  /** Major-unit price as a decimal string, e.g. "1490". */
  price: string;
  currency?: string;
  period?: "MONTH" | "YEAR";
};

/** SoftwareApplication — the product itself, with plan offers when known. */
export function softwareApplicationNode(origin: string | null, offers: PlanOffer[] = []): Node {
  const node: Node = {
    "@type": "SoftwareApplication",
    "@id": origin ? `${origin}/#software` : "#software",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "E-commerce platform",
    operatingSystem: "Web browser",
    inLanguage: ["en", "bn"],
    ...(origin ? { url: `${origin}/` } : {}),
    ...(origin ? { publisher: { "@id": `${origin}/#organization` } } : {}),
  };
  const priced = offers.filter((o) => o.name && /^\d+(\.\d+)?$/.test(o.price));
  if (priced.length > 0) {
    node["offers"] = priced.map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      price: offer.price,
      priceCurrency: offer.currency ?? ORG_NAP.currency,
      ...(origin ? { url: `${origin}/pricing` } : {}),
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: offer.price,
        priceCurrency: offer.currency ?? ORG_NAP.currency,
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: offer.period === "YEAR" ? "ANN" : "MON",
      },
    }));
  }
  return node;
}

/** LocalBusiness — the physical office, printed identically in the footer. */
export function localBusinessNode(origin: string | null): Node {
  return {
    "@type": "LocalBusiness",
    "@id": origin ? `${origin}/#localbusiness` : "#localbusiness",
    name: ORG_NAP.legalName,
    alternateName: ORG_NAP.brand,
    ...(origin ? { url: `${origin}/contact` } : {}),
    email: ORG_NAP.email,
    telephone: ORG_NAP.phone,
    address: napPostalAddress(),
    areaServed: ORG_NAP.countryCode,
    currenciesAccepted: ORG_NAP.currency,
    openingHours: ORG_NAP.openingHours,
    priceRange: "৳৳",
  };
}

export type FaqItem = { question: string; answer: string };

/**
 * FAQPage. Only questions whose answer text is actually rendered in the HTML
 * may be passed in — an entry a crawler cannot find on the page is a
 * structured-data violation, so callers read from the same source the page
 * renders. Empty pairs are dropped rather than emitted blank.
 */
export function faqPageNode(items: FaqItem[], origin: string | null, path = "/"): Node | null {
  const clean = items
    .map((item) => ({ question: item.question?.trim() ?? "", answer: item.answer?.trim() ?? "" }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0);
  if (clean.length === 0) return null;
  return {
    "@type": "FAQPage",
    ...(origin ? { "@id": `${origin}${path}#faq` } : {}),
    mainEntity: clean.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** BreadcrumbList built by walking `parent` up to the home route. */
export function breadcrumbNode(
  routeId: MarketingRouteId,
  origin: string | null,
  lang: SeoLocale = "en",
  leaf?: { name: string; path: string },
): Node | null {
  if (!origin) return null;
  const trail: { name: string; path: string }[] = [];
  let cursor: MarketingRoute | null = marketingRoute(routeId);
  while (cursor) {
    trail.unshift({ name: cursor.label[lang] ?? cursor.label.en, path: cursor.path });
    cursor = cursor.parent ? marketingRoute(cursor.parent) : null;
  }
  if (leaf) trail.push({ name: leaf.name, path: leaf.path });
  if (trail.length < 2) return null;
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${origin}${crumb.path}`,
    })),
  };
}

export type ArticleNodeInput = {
  origin: string | null;
  path: string;
  headline: string;
  description?: string | null;
  image?: string | null;
  authorName?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  section?: string | null;
  inLanguage?: SeoLocale;
};

/** Article — blog posts. `TechArticle` is the same shape for developer docs. */
export function articleNode(input: ArticleNodeInput, type: "Article" | "TechArticle" = "Article"): Node | null {
  const headline = input.headline?.trim();
  if (!headline) return null;
  const url = absoluteUrl(input.origin, input.path);
  return {
    "@type": type,
    ...(url ? { "@id": `${url}#article`, url, mainEntityOfPage: url } : {}),
    // Google truncates headlines past 110 characters in rich results.
    headline: clampText(headline, 110),
    ...(input.description ? { description: clampText(input.description, DESCRIPTION_MAX) } : {}),
    ...(isAbsoluteUrl(input.image) ? { image: [input.image] } : {}),
    inLanguage: input.inLanguage ?? "en",
    ...(input.section ? { articleSection: input.section } : {}),
    ...(input.publishedAt ? { datePublished: input.publishedAt } : {}),
    ...(input.updatedAt ? { dateModified: input.updatedAt } : {}),
    author: input.authorName
      ? { "@type": "Person", name: input.authorName }
      : { "@type": "Organization", name: ORG_NAP.brand },
    publisher: input.origin
      ? { "@id": `${input.origin}/#organization` }
      : { "@type": "Organization", name: ORG_NAP.legalName },
  };
}

export function techArticleNode(input: ArticleNodeInput): Node | null {
  return articleNode(input, "TechArticle");
}

/** ContactPage — thin by design; the LocalBusiness node carries the detail. */
export function contactPageNode(origin: string | null): Node {
  return {
    "@type": "ContactPage",
    ...(origin ? { "@id": `${origin}/contact#page`, url: `${origin}/contact` } : {}),
    name: `Contact ${SITE_NAME}`,
    inLanguage: ["en", "bn"],
  };
}

export function collectionPageNode(origin: string | null, path: string, name: string): Node {
  const url = absoluteUrl(origin, path);
  return {
    "@type": "CollectionPage",
    ...(url ? { "@id": `${url}#collection`, url } : {}),
    name,
    inLanguage: ["en", "bn"],
    ...(origin ? { isPartOf: { "@id": `${origin}/#website` } } : {}),
  };
}

/**
 * Assemble the `@graph` a route declared in its registry entry. One script tag
 * per page with cross-referenced `@id`s beats five disconnected blocks: Google
 * resolves the references and we cannot emit a publisher that has no
 * Organization to point at.
 */
export function buildGraph(input: {
  route: MarketingRouteId;
  origin: string | null;
  path?: string;
  lang?: SeoLocale;
  faq?: FaqItem[];
  offers?: PlanOffer[];
  extra?: Node[];
}): Node | null {
  const route = marketingRoute(input.route);
  const origin = normaliseOrigin(input.origin);
  const lang = input.lang ?? "en";
  const path = input.path ?? route.path;
  const nodes: Node[] = [];

  for (const kind of route.schema) {
    switch (kind) {
      case "Organization":
        nodes.push(organizationNode(origin));
        break;
      case "WebSite":
        nodes.push(websiteNode(origin));
        break;
      case "SoftwareApplication":
        nodes.push(softwareApplicationNode(origin, input.offers ?? []));
        break;
      case "LocalBusiness":
        nodes.push(localBusinessNode(origin));
        break;
      case "ContactPage":
        nodes.push(contactPageNode(origin));
        break;
      case "CollectionPage":
        nodes.push(collectionPageNode(origin, path, route.title[lang] ?? route.title.en));
        break;
      case "FAQPage": {
        const faq = faqPageNode(input.faq ?? [], origin, path);
        if (faq) nodes.push(faq);
        break;
      }
      case "BreadcrumbList": {
        const crumbs = breadcrumbNode(route.id, origin, lang);
        if (crumbs) nodes.push(crumbs);
        break;
      }
      // Article/TechArticle are leaf-level and passed in via `extra`, because
      // only the route knows the post it is rendering.
      case "Article":
      case "TechArticle":
        break;
    }
  }
  for (const node of input.extra ?? []) if (node) nodes.push(node);
  if (nodes.length === 0) return null;
  return { "@context": "https://schema.org", "@graph": nodes };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type SeoIssue = {
  code: string;
  route: string;
  message: string;
  level: "error" | "warn";
};

const issue = (level: SeoIssue["level"], code: string, route: string, message: string): SeoIssue => ({
  level,
  code,
  route,
  message,
});

/** Registry-level checks for one route: lengths, locales, uniqueness inputs. */
export function validateRoute(route: MarketingRoute): SeoIssue[] {
  const out: SeoIssue[] = [];
  for (const locale of LOCALES) {
    const title = route.title[locale];
    const description = route.description[locale];
    if (!title) {
      out.push(issue("error", "title:missing", route.path, `no ${locale} title`));
    } else {
      if (title.length > TITLE_MAX)
        out.push(issue("error", "title:too_long", route.path, `${locale} title is ${title.length} chars (max ${TITLE_MAX})`));
      if (title.length < TITLE_MIN)
        out.push(issue("warn", "title:too_short", route.path, `${locale} title is ${title.length} chars (min ${TITLE_MIN})`));
    }
    if (!description) {
      out.push(issue("error", "description:missing", route.path, `no ${locale} description`));
    } else {
      if (description.length > DESCRIPTION_MAX)
        out.push(
          issue("error", "description:too_long", route.path, `${locale} description is ${description.length} chars (max ${DESCRIPTION_MAX})`),
        );
      if (description.length < DESCRIPTION_MIN)
        out.push(
          issue("warn", "description:too_short", route.path, `${locale} description is ${description.length} chars (min ${DESCRIPTION_MIN})`),
        );
    }
  }
  // A `bn` string with no Bangla codepoints is English wearing a bn tag; the
  // hreflang alternate then promises a translation that does not exist.
  if (!BANGLA.test(route.title.bn))
    out.push(issue("error", "locale:bn_not_bangla", route.path, "bn title contains no Bangla characters"));
  if (!BANGLA.test(route.description.bn))
    out.push(issue("error", "locale:bn_not_bangla", route.path, "bn description contains no Bangla characters"));
  if (route.title.en === route.title.bn)
    out.push(issue("error", "locale:duplicate", route.path, "en and bn titles are identical"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(route.lastmod))
    out.push(issue("error", "lastmod:invalid", route.path, `lastmod "${route.lastmod}" is not an ISO date`));
  const priority = Number(route.priority);
  if (!(priority >= 0 && priority <= 1))
    out.push(issue("error", "priority:invalid", route.path, `priority ${route.priority} is outside 0..1`));
  if (route.parent === route.id)
    out.push(issue("error", "breadcrumb:self_parent", route.path, "route is its own parent"));
  return out;
}

/** Whole-registry checks: duplicate titles, duplicate paths, orphan pages. */
export function validateRegistry(): SeoIssue[] {
  const out: SeoIssue[] = [];
  const seenPath = new Set<string>();
  const seenTitle = new Set<string>();
  for (const route of MARKETING_ROUTES) {
    out.push(...validateRoute(route));
    if (seenPath.has(route.path))
      out.push(issue("error", "path:duplicate", route.path, "two routes claim the same path"));
    seenPath.add(route.path);
    const titleKey = route.title.en.toLowerCase();
    if (seenTitle.has(titleKey))
      out.push(issue("error", "title:duplicate", route.path, "duplicate en title — cannibalisation risk"));
    seenTitle.add(titleKey);
    // Breadcrumb chains must terminate at home without cycling.
    const seen = new Set<MarketingRouteId>([route.id]);
    let cursor = route.parent;
    while (cursor) {
      if (seen.has(cursor)) {
        out.push(issue("error", "breadcrumb:cycle", route.path, `parent chain cycles at ${cursor}`));
        break;
      }
      seen.add(cursor);
      cursor = marketingRoute(cursor).parent;
    }
  }
  out.push(...orphanIssues());
  return out;
}

/**
 * Internal-link map. Mirrors the §6 content-health orphan finding: a page with
 * no inbound internal link is a page Google discovers late and ranks badly, no
 * matter how good the copy is. Home is the crawl entry point and is exempt.
 */
export function inboundLinkCount(id: MarketingRouteId): number {
  return MARKETING_ROUTES.filter((r) => r.id !== id && r.linksTo.includes(id)).length;
}

/** BFS from `/` over `linksTo`, returning click depth per route. */
export function crawlDepths(): Map<MarketingRouteId, number> {
  const depth = new Map<MarketingRouteId, number>([["home", 0]]);
  const queue: MarketingRouteId[] = ["home"];
  while (queue.length > 0) {
    const current = queue.shift() as MarketingRouteId;
    const currentDepth = depth.get(current) ?? 0;
    for (const next of marketingRoute(current).linksTo) {
      if (!depth.has(next)) {
        depth.set(next, currentDepth + 1);
        queue.push(next);
      }
    }
  }
  return depth;
}

/** Max clicks from `/` we accept for an indexable marketing page. */
export const MAX_CRAWL_DEPTH = 3;

export function orphanIssues(): SeoIssue[] {
  const out: SeoIssue[] = [];
  const depths = crawlDepths();
  for (const route of MARKETING_ROUTES) {
    if (route.id === "home") continue;
    if (!route.indexable) continue;
    if (inboundLinkCount(route.id) === 0)
      out.push(issue("error", "link:orphan", route.path, "no other marketing page links here"));
    const depth = depths.get(route.id);
    if (depth === undefined) {
      out.push(issue("error", "link:unreachable", route.path, "not reachable from / by internal links"));
    } else if (depth > MAX_CRAWL_DEPTH) {
      out.push(issue("warn", "link:deep", route.path, `${depth} clicks from / (max ${MAX_CRAWL_DEPTH})`));
    }
    for (const target of route.linksTo) {
      if (!BY_ID.has(target))
        out.push(issue("error", "link:broken", route.path, `links to unknown route "${target}"`));
    }
  }
  return out;
}

/** Structural validation of any JSON-LD node we are about to emit. */
export function validateJsonLd(node: unknown, label = "jsonld"): SeoIssue[] {
  const out: SeoIssue[] = [];
  if (!node || typeof node !== "object") {
    return [issue("error", "jsonld:not_object", label, "node is not an object")];
  }
  const record = node as Node;
  const graph = record["@graph"];
  if (graph !== undefined) {
    if (record["@context"] !== "https://schema.org")
      out.push(issue("error", "jsonld:context", label, "@graph is missing the schema.org @context"));
    if (!Array.isArray(graph) || graph.length === 0)
      out.push(issue("error", "jsonld:empty_graph", label, "@graph is empty"));
    else for (const child of graph) out.push(...validateJsonLdNode(child, label));
    return out;
  }
  return validateJsonLdNode(record, label, true);
}

function validateJsonLdNode(node: unknown, label: string, requireContext = false): SeoIssue[] {
  const out: SeoIssue[] = [];
  if (!node || typeof node !== "object") {
    return [issue("error", "jsonld:not_object", label, "graph member is not an object")];
  }
  const record = node as Node;
  if (requireContext && record["@context"] !== "https://schema.org")
    out.push(issue("error", "jsonld:context", label, "standalone node is missing @context"));
  if (typeof record["@type"] !== "string" && !Array.isArray(record["@type"]))
    out.push(issue("error", "jsonld:type", label, "node has no @type"));

  // Any URL-shaped value must be absolute; a relative one resolves against
  // whatever host served the page, including preview hosts.
  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > 8) return;
    if (typeof value === "string") {
      if (/^(url|@id|item|target|mainEntityOfPage|image)$/.test(path.split(".").pop() ?? "")) {
        if (value.startsWith("/"))
          out.push(issue("error", "jsonld:relative_url", label, `${path} is relative: ${value}`));
      }
      if (value.trim() === "")
        out.push(issue("warn", "jsonld:empty_string", label, `${path} is an empty string`));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, depth + 1);
    }
  };
  for (const [key, value] of Object.entries(record)) walk(value, key, 0);
  return out;
}

export function errorsOnly(issues: SeoIssue[]): SeoIssue[] {
  return issues.filter((i) => i.level === "error");
}

/* -------------------------------------------------------------------------- */
/* Sitemap + robots + llms.txt                                                */
/* -------------------------------------------------------------------------- */

export type SitemapEntry = {
  path: string;
  lastmod?: string;
  changefreq?: MarketingRoute["changefreq"];
  priority?: string;
  /** Locale alternates emitted as `xhtml:link` rows. */
  alternates?: { hrefLang: string; href: string }[];
};

/**
 * Marketing rows for `/sitemap.xml`. Only indexable routes, each with the
 * registry's `lastmod` and locale alternates so the bn/en pair is declared in
 * the sitemap as well as in the head.
 */
export function marketingSitemapEntries(origin: string | null): SitemapEntry[] {
  const base = normaliseOrigin(origin);
  return MARKETING_ROUTES.filter((route) => route.indexable).map((route) => {
    const canonical = base ? `${base}${route.path}` : null;
    return {
      path: route.path,
      lastmod: route.lastmod,
      changefreq: route.changefreq,
      priority: route.priority,
      alternates: canonical
        ? [
            ...LOCALES.map((locale) => ({
              hrefLang: HREFLANG[locale],
              href: localePinned(canonical, locale),
            })),
            { hrefLang: "x-default", href: canonical },
          ]
        : [],
    };
  });
}

/** Paths robots.txt must never disallow — they are our ranking surface. */
export function marketingAllowPaths(): string[] {
  return MARKETING_ROUTES.filter((r) => r.indexable && r.path !== "/").map((r) => r.path);
}

/**
 * Marketing-site `llms.txt`, mirroring the per-store one in `seo-answers.ts`.
 *
 * Answer engines that read this file do not have to crawl six pages to learn
 * what the product is, what it costs and who to contact. Everything in it is
 * text a human can also read on the site — this is a map, not a cloak.
 */
export function renderMarketingLlmsTxt(input: {
  origin: string;
  plans?: { name: string; price: string; currency?: string }[];
  articles?: { slug: string; title: string; updatedAt?: string | null }[];
  paymentMethods?: string[];
}): string {
  const origin = normaliseOrigin(input.origin) ?? input.origin;
  const lines: string[] = [];
  lines.push(`# ${SITE_NAME}`);
  lines.push("");
  lines.push(`> ${MARKETING_ROUTES[0]?.description.en ?? ""}`);
  lines.push("");
  lines.push(`- Operated by: ${ORG_NAP.legalName}, ${ORG_NAP.locality}, ${ORG_NAP.country}`);
  lines.push(`- Contact: ${ORG_NAP.email} · ${ORG_NAP.phone} · ${ORG_NAP.hours}`);
  lines.push(`- Languages: English, বাংলা (append \`?lang=bn\` to any URL)`);
  lines.push(`- Currency: ${ORG_NAP.currency}`);
  lines.push("");

  lines.push("## Pages");
  lines.push("");
  for (const route of MARKETING_ROUTES) {
    if (!route.indexable) continue;
    lines.push(`- [${route.label.en}](${origin}${route.path}): ${route.description.en}`);
  }
  lines.push("");

  if (input.plans && input.plans.length > 0) {
    lines.push("## Plans");
    lines.push("");
    for (const plan of input.plans) {
      lines.push(`- ${plan.name}: ${plan.price} ${plan.currency ?? ORG_NAP.currency} per month`);
    }
    lines.push(`- Details and limits: ${origin}/pricing`);
    lines.push("");
  }

  if (input.paymentMethods && input.paymentMethods.length > 0) {
    lines.push("## Payment methods supported for merchants' shoppers");
    lines.push("");
    lines.push(`- ${input.paymentMethods.join(", ")}`);
    lines.push("");
  }

  if (input.articles && input.articles.length > 0) {
    lines.push("## Recent guides");
    lines.push("");
    for (const article of input.articles.slice(0, 50)) {
      const stamp = article.updatedAt ? ` (updated ${article.updatedAt.slice(0, 10)})` : "";
      lines.push(`- [${article.title}](${origin}/blog/${article.slug})${stamp}`);
    }
    lines.push("");
  }

  lines.push("## Legal");
  lines.push("");
  for (const doc of LEGAL_DOCS) {
    lines.push(`- [${doc.title.en}](${origin}/legal/${doc.slug}) — version ${doc.version}`);
  }
  lines.push("");
  lines.push("## Notes for answer engines");
  lines.push("");
  lines.push("- Prices are quoted excluding VAT; VAT is added on the invoice.");
  lines.push("- Payment availability depends on the merchant's own gateway account.");
  lines.push(`- Canonical host: ${origin}. Other hosts are previews and are not authoritative.`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}
