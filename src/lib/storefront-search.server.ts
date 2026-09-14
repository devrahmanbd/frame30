/**
 * Storefront read runtime: search, tenant pages, tenant sitemap.
 *
 * Every read here is anonymous shopper traffic, so each path is bounded three
 * ways: the database decides the result set (`storefront_search` is the only
 * query), a named rate-limit bucket caps abuse, and a short tenant-keyed cache
 * absorbs bursts. Failures are logged and reported, never swallowed silently.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { publicClient } from "./pricing.server";
import { cached } from "./cache.server";
import { captureError, incr, log, observe } from "./observability.server";
import { RateLimitError, enforceRateLimit } from "./rate-limit.server";
import {
  EMPTY_RESULT,
  PAGE_SIZE,
  offsetOf,
  searchCacheKey,
  type SearchParams,
  type SearchResult,
  type SearchHit,
} from "./storefront-search";

type Client = SupabaseClient<Database>;

export type SearchOutcome =
  | { status: "ok"; result: SearchResult }
  | { status: "not_found" }
  | { status: "rate_limited"; resetAt: string }
  | { status: "unavailable" };

export async function runStorefrontSearch(
  slug: string,
  params: SearchParams,
  subject: string,
): Promise<SearchOutcome> {
  try {
    await enforceRateLimit("storefront.search", `${slug}:${subject}`);
  } catch (err) {
    if (err instanceof RateLimitError) {
      incr("framique_storefront_search_total", { outcome: "rate_limited" });
      return { status: "rate_limited", resetAt: err.resetAt };
    }
    throw err;
  }

  const started = Date.now();
  try {
    const result = await cached(searchCacheKey(slug, params), 20, () => searchStore(slug, params), {
      staleSeconds: 40,
    });
    observe("framique_storefront_search_ms", Date.now() - started, { sort: params.sort });
    if (!result.found) {
      incr("framique_storefront_search_total", { outcome: "not_found" });
      return { status: "not_found" };
    }
    incr("framique_storefront_search_total", {
      outcome: result.total > 0 ? "hit" : "empty",
      sort: params.sort,
      engine: result.engine ?? "postgres",
    });
    if (params.q && result.total === 0) {
      // Zero-result terms are the merchandising signal worth keeping; the term
      // is shopper-typed text, never linked to a person.
      log("info", "storefront.search.zero_results", { slug, term: params.q.slice(0, 40) });
    }
    return { status: "ok", result };
  } catch (err) {
    incr("framique_storefront_search_total", { outcome: "error" });
    await captureError(err, { scope: "storefront.search", slug });
    return { status: "unavailable" };
  }
}

/** Cheap slug → tenant lookup; the search path needs the id, not the row. */
async function resolveStore(slug: string) {
  return cached(`sf-store|${slug}`, 300, async () => {
    const { data } = await publicClient()
      .from("merchants")
      .select("id, currency_code")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    return data ?? null;
  });
}

/**
 * Runs the query through the pluggable backend (§4.4) with the Postgres RPC as
 * the fallback closure. Two properties matter here:
 *
 *  - the shopper never sees an error because a Meilisearch node is down — the
 *    breaker opens and Postgres answers, marked `degraded` for the UI;
 *  - the *result contract* is identical either way, so the page renders the
 *    same regardless of which engine served it.
 */
async function searchStore(slug: string, p: SearchParams): Promise<SearchResult> {
  const store = await resolveStore(slug);
  if (!store) return { ...EMPTY_RESULT, found: false };

  const { searchWithBackend } = await import("./search-backend.server");

  // Captured so the Postgres path can hand back facets and currency, which a
  // remote engine does not compute for us.
  let native: SearchResult | null = null;

  const outcome = await searchWithBackend(
    store.id,
    {
      term: p.q,
      limit: PAGE_SIZE,
      offset: offsetOf(p),
      sort: p.sort === "title" ? undefined : p.sort,
      filters: {
        ...(p.category ? { category: p.category } : {}),
        ...(p.collection ? { collection: p.collection } : {}),
        ...(p.kind ? { kind: p.kind } : {}),
        ...(p.inStock ? { in_stock: true } : {}),
        ...(p.minMinor !== null ? { price_min_minor: p.minMinor } : {}),
        ...(p.maxMinor !== null ? { price_max_minor: p.maxMinor } : {}),
      },
    },
    async () => {
      native = await querySearch(slug, p);
      return { hits: native.items as unknown as { id: string }[], total: native.total };
    },
  );

  const base: SearchResult =
    native !== null
      ? (native as SearchResult)
      : {
          ...EMPTY_RESULT,
          found: true,
          currency_code: store.currency_code ?? "BDT",
          total: outcome.total,
          limit: PAGE_SIZE,
          offset: offsetOf(p),
          sort: p.sort,
          items: outcome.hits.map(toHit),
          // Facets come from Postgres regardless: they describe the whole
          // catalogue slice, not the current page, and stay cached separately.
          facets: (await facetsOnly(slug, p)).facets,
        };

  return withImages({ ...base, engine: outcome.engine, degraded: outcome.fellBack });
}

/** Maps an indexed document back onto the storefront hit contract. */
function toHit(doc: Record<string, unknown>): SearchHit {
  const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  return {
    id: str(doc["id"]),
    title: str(doc["title"]),
    slug: str(doc["slug"]),
    description: str(doc["description"]),
    image_url: typeof doc["image_url"] === "string" ? (doc["image_url"] as string) : null,
    kind: str(doc["kind"], "physical"),
    price_minor: num(doc["price_minor"]),
    compare_at_minor: typeof doc["compare_at_minor"] === "number" ? (doc["compare_at_minor"] as number) : null,
    stock: num(doc["stock"]),
    category: typeof doc["category"] === "string" ? (doc["category"] as string) : null,
  };
}

/** Attaches signed responsive variants; a signing failure degrades to raw URLs. */
async function withImages(result: SearchResult): Promise<SearchResult> {
  try {
    const { responsiveImage } = await import("./image-cdn.server");
    const items = await Promise.all(
      result.items.map(async (item) => ({ ...item, image: await responsiveImage(item.image_url, "card") })),
    );
    return { ...result, items };
  } catch (err) {
    log("warn", "storefront.search.image_sign_failed", { reason: (err as Error).message });
    return result;
  }
}

/** Facet-only probe: one row, same filters, cached longer than the page itself. */
async function facetsOnly(slug: string, p: SearchParams): Promise<SearchResult> {
  return cached(`sf-facets|${slug}|${searchCacheKey(slug, { ...p, page: 1 })}`, 60, () =>
    querySearch(slug, { ...p, page: 1 }),
  );
}

async function querySearch(slug: string, p: SearchParams): Promise<SearchResult> {
  const db = publicClient();
  const { data, error } = await db.rpc("storefront_search", {
    _slug: slug,
    _q: p.q || undefined,
    _category: p.category ?? undefined,
    _collection: p.collection ?? undefined,
    _kind: p.kind ?? undefined,
    _min_minor: p.minMinor ?? undefined,
    _max_minor: p.maxMinor ?? undefined,
    _in_stock: p.inStock,
    _sort: p.sort,
    _limit: PAGE_SIZE,
    _offset: offsetOf(p),
  });
  if (error) throw error;
  const payload = (data ?? {}) as unknown as Partial<SearchResult> & { found?: boolean };
  if (payload.found === false) return { ...EMPTY_RESULT, found: false };
  return { ...EMPTY_RESULT, ...payload, found: true };
}

/* --------------------------------- tenant pages --------------------------- */

export type StorePage = {
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  meta_title: string | null;
  meta_description: string | null;
  cover_image_url: string | null;
  robots: string;
  updated_at: string;
  /** Phase 17 — installed theme pinned to this page, or null for the site theme. */
  theme_id: string | null;
};

export type StorePageNavItem = { slug: string; title: string };

export async function loadStorePage(storeSlug: string, pageSlug: string) {
  return cached(`sf-page|${storeSlug}|${pageSlug}`, 60, async () => {
    const db = publicClient();
    const { data: merchant } = await db
      .from("merchants")
      .select("id, name, slug, currency_code")
      .eq("slug", storeSlug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) return null;

    const { data: page, error } = await db
      .from("storefront_pages")
      .select(
        "id, slug, title, excerpt, body_markdown, meta_title, meta_description, cover_image_url, robots, updated_at, theme_id",
      )
      .eq("merchant_id", merchant.id)
      .eq("slug", pageSlug)
      .eq("is_published", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!page) return null;

    incr("framique_storefront_page_view_total", { store: merchant.slug });
    const { resolveSeo } = await import("./seo.server");
    const { resolveSeoWithTemplate } = await import("./template-seo.server");
    const seo = await resolveSeoWithTemplate(
      merchant.id,
      "page",
      await resolveSeo(merchant.id, "page", (page as { id: string }).id),
    );
    return { merchant, page: page as StorePage, seo };
  });
}

export async function listStorePageNav(merchantId: string): Promise<StorePageNavItem[]> {
  return cached(`sf-page-nav|${merchantId}`, 120, async () => {
    const db = publicClient();
    const { data } = await db
      .from("storefront_pages")
      .select("slug, title")
      .eq("merchant_id", merchantId)
      .eq("is_published", true)
      .eq("show_in_nav", true)
      .is("deleted_at", null)
      .order("position")
      .limit(12);
    return (data ?? []) as StorePageNavItem[];
  });
}

/* -------------------------------- tenant sitemap -------------------------- */

export type SitemapUrl = { path: string; lastmod?: string; changefreq: string; priority: string };

/** One sitemap per tenant: a store never advertises another store's URLs. */
export async function loadStoreSitemap(slug: string): Promise<SitemapUrl[] | null> {
  return cached(`sf-sitemap|${slug}`, 300, async () => {
    const db = publicClient();
    const { data: merchant } = await db
      .from("merchants")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) return null;

    const [{ data: products }, { data: pages }] = await Promise.all([
      db
        .from("products")
        .select("slug, updated_at")
        .eq("merchant_id", merchant.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(2000),
      db
        .from("storefront_pages")
        .select("slug, updated_at, robots")
        .eq("merchant_id", merchant.id)
        .eq("is_published", true)
        .is("deleted_at", null)
        .limit(200),
    ]);

    const urls: SitemapUrl[] = [
      { path: `/store/${slug}`, changefreq: "daily", priority: "1.0" },
      { path: `/store/${slug}/search`, changefreq: "weekly", priority: "0.4" },
    ];
    for (const p of products ?? []) {
      urls.push({
        path: `/store/${slug}/p/${p.slug}`,
        lastmod: p.updated_at?.slice(0, 10),
        changefreq: "weekly",
        priority: "0.8",
      });
    }
    for (const p of pages ?? []) {
      // A noindex page is deliberately kept out of the sitemap.
      if (p.robots.startsWith("noindex")) continue;
      urls.push({
        path: `/store/${slug}/pages/${p.slug}`,
        lastmod: p.updated_at?.slice(0, 10),
        changefreq: "monthly",
        priority: "0.5",
      });
    }
    return urls;
  });
}

export function renderSitemapXml(origin: string, urls: SitemapUrl[]) {
  const body = urls
    .map((u) =>
      [
        "  <url>",
        `    <loc>${origin}${u.path}</loc>`,
        u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
        `    <changefreq>${u.changefreq}</changefreq>`,
        `    <priority>${u.priority}</priority>`,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

/* ------------------------------- admin: pages ----------------------------- */

export type AdminPage = StorePage & {
  id: string;
  is_published: boolean;
  show_in_nav: boolean;
  position: number;
  published_at: string | null;
};

export async function loadPagesDesk(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("storefront_pages")
    .select(
      "id, slug, title, excerpt, body_markdown, meta_title, meta_description, cover_image_url, robots, is_published, show_in_nav, position, published_at, updated_at",
    )
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .filter("status", "neq", "trash")
    .order("position")
    .limit(200);
  if (error) throw error;
  const pages = (data ?? []) as AdminPage[];
  return {
    pages,
    stats: {
      total: pages.length,
      published: pages.filter((p) => p.is_published).length,
      missingMeta: pages.filter((p) => !p.meta_description && !p.excerpt).length,
      noindex: pages.filter((p) => p.robots.startsWith("noindex")).length,
    },
  };
}

export type PageInput = {
  id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  robots: string;
  isPublished: boolean;
  showInNav: boolean;
  position: number;
};

/** The store slug a page's public URLs are built from. */
async function storeSlugOf(db: Client, merchantId: string): Promise<string | undefined> {
  const { data } = await (db as any).from("merchants").select("slug").eq("id", merchantId).maybeSingle();
  return data?.slug ?? undefined;
}

export async function savePage(db: Client, merchantId: string, input: PageInput) {
  const row = {
    merchant_id: merchantId,
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt || null,
    body_markdown: input.bodyMarkdown,
    meta_title: input.metaTitle || null,
    meta_description: input.metaDescription || null,
    robots: input.robots,
    is_published: input.isPublished,
    show_in_nav: input.showInNav,
    position: input.position,
    published_at: input.isPublished ? new Date().toISOString() : null,
  };
  let previousSlug: string | null = null;
  if (input.id) {
    const { data: before } = await (db as any)
      .from("storefront_pages")
      .select("slug")
      .eq("id", input.id)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    previousSlug = before?.slug ?? null;
  }
  const query = input.id
    ? db.from("storefront_pages").update(row).eq("id", input.id).eq("merchant_id", merchantId)
    : db.from("storefront_pages").insert(row);
  const { error } = await query;
  if (error) throw error;

  /* A renamed page keeps its old URL alive as a 301: the previous link is
   * already indexed and shared. Failing to write the redirect must not fail
   * the save — the content edit is what the merchant asked for. */
  if (previousSlug && previousSlug !== input.slug) {
    try {
      const storeSlug = await storeSlugOf(db, merchantId);
      const { recordSlugChange } = await import("./url-lifecycle.server");
      await recordSlugChange({
        merchantId,
        storeSlug,
        entityType: "page",
        basePath: `/store/${storeSlug}/pages`,
        oldSlug: previousSlug,
        newSlug: input.slug,
      });
    } catch (redirectError) {
      log("warn", "storefront.page.redirect_failed", {
        merchant_id: merchantId,
        message: redirectError instanceof Error ? redirectError.message : String(redirectError),
      });
    }
  }
  incr("framique_storefront_page_saved_total", { published: String(input.isPublished) });
  log("info", "storefront.page.saved", { merchant_id: merchantId, slug: input.slug });
}

/** Soft delete keeps the URL auditable and restorable instead of vanishing. */
export async function archivePage(db: Client, merchantId: string, pageId: string) {
  const { data: before } = await (db as any)
    .from("storefront_pages")
    .select("slug")
    .eq("id", pageId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  const { error } = await db
    .from("storefront_pages")
    .update({ deleted_at: new Date().toISOString(), is_published: false })
    .eq("id", pageId)
    .eq("merchant_id", merchantId);
  if (error) throw error;
  // An archived page answers 410 rather than a soft 404, so crawlers drop it
  // instead of retrying the URL for months.
  if (before?.slug) {
    try {
      const storeSlug = await storeSlugOf(db, merchantId);
      const { recordTombstone } = await import("./url-lifecycle.server");
      await recordTombstone({
        merchantId,
        storeSlug,
        entityType: "page",
        basePath: `/store/${storeSlug}/pages`,
        slug: before.slug,
      });
    } catch {
      /* the archive itself succeeded; the tombstone is best-effort */
    }
  }
  incr("framique_storefront_page_archived_total");
}

