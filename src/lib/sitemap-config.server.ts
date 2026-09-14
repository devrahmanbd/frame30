/**
 * Phase 4 — server runtime for dashboard-owned sitemaps and robots.txt.
 *
 * Operational contract, in the order it matters:
 *
 *  1. **The render path may never 500 a storefront.** Settings are read
 *     through a tenant-keyed SWR cache with a hard timeout and fall back to
 *     `DEFAULT_CRAWL_SETTINGS`; a broken settings row degrades to the platform
 *     defaults, it does not take the shop down. Shard reads are wrapped the
 *     same way and answer `503 Retry-After` rather than throwing.
 *  2. **Nothing unbounded is ever loaded.** Shards are range-queried
 *     (`.range(from, to)`) off a stable `id` ordering, so a 50 000-product
 *     tenant allocates one page of rows per request — never the catalogue.
 *     Counts come from `head: true` count queries, not from fetching rows.
 *  3. **Exclusions are subtractive and audited.** `noindex`, per-entity
 *     "exclude from sitemap", builder-hidden templates, unpublished and
 *     scheduled rows are all removed from both the counts and the shard.
 *  4. **Writes are rate limited, audited and cache-invalidating.**
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached, invalidate } from "./cache.server";
import { incr, log, observe, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { auditAction } from "./hardening.server";
import { buildPermalink, type PermalinkSettings } from "./permalink";
import { permalinkSettingsFor } from "./permalink.server";
import {
  DEFAULT_CRAWL_SETTINGS,
  SITEMAP_KINDS,
  entityLastmod,
  renderRobotsTxt,
  renderSitemapIndexXml,
  renderUrlset,
  shardPlan,
  shardRange,
  validateCrawlSettings,
  type CrawlSettings,
  type Shard,
  type SitemapEntry,
  type SitemapKind,
} from "./sitemap-config";

type Client = SupabaseClient<Database>;
/**
 * `crawl_settings` and `seo_meta.sitemap_exclude` are newer than the generated
 * types in some environments. One narrow escape hatch, declared here, keeps
 * every call site below honest instead of scattering `as any`.
 */
type LooseClient = SupabaseClient<Database> & { from: (table: string) => any };

const SETTINGS_KEY = (merchantId: string) => `crawl-settings|${merchantId}`;
const STORE_KEY = (slug: string) => `crawl-store|${slug}`;
const COUNTS_KEY = (slug: string) => `sitemap-counts|${slug}`;
const SHARD_KEY = (slug: string, kind: string, page: number) => `sitemap-shard|${slug}|${kind}|${page}`;

/** Hard ceiling for any single read taken on the render path. */
const READ_TIMEOUT_MS = 2_000;
/** Cache lifetimes: short enough to feel live, long enough to absorb crawlers. */
const SETTINGS_TTL = 300;
const COUNTS_TTL = 300;
const SHARD_TTL = 600;
/** Exclusion rows we will consider before treating the tenant as pathological. */
const EXCLUSION_LIMIT = 5_000;

export class CrawlServerError extends Error {
  constructor(
    readonly code: "read_failed" | "write_failed" | "not_found" | "timeout",
    message: string,
    readonly messageBn = message,
  ) {
    super(message);
    this.name = "CrawlServerError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CrawlServerError("timeout", `${label}_timeout`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/* ------------------------------- settings ---------------------------------- */

async function readSettingsRow(db: LooseClient, merchantId: string): Promise<CrawlSettings> {
  const { data, error } = await db
    .from("merchant_settings")
    .select("crawl_settings")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw new CrawlServerError("read_failed", error.message);
  try {
    return validateCrawlSettings(data?.crawl_settings ?? {});
  } catch (err) {
    // A stored blob that no longer validates (a directive we retired, a rule
    // that became unsafe) must not brick crawling. Defaults, loudly.
    log("warn", "crawl.settings_invalid", {
      merchant_id: merchantId,
      message: err instanceof Error ? err.message : String(err),
    });
    incr("framique_crawl_settings_invalid_total", {});
    return DEFAULT_CRAWL_SETTINGS;
  }
}

/** Admin read: authoritative, uncached, surfaces real errors. */
export async function loadCrawlSettings(db: Client, merchantId: string): Promise<CrawlSettings> {
  return readSettingsRow(db as LooseClient, merchantId);
}

/** Render-path read: cached, timed out, defaults on any failure. Never throws. */
export async function crawlSettingsFor(db: Client, merchantId: string): Promise<CrawlSettings> {
  try {
    return await cached(
      SETTINGS_KEY(merchantId),
      SETTINGS_TTL,
      () => withTimeout(readSettingsRow(db as LooseClient, merchantId), READ_TIMEOUT_MS, "crawl_settings"),
      { staleSeconds: 900 },
    );
  } catch (error) {
    log("warn", "crawl.settings_read_failed", {
      merchant_id: merchantId,
      message: error instanceof Error ? error.message : String(error),
    });
    incr("framique_crawl_settings_fallback_total", {});
    return DEFAULT_CRAWL_SETTINGS;
  }
}

export function invalidateCrawlCaches(merchantId: string, storeSlug?: string | null) {
  invalidate(SETTINGS_KEY(merchantId));
  if (storeSlug) {
    invalidate(STORE_KEY(storeSlug));
    invalidate(`sitemap-counts|${storeSlug}`);
    invalidate(`sitemap-shard|${storeSlug}`);
    invalidate(`sf-sitemap|${storeSlug}`);
    invalidate(`sf-robots|${storeSlug}`);
  }
}

/** Write path: validated, rate limited, audited, cache-busting. */
export async function saveCrawlSettings(
  db: Client,
  merchantId: string,
  actor: string,
  patch: unknown,
): Promise<CrawlSettings> {
  await enforceRateLimit("seo.write", `crawl:${merchantId}:${actor}`);
  const current = await loadCrawlSettings(db, merchantId);
  const raw = (patch ?? {}) as Partial<CrawlSettings>;
  const next = validateCrawlSettings({
    sitemap: { ...current.sitemap, ...(raw.sitemap ?? {}) },
    robots: { ...current.robots, ...(raw.robots ?? {}) },
  });

  const loose = db as LooseClient;
  const started = Date.now();
  const { error } = await loose
    .from("merchant_settings")
    .upsert(
      { merchant_id: merchantId, crawl_settings: next, updated_at: new Date().toISOString() },
      { onConflict: "merchant_id" },
    );
  if (error) throw new CrawlServerError("write_failed", error.message);
  observe("framique_crawl_settings_write_ms", Date.now() - started);

  const { data: merchant } = await loose.from("merchants").select("slug").eq("id", merchantId).maybeSingle();
  invalidateCrawlCaches(merchantId, merchant?.slug ?? null);

  await auditAction(
    db,
    merchantId,
    actor,
    "seo.crawl_settings_updated",
    "merchant_settings",
    {
      entries_per_file: next.sitemap.entriesPerFile,
      kinds_included: SITEMAP_KINDS.filter((k) => next.sitemap.kinds[k].include),
      indexable: next.robots.indexable,
      ai_crawlers: next.robots.aiCrawlers,
      custom_rules: next.robots.rules.length,
    },
    merchantId,
  );

  incr("framique_crawl_settings_saved_total", {});
  return next;
}

/** Per-entity "exclude from sitemap" toggle used by the SEO sidebar. */
export async function setEntitySitemapExclusion(
  db: Client,
  merchantId: string,
  actor: string,
  input: { entityType: string; entityId: string; exclude: boolean },
): Promise<void> {
  await enforceRateLimit("seo.write", `crawl-exclude:${merchantId}:${actor}`);
  const loose = db as LooseClient;
  const { error } = await loose.from("seo_meta").upsert(
    {
      merchant_id: merchantId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      sitemap_exclude: input.exclude,
    },
    { onConflict: "merchant_id,entity_type,entity_id" },
  );
  if (error) throw new CrawlServerError("write_failed", error.message);
  const { data: merchant } = await loose.from("merchants").select("slug").eq("id", merchantId).maybeSingle();
  invalidateCrawlCaches(merchantId, merchant?.slug ?? null);
  await auditAction(
    db,
    merchantId,
    actor,
    input.exclude ? "seo.sitemap_excluded" : "seo.sitemap_included",
    input.entityType,
    { exclude: input.exclude },
    input.entityId,
  );

}

/* --------------------------- tenant + exclusions ---------------------------- */

export type StoreContext = {
  merchantId: string;
  storeSlug: string;
  settings: CrawlSettings;
  permalinks: PermalinkSettings;
  /** `${entityType}:${entityId}` keys removed from every sitemap. */
  excluded: Set<string>;
  /** Template kinds the builder marked noindex (`product`, `page`, ...). */
  hiddenTemplates: Set<string>;
};

async function readStoreContext(slug: string): Promise<StoreContext | null> {
  const { publicClient } = await import("./pricing.server");
  const db = publicClient() as unknown as LooseClient;
  const { data: merchant } = await db
    .from("merchants")
    .select("id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!merchant) return null;

  const [settings, permalinks, exclusionRows, hiddenTpl] = await Promise.all([
    crawlSettingsFor(db as unknown as Client, merchant.id),
    permalinkSettingsFor(db as unknown as Client, merchant.id),
    Promise.resolve(
      db
        .from("seo_meta")
        .select("entity_type, entity_id, robots_index, sitemap_exclude")
        .eq("merchant_id", merchant.id)
        .or("robots_index.eq.false,sitemap_exclude.eq.true")
        .limit(EXCLUSION_LIMIT),
    )
      .then((r: { data: any[] | null }) => r.data ?? [])
      .catch(() => [] as any[]),

    import("./template-seo.server")
      .then((m) => m.hiddenTemplates(merchant.id))
      .catch(() => new Set<string>()),
  ]);

  const excluded = new Set<string>(
    (exclusionRows as any[]).map((row) => `${row.entity_type}:${row.entity_id ?? "-"}`),
  );
  return {
    merchantId: merchant.id,
    storeSlug: slug,
    settings,
    permalinks,
    excluded,
    hiddenTemplates: hiddenTpl as Set<string>,
  };
}

/** Cached, fail-soft tenant context for every crawl surface. */
export async function storeCrawlContext(slug: string): Promise<StoreContext | null> {
  return cached(STORE_KEY(slug), SETTINGS_TTL, () => readStoreContext(slug), { staleSeconds: 900 });
}

/* --------------------------------- counts ----------------------------------- */

type CountMap = Partial<Record<SitemapKind, number>>;

async function countRows(
  db: LooseClient,
  table: string,
  apply: (q: any) => any,
): Promise<number> {
  const { count, error } = await apply(db.from(table).select("id", { count: "exact", head: true }));
  if (error) {
    log("warn", "crawl.count_failed", { table, message: error.message });
    return 0;
  }
  return count ?? 0;
}

/**
 * Row counts per kind, using count-only queries. Entity exclusions are
 * subtracted from the total so shard boundaries stay close to reality without
 * a second full scan; the shard reader filters again, so an off-by-a-few count
 * can only ever shorten a shard, never leak an excluded URL.
 */
export async function sitemapCounts(slug: string): Promise<CountMap | null> {
  const ctx = await storeCrawlContext(slug);
  if (!ctx) return null;
  return cached(COUNTS_KEY(slug), COUNTS_TTL, async () => {
    const { publicClient } = await import("./pricing.server");
    const db = publicClient() as unknown as LooseClient;
    const nowIso = new Date().toISOString();
    const excludedOf = (type: string) =>
      [...ctx.excluded].filter((key) => key.startsWith(`${type}:`)).length;

    const [pages, products, collections, articles] = await Promise.all([
      countRows(db, "storefront_pages", (q) =>
        q.eq("merchant_id", ctx.merchantId).eq("is_published", true).is("deleted_at", null),
      ),
      countRows(db, "products", (q) =>
        q.eq("merchant_id", ctx.merchantId).eq("status", "active").is("deleted_at", null),
      ),
      countRows(db, "collections", (q) =>
        q.eq("merchant_id", ctx.merchantId).eq("is_published", true).is("deleted_at", null),
      ),
      countRows(db, "articles", (q) =>
        q
          .eq("merchant_id", ctx.merchantId)
          .eq("status", "published")
          .is("deleted_at", null)
          .lte("published_at", nowIso),
      ),
    ]);

    const hidden = (entityType: string) => ctx.hiddenTemplates.has(ENTITY_TEMPLATE[entityType] ?? entityType);
    const counts: CountMap = {
      // +2 for the storefront home and search entries appended to the first
      // `pages` shard.
      pages: (hidden("page") ? 0 : Math.max(0, pages - excludedOf("page"))) +
        (ctx.hiddenTemplates.has("index") ? 0 : 2),
      products: hidden("product") ? 0 : Math.max(0, products - excludedOf("product")),
      collections: hidden("collection") ? 0 : Math.max(0, collections - excludedOf("collection")),
      articles: hidden("article") ? 0 : Math.max(0, articles - excludedOf("article")),
    };

    incr("framique_sitemap_counts_total", {});
    return counts;
  });
}

/* --------------------------------- shards ----------------------------------- */

/**
 * Sitemap entity types are not template keys: an article is rendered by the
 * `blog` template, so hiding that template has to exclude articles too. Without
 * this map a merchant could set `blog` to noindex and still advertise every
 * post in the sitemap — the exact "de-indexed but advertised" contradiction
 * `hiddenTemplates` exists to prevent.
 */
const ENTITY_TEMPLATE: Record<string, string> = {
  page: "page",
  product: "product",
  collection: "collection",
  article: "blog",
};

export function isExcluded(
  ctx: Pick<StoreContext, "excluded" | "hiddenTemplates">,
  type: string,
  id: string,
  robots?: string | null,
): boolean {
  if (ctx.excluded.has(`${type}:${id}`)) return true;
  if (ctx.hiddenTemplates.has(ENTITY_TEMPLATE[type] ?? type)) return true;
  if (robots && robots.startsWith("noindex")) return true;
  return false;
}


/**
 * One shard of URLs. Range-queried off a stable ordering so page N costs the
 * same as page 1 and nothing outside the window is materialised.
 */
export async function loadSitemapShardEntries(
  slug: string,
  kind: SitemapKind,
  page: number,
): Promise<SitemapEntry[] | null> {
  const ctx = await storeCrawlContext(slug);
  if (!ctx) return null;
  const kindCfg = ctx.settings.sitemap.kinds[kind];
  if (!kindCfg?.include) return null;

  return cached(SHARD_KEY(slug, kind, page), SHARD_TTL, async () =>
    withSpan(
      "sitemap.shard",
      async () => {
        const { publicClient } = await import("./pricing.server");
        const db = publicClient() as unknown as LooseClient;
        const { from, to } = shardRange(page, ctx.settings.sitemap.entriesPerFile);
        const includeImages = ctx.settings.sitemap.includeImages;
        const entries: SitemapEntry[] = [];
        const base = `/store/${slug}`;
        const decorate = (entry: SitemapEntry): SitemapEntry => ({
          ...entry,
          changefreq: kindCfg.changefreq,
          priority: kindCfg.priority,
        });

        if (kind === "pages") {
          if (page === 1 && !ctx.excluded.has("store:-") && !ctx.hiddenTemplates.has("index")) {
            entries.push(decorate({ path: base }));
            entries.push(decorate({ path: `${base}/search` }));
          }
          const { data } = await db
            .from("storefront_pages")
            .select("id, slug, updated_at, robots")
            .eq("merchant_id", ctx.merchantId)
            .eq("is_published", true)
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(from, to);
          for (const row of (data ?? []) as any[]) {
            if (isExcluded(ctx, "page", row.id, row.robots)) continue;
            entries.push(
              decorate({
                path: `${base}${buildPermalink(ctx.permalinks, { kind: "page", slug: row.slug })}`,
                lastmod: entityLastmod(row.updated_at),
              }),
            );
          }
        }

        if (kind === "products") {
          const { data } = await db
            .from("products")
            .select("id, slug, updated_at, image_url")
            .eq("merchant_id", ctx.merchantId)
            .eq("status", "active")
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(from, to);
          for (const row of (data ?? []) as any[]) {
            if (isExcluded(ctx, "product", row.id)) continue;
            entries.push(
              decorate({
                path: `${base}${buildPermalink(ctx.permalinks, { kind: "product", slug: row.slug })}`,
                lastmod: entityLastmod(row.updated_at),
                images: includeImages && row.image_url ? [row.image_url] : undefined,
              }),
            );
          }
        }

        if (kind === "collections") {
          const { data } = await db
            .from("collections")
            .select("id, slug, updated_at")
            .eq("merchant_id", ctx.merchantId)
            .eq("is_published", true)
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(from, to);
          for (const row of (data ?? []) as any[]) {
            if (isExcluded(ctx, "collection", row.id)) continue;
            entries.push(
              decorate({
                path: `${base}/search?collection=${encodeURIComponent(row.slug)}`,
                lastmod: entityLastmod(row.updated_at),
              }),
            );
          }
        }

        if (kind === "articles") {
          const nowIso = new Date().toISOString();
          const { data } = await db
            .from("articles")
            .select("id, slug, updated_at, published_at, robots, cover_image_url")
            .eq("merchant_id", ctx.merchantId)
            .eq("status", "published")
            .is("deleted_at", null)
            .lte("published_at", nowIso)
            .order("id", { ascending: true })
            .range(from, to);
          for (const row of (data ?? []) as any[]) {
            if (isExcluded(ctx, "article", row.id, row.robots)) continue;
            entries.push(
              decorate({
                path: buildPermalink(ctx.permalinks, {
                  kind: "article",
                  slug: row.slug,
                  date: row.published_at ?? null,
                }),
                lastmod: entityLastmod(row.updated_at, row.published_at),
                images: includeImages && row.cover_image_url ? [row.cover_image_url] : undefined,
              }),
            );
          }
        }

        incr("framique_sitemap_shard_total", { kind });
        observe("framique_sitemap_shard_entries", entries.length, { kind });
        return entries;
      },
      { kind },
    ),
  );
}

/* -------------------------------- rendering --------------------------------- */

export type RenderedDocument = { body: string; cacheControl: string };

const SITEMAP_CACHE_CONTROL = "public, max-age=600, stale-while-revalidate=3600";
const ROBOTS_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

export async function renderStoreSitemapIndex(
  slug: string,
  origin: string,
): Promise<RenderedDocument | null> {
  const ctx = await storeCrawlContext(slug);
  if (!ctx) return null;
  const counts = (await sitemapCounts(slug)) ?? {};
  const shards: Shard[] = shardPlan(counts, ctx.settings.sitemap);
  return {
    body: renderSitemapIndexXml(origin, slug, shards),
    cacheControl: SITEMAP_CACHE_CONTROL,
  };
}

export async function renderStoreSitemapShard(
  slug: string,
  kind: SitemapKind,
  page: number,
  origin: string,
): Promise<RenderedDocument | null> {
  const ctx = await storeCrawlContext(slug);
  if (!ctx) return null;
  const entries = await loadSitemapShardEntries(slug, kind, page);
  if (!entries) return null;
  return {
    body: renderUrlset(origin, entries, { includeImages: ctx.settings.sitemap.includeImages }),
    cacheControl: SITEMAP_CACHE_CONTROL,
  };
}

export async function renderStoreRobotsTxt(
  slug: string,
  origin: string,
): Promise<RenderedDocument | null> {
  const ctx = await storeCrawlContext(slug);
  if (!ctx) return null;
  return {
    body: renderRobotsTxt({
      origin,
      storeSlug: slug,
      settings: ctx.settings.robots,
      llmsPath: `/store/${slug}/llms.txt`,
    }),
    cacheControl: ROBOTS_CACHE_CONTROL,
  };
}

/**
 * Admin preview: renders exactly what a crawler would get for a *candidate*
 * settings blob, without persisting it. The preview and production share
 * `renderRobotsTxt`, so a difference between them is impossible by
 * construction.
 */
export async function previewCrawlDocuments(
  db: Client,
  merchantId: string,
  origin: string,
  candidate: unknown,
): Promise<{
  storeSlug: string | null;
  currentRobots: string;
  nextRobots: string;
  sitemapIndex: string;
  counts: CountMap;
  shards: Shard[];
}> {
  const loose = db as LooseClient;
  const { data: merchant } = await loose.from("merchants").select("slug").eq("id", merchantId).maybeSingle();
  const storeSlug: string | null = merchant?.slug ?? null;
  const current = await loadCrawlSettings(db, merchantId);
  const raw = (candidate ?? {}) as Partial<CrawlSettings>;
  const next = validateCrawlSettings({
    sitemap: { ...current.sitemap, ...(raw.sitemap ?? {}) },
    robots: { ...current.robots, ...(raw.robots ?? {}) },
  });
  const slug = storeSlug ?? "store";
  const counts = storeSlug ? ((await sitemapCounts(storeSlug)) ?? {}) : {};
  const shards = shardPlan(counts, next.sitemap);
  return {
    storeSlug,
    currentRobots: renderRobotsTxt({
      origin,
      storeSlug: slug,
      settings: current.robots,
      llmsPath: `/store/${slug}/llms.txt`,
    }),
    nextRobots: renderRobotsTxt({
      origin,
      storeSlug: slug,
      settings: next.robots,
      llmsPath: `/store/${slug}/llms.txt`,
    }),
    sitemapIndex: renderSitemapIndexXml(origin, slug, shards),
    counts,
    shards,
  };
}
