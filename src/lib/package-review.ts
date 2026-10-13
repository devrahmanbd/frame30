/**
 * Threat-defense — package content review signals (pure).
 *
 * Small, dependency-free helpers that turn package bytes into reviewable
 * facts for consent screens, scan reports, and audit rows. No I/O, no
 * database, no network — safe to run anywhere, including the browser.
 */

export type ReviewFile = {
  path: string;
  bytes: Uint8Array;
};

const TEXT_EXTS = new Set([
  ".json",
  ".css",
  ".html",
  ".htm",
  ".svg",
  ".txt",
  ".md",
  ".js",
  ".liquid",
]);

function isReviewableText(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return path === "theme.json" || path === "plugin.json";
  return TEXT_EXTS.has(path.slice(dot).toLowerCase());
}

const URL_RE = /https?:\/\/[^\s"'<>()\\]+/gi;

function cleanUrl(raw: string): string | null {
  // Trailing punctuation from prose/JSON contexts is not part of the URL.
  const url = raw.replace(/[.,;:!?)\]]+$/, "");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Where an inventoried external URL was found. `templates` covers the
 * package/template file bytes (first input); `tokens` covers the tokens
 * JSON second input.
 */
export type ExternalUrlSource = "templates" | "tokens";

export type InventoriedExternalUrl = {
  url: string;
  sources: ExternalUrlSource[];
};

function collectUrls(
  text: string,
  into: Map<string, Set<ExternalUrlSource>>,
  source: ExternalUrlSource,
): void {
  URL_RE.lastIndex = 0;
  for (const match of text.matchAll(URL_RE)) {
    const clean = cleanUrl(match[0]);
    if (!clean) continue;
    let set = into.get(clean);
    if (!set) {
      set = new Set<ExternalUrlSource>();
      into.set(clean, set);
    }
    set.add(source);
  }
}

function tokensBlob(tokens: unknown): string {
  if (tokens === undefined || tokens === null) return "";
  if (typeof tokens === "string") return tokens;
  try {
    const raw = JSON.stringify(tokens);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

/**
 * Sorted unique inventoried external URLs with per-URL source labels.
 * Files contribute under `templates`, the optional tokens JSON under
 * `tokens`; a URL found in both carries both sources. Never throws —
 * undecodable files and unserializable tokens scan as empty.
 */
export function inventoryExternalUrlsDetailed(
  files: ReviewFile[],
  tokens?: unknown,
): InventoriedExternalUrl[] {
  const seen = new Map<string, Set<ExternalUrlSource>>();
  for (const file of files) {
    if (!isReviewableText(file.path)) continue;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    } catch {
      continue;
    }
    collectUrls(text, seen, "templates");
  }
  const blob = tokensBlob(tokens);
  if (blob) collectUrls(blob, seen, "tokens");
  return [...seen.entries()]
    .map(([url, sources]) => ({
      url,
      sources: [...sources].sort() as ExternalUrlSource[],
    }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

/**
 * Sorted unique absolute http(s) URLs across package text files, with an
 * optional tokens JSON merged into the SAME set. Binary assets, relative
 * refs, and non-http schemes are never reported.
 *
 * The return shape stays `string[]`: consent screens (`InstallConsent`)
 * and audit rows read plain URL strings, so source labels live in
 * `inventoryExternalUrlsDetailed` instead of here.
 */
export function inventoryExternalUrls(
  files: ReviewFile[],
  tokens?: unknown,
): string[] {
  return inventoryExternalUrlsDetailed(files, tokens).map((entry) => entry.url);
}

/* --------------------------------------- capability signals + diff */

export type CapabilitySignals = {
  /** Plugin manifest permissions. */
  permissions: string[];
  /** Theme template external-URL hosts. */
  externalHosts: string[];
  /** Theme carries custom-HTML sections with actual content. */
  customHtml: boolean;
};

export type CapabilityDiff = {
  widened: boolean;
  added: string[];
  removed: string[];
};

/**
 * Consent coverage for a widening diff: every added item must appear in the
 * caller-supplied consent list by exact match. Absent list covers nothing.
 */
export function coversWidening(
  added: string[],
  consentScopes?: string[],
): boolean {
  if (added.length === 0) return true;
  const granted = new Set(consentScopes ?? []);
  return added.every((a) => granted.has(a));
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function hasNonEmptyString(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasNonEmptyString);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      hasNonEmptyString,
    );
  }
  return false;
}

function walkSections(
  node: unknown,
  visit: (section: Record<string, unknown>) => void,
): void {
  if (Array.isArray(node)) {
    for (const item of node) walkSections(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.type === "string") visit(rec);
    for (const value of Object.values(rec)) walkSections(value, visit);
  }
}

/**
 * Theme capability signals from parsed templates: external hosts behind
 * template URLs plus custom-HTML presence. Pure — runs on installed rows
 * and incoming payloads alike.
 */
export function themeSignals(templates: unknown): {
  externalHosts: string[];
  customHtml: boolean;
} {
  let blob = "";
  try {
    blob = JSON.stringify(templates);
  } catch {
    blob = "";
  }
  const hosts = new Set<string>();
  URL_RE.lastIndex = 0;
  for (const match of blob.matchAll(URL_RE)) {
    const clean = cleanUrl(match[0]);
    if (!clean) continue;
    const host = hostOf(clean);
    if (host) hosts.add(host);
  }
  let customHtml = false;
  walkSections(templates, (section) => {
    if (
      section.type === "html" &&
      hasNonEmptyString((section.props ?? {}) as unknown)
    ) {
      customHtml = true;
    }
  });
  return { externalHosts: [...hosts].sort(), customHtml };
}

/**
 * Update widening check: added permissions (plugins), added external hosts
 * and custom-HTML arrival (themes). Removals alone never widen. Added items
 * use literal vocabularies — `perm:<scope>`, `url:<host>`, `custom-html` —
 * so a consent list covers them by exact match, never heuristics.
 */
export function diffCapabilities(
  oldS: CapabilitySignals,
  newS: CapabilitySignals,
): CapabilityDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const oldPerms = new Set(oldS.permissions ?? []);
  const newPerms = new Set(newS.permissions ?? []);
  for (const p of newPerms) if (!oldPerms.has(p)) added.push(`perm:${p}`);
  for (const p of oldPerms) if (!newPerms.has(p)) removed.push(`perm:${p}`);
  const oldHosts = new Set(oldS.externalHosts ?? []);
  const newHosts = new Set(newS.externalHosts ?? []);
  for (const h of newHosts) if (!oldHosts.has(h)) added.push(`url:${h}`);
  for (const h of oldHosts) if (!newHosts.has(h)) removed.push(`url:${h}`);
  if (newS.customHtml && !oldS.customHtml) added.push("custom-html");
  added.sort();
  removed.sort();
  return { widened: added.length > 0, added, removed };
}

/* ----------------- no-plugin-territory trust gates (C6 reasons 1-4) --------

  Mechanical half of the human review policy (`docs/developers/review-policy.md`
  §1): themes present the storefront and must never take over platform-owned
  work. These four detectors refuse ACTION patterns only — display copy such
  as "Cash on Delivery" labels, wallet brand names, or account-link labels
  never fires. Pure: strings are scanned directly, every other value is
  JSON-stringified first, so package files, parsed templates, and manifest
  text all run through the same patterns.

  Stable machine codes (`no-plugin-territory.*`) shared by the install lane
  (`scanPackage`), the manifest gate (`validateThemeManifest`), and the
  publish gate (`composePublishGate`). */

export type ThemeTrustCode =
  | "no-plugin-territory.payments"
  | "no-plugin-territory.tracking-pixel"
  | "no-plugin-territory.auth-form"
  | "no-plugin-territory.seo-write";

export type ThemeTrustFinding = {
  code: ThemeTrustCode;
  detail: string;
};

/**
 * `PaymentRequest` constructor / `paymentRequest(` calls. Display copy names
 * wallets ("bKash, Nagad…"), never this API, so the token alone is precise.
 */
const PAYMENT_REQUEST_RE = /\bPaymentRequest\b|paymentRequest\s*\(/;

/**
 * Wallet / payment deeplink schemes (`bkash://…`). The `://` is required:
 * bare brand names ("Pay with bKash") and https links stay passing.
 */
const WALLET_SCHEME_RE =
  /\b(bkash|nagad|rocket|upay|sslcommerz|shurjopay|amarpay|stripe|paypal|razorpay)\s*:\/\//i;

/** A literal `<form` tag — executable position for collection markers. */
const FORM_TAG_RE = /<\s*form\b/i;

/**
 * Payment-field markers. Gated behind `FORM_TAG_RE`: the same words as
 * display copy ("card", "account") never fire on their own.
 */
const PAYMENT_FIELD_RE =
  /\b(card[_-]?number|card[_-]?num|credit[_-]?card|debit[_-]?card|cvv2?|cvc2?|card[_-]?exp|expir(y|ation)|cardholder|card[_-]?token|payment[_-]?token|stripe[_-]?token|bank[_-]?account|account[_-]?number|routing[_-]?number)\b/i;

/** True when theme content prices or charges (C6 reason 1). */
export function hasPaymentCollectionMarkers(text: string): boolean {
  if (PAYMENT_REQUEST_RE.test(text)) return true;
  if (WALLET_SCHEME_RE.test(text)) return true;
  // Forms are the only executable position themes have: a form carrying
  // payment fields collects money, whatever its action is. Display copy
  // never contains a literal `<form` tag, so requiring both is precise.
  if (FORM_TAG_RE.test(text) && PAYMENT_FIELD_RE.test(text)) return true;
  return false;
}

const IMG_TAG_RE = /<\s*img\b[^>]*>/gi;
/** `width="1"` / `height="1"` (exact — `10`, `100`, `1%` never match). */
const HIDDEN_STYLE_RE =
  /style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(\.0*)?)/i;
const HIDDEN_ATTR_RE = /<\s*img\b[^>]*\bhidden\b/i;

/**
 * Pixel-specific hosts: analytics / ad-pixel endpoints only. Broad social
 * hosts (`facebook.com`, `tiktok.com`) are deliberately absent — a theme
 * linking the merchant's Facebook page is legitimate. Subdomains match via
 * suffix, so `sub.connect.facebook.net` is covered too.
 */
const KNOWN_PIXEL_HOSTS = [
  "connect.facebook.net",
  "google-analytics.com",
  "googletagmanager.com",
  "googlesyndication.com",
  "doubleclick.net",
  "hotjar.com",
  "hotjar.io",
  "mixpanel.com",
  "segment.com",
  "segment.io",
  "amplitude.com",
  "analytics.tiktok.com",
  "tr.snapchat.com",
  "sc-static.net",
  "ct.pinterest.com",
  "px.ads.linkedin.com",
  "analytics.twitter.com",
  "static.ads-twitter.com",
  "pixel.reddit.com",
  "criteo.com",
  "quantserve.com",
  "scorecardresearch.com",
  "taboola.com",
  "outbrain.com",
  "mouseflow.com",
  "crazyegg.com",
  "luckyorange.com",
  "fullstory.com",
  "mc.yandex.ru",
  "hm.baidu.com",
  "bat.bing.com",
  "clarity.ms",
];

function isPixelHost(host: string): boolean {
  const lower = host.toLowerCase();
  return KNOWN_PIXEL_HOSTS.some(
    (known) => lower === known || lower.endsWith(`.${known}`),
  );
}

function hasPixelMarkup(text: string): boolean {
  IMG_TAG_RE.lastIndex = 0;
  for (const match of text.matchAll(IMG_TAG_RE)) {
    const tag = match[0];
    // A 1x1 (or 0x0) image, or any image hidden from shoppers, is a
    // tracking pixel: pixel-sized images with a display purpose are
    // merchant-visible anyway, so outright refusal has no legit cost.
    // Attribute values must be exactly 0/1 — `10`, `100`, `1%` pass.
    const widthAttr = tag.match(/\bwidth\s*=\s*["']?(\d+)(?=["'\s/>]|$)/i)?.[1];
    const heightAttr = tag.match(
      /\bheight\s*=\s*["']?(\d+)(?=["'\s/>]|$)/i,
    )?.[1];
    const tinyAttr =
      (widthAttr === "0" || widthAttr === "1") &&
      (heightAttr === "0" || heightAttr === "1");
    const tinyStyle =
      /width\s*:\s*(0|1)px/i.test(tag) && /height\s*:\s*(0|1)px/i.test(tag);
    if (tinyAttr || tinyStyle) return true;
    if (HIDDEN_STYLE_RE.test(tag) || HIDDEN_ATTR_RE.test(tag)) return true;
  }
  return false;
}

/** True when theme content carries a tracking pixel (C6 reason 3). */
export function hasTrackingPixelMarkers(text: string): boolean {
  if (hasPixelMarkup(text)) return true;
  URL_RE.lastIndex = 0;
  for (const match of text.matchAll(URL_RE)) {
    const clean = cleanUrl(match[0]);
    if (!clean) continue;
    const host = hostOf(clean);
    if (host && isPixelHost(host)) return true;
  }
  return false;
}

/** Password-type inputs never belong in theme content (platform owns auth). */
const PASSWORD_INPUT_RE = /<\s*input\b[^>]*\btype\s*=\s*["']?password\b/i;
/** Password/credential prop keys smuggled into raw template JSON. */
const PASSWORD_PROP_RE =
  /"[A-Za-z-]*(password|passwd|credential)[A-Za-z-]*"\s*:/i;
/** `<form>…</form>` bodies — the only form positions themes can smuggle. */
const FORM_BLOCK_RE = /<\s*form\b[^>]*>([\s\S]*?)<\/\s*form\s*>/gi;
const PASSWORD_WORD_RE = /\bpassword\b/i;
const AUTH_WORD_RE =
  /\b(signin|sign-in|sign_in|signup|sign-up|sign_up|login|log-in|log_in|register|registration|credential|credentials|auth|authentication|otp)\b/i;
const IDENTITY_FIELD_RE =
  /\b(e-?mail|username|user[_-]?name|phone|mobile|otp)\b/i;

/** True when theme content collects credentials (C6 reason 4). */
export function hasAuthFormMarkers(text: string): boolean {
  if (PASSWORD_INPUT_RE.test(text)) return true;
  if (PASSWORD_PROP_RE.test(text)) return true;
  FORM_BLOCK_RE.lastIndex = 0;
  for (const match of text.matchAll(FORM_BLOCK_RE)) {
    const body = match[1] ?? "";
    if (PASSWORD_WORD_RE.test(body)) return true;
    // An auth-labelled form collecting identity fields is sign-in, not
    // marketing: newsletter/contact widgets carry no `<form>` block, so
    // requiring the block keeps email-only widgets passing.
    if (AUTH_WORD_RE.test(body) && IDENTITY_FIELD_RE.test(body)) return true;
  }
  return false;
}

/** Theme packages must never reference the merchant-owned table. */
const SEO_META_RE = /\bseo_meta\b/i;

/** True when package content touches `seo_meta` rows (C6 reason 2). */
export function hasSeoWriteMarkers(text: string): boolean {
  return SEO_META_RE.test(text);
}

function trustTextOf(input: unknown): string {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    try {
      const raw = JSON.stringify(input);
      if (typeof raw !== "string") return "";
      text = raw;
    } catch {
      return "";
    }
  }
  // JSON-encoded blobs escape quotes (`\"`) and slashes (`\/`) — raw file
  // text carries the same escapes, and wrapping texts in an array escapes
  // them twice; detection runs on the underlying markup in all cases, so
  // unescape to a fixpoint. Detection-only — the scanned content is never
  // modified.
  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/\\"/g, '"').replace(/\\\//g, "/");
    if (next === out) break;
    out = next;
  }
  return out;
}

const TRUST_MESSAGES: Record<ThemeTrustCode, string> = {
  "no-plugin-territory.payments":
    "no-plugin-territory: theme content collects payments — pricing and charging belong to the platform.",
  "no-plugin-territory.tracking-pixel":
    "no-plugin-territory: theme content carries a tracking pixel — third-party exfiltration needs merchant consent.",
  "no-plugin-territory.auth-form":
    "no-plugin-territory: theme content collects credentials — sign-in belongs to the platform.",
  "no-plugin-territory.seo-write":
    "no-plugin-territory: theme content writes seo_meta rows — search metadata is merchant-owned.",
};

/**
 * All four C6 content gates over one blob: raw file text, parsed templates,
 * or a manifest object. Never throws; unserializable input scans as empty.
 * Empty findings = clean.
 */
export function scanThemeTrustContent(input: unknown): ThemeTrustFinding[] {
  const text = trustTextOf(input);
  if (!text) return [];
  const findings: ThemeTrustFinding[] = [];
  if (hasPaymentCollectionMarkers(text)) {
    findings.push({
      code: "no-plugin-territory.payments",
      detail: TRUST_MESSAGES["no-plugin-territory.payments"],
    });
  }
  if (hasTrackingPixelMarkers(text)) {
    findings.push({
      code: "no-plugin-territory.tracking-pixel",
      detail: TRUST_MESSAGES["no-plugin-territory.tracking-pixel"],
    });
  }
  if (hasAuthFormMarkers(text)) {
    findings.push({
      code: "no-plugin-territory.auth-form",
      detail: TRUST_MESSAGES["no-plugin-territory.auth-form"],
    });
  }
  if (hasSeoWriteMarkers(text)) {
    findings.push({
      code: "no-plugin-territory.seo-write",
      detail: TRUST_MESSAGES["no-plugin-territory.seo-write"],
    });
  }
  return findings;
}
