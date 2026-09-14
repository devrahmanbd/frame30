/**
 * Phase 4 — dashboard-owned sitemap and robots.txt policy (pure module).
 *
 * Everything in here is a pure function over plain data: no network, no
 * Supabase, no React. The render path (`sitemap-config.server.ts`, the store
 * routes) and the admin desk both compile the *same* policy through these
 * helpers, which is the only way a merchant preview can be trusted to equal
 * what a crawler eventually fetches.
 *
 * Three rules are enforced structurally rather than by convention:
 *
 *  1. **A merchant can never delete a platform safety directive.** `/admin`,
 *     `/checkout`, `/api`, `/auth` (and the per-store transactional paths) are
 *     re-appended after merchant rules, and a raw-append block that tries to
 *     `Allow:` them is rejected with a named error, not silently dropped.
 *  2. **`lastmod` is entity-sourced or absent.** `entityLastmod` returns
 *     `undefined` for anything that is not a real row timestamp. There is no
 *     code path in this module that can emit build time or `now()`.
 *  3. **Sharding is arithmetic, not guesswork.** `shardPlan` derives shard
 *     boundaries from row counts, so the server can range-query exactly one
 *     page of rows instead of buffering a 50 000-product catalogue in RAM.
 */

/* ------------------------------- constants -------------------------------- */

export const SITEMAP_KINDS = ["pages", "products", "collections", "articles"] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

export const CHANGEFREQS = [
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
] as const;
export type Changefreq = (typeof CHANGEFREQS)[number];

/** Entries per sitemap file. The protocol allows 50k; we cap far lower so a
 * single shard stays inside the Worker's response and memory budget. */
export const ENTRIES_PER_FILE_DEFAULT = 1_000;
export const ENTRIES_PER_FILE_MIN = 100;
export const ENTRIES_PER_FILE_MAX = 5_000;

/** Hard ceiling on shards advertised per kind — 5k × 200 = 1M URLs. */
export const MAX_SHARDS_PER_KIND = 200;

/** Platform-owned paths that must never become crawlable, whatever a merchant
 * types into the robots editor. */
export const SAFETY_DISALLOW = ["/admin", "/root", "/auth", "/checkout", "/api/"] as const;

/** Per-store transactional paths, disallowed relative to the store base. */
export const STORE_SAFETY_SUFFIXES = ["/checkout", "/account", "/order", "/track"] as const;

/** Answer-engine crawlers gated behind one merchant opt-in. */
export const AI_CRAWLER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
] as const;

export const RAW_APPEND_MAX_BYTES = 4_096;
export const RAW_APPEND_MAX_LINES = 100;
export const MAX_CUSTOM_RULES = 20;
export const MAX_RULE_PATHS = 50;
export const MAX_EXTRA_SITEMAPS = 10;
export const CRAWL_DELAY_MAX = 60;

/* --------------------------------- types ---------------------------------- */

export type KindConfig = {
  /** Kind is advertised in the sitemap index at all. */
  include: boolean;
  changefreq: Changefreq;
  /** Kept as a string so "0.8" round-trips byte-exactly into the XML. */
  priority: string;
};

export type SitemapSettings = {
  kinds: Record<SitemapKind, KindConfig>;
  /** Emit `<image:image>` children where the entity has a known image. */
  includeImages: boolean;
  entriesPerFile: number;
};

export type RobotsRule = {
  agent: string;
  allow: string[];
  disallow: string[];
  crawlDelay: number | null;
};

export type RobotsSettings = {
  /** Master switch — off means `Disallow: /` for every agent. */
  indexable: boolean;
  /** Answer engines may crawl. Only meaningful while `indexable`. */
  aiCrawlers: boolean;
  rules: RobotsRule[];
  extraSitemaps: string[];
  /** Verbatim block appended after generated output; validated, never trusted. */
  rawAppend: string;
};

export type CrawlSettings = {
  sitemap: SitemapSettings;
  robots: RobotsSettings;
};

export const DEFAULT_KIND_CONFIG: Record<SitemapKind, KindConfig> = {
  pages: { include: true, changefreq: "monthly", priority: "0.5" },
  products: { include: true, changefreq: "weekly", priority: "0.8" },
  collections: { include: true, changefreq: "weekly", priority: "0.6" },
  articles: { include: true, changefreq: "monthly", priority: "0.7" },
};

export const DEFAULT_CRAWL_SETTINGS: CrawlSettings = {
  sitemap: {
    kinds: DEFAULT_KIND_CONFIG,
    includeImages: false,
    entriesPerFile: ENTRIES_PER_FILE_DEFAULT,
  },
  robots: {
    indexable: true,
    aiCrawlers: false,
    rules: [],
    extraSitemaps: [],
    rawAppend: "",
  },
};

export class CrawlSettingsError extends Error {
  constructor(
    readonly code:
      | "invalid_priority"
      | "invalid_changefreq"
      | "invalid_entries"
      | "invalid_rule"
      | "safety_violation"
      | "raw_too_large"
      | "invalid_sitemap_url",
    message: string,
    readonly messageBn = message,
  ) {
    super(message);
    this.name = "CrawlSettingsError";
  }
}

/* ------------------------------- validation -------------------------------- */

export function clampEntriesPerFile(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return ENTRIES_PER_FILE_DEFAULT;
  return Math.min(ENTRIES_PER_FILE_MAX, Math.max(ENTRIES_PER_FILE_MIN, n));
}

export function normalisePriority(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.5";
  const clamped = Math.min(1, Math.max(0, n));
  // One decimal keeps the XML small and matches what crawlers actually use.
  return clamped >= 1 ? "1.0" : clamped.toFixed(1);
}

export function normaliseChangefreq(value: unknown): Changefreq {
  return (CHANGEFREQS as readonly string[]).includes(String(value))
    ? (value as Changefreq)
    : "weekly";
}

/** Robots path token: leading slash, no whitespace, bounded length. */
export function normaliseRobotsPath(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (/\s/.test(raw)) return null;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path.slice(0, 200);
}

function normaliseAgent(input: unknown): string {
  return String(input ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_*\-.]/g, "")
    .slice(0, 60);
}

/** True when a merchant rule would open a platform-protected path. */
export function violatesSafety(path: string): boolean {
  const p = path.toLowerCase().replace(/\*.*$/, "");
  if (!p || p === "/") return false; // a broad Allow is always out-specified below
  return SAFETY_DISALLOW.some((safety) => {
    const s = safety.toLowerCase().replace(/\/$/, "");
    return p === s || p.startsWith(`${s}/`) || p.startsWith(s);
  });
}


export function validateRobotsRule(input: Partial<RobotsRule>): RobotsRule {
  const agent = normaliseAgent(input.agent) || "*";
  const allow = (input.allow ?? [])
    .map(normaliseRobotsPath)
    .filter((p): p is string => Boolean(p))
    .slice(0, MAX_RULE_PATHS);
  const disallow = (input.disallow ?? [])
    .map(normaliseRobotsPath)
    .filter((p): p is string => Boolean(p))
    .slice(0, MAX_RULE_PATHS);
  for (const path of allow) {
    if (violatesSafety(path)) {
      throw new CrawlSettingsError(
        "safety_violation",
        `"Allow: ${path}" would expose a protected area and was refused.`,
        `"Allow: ${path}" সুরক্ষিত অংশ খুলে দিত, তাই বাতিল করা হয়েছে।`,
      );
    }
  }
  const delayRaw = Number(input.crawlDelay);
  const crawlDelay =
    Number.isFinite(delayRaw) && delayRaw > 0 ? Math.min(CRAWL_DELAY_MAX, Math.round(delayRaw)) : null;
  if (!allow.length && !disallow.length && crawlDelay === null) {
    throw new CrawlSettingsError(
      "invalid_rule",
      `Rule for "${agent}" has no directives.`,
      `"${agent}" এর জন্য কোনো নির্দেশ নেই।`,
    );
  }
  return { agent, allow, disallow, crawlDelay };
}

export function validateExtraSitemap(input: unknown): string {
  const raw = String(input ?? "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(raw) || raw.length > 300) {
    throw new CrawlSettingsError(
      "invalid_sitemap_url",
      `"${raw.slice(0, 60)}" is not an absolute http(s) sitemap URL.`,
      `"${raw.slice(0, 60)}" একটি বৈধ সাইটম্যাপ URL নয়।`,
    );
  }
  return raw;
}

export type RawAppendCheck = { lines: string[]; errors: string[] };

/**
 * The raw box exists because there is always one directive we did not model.
 * It is still parsed line by line: comments and known directives pass, a rule
 * touching a protected path is refused, and unknown junk is reported rather
 * than shipped to Googlebot.
 */
export function validateRawAppend(text: string): RawAppendCheck {
  const errors: string[] = [];
  const value = String(text ?? "");
  if (new TextEncoder().encode(value).length > RAW_APPEND_MAX_BYTES) {
    throw new CrawlSettingsError(
      "raw_too_large",
      `Custom robots block exceeds ${RAW_APPEND_MAX_BYTES} bytes.`,
      `কাস্টম robots ব্লক ${RAW_APPEND_MAX_BYTES} বাইটের বেশি।`,
    );
  }
  const lines: string[] = [];
  const source = value.split(/\r?\n/).slice(0, RAW_APPEND_MAX_LINES);
  for (const [index, rawLine] of source.entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      lines.push(line);
      continue;
    }
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) {
      errors.push(`Line ${index + 1}: not a "Directive: value" pair.`);
      continue;
    }
    const directive = match[1]!.toLowerCase();
    const value2 = match[2]!.trim();
    if (!["user-agent", "allow", "disallow", "crawl-delay", "sitemap", "host"].includes(directive)) {
      errors.push(`Line ${index + 1}: unknown directive "${match[1]}".`);
      continue;
    }
    if (directive === "allow" && violatesSafety(value2 || "/")) {
      errors.push(`Line ${index + 1}: cannot allow the protected path "${value2}".`);
      continue;
    }
    lines.push(`${match[1]}: ${value2}`);
  }
  return { lines, errors };
}

export function validateCrawlSettings(input: unknown): CrawlSettings {
  const raw = (input ?? {}) as Partial<CrawlSettings>;
  const sitemapRaw = (raw.sitemap ?? {}) as Partial<SitemapSettings>;
  const robotsRaw = (raw.robots ?? {}) as Partial<RobotsSettings>;

  const kinds = {} as Record<SitemapKind, KindConfig>;
  for (const kind of SITEMAP_KINDS) {
    const fallback = DEFAULT_KIND_CONFIG[kind];
    const cfg = (sitemapRaw.kinds?.[kind] ?? {}) as Partial<KindConfig>;
    kinds[kind] = {
      include: cfg.include === undefined ? fallback.include : Boolean(cfg.include),
      changefreq: cfg.changefreq === undefined ? fallback.changefreq : normaliseChangefreq(cfg.changefreq),
      priority: cfg.priority === undefined ? fallback.priority : normalisePriority(cfg.priority),
    };
  }

  const rules: RobotsRule[] = [];
  for (const rule of (robotsRaw.rules ?? []).slice(0, MAX_CUSTOM_RULES)) {
    rules.push(validateRobotsRule(rule));
  }
  const extraSitemaps = (robotsRaw.extraSitemaps ?? [])
    .slice(0, MAX_EXTRA_SITEMAPS)
    .map(validateExtraSitemap);
  const rawAppend = String(robotsRaw.rawAppend ?? "");
  validateRawAppend(rawAppend); // throws on size / hard violations

  return {
    sitemap: {
      kinds,
      includeImages: Boolean(sitemapRaw.includeImages ?? false),
      entriesPerFile: clampEntriesPerFile(sitemapRaw.entriesPerFile ?? ENTRIES_PER_FILE_DEFAULT),
    },
    robots: {
      indexable: robotsRaw.indexable === undefined ? true : Boolean(robotsRaw.indexable),
      aiCrawlers: Boolean(robotsRaw.aiCrawlers ?? false),
      rules,
      extraSitemaps,
      rawAppend,
    },
  };
}

/* -------------------------------- sharding --------------------------------- */

export type Shard = { kind: SitemapKind; page: number; count: number };

/**
 * Shard boundaries from row counts. A kind that is excluded or empty produces
 * no shard at all — an empty `<urlset>` is a crawl-budget tax with no upside.
 */
export function shardPlan(
  counts: Partial<Record<SitemapKind, number>>,
  settings: SitemapSettings,
): Shard[] {
  const size = clampEntriesPerFile(settings.entriesPerFile);
  const shards: Shard[] = [];
  for (const kind of SITEMAP_KINDS) {
    if (!settings.kinds[kind]?.include) continue;
    const total = Math.max(0, Math.floor(counts[kind] ?? 0));
    if (total === 0) continue;
    const pages = Math.min(MAX_SHARDS_PER_KIND, Math.ceil(total / size));
    for (let page = 1; page <= pages; page += 1) {
      const consumed = (page - 1) * size;
      shards.push({ kind, page, count: Math.min(size, total - consumed) });
    }
  }
  return shards;
}

/** Inclusive `[from, to]` row range for a shard, matching PostgREST `.range()`. */
export function shardRange(page: number, entriesPerFile: number): { from: number; to: number } {
  const size = clampEntriesPerFile(entriesPerFile);
  const safePage = Math.max(1, Math.floor(page) || 1);
  const from = (safePage - 1) * size;
  return { from, to: from + size - 1 };
}

/* ---------------------------------- XML ------------------------------------ */

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * `lastmod`, honestly. Only a real entity timestamp qualifies; anything
 * unparsable returns `undefined` so the tag is omitted entirely.
 */
export function entityLastmod(...candidates: (string | null | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (Number.isNaN(date.getTime())) continue;
    return date.toISOString().slice(0, 10);
  }
  return undefined;
}

export type SitemapEntry = {
  path: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
  images?: string[];
};

const IMAGE_NS = ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';

/** Renders one `<urlset>`. Built by string concat over a bounded shard. */
export function renderUrlset(
  origin: string,
  entries: readonly SitemapEntry[],
  opts: { includeImages?: boolean } = {},
): string {
  const base = origin.replace(/\/+$/, "");
  const useImages = Boolean(opts.includeImages) && entries.some((e) => e.images?.length);
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${useImages ? IMAGE_NS : ""}>`,
  ];
  for (const entry of entries) {
    parts.push("  <url>");
    parts.push(`    <loc>${xmlEscape(`${base}${entry.path}`)}</loc>`);
    if (entry.lastmod) parts.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
    if (entry.changefreq) parts.push(`    <changefreq>${xmlEscape(entry.changefreq)}</changefreq>`);
    if (entry.priority) parts.push(`    <priority>${xmlEscape(entry.priority)}</priority>`);
    if (useImages) {
      for (const image of entry.images ?? []) {
        parts.push(`    <image:image><image:loc>${xmlEscape(image)}</image:loc></image:image>`);
      }
    }
    parts.push("  </url>");
  }
  parts.push("</urlset>");
  return `${parts.join("\n")}\n`;
}

export function shardPath(storeSlug: string, kind: SitemapKind, page: number): string {
  return `/store/${storeSlug}/sitemaps/${kind}-${Math.max(1, page)}.xml`;
}

export function renderSitemapIndexXml(
  origin: string,
  storeSlug: string,
  shards: readonly Shard[],
  lastmodByKind: Partial<Record<SitemapKind, string | undefined>> = {},
): string {
  const base = origin.replace(/\/+$/, "");
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ];
  for (const shard of shards) {
    const lastmod = lastmodByKind[shard.kind];
    parts.push("  <sitemap>");
    parts.push(`    <loc>${xmlEscape(`${base}${shardPath(storeSlug, shard.kind, shard.page)}`)}</loc>`);
    if (lastmod) parts.push(`    <lastmod>${xmlEscape(lastmod)}</lastmod>`);
    parts.push("  </sitemap>");
  }
  parts.push("</sitemapindex>");
  return `${parts.join("\n")}\n`;
}

/** `products-3.xml` → `{ kind: "products", page: 3 }`; anything else is null. */
export function parseShardParam(param: string): { kind: SitemapKind; page: number } | null {
  const cleaned = param.replace(/\.xml$/i, "");
  const match = /^([a-z]+)(?:-(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const kind = match[1] as SitemapKind;
  if (!(SITEMAP_KINDS as readonly string[]).includes(kind)) return null;
  const page = match[2] ? Number(match[2]) : 1;
  if (!Number.isFinite(page) || page < 1 || page > MAX_SHARDS_PER_KIND) return null;
  return { kind, page };
}

/* -------------------------------- robots.txt -------------------------------- */

export type RobotsRenderInput = {
  origin: string;
  storeSlug: string;
  settings: RobotsSettings;
  /** Sitemap index URL of this store; always advertised when indexable. */
  sitemapPath?: string;
  /** Advertise llms.txt (answer engines opted in). */
  llmsPath?: string;
};

/**
 * Composes the file in a fixed order — merchant rules first, platform safety
 * last — so the final answer for a protected path is always "Disallow",
 * whatever came before it (a longest-match crawler still sees our rule, and a
 * same-length conflict resolves to the more specific platform path).
 */
export function renderRobotsTxt(input: RobotsRenderInput): string {
  const origin = input.origin.replace(/\/+$/, "");
  const base = `/store/${input.storeSlug}`;
  const settings = input.settings;
  const lines: string[] = [];

  if (!settings.indexable) {
    lines.push("# Store is set to no-index in the SEO dashboard.");
    lines.push("User-agent: *");
    lines.push("Disallow: /");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  const merchantStar = settings.rules.find((r) => r.agent === "*");
  lines.push("User-agent: *");
  lines.push(`Allow: ${base}`);
  for (const path of merchantStar?.allow ?? []) lines.push(`Allow: ${path}`);
  for (const path of merchantStar?.disallow ?? []) lines.push(`Disallow: ${path}`);
  for (const suffix of STORE_SAFETY_SUFFIXES) lines.push(`Disallow: ${base}${suffix}`);
  lines.push(`Disallow: ${base}/search?*`);
  for (const safety of SAFETY_DISALLOW) lines.push(`Disallow: ${safety}`);
  if (merchantStar?.crawlDelay) lines.push(`Crawl-delay: ${merchantStar.crawlDelay}`);
  lines.push("");

  for (const rule of settings.rules) {
    if (rule.agent === "*") continue;
    lines.push(`User-agent: ${rule.agent}`);
    for (const path of rule.allow) lines.push(`Allow: ${path}`);
    for (const path of rule.disallow) lines.push(`Disallow: ${path}`);
    for (const safety of SAFETY_DISALLOW) lines.push(`Disallow: ${safety}`);
    if (rule.crawlDelay) lines.push(`Crawl-delay: ${rule.crawlDelay}`);
    lines.push("");
  }

  const custom = new Set(settings.rules.map((r) => r.agent));
  for (const agent of AI_CRAWLER_AGENTS) {
    if (custom.has(agent)) continue;
    lines.push(`User-agent: ${agent}`);
    lines.push(settings.aiCrawlers ? `Allow: ${base}` : "Disallow: /");
    lines.push("");
  }

  lines.push(`Sitemap: ${origin}${input.sitemapPath ?? `${base}/sitemap.xml`}`);
  for (const extra of settings.extraSitemaps) lines.push(`Sitemap: ${extra}`);
  if (settings.aiCrawlers && input.llmsPath) {
    lines.push(`# llms.txt: ${origin}${input.llmsPath}`);
  }

  const { lines: rawLines } = validateRawAppend(settings.rawAppend);
  if (rawLines.length) {
    lines.push("");
    lines.push("# --- merchant additions ---");
    lines.push(...rawLines);
  }

  return `${lines.join("\n")}\n`;
}

/* ------------------------------ policy tester ------------------------------- */

export type RobotsVerdict = {
  allowed: boolean;
  /** The winning directive, e.g. `Disallow: /store/x/checkout`. */
  rule: string | null;
  agent: string;
};

function patternMatches(pattern: string, path: string): number {
  // Google's syntax: `*` is a wildcard, `$` anchors the end.
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(
    `^${body
      .split("*")
      .map((chunk) => chunk.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}${anchored ? "$" : ""}`,
  );
  return regex.test(path) ? body.length : -1;
}

/**
 * "Test this path against my rules" — the same longest-match resolution
 * Googlebot uses, run against the *rendered* file so the preview and the
 * production answer can never diverge.
 */
export function testRobotsPath(robotsTxt: string, path: string, agent = "*"): RobotsVerdict {
  const groups: { agents: string[]; directives: { type: "allow" | "disallow"; value: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const directive = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (directive === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], directives: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (directive === "allow" || directive === "disallow") {
      current.directives.push({ type: directive, value });
    }
  }

  const lowered = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.includes(lowered));
  const wildcard = groups.filter((g) => g.agents.includes("*"));
  const applicable = specific.length ? specific : wildcard;
  if (!applicable.length) return { allowed: true, rule: null, agent };

  let best: { type: "allow" | "disallow"; value: string; length: number } | null = null;
  for (const group of applicable) {
    for (const directive of group.directives) {
      if (directive.value === "") {
        // "Disallow:" with an empty value means "allow everything".
        if (directive.type === "disallow" && !best) best = { ...directive, length: 0, type: "allow" };
        continue;
      }
      const length = patternMatches(directive.value, path);
      if (length < 0) continue;
      if (!best || length > best.length || (length === best.length && directive.type === "disallow")) {
        best = { type: directive.type, value: directive.value, length };
      }
    }
  }
  if (!best) return { allowed: true, rule: null, agent };
  return {
    allowed: best.type === "allow",
    rule: `${best.type === "allow" ? "Allow" : "Disallow"}: ${best.value}`,
    agent,
  };
}

/* ---------------------------------- diff ----------------------------------- */

export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** Line diff for the "before you save" preview. LCS over bounded input. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push({ kind: "removed", text: a[i]! });
      i += 1;
    } else {
      out.push({ kind: "added", text: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++]! });
  while (j < b.length) out.push({ kind: "added", text: b[j++]! });
  return out;
}

export function diffSummary(lines: readonly DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === "added").length,
    removed: lines.filter((l) => l.kind === "removed").length,
  };
}
