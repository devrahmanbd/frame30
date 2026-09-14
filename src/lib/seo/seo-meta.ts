/**
 * Phase 13 — the extended per-entity SEO record (Rank Math / Yoast model).
 *
 * Pure and isomorphic: the meta box scores while the merchant types, the
 * server re-parses and re-scores the identical payload before storing it, and
 * the storefront head reads the same record. No network, no clock, no
 * randomness — the number shown is the number stored.
 *
 * Everything untrusted goes through `parseEntitySeo`, so a hand-edited request
 * body cannot put a `javascript:` canonical or a 1 MB string into a head tag.
 */
import { analyseSeo, type SeoCheck, type SeoReport, type FaqItem } from "@/lib/seo-analysis";
import { serpMetrics, type SerpDevice } from "@/lib/seo-pixels";

/* ------------------------------------------------------------------ model */

export const SCHEMA_TYPES = [
  "none",
  "Article",
  "BlogPosting",
  "Product",
  "FAQPage",
  "HowTo",
  "Organization",
  "WebPage",
] as const;
export type SchemaType = (typeof SCHEMA_TYPES)[number];

export const TWITTER_CARDS = ["summary", "summary_large_image"] as const;
export type TwitterCard = (typeof TWITTER_CARDS)[number];

export const REDIRECT_CODES = [301, 302, 307] as const;
export type RedirectCode = (typeof REDIRECT_CODES)[number];

export const IMAGE_PREVIEWS = ["", "none", "standard", "large"] as const;
export type ImagePreview = (typeof IMAGE_PREVIEWS)[number];

export const FOCUS_KEYWORDS_MAX = 5;

export type RobotsFlags = {
  index: boolean;
  follow: boolean;
  noarchive: boolean;
  noimageindex: boolean;
  nosnippet: boolean;
};

export type AdvancedRobots = {
  maxSnippet: number | null;
  maxVideoPreview: number | null;
  maxImagePreview: ImagePreview;
};

export type SeoRedirect = { enabled: boolean; target: string; code: RedirectCode };

export type HowToStep = { name: string; text: string };

export type SeoSchema = {
  type: SchemaType;
  headline: string;
  description: string;
  faq: FaqItem[];
  steps: HowToStep[];
};

export type SocialCard = { title: string; description: string; image: string; useSeo: boolean };

export type EntitySeo = {
  focusKeywords: string[];
  title: string;
  description: string;
  canonical: string;
  breadcrumbTitle: string;
  robots: RobotsFlags;
  advancedRobots: AdvancedRobots;
  redirect: SeoRedirect;
  schema: SeoSchema;
  facebook: SocialCard;
  twitter: SocialCard & { card: TwitterCard };
};

export const EMPTY_ROBOTS: RobotsFlags = {
  index: true,
  follow: true,
  noarchive: false,
  noimageindex: false,
  nosnippet: false,
};

export const EMPTY_SOCIAL: SocialCard = { title: "", description: "", image: "", useSeo: true };

export const EMPTY_ENTITY_SEO: EntitySeo = {
  focusKeywords: [],
  title: "",
  description: "",
  canonical: "",
  breadcrumbTitle: "",
  robots: EMPTY_ROBOTS,
  advancedRobots: { maxSnippet: null, maxVideoPreview: null, maxImagePreview: "" },
  redirect: { enabled: false, target: "", code: 301 },
  schema: { type: "none", headline: "", description: "", faq: [], steps: [] },
  facebook: EMPTY_SOCIAL,
  twitter: { ...EMPTY_SOCIAL, card: "summary_large_image" },
};

/* ------------------------------------------------------------- sanitising */

const LIMIT = {
  title: 200,
  description: 500,
  url: 2048,
  keyword: 80,
  short: 160,
  long: 900,
} as const;

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function bool(value: unknown, fallback = false): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

/** Only absolute http(s) URLs survive; anything else becomes empty. */
export function safeAbsoluteUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Redirect targets may be relative site paths as well as absolute URLs. */
export function safeTarget(value: string): string {
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value.slice(0, LIMIT.url);
  return safeAbsoluteUrl(value);
}

function num(value: unknown, min: number, max: number): number | null {
  // An absent or blank value means "not set" — `Number("")` is 0, which would
  // silently store `max-snippet:0` and stop Google showing any snippet.
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === ""))
    return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function parseFocusKeywords(input: unknown): string[] {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const value = text(raw, LIMIT.keyword).replace(/<[^>]*>/g, "");
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= FOCUS_KEYWORDS_MAX) break;
  }
  return out;
}

function parseSocial(input: unknown, fallback: SocialCard = EMPTY_SOCIAL): SocialCard {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    title: text(raw["title"], LIMIT.title),
    description: text(raw["description"], LIMIT.description),
    image: safeAbsoluteUrl(text(raw["image"], LIMIT.url)),
    useSeo: bool(raw["useSeo"], fallback.useSeo),
  };
}

function parseFaq(input: unknown): FaqItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 12)
    .map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      return { q: text(raw["q"], LIMIT.short), a: text(raw["a"], LIMIT.long) };
    })
    .filter((item) => item.q || item.a);
}

function parseSteps(input: unknown): HowToStep[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 20)
    .map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      return { name: text(raw["name"], LIMIT.short), text: text(raw["text"], LIMIT.long) };
    })
    .filter((step) => step.name || step.text);
}

export function parseEntitySeo(input: unknown): EntitySeo {
  const raw = (input ?? {}) as Record<string, unknown>;
  const robots = (raw["robots"] ?? {}) as Record<string, unknown>;
  const advanced = (raw["advancedRobots"] ?? {}) as Record<string, unknown>;
  const redirect = (raw["redirect"] ?? {}) as Record<string, unknown>;
  const schema = (raw["schema"] ?? {}) as Record<string, unknown>;
  const twitter = parseSocial(raw["twitter"], EMPTY_ENTITY_SEO.twitter);
  const card = String((raw["twitter"] as Record<string, unknown> | undefined)?.["card"] ?? "");
  const codeRaw = num(redirect["code"], 300, 308) ?? 301;
  const schemaType = String(schema["type"] ?? "none") as SchemaType;
  const preview = String(advanced["maxImagePreview"] ?? "") as ImagePreview;

  return {
    focusKeywords: parseFocusKeywords(raw["focusKeywords"]),
    title: text(raw["title"], LIMIT.title),
    description: text(raw["description"], LIMIT.description),
    canonical: safeAbsoluteUrl(text(raw["canonical"], LIMIT.url)),
    breadcrumbTitle: text(raw["breadcrumbTitle"], LIMIT.short),
    robots: {
      index: bool(robots["index"], true),
      follow: bool(robots["follow"], true),
      noarchive: bool(robots["noarchive"]),
      noimageindex: bool(robots["noimageindex"]),
      nosnippet: bool(robots["nosnippet"]),
    },
    advancedRobots: {
      maxSnippet: num(advanced["maxSnippet"], -1, 1000),
      maxVideoPreview: num(advanced["maxVideoPreview"], -1, 1000),
      maxImagePreview: (IMAGE_PREVIEWS as readonly string[]).includes(preview) ? preview : "",
    },
    redirect: {
      enabled: bool(redirect["enabled"]),
      target: safeTarget(text(redirect["target"], LIMIT.url)),
      code: ((REDIRECT_CODES as readonly number[]).includes(codeRaw)
        ? codeRaw
        : 301) as RedirectCode,
    },
    schema: {
      type: (SCHEMA_TYPES as readonly string[]).includes(schemaType) ? schemaType : "none",
      headline: text(schema["headline"], LIMIT.title),
      description: text(schema["description"], LIMIT.description),
      faq: parseFaq(schema["faq"]),
      steps: parseSteps(schema["steps"]),
    },
    facebook: parseSocial(raw["facebook"]),
    twitter: {
      ...twitter,
      card: (TWITTER_CARDS as readonly string[]).includes(card)
        ? (card as TwitterCard)
        : "summary_large_image",
    },
  };
}

export function isEntitySeoEmpty(seo: EntitySeo): boolean {
  return JSON.stringify(seo) === JSON.stringify(EMPTY_ENTITY_SEO);
}

/* ---------------------------------------------------------------- robots */

/** The `robots` meta value the storefront should emit for this record. */
export function robotsContent(seo: EntitySeo): string {
  const parts: string[] = [
    seo.robots.index ? "index" : "noindex",
    seo.robots.follow ? "follow" : "nofollow",
  ];
  if (seo.robots.noarchive) parts.push("noarchive");
  if (seo.robots.noimageindex) parts.push("noimageindex");
  if (seo.robots.nosnippet) parts.push("nosnippet");
  const { maxSnippet, maxVideoPreview, maxImagePreview } = seo.advancedRobots;
  if (maxSnippet !== null) parts.push(`max-snippet:${maxSnippet}`);
  if (maxVideoPreview !== null) parts.push(`max-video-preview:${maxVideoPreview}`);
  if (maxImagePreview) parts.push(`max-image-preview:${maxImagePreview}`);
  return parts.join(",");
}

/** Read a stored `index,follow`-style string back into the checkbox model. */
export function robotsFromContent(value: string | null | undefined): RobotsFlags {
  const parts = String(value ?? "")
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  return {
    index: !parts.includes("noindex"),
    follow: !parts.includes("nofollow"),
    noarchive: parts.includes("noarchive"),
    noimageindex: parts.includes("noimageindex"),
    nosnippet: parts.includes("nosnippet"),
  };
}

/* ---------------------------------------------------------------- tokens */

export type TokenVars = {
  title: string;
  sitename: string;
  sep: string;
  excerpt: string;
  category: string;
  date: string;
  author: string;
};

export const SEO_TOKENS = [
  { token: "%title%", en: "Title", bn: "শিরোনাম" },
  { token: "%sep%", en: "Separator", bn: "বিভাজক" },
  { token: "%sitename%", en: "Store name", bn: "স্টোরের নাম" },
  { token: "%excerpt%", en: "Excerpt", bn: "সারাংশ" },
  { token: "%category%", en: "Category", bn: "ক্যাটাগরি" },
  { token: "%date%", en: "Date", bn: "তারিখ" },
  { token: "%author%", en: "Author", bn: "লেখক" },
] as const;

export const SEPARATORS = ["-", "·", "|", "–", "»"] as const;

/** Replace `%token%` placeholders, then collapse the gaps empty ones leave. */
export function applyTokens(template: string, vars: Partial<TokenVars>): string {
  const map: Record<string, string> = {
    "%title%": vars.title ?? "",
    "%sep%": vars.sep ?? "-",
    "%sitename%": vars.sitename ?? "",
    "%excerpt%": vars.excerpt ?? "",
    "%category%": vars.category ?? "",
    "%date%": vars.date ?? "",
    "%author%": vars.author ?? "",
  };
  const resolved = template.replace(/%[a-z]+%/g, (m) => (m in map ? map[m]! : ""));
  const sep = (vars.sep ?? "-").trim();
  return resolved
    .split(sep)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(` ${sep} `)
    .replace(/\s+/g, " ")
    .trim();
}

/* --------------------------------------------------------------- JSON-LD */

export type JsonLdContext = {
  url: string;
  siteName: string;
  authorName?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  imageUrl?: string;
};

/** The JSON-LD object this record describes, or null for `none`. */
export function buildJsonLd(seo: EntitySeo, ctx: JsonLdContext): Record<string, unknown> | null {
  const type = seo.schema.type;
  if (type === "none") return null;
  const headline = seo.schema.headline || seo.title;
  const description = seo.schema.description || seo.description;
  const base: Record<string, unknown> = { "@context": "https://schema.org", "@type": type };

  if (type === "FAQPage") {
    const entries = seo.schema.faq.filter((f) => f.q && f.a);
    if (entries.length === 0) return null;
    return {
      ...base,
      mainEntity: entries.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    };
  }

  if (type === "HowTo") {
    const steps = seo.schema.steps.filter((s) => s.name || s.text);
    if (steps.length === 0) return null;
    return {
      ...base,
      name: headline,
      description,
      step: steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    };
  }

  if (type === "Organization") {
    return {
      ...base,
      name: ctx.siteName,
      url: ctx.url,
      ...(ctx.imageUrl ? { logo: ctx.imageUrl } : {}),
    };
  }

  if (type === "Product") {
    return {
      ...base,
      name: headline,
      description,
      url: ctx.url,
      ...(ctx.imageUrl ? { image: ctx.imageUrl } : {}),
    };
  }

  return {
    ...base,
    headline,
    description,
    mainEntityOfPage: ctx.url,
    ...(ctx.imageUrl ? { image: ctx.imageUrl } : {}),
    ...(ctx.authorName ? { author: { "@type": "Person", name: ctx.authorName } } : {}),
    ...(ctx.publishedAt ? { datePublished: ctx.publishedAt } : {}),
    ...(ctx.updatedAt ? { dateModified: ctx.updatedAt } : {}),
    publisher: { "@type": "Organization", name: ctx.siteName },
  };
}

/* ---------------------------------------------------------------- scoring */

/** Rank Math's bands, so merchants who have used it read the same colours. */
export function rankMathBand(score: number): {
  tone: "success" | "warning" | "danger";
  en: string;
  bn: string;
} {
  if (score >= 81) return { tone: "success", en: "Great", bn: "চমৎকার" };
  if (score >= 51) return { tone: "warning", en: "Good", bn: "ভালো" };
  return { tone: "danger", en: "Poor", bn: "দুর্বল" };
}

export type AnalysisGroupId = "basic" | "additional" | "titleReadability" | "contentReadability";

export const ANALYSIS_GROUPS: { id: AnalysisGroupId; en: string; bn: string }[] = [
  { id: "basic", en: "Basic SEO", bn: "বেসিক SEO" },
  { id: "additional", en: "Additional", bn: "অতিরিক্ত" },
  { id: "titleReadability", en: "Title readability", bn: "টাইটেল পাঠযোগ্যতা" },
  { id: "contentReadability", en: "Content readability", bn: "কনটেন্ট পাঠযোগ্যতা" },
];

/** Which Rank Math group an analyser check belongs to. */
export function groupOf(check: SeoCheck): AnalysisGroupId {
  if (check.group === "meta" || check.group === "indexing") return "basic";
  if (check.group === "readability") return "contentReadability";
  return "additional";
}

export type SeoMetaInput = {
  seo: EntitySeo;
  /** Rendered title/description the storefront would emit without overrides. */
  fallbackTitle: string;
  fallbackDescription: string;
  content: string;
  url: string;
  origin: string;
  siteName: string;
  excerpt?: string;
  category?: string;
  locale?: "en" | "bn";
};

export type MetaGroup = {
  id: AnalysisGroupId;
  en: string;
  bn: string;
  checks: SeoCheck[];
  pass: number;
  total: number;
};

export type SeoMetaReport = SeoReport & {
  /** Title/description after tokens resolve — exactly what the preview shows. */
  resolved: { title: string; description: string };
  groups: MetaGroup[];
  band: ReturnType<typeof rankMathBand>;
};

function titleChecks(resolvedTitle: string, keyword: string): SeoCheck[] {
  const lower = resolvedTitle.toLowerCase();
  const kw = keyword.trim().toLowerCase();
  const checks: SeoCheck[] = [];

  checks.push({
    id: "title-keyword-start",
    group: "meta",
    label: "Focus keyword near the beginning of the title",
    labelBn: "টাইটেলের শুরুতে মূল কীওয়ার্ড",
    status: !kw ? "skip" : lower.indexOf(kw) === 0 ? "pass" : lower.includes(kw) ? "warn" : "fail",
    hint: "Search engines weight the first words of a title most heavily.",
    hintBn: "টাইটেলের প্রথম শব্দগুলোই বেশি গুরুত্ব পায়।",
    weight: 2,
  });

  checks.push({
    id: "title-number",
    group: "meta",
    label: "Number in the title",
    labelBn: "টাইটেলে সংখ্যা",
    status: /\d/.test(resolvedTitle) ? "pass" : "warn",
    hint: "Titles with a number tend to earn more clicks.",
    hintBn: "সংখ্যাযুক্ত টাইটেলে ক্লিক বেশি আসে।",
    weight: 1,
  });

  const words = resolvedTitle.split(/\s+/).filter(Boolean).length;
  checks.push({
    id: "title-length-words",
    group: "meta",
    label: "Title is a readable length",
    labelBn: "টাইটেলের দৈর্ঘ্য পাঠযোগ্য",
    status: words === 0 ? "fail" : words >= 4 && words <= 12 ? "pass" : "warn",
    hint: "Aim for four to twelve words so nothing is clipped.",
    hintBn: "চার থেকে বারো শব্দ রাখুন যাতে কেটে না যায়।",
    weight: 1,
  });

  return checks.map((c) => ({ ...c, group: "meta" as const, id: c.id }));
}

/**
 * One analysis for the whole meta box: the shared analyser plus the title
 * readability checks Rank Math shows, grouped and banded for display.
 */
export function analyseEntitySeo(input: SeoMetaInput): SeoMetaReport {
  const vars: Partial<TokenVars> = {
    title: input.fallbackTitle,
    sitename: input.siteName,
    sep: "-",
    excerpt: input.excerpt ?? "",
    category: input.category ?? "",
  };
  const resolvedTitle = input.seo.title ? applyTokens(input.seo.title, vars) : input.fallbackTitle;
  const resolvedDescription = input.seo.description
    ? applyTokens(input.seo.description, vars)
    : input.fallbackDescription;

  const primary = input.seo.focusKeywords[0] ?? "";
  const report = analyseSeo({
    metaTitle: resolvedTitle,
    metaDescription: resolvedDescription,
    canonical: input.seo.canonical,
    robotsIndex: input.seo.robots.index,
    robotsFollow: input.seo.robots.follow,
    ogImageUrl: input.seo.facebook.image || input.seo.twitter.image,
    focusKeyword: primary,
    faq: input.seo.schema.faq,
    secondaryKeywords: input.seo.focusKeywords.slice(1),
    content: input.content,
    url: input.url,
    origin: input.origin,
    locale: input.locale ?? "en",
    fallbackTitle: input.fallbackTitle,
    fallbackDescription: input.fallbackDescription,
  });

  const extra = titleChecks(resolvedTitle, primary);
  const all = [...report.checks, ...extra];
  const groups: MetaGroup[] = ANALYSIS_GROUPS.map((g) => {
    const checks = all
      .filter((c) => (extra.includes(c) ? g.id === "titleReadability" : groupOf(c) === g.id))
      .sort((a, b) => rank(a.status) - rank(b.status));
    return {
      ...g,
      checks,
      pass: checks.filter((c) => c.status === "pass").length,
      total: checks.filter((c) => c.status !== "skip").length,
    };
  }).filter((g) => g.checks.length > 0);

  return {
    ...report,
    resolved: { title: resolvedTitle, description: resolvedDescription },
    groups,
    band: rankMathBand(report.score),
  };
}

function rank(status: SeoCheck["status"]): number {
  return status === "fail" ? 0 : status === "warn" ? 1 : status === "pass" ? 2 : 3;
}

/** Pixel meters for the preview card, at the device the merchant is viewing. */
export function metaMeters(title: string, description: string, device: SerpDevice) {
  return serpMetrics({ title, description }, device);
}
