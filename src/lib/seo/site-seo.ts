/**
 * Phase 13 — site-level SEO settings (`/admin/settings/seo`).
 *
 * Stored as one JSON document on `merchant_settings.seo_settings` so a new
 * knob never needs a migration. Pure parse/serialise: the panel and the server
 * share it, so what the merchant saves is what the storefront reads.
 */
import { SEPARATORS, applyTokens, type TokenVars } from "./seo-meta";

export const SEO_ENTITY_KINDS = ["home", "product", "collection", "page", "post"] as const;
export type SeoEntityKind = (typeof SEO_ENTITY_KINDS)[number];

export type TitleTemplate = {
  title: string;
  description: string;
  /** Whether this type is indexable and appears in the sitemap. */
  index: boolean;
  sitemap: boolean;
};

export type SiteSeoSettings = {
  separator: string;
  templates: Record<SeoEntityKind, TitleTemplate>;
  verification: { google: string; bing: string; pinterest: string };
  sitemap: { enabled: boolean; perPage: number; includeImages: boolean };
  aiCrawlers: boolean;
  instantIndexing: boolean;
  analytics: {
    facebookPixelId: string;
    facebookCapiToken: string;
    googleConversionUrl: string;
    googleTagManagerId: string;
  };
};

const DEFAULT_TEMPLATES: Record<SeoEntityKind, TitleTemplate> = {
  home: {
    title: "%sitename% %sep% %excerpt%",
    description: "%excerpt%",
    index: true,
    sitemap: true,
  },
  product: {
    title: "%title% %sep% %sitename%",
    description: "%excerpt%",
    index: true,
    sitemap: true,
  },
  collection: {
    title: "%title% %sep% %sitename%",
    description: "%excerpt%",
    index: true,
    sitemap: true,
  },
  page: { title: "%title% %sep% %sitename%", description: "%excerpt%", index: true, sitemap: true },
  post: { title: "%title% %sep% %sitename%", description: "%excerpt%", index: true, sitemap: true },
};

export const DEFAULT_SITE_SEO: SiteSeoSettings = {
  separator: "-",
  templates: DEFAULT_TEMPLATES,
  verification: { google: "", bing: "", pinterest: "" },
  sitemap: { enabled: true, perPage: 200, includeImages: true },
  aiCrawlers: true,
  instantIndexing: false,
  analytics: {
    facebookPixelId: "",
    facebookCapiToken: "",
    googleConversionUrl: "",
    googleTagManagerId: "",
  },
};

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const bool = (v: unknown, fallback: boolean) =>
  v === true || v === "true" ? true : v === false || v === "false" ? false : fallback;

export function parseSiteSeo(input: unknown): SiteSeoSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  const templatesRaw = (raw["templates"] ?? {}) as Record<string, unknown>;
  const verification = (raw["verification"] ?? {}) as Record<string, unknown>;
  const sitemap = (raw["sitemap"] ?? {}) as Record<string, unknown>;
  const analytics = (raw["analytics"] ?? {}) as Record<string, unknown>;
  const separator = str(raw["separator"], 4);

  const templates = { ...DEFAULT_TEMPLATES };
  for (const kind of SEO_ENTITY_KINDS) {
    const t = (templatesRaw[kind] ?? {}) as Record<string, unknown>;
    templates[kind] = {
      title: str(t["title"], 200) || DEFAULT_TEMPLATES[kind].title,
      description: str(t["description"], 400) || DEFAULT_TEMPLATES[kind].description,
      index: bool(t["index"], true),
      sitemap: bool(t["sitemap"], true),
    };
  }

  const perPage = Number(sitemap["perPage"]);
  return {
    separator: (SEPARATORS as readonly string[]).includes(separator) ? separator : "-",
    templates,
    verification: {
      google: str(verification["google"], 200),
      bing: str(verification["bing"], 200),
      pinterest: str(verification["pinterest"], 200),
    },
    sitemap: {
      enabled: bool(sitemap["enabled"], true),
      perPage: Number.isFinite(perPage) ? Math.min(1000, Math.max(20, Math.round(perPage))) : 200,
      includeImages: bool(sitemap["includeImages"], true),
    },
    aiCrawlers: bool(raw["aiCrawlers"], true),
    instantIndexing: bool(raw["instantIndexing"], false),
    analytics: {
      facebookPixelId: str(analytics["facebookPixelId"] ?? raw["facebook_pixel_id"], 200),
      facebookCapiToken: str(analytics["facebookCapiToken"] ?? raw["facebook_capi_token"], 1000),
      googleConversionUrl: str(analytics["googleConversionUrl"] ?? raw["google_conversion_url"], 500),
      googleTagManagerId: str(analytics["googleTagManagerId"] ?? raw["google_gtm_id"], 200),
    },
  };
}

/** Resolve one entity's title/description through the site templates. */
export function resolveTemplate(
  settings: SiteSeoSettings,
  kind: SeoEntityKind,
  vars: Partial<TokenVars>,
): { title: string; description: string } {
  const tpl = settings.templates[kind];
  const withSep = { ...vars, sep: settings.separator };
  return {
    title: applyTokens(tpl.title, withSep),
    description: applyTokens(tpl.description, withSep),
  };
}

/* --------------------------------------------------------------- redirects */

export const REDIRECT_CODE_OPTIONS = [301, 302, 307] as const;

export type RedirectRow = {
  id: string;
  sourcePath: string;
  targetPath: string;
  code: number;
  isActive: boolean;
  hits: number;
  lastHitAt: string | null;
  note: string;
  updatedAt: string;
};

export type NotFoundRow = {
  id: string;
  path: string;
  referrer: string;
  hits: number;
  lastSeenAt: string;
};

/** Site-relative paths only, normalised to a single leading slash. */
export function normalisePath(value: string): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).pathname;
  } catch {
    return "";
  }
  return ("/" + trimmed.replace(/^\/+/, "")).replace(/\s+/g, "").slice(0, 512);
}

export type RedirectIssue = "source" | "target" | "loop";

export function validateRedirect(source: string, target: string): RedirectIssue | null {
  const s = normalisePath(source);
  if (!s || s === "/") return "source";
  const t = /^https?:\/\//i.test(target.trim()) ? target.trim() : normalisePath(target);
  if (!t) return "target";
  if (t === s) return "loop";
  return null;
}
