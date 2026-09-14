/**
 * Phase 10.8 — the docs engine (pure, isomorphic, unit-tested).
 *
 * One module answers every question the docs surface asks: which pages exist
 * for a version, what a page's headings and anchors are, what the search index
 * contains, what the curl/TypeScript samples for an endpoint look like, and
 * whether the whole set is internally consistent.
 *
 * Keeping it pure is what makes the promises enforceable. `validateDocs()` runs
 * in a contract test, so a page with a duplicate slug, a missing Bangla title,
 * a heading that collides with another anchor, a "try it" pointing at an
 * endpoint the gateway does not serve, or a link to a page that does not exist
 * fails the build instead of shipping a broken docs site.
 */
import { API_ROUTES, type ApiRoute } from "./api-scopes";
import {
  API_BASE,
  CURRENT_VERSION,
  DOC_GROUPS,
  DOC_PAGES,
  DOC_VERSIONS,
  type DocBlock,
  type DocGroupId,
  type DocLocale,
  type DocPage,
  type DocVersion,
  type DocVersionId,
} from "./docs-content";

export {
  API_BASE,
  CURRENT_VERSION,
  DOC_GROUPS,
  DOC_PAGES,
  DOC_VERSIONS,
  type DocBlock,
  type DocGroupId,
  type DocLocale,
  type DocPage,
  type DocVersion,
  type DocVersionId,
};

/* -------------------------------------------------------------------------- */
/* Versions                                                                   */
/* -------------------------------------------------------------------------- */

const VERSION_ORDER: DocVersionId[] = ["v0", "v1"];

export function isDocVersion(value: unknown): value is DocVersionId {
  return typeof value === "string" && VERSION_ORDER.includes(value as DocVersionId);
}

export function docVersion(id: DocVersionId): DocVersion {
  const found = DOC_VERSIONS.find((v) => v.id === id);
  if (!found) throw new Error(`unknown docs version: ${id}`);
  return found;
}

/** `a` is at or after `b` in the release line. */
function gte(a: DocVersionId, b: DocVersionId): boolean {
  return VERSION_ORDER.indexOf(a) >= VERSION_ORDER.indexOf(b);
}

/** A page is served by a version when it existed then and was not retired. */
export function servesPage(page: DocPage, version: DocVersionId): boolean {
  if (!gte(version, page.since)) return false;
  if (page.until && gte(version, page.until)) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export function docPages(version: DocVersionId = CURRENT_VERSION): DocPage[] {
  return DOC_PAGES.filter((page) => servesPage(page, version)).slice();
}

export function docPage(version: DocVersionId, slug: string): DocPage | null {
  const page = DOC_PAGES.find((p) => p.slug === slug);
  if (!page || !servesPage(page, version)) return null;
  return page;
}

export type DocNavGroup = {
  id: DocGroupId;
  label: { en: string; bn: string };
  pages: { slug: string; title: { en: string; bn: string }; summary: { en: string; bn: string } }[];
};

/** Sidebar model: groups in declared order, pages in declared order. */
export function docNav(version: DocVersionId = CURRENT_VERSION): DocNavGroup[] {
  const pages = docPages(version);
  return [...DOC_GROUPS]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      id: group.id,
      label: group.label,
      pages: pages
        .filter((p) => p.group === group.id)
        .sort((a, b) => a.order - b.order)
        .map((p) => ({ slug: p.slug, title: p.title, summary: p.summary })),
    }))
    .filter((group) => group.pages.length > 0);
}

/** Flat reading order — drives prev/next and the `llms.txt` map. */
export function docOrder(version: DocVersionId = CURRENT_VERSION): DocPage[] {
  return docNav(version).flatMap((group) =>
    group.pages.map((p) => docPage(version, p.slug)).filter((p): p is DocPage => Boolean(p)),
  );
}

export function docNeighbours(version: DocVersionId, slug: string) {
  const order = docOrder(version);
  const index = order.findIndex((p) => p.slug === slug);
  if (index < 0) return { prev: null as DocPage | null, next: null as DocPage | null };
  return { prev: order[index - 1] ?? null, next: order[index + 1] ?? null };
}

export function docPath(version: DocVersionId, slug: string): string {
  return `/docs/${version}/${slug}`;
}

/** GitHub-style "edit this page" target. Content is a module, so this is exact. */
export function docSourcePath(slug: string): string {
  return `src/lib/docs-content.ts#${slug}`;
}

/* -------------------------------------------------------------------------- */
/* Anchors and table of contents                                              */
/* -------------------------------------------------------------------------- */

/** Stable, URL-safe, collision-free within a page (suffixed on repeat). */
export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize("NFKD")
    // Keep Bangla codepoints: a Bangla heading deserves a real anchor too.
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
  return base || "section";
}

export type DocHeading = { level: 2 | 3; text: string; anchor: string };

export function docHeadings(page: DocPage): DocHeading[] {
  const seen = new Map<string, number>();
  const out: DocHeading[] = [];
  for (const block of page.blocks) {
    if (block.kind !== "h") continue;
    const base = slugify(block.text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    out.push({ level: block.level, text: block.text, anchor: count === 0 ? base : `${base}-${count + 1}` });
  }
  return out;
}

/** Anchor for the nth heading block, matching `docHeadings` exactly. */
export function anchorsByBlock(page: DocPage): Map<number, string> {
  const headings = docHeadings(page);
  const map = new Map<number, string>();
  let cursor = 0;
  page.blocks.forEach((block, index) => {
    if (block.kind !== "h") return;
    const heading = headings[cursor];
    cursor += 1;
    if (heading) map.set(index, heading.anchor);
  });
  return map;
}

/* -------------------------------------------------------------------------- */
/* Endpoint reference + runnable samples                                      */
/* -------------------------------------------------------------------------- */

export function routeKey(route: ApiRoute): string {
  return `${route.method} ${route.pattern}`;
}

export function apiRouteByKey(key: string): ApiRoute | null {
  return API_ROUTES.find((r) => routeKey(r) === key) ?? null;
}

/** Fills `:id` style params with a readable placeholder for samples. */
function samplePath(pattern: string): string {
  return pattern
    .split("/")
    .map((part) => (part.startsWith(":") ? `{${part.slice(1)}}` : part))
    .join("/");
}

export function curlSample(route: ApiRoute, base = API_BASE): string {
  const lines = [`curl -s -X ${route.method} "${base}/${samplePath(route.pattern)}"`];
  lines.push(`  -H "Authorization: Bearer $FRAMIQUE_API_KEY"`);
  if (route.method !== "GET") {
    lines.push(`  -H "Idempotency-Key: $(uuidgen)"`);
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '{}'`);
  }
  return lines.join(" \\\n");
}

export function tsSample(route: ApiRoute, base = API_BASE): string {
  const url = `${base}/${samplePath(route.pattern)}`;
  const headers = [`Authorization: \`Bearer \${key}\``];
  if (route.method !== "GET") {
    headers.push(`"Idempotency-Key": crypto.randomUUID()`);
    headers.push(`"Content-Type": "application/json"`);
  }
  return [
    `const res = await fetch(\`${url}\`, {`,
    `  method: "${route.method}",`,
    `  headers: { ${headers.join(", ")} },`,
    ...(route.method === "GET" ? [] : [`  body: JSON.stringify({}),`]),
    `});`,
    ``,
    `if (!res.ok) throw new Error(\`${route.method.toLowerCase()} ${route.pattern}: \${res.status}\`);`,
    `const data = await res.json();`,
  ].join("\n");
}

export type EndpointRow = {
  key: string;
  method: ApiRoute["method"];
  path: string;
  scope: string;
  summary: string;
  curl: string;
  ts: string;
  /** Sandbox "try it" is read-only: a docs page must never mutate a tenant. */
  tryable: boolean;
};

export function endpointRows(base = API_BASE): EndpointRow[] {
  return API_ROUTES.map((route) => ({
    key: routeKey(route),
    method: route.method,
    path: `/${samplePath(route.pattern)}`,
    scope: route.scope,
    summary: route.summary,
    curl: curlSample(route, base),
    ts: tsSample(route, base),
    tryable: route.method === "GET" && !route.pattern.includes(":"),
  }));
}

/* -------------------------------------------------------------------------- */
/* Search index (client-side, zero dependencies)                              */
/* -------------------------------------------------------------------------- */

export type SearchEntry = {
  slug: string;
  title: string;
  /** Nearest preceding heading; the result deep-links to its anchor. */
  heading: string | null;
  anchor: string | null;
  text: string;
};

function blockText(block: DocBlock): string {
  switch (block.kind) {
    case "h":
    case "p":
      return block.text;
    case "list":
      return block.items.join(" ");
    case "code":
      return `${block.caption ?? ""} ${block.code}`;
    case "table":
      return `${block.caption ?? ""} ${block.head.join(" ")} ${block.rows.flat().join(" ")}`;
    case "note":
      return block.text;
    case "endpoints":
      return API_ROUTES.map((r) => `${r.method} ${r.pattern} ${r.summary} ${r.scope}`).join(" ");
    case "tryit":
      return `try it ${block.route}`;
    default:
      return "";
  }
}

/**
 * One entry per (page, section). Sections rather than pages so a hit on
 * "signature verification" lands the reader on the paragraph, not the top of a
 * 2,000-word page.
 */
export function buildSearchIndex(version: DocVersionId = CURRENT_VERSION): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const page of docOrder(version)) {
    const anchors = anchorsByBlock(page);
    let heading: string | null = null;
    let anchor: string | null = null;
    let buffer: string[] = [`${page.title.en} ${page.title.bn} ${page.summary.en} ${page.keywords.join(" ")}`];

    const flush = () => {
      const text = buffer.join(" ").replace(/\s+/g, " ").trim();
      if (text) entries.push({ slug: page.slug, title: page.title.en, heading, anchor, text });
      buffer = [];
    };

    page.blocks.forEach((block, index) => {
      if (block.kind === "h" && block.level === 2) {
        flush();
        heading = block.text;
        anchor = anchors.get(index) ?? null;
      }
      buffer.push(blockText(block));
    });
    flush();
  }
  return entries;
}

export type SearchHit = {
  slug: string;
  title: string;
  heading: string | null;
  anchor: string | null;
  score: number;
  /** ±60 characters around the best match, for the result list. */
  excerpt: string;
};

function tokenise(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}.]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
    .slice(0, 8);
}

/**
 * Ranked search over the prebuilt index. Deliberately simple and explainable:
 * a term in the title outweighs a term in a heading, which outweighs a term in
 * the body, and an entry missing *any* term is dropped (AND semantics) unless
 * the query is a single term.
 */
export function searchDocs(query: string, index: SearchEntry[], limit = 8): SearchHit[] {
  const terms = tokenise(query);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const entry of index) {
    const title = entry.title.toLowerCase();
    const heading = (entry.heading ?? "").toLowerCase();
    const text = entry.text.toLowerCase();

    let score = 0;
    let matchedTerms = 0;
    let firstAt = -1;

    for (const term of terms) {
      let termScore = 0;
      if (title.includes(term)) termScore += 6;
      if (heading.includes(term)) termScore += 4;
      const at = text.indexOf(term);
      if (at >= 0) {
        termScore += 2;
        // Exact word beats a substring: "get" should not outrank "getting".
        if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) termScore += 1;
        if (firstAt < 0) firstAt = at;
      }
      if (termScore > 0) matchedTerms += 1;
      score += termScore;
    }

    if (matchedTerms === 0) continue;
    if (terms.length > 1 && matchedTerms < terms.length) score = score / 3;
    if (score <= 0) continue;

    hits.push({
      slug: entry.slug,
      title: entry.title,
      heading: entry.heading,
      anchor: entry.anchor,
      score,
      excerpt: excerptAround(entry.text, firstAt),
    });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

function excerptAround(text: string, at: number): string {
  if (at < 0) return text.slice(0, 120).trim();
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type DocIssue = { level: "error" | "warn"; code: string; page: string; message: string };

const BANGLA = /[\u0980-\u09FF]/;

/** Whole-corpus checks. Run in a contract test; an error fails the build. */
export function validateDocs(): DocIssue[] {
  const out: DocIssue[] = [];
  const push = (level: DocIssue["level"], code: string, page: string, message: string) =>
    out.push({ level, code, page, message });

  const slugs = new Set<string>();
  for (const page of DOC_PAGES) {
    if (slugs.has(page.slug)) push("error", "slug:duplicate", page.slug, "two pages claim this slug");
    slugs.add(page.slug);

    if (!/^[a-z0-9-]+$/.test(page.slug))
      push("error", "slug:shape", page.slug, "slug must be lowercase kebab-case");
    if (!DOC_GROUPS.some((g) => g.id === page.group))
      push("error", "group:unknown", page.slug, `unknown group "${page.group}"`);
    if (!BANGLA.test(page.title.bn))
      push("error", "locale:bn_title", page.slug, "bn title contains no Bangla characters");
    if (!BANGLA.test(page.summary.bn))
      push("error", "locale:bn_summary", page.slug, "bn summary contains no Bangla characters");
    if (page.summary.en.length < 60 || page.summary.en.length > 200)
      push("warn", "summary:length", page.slug, `en summary is ${page.summary.en.length} chars (60–200)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(page.updated))
      push("error", "updated:invalid", page.slug, `updated "${page.updated}" is not an ISO date`);
    if (page.until && !gte(page.until, page.since))
      push("error", "version:inverted", page.slug, "until precedes since");

    // Every page needs at least one H2, or it has no anchors and no TOC.
    const headings = page.blocks.filter((b) => b.kind === "h");
    if (headings.length === 0 && page.blocks.length > 3)
      push("warn", "heading:missing", page.slug, "long page with no H2 sections");

    const anchors = docHeadings(page).map((h) => h.anchor);
    if (new Set(anchors).size !== anchors.length)
      push("error", "anchor:duplicate", page.slug, "two headings resolve to the same anchor");

    for (const block of page.blocks) {
      if (block.kind === "tryit") {
        const route = apiRouteByKey(block.route);
        if (!route)
          push("error", "tryit:unknown_route", page.slug, `"${block.route}" is not a served endpoint`);
        else if (route.method !== "GET")
          push("error", "tryit:mutating", page.slug, `"${block.route}" is not read-only`);
      }
      if (block.kind === "table") {
        for (const row of block.rows) {
          if (row.length !== block.head.length)
            push("error", "table:ragged", page.slug, "a row does not match the header width");
        }
      }
      if (block.kind === "code" && block.code.trim() === "")
        push("error", "code:empty", page.slug, "empty code block");
      // A hardcoded secret in a sample is a secret in every reader's clipboard.
      if (block.kind === "code" && /(sk_live|service_role|BEGIN [A-Z ]*PRIVATE KEY)/.test(block.code))
        push("error", "code:secret", page.slug, "code sample looks like it embeds a real secret");
    }
  }

  // Every version must serve at least the entry page.
  for (const version of DOC_VERSIONS) {
    if (docPages(version.id).length === 0)
      push("error", "version:empty", version.id, "version serves no pages");
    if (!docPage(version.id, "quickstart"))
      push("error", "version:no_entry", version.id, "version has no quickstart");
  }

  return out;
}

export function docErrors(issues = validateDocs()): DocIssue[] {
  return issues.filter((i) => i.level === "error");
}

/* -------------------------------------------------------------------------- */
/* Sitemap shard + llms map                                                   */
/* -------------------------------------------------------------------------- */

export type DocsSitemapEntry = { path: string; lastmod: string; priority: string; indexable: boolean };

/**
 * Docs-only shard. Sunset versions are served (old bookmarks still work) but
 * never submitted: indexing two versions of the same page is self-inflicted
 * duplicate content, and the canonical always points at the current version.
 */
export function docsSitemapEntries(): DocsSitemapEntry[] {
  const entries: DocsSitemapEntry[] = [
    { path: "/docs", lastmod: latestUpdate(), priority: "0.7", indexable: true },
  ];
  for (const version of DOC_VERSIONS) {
    const current = version.status === "current";
    for (const page of docPages(version.id)) {
      entries.push({
        path: docPath(version.id, page.slug),
        lastmod: page.updated,
        priority: current ? "0.6" : "0.1",
        indexable: current,
      });
    }
  }
  return entries;
}

export function latestUpdate(): string {
  return DOC_PAGES.map((p) => p.updated).sort().at(-1) ?? "2026-02-01";
}

/** Canonical for a page: always the current version, never a sunset copy. */
export function docCanonicalPath(slug: string): string {
  return docPath(CURRENT_VERSION, slug);
}

export function renderDocsLlmsSection(origin: string): string {
  const lines = ["## Developer documentation", ""];
  for (const group of docNav(CURRENT_VERSION)) {
    lines.push(`### ${group.label.en}`);
    for (const page of group.pages) {
      lines.push(`- [${page.title.en}](${origin}${docPath(CURRENT_VERSION, page.slug)}): ${page.summary.en}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
