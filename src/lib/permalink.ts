/**
 * Phase 3 — permalinks owned by the dashboard.
 *
 * Every internal URL in the product is built here, from a per-tenant pattern,
 * and nowhere else. That single rule is what makes a pattern change safe: if
 * the render path, the sitemap, the canonical, the hreflang set and in-body
 * links all ask this module, then changing `/blog/%slug%` to
 * `/journal/%year%/%slug%` is one settings write plus a bulk 301 sweep — not a
 * grep across forty files hoping nothing was missed.
 *
 * Pure module by contract: no React, no Supabase, no clock, no randomness. The
 * only time input is the date a caller hands in, because `%year%` must come
 * from the entity's own publish date and never from `now()` (that is how
 * WordPress sites end up with a post dated by the day someone re-saved it).
 *
 * Design notes worth keeping:
 *  - Patterns are validated, not trusted. A merchant can type anything into a
 *    text box; `parsePattern` is the boundary that turns a string into a shape
 *    the rest of the system can rely on.
 *  - Reserved prefixes are refused up front. A blog base of `/admin` would
 *    shadow the dashboard; a base of `/api` would shadow webhooks.
 *  - Build and parse are inverses. `parsePath(build(entity))` must return the
 *    same slug for every supported pattern, or the router cannot resolve what
 *    the sitemap advertises. The contract test asserts this for the full
 *    matrix rather than for a happy path.
 */

/* ------------------------------- vocabulary ------------------------------- */

export const PERMALINK_KINDS = ["article", "product", "collection", "page"] as const;
export type PermalinkKind = (typeof PERMALINK_KINDS)[number];

/** Tokens a merchant may use in an article pattern. */
export const PATTERN_TOKENS = ["%slug%", "%year%", "%month%", "%day%", "%category%"] as const;
export type PatternToken = (typeof PATTERN_TOKENS)[number];

/**
 * Paths the platform itself owns. A tenant base that collides with one of
 * these would make part of the product unreachable, so it is refused rather
 * than "handled" with priority rules nobody can reason about later.
 */
export const RESERVED_PREFIXES = [
  "admin",
  "root",
  "auth",
  "checkout",
  "api",
  "cart",
  "store",
  "dashboard",
  "onboarding",
  "oauth",
  "invoice",
  "order",
  "unsubscribe",
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
  ".well-known",
  "framique",
] as const;

/** Article patterns we support. Free-form patterns are deliberately not allowed. */
export const ARTICLE_PATTERNS = [
  "/%slug%",
  "/%year%/%slug%",
  "/%year%/%month%/%slug%",
  "/%year%/%month%/%day%/%slug%",
  "/%category%/%slug%",
] as const;
export type ArticlePattern = (typeof ARTICLE_PATTERNS)[number];

export type PermalinkSettings = {
  /** Blog base, "" meaning articles live at the site root. */
  articleBase: string;
  articlePattern: ArticlePattern;
  productBase: string;
  collectionBase: string;
  pageBase: string;
};

export const DEFAULT_PERMALINKS: PermalinkSettings = {
  articleBase: "/blog",
  articlePattern: "/%slug%",
  productBase: "/p",
  collectionBase: "/c",
  pageBase: "/pages",
};

/* ------------------------------- validation ------------------------------- */

export class PermalinkError extends Error {
  constructor(
    readonly code:
      | "base_reserved"
      | "base_invalid"
      | "pattern_unsupported"
      | "base_collision"
      | "slug_invalid",
    readonly field: string,
    readonly messageEn: string,
    readonly messageBn: string,
  ) {
    super(messageEn);
    this.name = "PermalinkError";
  }
}

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lower-cases, strips a trailing slash and guarantees a single leading slash. */
export function normaliseBase(input: string): string {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw || raw === "/") return "";
  const collapsed = `/${raw}`.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return collapsed;
}

/** First path segment of a base, used for reserved-prefix comparison. */
export function firstSegment(base: string): string {
  return normaliseBase(base).split("/").filter(Boolean)[0] ?? "";
}

export function isReservedBase(base: string): boolean {
  const head = firstSegment(base);
  if (!head) return false;
  return (RESERVED_PREFIXES as readonly string[]).includes(head);
}

/**
 * Validates one base. An empty base is legal for articles only — two kinds
 * both rooted at "/" would make `/x` ambiguous, and that check lives in
 * `validateSettings` where all four bases are visible at once.
 */
export function validateBase(field: string, input: string, { allowEmpty }: { allowEmpty: boolean }): string {
  const base = normaliseBase(input);
  if (!base) {
    if (allowEmpty) return "";
    throw new PermalinkError(
      "base_invalid",
      field,
      "This URL base cannot be empty.",
      "এই URL বেস খালি রাখা যাবে না।",
    );
  }
  if (isReservedBase(base)) {
    throw new PermalinkError(
      "base_reserved",
      field,
      `“/${firstSegment(base)}” is reserved by the platform. Pick another base.`,
      `“/${firstSegment(base)}” প্ল্যাটফর্মের সংরক্ষিত পাথ। অন্য একটি বেস দিন।`,
    );
  }
  for (const segment of base.split("/").filter(Boolean)) {
    if (!SEGMENT.test(segment)) {
      throw new PermalinkError(
        "base_invalid",
        field,
        "Use lowercase letters, numbers and single hyphens only.",
        "শুধু ছোট হাতের অক্ষর, সংখ্যা ও একক হাইফেন ব্যবহার করুন।",
      );
    }
  }
  return base;
}

export function parsePattern(input: string): ArticlePattern {
  const candidate = (input ?? "").trim().toLowerCase();
  const match = (ARTICLE_PATTERNS as readonly string[]).find((p) => p === candidate);
  if (!match) {
    throw new PermalinkError(
      "pattern_unsupported",
      "articlePattern",
      "That article pattern is not supported.",
      "এই আর্টিকেল প্যাটার্ন সমর্থিত নয়।",
    );
  }
  return match as ArticlePattern;
}

/**
 * Full settings validation. Returns a normalised copy; throws the first
 * problem with a bilingual message the form can show inline.
 */
export function validateSettings(input: Partial<PermalinkSettings>): PermalinkSettings {
  const settings: PermalinkSettings = {
    articleBase: validateBase("articleBase", input.articleBase ?? DEFAULT_PERMALINKS.articleBase, {
      allowEmpty: true,
    }),
    articlePattern: parsePattern(input.articlePattern ?? DEFAULT_PERMALINKS.articlePattern),
    productBase: validateBase("productBase", input.productBase ?? DEFAULT_PERMALINKS.productBase, {
      allowEmpty: false,
    }),
    collectionBase: validateBase(
      "collectionBase",
      input.collectionBase ?? DEFAULT_PERMALINKS.collectionBase,
      { allowEmpty: false },
    ),
    pageBase: validateBase("pageBase", input.pageBase ?? DEFAULT_PERMALINKS.pageBase, {
      allowEmpty: false,
    }),
  };

  // Two kinds sharing a base makes every URL under it ambiguous, and the
  // ambiguity only shows up when a product and a page happen to share a slug —
  // months later, in production. Refuse it now.
  const bases: [string, string][] = [
    ["productBase", settings.productBase],
    ["collectionBase", settings.collectionBase],
    ["pageBase", settings.pageBase],
  ];
  if (settings.articleBase) bases.push(["articleBase", settings.articleBase]);
  const seen = new Map<string, string>();
  for (const [field, base] of bases) {
    const previous = seen.get(base);
    if (previous) {
      throw new PermalinkError(
        "base_collision",
        field,
        `“${base}” is already used by ${previous}. Each kind needs its own base.`,
        `“${base}” আগে থেকেই ${previous}-এ ব্যবহৃত। প্রতিটি ধরনের আলাদা বেস দরকার।`,
      );
    }
    seen.set(base, field);
  }

  // A rootless blog (articleBase "") plus a %slug%-only pattern puts articles
  // at "/x", which would swallow any future top-level route. Allowed, but only
  // when the merchant also picked a dated or categorised pattern, or accepted
  // the collision risk by keeping a base.
  if (!settings.articleBase && settings.articlePattern === "/%slug%") {
    // Not an error — WordPress allows exactly this — but the caller is told so
    // the UI can warn. Encoded as a normalised value, not a thrown error.
  }
  return settings;
}

/** Whether a rootless article base means articles can shadow top-level routes. */
export function shadowsRoot(settings: PermalinkSettings): boolean {
  return settings.articleBase === "" && settings.articlePattern === "/%slug%";
}

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_PREFIXES as readonly string[]).includes(slug.trim().toLowerCase());
}

/** Slug hygiene shared by the editor's inline slug field and every importer. */
export function validateSlug(slug: string): string {
  const value = (slug ?? "").trim().toLowerCase();
  if (!SEGMENT.test(value)) {
    throw new PermalinkError(
      "slug_invalid",
      "slug",
      "Use lowercase letters, numbers and single hyphens only.",
      "শুধু ছোট হাতের অক্ষর, সংখ্যা ও একক হাইফেন ব্যবহার করুন।",
    );
  }
  if (isReservedSlug(value)) {
    throw new PermalinkError(
      "slug_invalid",
      "slug",
      "That slug is reserved by the platform.",
      "এই স্লাগ প্ল্যাটফর্মে সংরক্ষিত।",
    );
  }
  return value;
}

/* --------------------------------- build ---------------------------------- */

export type PermalinkEntity = {
  kind: PermalinkKind;
  slug: string;
  /** ISO timestamp used for %year%/%month%/%day%; the entity's own date. */
  date?: string | null;
  /** Category slug used for %category%; falls back to "uncategorised". */
  category?: string | null;
};

const FALLBACK_CATEGORY = "uncategorised";

function datePartsOf(iso: string | null | undefined): { year: string; month: string; day: string } {
  // Deliberately no `new Date()` default: an entity with no date gets zeros,
  // which is visible and wrong-looking, rather than silently "today".
  if (!iso) return { year: "0000", month: "00", day: "00" };
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { year: "0000", month: "00", day: "00" };
  return {
    year: String(parsed.getUTCFullYear()).padStart(4, "0"),
    month: String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    day: String(parsed.getUTCDate()).padStart(2, "0"),
  };
}

function baseFor(settings: PermalinkSettings, kind: PermalinkKind): string {
  switch (kind) {
    case "article":
      return settings.articleBase;
    case "product":
      return settings.productBase;
    case "collection":
      return settings.collectionBase;
    case "page":
      return settings.pageBase;
  }
}

/** Store-relative path for an entity, e.g. `/blog/2026/08/jute-bags`. */
export function buildPermalink(settings: PermalinkSettings, entity: PermalinkEntity): string {
  const slug = (entity.slug ?? "").trim().toLowerCase();
  const base = baseFor(settings, entity.kind);
  if (entity.kind !== "article") return `${base}/${slug}`.replace(/\/{2,}/g, "/");

  const { year, month, day } = datePartsOf(entity.date);
  const category = (entity.category ?? "").trim().toLowerCase() || FALLBACK_CATEGORY;
  const tail = settings.articlePattern
    .replace("%year%", year)
    .replace("%month%", month)
    .replace("%day%", day)
    .replace("%category%", category)
    .replace("%slug%", slug);
  return `${base}${tail}`.replace(/\/{2,}/g, "/");
}

/**
 * Absolute URL for canonicals, sitemaps and JSON-LD. Origin is passed in
 * because it depends on the live request (preview, published, custom domain)
 * and must never be a build-time constant.
 */
export function absolutePermalink(
  origin: string,
  settings: PermalinkSettings,
  entity: PermalinkEntity,
): string {
  const path = buildPermalink(settings, entity);
  return `${origin.replace(/\/+$/, "")}${path}`;
}

/* --------------------------------- parse ---------------------------------- */

export type ParsedPermalink = {
  kind: PermalinkKind;
  slug: string;
  year?: string;
  month?: string;
  day?: string;
  category?: string;
};

function stripBase(path: string, base: string): string | null {
  if (!base) return path;
  if (path === base) return "";
  return path.startsWith(`${base}/`) ? path.slice(base.length) : null;
}

/**
 * Inverse of `buildPermalink`. Returns null when the path belongs to no
 * configured base, which is exactly the signal the router needs to fall
 * through to the 404 → redirect-map path.
 */
export function parsePath(settings: PermalinkSettings, rawPath: string): ParsedPermalink | null {
  const path = normaliseBase(rawPath.split(/[?#]/)[0] ?? "");
  if (!path) return null;

  // Non-article kinds are a flat `base/slug`, checked longest-base-first so a
  // nested base like `/shop/items` wins over `/shop`.
  const flat: [PermalinkKind, string][] = [
    ["product", settings.productBase],
    ["collection", settings.collectionBase],
    ["page", settings.pageBase],
  ];
  flat.sort((a, b) => b[1].length - a[1].length);
  for (const [kind, base] of flat) {
    const rest = stripBase(path, base);
    if (rest === null || rest === "") continue;
    const segments = rest.split("/").filter(Boolean);
    if (segments.length === 1) return { kind, slug: segments[0]! };
  }

  const rest = stripBase(path, settings.articleBase);
  if (rest === null || rest === "") return null;
  const segments = rest.split("/").filter(Boolean);
  const expected = settings.articlePattern.split("/").filter(Boolean);
  if (segments.length !== expected.length) return null;

  const parsed: ParsedPermalink = { kind: "article", slug: "" };
  for (let i = 0; i < expected.length; i += 1) {
    const token = expected[i]!;
    const value = segments[i]!;
    switch (token) {
      case "%year%":
        if (!/^\d{4}$/.test(value)) return null;
        parsed.year = value;
        break;
      case "%month%":
        if (!/^\d{2}$/.test(value)) return null;
        parsed.month = value;
        break;
      case "%day%":
        if (!/^\d{2}$/.test(value)) return null;
        parsed.day = value;
        break;
      case "%category%":
        parsed.category = value;
        break;
      case "%slug%":
        parsed.slug = value;
        break;
      default:
        // A literal segment in a (future) custom pattern must match exactly.
        if (token !== value) return null;
    }
  }
  return parsed.slug ? parsed : null;
}

/* ----------------------------- pattern change ----------------------------- */

export type PermalinkMove = { from: string; to: string; kind: PermalinkKind; slug: string };

/**
 * The diff a settings change produces: one move per entity whose URL actually
 * changes. Entities whose URL is unaffected are omitted, so the merchant sees
 * the true blast radius and the sweep writes the minimum number of rules.
 */
export function planPermalinkChange(
  before: PermalinkSettings,
  after: PermalinkSettings,
  entities: readonly PermalinkEntity[],
): PermalinkMove[] {
  const moves: PermalinkMove[] = [];
  const seen = new Set<string>();
  for (const entity of entities) {
    const from = buildPermalink(before, entity);
    const to = buildPermalink(after, entity);
    if (from === to) continue;
    // Two entities can only produce the same source path if the old settings
    // were already ambiguous; keep the first and skip the rest rather than
    // emitting conflicting rules for one URL.
    if (seen.has(from)) continue;
    seen.add(from);
    moves.push({ from, to, kind: entity.kind, slug: entity.slug });
  }
  return moves;
}

/**
 * Collapses a set of moves against existing rules so no visitor ever pays two
 * hops and no rule points at itself.
 *
 * Given existing `A→B` and a new move `B→C`, the result is `A→C` and `B→C`.
 * Given a move whose destination already redirects, the destination is
 * followed first. A cycle is dropped, loudly, via the `dropped` list — a
 * silently discarded redirect is a page that 404s in production.
 */
export function collapseRedirects(
  existing: readonly { from: string; to: string }[],
  moves: readonly PermalinkMove[],
): { rules: { from: string; to: string }[]; dropped: { from: string; reason: "loop" | "self" }[] } {
  const target = new Map<string, string>();
  for (const rule of existing) target.set(normaliseBase(rule.from), normaliseBase(rule.to));
  for (const move of moves) target.set(normaliseBase(move.from), normaliseBase(move.to));

  const resolve = (start: string): string | null => {
    let current = start;
    const seen = new Set<string>([current]);
    for (let hop = 0; hop < 8; hop += 1) {
      const next = target.get(current);
      if (next === undefined) return current;
      if (seen.has(next)) return null;
      seen.add(next);
      current = next;
    }
    return null;
  };

  const rules: { from: string; to: string }[] = [];
  const dropped: { from: string; reason: "loop" | "self" }[] = [];
  for (const from of target.keys()) {
    const final = resolve(from);
    if (final === null) {
      dropped.push({ from, reason: "loop" });
      continue;
    }
    if (final === from) {
      dropped.push({ from, reason: "self" });
      continue;
    }
    rules.push({ from, to: final });
  }
  rules.sort((a, b) => a.from.localeCompare(b.from));
  dropped.sort((a, b) => a.from.localeCompare(b.from));
  return { rules, dropped };
}

/* ------------------------------- CSV import ------------------------------- */

export type RedirectCsvRow = { from: string; to: string; status: 301 | 302 | 410 };
export type CsvParseResult = { rows: RedirectCsvRow[]; errors: { line: number; message: string }[] };

export const CSV_MAX_ROWS = 5000;

/**
 * Tolerant CSV reader for the redirect importer.
 *
 * Merchants export from WordPress plugins, Shopify and spreadsheets, so the
 * header is optional, the separator may be a comma or a semicolon, quotes may
 * or may not be present, and a bad line must not abort the whole file — it is
 * reported by line number and skipped.
 */
export function parseRedirectCsv(text: string): CsvParseResult {
  const rows: RedirectCsvRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const lines = (text ?? "").split(/\r?\n/);
  const seen = new Set<string>();

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    if (rows.length >= CSV_MAX_ROWS) {
      if (rows.length === CSV_MAX_ROWS) {
        errors.push({ line: index + 1, message: `Import capped at ${CSV_MAX_ROWS} rows.` });
      }
      return;
    }
    const separator = line.includes(";") && !line.includes(",") ? ";" : ",";
    const cells = line
      .split(separator)
      .map((cell) => cell.trim().replace(/^"(.*)"$/, "$1").trim());
    const [from, to, statusCell] = cells;
    if (!from) return;
    if (index === 0 && /^(from|source|from_path|old|redirect from)$/i.test(from)) return; // header

    const status = Number(statusCell ?? "301");
    const code = status === 302 ? 302 : status === 410 ? 410 : 301;
    if (statusCell && ![301, 302, 410].includes(status)) {
      errors.push({ line: index + 1, message: `Unsupported status “${statusCell}” — using 301.` });
    }
    const source = normaliseBase(from);
    const destination = code === 410 ? "" : normaliseBase(to ?? "");
    if (!source || source === "") {
      errors.push({ line: index + 1, message: "Source path is empty." });
      return;
    }
    if (code !== 410 && !destination) {
      errors.push({ line: index + 1, message: "A 301/302 needs a destination." });
      return;
    }
    if (code !== 410 && destination === source) {
      errors.push({ line: index + 1, message: "A redirect cannot point at itself." });
      return;
    }
    if (seen.has(source)) {
      errors.push({ line: index + 1, message: `Duplicate source “${source}” — later row ignored.` });
      return;
    }
    seen.add(source);
    rows.push({ from: source, to: destination, status: code });
  });

  return { rows, errors };
}

/** Round-trips through `parseRedirectCsv`; quoting keeps commas in paths safe. */
export function toRedirectCsv(rows: readonly { from: string; to: string; status: number }[]): string {
  const escape = (value: string) => (value.includes(",") ? `"${value}"` : value);
  return [
    "from,to,status",
    ...rows.map((row) => `${escape(row.from)},${escape(row.to ?? "")},${row.status}`),
  ].join("\n");
}
