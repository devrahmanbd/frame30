/**
 * Phase 5 — Site Kit equivalent: pure domain logic.
 *
 * Everything in this module is deterministic, dependency-free and client-safe:
 * it is imported by the admin bundle (for previews and validation), by the
 * server (for the snapshot job) and by the contract test. No Google call, no
 * Supabase call, no `process.env` read happens here — that separation is what
 * lets the exit gate assert "no Google call during SSR" by construction.
 *
 * What lives here:
 *
 *  - **Verification tokens.** Each provider (Google, Bing, Yandex, Pinterest,
 *    Baidu, plus free-form) has a real content shape. We validate against it
 *    rather than accepting any string, because a wrong token is silently
 *    ignored by the crawler and the merchant never finds out. Tokens are
 *    deduplicated per provider so adding Google twice cannot emit two
 *    `google-site-verification` metas — duplicates make Google discard both.
 *  - **Analytics vendors.** A registry with the *measured* transfer cost of
 *    each vendor's loader, so the UI can tell a merchant what enabling GTM
 *    actually costs before they enable it. IDs are shape-validated for the
 *    same reason as tokens.
 *  - **Google Search Console semantics.** Property matching that returns
 *    `selection_required` instead of guessing, row normalisation, aggregation
 *    into the dashboard cards, and the retry policy (Retry-After parsing,
 *    exponential backoff with jitter bounds, 403 = stop the batch).
 */

/* ========================================================================== *
 * Verification tokens
 * ========================================================================== */

export const VERIFICATION_PROVIDERS = ["google", "bing", "yandex", "pinterest", "baidu"] as const;
export type VerificationProvider = (typeof VERIFICATION_PROVIDERS)[number];

export type VerificationTag = { name: string; content: string };

/** Per-provider meta name plus the shape the provider actually issues. */
export const VERIFICATION_SPEC: Record<
  VerificationProvider,
  { metaName: string; pattern: RegExp; label: string; help: string }
> = {
  google: {
    metaName: "google-site-verification",
    // Google issues a 43-char URL-safe base64 token.
    pattern: /^[A-Za-z0-9_-]{20,100}$/,
    label: "Google Search Console",
    help: "The value of content= in the HTML tag method.",
  },
  bing: {
    metaName: "msvalidate.01",
    pattern: /^[A-Fa-f0-9]{16,64}$/,
    label: "Bing Webmaster Tools",
    help: "A hexadecimal token, usually 32 characters.",
  },
  yandex: {
    metaName: "yandex-verification",
    pattern: /^[A-Za-z0-9]{8,32}$/,
    label: "Yandex Webmaster",
    help: "An alphanumeric token.",
  },
  pinterest: {
    metaName: "p:domain_verify",
    pattern: /^[A-Za-z0-9]{16,64}$/,
    label: "Pinterest",
    help: "The domain verification token.",
  },
  baidu: {
    metaName: "baidu-site-verification",
    pattern: /^[A-Za-z0-9_-]{8,64}$/,
    label: "Baidu Ziyuan",
    help: "The code from the HTML meta verification method.",
  },
};

/** Free-form tags a merchant adds for a provider we do not model. */
export type CustomVerification = { name: string; content: string };

export const CUSTOM_VERIFICATION_MAX = 10;
/** A meta name may only contain the characters HTML actually allows unquoted. */
const META_NAME_RE = /^[A-Za-z][A-Za-z0-9:._-]{2,64}$/;
/** Content must not be able to break out of the attribute or inject markup. */
const META_CONTENT_RE = /^[A-Za-z0-9 ._:@/=+-]{4,200}$/;

export type VerificationSettings = {
  tokens: Partial<Record<VerificationProvider, string>>;
  custom: CustomVerification[];
};

export const DEFAULT_VERIFICATION: VerificationSettings = { tokens: {}, custom: [] };

export type FieldIssue = { field: string; message: string };

/**
 * Validates and normalises the verification block. Invalid entries are dropped
 * (never persisted half-valid) and reported, so the UI can show exactly which
 * token was rejected instead of silently swallowing it.
 */
export function validateVerification(input: unknown): {
  value: VerificationSettings;
  issues: FieldIssue[];
} {
  const issues: FieldIssue[] = [];
  const raw = (input ?? {}) as Partial<VerificationSettings>;
  const tokens: Partial<Record<VerificationProvider, string>> = {};

  for (const provider of VERIFICATION_PROVIDERS) {
    const value = (raw.tokens as Record<string, unknown> | undefined)?.[provider];
    if (value === undefined || value === null || value === "") continue;
    const text = String(value).trim();
    if (!VERIFICATION_SPEC[provider].pattern.test(text)) {
      issues.push({ field: `tokens.${provider}`, message: `Token does not match the ${provider} format` });
      continue;
    }
    tokens[provider] = text;
  }

  const custom: CustomVerification[] = [];
  const seenNames = new Set(Object.values(VERIFICATION_SPEC).map((spec) => spec.metaName.toLowerCase()));
  for (const [index, entry] of (Array.isArray(raw.custom) ? raw.custom : []).entries()) {
    if (custom.length >= CUSTOM_VERIFICATION_MAX) {
      issues.push({ field: "custom", message: `At most ${CUSTOM_VERIFICATION_MAX} custom tags` });
      break;
    }
    const name = String((entry as CustomVerification)?.name ?? "").trim();
    const content = String((entry as CustomVerification)?.content ?? "").trim();
    if (!META_NAME_RE.test(name)) {
      issues.push({ field: `custom.${index}.name`, message: "Invalid meta name" });
      continue;
    }
    if (!META_CONTENT_RE.test(content)) {
      issues.push({ field: `custom.${index}.content`, message: "Invalid meta content" });
      continue;
    }
    if (seenNames.has(name.toLowerCase())) {
      // Duplicate provider tags are worse than missing ones: crawlers that see
      // two conflicting values treat the site as unverified.
      issues.push({ field: `custom.${index}.name`, message: `Duplicate meta name ${name}` });
      continue;
    }
    seenNames.add(name.toLowerCase());
    custom.push({ name, content });
  }

  return { value: { tokens, custom }, issues };
}

/**
 * The storefront head tags, deduplicated and stably ordered so SSR and
 * hydration produce byte-identical markup.
 */
export function verificationTags(settings: VerificationSettings): VerificationTag[] {
  const out: VerificationTag[] = [];
  const seen = new Set<string>();
  for (const provider of VERIFICATION_PROVIDERS) {
    const token = settings.tokens[provider];
    if (!token) continue;
    const name = VERIFICATION_SPEC[provider].metaName;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, content: token });
  }
  for (const entry of settings.custom) {
    if (seen.has(entry.name.toLowerCase())) continue;
    seen.add(entry.name.toLowerCase());
    out.push({ name: entry.name, content: entry.content });
  }
  return out;
}

/* ========================================================================== *
 * Analytics vendors
 * ========================================================================== */

export const ANALYTICS_VENDORS = ["ga4", "gtm", "meta", "tiktok", "clarity"] as const;
export type AnalyticsVendor = (typeof ANALYTICS_VENDORS)[number];

/**
 * `transferKb` is the compressed weight of the vendor's loader as measured on
 * a cold cache — the number we show merchants before they enable it. Treat it
 * as documentation, not as a live measurement.
 */
export const ANALYTICS_SPEC: Record<
  AnalyticsVendor,
  {
    label: string;
    pattern: RegExp;
    transferKb: number;
    /** Whether the vendor may load before the visitor has consented. */
    requiresConsent: boolean;
    placeholder: string;
  }
> = {
  ga4: {
    label: "Google Analytics 4",
    pattern: /^G-[A-Z0-9]{6,12}$/,
    transferKb: 48,
    requiresConsent: true,
    placeholder: "G-XXXXXXXXXX",
  },
  gtm: {
    label: "Google Tag Manager",
    pattern: /^GTM-[A-Z0-9]{5,10}$/,
    transferKb: 92,
    requiresConsent: true,
    placeholder: "GTM-XXXXXXX",
  },
  meta: {
    label: "Meta Pixel",
    pattern: /^\d{8,20}$/,
    transferKb: 70,
    requiresConsent: true,
    placeholder: "123456789012345",
  },
  tiktok: {
    label: "TikTok Pixel",
    pattern: /^[A-Z0-9]{15,25}$/,
    transferKb: 66,
    requiresConsent: true,
    placeholder: "CXXXXXXXXXXXXXXXXXX",
  },
  clarity: {
    label: "Microsoft Clarity",
    pattern: /^[a-z0-9]{8,15}$/,
    transferKb: 38,
    requiresConsent: true,
    placeholder: "abcdefghij",
  },
};

export type AnalyticsSettings = {
  enabled: Partial<Record<AnalyticsVendor, string>>;
  /** Merchant override: load vendors only after explicit visitor consent. */
  consentRequired: boolean;
};

export const DEFAULT_ANALYTICS: AnalyticsSettings = { enabled: {}, consentRequired: true };

/** Total third-party transfer the storefront takes on, in kB. */
export function analyticsBudgetKb(settings: AnalyticsSettings): number {
  return ANALYTICS_VENDORS.reduce(
    (sum, vendor) => (settings.enabled[vendor] ? sum + ANALYTICS_SPEC[vendor].transferKb : sum),
    0,
  );
}

/** Above this we warn: the storefront's own JS budget is smaller than this. */
export const ANALYTICS_BUDGET_WARN_KB = 120;

export function validateAnalytics(input: unknown): { value: AnalyticsSettings; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const raw = (input ?? {}) as Partial<AnalyticsSettings>;
  const enabled: Partial<Record<AnalyticsVendor, string>> = {};
  for (const vendor of ANALYTICS_VENDORS) {
    const value = (raw.enabled as Record<string, unknown> | undefined)?.[vendor];
    if (value === undefined || value === null || value === "") continue;
    const text = String(value).trim().toUpperCase();
    const normalised = vendor === "clarity" ? text.toLowerCase() : text;
    if (!ANALYTICS_SPEC[vendor].pattern.test(normalised)) {
      issues.push({ field: `analytics.${vendor}`, message: `Invalid ${ANALYTICS_SPEC[vendor].label} ID` });
      continue;
    }
    enabled[vendor] = normalised;
  }
  return {
    value: { enabled, consentRequired: raw.consentRequired !== false },
    issues,
  };
}

/**
 * The plan the client island executes. Ordering is deliberate: GTM last,
 * because it is the heaviest and the one most likely to be starved by the
 * idle callback — better it is the tag that slips than GA4.
 */
export type TagPlan = { vendor: AnalyticsVendor; id: string; src: string | null; transferKb: number }[];

export function tagPlan(settings: AnalyticsSettings): TagPlan {
  const order: AnalyticsVendor[] = ["ga4", "meta", "tiktok", "clarity", "gtm"];
  const seen = new Set<string>();
  const plan: TagPlan = [];
  for (const vendor of order) {
    const id = settings.enabled[vendor];
    if (!id) continue;
    const key = `${vendor}:${id}`;
    if (seen.has(key)) continue; // dedupe: the same pixel twice double-counts
    seen.add(key);
    plan.push({
      vendor,
      id,
      src:
        vendor === "ga4"
          ? `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
          : vendor === "gtm"
            ? `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`
            : vendor === "clarity"
              ? `https://www.clarity.ms/tag/${encodeURIComponent(id)}`
              : null,
      transferKb: ANALYTICS_SPEC[vendor].transferKb,
    });
  }
  return plan;
}

/* ========================================================================== *
 * Site Kit settings envelope
 * ========================================================================== */

export type SiteKitSettings = {
  verification: VerificationSettings;
  analytics: AnalyticsSettings;
  /** Merchant-chosen Search Console property, exactly as Google returned it. */
  searchConsoleSiteUrl: string | null;
};

export const DEFAULT_SITE_KIT: SiteKitSettings = {
  verification: DEFAULT_VERIFICATION,
  analytics: DEFAULT_ANALYTICS,
  searchConsoleSiteUrl: null,
};

export function validateSiteKit(input: unknown): { value: SiteKitSettings; issues: FieldIssue[] } {
  const raw = (input ?? {}) as Partial<SiteKitSettings>;
  const verification = validateVerification(raw.verification);
  const analytics = validateAnalytics(raw.analytics);
  const siteUrl = typeof raw.searchConsoleSiteUrl === "string" ? raw.searchConsoleSiteUrl.trim() : "";
  return {
    value: {
      verification: verification.value,
      analytics: analytics.value,
      searchConsoleSiteUrl: siteUrl && isPropertyUrl(siteUrl) ? siteUrl : null,
    },
    issues: [...verification.issues, ...analytics.issues],
  };
}

/* ========================================================================== *
 * Search Console property resolution
 * ========================================================================== */

export type GscProperty = {
  siteUrl: string;
  permissionLevel: string;
};

export type PropertyResolution =
  | { status: "resolved"; siteUrl: string; propertyType: "domain" | "url_prefix" }
  | { status: "selection_required"; candidates: GscProperty[] }
  | { status: "none"; reason: "no_verified_property" | "no_permission" };

/** `sc-domain:example.com` and `https://example.com/` are both valid. */
export function isPropertyUrl(value: string): boolean {
  if (value.startsWith("sc-domain:")) return /^sc-domain:[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
  return /^https?:\/\/[^\s]+$/i.test(value);
}

function propertyHost(siteUrl: string): string | null {
  if (siteUrl.startsWith("sc-domain:")) return siteUrl.slice("sc-domain:".length).toLowerCase();
  try {
    return new URL(siteUrl).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Permission levels that actually allow reading performance data. */
const READ_LEVELS = new Set(["siteOwner", "siteFullUser", "siteRestrictedUser"]);

/**
 * Matches verified properties against the store's own host.
 *
 * The one rule that matters: when several properties could serve the store
 * (a domain property *and* an https prefix, or www and apex), we return
 * `selection_required` and let the merchant choose. Auto-picking here silently
 * binds a tenant's reporting to the wrong property, and the mistake only
 * surfaces weeks later as "my numbers are wrong".
 */
export function resolveProperty(properties: readonly GscProperty[], storeHost: string): PropertyResolution {
  const host = storeHost.trim().toLowerCase().replace(/^www\./, "");
  if (!host) return { status: "none", reason: "no_verified_property" };

  const readable = properties.filter((p) => READ_LEVELS.has(p.permissionLevel));
  if (properties.length > 0 && readable.length === 0) return { status: "none", reason: "no_permission" };

  const matches = readable.filter((p) => {
    const candidate = propertyHost(p.siteUrl);
    if (!candidate) return false;
    const bare = candidate.replace(/^www\./, "");
    return bare === host || bare.endsWith(`.${host}`);
  });

  if (matches.length === 0) return { status: "none", reason: "no_verified_property" };
  if (matches.length > 1) return { status: "selection_required", candidates: matches };
  const only = matches[0]!;
  return {
    status: "resolved",
    siteUrl: only.siteUrl,
    propertyType: only.siteUrl.startsWith("sc-domain:") ? "domain" : "url_prefix",
  };
}

/* ========================================================================== *
 * Rows, aggregation, deltas
 * ========================================================================== */

export type GscApiRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export type SnapshotRow = {
  day: string;
  dimension: "query" | "page" | "date";
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const MAX_DIMENSION_VALUE = 500;

function finite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalises an API page into storage rows.
 *
 * Google returns `[date, query]` style key tuples; we require the date first
 * so a row can always be attributed to a day. Rows without a usable key are
 * dropped rather than bucketed into an empty string, which would otherwise
 * become a permanent phantom "" query in every merchant's top-10.
 */
export function normaliseRows(
  rows: readonly GscApiRow[],
  dimension: "query" | "page" | "date",
): SnapshotRow[] {
  const out: SnapshotRow[] = [];
  for (const row of rows) {
    const keys = row.keys ?? [];
    const day = keys[0] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const value = dimension === "date" ? day : (keys[1] ?? "").slice(0, MAX_DIMENSION_VALUE);
    if (dimension !== "date" && !value) continue;
    out.push({
      day,
      dimension,
      value,
      clicks: Math.max(0, Math.round(finite(row.clicks))),
      impressions: Math.max(0, Math.round(finite(row.impressions))),
      ctr: Math.min(1, Math.max(0, Number(finite(row.ctr).toFixed(4)))),
      position: Math.max(0, Number(finite(row.position).toFixed(2))),
    });
  }
  return out;
}

export type Aggregate = {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/**
 * Aggregates day rows into totals. CTR and position are *weighted* — averaging
 * daily CTRs or positions unweighted is the single most common way analytics
 * dashboards lie (a day with 3 impressions counts as much as a day with 30k).
 */
export function aggregate(rows: readonly SnapshotRow[]): Aggregate[] {
  const byValue = new Map<string, { clicks: number; impressions: number; positionWeighted: number }>();
  for (const row of rows) {
    const bucket = byValue.get(row.value) ?? { clicks: 0, impressions: 0, positionWeighted: 0 };
    bucket.clicks += row.clicks;
    bucket.impressions += row.impressions;
    bucket.positionWeighted += row.position * row.impressions;
    byValue.set(row.value, bucket);
  }
  return [...byValue.entries()]
    .map(([value, bucket]) => ({
      value,
      clicks: bucket.clicks,
      impressions: bucket.impressions,
      ctr: bucket.impressions > 0 ? Number((bucket.clicks / bucket.impressions).toFixed(4)) : 0,
      position: bucket.impressions > 0 ? Number((bucket.positionWeighted / bucket.impressions).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.value.localeCompare(b.value));
}

export type Delta = Aggregate & { previousPosition: number | null; positionChange: number | null };

/** Position deltas are inverted on purpose: a *lower* position is better. */
export function comparePeriods(current: readonly SnapshotRow[], previous: readonly SnapshotRow[]): Delta[] {
  const before = new Map(aggregate(previous).map((row) => [row.value, row]));
  return aggregate(current).map((row) => {
    const prior = before.get(row.value);
    return {
      ...row,
      previousPosition: prior ? prior.position : null,
      positionChange: prior ? Number((prior.position - row.position).toFixed(2)) : null,
    };
  });
}

/** Inclusive ISO date range ending `endDay`, `days` long. */
export function dateRange(endDay: string, days: number): { start: string; end: string } {
  const end = new Date(`${endDay}T00:00:00Z`);
  const start = new Date(end.getTime() - (Math.max(1, days) - 1) * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * Search Console finalises data with a two-to-three day lag. Querying "today"
 * returns partial rows that then change, which would make our snapshot
 * permanently disagree with the Search Console UI.
 */
export const DATA_LAG_DAYS = 3;

export function latestUsableDay(now: Date): string {
  return new Date(now.getTime() - DATA_LAG_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/* ========================================================================== *
 * Retry / failure policy
 * ========================================================================== */

export type BatchOutcome =
  | { action: "continue" }
  | { action: "retry"; afterSeconds: number; reason: string }
  | { action: "stop"; reason: string; code: "forbidden" | "unauthorized" | "invalid" | "fatal" };

export const MAX_ATTEMPTS = 4;
export const BASE_BACKOFF_SECONDS = 2;
export const MAX_BACKOFF_SECONDS = 300;

/** RFC 7231: `Retry-After` is either delta-seconds or an HTTP date. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(MAX_BACKOFF_SECONDS, Number(trimmed));
  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return null;
  return Math.min(MAX_BACKOFF_SECONDS, Math.max(0, Math.ceil((when - now) / 1000)));
}

/** Deterministic exponential backoff; jitter is applied by the caller. */
export function backoffSeconds(attempt: number): number {
  return Math.min(MAX_BACKOFF_SECONDS, BASE_BACKOFF_SECONDS * 2 ** Math.max(0, attempt - 1));
}

/**
 * Maps an HTTP status onto what the batch should do next.
 *
 * 403 stops the batch outright: with Search Console it means the connected
 * account lost access to the property. Continuing would burn quota on calls
 * that can only fail, and hide the real problem behind a rate-limit story.
 */
export function classifyResponse(
  status: number,
  headers: { get(name: string): string | null },
  attempt: number,
  now = Date.now(),
): BatchOutcome {
  if (status >= 200 && status < 300) return { action: "continue" };
  if (status === 401) {
    return { action: "stop", code: "unauthorized", reason: "The Google connection expired. Reconnect to resume." };
  }
  if (status === 403) {
    return {
      action: "stop",
      code: "forbidden",
      reason: "This Google account no longer has access to the selected property.",
    };
  }
  if (status === 404) {
    return { action: "stop", code: "invalid", reason: "The selected Search Console property no longer exists." };
  }
  if (status === 429 || status >= 500) {
    if (attempt >= MAX_ATTEMPTS) {
      return {
        action: "stop",
        code: "fatal",
        reason:
          status === 429
            ? "Google is rate limiting this project. The next scheduled run will retry."
            : "Google Search Console is unavailable. The next scheduled run will retry.",
      };
    }
    const retryAfter = parseRetryAfter(headers.get("retry-after"), now);
    return {
      action: "retry",
      afterSeconds: retryAfter ?? backoffSeconds(attempt),
      reason: status === 429 ? "rate_limited" : "upstream_unavailable",
    };
  }
  return { action: "stop", code: "invalid", reason: `Google rejected the request (HTTP ${status}).` };
}

/** Plain-language banner text for the dashboard — never a raw provider error. */
export function humaniseFailure(code: string): { en: string; bn: string; action: "reconnect" | "retry" | "fix" } {
  switch (code) {
    case "unauthorized":
      return {
        en: "The Google connection expired. Reconnect to keep search data flowing.",
        bn: "গুগল সংযোগের মেয়াদ শেষ হয়েছে। সার্চ ডেটা চালু রাখতে আবার সংযোগ করুন।",
        action: "reconnect",
      };
    case "forbidden":
      return {
        en: "This account lost access to the connected property. Reconnect with an account that owns it.",
        bn: "এই অ্যাকাউন্টের প্রোপার্টিতে অ্যাক্সেস নেই। মালিক অ্যাকাউন্ট দিয়ে আবার সংযোগ করুন।",
        action: "reconnect",
      };
    case "invalid":
      return {
        en: "The selected property is no longer valid. Choose a property again.",
        bn: "নির্বাচিত প্রোপার্টি আর বৈধ নয়। আবার একটি প্রোপার্টি বেছে নিন।",
        action: "fix",
      };
    default:
      return {
        en: "Search data could not be refreshed. The next scheduled run will retry.",
        bn: "সার্চ ডেটা রিফ্রেশ করা যায়নি। পরের নির্ধারিত রানে আবার চেষ্টা হবে।",
        action: "retry",
      };
  }
}

/* ========================================================================== *
 * Sitemap submission policy
 * ========================================================================== */

/**
 * Submission happens on change, never on a schedule: Google explicitly treats
 * repeated resubmission of an unchanged sitemap as noise. We debounce to one
 * submission per URL per day, and only when the content fingerprint moved.
 */
export const SITEMAP_SUBMIT_MIN_INTERVAL_MS = 24 * 3_600_000;

export function shouldSubmitSitemap(input: {
  sitemapUrl: string;
  lastSubmittedUrl: string | null;
  lastSubmittedAt: string | null;
  changed: boolean;
  now?: number;
}): { submit: boolean; reason: string } {
  if (!input.sitemapUrl) return { submit: false, reason: "no_sitemap_url" };
  if (input.lastSubmittedUrl !== input.sitemapUrl) return { submit: true, reason: "new_sitemap_url" };
  if (!input.changed) return { submit: false, reason: "unchanged" };
  const last = input.lastSubmittedAt ? Date.parse(input.lastSubmittedAt) : Number.NaN;
  const now = input.now ?? Date.now();
  if (Number.isFinite(last) && now - last < SITEMAP_SUBMIT_MIN_INTERVAL_MS) {
    return { submit: false, reason: "debounced" };
  }
  return { submit: true, reason: "changed" };
}

/* ========================================================================== *
 * URL inspection
 * ========================================================================== */

export type UrlInspection = {
  url: string;
  verdict: "indexed" | "not_indexed" | "excluded" | "unknown";
  coverageState: string;
  lastCrawled: string | null;
  canonicalGoogle: string | null;
  canonicalUser: string | null;
  robotsState: string | null;
  /** Honest label — this is Google's index record, not a live fetch. */
  disclaimer: string;
};

export function readInspection(payload: unknown, url: string): UrlInspection {
  const result = (payload as { inspectionResult?: { indexStatusResult?: Record<string, unknown> } })
    ?.inspectionResult?.indexStatusResult;
  const coverageState = String(result?.["coverageState"] ?? "Unknown");
  const verdictRaw = String(result?.["verdict"] ?? "").toUpperCase();
  const verdict: UrlInspection["verdict"] =
    verdictRaw === "PASS"
      ? "indexed"
      : verdictRaw === "NEUTRAL"
        ? "excluded"
        : verdictRaw === "FAIL"
          ? "not_indexed"
          : "unknown";
  return {
    url,
    verdict,
    coverageState,
    lastCrawled: (result?.["lastCrawlTime"] as string | undefined) ?? null,
    canonicalGoogle: (result?.["googleCanonical"] as string | undefined) ?? null,
    canonicalUser: (result?.["userCanonical"] as string | undefined) ?? null,
    robotsState: (result?.["robotsTxtState"] as string | undefined) ?? null,
    disclaimer: "This is what Google has already indexed — not a live test and not a re-crawl request.",
  };
}
