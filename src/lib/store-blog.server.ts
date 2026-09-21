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
  // Live schema has no per-term merchant scope or counters: derive facets
  // from the merchant's own articles' tags instead (best-effort, empty rail
  // when the merchant has no tagged articles).
  try {
    const { data } = await db
      .from("articles")
      .select("tags")
      .eq("merchant_id", merchantId)
      .eq("status", "published")
      .is("deleted_at", null)
      .limit(200);
    const counts = new Map<string, number>();
    for (const row of ((data ?? []) as { tags?: unknown }[])) {
      const tags = Array.isArray(row.tags) ? row.tags : [];
      for (const tag of tags) {
        if (typeof tag !== "string") continue;
        const slug = tag.trim().toLowerCase();
        if (!slug) continue;
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([slug, count]) => ({ slug, name: slug, kind: "tag" as const, count }));
  } catch {
    return [];
  }
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
        // Live schema stores term strings (no term_id/is_primary): first
        // category-kind term per article. Best-effort — a missing chip never
        // blocks the card.
        try {
          const { data: links } = await db
            .from("article_terms")
            .select("article_id, term, kind")
            .in(
              "article_id",
              rows.map((r) => r.id),
            );
          for (const l of (links ?? []) as {
            article_id: string;
            term: string;
            kind: string;
          }[]) {
            if (
              l.kind === "category" &&
              l.term &&
              !categoryByArticle.has(l.article_id)
            ) {
              categoryByArticle.set(l.article_id, {
                slug: l.term,
                name: l.term,
              });
            }
          }
        } catch {
          // best-effort only
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
        .select("term, kind")
        .eq("article_id", row["id"])
        .limit(12)
        .then(
          (r: { data: unknown; error: unknown }) =>
            (r.error ? { data: [] } : r) as {
            data: { term: string; kind: string }[] | null;
          },
        );
      const termIds: string[] = [];
      let category: { slug: string; name: string } | null = null;
      for (const l of (links ?? []) as { term: string; kind: string }[]) {
        if (l.kind === "category" && !category && l.term) {
          category = { slug: l.term, name: l.term };
          termIds.push(l.term);
        }
      }
      if (category) {
        // Prefer the canonical display name when the shared term exists.
        try {
          const { data: terms } = await database
            .from("blog_terms")
            .select("slug, name")
            .eq("slug", category.slug)
            .limit(1);
          const found = ((terms ?? []) as { slug: string; name: string }[])[0];
          if (found) category = { slug: found.slug, name: found.name };
        } catch {
          // best-effort only
        }
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
