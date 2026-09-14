/**
 * §6 — Content health and internal linking. **Pure domain layer.**
 *
 * Everything in this file is deterministic, dependency-free and client-safe:
 * the admin desk imports it, the worker-side link suggester imports it, the
 * server runtime imports it, and the contract test drives it directly with
 * fixtures. No I/O, no clock reads except through an injected `now`, no
 * randomness — a scan of the same content must produce byte-identical
 * findings, otherwise the "resolved" bookkeeping in the database churns.
 *
 * What lives here:
 *
 *  1. **Link extraction and classification** — pull hrefs out of stored body
 *     markup and decide what each one is (internal, external, anchor, mailto,
 *     tel, malformed). Extraction is deliberately regex-based over the stored
 *     block markup rather than a DOM parse: the storefront never ships a
 *     parser, and the stored body is the source of truth for what will be
 *     rendered. Limitations are documented at `extractLinks`.
 *  2. **Link-graph resolution** — resolve an internal path against the
 *     tenant's own entities and its `url_redirects` table, following at most
 *     `MAX_REDIRECT_HOPS` hops, and reporting `ok` / `redirect` / `chain` /
 *     `loop` / `missing`.
 *  3. **Graph analytics** — orphan detection over the resolved edges.
 *  4. **Editorial analytics** — cannibalisation, thin content, stale content.
 *  5. **Schema completeness** — which JSON-LD graphs an entity should emit,
 *     which required fields are missing, and singleton violations.
 *  6. **Internal link suggestions** — ranked keyword→entity matching over the
 *     tenant's own titles and focus keywords.
 *  7. **Crawl policy** — the budgets, politeness delays, timeouts and retry
 *     classification the server runtime is required to obey. They are declared
 *     here so the contract test can assert them without importing a server
 *     module.
 *
 * Every finding is bilingual (`en` + `bn`) because the dashboard is, and every
 * finding carries a stable `code` and a stable `fingerprint` so state a
 * merchant set ("ignore this one") survives the next scan.
 */

/* ==========================================================================
 * Entities
 * ========================================================================== */

export const CONTENT_ENTITY_TYPES = ["article", "page", "product", "collection"] as const;
export type ContentEntityType = (typeof CONTENT_ENTITY_TYPES)[number];

/**
 * One scannable thing the tenant owns, already normalised by the server
 * loader. `path` is the permalink the entity is actually published at, built
 * through `permalink.ts` — never hand-assembled here.
 */
export type ContentNode = {
  type: ContentEntityType;
  id: string;
  slug: string;
  path: string;
  title: string;
  /** Latin title when the primary title is বাংলা; used for keyword matching. */
  titleEn?: string | null;
  /** Stored body markup (articles/pages) or description (products/collections). */
  body: string;
  /** Words counted by the caller from the *rendered* text, not the markup. */
  wordCount: number;
  focusKeyword: string;
  secondaryKeywords: string[];
  tags: string[];
  /** ISO timestamps. `publishedAt` null means draft/scheduled. */
  updatedAt: string;
  publishedAt: string | null;
  /** False when `robots_index` is off or the entity is excluded from sitemaps. */
  indexable: boolean;
  /** Whether the storefront emits a Product/Offer graph for this entity. */
  hasPrice?: boolean;
  hasImage?: boolean;
  hasAuthor?: boolean;
  hasSku?: boolean;
  hasAvailability?: boolean;
  hasDescription?: boolean;
  /** Extra JSON-LD types the builder template contributes for this entity. */
  schemaTypes?: string[];
};

/** A stored 301/302/410 for this tenant. `to` is null for a 410. */
export type RedirectRow = { from: string; to: string | null; status: number };

/* ==========================================================================
 * Crawl policy — the numbers the server runtime must obey
 * ========================================================================== */

export const CRAWL_POLICY = {
  /** Entities loaded per kind in one scan. Beyond this the run is `truncated`. */
  maxNodesPerKind: 2_000,
  /** Links considered per node. A pathological body cannot blow the run up. */
  maxLinksPerNode: 200,
  /** Edges persisted per run. */
  maxEdgesPerRun: 20_000,
  /** External URLs actually fetched per run — the only outbound traffic. */
  maxExternalChecksPerRun: 150,
  /** Simultaneous outbound requests. Deliberately small: we are a guest. */
  externalConcurrency: 4,
  /** Minimum gap between two requests to the *same* host, milliseconds. */
  perHostDelayMs: 1_000,
  /** Hard per-request timeout. */
  externalTimeoutMs: 5_000,
  /** Wall-clock ceiling for one tenant's scan. */
  runBudgetMs: 45_000,
  /** Wall-clock ceiling for one cron invocation across all tenants. */
  sweepBudgetMs: 120_000,
  /** Retries per external URL, on retryable classes only. */
  maxAttempts: 3,
  /** Base for exponential backoff between attempts. */
  backoffBaseMs: 400,
  /** Ceiling on any single backoff wait, including a server's `Retry-After`. */
  backoffCapMs: 8_000,
  /** Redirect hops followed when resolving an internal target. */
  maxRedirectHops: 5,
  /** Rows kept per tenant before the sweep prunes older runs. */
  runRetention: 40,
} as const;

export const MAX_REDIRECT_HOPS = CRAWL_POLICY.maxRedirectHops;

/** Thin-content band, in words, per entity kind. Below the floor is a finding. */
export const THIN_CONTENT_FLOOR: Record<ContentEntityType, number> = {
  article: 300,
  page: 150,
  product: 80,
  collection: 60,
};

/** Content not touched in this many days is "stale" and offered for review. */
export const STALE_AFTER_DAYS = 365;
/** Only content older than this is even eligible to be called stale. */
export const STALE_GRACE_DAYS = 30;

/**
 * Which outcomes justify another attempt. A 404 is an answer, not a failure —
 * retrying it wastes our budget and the other site's.
 */
export type ExternalOutcome =
  | { kind: "ok"; status: number }
  | { kind: "redirect"; status: number; location: string | null }
  | { kind: "dead"; status: number }
  | { kind: "blocked"; status: number }
  | { kind: "transient"; status: number; retryAfterMs: number | null }
  | { kind: "network"; reason: string };

export function classifyHttpStatus(status: number, location?: string | null, retryAfter?: string | null): ExternalOutcome {
  if (status >= 200 && status < 300) return { kind: "ok", status };
  if (status >= 300 && status < 400) return { kind: "redirect", status, location: location ?? null };
  // 401/403/405/429 are the classic "we are being profiled, not broken" codes.
  if (status === 429) return { kind: "transient", status, retryAfterMs: parseRetryAfter(retryAfter ?? null) };
  if (status === 401 || status === 403 || status === 405 || status === 999) return { kind: "blocked", status };
  if (status >= 500) return { kind: "transient", status, retryAfterMs: parseRetryAfter(retryAfter ?? null) };
  return { kind: "dead", status };
}

export function isRetryable(outcome: ExternalOutcome): boolean {
  return outcome.kind === "transient" || outcome.kind === "network";
}

/** `Retry-After` is either delta-seconds or an HTTP date. Both are honoured. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed) * 1000, CRAWL_POLICY.backoffCapMs);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.min(at - now, CRAWL_POLICY.backoffCapMs));
}

/** Deterministic exponential backoff; a server-supplied wait always wins. */
export function backoffMs(attempt: number, retryAfterMs: number | null = null): number {
  if (retryAfterMs !== null) return Math.min(retryAfterMs, CRAWL_POLICY.backoffCapMs);
  const raw = CRAWL_POLICY.backoffBaseMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(raw, CRAWL_POLICY.backoffCapMs);
}

/* ==========================================================================
 * Link extraction
 * ========================================================================== */

export type LinkKind = "internal" | "external" | "anchor" | "mailto" | "tel" | "invalid";

export type ExtractedLink = {
  href: string;
  kind: LinkKind;
  /** Path + query for internal links, normalised; null otherwise. */
  path: string | null;
  anchorText: string;
  nofollow: boolean;
};

const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF_RE = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i;
const REL_RE = /rel\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i;
const MD_LINK_RE = /\[([^\]]{0,200})\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

function attr(match: RegExpMatchArray | null): string {
  if (!match) return "";
  return (match[2] ?? match[3] ?? match[4] ?? "").trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull every link out of stored body markup.
 *
 * Honest about its limits: this reads `<a href>` and markdown `[text](url)`
 * from the *stored* body. It does not execute the theme, so a link a widget
 * generates at render time is invisible to it — those come from the builder
 * AST scan on the server side instead. Links inside HTML comments and inside
 * sandboxed `<script>` blocks are skipped, because neither is a crawlable
 * link.
 */
export function extractLinks(markup: string, limit: number = CRAWL_POLICY.maxLinksPerNode): ExtractedLink[] {
  if (!markup) return [];
  const cleaned = markup
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const out: ExtractedLink[] = [];
  const seen = new Set<string>();

  const push = (rawHref: string, text: string, rel: string) => {
    if (out.length >= limit) return;
    const href = rawHref.trim();
    if (!href) return;
    const anchorText = text.slice(0, 200);
    const key = `${href}|${anchorText}`;
    if (seen.has(key)) return;
    seen.add(key);
    const classified = classifyHref(href);
    out.push({
      href,
      kind: classified.kind,
      path: classified.path,
      anchorText,
      nofollow: /\bnofollow\b/i.test(rel),
    });
  };

  ANCHOR_RE.lastIndex = 0;
  for (let m = ANCHOR_RE.exec(cleaned); m; m = ANCHOR_RE.exec(cleaned)) {
    const attrs = m[1] ?? "";
    push(attr(attrs.match(HREF_RE)), stripTags(m[2] ?? ""), attr(attrs.match(REL_RE)));
    if (out.length >= limit) return out;
  }

  MD_LINK_RE.lastIndex = 0;
  for (let m = MD_LINK_RE.exec(cleaned); m; m = MD_LINK_RE.exec(cleaned)) {
    push(m[2] ?? "", (m[1] ?? "").trim(), "");
    if (out.length >= limit) return out;
  }

  return out;
}

/**
 * Decide what a raw href is. Protocol-relative URLs are treated as external,
 * because that is how a browser resolves them; `javascript:` and anything
 * unparseable is `invalid` and reported rather than silently dropped.
 */
export function classifyHref(rawHref: string, siteOrigin?: string | null): { kind: LinkKind; path: string | null } {
  const href = rawHref.trim();
  if (!href) return { kind: "invalid", path: null };
  if (href.startsWith("#")) return { kind: "anchor", path: null };
  if (/^mailto:/i.test(href)) return { kind: "mailto", path: null };
  if (/^tel:/i.test(href)) return { kind: "tel", path: null };
  if (/^(javascript|data|vbscript):/i.test(href)) return { kind: "invalid", path: null };
  if (href.startsWith("//")) return { kind: "external", path: null };

  if (href.startsWith("/")) return { kind: "internal", path: normalisePath(href) };

  if (/^https?:\/\//i.test(href)) {
    if (!siteOrigin) return { kind: "external", path: null };
    try {
      const url = new URL(href);
      const origin = new URL(siteOrigin);
      if (url.host.toLowerCase() === origin.host.toLowerCase()) {
        return { kind: "internal", path: normalisePath(`${url.pathname}${url.search}`) };
      }
      return { kind: "external", path: null };
    } catch {
      return { kind: "invalid", path: null };
    }
  }

  // A bare relative href ("about", "../x") is ambiguous without a base and is
  // a real authoring bug in a CMS body — report it rather than guessing.
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: "invalid", path: null };
  return { kind: "invalid", path: null };
}

/** Canonical internal path: leading slash, no trailing slash, no fragment. */
export function normalisePath(input: string): string {
  let path = (input || "").trim();
  if (!path) return "/";
  const hash = path.indexOf("#");
  if (hash >= 0) path = path.slice(0, hash);
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

/** The path without its query string — what an entity index is keyed by. */
export function pathKey(input: string): string {
  const path = normalisePath(input);
  const q = path.indexOf("?");
  return q >= 0 ? path.slice(0, q) || "/" : path;
}

/* ==========================================================================
 * Link-graph resolution
 * ========================================================================== */

export type ResolveStatus = "ok" | "redirect" | "chain" | "loop" | "missing";

export type ResolvedTarget = {
  status: ResolveStatus;
  /** Path finally landed on, after following redirects. */
  finalPath: string;
  hops: number;
  entity: { type: ContentEntityType; id: string; title: string } | null;
  /** True when the chain terminated at a 410 Gone rule. */
  gone: boolean;
};

export type NodeIndex = Map<string, ContentNode>;

/** Path → node, keyed on the normalised path without query. */
export function indexNodes(nodes: ContentNode[]): NodeIndex {
  const index: NodeIndex = new Map();
  for (const node of nodes) index.set(pathKey(node.path), node);
  return index;
}

/** `from` → row, keyed on the normalised path. Last write wins, as in SQL. */
export function indexRedirects(rows: RedirectRow[]): Map<string, RedirectRow> {
  const index = new Map<string, RedirectRow>();
  for (const row of rows) index.set(pathKey(row.from), row);
  return index;
}

/**
 * Walk a path through the tenant's own routing table.
 *
 * `ok`       the path is a live entity
 * `redirect` exactly one hop, landing on a live entity — healthy but worth
 *            fixing in-body because every hop costs crawl budget
 * `chain`    two or more hops, or a hop that lands nowhere
 * `loop`     the chain revisits a path
 * `missing`  no entity, no redirect — a genuine 404 in the merchant's own copy
 */
export function resolveInternal(
  rawPath: string,
  nodes: NodeIndex,
  redirects: Map<string, RedirectRow>,
  wellKnown: Set<string> = DEFAULT_WELL_KNOWN_PATHS,
): ResolvedTarget {
  let current = pathKey(rawPath);
  const visited = new Set<string>([current]);
  let hops = 0;

  for (;;) {
    const node = nodes.get(current);
    if (node) {
      return {
        status: hops === 0 ? "ok" : hops === 1 ? "redirect" : "chain",
        finalPath: current,
        hops,
        entity: { type: node.type, id: node.id, title: node.title },
        gone: false,
      };
    }
    if (wellKnown.has(current)) {
      return {
        status: hops === 0 ? "ok" : hops === 1 ? "redirect" : "chain",
        finalPath: current,
        hops,
        entity: null,
        gone: false,
      };
    }

    const rule = redirects.get(current);
    if (!rule) {
      return { status: "missing", finalPath: current, hops, entity: null, gone: false };
    }
    if (rule.status === 410 || !rule.to) {
      return { status: "missing", finalPath: current, hops, entity: null, gone: true };
    }

    const next = pathKey(rule.to);
    hops += 1;
    if (visited.has(next) || hops > MAX_REDIRECT_HOPS) {
      return { status: "loop", finalPath: next, hops, entity: null, gone: false };
    }
    visited.add(next);
    current = next;
  }
}

/**
 * Paths that exist as routes rather than as content rows. A link to `/cart` is
 * not a broken link just because there is no `pages` row behind it.
 */
export const DEFAULT_WELL_KNOWN_PATHS = new Set<string>([
  "/",
  "/cart",
  "/checkout",
  "/contact",
  "/track",
  "/auth",
  "/blog",
  "/pricing",
  "/features",
]);

/* ==========================================================================
 * Findings
 * ========================================================================== */

export const FINDING_CODES = [
  "link.broken",
  "link.chain",
  "link.loop",
  "link.invalid",
  "link.external_dead",
  "link.external_blocked",
  "page.orphan",
  "keyword.cannibalisation",
  "content.thin",
  "content.stale",
  "schema.missing_field",
  "schema.duplicate_graph",
] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

export type Severity = "error" | "warning" | "notice";

export const FINDING_SEVERITY: Record<FindingCode, Severity> = {
  "link.broken": "error",
  "link.chain": "warning",
  "link.loop": "error",
  "link.invalid": "warning",
  "link.external_dead": "warning",
  "link.external_blocked": "notice",
  "page.orphan": "warning",
  "keyword.cannibalisation": "warning",
  "content.thin": "notice",
  "content.stale": "notice",
  "schema.missing_field": "warning",
  "schema.duplicate_graph": "error",
};

export const FINDING_LABELS: Record<FindingCode, { en: string; bn: string }> = {
  "link.broken": { en: "Broken internal link", bn: "ভাঙা অভ্যন্তরীণ লিংক" },
  "link.chain": { en: "Redirect chain", bn: "রিডাইরেক্ট চেইন" },
  "link.loop": { en: "Redirect loop", bn: "রিডাইরেক্ট লুপ" },
  "link.invalid": { en: "Unusable link", bn: "অকার্যকর লিংক" },
  "link.external_dead": { en: "External link is dead", bn: "বাইরের লিংক মৃত" },
  "link.external_blocked": { en: "External site refused the check", bn: "বাইরের সাইট চেক করতে দেয়নি" },
  "page.orphan": { en: "Orphan page", bn: "অরফান পেজ" },
  "keyword.cannibalisation": { en: "Two pages target one keyword", bn: "একই কীওয়ার্ডে দুটি পেজ" },
  "content.thin": { en: "Thin content", bn: "কম শব্দের কনটেন্ট" },
  "content.stale": { en: "Stale content", bn: "পুরনো কনটেন্ট" },
  "schema.missing_field": { en: "Schema is missing a required field", bn: "স্কিমায় আবশ্যক ফিল্ড নেই" },
  "schema.duplicate_graph": { en: "Duplicate JSON-LD graph", bn: "একাধিক JSON-LD গ্রাফ" },
};

export type Finding = {
  code: FindingCode;
  severity: Severity;
  entityType: ContentEntityType | "site";
  entityId: string | null;
  entityTitle: string;
  entityPath: string;
  /** The offending thing: a URL, a keyword, a field name. */
  target: string;
  /** Stable identity for upsert + merchant-set state. */
  fingerprint: string;
  message: string;
  messageBn: string;
  detail: Record<string, unknown>;
};

/**
 * Findings are keyed on (code, fingerprint). The fingerprint must not include
 * anything that legitimately changes between scans — no timestamps, no
 * counts — or an "ignore" would silently reopen on the next run.
 */
export function fingerprintOf(code: FindingCode, parts: (string | null | undefined)[]): string {
  const body = parts.map((p) => (p ?? "").toLowerCase().trim()).join("|");
  return `${code}::${body}`;
}

function finding(
  code: FindingCode,
  node: Pick<ContentNode, "type" | "id" | "title" | "path"> | null,
  target: string,
  message: string,
  messageBn: string,
  detail: Record<string, unknown> = {},
  fingerprintParts?: (string | null | undefined)[],
): Finding {
  return {
    code,
    severity: FINDING_SEVERITY[code],
    entityType: node?.type ?? "site",
    entityId: node?.id ?? null,
    entityTitle: node?.title ?? "",
    entityPath: node?.path ?? "",
    target,
    fingerprint: fingerprintOf(code, fingerprintParts ?? [node?.type ?? "site", node?.id ?? "", target]),
    message,
    messageBn,
    detail,
  };
}

/* ==========================================================================
 * Analysis 1 — the link graph
 * ========================================================================== */

export type GraphEdge = {
  sourceType: ContentEntityType;
  sourceId: string;
  sourcePath: string;
  href: string;
  kind: LinkKind;
  anchorText: string;
  nofollow: boolean;
  targetPath: string | null;
  targetType: ContentEntityType | null;
  targetId: string | null;
  status: "ok" | "redirect" | "chain" | "loop" | "missing" | "unknown";
  hops: number;
};

export type GraphResult = {
  edges: GraphEdge[];
  findings: Finding[];
  /** Hosts seen on external links, with how many links point at each. */
  externalHosts: { host: string; count: number }[];
  /** External hrefs worth an HTTP check, deduped and capped by policy. */
  externalTargets: string[];
  truncated: boolean;
};

export function buildLinkGraph(
  nodes: ContentNode[],
  redirects: RedirectRow[],
  opts: { siteOrigin?: string | null; wellKnown?: Set<string>; maxEdges?: number } = {},
): GraphResult {
  const index = indexNodes(nodes);
  const redirectIndex = indexRedirects(redirects);
  const wellKnown = opts.wellKnown ?? DEFAULT_WELL_KNOWN_PATHS;
  const maxEdges = opts.maxEdges ?? CRAWL_POLICY.maxEdgesPerRun;

  const edges: GraphEdge[] = [];
  const findings: Finding[] = [];
  const hostCounts = new Map<string, number>();
  const externalTargets: string[] = [];
  const externalSeen = new Set<string>();
  let truncated = false;

  for (const node of nodes) {
    for (const link of extractLinks(node.body)) {
      if (edges.length >= maxEdges) {
        truncated = true;
        break;
      }

      const base: GraphEdge = {
        sourceType: node.type,
        sourceId: node.id,
        sourcePath: node.path,
        href: link.href,
        kind: link.kind,
        anchorText: link.anchorText,
        nofollow: link.nofollow,
        targetPath: null,
        targetType: null,
        targetId: null,
        status: "unknown",
        hops: 0,
      };

      if (link.kind === "invalid") {
        edges.push(base);
        findings.push(
          finding(
            "link.invalid",
            node,
            link.href,
            `"${truncate(link.href, 80)}" is not a usable link — it has no scheme the browser can follow.`,
            `"${truncate(link.href, 80)}" ব্রাউজার খুলতে পারবে না — লিংকটি ঠিক নয়।`,
            { anchorText: link.anchorText },
          ),
        );
        continue;
      }

      if (link.kind === "external") {
        const host = hostOf(link.href, opts.siteOrigin ?? null);
        if (host) hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
        const normalised = link.href.trim();
        if (!externalSeen.has(normalised) && externalTargets.length < CRAWL_POLICY.maxExternalChecksPerRun) {
          externalSeen.add(normalised);
          externalTargets.push(normalised);
        }
        edges.push(base);
        continue;
      }

      if (link.kind !== "internal" || !link.path) {
        edges.push(base);
        continue;
      }

      const resolved = resolveInternal(link.path, index, redirectIndex, wellKnown);
      edges.push({
        ...base,
        targetPath: resolved.finalPath,
        targetType: resolved.entity?.type ?? null,
        targetId: resolved.entity?.id ?? null,
        status: resolved.status,
        hops: resolved.hops,
      });

      if (resolved.status === "missing") {
        findings.push(
          finding(
            "link.broken",
            node,
            link.path,
            resolved.gone
              ? `Links to ${link.path}, which you deliberately removed (410). Point it somewhere live or drop the link.`
              : `Links to ${link.path}, which does not exist. Fix the link or add a redirect.`,
            resolved.gone
              ? `${link.path} মুছে ফেলা হয়েছে (410)। লিংকটি বদলান বা সরান।`
              : `${link.path} নেই। লিংক ঠিক করুন বা রিডাইরেক্ট যোগ করুন।`,
            { anchorText: link.anchorText, gone: resolved.gone },
          ),
        );
      } else if (resolved.status === "loop") {
        findings.push(
          finding(
            "link.loop",
            node,
            link.path,
            `Links to ${link.path}, whose redirects loop back on themselves.`,
            `${link.path}-এর রিডাইরেক্ট নিজের দিকেই ঘুরে আসে।`,
            { hops: resolved.hops },
          ),
        );
      } else if (resolved.status === "chain") {
        findings.push(
          finding(
            "link.chain",
            node,
            link.path,
            `Links to ${link.path}, which takes ${resolved.hops} redirects to reach ${resolved.finalPath}. Link straight to the destination.`,
            `${link.path} পৌঁছাতে ${resolved.hops}টি রিডাইরেক্ট লাগে (${resolved.finalPath})। সরাসরি লিংক দিন।`,
            { hops: resolved.hops, finalPath: resolved.finalPath },
          ),
        );
      }
    }
    if (truncated) break;
  }

  const externalHosts = [...hostCounts.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));

  return { edges, findings, externalHosts, externalTargets, truncated };
}

function hostOf(href: string, siteOrigin: string | null): string | null {
  try {
    const url = new URL(href, href.startsWith("//") ? "https:" : (siteOrigin ?? "https://example.invalid"));
    return url.host.toLowerCase() || null;
  } catch {
    return null;
  }
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/* ==========================================================================
 * Analysis 2 — orphans
 * ========================================================================== */

/**
 * A page is an orphan when no other *published, indexable* page of the tenant
 * links to it. Self-links do not count, `nofollow` links do not count (they
 * pass no signal), the home page is never an orphan, and drafts are skipped
 * because they are not supposed to be reachable yet.
 */
export function orphanFindings(nodes: ContentNode[], edges: GraphEdge[]): Finding[] {
  const inbound = new Map<string, number>();
  for (const edge of edges) {
    if (edge.nofollow) continue;
    if (!edge.targetId || edge.status === "missing" || edge.status === "loop") continue;
    if (edge.targetId === edge.sourceId) continue;
    inbound.set(edge.targetId, (inbound.get(edge.targetId) ?? 0) + 1);
  }

  const findings: Finding[] = [];
  for (const node of nodes) {
    if (!node.publishedAt || !node.indexable) continue;
    if (pathKey(node.path) === "/") continue;
    if ((inbound.get(node.id) ?? 0) > 0) continue;
    findings.push(
      finding(
        "page.orphan",
        node,
        node.path,
        `Nothing on your site links to "${node.title}". Add a link from a related page so shoppers and crawlers can find it.`,
        `"${node.title}" পেজে সাইটের কোথাও থেকে লিংক নেই। সম্পর্কিত পেজ থেকে লিংক দিন।`,
        { path: node.path },
      ),
    );
  }
  return findings.sort(byFingerprint);
}

/* ==========================================================================
 * Analysis 3 — cannibalisation
 * ========================================================================== */

/** Keyword comparison is case-, space- and punctuation-insensitive. */
export function normaliseKeyword(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Two or more entities carrying the same primary focus keyword compete with
 * each other in the SERP. One finding per keyword, naming every claimant, so
 * the merchant sees the decision to make rather than N half-findings.
 */
export function cannibalisationFindings(nodes: ContentNode[]): Finding[] {
  const groups = new Map<string, ContentNode[]>();
  for (const node of nodes) {
    if (!node.publishedAt || !node.indexable) continue;
    const keyword = normaliseKeyword(node.focusKeyword);
    if (!keyword) continue;
    const bucket = groups.get(keyword);
    if (bucket) bucket.push(node);
    else groups.set(keyword, [node]);
  }

  const findings: Finding[] = [];
  for (const [keyword, members] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (members.length < 2) continue;
    const ordered = [...members].sort((a, b) => a.path.localeCompare(b.path));
    const names = ordered.map((n) => `"${n.title}" (${n.path})`).join(", ");
    findings.push(
      finding(
        "keyword.cannibalisation",
        null,
        keyword,
        `${ordered.length} pages target the keyword "${keyword}": ${names}. Keep one, and point the others at it.`,
        `"${keyword}" কীওয়ার্ডে ${ordered.length}টি পেজ আছে: ${names}। একটি রাখুন, বাকিগুলো সেটির দিকে লিংক করুন।`,
        {
          keyword,
          entities: ordered.map((n) => ({ type: n.type, id: n.id, title: n.title, path: n.path })),
        },
        [keyword],
      ),
    );
  }
  return findings;
}

/* ==========================================================================
 * Analysis 4 — thin and stale
 * ========================================================================== */

export function thinContentFindings(nodes: ContentNode[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of nodes) {
    if (!node.publishedAt || !node.indexable) continue;
    const floor = THIN_CONTENT_FLOOR[node.type];
    if (node.wordCount >= floor) continue;
    findings.push(
      finding(
        "content.thin",
        node,
        String(node.wordCount),
        `"${node.title}" has ${node.wordCount} words; ${floor} is the floor for a ${node.type}. Expand it or merge it into a stronger page.`,
        `"${node.title}"-এ ${node.wordCount} শব্দ; ${node.type}-এর জন্য কমপক্ষে ${floor} দরকার। বাড়ান বা অন্য পেজে মেশান।`,
        { wordCount: node.wordCount, floor },
        [node.type, node.id],
      ),
    );
  }
  return findings;
}

export function daysBetween(fromIso: string, now: Date): number {
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return 0;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

export function staleContentFindings(nodes: ContentNode[], now: Date, afterDays = STALE_AFTER_DAYS): Finding[] {
  const findings: Finding[] = [];
  for (const node of nodes) {
    if (!node.publishedAt || !node.indexable) continue;
    const publishedAge = daysBetween(node.publishedAt, now);
    if (publishedAge < STALE_GRACE_DAYS) continue;
    const age = daysBetween(node.updatedAt, now);
    if (age < afterDays) continue;
    findings.push(
      finding(
        "content.stale",
        node,
        String(age),
        `"${node.title}" has not been touched in ${age} days. Review it, refresh the facts, or retire it.`,
        `"${node.title}" ${age} দিন ধরে অপরিবর্তিত। রিভিউ করুন, তথ্য হালনাগাদ করুন, নয়তো সরিয়ে দিন।`,
        { ageDays: age, updatedAt: node.updatedAt },
        [node.type, node.id],
      ),
    );
  }
  return findings;
}

/* ==========================================================================
 * Analysis 5 — schema completeness
 * ========================================================================== */

export const SCHEMA_TYPES = [
  "Article",
  "Product",
  "BreadcrumbList",
  "FAQPage",
  "HowTo",
  "ItemList",
  "Organization",
  "LocalBusiness",
] as const;
export type SchemaType = (typeof SCHEMA_TYPES)[number];

/**
 * Google's required-field lists, kept as data so the check and the UI agree.
 * `field` is the JSON-LD property; `flag` is the `ContentNode` fact that proves
 * the storefront can actually emit it.
 */
export const SCHEMA_REQUIREMENTS: Record<SchemaType, { field: string; flag: keyof ContentNode }[]> = {
  Article: [
    { field: "headline", flag: "title" },
    { field: "image", flag: "hasImage" },
    { field: "author", flag: "hasAuthor" },
    { field: "datePublished", flag: "publishedAt" },
  ],
  Product: [
    { field: "name", flag: "title" },
    { field: "image", flag: "hasImage" },
    { field: "description", flag: "hasDescription" },
    { field: "offers.price", flag: "hasPrice" },
    { field: "offers.availability", flag: "hasAvailability" },
    { field: "sku", flag: "hasSku" },
  ],
  BreadcrumbList: [{ field: "itemListElement", flag: "path" }],
  FAQPage: [{ field: "mainEntity", flag: "body" }],
  HowTo: [{ field: "step", flag: "body" }],
  ItemList: [{ field: "itemListElement", flag: "body" }],
  Organization: [{ field: "name", flag: "title" }],
  LocalBusiness: [{ field: "address", flag: "hasDescription" }],
};

/** Which graphs the storefront emits for an entity of this kind, by default. */
export function expectedSchemaTypes(node: ContentNode): SchemaType[] {
  const extra = (node.schemaTypes ?? []).filter((t): t is SchemaType =>
    (SCHEMA_TYPES as readonly string[]).includes(t),
  );
  const base: SchemaType[] =
    node.type === "article"
      ? ["Article", "BreadcrumbList"]
      : node.type === "product"
        ? ["Product", "BreadcrumbList"]
        : node.type === "collection"
          ? ["ItemList", "BreadcrumbList"]
          : ["BreadcrumbList"];
  return [...new Set([...base, ...extra])];
}

export type SchemaReportRow = {
  type: SchemaType;
  emitted: boolean;
  missing: string[];
  duplicate: boolean;
};

/** Per-entity view the admin desk renders: one row per expected graph. */
export function schemaReport(node: ContentNode): SchemaReportRow[] {
  const declared = node.schemaTypes ?? [];
  const counts = new Map<string, number>();
  for (const t of declared) counts.set(t, (counts.get(t) ?? 0) + 1);

  return expectedSchemaTypes(node).map((type) => {
    const missing = SCHEMA_REQUIREMENTS[type]
      .filter(({ flag }) => !hasFact(node, flag))
      .map(({ field }) => field);
    return { type, emitted: true, missing, duplicate: (counts.get(type) ?? 0) > 1 };
  });
}

function hasFact(node: ContentNode, flag: keyof ContentNode): boolean {
  const value = node[flag];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

export function schemaFindings(nodes: ContentNode[]): Finding[] {
  const findings: Finding[] = [];
  for (const node of nodes) {
    if (!node.publishedAt || !node.indexable) continue;
    for (const row of schemaReport(node)) {
      if (row.duplicate) {
        findings.push(
          finding(
            "schema.duplicate_graph",
            node,
            row.type,
            `"${node.title}" emits more than one ${row.type} graph. Exactly one per page is allowed.`,
            `"${node.title}" পেজে একাধিক ${row.type} গ্রাফ আছে। প্রতি পেজে একটিই থাকতে পারে।`,
            { schemaType: row.type },
            [node.type, node.id, row.type],
          ),
        );
      }
      for (const field of row.missing) {
        findings.push(
          finding(
            "schema.missing_field",
            node,
            `${row.type}.${field}`,
            `"${node.title}" publishes a ${row.type} graph without the required "${field}". Google will drop the rich result.`,
            `"${node.title}"-এর ${row.type} গ্রাফে আবশ্যক "${field}" নেই। গুগল রিচ রেজাল্ট দেখাবে না।`,
            { schemaType: row.type, field },
            [node.type, node.id, row.type, field],
          ),
        );
      }
    }
  }
  return findings;
}

/* ==========================================================================
 * Analysis 6 — internal link suggestions
 * ========================================================================== */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "with", "your",
  "our", "this", "that", "is", "are", "be", "by", "from", "at", "it", "as",
]);

export function tokenise(value: string): string[] {
  return normaliseKeyword(value)
    .split(" ")
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

export type LinkSuggestion = {
  type: ContentEntityType;
  id: string;
  title: string;
  path: string;
  /** 0–100, deterministic. */
  score: number;
  /** The phrase in the draft that justified the suggestion. */
  matchedPhrase: string;
  reason: "focus_keyword" | "title" | "tag" | "term";
};

export const SUGGESTION_LIMIT = 8;

/**
 * Rank the tenant's own entities as internal link targets for a draft.
 *
 * Pure keyword→entity matching over titles, focus keywords and tags — no
 * external service, no embeddings, no network. Scoring, highest first:
 *
 *   +60  the candidate's focus keyword appears verbatim in the draft
 *   +45  the candidate's full title appears verbatim in the draft
 *   +12  per distinct title term shared with the draft (capped at 36)
 *   +10  per shared tag (capped at 20)
 *   + 6  the candidate was updated in the last 90 days (freshness nudge)
 *   −40  the candidate is not published (it can still be suggested, but last)
 *
 * Already-linked targets and the draft itself are removed outright rather than
 * penalised: suggesting a link that already exists erodes trust in the panel.
 */
export function suggestInternalLinks(
  draft: {
    id?: string | null;
    title: string;
    body: string;
    focusKeyword?: string;
    tags?: string[];
  },
  candidates: ContentNode[],
  opts: { now?: Date; limit?: number } = {},
): LinkSuggestion[] {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? SUGGESTION_LIMIT;

  const plainBody = stripTags(draft.body || "");
  const haystack = normaliseKeyword(`${draft.title} ${plainBody}`);
  const draftTerms = new Set(tokenise(`${draft.title} ${plainBody}`));
  const draftTags = new Set((draft.tags ?? []).map(normaliseKeyword).filter(Boolean));

  const linked = new Set(
    extractLinks(draft.body || "")
      .filter((l) => l.kind === "internal" && l.path)
      .map((l) => pathKey(l.path as string)),
  );

  const scored: LinkSuggestion[] = [];
  for (const candidate of candidates) {
    if (draft.id && candidate.id === draft.id) continue;
    if (linked.has(pathKey(candidate.path))) continue;

    let score = 0;
    let reason: LinkSuggestion["reason"] = "term";
    let matchedPhrase = "";

    const focus = normaliseKeyword(candidate.focusKeyword);
    if (focus && containsPhrase(haystack, focus)) {
      score += 60;
      reason = "focus_keyword";
      matchedPhrase = focus;
    }

    const title = normaliseKeyword(candidate.titleEn || candidate.title);
    if (title && containsPhrase(haystack, title)) {
      score += 45;
      if (reason !== "focus_keyword") {
        reason = "title";
        matchedPhrase = title;
      }
    }

    const titleTerms = new Set(tokenise(`${candidate.title} ${candidate.titleEn ?? ""}`));
    let shared = 0;
    for (const term of titleTerms) if (draftTerms.has(term)) shared += 1;
    if (shared) {
      score += Math.min(shared * 12, 36);
      if (!matchedPhrase) {
        matchedPhrase = [...titleTerms].filter((t) => draftTerms.has(t)).sort()[0] ?? "";
      }
    }

    let tagHits = 0;
    for (const tag of candidate.tags) if (draftTags.has(normaliseKeyword(tag))) tagHits += 1;
    if (tagHits) {
      score += Math.min(tagHits * 10, 20);
      if (!matchedPhrase) {
        reason = "tag";
        matchedPhrase = candidate.tags[0] ?? "";
      }
    }

    if (score <= 0) continue;

    if (daysBetween(candidate.updatedAt, now) <= 90) score += 6;
    if (!candidate.publishedAt) score -= 40;
    if (score <= 0) continue;

    scored.push({
      type: candidate.type,
      id: candidate.id,
      title: candidate.title,
      path: candidate.path,
      score: Math.min(100, score),
      matchedPhrase,
      reason,
    });
  }

  // Deterministic order: score desc, then path asc. Never insertion order —
  // the database returns rows in whatever order it likes.
  return scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}

function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

/* ==========================================================================
 * Composition
 * ========================================================================== */

export type ContentHealthReport = {
  findings: Finding[];
  edges: GraphEdge[];
  externalTargets: string[];
  externalHosts: { host: string; count: number }[];
  counts: Record<FindingCode, number>;
  bySeverity: Record<Severity, number>;
  scanned: Record<ContentEntityType, number>;
  truncated: boolean;
};

function byFingerprint(a: Finding, b: Finding) {
  return a.fingerprint.localeCompare(b.fingerprint);
}

/**
 * The whole editorial analysis in one deterministic pass. External link
 * verdicts are folded in afterwards by the server (they need I/O); everything
 * here is computable from the tenant's own rows.
 */
export function analyseContentHealth(
  nodes: ContentNode[],
  redirects: RedirectRow[],
  opts: { now?: Date; siteOrigin?: string | null; wellKnown?: Set<string>; truncated?: boolean } = {},
): ContentHealthReport {
  const now = opts.now ?? new Date();
  const graph = buildLinkGraph(nodes, redirects, {
    siteOrigin: opts.siteOrigin ?? null,
    ...(opts.wellKnown ? { wellKnown: opts.wellKnown } : {}),
  });

  const findings = [
    ...graph.findings,
    ...orphanFindings(nodes, graph.edges),
    ...cannibalisationFindings(nodes),
    ...thinContentFindings(nodes),
    ...staleContentFindings(nodes, now),
    ...schemaFindings(nodes),
  ].sort(byFingerprint);

  return {
    findings,
    edges: graph.edges,
    externalTargets: graph.externalTargets,
    externalHosts: graph.externalHosts,
    counts: countByCode(findings),
    bySeverity: countBySeverity(findings),
    scanned: countByType(nodes),
    truncated: graph.truncated || Boolean(opts.truncated),
  };
}

export function countByCode(findings: Finding[]): Record<FindingCode, number> {
  const counts = Object.fromEntries(FINDING_CODES.map((code) => [code, 0])) as Record<FindingCode, number>;
  for (const f of findings) counts[f.code] += 1;
  return counts;
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, notice: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function countByType(nodes: ContentNode[]): Record<ContentEntityType, number> {
  const counts = Object.fromEntries(CONTENT_ENTITY_TYPES.map((t) => [t, 0])) as Record<ContentEntityType, number>;
  for (const node of nodes) counts[node.type] += 1;
  return counts;
}

/**
 * A single 0–100 health score for the dashboard header. Errors hurt hardest,
 * notices barely at all, and the score is relative to how much content exists
 * so a 5-page shop is not punished the same as a 500-page one.
 */
export function healthScore(report: Pick<ContentHealthReport, "bySeverity" | "scanned">): number {
  const total = Object.values(report.scanned).reduce((a, b) => a + b, 0);
  if (total === 0) return 100;
  const weighted =
    report.bySeverity.error * 5 + report.bySeverity.warning * 2 + report.bySeverity.notice * 0.5;
  const penalty = Math.min(100, (weighted / total) * 20);
  return Math.max(0, Math.round(100 - penalty));
}