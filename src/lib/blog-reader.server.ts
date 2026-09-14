import { BLOG_READER_LIMITS, normalizeBlogSearch, type BlogAuthor } from "./blog-reader";
import { paging, type Paging } from "./blog-taxonomy";
import { renderRead } from "./render-read.server";

type LooseDb = { from: (table: string) => any };

async function db(): Promise<LooseDb> {
  const { publicClient } = await import("./pricing.server");
  return publicClient() as unknown as LooseDb;
}

const ARTICLE_COLUMNS =
  "id, merchant_id, author_id, title, title_en, slug, excerpt, body, cover_image_url, published_at, updated_at, meta_title, meta_description, canonical, robots, reading_minutes";
const AUTHOR_COLUMNS =
  "id, merchant_id, slug, display_name, display_name_en, role_title, bio, bio_en, avatar_url, website_url, social_links";

function author(row: any): BlogAuthor {
  return {
    slug: row.slug,
    displayName: row.display_name,
    displayNameEn: row.display_name_en ?? null,
    roleTitle: row.role_title ?? null,
    bio: row.bio ?? null,
    bioEn: row.bio_en ?? null,
    avatarUrl: row.avatar_url ?? null,
    websiteUrl: row.website_url ?? null,
    socialLinks: row.social_links && typeof row.social_links === "object" ? row.social_links : {},
  };
}

function card(row: any, authors: Map<string, BlogAuthor>) {
  return {
    slug: row.slug as string,
    title: row.title as string,
    titleEn: row.title_en ?? null,
    excerpt: row.excerpt ?? null,
    coverImageUrl: row.cover_image_url ?? null,
    publishedAt: row.published_at ?? null,
    merchantName: null,
    merchantSlug: null,
    category: null,
    readingMinutes: Math.max(1, Number(row.reading_minutes ?? 1)),
    author: row.author_id ? authors.get(row.author_id) ?? null : null,
  };
}

async function authorMap(database: LooseDb, ids: string[]): Promise<Map<string, BlogAuthor>> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!unique.length) return new Map();
  const { data } = await database.from("blog_authors").select(AUTHOR_COLUMNS).in("id", unique).eq("is_public", true).limit(100);
  return new Map((data ?? []).map((row: any) => [row.id, author(row)]));
}

export async function loadPublicArticlePage(slug: string) {
  return renderRead<any | null>({
    name: "blog.article",
    key: `blog|article|${slug}`,
    fallback: null,
    context: { surface: "article" },
    load: async () => {
      const database = await db();
      const { data: article } = await database
        .from("articles")
        .select(ARTICLE_COLUMNS)
        .eq("slug", slug)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!article) return null;

      const [merchantResult, authors, termsResult, neighborsResult] = await Promise.all([
        database.from("merchants").select("name, slug").eq("id", article.merchant_id).limit(1).maybeSingle(),
        authorMap(database, article.author_id ? [article.author_id] : []),
        database.from("article_terms").select("term_id, is_primary").eq("article_id", article.id).limit(12),
        database
          .from("articles")
          .select("slug, title, published_at")
          .eq("merchant_id", article.merchant_id)
          .eq("status", "published")
          .lte("published_at", new Date().toISOString())
          .is("deleted_at", null)
          .order("published_at", { ascending: false })
          .limit(100),
      ]);

      const termIds = (termsResult.data ?? []).map((row: any) => row.term_id).slice(0, 12);
      const terms = termIds.length
        ? (await database.from("blog_terms").select("id, kind, slug, name").in("id", termIds).limit(12)).data ?? []
        : [];
      const category = terms.find((term: any) => term.kind === "category") ?? null;

      let relatedRows: any[] = [];
      if (termIds.length) {
        const links = await database
          .from("article_terms")
          .select("article_id")
          .in("term_id", termIds)
          .neq("article_id", article.id)
          .limit(24);
        const relatedIds = [...new Set((links.data ?? []).map((row: any) => row.article_id))].slice(0, 12);
        if (relatedIds.length) {
          relatedRows =
            (await database
              .from("articles")
              .select("slug, title, title_en, excerpt, cover_image_url, published_at, reading_minutes, author_id")
              .in("id", relatedIds)
              .eq("status", "published")
              .lte("published_at", new Date().toISOString())
              .is("deleted_at", null)
              .order("published_at", { ascending: false })
              .limit(BLOG_READER_LIMITS.related)).data ?? [];
        }
      }
      const relatedAuthors = await authorMap(database, relatedRows.map((row) => row.author_id));
      const ordered = neighborsResult.data ?? [];
      const index = ordered.findIndex((row: any) => row.slug === article.slug);
      return {
        article,
        merchant: merchantResult.data ?? null,
        author: article.author_id ? authors.get(article.author_id) ?? null : null,
        terms,
        category,
        previous: index >= 0 ? ordered[index + 1] ?? null : null,
        next: index > 0 ? ordered[index - 1] ?? null : null,
        related: relatedRows.map((row) => card(row, relatedAuthors)),
      };
    },
  });
}

export async function searchPublicBlog(rawQuery: unknown, rawPage: unknown) {
  const query = normalizeBlogSearch(rawQuery);
  const page = Math.max(1, Math.min(200, Number(rawPage) || 1));
  const pagePath = (n: number) => `/blog?q=${encodeURIComponent(query)}${n > 1 ? `&page=${n}` : ""}`;
  const fallback = { query, articles: [], paging: paging(pagePath, page, 0), degraded: true };
  if (query.length < 2) return fallback;
  return renderRead({
    name: "blog.search",
    key: `blog|search|${query.toLocaleLowerCase("en")}|${page}`,
    fallback,
    context: { surface: "search", page },
    load: async () => {
      const database = await db();
      const from = (page - 1) * BLOG_READER_LIMITS.searchPageSize;
      const filter = `title.ilike.%${query}%,title_en.ilike.%${query}%,excerpt.ilike.%${query}%`;
      const { data, count, error } = await database
        .from("articles")
        .select("slug, title, title_en, excerpt, cover_image_url, published_at, reading_minutes, author_id", { count: "exact" })
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .is("deleted_at", null)
        .or(filter)
        .order("published_at", { ascending: false })
        .range(from, from + BLOG_READER_LIMITS.searchPageSize - 1);
      if (error) throw error;
      const authors = await authorMap(database, (data ?? []).map((row: any) => row.author_id));
      return { query, articles: (data ?? []).map((row: any) => card(row, authors)), paging: paging(pagePath, page, count ?? 0), degraded: false };
    },
  });
}

export async function loadAuthorArchive(slug: string, rawPage: unknown) {
  const page = Math.max(1, Math.min(200, Number(rawPage) || 1));
  const path = (n: number) => `/blog/author/${encodeURIComponent(slug)}${n > 1 ? `?page=${n}` : ""}`;
  return renderRead<any | null>({
    name: "blog.author",
    key: `blog|author|${slug}|${page}`,
    fallback: null,
    context: { surface: "author", page },
    load: async () => {
      const database = await db();
      const { data: row } = await database.from("blog_authors").select(AUTHOR_COLUMNS).eq("slug", slug).eq("is_public", true).limit(1).maybeSingle();
      if (!row) return null;
      const base = database.from("articles").select("id", { count: "exact", head: true }).eq("author_id", row.id).eq("status", "published").lte("published_at", new Date().toISOString()).is("deleted_at", null);
      const { count } = await base;
      const pageInfo: Paging = paging(path, page, count ?? 0, BLOG_READER_LIMITS.authorPageSize);
      const { data } = pageInfo.overrun
        ? { data: [] }
        : await database
            .from("articles")
            .select("slug, title, title_en, excerpt, cover_image_url, published_at, reading_minutes, author_id")
            .eq("author_id", row.id)
            .eq("status", "published")
            .lte("published_at", new Date().toISOString())
            .is("deleted_at", null)
            .order("published_at", { ascending: false })
            .range(pageInfo.from, pageInfo.to);
      const mapped = author(row);
      return { author: mapped, articles: (data ?? []).map((item: any) => card(item, new Map([[row.id, mapped]]))), paging: pageInfo };
    },
  });
}

export async function loadBlogFeed() {
  return renderRead<any[]>({
    name: "blog.feed",
    key: "blog|feed|latest",
    fallback: [],
    load: async () => {
      const database = await db();
      const { data, error } = await database
        .from("articles")
        .select("slug, title, excerpt, published_at, updated_at, author_id")
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(BLOG_READER_LIMITS.feedItems);
      if (error) throw error;
      const authors = await authorMap(database, (data ?? []).map((row: any) => row.author_id));
      return (data ?? []).map((row: any) => ({ ...row, author: row.author_id ? authors.get(row.author_id) ?? null : null }));
    },
    ttlSeconds: 300,
    staleSeconds: 1800,
  });
}