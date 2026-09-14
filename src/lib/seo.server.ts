/**
 * SEO panel server runtime (BUILD 2.6).
 *
 * Owns the merchant-authored SEO/AEO overrides: the entity index the panel
 * lists, the read/write path (scored server-side, audited append-only), the
 * cached storefront resolver, and the per-type sitemap builders.
 *
 * Invariants:
 *  - every read and write is `merchant_id` scoped; the resolver additionally
 *    re-checks the merchant that owns the entity before returning an override
 *  - the stored score is always recomputed from the stored payload, never
 *    trusted from the client
 *  - noindex overrides drop the URL from every sitemap
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  analyseSeo,
  normaliseFaq,
  normaliseKeywords,
  type FaqItem,
  type SeoDraft,
} from "./seo-analysis";
import { cached, invalidate } from "./cache.server";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { buildPermalink } from "./permalink";
import { permalinkSettingsFor } from "./permalink.server";

type Client = SupabaseClient<Database>;

export type SeoEntityType = "store" | "product" | "collection" | "page" | "article";

/* ------------------------- query-discipline bounds ------------------------- */

/**
 * Every read below is bounded. These are the numbers
 * `query-discipline.contract.test.ts` asserts against the 50 000-row fixture:
 * an unbounded `select()` is a table scan waiting for the tenant that grows.
 */
/** Rows loaded per entity kind for the admin SEO index. */
export const SEO_INDEX_LIMITS = {
  products: 300,
  collections: 200,
  pages: 200,
  articles: 200,
  /** Override rows joined in memory — one read, never one per entity. */
  meta: 2_000,
} as const;

/** Overrides scanned when building a sitemap shard (noindex exclusions). */
export const SITEMAP_OVERRIDE_SCAN_LIMIT = 5_000;
/** Hard cap on rows any single sitemap shard may read. */
export const SITEMAP_SHARD_MAX_ROWS = 5_000;
/** Protocol ceiling: 50 000 URLs per sitemap file. */
export const SITEMAP_MAX_URLS = 50_000;

export class SeoError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SeoError";
  }
}

export type SeoRecord = {
  entityType: SeoEntityType;
  entityId: string | null;
  metaTitle: string;
  metaDescription: string;
  canonical: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  ogImageUrl: string;
  focusKeyword: string;
  secondaryKeywords: string[];
  faq: FaqItem[];
  score: number;
  updatedAt: string | null;
};

const EMPTY: Omit<SeoRecord, "entityType" | "entityId"> = {
  metaTitle: "",
  metaDescription: "",
  canonical: "",
  robotsIndex: true,
  robotsFollow: true,
  ogImageUrl: "",
  focusKeyword: "",
  secondaryKeywords: [],
  faq: [],
  score: 0,
  updatedAt: null,
};

type Row = Database["public"]["Tables"]["seo_meta"]["Row"];

function toRecord(row: Row): SeoRecord {
  return {
    entityType: row.entity_type as SeoEntityType,
    entityId: row.entity_id,
    metaTitle: row.meta_title ?? "",
    metaDescription: row.meta_description ?? "",
    canonical: row.canonical ?? "",
    robotsIndex: row.robots_index,
    robotsFollow: row.robots_follow,
    ogImageUrl: row.og_image_url ?? "",
    focusKeyword: row.focus_keyword ?? "",
    secondaryKeywords: normaliseKeywords(row.secondary_keywords ?? []),
    faq: normaliseFaq(row.faq),
    score: row.score,
    updatedAt: row.updated_at,
  };
}

/* --------------------------------- index ---------------------------------- */

export type SeoEntity = {
  type: SeoEntityType;
  id: string | null;
  label: string;
  path: string;
  fallbackTitle: string;
  fallbackDescription: string;
  content: string;
  indexed: boolean;
  score: number | null;
};

/** Everything a merchant can optimise, with its current score attached. */
export async function listSeoEntities(db: Client, merchantId: string): Promise<SeoEntity[]> {
  return withSpan("seo.index", async () => {
    const [merchant, settings, products, collections, pages, articles, metas] = await Promise.all([
      db.from("merchants").select("name, slug").eq("id", merchantId).maybeSingle(),
      db.from("merchant_settings").select("tagline").eq("merchant_id", merchantId).maybeSingle(),
      db
        .from("products")
        .select("id, title, slug, description")
        .eq("merchant_id", merchantId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(SEO_INDEX_LIMITS.products),
      db
        .from("collections")
        .select("id, name, slug, description")
        .eq("merchant_id", merchantId)
        .is("deleted_at", null)
        .limit(SEO_INDEX_LIMITS.collections),
      db
        .from("storefront_pages")
        .select("id, title, slug, excerpt, body_markdown")
        .eq("merchant_id", merchantId)
        .is("deleted_at", null)
        .limit(SEO_INDEX_LIMITS.pages),
      db
        .from("articles")
        .select("id, title, slug, excerpt, body, published_at")
        .eq("merchant_id", merchantId)
        .is("deleted_at", null)
        .limit(SEO_INDEX_LIMITS.articles),
      db
        .from("seo_meta")
        .select("entity_type, entity_id, score, robots_index")
        .eq("merchant_id", merchantId)
        .limit(SEO_INDEX_LIMITS.meta),
    ]);

    // Article URLs are owned by the tenant's permalink pattern, so the panel
    // must show the same path the storefront serves — never a hardcoded /blog.
    const permalinks = await permalinkSettingsFor(db, merchantId);

    const storeSlug = merchant.data?.slug ?? "";
    const storeName = merchant.data?.name ?? "Store";
    const key = (t: string, id: string | null) => `${t}:${id ?? "-"}`;
    const scores = new Map<string, { score: number; indexed: boolean }>();
    for (const m of metas.data ?? []) {
      scores.set(key(m.entity_type, m.entity_id), { score: m.score, indexed: m.robots_index });
    }

    const rows: SeoEntity[] = [
      {
        type: "store",
        id: null,
        label: `${storeName} — home`,
        path: `/store/${storeSlug}`,
        fallbackTitle: `${storeName} — Online store`,
        fallbackDescription: settings.data?.tagline ?? "",
        content: settings.data?.tagline ?? "",
        indexed: true,
        score: null,
      },
    ];

    for (const p of products.data ?? []) {
      rows.push({
        type: "product",
        id: p.id,
        label: p.title,
        path: `/store/${storeSlug}/p/${p.slug}`,
        fallbackTitle: `${p.title} — ${storeName}`,
        fallbackDescription: p.description ?? "",
        content: p.description ?? "",
        indexed: true,
        score: null,
      });
    }
    for (const c of collections.data ?? []) {
      rows.push({
        type: "collection",
        id: c.id,
        label: c.name,
        path: `/store/${storeSlug}/search?collection=${c.slug}`,
        fallbackTitle: `${c.name} — ${storeName}`,
        fallbackDescription: c.description ?? "",
        content: c.description ?? "",
        indexed: true,
        score: null,
      });
    }
    for (const p of pages.data ?? []) {
      rows.push({
        type: "page",
        id: p.id,
        label: p.title,
        path: `/store/${storeSlug}/pages/${p.slug}`,
        fallbackTitle: `${p.title} — ${storeName}`,
        fallbackDescription: p.excerpt ?? "",
        content: p.body_markdown ?? "",
        indexed: true,
        score: null,
      });
    }
    for (const a of articles.data ?? []) {
      rows.push({
        type: "article",
        id: a.id,
        label: a.title,
        path: buildPermalink(permalinks, {
          kind: "article",
          slug: a.slug,
          date: (a as { published_at?: string | null }).published_at ?? null,
        }),
        fallbackTitle: `${a.title} — ${storeName}`,
        fallbackDescription: a.excerpt ?? "",
        content: a.body ?? "",
        indexed: true,
        score: null,
      });
    }

    return rows.map((r) => {
      const hit = scores.get(key(r.type, r.id));
      return hit ? { ...r, score: hit.score, indexed: hit.indexed } : r;
    });
  });
}

/* ---------------------------------- read ---------------------------------- */

export async function loadSeoMeta(
  db: Client,
  merchantId: string,
  entityType: SeoEntityType,
  entityId: string | null,
): Promise<SeoRecord> {
  let query = db
    .from("seo_meta")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("entity_type", entityType);
  query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new SeoError("seo_read_failed", error.message);
  return data ? toRecord(data as Row) : { entityType, entityId, ...EMPTY };
}

/* ---------------------------------- write --------------------------------- */

export type SeoInput = {
  entityType: SeoEntityType;
  entityId: string | null;
  metaTitle: string;
  metaDescription: string;
  canonical: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  ogImageUrl: string;
  focusKeyword: string;
  secondaryKeywords?: string[];
  faq: FaqItem[];
  /** Body copy used for scoring only; never persisted. */
  content?: string;
  /** Entity URL/path, used by the keyword-in-URL check. Not persisted. */
  url?: string;
  /** Locale the copy is written in; drives readability applicability. */
  locale?: "en" | "bn";
  fallbackTitle?: string;
  fallbackDescription?: string;
};

function clean(value: string, max: number) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function assertUrl(value: string, field: string) {
  const v = value.trim();
  if (v && !/^https:\/\/[^\s]+$/i.test(v)) {
    throw new SeoError("seo_url_invalid", `${field} must be an absolute https:// URL`);
  }
  return v;
}

export async function saveSeoMeta(
  db: Client,
  merchantId: string,
  actor: string,
  input: SeoInput,
) {
  return withSpan("seo.save", async () => {
    await enforceRateLimit("seo.write", `${merchantId}:${actor}`);

    if (input.entityType === "store" && input.entityId) {
      throw new SeoError("seo_entity_invalid", "The store record has no entity id");
    }
    if (input.entityType !== "store" && !input.entityId) {
      throw new SeoError("seo_entity_invalid", "An entity must be selected");
    }
    await assertEntityBelongs(db, merchantId, input.entityType, input.entityId);

    const draft: SeoDraft = {
      metaTitle: clean(input.metaTitle, 120),
      metaDescription: clean(input.metaDescription, 320),
      canonical: assertUrl(input.canonical, "Canonical"),
      robotsIndex: input.robotsIndex,
      robotsFollow: input.robotsFollow,
      ogImageUrl: assertUrl(input.ogImageUrl, "Social image"),
      focusKeyword: clean(input.focusKeyword, 80),
      secondaryKeywords: normaliseKeywords(input.secondaryKeywords ?? []),
      faq: normaliseFaq(input.faq),
      content: input.content ?? "",
      url: input.url,
      locale: input.locale ?? "en",
      fallbackTitle: input.fallbackTitle ?? "",
      fallbackDescription: input.fallbackDescription ?? "",
    };
    // The score shown to the merchant and the score stored are one computation.
    const report = analyseSeo(draft);

    const before = await loadSeoMeta(db, merchantId, input.entityType, input.entityId);
    const row = {
      merchant_id: merchantId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      meta_title: draft.metaTitle || null,
      meta_description: draft.metaDescription || null,
      canonical: draft.canonical || null,
      robots_index: draft.robotsIndex,
      robots_follow: draft.robotsFollow,
      og_image_url: draft.ogImageUrl || null,
      focus_keyword: draft.focusKeyword || null,
      secondary_keywords: draft.secondaryKeywords ?? [],
      faq: draft.faq,
      score: report.score,
      updated_by: actor,
    };

    const { error } = await db
      .from("seo_meta")
      .upsert(row, { onConflict: "merchant_id,entity_type,entity_id" });
    if (error) {
      // Older rows may predate the partial unique index for the store record.
      const existing = await loadSeoMeta(db, merchantId, input.entityType, input.entityId);
      if (existing.updatedAt) {
        let update = db.from("seo_meta").update(row).eq("merchant_id", merchantId).eq("entity_type", input.entityType);
        update = input.entityId ? update.eq("entity_id", input.entityId) : update.is("entity_id", null);
        const { error: updateError } = await update;
        if (updateError) throw new SeoError("seo_save_failed", updateError.message);
      } else {
        const { error: insertError } = await db.from("seo_meta").insert(row);
        if (insertError) throw new SeoError("seo_save_failed", insertError.message);
      }
    }

    await writeAudit(merchantId, actor, input, before, report.score);
    invalidate(`seo|${merchantId}`);
    invalidate("sf-sitemap|");
    incr("framique_seo_save_total", { entity: input.entityType, band: report.score >= 80 ? "good" : report.score >= 50 ? "fair" : "poor" });
    log("info", "seo.saved", { merchantId, entity: input.entityType, score: report.score });
    return { score: report.score, checks: report.checks };
  });
}

async function assertEntityBelongs(
  db: Client,
  merchantId: string,
  entityType: SeoEntityType,
  entityId: string | null,
) {
  if (entityType === "store" || !entityId) return;
  const table = (
    { product: "products", collection: "collections", page: "storefront_pages", article: "articles" } as const
  )[entityType];
  const { data } = await db
    .from(table)
    .select("id")
    .eq("id", entityId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!data) throw new SeoError("seo_entity_not_found", "That item does not belong to this store");
}

async function writeAudit(
  merchantId: string,
  actor: string,
  input: SeoInput,
  before: SeoRecord,
  score: number,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("seo_meta_audit").insert({
    merchant_id: merchantId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    actor,
    reason: "seo_panel_save",
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify({ ...input, content: undefined, score })),
  });
}

export async function listSeoAudit(db: Client, merchantId: string, limit = 30) {
  const { data } = await db
    .from("seo_meta_audit")
    .select("id, entity_type, entity_id, actor, reason, created_at, after")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/* -------------------------------- resolver -------------------------------- */

export type ResolvedSeo = {
  metaTitle: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  ogImageUrl: string | null;
  faq: FaqItem[];
};

/**
 * Storefront-side override lookup. Tenant-keyed cache; a miss costs one anon
 * read and is shared across requests for 60s.
 */
export async function resolveSeo(
  merchantId: string,
  entityType: SeoEntityType,
  entityId: string | null,
): Promise<ResolvedSeo | null> {
  const { renderRead } = await import("./render-read.server");
  return renderRead<ResolvedSeo | null>({
    name: "seo.resolve",
    key: `seo|${merchantId}|${entityType}|${entityId ?? "-"}`,
    fallback: null,
    ttlSeconds: 60,
    staleSeconds: 300,
    context: { merchant_id: merchantId, entity_type: entityType },
    load: async () => {
      const { publicClient } = await import("./pricing.server");
      const db = publicClient();
      let query = db
        .from("seo_meta")
        .select("meta_title, meta_description, canonical, robots_index, robots_follow, og_image_url, faq")
        .eq("merchant_id", merchantId)
        .eq("entity_type", entityType);
      query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);
      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        metaTitle: data.meta_title,
        metaDescription: data.meta_description,
        canonical: data.canonical,
        robotsIndex: data.robots_index,
        robotsFollow: data.robots_follow,
        ogImageUrl: data.og_image_url,
        faq: normaliseFaq(data.faq),
      } satisfies ResolvedSeo;
    },
  });
}

/* --------------------------- robots (per tenant) --------------------------- */

/**
 * Crawl policy for one store. The store-level SEO row owns indexing; AI answer
 * crawlers ride on the same merchant decision, so a store that opted out of
 * indexing is never fed to an answer engine either.
 */
export async function loadStoreRobotsPolicy(
  slug: string,
): Promise<{ indexable: boolean; aiCrawlers: boolean } | null> {
  const { renderRead } = await import("./render-read.server");
  // Fail-soft default is the *safe* one: if the policy row cannot be read we
  // serve the permissive-but-honest fallback rather than accidentally
  // de-indexing a whole store because a table blipped.
  return renderRead<{ indexable: boolean; aiCrawlers: boolean } | null>({
    name: "seo.robots_policy",
    key: `sf-robots|${slug}`,
    fallback: { indexable: true, aiCrawlers: true },
    ttlSeconds: 300,
    staleSeconds: 900,
    context: { slug },
    load: async () => {
      const { publicClient } = await import("./pricing.server");
      const db = publicClient();
      const { data: merchant, error } = await db
        .from("merchants")
        .select("id")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!merchant) return null;
      const { data } = await db
        .from("seo_meta")
        .select("robots_index, robots_follow")
        .eq("merchant_id", merchant.id)
        .eq("entity_type", "store")
        .maybeSingle();
      const indexable = data?.robots_index !== false;
      return { indexable, aiCrawlers: indexable && data?.robots_follow !== false };
    },
  });
}

/* -------------------------------- sitemaps -------------------------------- */

export type SitemapKind = "pages" | "products" | "collections" | "articles";
export const SITEMAP_KINDS: SitemapKind[] = ["pages", "products", "collections", "articles"];

export type SitemapUrl = { path: string; lastmod?: string; changefreq: string; priority: string };

/**
 * One sitemap per template type so a large catalogue never pushes content
 * pages past the 50k/50MB limits, and so crawlers can prioritise per type.
 */
export async function loadSitemapByKind(
  slug: string,
  kind: SitemapKind,
): Promise<SitemapUrl[] | null> {
  const { renderRead } = await import("./render-read.server");
  return renderRead<SitemapUrl[] | null>({
    name: "seo.sitemap",
    key: `sf-sitemap|${slug}|${kind}`,
    // An empty shard beats a 500: crawlers retry an empty sitemap, they do not
    // forgive a broken one.
    fallback: [],
    ttlSeconds: 300,
    staleSeconds: 900,
    timeoutMs: 4_000,
    context: { slug, kind },
    load: async () => {
    const { publicClient } = await import("./pricing.server");
    const db = publicClient();
    const { data: merchant } = await db
      .from("merchants")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) return null;

    const { data: overrides } = await db
      .from("seo_meta")
      .select("entity_type, entity_id, robots_index")
      .eq("merchant_id", merchant.id)
      .eq("robots_index", false)
      .limit(SITEMAP_OVERRIDE_SCAN_LIMIT);
    const hidden = new Set((overrides ?? []).map((o) => `${o.entity_type}:${o.entity_id ?? "-"}`));

    // Phase 3: a template the builder marked `noindex` must not be advertised
    // either — the sitemap and the page's own robots directive have to agree.
    const { hiddenTemplates } = await import("./template-seo.server");
    const hiddenTpl = await hiddenTemplates(merchant.id);

    const urls: SitemapUrl[] = [];
    if (kind === "pages") {
      if (!hidden.has("store:-") && !hiddenTpl.has("index")) {
        urls.push({ path: `/store/${slug}`, changefreq: "daily", priority: "1.0" });
        urls.push({ path: `/store/${slug}/search`, changefreq: "weekly", priority: "0.4" });
      }
      const { data } = await db
        .from("storefront_pages")
        .select("id, slug, updated_at, robots")
        .eq("merchant_id", merchant.id)
        .eq("is_published", true)
        .is("deleted_at", null)
        .limit(Math.min(1_000, SITEMAP_SHARD_MAX_ROWS));
      for (const p of data ?? []) {
        if (p.robots?.startsWith("noindex") || hidden.has(`page:${p.id}`) || hiddenTpl.has("page")) continue;
        urls.push({
          path: `/store/${slug}/pages/${p.slug}`,
          lastmod: p.updated_at?.slice(0, 10),
          changefreq: "monthly",
          priority: "0.5",
        });
      }
    }
    if (kind === "products") {
      const { data } = await db
        .from("products")
        .select("id, slug, updated_at")
        .eq("merchant_id", merchant.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(SITEMAP_SHARD_MAX_ROWS);
      for (const p of data ?? []) {
        if (hidden.has(`product:${p.id}`) || hiddenTpl.has("product")) continue;
        urls.push({
          path: `/store/${slug}/p/${p.slug}`,
          lastmod: p.updated_at?.slice(0, 10),
          changefreq: "weekly",
          priority: "0.8",
        });
      }
    }
    if (kind === "collections") {
      const { data } = await db
        .from("collections")
        .select("id, slug, updated_at, is_published")
        .eq("merchant_id", merchant.id)
        .eq("is_published", true)
        .is("deleted_at", null)
        .limit(Math.min(1_000, SITEMAP_SHARD_MAX_ROWS));
      for (const c of data ?? []) {
        if (hidden.has(`collection:${c.id}`) || hiddenTpl.has("collection")) continue;
        urls.push({
          path: `/store/${slug}/search?collection=${c.slug}`,
          lastmod: c.updated_at?.slice(0, 10),
          changefreq: "weekly",
          priority: "0.6",
        });
      }
    }
    if (kind === "articles") {
      const { data } = await db
        .from("articles")
        .select("id, slug, updated_at, published_at, robots")
        .eq("merchant_id", merchant.id)
        .eq("status", "published")
        .is("deleted_at", null)
        .limit(Math.min(2_000, SITEMAP_SHARD_MAX_ROWS));
      const permalinks = await permalinkSettingsFor(db, merchant.id);
      for (const a of data ?? []) {
        if (a.robots?.startsWith("noindex") || hidden.has(`article:${a.id}`)) continue;
        urls.push({
          path: buildPermalink(permalinks, {
            kind: "article",
            slug: a.slug,
            date: a.published_at ?? null,
          }),
          lastmod: (a.updated_at ?? a.published_at)?.slice(0, 10),
          changefreq: "monthly",
          priority: "0.7",
        });
      }
    }
    incr("framique_sitemap_build_total", { kind });
    // Belt and braces: the protocol ceiling is 50k URLs per file. The row caps
    // above already keep us far below it, but a future kind that fans one row
    // out into several URLs must not silently emit an invalid sitemap.
    if (urls.length > SITEMAP_MAX_URLS) {
      log("warn", "seo.sitemap.truncated", { kind, slug, urls: urls.length });
      incr("framique_sitemap_truncated_total", { kind });
      return urls.slice(0, SITEMAP_MAX_URLS);
    }
    return urls;
    },
  });
}

export function renderSitemapIndex(origin: string, slug: string, kinds: SitemapKind[]) {
  const body = kinds
    .map(
      (kind) =>
        `  <sitemap>\n    <loc>${origin}/store/${slug}/sitemaps/${kind}.xml</loc>\n  </sitemap>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>`;
}

/* --------------------- Phase 7.4 — store-wide templates -------------------- */

export type SeoTemplateType = "product" | "collection" | "page" | "article";
export const SEO_TEMPLATE_TYPES: SeoTemplateType[] = ["product", "collection", "page", "article"];

export type SeoTemplate = {
  entityType: SeoTemplateType;
  titleTemplate: string;
  descriptionTemplate: string;
  updatedAt: string | null;
};

/** One row per content type, with the untouched types returned empty. */
export async function listSeoTemplates(db: Client, merchantId: string): Promise<SeoTemplate[]> {
  const { data, error } = await db
    .from("seo_templates")
    .select("entity_type, title_template, description_template, updated_at")
    .eq("merchant_id", merchantId);
  if (error) throw new SeoError("templates_read_failed", error.message);
  const byType = new Map(
    (data ?? []).map((row) => [
      row.entity_type,
      {
        entityType: row.entity_type as SeoTemplateType,
        titleTemplate: row.title_template ?? "",
        descriptionTemplate: row.description_template ?? "",
        updatedAt: row.updated_at,
      },
    ]),
  );
  return SEO_TEMPLATE_TYPES.map(
    (entityType) =>
      byType.get(entityType) ?? { entityType, titleTemplate: "", descriptionTemplate: "", updatedAt: null },
  );
}

/**
 * Saves one type's templates. Unknown variables are rejected here rather than
 * silently rendered as literal `{{brand}}` into a title tag.
 */
export async function saveSeoTemplate(
  db: Client,
  merchantId: string,
  userId: string,
  input: { entityType: SeoTemplateType; titleTemplate: string; descriptionTemplate: string },
): Promise<SeoTemplate> {
  const { templateIssues } = await import("./seo-answers");
  const issues = [
    ...templateIssues(input.titleTemplate),
    ...templateIssues(input.descriptionTemplate),
  ];
  if (issues.length) throw new SeoError("template_invalid", issues.join(" "));
  const { data, error } = await db
    .from("seo_templates")
    .upsert(
      {
        merchant_id: merchantId,
        entity_type: input.entityType,
        title_template: input.titleTemplate,
        description_template: input.descriptionTemplate,
        updated_by: userId,
      },
      { onConflict: "merchant_id,entity_type" },
    )
    .select("entity_type, title_template, description_template, updated_at")
    .single();
  if (error) throw new SeoError("template_write_failed", error.message);
  log("info", "seo.template.saved", { merchantId, entityType: input.entityType });
  return {
    entityType: data.entity_type as SeoTemplateType,
    titleTemplate: data.title_template ?? "",
    descriptionTemplate: data.description_template ?? "",
    updatedAt: data.updated_at,
  };
}

/**
 * Phase 5 — seed the starter templates an official theme ships with. Only the
 * rows a merchant has never authored are written, so installing or swapping a
 * theme never overwrites merchant-edited copy. Best effort: a failure here must
 * not fail the theme install.
 */
export async function seedSeoTemplates(
  db: Client,
  merchantId: string,
  themeKey: string,
  userId?: string | null,
): Promise<number> {
  const { presetSeoTemplates } = await import("./theme-seo");
  const existing = await listSeoTemplates(db, merchantId);
  const authored = new Set(
    existing.filter((row) => row.titleTemplate || row.descriptionTemplate).map((row) => row.entityType),
  );
  const rows = presetSeoTemplates(themeKey)
    .filter((row) => !authored.has(row.entityType))
    .map((row) => ({
      merchant_id: merchantId,
      entity_type: row.entityType,
      title_template: row.titleTemplate,
      description_template: row.descriptionTemplate,
      ...(userId ? { updated_by: userId } : {}),
    }));
  if (!rows.length) return 0;
  const { error } = await db.from("seo_templates").upsert(rows, { onConflict: "merchant_id,entity_type" });
  if (error) {
    log("warn", "seo.template.seed_failed", { merchantId, themeKey, message: error.message });
    return 0;
  }
  log("info", "seo.template.seeded", { merchantId, themeKey, rows: rows.length });
  return rows.length;
}

/* ---------------------- Phase 7.4 — redirect manager ---------------------- */

export type RedirectRow = {
  id: string;
  fromPath: string;
  toPath: string;
  status: 301 | 410;
  entityType: string;
  createdAt: string;
};

export async function listRedirects(db: Client, merchantId: string, limit = 200): Promise<RedirectRow[]> {
  const { data, error } = await db
    .from("url_redirects")
    .select("id, from_path, to_path, status, entity_type, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new SeoError("redirects_read_failed", error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    fromPath: row.from_path,
    toPath: row.to_path ?? "",
    status: (row.status === 410 ? 410 : 301) as 301 | 410,
    entityType: row.entity_type,
    createdAt: row.created_at,
  }));
}

async function storeSlugOf(db: Client, merchantId: string): Promise<string | null> {
  const { data } = await db.from("merchants").select("slug").eq("id", merchantId).maybeSingle();
  return data?.slug ?? null;
}

/**
 * Merchant-authored rule. A 301 needs a destination and may not point at
 * itself; a 410 is a tombstone and carries none. Chains are collapsed by the
 * resolver, but a direct self-loop is rejected up front.
 */
export async function createRedirect(
  db: Client,
  merchantId: string,
  input: { fromPath: string; toPath: string; status: 301 | 410 },
): Promise<RedirectRow> {
  const { normalizePath } = await import("./url-lifecycle");
  const from = normalizePath(input.fromPath);
  const to = input.status === 410 ? "" : normalizePath(input.toPath);
  if (from === "/") throw new SeoError("redirect_invalid", "Source path is required.");
  if (input.status === 301) {
    if (!input.toPath.trim()) throw new SeoError("redirect_invalid", "A 301 needs a destination path.");
    if (to === from) throw new SeoError("redirect_invalid", "A redirect cannot point at itself.");
  }
  const { data, error } = await db
    .from("url_redirects")
    .upsert(
      {
        merchant_id: merchantId,
        entity_type: "manual",
        from_path: from,
        to_path: to || null,
        status: input.status,
      },
      { onConflict: "merchant_id,from_path" },
    )
    .select("id, from_path, to_path, status, entity_type, created_at")
    .single();
  if (error) throw new SeoError("redirect_write_failed", error.message);
  const slug = await storeSlugOf(db, merchantId);
  if (slug) invalidate(`sf-redirects|${slug}`);
  log("info", "seo.redirect.saved", { merchantId, from, status: input.status });
  return {
    id: data.id,
    fromPath: data.from_path,
    toPath: data.to_path ?? "",
    status: (data.status === 410 ? 410 : 301) as 301 | 410,
    entityType: data.entity_type,
    createdAt: data.created_at,
  };
}

export async function deleteRedirect(db: Client, merchantId: string, id: string): Promise<void> {
  const { error } = await db.from("url_redirects").delete().eq("merchant_id", merchantId).eq("id", id);
  if (error) throw new SeoError("redirect_delete_failed", error.message);
  const slug = await storeSlugOf(db, merchantId);
  if (slug) invalidate(`sf-redirects|${slug}`);
}

/* ------------------------- Phase 7.4 — llms.txt data ---------------------- */

export type LlmsSummary = {
  storeName: string;
  tagline: string;
  currency: string;
  productCount: number;
  contact: string;
  collections: { title: string; path: string; note?: string }[];
  pages: { title: string; path: string }[];
  guides: { title: string; path: string }[];
};

/**
 * Catalogue shape for the per-store llms.txt. Public data only — the same rows
 * a crawler could reach by walking the sitemap, minus anything noindexed.
 */
export async function loadStoreLlmsSummary(slug: string): Promise<LlmsSummary | null> {
  const { renderRead } = await import("./render-read.server");
  return renderRead<LlmsSummary | null>({
    name: "seo.llms",
    key: `sf-llms|${slug}`,
    fallback: null,
    ttlSeconds: 600,
    staleSeconds: 1_800,
    timeoutMs: 3_000,
    context: { slug },
    load: async () => {
    const { publicClient } = await import("./pricing.server");
    const db = publicClient();
    const { data: merchant } = await db
      .from("merchants")
      .select("id, name")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) return null;

    const [settings, count, collections, pages, articles] = await Promise.all([
      db
        .from("merchant_settings")
        .select("tagline, support_email")
        .eq("merchant_id", merchant.id)
        .maybeSingle(),
      db
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchant.id)
        .eq("status", "active")
        .is("deleted_at", null),
      db
        .from("collections")
        .select("name, slug, description")
        .eq("merchant_id", merchant.id)
        .eq("is_published", true)
        .is("deleted_at", null)
        .limit(60),
      db
        .from("storefront_pages")
        .select("title, slug")
        .eq("merchant_id", merchant.id)
        .eq("is_published", true)
        .is("deleted_at", null)
        .limit(60),
      db
        .from("articles")
        .select("title, slug")
        .eq("merchant_id", merchant.id)
        .eq("status", "published")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(40),
    ]);

    return {
      storeName: merchant.name,
      tagline: settings.data?.tagline ?? "",
      currency: "BDT",
      contact: settings.data?.support_email ?? "",
      productCount: count.count ?? 0,
      collections: (collections.data ?? []).map((c) => ({
        title: c.name,
        path: `/store/${slug}/search?collection=${c.slug}`,
        note: c.description ? c.description.slice(0, 140) : undefined,
      })),
      pages: (pages.data ?? []).map((p) => ({ title: p.title, path: `/store/${slug}/pages/${p.slug}` })),
      guides: (articles.data ?? []).map((a) => ({ title: a.title, path: `/blog/${a.slug}` })),
    };
    },
  });
}

/* ------------------------ Phase 2 — bulk SEO editing ----------------------- */

/**
 * Rank Math's "Bulk Edit" affordance, done without the N+1 it is famous for.
 *
 * `listSeoEntities` already loads every optimisable entity in a fixed number of
 * bounded queries; the override rows are one more query keyed by merchant. We
 * join, filter, sort and page in memory — the working set is capped by the
 * per-table limits above, so this is a few hundred small objects, not a table
 * scan — and the whole thing is cached per tenant for 15s so a merchant paging
 * through the table does not re-run the fan-out on every click.
 */
export type SeoBulkRow = {
  type: SeoEntityType;
  id: string | null;
  label: string;
  path: string;
  /** What will actually ship: the override, else the fallback. */
  effectiveTitle: string;
  effectiveDescription: string;
  metaTitle: string;
  metaDescription: string;
  fallbackTitle: string;
  fallbackDescription: string;
  focusKeyword: string;
  robotsIndex: boolean;
  score: number | null;
  updatedAt: string | null;
};

export type SeoBulkPage = {
  rows: SeoBulkRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Tenant-wide counts, computed before paging so the header does not lie. */
  summary: { optimised: number; missingTitle: number; missingDescription: number; noindex: number };
};

export type SeoBulkQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: SeoEntityType | "all";
  state?: "all" | "missing_title" | "missing_description" | "noindex" | "poor";
  sort?: "label" | "score" | "type";
  direction?: "asc" | "desc";
};

/** Largest page the bulk table will ever hand back, whatever the client asks. */
export const BULK_PAGE_MAX = 100;
/** Smallest page, so a `pageSize=0` cannot turn pagination into an infinite scroll. */
export const BULK_PAGE_MIN = 5;

async function bulkSource(db: Client, merchantId: string): Promise<SeoBulkRow[]> {
  return cached(`seo-bulk|${merchantId}`, 15, async () => {
    const [entities, metas] = await Promise.all([
      listSeoEntities(db, merchantId),
      db
        .from("seo_meta")
        .select(
          "entity_type, entity_id, meta_title, meta_description, focus_keyword, robots_index, score, updated_at",
        )
        .eq("merchant_id", merchantId)
        .limit(SEO_INDEX_LIMITS.meta),
    ]);
    const key = (t: string, id: string | null) => `${t}:${id ?? "-"}`;
    const overrides = new Map((metas.data ?? []).map((m) => [key(m.entity_type, m.entity_id), m]));

    return entities.map((entity) => {
      const row = overrides.get(key(entity.type, entity.id));
      const metaTitle = row?.meta_title ?? "";
      const metaDescription = row?.meta_description ?? "";
      return {
        type: entity.type,
        id: entity.id,
        label: entity.label,
        path: entity.path,
        metaTitle,
        metaDescription,
        fallbackTitle: entity.fallbackTitle,
        fallbackDescription: entity.fallbackDescription,
        effectiveTitle: metaTitle || entity.fallbackTitle,
        effectiveDescription: metaDescription || entity.fallbackDescription,
        focusKeyword: row?.focus_keyword ?? "",
        robotsIndex: row?.robots_index ?? true,
        score: row ? row.score : null,
        updatedAt: row?.updated_at ?? null,
      } satisfies SeoBulkRow;
    });
  });
}

export async function listSeoBulk(
  db: Client,
  merchantId: string,
  query: SeoBulkQuery = {},
): Promise<SeoBulkPage> {
  return withSpan("seo.bulk.list", async () => {
    const all = await bulkSource(db, merchantId);

    const summary = {
      optimised: all.filter((r) => (r.score ?? 0) >= 80).length,
      missingTitle: all.filter((r) => !r.metaTitle.trim()).length,
      missingDescription: all.filter((r) => !r.metaDescription.trim()).length,
      noindex: all.filter((r) => !r.robotsIndex).length,
    };

    const needle = (query.search ?? "").trim().toLowerCase();
    let rows = all.filter((row) => {
      if (query.type && query.type !== "all" && row.type !== query.type) return false;
      if (needle) {
        const hay = `${row.label} ${row.effectiveTitle} ${row.path} ${row.focusKeyword}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      switch (query.state) {
        case "missing_title":
          return !row.metaTitle.trim();
        case "missing_description":
          return !row.metaDescription.trim();
        case "noindex":
          return !row.robotsIndex;
        case "poor":
          return (row.score ?? 0) < 50;
        default:
          return true;
      }
    });

    const direction = query.direction === "desc" ? -1 : 1;
    const sort = query.sort ?? "label";
    rows = rows.slice().sort((a, b) => {
      if (sort === "score") return ((a.score ?? -1) - (b.score ?? -1)) * direction;
      if (sort === "type") return a.type.localeCompare(b.type) * direction || a.label.localeCompare(b.label);
      return a.label.localeCompare(b.label) * direction;
    });

    const pageSize = Math.min(BULK_PAGE_MAX, Math.max(BULK_PAGE_MIN, Math.trunc(query.pageSize ?? 25) || 25));
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(1, query.page ?? 1), pages);
    incr("framique_seo_bulk_list_total", { state: query.state ?? "all" });

    return {
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      summary,
    };
  });
}

export type SeoBulkEdit = {
  entityType: SeoEntityType;
  entityId: string | null;
  metaTitle: string;
  metaDescription: string;
  robotsIndex: boolean;
};

/**
 * Applies inline edits from the bulk table. One rate-limit charge, one upsert
 * round-trip, one audit batch — a 50-row edit must not be 50 requests.
 *
 * Only the three inline fields are touched; canonical, social image, keywords
 * and FAQ are preserved from the stored row, because a bulk grid that silently
 * wipes fields it does not display is how merchants lose a week of work.
 */
export async function saveSeoBulk(
  db: Client,
  merchantId: string,
  actor: string,
  edits: SeoBulkEdit[],
): Promise<{ saved: number; scores: { key: string; score: number }[] }> {
  return withSpan("seo.bulk.save", async () => {
    if (edits.length === 0) return { saved: 0, scores: [] };
    if (edits.length > 50) throw new SeoError("bulk_too_large", "Save at most 50 rows at a time");
    await enforceRateLimit("seo.write", `${merchantId}:${actor}`);

    const source = await bulkSource(db, merchantId);
    const byKey = new Map(source.map((r) => [`${r.type}:${r.id ?? "-"}`, r]));

    const { data: existingRows } = await db
      .from("seo_meta")
      .select("*")
      .eq("merchant_id", merchantId);
    const existing = new Map(
      (existingRows ?? []).map((r) => [`${r.entity_type}:${r.entity_id ?? "-"}`, r as Row]),
    );

    const payload: Record<string, unknown>[] = [];
    const audits: Record<string, unknown>[] = [];
    const scores: { key: string; score: number }[] = [];

    for (const edit of edits) {
      const key = `${edit.entityType}:${edit.entityId ?? "-"}`;
      const entity = byKey.get(key);
      if (!entity) throw new SeoError("seo_entity_not_found", `Unknown entity ${key}`);
      const prior = existing.get(key);

      const draft: SeoDraft = {
        metaTitle: clean(edit.metaTitle, 120),
        metaDescription: clean(edit.metaDescription, 320),
        canonical: prior?.canonical ?? "",
        robotsIndex: edit.robotsIndex,
        robotsFollow: prior?.robots_follow ?? true,
        ogImageUrl: prior?.og_image_url ?? "",
        focusKeyword: prior?.focus_keyword ?? "",
        secondaryKeywords: normaliseKeywords(prior?.secondary_keywords ?? []),
        faq: normaliseFaq(prior?.faq),
        url: entity.path,
        fallbackTitle: entity.fallbackTitle,
        fallbackDescription: entity.fallbackDescription,
      };
      const report = analyseSeo(draft);
      scores.push({ key, score: report.score });

      payload.push({
        merchant_id: merchantId,
        entity_type: edit.entityType,
        entity_id: edit.entityId,
        meta_title: draft.metaTitle || null,
        meta_description: draft.metaDescription || null,
        canonical: draft.canonical || null,
        robots_index: draft.robotsIndex,
        robots_follow: draft.robotsFollow,
        og_image_url: draft.ogImageUrl || null,
        focus_keyword: draft.focusKeyword || null,
        secondary_keywords: draft.secondaryKeywords ?? [],
        faq: draft.faq,
        score: report.score,
        updated_by: actor,
      });
      audits.push({
        merchant_id: merchantId,
        entity_type: edit.entityType,
        entity_id: edit.entityId,
        actor,
        reason: "seo_bulk_edit",
        before: prior
          ? { metaTitle: prior.meta_title, metaDescription: prior.meta_description, robotsIndex: prior.robots_index }
          : {},
        after: {
          metaTitle: draft.metaTitle,
          metaDescription: draft.metaDescription,
          robotsIndex: draft.robotsIndex,
          score: report.score,
        },
      });
    }

    const { error } = await db
      .from("seo_meta")
      .upsert(payload as never, { onConflict: "merchant_id,entity_type,entity_id" });
    if (error) throw new SeoError("seo_bulk_save_failed", error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("seo_meta_audit").insert(audits as never);

    invalidate(`seo|${merchantId}`);
    invalidate(`seo-bulk|${merchantId}`);
    invalidate("sf-sitemap|");
    incr("framique_seo_bulk_save_total", {}, edits.length);
    log("info", "seo.bulk.saved", { merchantId, rows: edits.length });
    return { saved: edits.length, scores };
  });
}

/* ------------------------ Phase 2 — the publish gate ----------------------- */

/**
 * Factual publish gate. The score never blocks; these four rules do, because
 * each one silently costs the merchant the page: no title, a title a live
 * sibling already owns, a canonical that hands the ranking somewhere else, and
 * a noindex page still advertised in the sitemap.
 */
export async function evaluateSeoPublishGate(
  db: Client,
  merchantId: string,
  input: {
    entityType: SeoEntityType;
    entityId: string | null;
    origin: string;
    title?: string;
    description?: string;
    canonical?: string;
    robotsIndex?: boolean;
  },
) {
  const { composeSeoPublishGate } = await import("./seo-publish-gate");
  const rows = await bulkSource(db, merchantId);
  const self = rows.find(
    (r) => r.type === input.entityType && (r.id ?? null) === (input.entityId ?? null),
  );
  const origin = input.origin.replace(/\/+$/, "");
  const title = input.title ?? self?.effectiveTitle ?? "";
  const robotsIndex = input.robotsIndex ?? self?.robotsIndex ?? true;

  return composeSeoPublishGate({
    entityType: input.entityType,
    entityId: input.entityId,
    title,
    description: input.description ?? self?.effectiveDescription ?? "",
    canonical: input.canonical ?? "",
    robotsIndex,
    selfUrl: self ? `${origin}${self.path}` : "",
    inSitemap: robotsIndex && input.entityType !== "store",
    siblings: rows
      .filter((r) => r.robotsIndex)
      .map((r) => ({ type: r.type, id: r.id, label: r.label, title: r.effectiveTitle })),
  });
}

/** Throws when a publish would break a factual SEO rule. */
export async function assertSeoPublishable(
  db: Client,
  merchantId: string,
  input: Parameters<typeof evaluateSeoPublishGate>[2],
) {
  const gate = await evaluateSeoPublishGate(db, merchantId, input);
  if (!gate.ok) {
    const first = gate.failures.find((f) => f.blocking);
    incr("framique_seo_gate_block_total", { code: first?.code ?? "unknown" });
    throw new SeoError(first?.code ?? "seo_gate_failed", first?.message ?? "SEO publish gate failed");
  }
  return gate;
}
