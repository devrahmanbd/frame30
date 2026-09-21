/**
 * Tenant-scoped blog readers (T5).
 *
 * The global readers (`blog-index.server`, `blog-reader.server`) aggregate
 * every merchant's articles. These clones scope every query by merchant_id
 * with tenant-prefixed renderRead keys, so one store's blog can never leak
 * another's bylines — and identical slugs in two stores resolve independently.
 */
import {
  blogIndexPath,
  normalizePage,
  paging,
  type Paging,
} from "./blog-taxonomy";
import type { BlogListing } from "./blog-index.server";
import { renderRead } from "./render-read.server";

const CARD_COLUMNS =
  "id, slug, title, title_en, excerpt, cover_image_url, published_at, merchant_id, author_id, reading_minutes";

const ARTICLE_COLUMNS =
  "id, merchant_id, author_id, title, title_en, slug, excerpt, body, cover_image_url, published_at, updated_at, meta_title, meta_description, canonical, robots, reading_minutes";

type Db = {
  from: (table: string) => any;
};

async function anonDb(): Promise<Db> {
  const { publicClient } = await import("./pricing.server");
  return publicClient() as unknown as Db;
}

type CardRow = {
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

function toCard(
  row: CardRow,
  merchant: { name: string; slug: string } | null,
  category: { slug: string; name: string } | null,
): BlogListing["articles"][number] {
  return {
    slug: row.slug,
    title: row.title,
    titleEn: row.title_en,
    excerpt: row.excerpt,
    coverImageUrl: row.cover_image_url,
    publishedAt: row.published_at,
    merchantName: merchant?.name ?? null,
    merchantSlug: merchant?.slug ?? null,
    category,
    readingMinutes: Math.max(1, Number(row.reading_minutes ?? 1)),
    author: null,
  };
}

const EMPTY_LISTING = (page: number): BlogListing => ({
  articles: [],
  paging: paging(blogIndexPath, page, 0),
  facets: [],
  degraded: true,
});

async function scopedFacets(
  db: Db,
  merchantId: string,
): Promise<BlogListing["facets"]> {
  const { data } = await db
    .from("blog_terms")
    .select("slug, name, kind, article_count")
    .eq("merchant_id", merchantId)
    .gt("article_count", 0)
    .order("article_count", { ascending: false })
    .limit(24);
  return ((data ?? []) as {
    slug: string;
    name: string;
    kind: string;
    article_count: number;
  }[]).map((row) => ({
    slug: row.slug,
    name: row.name,
    kind: (row.kind === "tag" ? "tag" : "category") as "tag" | "category",
    count: row.article_count,
  }));
}

/** Paginated article index for one merchant, newest first. */
export async function loadStoreBlogIndex(
  merchantId: string,
  rawPage: unknown,
  dbOverride?: Db,
): Promise<BlogListing> {
  const page = normalizePage(rawPage);
  const db = dbOverride ?? (await anonDb());
  return renderRead<BlogListing>({
    name: "store-blog.index",
    key: `store-blog|${merchantId}|index|${page}`,
    fallback: EMPTY_LISTING(page),
    context: { page, merchantId },
    load: async () => {
      const now = new Date().toISOString();
      const [{ count }, facets] = await Promise.all([
        db
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("merchant_id", merchantId)
          .eq("status", "published")
          .lte("published_at", now)
          .is("deleted_at", null),
        scopedFacets(db, merchantId),
      ]);
      const pageInfo: Paging = paging(blogIndexPath, page, count ?? 0);
      if (pageInfo.overrun)
        return { articles: [], paging: pageInfo, facets, degraded: false };
      const { data } = await db
        .from("articles")
        .select(CARD_COLUMNS)
        .eq("merchant_id", merchantId)
        .eq("status", "published")
        .lte("published_at", now)
        .is("deleted_at", null)
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(pageInfo.from, pageInfo.to);
      const rows = (data ?? []) as CardRow[];
      let merchant: { name: string; slug: string } | null = null;
      let categoryByArticle = new Map<string, { slug: string; name: string }>();
      if (rows.length > 0) {
        const { data: m } = await db
          .from("merchants")
          .select("name, slug")
          .eq("id", merchantId)
          .maybeSingle();
        merchant = (m as { name: string; slug: string } | null) ?? null;
        const { data: links } = await db
          .from("article_terms")
          .select("article_id, term_id, is_primary")
          .in(
            "article_id",
            rows.map((r) => r.id),
          )
          .eq("is_primary", true);
        const termIds = [
          ...new Set(
            ((links ?? []) as { term_id: string }[]).map((l) => l.term_id),
          ),
        ];
        if (termIds.length > 0) {
          const { data: terms } = await db
            .from("blog_terms")
            .select("id, slug, name")
            .in("id", termIds)
            .eq("merchant_id", merchantId);
          const byId = new Map(
            ((terms ?? []) as { id: string; slug: string; name: string }[]).map(
              (t) => [t.id, { slug: t.slug, name: t.name }],
            ),
          );
          for (const l of (links ?? []) as {
            article_id: string;
            term_id: string;
          }[]) {
            const term = byId.get(l.term_id);
            if (term) categoryByArticle.set(l.article_id, term);
          }
        }
      }
      return {
        articles: rows.map((row) =>
          toCard(row, merchant, categoryByArticle.get(row.id) ?? null),
        ),
        paging: pageInfo,
        facets,
        degraded: false,
      };
    },
  });
}

export type StoreArticle = {
  slug: string;
  title: string;
  titleEn: string | null;
  excerpt: string | null;
  body: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robots: string | null;
  readingMinutes: number;
  merchant: { name: string; slug: string } | null;
  category: { slug: string; name: string } | null;
};

/** One published article of one merchant, or null. */
export async function loadStoreArticle(
  merchantId: string,
  slug: string,
  dbOverride?: Db,
): Promise<StoreArticle | null> {
  const database = dbOverride ?? (await anonDb());
  return renderRead<StoreArticle | null>({
    name: "store-blog.article",
    key: `store-blog|${merchantId}|article|${slug}`,
    fallback: null,
    context: { surface: "article", merchantId },
    load: async () => {
      const now = new Date().toISOString();
      const { data: article } = await database
        .from("articles")
        .select(ARTICLE_COLUMNS)
        .eq("merchant_id", merchantId)
        .eq("slug", slug)
        .eq("status", "published")
        .lte("published_at", now)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!article) return null;
      const row = article as Record<string, any>;
      const { data: merchant } = await database
        .from("merchants")
        .select("name, slug")
        .eq("id", merchantId)
        .limit(1)
        .maybeSingle();
      const { data: links } = await database
        .from("article_terms")
        .select("term_id, is_primary")
        .eq("article_id", row["id"])
        .limit(12);
      const termIds = ((links ?? []) as { term_id: string }[]).map(
        (l) => l.term_id,
      );
      let category: { slug: string; name: string } | null = null;
      if (termIds.length > 0) {
        const { data: terms } = await database
          .from("blog_terms")
          .select("id, kind, slug, name")
          .in("id", termIds)
          .eq("merchant_id", merchantId)
          .limit(12);
        const found = ((terms ?? []) as {
          kind: string;
          slug: string;
          name: string;
        }[]).find((t) => t.kind === "category");
        if (found) category = { slug: found.slug, name: found.name };
      }
      return {
        slug: row["slug"],
        title: row["title"],
        titleEn: row["title_en"] ?? null,
        excerpt: row["excerpt"] ?? null,
        body: row["body"] ?? null,
        coverImageUrl: row["cover_image_url"] ?? null,
        publishedAt: row["published_at"] ?? null,
        updatedAt: row["updated_at"] ?? null,
        metaTitle: row["meta_title"] ?? null,
        metaDescription: row["meta_description"] ?? null,
        canonical: row["canonical"] ?? null,
        robots: row["robots"] ?? null,
        readingMinutes: Math.max(1, Number(row["reading_minutes"] ?? 1)),
        merchant: (merchant as { name: string; slug: string } | null) ?? null,
        category,
      };
    },
  });
}
