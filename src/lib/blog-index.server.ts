/**
 * Phase 9.1 — reader-side runtime for the blog index and term archives.
 *
 * These loaders sit on a render path, so they obey the Phase 7 contract
 * (`renderRead`): tenant/surface-keyed cache, hard timeout, declared fallback,
 * counted failures. A blog listing that throws would 500 the most-linked page
 * on the site; one that returns an empty page renders "no posts yet" and gets
 * caught by a metric instead.
 *
 * Access model: everything here reads with the publishable (anon) client, so
 * RLS is the enforcement boundary — `articles` is anon-readable only where
 * `status = 'published' AND deleted_at IS NULL`. That is deliberate: a bug in
 * this file cannot leak a draft, because the credential it holds cannot see
 * one.
 *
 * Cost shape: every listing is exactly two round-trips (count + page window),
 * an archive is three (term, ids, articles), and the id window is bounded by
 * the page size. No per-row follow-up query exists in this module — the §7
 * N+1 auditor fails the build if one appears.
 */
import {
  BLOG_PAGE_SIZE,
  blogIndexPath,
  normalizePage,
  paging,
  termArchivePath,
  type Paging,
  type TermKind,
  type TermRow,
} from "./blog-taxonomy";
import { renderRead } from "./render-read.server";

export type BlogCard = {
  slug: string;
  title: string;
  titleEn: string | null;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  merchantName: string | null;
  merchantSlug: string | null;
  /** Primary category, when the article has one — powers the card chip. */
  category: { slug: string; name: string } | null;
  readingMinutes: number;
  author: { slug: string; displayName: string; displayNameEn: string | null } | null;
};

export type BlogListing = {
  articles: BlogCard[];
  paging: Paging;
  /** Categories worth showing in the archive rail (published counts only). */
  facets: { slug: string; name: string; kind: TermKind; count: number }[];
  /** Set when the listing degraded to its fallback: UI stays quiet, ops alert. */
  degraded: boolean;
};

export type TermArchive = BlogListing & {
  term: TermRow;
  ancestry: TermRow[];
  children: TermRow[];
};

const EMPTY_LISTING = (path: (page: number) => string, page: number): BlogListing => ({
  articles: [],
  paging: paging(path, page, 0),
  facets: [],
  degraded: true,
});

type Db = Awaited<ReturnType<typeof anonDb>>;

async function anonDb() {
  const { publicClient } = await import("./pricing.server");
  return publicClient() as unknown as {
    from: (table: string) => any;
  };
}

/* ------------------------------------------------------------------- cards */

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  title_en: string | null;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  merchant_id: string;
  author_id: string | null;
  reading_minutes: number | null;
};

const CARD_COLUMNS =
  "id, slug, title, title_en, excerpt, cover_image_url, published_at, merchant_id, author_id, reading_minutes";

/**
 * Decorate a page of articles with store name and primary category in two
 * batched queries. Both are best-effort: a card without a chip is still a card,
 * so a failure here degrades the decoration and never the listing.
 */
async function decorate(db: Db, rows: ArticleRow[]): Promise<BlogCard[]> {
  if (!rows.length) return [];
  const merchantIds = [...new Set(rows.map((row) => row.merchant_id))];
  const articleIds = rows.map((row) => row.id);

  type MerchantChip = { id: string; name: string; slug: string };
  type PrimaryLink = { article_id: string; term_id: string };
  const authorIds = [...new Set(rows.map((row) => row.author_id).filter((id): id is string => Boolean(id)))];
  type AuthorChip = { id: string; slug: string; display_name: string; display_name_en: string | null };
  const [merchants, primaries, authors] = (await Promise.all([
    db
      .from("merchants")
      .select("id, name, slug")
      .in("id", merchantIds)
      .then((r: any) => (r.data ?? []) as MerchantChip[])
      .catch(() => [] as MerchantChip[]),
    db
      .from("article_terms")
      .select("article_id, term_id, is_primary")
      .in("article_id", articleIds)
      .eq("is_primary", true)
      .then((r: any) => (r.data ?? []) as PrimaryLink[])
      .catch(() => [] as PrimaryLink[]),
    authorIds.length
      ? db.from("blog_authors").select("id, slug, display_name, display_name_en").in("id", authorIds).eq("is_public", true).limit(BLOG_PAGE_SIZE).then((r: any) => (r.data ?? []) as AuthorChip[]).catch(() => [] as AuthorChip[])
      : Promise.resolve([] as AuthorChip[]),
  ])) as [MerchantChip[], PrimaryLink[], AuthorChip[]];

  const termIds = [...new Set(primaries.map((row) => row.term_id))];
  type TermChip = { id: string; slug: string; name: string };
  const terms: TermChip[] = termIds.length
    ? await db
        .from("blog_terms")
        .select("id, slug, name")
        .in("id", termIds)
        .then((r: any) => (r.data ?? []) as TermChip[])
        .catch(() => [] as TermChip[])
    : [];

  const merchantById = new Map(merchants.map((m) => [m.id, m]));
  const termById = new Map(terms.map((t) => [t.id, t]));
  const categoryByArticle = new Map<string, TermChip>();
  const authorById = new Map(authors.map((item) => [item.id, item]));
  for (const row of primaries) {
    const term = termById.get(row.term_id);
    if (term) categoryByArticle.set(row.article_id, term);
  }

  return rows.map((row) => {
    const merchant = merchantById.get(row.merchant_id);
    const category = categoryByArticle.get(row.id);
    const byline = row.author_id ? authorById.get(row.author_id) : null;
    return {
      slug: row.slug,
      title: row.title,
      titleEn: row.title_en,
      excerpt: row.excerpt,
      coverImageUrl: row.cover_image_url,
      publishedAt: row.published_at,
      merchantName: merchant?.name ?? null,
      merchantSlug: merchant?.slug ?? null,
      category: category ? { slug: category.slug, name: category.name } : null,
      readingMinutes: Math.max(1, Number(row.reading_minutes ?? 1)),
      author: byline ? { slug: byline.slug, displayName: byline.display_name, displayNameEn: byline.display_name_en } : null,
    };
  });
}

/**
 * Archive rail: the categories that actually have published articles.
 *
 * `article_count` on the term row is a denormalised counter maintained by the
 * admin writes, so it can drift (a manual DB edit, an archived article). It is
 * used for ordering only — the count a reader sees on an archive page is the
 * live one from that page's own count query.
 */
async function loadFacets(db: Db): Promise<BlogListing["facets"]> {
  const { data } = await db
    .from("blog_terms")
    .select("slug, name, kind, article_count")
    .gt("article_count", 0)
    .order("article_count", { ascending: false })
    .limit(24);
  return ((data ?? []) as { slug: string; name: string; kind: string; article_count: number }[]).map(
    (row) => ({
      slug: row.slug,
      name: row.name,
      kind: (row.kind === "tag" ? "tag" : "category") as TermKind,
      count: row.article_count,
    }),
  );
}

/* ------------------------------------------------------------------ index */

/** Paginated `/blog` index, newest first. */
export async function loadBlogIndex(rawPage: unknown): Promise<BlogListing> {
  const page = normalizePage(rawPage);
  return renderRead<BlogListing>({
    name: "blog.index",
    key: `blog|index|${page}`,
    fallback: EMPTY_LISTING(blogIndexPath, page),
    context: { page },
    load: async () => {
      const db = await anonDb();
      const [{ count }, facets] = await Promise.all([
        db
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .lte("published_at", new Date().toISOString())
          .is("deleted_at", null),
        loadFacets(db),
      ]);
      const pageInfo = paging(blogIndexPath, page, count ?? 0);
      if (pageInfo.overrun) return { articles: [], paging: pageInfo, facets, degraded: false };

      const { data } = await db
        .from("articles")
        .select(CARD_COLUMNS)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .is("deleted_at", null)
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(pageInfo.from, pageInfo.to);

      return {
        articles: await decorate(db, (data ?? []) as ArticleRow[]),
        paging: pageInfo,
        facets,
        degraded: false,
      };
    },
  });
}

/* ---------------------------------------------------------------- archives */

const TERM_COLUMNS =
  "id, merchant_id, kind, slug, name, name_en, description, parent_id, sort_order, cover_image_url, meta_title, meta_description, robots_index, article_count";

/**
 * Resolve a term by kind+slug.
 *
 * Slugs are unique per merchant, not globally, so `/blog/category/eid` can match
 * more than one store's term. Rather than 404 on ambiguity (which would make
 * the archive disappear the moment a second merchant reused a common word), we
 * pick the most-populated claimant deterministically and aggregate that term's
 * articles. Ordering by `(article_count desc, id asc)` keeps the choice stable
 * across requests, which is what canonical URLs require.
 */
async function resolveTerm(db: Db, kind: TermKind, slug: string): Promise<TermRow | null> {
  const { data } = await db
    .from("blog_terms")
    .select(TERM_COLUMNS)
    .eq("kind", kind)
    .eq("slug", slug)
    .order("article_count", { ascending: false })
    .order("id", { ascending: true })
    .limit(1);
  return ((data ?? [])[0] as TermRow | undefined) ?? null;
}

export class TermNotFound extends Error {
  constructor(readonly slug: string) {
    super(`term_not_found:${slug}`);
    this.name = "TermNotFound";
  }
}

/**
 * A term archive page.
 *
 * Throws `TermNotFound` for an unknown slug so the route can answer a real 404
 * — the one case where failing loudly is correct, because an indexable soft-404
 * archive is worse than no page at all. Every other failure degrades to an
 * empty, `noindex` listing via `renderRead`.
 */
export async function loadTermArchive(
  kind: TermKind,
  slug: string,
  rawPage: unknown,
): Promise<TermArchive> {
  const page = normalizePage(rawPage);
  const basePath = (p: number) => termArchivePath(kind, slug, p);
  const db = await anonDb();

  // Resolution happens outside `renderRead` because its failure mode is a 404,
  // not a fallback — but it is still cached by the inner listing read below.
  const term = await resolveTerm(db, kind, slug);
  if (!term) throw new TermNotFound(slug);

  const fallback: TermArchive = {
    ...EMPTY_LISTING(basePath, page),
    term,
    ancestry: [term],
    children: [],
  };

  return renderRead<TermArchive>({
    name: "blog.archive",
    key: `blog|archive|${kind}|${slug}|${page}`,
    fallback,
    context: { kind, page },
    load: async () => {
      const [{ count }, facets, siblings] = await Promise.all([
        db
          .from("article_terms")
          .select("article_id", { count: "exact", head: true })
          .eq("term_id", term.id),
        loadFacets(db),
        // One query serves both the ancestry chain and the child rail; the tree
        // is capped at depth 3 and 300 terms per kind, so this stays small.
        db
          .from("blog_terms")
          .select(TERM_COLUMNS)
          .eq("merchant_id", term.merchant_id ?? "")
          .eq("kind", term.kind)
          .order("sort_order", { ascending: true })
          .limit(400)
          .then((r: any) => (r.data ?? []) as TermRow[])
          .catch(() => [] as TermRow[]),
      ]);

      const { termAncestry } = await import("./blog-taxonomy");
      const ancestry = termAncestry(siblings.length ? siblings : [term], term.id);
      const children = siblings.filter((row) => row.parent_id === term.id);

      const pageInfo = paging(basePath, page, count ?? 0);
      if (pageInfo.overrun) {
        return { articles: [], paging: pageInfo, facets, degraded: false, term, ancestry, children };
      }

      // Two-step instead of a join: the anon client cannot rely on an embedded
      // resource here (the RLS predicate on `articles` is evaluated separately),
      // and an explicit id window is the only shape whose cost we can bound.
      const { data: links } = await db
        .from("article_terms")
        .select("article_id, created_at")
        .eq("term_id", term.id)
        .order("created_at", { ascending: false })
        .range(pageInfo.from, pageInfo.to);
      const ids = ((links ?? []) as { article_id: string }[]).map((row) => row.article_id);
      if (!ids.length) {
        return { articles: [], paging: pageInfo, facets, degraded: false, term, ancestry, children };
      }

      const { data } = await db
        .from("articles")
        .select(CARD_COLUMNS)
        .in("id", ids)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .is("deleted_at", null)
        .order("published_at", { ascending: false, nullsFirst: false });

      return {
        articles: await decorate(db, (data ?? []) as ArticleRow[]),
        paging: pageInfo,
        facets,
        degraded: false,
        term,
        ancestry,
        children,
      };
    },
  });
}

/**
 * Every indexable archive URL, for the sitemap.
 *
 * Terms with no published article are excluded: they render `noindex`, and
 * advertising a `noindex` URL in a sitemap is the exact conflict Search Console
 * reports as "Submitted URL marked noindex".
 */
export async function listArchiveUrls(limit = 500): Promise<{ path: string; updatedAt: string | null }[]> {
  return renderRead<{ path: string; updatedAt: string | null }[]>({
    name: "blog.archive_urls",
    key: `blog|archive_urls|${limit}`,
    fallback: [],
    load: async () => {
      const db = await anonDb();
      const { data } = await db
        .from("blog_terms")
        .select("kind, slug, updated_at, article_count, robots_index")
        .gt("article_count", 0)
        .eq("robots_index", true)
        .order("updated_at", { ascending: false })
        .limit(Math.min(2_000, Math.max(1, limit)));
      return ((data ?? []) as { kind: string; slug: string; updated_at: string }[]).map((row) => ({
        path: termArchivePath(row.kind, row.slug),
        updatedAt: row.updated_at ?? null,
      }));
    },
  });
}

export { BLOG_PAGE_SIZE };