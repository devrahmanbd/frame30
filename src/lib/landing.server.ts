/**
 * Phase 10.2 — the `/` payload.
 *
 * The landing page is the single most-crawled, most-shared URL on the platform
 * and it renders on the server. That forces three properties on this module:
 *
 *   • **It cannot 500.** Every read goes through `renderRead`: keyed cache,
 *     hard timeout, declared fallback, counted failures. A dead
 *     `plan_definitions` table costs us the pricing teaser, not the home page.
 *   • **It cannot get expensive.** Constant query count, independent of how
 *     many merchants exist: four `head:true` counts and one bounded article
 *     window. No per-row follow-up query exists here — the §7 N+1 auditor and
 *     `query-discipline.contract.test.ts` fail the build if one appears.
 *   • **It cannot leak.** Everything reads through the publishable (anon)
 *     client, so RLS is the boundary. A bug in this file cannot surface a
 *     draft article or an unverified merchant, because the credential it holds
 *     cannot see one.
 *
 * Sub-reads are independent: each one degrades on its own and the page notes
 * `degraded` for observability without telling the visitor anything is wrong.
 */
import { PAYMENT_METHOD_KEYS } from "./payment-rails";
import { renderRead } from "./render-read.server";
import { log } from "./observability.server";
import {
  EMPTY_LANDING,
  LANDING_LIMITS,
  type LandingData,
  type PlanTeaserInput,
  type RawStats,
  type StoryCard} from "./landing";

type Db = { from: (table: string) => any };

async function anonDb(): Promise<Db> {
  const { publicClient } = await import("./pricing.server");
  return publicClient() as unknown as Db;
}

/** `head: true` count — the server returns a count and zero rows. */
async function countOf(
  db: Db,
  table: string,
  apply: (q: any) => any,
): Promise<number | null> {
  try {
    const { count, error } = await apply(db.from(table).select("id", { count: "exact", head: true }));
    if (error) throw error;
    return typeof count === "number" ? count : null;
  } catch (error) {
    // A single missing counter must not take the band — or the page — down.
    log("warn", "landing.count_failed", {
      table,
      reason: String((error as Error)?.message ?? error).slice(0, 160)});
    return null;
  }
}

async function loadStats(db: Db): Promise<RawStats> {
  const [merchants, products, articles] = await Promise.all([
    countOf(db, "merchants", (q) => q.eq("status", "active").eq("kyc_status", "verified")),
    countOf(db, "products", (q) => q.eq("status", "active").is("deleted_at", null)),
    countOf(db, "articles", (q) => q.eq("status", "published").is("deleted_at", null)),
  ]);
  return {
    merchants,
    products,
    articles,
    // Not a database read: the rail registry is the source of truth for what
    // the platform can actually settle.
    paymentRails: PAYMENT_METHOD_KEYS.length,
    measuredAt: new Date().toISOString()};
}

const STORY_COLUMNS = "slug, title, title_en, excerpt, cover_image_url, published_at, merchant_id";

/**
 * Newest published articles, used as the case-study rail. Two queries at most:
 * the article window, then one batched merchant lookup for the by-line. The
 * by-line is best-effort — a card without a store name is still a good card.
 */
async function loadStories(db: Db): Promise<StoryCard[]> {
  const { data, error } = await db
    .from("articles")
    .select(STORY_COLUMNS)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(LANDING_LIMITS.stories);
  if (error) throw error;

  const rows = (data ?? []) as {
    slug: string;
    title: string;
    title_en: string | null;
    excerpt: string | null;
    cover_image_url: string | null;
    published_at: string | null;
    merchant_id: string;
  }[];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.merchant_id))].slice(0, LANDING_LIMITS.stories);
  let names = new Map<string, string>();
  try {
    const { data: merchants } = await db
      .from("merchants")
      .select("id, name")
      .in("id", ids)
      .limit(ids.length);
    names = new Map(((merchants ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
  } catch {
    // by-line is decoration; swallow and render without it
  }

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverImageUrl: row.cover_image_url,
    publishedAt: row.published_at,
    merchantName: names.get(row.merchant_id) ?? null}));
}

async function loadPlans(): Promise<PlanTeaserInput[]> {
  const { publicPlans } = await import("./site.server");
  const plans = await publicPlans();
  return plans.map((p) => ({
    plan: p.plan,
    titleEn: p.titleEn,
    titleBn: p.titleBn,
    priceMinorInt: p.priceMinorInt,
    currencyCode: p.currencyCode,
    trialDays: p.trialDays,
    productsLimit: p.productsLimit,
    staffLimit: p.staffLimit}));
}

/**
 * One payload for `/`. Cached per isolate for five minutes with a fifteen
 * minute stale window, so a burst of crawler traffic costs one round of
 * queries, not one per request.
 */
export async function loadLanding(): Promise<LandingData> {
  return renderRead<LandingData>({
    name: "landing.home",
    key: "public|landing|home",
    fallback: EMPTY_LANDING,
    ttlSeconds: LANDING_LIMITS.ttlSeconds,
    staleSeconds: LANDING_LIMITS.staleSeconds,
    timeoutMs: LANDING_LIMITS.timeoutMs,
    load: async () => {
      const db = await anonDb();
      const [plans, stats, stories, demoSlug] = await Promise.all([
        loadPlans().catch((error) => {
          log("warn", "landing.plans_failed", {
            reason: String((error as Error)?.message ?? error).slice(0, 160)});
          return [] as PlanTeaserInput[];
        }),
        loadStats(db),
        loadStories(db).catch((error) => {
          log("warn", "landing.stories_failed", {
            reason: String((error as Error)?.message ?? error).slice(0, 160)});
          return [] as StoryCard[];
        }),
        (async () => {
          try {
            const { featuredStoreSlug } = await import("./storefront.server");
            return await featuredStoreSlug();
          } catch {
            return null;
          }
        })(),
      ]);

      const degraded = plans.length === 0 || stats.merchants === null;
      return { plans, stats, stories, demoSlug: demoSlug ?? null, degraded };
    }});
}
