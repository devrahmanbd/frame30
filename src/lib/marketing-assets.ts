/**
 * Phase 10.5 — the marketing asset contract (TODO §10.5).
 *
 * §10.3 made geometry machine-checkable and §10.4 did the same for motion.
 * This module closes the set for the *bytes*: the UI stills, the icon sprite
 * and the per-route Open Graph cards. Three bullets in TODO §10.5 become three
 * registries and six pure auditors here, so the build script, the React
 * components, the gate and the unit tests all quote one set of numbers.
 *
 *   1. "UI stills: 2x crops of the real admin, AVIF + WebP, explicit dimensions."
 *      → `UI_STILLS` declares the capture recipe (route, selector, viewport)
 *        *and* the rendered contract (intrinsic 2x size, display width, alt in
 *        both locales). `scripts/capture-ui-stills.mjs` produces the files from
 *        the recipe; `auditStills` judges what the browser actually rendered.
 *        A still is never a stock mock: the recipe names a real admin URL, and
 *        a capture that could not authenticate is reported as a *skip*, never
 *        silently replaced with a placeholder.
 *
 *   2. "Icon set: single local lucide sprite, `aria-label` per standalone mark."
 *      → `ICON_NAMES` is the sprite manifest. One local file, no per-icon
 *        network request, no runtime import of an icon library into the public
 *        bundle. `auditIcons` fails an icon that is decorative-but-labelled or
 *        standalone-but-anonymous, because both are real screen-reader bugs.
 *
 *   3. "One OG image per route on the dark canvas, absolute https URL, wired
 *      only in the leaf `head()` — never on `__root`."
 *      → `OG_CARDS` declares one card per registered marketing route, rendered
 *        deterministically by `scripts/build-og-images.mjs` from the SEO
 *        registry's own copy, so a title edit cannot leave a stale card behind.
 *        `auditOpenGraph` enforces absolute https, exact 1200×630, byte budget
 *        and the leaf-only rule.
 *
 * Purity: no React, no DOM, no `process`, no network. It is imported by route
 * `head()` (via `marketing-seo.ts`), by two build scripts, by the gate and by
 * `marketing-assets.test.ts`. The type-only import of `MarketingRouteId` keeps
 * the runtime edge one-directional (seo → assets), so there is no cycle.
 *
 * Severity policy, inherited from the rhythm and motion gates: `error` is for
 * something a visitor or a crawler can observe as broken — a 404 asset, a
 * missing OG card, an unlabelled standalone icon, an image with no intrinsic
 * dimensions (which is a layout shift with a delay fuse). `warn` is for budget
 * and quality drift — a still shipped at 1.4x, a card 40KB over budget. Gates
 * that block on aesthetics get switched off, and a switched-off gate protects
 * nothing.
 */
import type { MarketingRouteId } from "./marketing-seo";

/* -------------------------------------------------------------------------- */
/* Spec                                                                       */
/* -------------------------------------------------------------------------- */

/** Where built assets live under `public/`. Kept in one place for the scripts. */
export const ASSET_ROOT = "/media";
export const STILL_DIR = `${ASSET_ROOT}/stills`;
export const OG_DIR = `${ASSET_ROOT}/og`;
export const ICON_DIR = `${ASSET_ROOT}/icons`;
export const SPRITE_PATH = `${ICON_DIR}/sprite.svg`;

export const STILLS = {
  /** Capture density. A 1x screenshot on a 2x screen is visibly mushy. */
  dpr: 2,
  /**
   * Tolerance on the density check. A crop is measured as
   * `naturalWidth / displayWidth`; sub-pixel layout and a responsive column
   * make that ratio wobble, so anything at or above 1.8 counts as 2x.
   */
  minDensity: 1.8,
  /** Modern formats, most-preferred first. The last entry is the fallback. */
  formats: ["avif", "webp", "png"] as const,
  /** Per-format byte budgets for a single still. */
  maxBytes: { avif: 180_000, webp: 260_000, png: 900_000 } as const,
  /** Alt text shorter than this is decoration pretending to be information. */
  minAltChars: 12,
  /** …and longer than this is a caption in the wrong slot. */
  maxAltChars: 160,
} as const;

export const OG = {
  width: 1200,
  height: 630,
  /** Twitter's large card and Facebook both reject cards over ~5MB; we aim far lower. */
  maxBytes: 320_000,
  /** Rendered PNG is the wire format: every scraper reads it, AVIF is not safe here. */
  format: "png" as const,
} as const;

export const ICONS = {
  /** The whole sprite, gzipped by the edge; a fat sprite is a render blocker. */
  maxBytes: 48_000,
  /** lucide's canonical grid. A symbol on another grid renders at the wrong weight. */
  viewBox: "0 0 24 24",
} as const;

/** Assets a page may request that are not ours to budget (analytics pixels…). */
export const REQUEST_IGNORE = [/^data:/, /^blob:/, /\/@vite\//, /\/@react-refresh/];

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

export type AssetSeverity = "error" | "warn" | "info";

export type AssetFindingCode =
  // stills
  | "asset.still.unknown"
  | "asset.still.broken"
  | "asset.still.missing_dimensions"
  | "asset.still.dimension_mismatch"
  | "asset.still.no_modern_format"
  | "asset.still.density"
  | "asset.still.alt_missing"
  | "asset.still.alt_length"
  | "asset.still.loading_priority"
  | "asset.still.oversize"
  // icons
  | "asset.icon.sprite_missing"
  | "asset.icon.not_sprited"
  | "asset.icon.label_missing"
  | "asset.icon.label_redundant"
  | "asset.icon.unknown_symbol"
  | "asset.icon.sprite_oversize"
  // open graph
  | "asset.og.missing"
  | "asset.og.not_absolute"
  | "asset.og.unreachable"
  | "asset.og.dimensions"
  | "asset.og.oversize"
  | "asset.og.twitter_mismatch"
  | "asset.og.on_root"
  | "asset.og.alt_missing"
  // requests
  | "asset.request.not_found"
  | "asset.request.error"
  | "asset.request.oversize"
  | "asset.request.wrong_type"
  // harness
  | "asset.harness.no_samples";

export type AssetFinding = {
  code: AssetFindingCode;
  severity: AssetSeverity;
  /** Route + surface, e.g. `/features · still:admin-orders`. */
  where: string;
  message: string;
  detail?: Record<string, unknown>;
};

const finding = (
  code: AssetFindingCode,
  severity: AssetSeverity,
  where: string,
  message: string,
  detail?: Record<string, unknown>,
): AssetFinding => ({ code, severity, where, message, ...(detail ? { detail } : {}) });

export function formatAssetFinding(f: AssetFinding) {
  const label = f.severity === "error" ? "FAIL" : f.severity === "warn" ? "WARN" : "INFO";
  return `${label} [${f.code}] ${f.where}: ${f.message}`;
}

/** Collapses the same code+where+message repeated across widths and locales. */
export function dedupeAssetFindings(findings: AssetFinding[]) {
  const seen = new Map<string, AssetFinding>();
  for (const f of findings) {
    const key = `${f.code}|${f.where}|${f.message}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}

export function countAssetsBySeverity(findings: AssetFinding[]) {
  return findings.reduce(
    (acc, f) => ({ ...acc, [f.severity]: acc[f.severity] + 1 }),
    { error: 0, warn: 0, info: 0 } as Record<AssetSeverity, number>,
  );
}

/* -------------------------------------------------------------------------- */
/* UI stills registry                                                         */
/* -------------------------------------------------------------------------- */

export type Bilingual = { en: string; bn: string };

export type StillCapture = {
  /** Real in-app URL. Never a mock route: §10.5 says "the real admin". */
  path: string;
  /** Element to crop. Falls back to the viewport when the node is absent. */
  selector: string;
  /** CSS viewport for the capture; the file is written at `STILLS.dpr` times this. */
  viewport: { width: number; height: number };
  /** Optional selector that must exist before the shot (data loaded, not skeleton). */
  waitFor?: string;
  /** Authenticated admin surfaces need a session; public ones do not. */
  auth: "admin" | "public";
  /** Selectors blurred before the shot — never ship a real merchant's PII. */
  redact?: readonly string[];
};

export type UiStill = {
  id: string;
  /** File base name under `STILL_DIR`, without extension. */
  file: string;
  alt: Bilingual;
  /** Intrinsic pixel size of the written file (already `STILLS.dpr` scaled). */
  intrinsic: { width: number; height: number };
  /** CSS width the layout gives it at the widest breakpoint. Drives `sizes`. */
  displayWidth: number;
  /** Above the fold on its page? Drives eager/lazy and fetchpriority. */
  priority: boolean;
  capture: StillCapture;
};

const still = (
  id: string,
  alt: Bilingual,
  capture: StillCapture,
  opts: { displayWidth?: number; priority?: boolean } = {},
): UiStill => ({
  id,
  file: id,
  alt,
  intrinsic: {
    width: capture.viewport.width * STILLS.dpr,
    height: capture.viewport.height * STILLS.dpr,
  },
  displayWidth: opts.displayWidth ?? capture.viewport.width,
  priority: opts.priority ?? false,
  capture,
});

/**
 * The stills the marketing pages are allowed to show. Adding a screenshot to a
 * route means adding a row here first — that is what keeps every image on the
 * site traceable to a real admin URL and a real capture recipe.
 */
export const UI_STILLS: readonly UiStill[] = [
  still(
    "admin-orders",
    {
      en: "Framique admin order desk: a filtered order list with COD status, courier and payment columns.",
      bn: "ফ্রেমিক অ্যাডমিন অর্ডার ডেস্ক: সিওডি স্ট্যাটাস, কুরিয়ার ও পেমেন্ট কলামসহ ফিল্টার করা অর্ডার তালিকা।",
    },
    {
      path: "/admin/orders",
      selector: "main",
      viewport: { width: 1280, height: 800 },
      waitFor: "table, [data-testid='orders-table']",
      auth: "admin",
      redact: ["[data-pii]", "[data-customer-email]"],
    },
    { displayWidth: 1120 },
  ),
  still(
    "admin-builder",
    {
      en: "Framique theme builder: section tree, live canvas and the style inspector open on a hero block.",
      bn: "ফ্রেমিক থিম বিল্ডার: সেকশন ট্রি, লাইভ ক্যানভাস এবং হিরো ব্লকের স্টাইল ইন্সপেক্টর খোলা।",
    },
    {
      path: "/admin/builder",
      selector: "main",
      viewport: { width: 1440, height: 860 },
      auth: "admin",
    },
    { displayWidth: 1120, priority: true },
  ),
  still(
    "admin-payments",
    {
      en: "Framique payments desk: gateway health, settlement batches and reconciliation exceptions.",
      bn: "ফ্রেমিক পেমেন্টস ডেস্ক: গেটওয়ে হেলথ, সেটলমেন্ট ব্যাচ ও রিকনসিলিয়েশন ব্যতিক্রম।",
    },
    {
      path: "/admin/payments",
      selector: "main",
      viewport: { width: 1280, height: 760 },
      auth: "admin",
    },
  ),
  still(
    "admin-fulfilment",
    {
      en: "Framique fulfilment board: courier assignment, pickup batches and delivery SLA counters.",
      bn: "ফ্রেমিক ফুলফিলমেন্ট বোর্ড: কুরিয়ার অ্যাসাইনমেন্ট, পিকআপ ব্যাচ ও ডেলিভারি এসএলএ কাউন্টার।",
    },
    {
      path: "/admin/returns",
      selector: "main",
      viewport: { width: 1280, height: 760 },
      auth: "admin",
    },
  ),
  still(
    "admin-customers",
    {
      en: "Framique customer profile: order history, segment membership and support conversation timeline.",
      bn: "ফ্রেমিক কাস্টমার প্রোফাইল: অর্ডার ইতিহাস, সেগমেন্ট সদস্যপদ ও সাপোর্ট আলাপের টাইমলাইন।",
    },
    {
      path: "/admin/customers",
      selector: "main",
      viewport: { width: 1280, height: 760 },
      auth: "admin",
      redact: ["[data-pii]"],
    },
  ),
  still(
    "admin-security",
    {
      en: "Framique security settings: staff roles, scoped permissions and the audit log of privileged actions.",
      bn: "ফ্রেমিক সিকিউরিটি সেটিংস: স্টাফ রোল, স্কোপড পারমিশন ও প্রিভিলেজড অ্যাকশনের অডিট লগ।",
    },
    {
      path: "/admin/settings",
      selector: "main",
      viewport: { width: 1280, height: 760 },
      auth: "admin",
    },
  ),
  still(
    "storefront-mobile",
    {
      en: "A Framique storefront on a phone: Bangla product titles, cash-on-delivery badge and a sticky buy bar.",
      bn: "ফোনে ফ্রেমিক স্টোরফ্রন্ট: বাংলা পণ্যের নাম, ক্যাশ-অন-ডেলিভারি ব্যাজ ও স্টিকি বাই বার।",
    },
    {
      path: "/",
      selector: "body",
      viewport: { width: 390, height: 844 },
      auth: "public",
    },
    { displayWidth: 390 },
  ),
] as const;

const STILL_BY_ID = new Map(UI_STILLS.map((s) => [s.id, s]));

export function uiStill(id: string): UiStill {
  const found = STILL_BY_ID.get(id);
  if (!found) throw new Error(`marketing-assets: unknown still "${id}"`);
  return found;
}

export function stillSource(still: UiStill, format: (typeof STILLS.formats)[number]) {
  return `${STILL_DIR}/${still.file}.${format}`;
}

/** `<source>` list for a `<picture>`, modern formats first, fallback last. */
export function stillSources(still: UiStill) {
  return STILLS.formats.map((format) => ({
    format,
    type: format === "png" ? "image/png" : `image/${format}`,
    src: stillSource(still, format),
    fallback: format === "png",
  }));
}

/**
 * `sizes` for a still. The layout gives it `displayWidth` at the widest
 * breakpoint and the full gutter-inset viewport below that; saying so lets the
 * browser pick a variant instead of downloading the largest one.
 */
export function stillSizes(still: UiStill) {
  return `(min-width: ${still.displayWidth + 80}px) ${still.displayWidth}px, calc(100vw - 40px)`;
}

/* -------------------------------------------------------------------------- */
/* Icon sprite registry                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every mark the marketing surface may draw. One local sprite, built from
 * lucide at build time by `scripts/build-icon-sprite.mjs`, referenced with
 * `<use href="…#name">`. Adding an icon to a band means adding its name here,
 * rebuilding the sprite and letting the gate confirm the symbol exists.
 */
export const ICON_NAMES = [
  "arrow-right",
  "arrow-up-right",
  "banknote",
  "boxes",
  "check",
  "chevron-down",
  "circle-alert",
  "clock",
  "credit-card",
  "external-link",
  "gauge",
  "globe",
  "layers",
  "lock",
  "mail",
  "map-pin",
  "message-circle",
  "package",
  "phone",
  "receipt",
  "refresh-cw",
  "search",
  "server",
  "shield-check",
  "smartphone",
  "sparkles",
  "store",
  "truck",
  "users",
  "zap",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const ICON_SET = new Set<string>(ICON_NAMES);

export function isIconName(value: string): value is IconName {
  return ICON_SET.has(value);
}

export function iconHref(name: IconName) {
  return `${SPRITE_PATH}#${name}`;
}

/* -------------------------------------------------------------------------- */
/* Open Graph card registry                                                   */
/* -------------------------------------------------------------------------- */

export type OgCard = {
  route: MarketingRouteId;
  /** Small kicker over the headline; the route's section in one word. */
  eyebrow: Bilingual;
  /**
   * Accent hue used for the single chroma element on the card. Kept as an HSL
   * triplet so the build script can render it into the dark-canvas template
   * without importing the app's stylesheet.
   */
  accent: string;
};

/** Signal blue — the same scarce chroma the site uses. */
const SIGNAL = "212 100% 62%";
const AURORA = "268 84% 68%";
const MINT = "162 74% 52%";
const AMBER = "38 96% 60%";

export const OG_CARDS: readonly OgCard[] = [
  { route: "home", eyebrow: { en: "Commerce platform", bn: "কমার্স প্ল্যাটফর্ম" }, accent: SIGNAL },
  { route: "features", eyebrow: { en: "Features", bn: "ফিচার" }, accent: SIGNAL },
  { route: "pricing", eyebrow: { en: "Pricing", bn: "মূল্য" }, accent: MINT },
  { route: "builder", eyebrow: { en: "Builder", bn: "বিল্ডার" }, accent: AURORA },
  { route: "payments", eyebrow: { en: "Payments", bn: "পেমেন্ট" }, accent: MINT },
  { route: "fulfilment", eyebrow: { en: "Fulfilment", bn: "ফুলফিলমেন্ট" }, accent: AMBER },
  { route: "customers", eyebrow: { en: "Customers", bn: "গ্রাহক" }, accent: SIGNAL },
  { route: "security", eyebrow: { en: "Security", bn: "নিরাপত্তা" }, accent: SIGNAL },
  { route: "about", eyebrow: { en: "About", bn: "আমাদের কথা" }, accent: AURORA },
  { route: "docs", eyebrow: { en: "Developers", bn: "ডেভেলপার" }, accent: SIGNAL },
  { route: "contact", eyebrow: { en: "Contact", bn: "যোগাযোগ" }, accent: AMBER },
  { route: "blog", eyebrow: { en: "Journal", bn: "জার্নাল" }, accent: AURORA },
  { route: "legal", eyebrow: { en: "Legal", bn: "আইনি" }, accent: SIGNAL },
  { route: "status", eyebrow: { en: "Status", bn: "স্ট্যাটাস" }, accent: MINT },
] as const;

const OG_BY_ROUTE = new Map<MarketingRouteId, OgCard>(OG_CARDS.map((c) => [c.route, c]));

export function ogCard(route: MarketingRouteId): OgCard | null {
  return OG_BY_ROUTE.get(route) ?? null;
}

/** Site-relative path of a route's card, or null when the route has none. */
export function ogAssetPath(route: MarketingRouteId): string | null {
  return OG_BY_ROUTE.has(route) ? `${OG_DIR}/${route}.${OG.format}` : null;
}

/** Alt text for the card. Scrapers show it when the image fails to load. */
export function ogAssetAlt(route: MarketingRouteId, title: string) {
  const card = ogCard(route);
  return card ? `${title} — ${card.eyebrow.en}, Framique` : `${title} — Framique`;
}

/* -------------------------------------------------------------------------- */
/* Measurement shapes                                                         */
/* -------------------------------------------------------------------------- */

/** One rendered `<img>` claiming to be a UI still, as the browser saw it. */
export type StillSample = {
  /** `data-still` id, or null when an image is not registry-backed. */
  id: string | null;
  currentSrc: string;
  alt: string | null;
  /** Author-declared attributes; missing means the attribute was absent. */
  attrWidth: number | null;
  attrHeight: number | null;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  loading: string | null;
  fetchPriority: string | null;
  /** Formats offered by sibling `<source>` elements. */
  offeredFormats: string[];
  /** Does the element intersect the first viewport? */
  aboveFold: boolean;
  /** Transferred bytes for `currentSrc`, when the network log knew. */
  bytes: number | null;
};

export type IconSample = {
  /** Symbol id after the `#`, or null for an inline (non-sprited) svg. */
  symbol: string | null;
  href: string | null;
  /** Standalone marks carry meaning; decorative ones sit beside a text label. */
  standalone: boolean;
  ariaLabel: string | null;
  ariaHidden: boolean;
  role: string | null;
};

export type OgSample = {
  route: MarketingRouteId | string;
  /** `og:image` content exactly as it was emitted. */
  ogImage: string | null;
  twitterImage: string | null;
  ogImageAlt: string | null;
  /** HEAD probe of the asset. Null when the probe itself could not run. */
  probe: { status: number; bytes: number | null; contentType: string | null } | null;
  /** Intrinsic size of the decoded card, when the gate decoded it. */
  intrinsic: { width: number; height: number } | null;
  /** True when the tag came from the shared root document rather than the leaf. */
  fromRoot: boolean;
};

export type RequestSample = {
  url: string;
  status: number;
  resourceType: string;
  contentType: string | null;
  bytes: number | null;
};

export type AssetPageMeasurement = {
  route: MarketingRouteId | string;
  url: string;
  width: number;
  locale: string;
  stills: StillSample[];
  icons: IconSample[];
  og: OgSample | null;
  requests: RequestSample[];
  /** Whether the sprite file itself resolved, and its size. */
  sprite: { ok: boolean; bytes: number | null; symbols: string[] } | null;
};

/* -------------------------------------------------------------------------- */
/* Auditors                                                                   */
/* -------------------------------------------------------------------------- */

const at = (m: { route: string | MarketingRouteId; width: number }, suffix: string) =>
  `${m.route} @${m.width} · ${suffix}`;

/**
 * TODO §10.5 bullet 1. Every registry-backed image must carry intrinsic
 * dimensions (no dimensions is a layout shift waiting for a slow network),
 * must offer at least one modern format, must decode at ~2x its display box
 * and must say something useful in `alt`.
 */
export function auditStills(m: AssetPageMeasurement): AssetFinding[] {
  const out: AssetFinding[] = [];
  for (const s of m.stills) {
    const where = at(m, `still:${s.id ?? s.currentSrc.split("/").pop() ?? "unknown"}`);

    if (!s.id || !STILL_BY_ID.has(s.id)) {
      out.push(
        finding(
          "asset.still.unknown",
          "warn",
          where,
          "image is not declared in UI_STILLS; screenshots on the marketing site must be registry-backed",
          { src: s.currentSrc },
        ),
      );
      continue;
    }
    const spec = STILL_BY_ID.get(s.id)!;

    if (s.naturalWidth === 0 || s.naturalHeight === 0) {
      out.push(
        finding("asset.still.broken", "error", where, "image failed to decode (naturalWidth is 0)", {
          src: s.currentSrc,
        }),
      );
      // Nothing else is measurable on a broken image.
      continue;
    }

    if (s.attrWidth === null || s.attrHeight === null) {
      out.push(
        finding(
          "asset.still.missing_dimensions",
          "error",
          where,
          "no explicit width/height attributes; the reserved box is what stops CLS",
        ),
      );
    } else {
      const declared = s.attrWidth / s.attrHeight;
      const actual = s.naturalWidth / s.naturalHeight;
      if (Math.abs(declared - actual) > 0.02) {
        out.push(
          finding(
            "asset.still.dimension_mismatch",
            "error",
            where,
            `declared aspect ${declared.toFixed(3)} does not match the file's ${actual.toFixed(3)}`,
            { attr: [s.attrWidth, s.attrHeight], natural: [s.naturalWidth, s.naturalHeight] },
          ),
        );
      }
    }

    const modern = s.offeredFormats.filter((f) => f === "avif" || f === "webp");
    if (modern.length < 2) {
      out.push(
        finding(
          "asset.still.no_modern_format",
          modern.length === 0 ? "error" : "warn",
          where,
          `offers ${modern.join(", ") || "no modern format"}; §10.5 requires AVIF and WebP sources`,
          { offered: s.offeredFormats },
        ),
      );
    }

    if (s.displayWidth > 0) {
      const density = s.naturalWidth / s.displayWidth;
      if (density < STILLS.minDensity) {
        out.push(
          finding(
            "asset.still.density",
            "warn",
            where,
            `rendered at ${density.toFixed(2)}x; §10.5 asks for ${STILLS.dpr}x crops`,
            { naturalWidth: s.naturalWidth, displayWidth: Math.round(s.displayWidth) },
          ),
        );
      }
    }

    const alt = (s.alt ?? "").trim();
    if (!alt) {
      out.push(
        finding("asset.still.alt_missing", "error", where, "no alt text on a meaningful screenshot"),
      );
    } else if (alt.length < STILLS.minAltChars || alt.length > STILLS.maxAltChars) {
      out.push(
        finding(
          "asset.still.alt_length",
          "warn",
          where,
          `alt is ${alt.length} chars; keep it between ${STILLS.minAltChars} and ${STILLS.maxAltChars}`,
        ),
      );
    }

    const wantsEager = spec.priority && s.aboveFold;
    if (wantsEager && s.loading === "lazy") {
      out.push(
        finding(
          "asset.still.loading_priority",
          "warn",
          where,
          "above-the-fold still is lazy; it competes with the LCP instead of helping it",
        ),
      );
    }
    if (!s.aboveFold && s.loading !== "lazy") {
      out.push(
        finding(
          "asset.still.loading_priority",
          "warn",
          where,
          "below-the-fold still is eager; it steals bandwidth from the fold",
        ),
      );
    }

    const ext = s.currentSrc.split(".").pop()?.split("?")[0] as
      | keyof typeof STILLS.maxBytes
      | undefined;
    const budget = ext && ext in STILLS.maxBytes ? STILLS.maxBytes[ext] : null;
    if (budget !== null && s.bytes !== null && s.bytes > budget) {
      out.push(
        finding(
          "asset.still.oversize",
          "warn",
          where,
          `${Math.round(s.bytes / 1024)}KB exceeds the ${Math.round(budget / 1024)}KB ${ext} budget`,
        ),
      );
    }
  }
  return out;
}

/**
 * TODO §10.5 bullet 2. One sprite, and a label on every mark that stands alone.
 * A decorative icon carrying its own label is just as wrong: the screen reader
 * then reads the concept twice.
 */
export function auditIcons(m: AssetPageMeasurement): AssetFinding[] {
  const out: AssetFinding[] = [];

  if (m.sprite && !m.sprite.ok) {
    out.push(
      finding(
        "asset.icon.sprite_missing",
        "error",
        at(m, "icons"),
        `sprite ${SPRITE_PATH} did not resolve; every mark on the page is a blank box`,
      ),
    );
  }
  if (m.sprite?.ok && m.sprite.bytes !== null && m.sprite.bytes > ICONS.maxBytes) {
    out.push(
      finding(
        "asset.icon.sprite_oversize",
        "warn",
        at(m, "icons"),
        `sprite is ${Math.round(m.sprite.bytes / 1024)}KB over a ${Math.round(
          ICONS.maxBytes / 1024,
        )}KB budget; prune ICON_NAMES`,
      ),
    );
  }

  for (const icon of m.icons) {
    const where = at(m, `icon:${icon.symbol ?? "inline"}`);
    if (!icon.symbol) {
      out.push(
        finding(
          "asset.icon.not_sprited",
          "warn",
          where,
          "inline svg on the marketing surface; §10.5 wants a single local sprite",
          { href: icon.href },
        ),
      );
      continue;
    }
    if (!ICON_SET.has(icon.symbol)) {
      out.push(
        finding(
          "asset.icon.unknown_symbol",
          "error",
          where,
          `references "#${icon.symbol}", which the sprite manifest does not contain`,
        ),
      );
    }
    if (icon.standalone) {
      if (!icon.ariaLabel?.trim()) {
        out.push(
          finding(
            "asset.icon.label_missing",
            "error",
            where,
            "standalone mark with no aria-label; it is silent to a screen reader",
          ),
        );
      }
      if (icon.ariaHidden) {
        out.push(
          finding(
            "asset.icon.label_missing",
            "error",
            where,
            "standalone mark is aria-hidden; the meaning it carries is unreachable",
          ),
        );
      }
    } else if (icon.ariaLabel?.trim() && !icon.ariaHidden) {
      out.push(
        finding(
          "asset.icon.label_redundant",
          "warn",
          where,
          "decorative mark next to a text label is announced twice; mark it aria-hidden",
        ),
      );
    }
  }
  return out;
}

/**
 * TODO §10.5 bullet 3. One card per route, absolute https, exact 1200×630,
 * inside budget, matching Twitter's copy of the tag, and emitted by the leaf —
 * a card inherited from `__root` is the same card on every page, which is the
 * failure mode this rule exists to prevent.
 */
export function auditOpenGraph(m: AssetPageMeasurement): AssetFinding[] {
  const out: AssetFinding[] = [];
  const s = m.og;
  const where = at(m, "og");
  if (!s) return out;

  if (!s.ogImage) {
    out.push(
      finding(
        "asset.og.missing",
        "error",
        where,
        "no og:image; the route ships a blank share card",
        { route: s.route },
      ),
    );
    return out;
  }
  if (!/^https:\/\//.test(s.ogImage)) {
    out.push(
      finding(
        "asset.og.not_absolute",
        "error",
        where,
        `og:image "${s.ogImage}" is not an absolute https URL; scrapers do not resolve relative hrefs`,
      ),
    );
  }
  if (s.fromRoot) {
    out.push(
      finding(
        "asset.og.on_root",
        "error",
        where,
        "og:image comes from the root document, so every route would share one card",
      ),
    );
  }
  if (s.twitterImage && s.twitterImage !== s.ogImage) {
    out.push(
      finding(
        "asset.og.twitter_mismatch",
        "warn",
        where,
        "twitter:image and og:image disagree; one of the two cards is stale",
      ),
    );
  }
  if (!s.twitterImage) {
    out.push(
      finding("asset.og.twitter_mismatch", "warn", where, "og:image present but twitter:image absent"),
    );
  }
  if (!s.ogImageAlt?.trim()) {
    out.push(
      finding("asset.og.alt_missing", "warn", where, "og:image:alt is absent; add a one-line description"),
    );
  }
  if (s.probe) {
    if (s.probe.status !== 200) {
      out.push(
        finding(
          "asset.og.unreachable",
          "error",
          where,
          `og:image responded ${s.probe.status}; the card is broken for every scraper`,
          { url: s.ogImage },
        ),
      );
    } else {
      if (s.probe.contentType && !s.probe.contentType.startsWith("image/")) {
        out.push(
          finding(
            "asset.og.unreachable",
            "error",
            where,
            `og:image served as ${s.probe.contentType}, not an image`,
          ),
        );
      }
      if (s.probe.bytes !== null && s.probe.bytes > OG.maxBytes) {
        out.push(
          finding(
            "asset.og.oversize",
            "warn",
            where,
            `card is ${Math.round(s.probe.bytes / 1024)}KB over a ${Math.round(
              OG.maxBytes / 1024,
            )}KB budget`,
          ),
        );
      }
    }
  }
  if (s.intrinsic && (s.intrinsic.width !== OG.width || s.intrinsic.height !== OG.height)) {
    out.push(
      finding(
        "asset.og.dimensions",
        "error",
        where,
        `card is ${s.intrinsic.width}×${s.intrinsic.height}; the large-card slot is ${OG.width}×${OG.height}`,
      ),
    );
  }
  return out;
}

/**
 * Anything the page asked the network for. A 404 on an asset is the class of
 * bug that hides behind "it looks fine locally" — the browser draws the page
 * and only the console knows.
 */
export function auditRequests(m: AssetPageMeasurement): AssetFinding[] {
  const out: AssetFinding[] = [];
  for (const r of m.requests) {
    if (REQUEST_IGNORE.some((re) => re.test(r.url))) continue;
    const where = at(m, `request:${r.url.replace(/^https?:\/\/[^/]+/, "")}`);
    if (r.status === 404) {
      out.push(finding("asset.request.not_found", "error", where, `404 on a ${r.resourceType} request`));
    } else if (r.status >= 400) {
      out.push(
        finding("asset.request.error", "error", where, `HTTP ${r.status} on a ${r.resourceType} request`),
      );
    }
    if (r.resourceType === "image" && r.contentType && !r.contentType.startsWith("image/")) {
      out.push(
        finding(
          "asset.request.wrong_type",
          "warn",
          where,
          `image request served as ${r.contentType}; a rewrite is swallowing the asset`,
        ),
      );
    }
  }
  return out;
}

/** Everything §10.5 promises about one rendered page, in one call. */
export function auditAssetPage(m: AssetPageMeasurement) {
  const findings = dedupeAssetFindings([
    ...auditStills(m),
    ...auditIcons(m),
    ...auditOpenGraph(m),
    ...auditRequests(m),
  ]);
  return { findings, counts: countAssetsBySeverity(findings) };
}

/**
 * Registry-level audit that needs no browser: which declared assets are
 * actually present on disk. Called by the build scripts and the gate with a
 * simple existence probe so a missing file is reported once, by name, instead
 * of eleven times as a 404.
 */
export function auditAssetInventory(present: (path: string) => boolean): AssetFinding[] {
  const out: AssetFinding[] = [];
  for (const s of UI_STILLS) {
    for (const format of STILLS.formats) {
      const path = stillSource(s, format);
      if (!present(path)) {
        out.push(
          finding(
            format === "png" ? "asset.still.broken" : "asset.still.no_modern_format",
            format === "png" ? "error" : "warn",
            `inventory · still:${s.id}`,
            `${path} is missing; run \`bun run assets:stills\``,
          ),
        );
      }
    }
  }
  for (const card of OG_CARDS) {
    const path = ogAssetPath(card.route)!;
    if (!present(path)) {
      out.push(
        finding(
          "asset.og.missing",
          "error",
          `inventory · og:${card.route}`,
          `${path} is missing; run \`bun run assets:og\``,
        ),
      );
    }
  }
  if (!present(SPRITE_PATH)) {
    out.push(
      finding(
        "asset.icon.sprite_missing",
        "error",
        "inventory · icons",
        `${SPRITE_PATH} is missing; run \`bun run assets:icons\``,
      ),
    );
  }
  return out;
}
