/**
 * Phase 9.1 — blog taxonomy and the reader-facing archive contract.
 *
 * `tags` on `articles` was a free-text array: good enough to decorate a post,
 * useless as a browsable surface. A tag with no page is an orphan generator —
 * the sitemap advertises `/blog/<slug>` URLs that nothing links to, §6 reports
 * the orphans, and nobody can fix them because there is no archive to link
 * from. This module is the pure half of the fix: term identity, the tree, the
 * URL grammar, pagination and the head/JSON-LD composition for every reader
 * surface (`/blog`, `/blog/category/...`, `/blog/tag/...`).
 *
 * Deliberately dependency-free and DOM-free, because the same rules must hold
 * in three places:
 *
 *  - the admin taxonomy desk (validate before the round-trip),
 *  - `blog-taxonomy.server.ts` (validate again — a client is never trusted),
 *  - the reader routes and the sitemap (one URL grammar, or canonicals lie).
 *
 * Rules that are decisions, not accidents:
 *
 * 1. **A term slug is an identity, not a label.** Renaming a term never moves
 *    its URL; changing the slug does, and that is a 301 the server writes.
 * 2. **Depth is capped at 3.** Deeper trees produce breadcrumb trails no
 *    reader follows and crawl paths Google discounts.
 * 3. **Page 1 is the canonical archive.** `?page=2` canonicalises to itself
 *    (never to page 1 — that is the duplicate-content bug Google explicitly
 *    calls out), and any page past the last one is `noindex,follow` rather than
 *    a soft 404 with content.
 * 4. **An empty archive is never indexable.** A term with no published article
 *    is a thin page; it renders (staff need to see it) but tells crawlers no.
 * 5. **Everything is bounded.** Page size, page number, term counts, string
 *    lengths. These functions run on a request path.
 */

/* ------------------------------------------------------------------ limits */

export const TAXONOMY_LIMITS = {
  maxNameChars: 80,
  maxSlugChars: 60,
  maxDescriptionChars: 500,
  maxMetaTitleChars: 200,
  maxMetaDescriptionChars: 600,
  /** Tree depth, counting the root as 1. */
  maxDepth: 3,
  /** Terms one merchant may own per kind. Past this, taxonomy is noise. */
  maxTermsPerKind: 300,
  /** Terms one article may carry (tags included). */
  maxTermsPerArticle: 12,
} as const;

/** Reader pagination. 12 keeps a 3-column grid whole on every breakpoint. */
export const BLOG_PAGE_SIZE = 12;
/** Hard ceiling on `?page=`: deep pagination is a crawl trap, not a feature. */
export const BLOG_MAX_PAGE = 200;

export const TERM_KINDS = ["category", "tag"] as const;
export type TermKind = (typeof TERM_KINDS)[number];

/**
 * First segments the taxonomy may never claim, because `/blog/<x>` is also the
 * article namespace and these are either routes we own or words that would make
 * an article unreachable.
 */
const RESERVED_TERM_SLUGS = new Set([
  "category",
  "categories",
  "tag",
  "tags",
  "page",
  "feed",
  "rss",
  "amp",
  "search",
  "sitemap",
  "robots",
  "author",
  "archive",
  "archives",
  "index",
  "all",
]);

/* ------------------------------------------------------------------- model */

export type TermRow = {
  id: string;
  merchant_id?: string;
  kind: TermKind | string;
  slug: string;
  name: string;
  name_en?: string | null;
  description?: string | null;
  parent_id?: string | null;
  sort_order?: number | null;
  cover_image_url?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  robots_index?: boolean | null;
  article_count?: number | null;
};

export type TermInput = {
  id: string | null;
  kind: TermKind;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  parentId: string | null;
  sortOrder: number;
  coverImageUrl: string;
  metaTitle: string;
  metaDescription: string;
  robotsIndex: boolean;
};

export type TermNode = TermRow & { depth: number; children: TermNode[] };

/**
 * A taxonomy failure a merchant can act on: stable code, offending field,
 * bilingual copy. Same contract as `ArticleValidationError`, so the editor's
 * existing `code|field|en|bn` reader handles both without a second code path.
 */
export class TaxonomyError extends Error {
  constructor(
    readonly code: string,
    readonly field: string,
    readonly en: string,
    readonly bn: string,
  ) {
    super(`${code}: ${en}`);
    this.name = "TaxonomyError";
  }
}

/* -------------------------------------------------------------- identities */

/**
 * Slugify a term. Bangla is kept as-is (Unicode slugs are valid and Bangla is
 * the first language of this platform); everything else collapses to hyphens.
 */
export function slugifyTerm(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[\u2000-\u206f\s]+/g, "-")
    .replace(/[^a-z0-9\u0980-\u09FF-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TAXONOMY_LIMITS.maxSlugChars)
    .replace(/-+$/g, "");
}

function requireText(value: string, field: string, max: number, label: { en: string; bn: string }): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) {
    throw new TaxonomyError(`${field}_required`, field, `${label.en} is required.`, `${label.bn} দিতে হবে।`);
  }
  if (text.length > max) {
    throw new TaxonomyError(
      `${field}_too_long`,
      field,
      `${label.en} must be under ${max} characters.`,
      `${label.bn} ${max} অক্ষরের কম হতে হবে।`,
    );
  }
  return text;
}

/**
 * Normalise and hard-validate a term before it reaches the database.
 *
 * Returns row-shaped values, so the server layer is a thin persistence step
 * rather than a second, drifting copy of these rules.
 */
export function prepareTerm(input: TermInput): {
  kind: TermKind;
  slug: string;
  name: string;
  name_en: string | null;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  cover_image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  robots_index: boolean;
} {
  if (!TERM_KINDS.includes(input.kind)) {
    throw new TaxonomyError("kind_invalid", "kind", "Unknown term kind.", "টার্মের ধরন সঠিক নয়।");
  }
  const name = requireText(input.name, "name", TAXONOMY_LIMITS.maxNameChars, { en: "A name", bn: "নাম" });
  const nameEn = input.nameEn.trim().slice(0, TAXONOMY_LIMITS.maxNameChars);

  // Slug falls back to the English name first: a URL made of Bangla is valid
  // but percent-encodes badly in third-party tools, so we prefer the Latin
  // label when the merchant gave us one.
  const slug = slugifyTerm(input.slug || nameEn || name);
  if (!slug) {
    throw new TaxonomyError(
      "slug_required",
      "slug",
      "A usable slug is required — add an English name or type one.",
      "ব্যবহারযোগ্য স্লাগ দরকার — ইংরেজি নাম দিন বা স্লাগ লিখুন।",
    );
  }
  if (RESERVED_TERM_SLUGS.has(slug)) {
    throw new TaxonomyError(
      "slug_reserved",
      "slug",
      `"${slug}" is reserved by the platform.`,
      `"${slug}" প্ল্যাটফর্মের সংরক্ষিত ঠিকানা।`,
    );
  }
  // A numeric slug collides with `/page/2`-style archives in every CMS that
  // ever shipped one; refuse it before it becomes a support ticket.
  if (/^\d+$/.test(slug)) {
    throw new TaxonomyError(
      "slug_numeric",
      "slug",
      "A slug cannot be only digits.",
      "স্লাগ শুধু সংখ্যা হতে পারবে না।",
    );
  }

  if (input.description.length > TAXONOMY_LIMITS.maxDescriptionChars) {
    throw new TaxonomyError(
      "description_too_long",
      "description",
      `Description must be under ${TAXONOMY_LIMITS.maxDescriptionChars} characters.`,
      `বর্ণনা ${TAXONOMY_LIMITS.maxDescriptionChars} অক্ষরের কম হতে হবে।`,
    );
  }
  if (input.parentId && input.parentId === input.id) {
    throw new TaxonomyError(
      "parent_self",
      "parentId",
      "A term cannot be its own parent.",
      "একটি টার্ম নিজের প্যারেন্ট হতে পারে না।",
    );
  }
  // Tags are flat by definition: a tag hierarchy is a category tree wearing a
  // different label, and it breaks the archive breadcrumb contract.
  if (input.kind === "tag" && input.parentId) {
    throw new TaxonomyError(
      "tag_not_nestable",
      "parentId",
      "Tags are flat — only categories can be nested.",
      "ট্যাগ সমান্তরাল — শুধু ক্যাটাগরি নেস্ট করা যায়।",
    );
  }

  const coverImageUrl = input.coverImageUrl.trim();
  if (coverImageUrl && !/^https:\/\//i.test(coverImageUrl)) {
    throw new TaxonomyError(
      "cover_insecure",
      "coverImageUrl",
      "A cover image must be an https URL.",
      "কভার ছবির লিংক https হতে হবে।",
    );
  }

  return {
    kind: input.kind,
    slug,
    name,
    name_en: nameEn || null,
    description: input.description.trim() || null,
    parent_id: input.kind === "category" ? input.parentId || null : null,
    sort_order: Number.isFinite(input.sortOrder) ? Math.max(0, Math.min(9_999, Math.trunc(input.sortOrder))) : 0,
    cover_image_url: coverImageUrl || null,
    meta_title: input.metaTitle.trim().slice(0, TAXONOMY_LIMITS.maxMetaTitleChars) || null,
    meta_description:
      input.metaDescription.trim().slice(0, TAXONOMY_LIMITS.maxMetaDescriptionChars) || null,
    robots_index: !!input.robotsIndex,
  };
}

/* ------------------------------------------------------------------- trees */

/**
 * Would setting `parentId` on `termId` create a cycle, or bust the depth cap?
 *
 * Returns a code instead of throwing so the caller can attach its own field.
 * A cycle in a category tree is not a cosmetic bug: the breadcrumb builder and
 * the archive renderer both walk parents, and an unchecked cycle is an infinite
 * loop inside SSR.
 */
export function parentageIssue(
  rows: Pick<TermRow, "id" | "parent_id">[],
  termId: string | null,
  parentId: string | null,
): "cycle" | "depth" | "missing" | null {
  if (!parentId) return null;
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (!byId.has(parentId)) return "missing";

  // Walk up from the proposed parent. If we meet the term itself, the edge
  // closes a loop. The visited set also protects us from a cycle that already
  // exists in the data (a bad manual write, a restored backup).
  const seen = new Set<string>();
  let cursor: string | null = parentId;
  let depthAbove = 0;
  while (cursor) {
    if (cursor === termId) return "cycle";
    if (seen.has(cursor)) return "cycle";
    seen.add(cursor);
    depthAbove += 1;
    if (depthAbove >= TAXONOMY_LIMITS.maxDepth) return "depth";
    cursor = byId.get(cursor)?.parent_id ?? null;
  }
  return null;
}

/** Deepest level below `termId`, so a re-parent cannot smuggle the cap. */
export function subtreeHeight(rows: Pick<TermRow, "id" | "parent_id">[], termId: string): number {
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = children.get(row.parent_id) ?? [];
    list.push(row.id);
    children.set(row.parent_id, list);
  }
  const walk = (id: string, guard: number): number => {
    if (guard > TAXONOMY_LIMITS.maxDepth + 2) return guard;
    const kids = children.get(id) ?? [];
    if (!kids.length) return 1;
    return 1 + Math.max(...kids.map((kid) => walk(kid, guard + 1)));
  };
  return walk(termId, 1);
}

/** Build the ordered forest. Orphaned rows (parent deleted) surface at root. */
export function buildTermTree(rows: TermRow[]): TermNode[] {
  const byId = new Map<string, TermNode>();
  for (const row of rows) byId.set(row.id, { ...row, depth: 1, children: [] });
  const roots: TermNode[] = [];

  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const order = (nodes: TermNode[], depth: number, guard: number) => {
    if (guard > TAXONOMY_LIMITS.maxDepth + 2) return;
    nodes.sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "bn"),
    );
    for (const node of nodes) {
      node.depth = depth;
      order(node.children, depth + 1, guard + 1);
    }
  };
  order(roots, 1, 1);
  return roots;
}

/** Depth-first flatten, for a `<select>` or a tree table. */
export function flattenTermTree(nodes: TermNode[]): TermNode[] {
  const out: TermNode[] = [];
  const walk = (list: TermNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Ancestor chain, root first, including the term itself. Loop-safe: a corrupt
 * parent chain truncates instead of hanging the render.
 */
export function termAncestry(rows: TermRow[], termId: string): TermRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain: TermRow[] = [];
  const seen = new Set<string>();
  let cursor: string | null = termId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const row = byId.get(cursor);
    if (!row) break;
    chain.unshift(row);
    cursor = row.parent_id ?? null;
  }
  return chain;
}

/* --------------------------------------------------------------- url grammar */

export function blogIndexPath(page = 1): string {
  return page > 1 ? `/blog?page=${page}` : "/blog";
}

export function termArchivePath(kind: TermKind | string, slug: string, page = 1): string {
  const segment = kind === "tag" ? "tag" : "category";
  const base = `/blog/${segment}/${encodeURIComponent(slug)}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

export function articlePath(slug: string): string {
  return `/blog/${encodeURIComponent(slug)}`;
}

/** Clamp an untrusted `?page=` to the crawlable window. */
export function normalizePage(raw: unknown): number {
  const page = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.trunc(page), BLOG_MAX_PAGE);
}

export type Paging = {
  page: number;
  pageSize: number;
  total: number;
  lastPage: number;
  from: number;
  to: number;
  /** True when the requested page is past the end — render empty + noindex. */
  overrun: boolean;
  prevPath: string | null;
  nextPath: string | null;
};

/**
 * Everything a paginated listing needs, derived once so the head links, the
 * `<nav>` and the database range can never disagree.
 */
export function paging(basePath: (page: number) => string, page: number, total: number, pageSize = BLOG_PAGE_SIZE): Paging {
  const safeTotal = Math.max(0, Math.trunc(total));
  const lastPage = Math.max(1, Math.ceil(safeTotal / pageSize));
  const current = normalizePage(page);
  const overrun = current > lastPage;
  const from = (current - 1) * pageSize;
  return {
    page: current,
    pageSize,
    total: safeTotal,
    lastPage,
    from,
    to: from + pageSize - 1,
    overrun,
    prevPath: current > 1 && current <= lastPage + 1 ? basePath(current - 1) : null,
    nextPath: current < lastPage ? basePath(current + 1) : null,
  };
}

/** Compact page window (`1 … 4 5 6 … 20`) for the pagination nav. */
export function pageWindow(page: number, lastPage: number, span = 2): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  const wanted = new Set<number>([1, lastPage]);
  for (let i = page - span; i <= page + span; i += 1) if (i >= 1 && i <= lastPage) wanted.add(i);
  const sorted = [...wanted].sort((a, b) => a - b);
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) out.push("gap");
    out.push(value);
    previous = value;
  }
  return out;
}

/* ------------------------------------------------------------ head + jsonld */

export type HeadTag = Record<string, string>;

export type ArchiveHeadInput = {
  /** Absolute origin, when the request gave us one. Relative hrefs otherwise. */
  origin?: string | null;
  /** Path without the page query, e.g. `/blog/tag/eid`. */
  basePath: string;
  titleEn: string;
  titleBn?: string | null;
  description: string;
  paging: Paging;
  /** Merchant/term opt-out, or an archive that is thin by construction. */
  indexable: boolean;
  imageUrl?: string | null;
  siteName?: string | null;
};

function absolute(origin: string | null | undefined, path: string): string {
  if (!origin || !/^https?:\/\//.test(origin)) return path;
  return `${origin.replace(/\/+$/, "")}${path}`;
}

/**
 * Compose meta + link tags for a listing page.
 *
 * The robots decision is the whole point of this function existing: three
 * separate conditions (owner opt-out, empty archive, page past the end) all
 * mean "do not index", and each of them was a bug the first time it was
 * implemented inline in a route.
 */
export function archiveHead(input: ArchiveHeadInput): { meta: HeadTag[]; links: HeadTag[]; robots: string } {
  const { paging: page } = input;
  const pageSuffix = page.page > 1 ? ` — page ${page.page}` : "";
  const title = `${input.titleEn}${pageSuffix}${input.siteName ? ` — ${input.siteName}` : ""}`.slice(0, 180);
  const description = (input.description || input.titleEn).slice(0, 320);

  const thin = page.total === 0;
  const robots = !input.indexable || thin || page.overrun ? "noindex,follow" : "index,follow";

  const canonicalPath = page.overrun ? input.basePath : blogPagePath(input.basePath, page.page);
  const meta: HeadTag[] = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robots },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: absolute(input.origin, canonicalPath) },
    { name: "twitter:card", content: input.imageUrl ? "summary_large_image" : "summary" },
  ];
  if (input.imageUrl && /^https:\/\//i.test(input.imageUrl)) {
    meta.push(
      { property: "og:image", content: input.imageUrl },
      { name: "twitter:image", content: input.imageUrl },
    );
  }

  const links: HeadTag[] = [{ rel: "canonical", href: absolute(input.origin, canonicalPath) }];
  if (page.prevPath) links.push({ rel: "prev", href: absolute(input.origin, page.prevPath) });
  if (page.nextPath) links.push({ rel: "next", href: absolute(input.origin, page.nextPath) });
  return { meta, links, robots };
}

/** `/blog` + page → the same string the routes link to. */
export function blogPagePath(basePath: string, page: number): string {
  return page > 1 ? `${basePath}?page=${page}` : basePath;
}

export type ListedArticle = {
  slug: string;
  title: string;
  excerpt?: string | null;
  cover_image_url?: string | null;
  published_at?: string | null;
};

/**
 * `CollectionPage` + `ItemList` for a listing. Position is absolute across
 * pages so page 3 does not claim to start at item 1 — the mistake that makes
 * Google merge paginated listings into one duplicate cluster.
 */
export function listingJsonLd(input: {
  origin?: string | null;
  path: string;
  name: string;
  description?: string;
  articles: ListedArticle[];
  paging: Paging;
}): Record<string, unknown> {
  const start = input.paging.from;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: absolute(input.origin, blogPagePath(input.path, input.paging.page)),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.paging.total,
      itemListElement: input.articles.map((article, index) => ({
        "@type": "ListItem",
        position: start + index + 1,
        url: absolute(input.origin, articlePath(article.slug)),
        name: article.title,
      })),
    },
  };
}

/** Breadcrumb trail for an archive or an article, root first. */
export function breadcrumbJsonLd(
  origin: string | null | undefined,
  crumbs: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absolute(origin, crumb.path),
    })),
  };
}

/** Reader-visible crumbs for a term archive, including the blog root. */
export function archiveCrumbs(
  rows: TermRow[],
  termId: string,
  labels: { blog: string },
): { name: string; path: string }[] {
  const chain = termAncestry(rows, termId);
  return [
    { name: labels.blog, path: "/blog" },
    ...chain.map((term) => ({ name: term.name, path: termArchivePath(term.kind, term.slug) })),
  ];
}

/* ----------------------------------------------------------- assignments */

export type TermAssignment = { termId: string; isPrimary: boolean };

/**
 * Normalise the term set posted by the editor.
 *
 * Exactly one primary survives (the first claimant, or the first category when
 * none was marked), duplicates collapse, and the set is capped. The primary is
 * what breadcrumbs and the article's canonical category use, so "zero or two
 * primaries" is not a state the reader surface can render.
 */
export function normalizeAssignments(
  requested: TermAssignment[],
  known: Pick<TermRow, "id" | "kind">[],
): TermAssignment[] {
  const kindById = new Map(known.map((row) => [row.id, row.kind]));
  const seen = new Set<string>();
  const kept: TermAssignment[] = [];
  for (const item of requested) {
    if (!kindById.has(item.termId) || seen.has(item.termId)) continue;
    seen.add(item.termId);
    kept.push({ termId: item.termId, isPrimary: false });
    if (kept.length >= TAXONOMY_LIMITS.maxTermsPerArticle) break;
  }

  const primaryCandidate =
    requested.find((item) => item.isPrimary && kindById.get(item.termId) === "category")?.termId ??
    kept.find((item) => kindById.get(item.termId) === "category")?.termId ??
    null;
  if (primaryCandidate) {
    const target = kept.find((item) => item.termId === primaryCandidate);
    if (target) target.isPrimary = true;
  }
  return kept;
}

/** Tag names an article carries, for the legacy `tags[]` column mirror. */
export function tagNamesFor(assignments: TermAssignment[], known: TermRow[]): string[] {
  const byId = new Map(known.map((row) => [row.id, row]));
  const names = assignments
    .map((item) => byId.get(item.termId))
    .filter((row): row is TermRow => !!row && row.kind === "tag")
    .map((row) => row.name);
  return [...new Set(names)].slice(0, TAXONOMY_LIMITS.maxTermsPerArticle);
}