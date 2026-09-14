/**
 * Phase 3 — server runtime for dashboard-owned permalinks.
 *
 * Responsibilities, in the order they matter operationally:
 *
 *  1. **Read on the render path must never break the storefront.** Settings
 *     are read through a tenant-keyed SWR cache with a hard timeout, and any
 *     failure falls back to `DEFAULT_PERMALINKS`. A broken settings row makes
 *     URLs revert to the defaults — it does not 500 a shop.
 *  2. **A pattern change is a migration, not a setting.** Applying one plans
 *     the moves, previews them, then writes 301s for every affected live
 *     entity in bounded batches *before* the new pattern goes live, collapsing
 *     chains and refusing loops. If the sweep fails, the settings write is not
 *     performed — merchants get "nothing changed", never "half your URLs 404".
 *  3. **Everything is audited, rate limited and measured.** Writes go through
 *     `enforceRateLimit`, land in `activity_log`, and emit counters so a
 *     runaway importer is visible in Grafana instead of in support tickets.
 *
 * Batch sizes and caps are explicit constants rather than magic numbers: a
 * 50 000-product tenant must not be able to allocate 50 000 rows in one round
 * trip, and a CSV importer must not be able to write unbounded rules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached, invalidate } from "./cache.server";
import { incr, log, observe, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { auditAction } from "./hardening.server";
import {
  CSV_MAX_ROWS,
  DEFAULT_PERMALINKS,
  PermalinkError,
  buildPermalink,
  collapseRedirects,
  normaliseBase,
  parseRedirectCsv,
  planPermalinkChange,
  toRedirectCsv,
  validateSettings,
  validateSlug,
  type PermalinkEntity,
  type PermalinkKind,
  type PermalinkMove,
  type PermalinkSettings,
} from "./permalink";

type Client = SupabaseClient<Database>;
/**
 * The permalink columns are newer than the generated types in some
 * environments (the settings blob is jsonb, the redirect metadata columns were
 * added in Phase 3). A single narrow escape hatch here is honest and keeps the
 * rest of the module fully typed, rather than sprinkling casts at call sites.
 */
type LooseClient = SupabaseClient<Database> & { from: (table: string) => any };

const SETTINGS_KEY = (merchantId: string) => `permalinks|${merchantId}`;
const SLUG_KEY = (storeSlug: string) => `permalinks-slug|${storeSlug}`;

/** Hard ceiling on a single settings read from the render path. */
const READ_TIMEOUT_MS = 1_500;
/** Rows written per round trip when sweeping redirects. */
const SWEEP_BATCH = 250;
/** Entities we will plan a pattern change over before refusing. */
export const PLAN_MAX_ENTITIES = 20_000;
/** Rows a merchant may hold in the redirect manager per tenant. */
export const REDIRECT_MAX_ROWS = 20_000;

export class PermalinkServerError extends Error {
  constructor(
    readonly code:
      | "settings_read_failed"
      | "settings_write_failed"
      | "sweep_failed"
      | "too_many_entities"
      | "redirect_limit"
      | "redirect_invalid"
      | "not_found",
    message: string,
    readonly messageBn = message,
  ) {
    super(message);
    this.name = "PermalinkServerError";
  }
}

/* ------------------------------- settings --------------------------------- */

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
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

async function readSettingsRow(db: LooseClient, merchantId: string): Promise<PermalinkSettings> {
  const { data, error } = await db
    .from("merchant_settings")
    .select("permalinks")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw new PermalinkServerError("settings_read_failed", error.message);
  const raw = (data?.permalinks ?? {}) as Partial<PermalinkSettings>;
  try {
    return validateSettings(raw);
  } catch {
    // A stored value that no longer validates (a pattern we retired, a base
    // that became reserved) must not brick URL generation.
    log("warn", "permalink.settings_invalid", { merchant_id: merchantId });
    incr("framique_permalink_settings_invalid_total", {});
    return DEFAULT_PERMALINKS;
  }
}

/** Admin-side read: authoritative, uncached, surfaces real errors. */
export async function loadPermalinkSettings(db: Client, merchantId: string): Promise<PermalinkSettings> {
  return readSettingsRow(db as LooseClient, merchantId);
}

/**
 * Render-path read: cached per tenant with stale-while-revalidate, hard
 * timeout, and defaults on any failure. Called on every storefront URL build,
 * so it is the one function here that may never throw.
 */
export async function permalinkSettingsFor(
  db: Client,
  merchantId: string,
): Promise<PermalinkSettings> {
  try {
    return await cached(
      SETTINGS_KEY(merchantId),
      300,
      () => withTimeout(readSettingsRow(db as LooseClient, merchantId), READ_TIMEOUT_MS, "permalinks"),
      { staleSeconds: 1_800 },
    );
  } catch (error) {
    incr("framique_permalink_read_failures_total", {});
    log("warn", "permalink.read_failed", {
      merchant_id: merchantId,
      message: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_PERMALINKS;
  }
}

function invalidateTenant(merchantId: string, storeSlug?: string | null) {
  invalidate(SETTINGS_KEY(merchantId));
  if (storeSlug) {
    invalidate(SLUG_KEY(storeSlug));
    invalidate(`sf-redirects|${storeSlug}`);
  }
}

async function storeSlugOf(db: LooseClient, merchantId: string): Promise<string | null> {
  const { data } = await db.from("merchants").select("slug").eq("id", merchantId).maybeSingle();
  return data?.slug ?? null;
}

/* ------------------------------ entity index ------------------------------ */

type Row = { slug: string | null; date?: string | null; category?: string | null };

async function pull(
  db: LooseClient,
  table: string,
  merchantId: string,
  columns: string,
  filters: (query: any) => any,
): Promise<Row[]> {
  const out: Row[] = [];
  const page = 1_000;
  for (let from = 0; from < PLAN_MAX_ENTITIES; from += page) {
    const { data, error } = await filters(
      db.from(table).select(columns).eq("merchant_id", merchantId),
    ).range(from, from + page - 1);
    if (error) throw new PermalinkServerError("settings_read_failed", error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/**
 * Every entity whose URL the pattern owns. Only *live* rows are swept: a draft
 * has no indexed URL, so writing a redirect for it is noise that dilutes the
 * redirect table and slows the miss path.
 */
export async function liveEntities(db: Client, merchantId: string): Promise<PermalinkEntity[]> {
  const loose = db as LooseClient;
  const [articles, products, collections, pages] = await Promise.all([
    pull(loose, "articles", merchantId, "slug, published_at", (q) => q.eq("status", "published")),
    pull(loose, "products", merchantId, "slug", (q) => q.eq("status", "active")),
    pull(loose, "collections", merchantId, "slug", (q) => q),
    pull(loose, "storefront_pages", merchantId, "slug", (q) => q.eq("status", "published")),
  ]);

  const entities: PermalinkEntity[] = [];
  const push = (kind: PermalinkKind, rows: Row[], dated = false) => {
    for (const row of rows) {
      if (!row.slug) continue;
      entities.push({
        kind,
        slug: row.slug,
        date: dated ? ((row as { published_at?: string | null }).published_at ?? null) : null,
        category: row.category ?? null,
      });
    }
  };
  push("article", articles, true);
  push("product", products);
  push("collection", collections);
  push("page", pages);

  if (entities.length > PLAN_MAX_ENTITIES) {
    throw new PermalinkServerError(
      "too_many_entities",
      `This store has more than ${PLAN_MAX_ENTITIES} live URLs; contact support before changing the pattern.`,
      `এই স্টোরে ${PLAN_MAX_ENTITIES}-এর বেশি লাইভ URL আছে; প্যাটার্ন বদলানোর আগে সাপোর্টে যোগাযোগ করুন।`,
    );
  }
  return entities;
}

/* ---------------------------- change preview ------------------------------ */

export type PermalinkPlan = {
  before: PermalinkSettings;
  after: PermalinkSettings;
  moves: PermalinkMove[];
  /** Capped sample for the UI; `total` is the honest count. */
  sample: PermalinkMove[];
  total: number;
  byKind: Record<PermalinkKind, number>;
  droppedLoops: number;
  warnings: { code: string; en: string; bn: string }[];
};

const SAMPLE = 50;

/**
 * Dry run. Nothing is written; the merchant sees exactly which URLs move and
 * how many redirects the apply step will create.
 */
export async function previewPermalinkChange(
  db: Client,
  merchantId: string,
  next: Partial<PermalinkSettings>,
): Promise<PermalinkPlan> {
  return withSpan("permalink.preview", async () => {
    const before = await loadPermalinkSettings(db, merchantId);
    const after = validateSettings(next);
    const entities = await liveEntities(db, merchantId);
    const moves = planPermalinkChange(before, after, entities);
    const existing = await listAllRedirectPairs(db, merchantId);
    const { dropped } = collapseRedirects(existing, moves);

    const byKind: Record<PermalinkKind, number> = { article: 0, product: 0, collection: 0, page: 0 };
    for (const move of moves) byKind[move.kind] += 1;

    const warnings: { code: string; en: string; bn: string }[] = [];
    if (!after.articleBase && after.articlePattern === "/%slug%") {
      warnings.push({
        code: "root_shadow",
        en: "Articles will live at the site root, so a post slug can shadow a future page.",
        bn: "লেখাগুলো সাইটের রুটে থাকবে, তাই কোনো স্লাগ ভবিষ্যতের পেজকে ঢেকে দিতে পারে।",
      });
    }
    if (moves.length > 5_000) {
      warnings.push({
        code: "large_sweep",
        en: `${moves.length} URLs move — search engines will take weeks to recrawl.`,
        bn: `${moves.length}টি URL সরবে — সার্চ ইঞ্জিনের পুনরায় ক্রল করতে সপ্তাহ লাগবে।`,
      });
    }
    if (after.articlePattern.includes("%category%")) {
      warnings.push({
        code: "category_pattern",
        en: "Posts without a category will publish under /uncategorised/.",
        bn: "ক্যাটাগরিহীন লেখা /uncategorised/-এর নিচে প্রকাশ হবে।",
      });
    }

    observe("framique_permalink_plan_size", moves.length, {});
    return {
      before,
      after,
      moves,
      sample: moves.slice(0, SAMPLE),
      total: moves.length,
      byKind,
      droppedLoops: dropped.filter((d) => d.reason === "loop").length,
      warnings,
    };
  });
}

/* ------------------------------ apply change ------------------------------ */

async function listAllRedirectPairs(db: Client, merchantId: string) {
  const loose = db as LooseClient;
  const out: { from: string; to: string }[] = [];
  const page = 1_000;
  for (let from = 0; from < REDIRECT_MAX_ROWS; from += page) {
    const { data, error } = await loose
      .from("url_redirects")
      .select("from_path, to_path, status_code")
      .eq("merchant_id", merchantId)
      .neq("status_code", 410)
      .range(from, from + page - 1);
    if (error) throw new PermalinkServerError("settings_read_failed", error.message);
    const rows = (data ?? []) as { from_path: string; to_path: string | null }[];
    for (const row of rows) if (row.to_path) out.push({ from: row.from_path, to: row.to_path });
    if (rows.length < page) break;
  }
  return out;
}

/**
 * Writes the sweep, then the settings — in that order and never the reverse.
 *
 * If the sweep fails half way, some old URLs already redirect to their new
 * home while the pattern is unchanged; those rules simply do not fire, because
 * the old URLs still resolve. That is a harmless state. The opposite order
 * would leave live URLs 404ing.
 */
export async function applyPermalinkChange(
  db: Client,
  merchantId: string,
  actor: string,
  next: Partial<PermalinkSettings>,
): Promise<{ settings: PermalinkSettings; redirects: number; dropped: number }> {
  await enforceRateLimit("seo.write", `permalinks:${merchantId}`);
  return withSpan("permalink.apply", async () => {
    const plan = await previewPermalinkChange(db, merchantId, next);
    const existing = await listAllRedirectPairs(db, merchantId);
    const { rules, dropped } = collapseRedirects(existing, plan.moves);

    // Only the rules that actually changed are written back: rewriting 20 000
    // untouched rows on every settings save would be an easy way to melt the
    // database for no benefit.
    const existingMap = new Map(existing.map((rule) => [normaliseBase(rule.from), normaliseBase(rule.to)]));
    const changed = rules.filter((rule) => existingMap.get(rule.from) !== rule.to);

    if (existing.length + changed.length > REDIRECT_MAX_ROWS) {
      throw new PermalinkServerError(
        "redirect_limit",
        `This change would exceed the ${REDIRECT_MAX_ROWS} redirect limit for a store.`,
        `এই পরিবর্তন স্টোরের ${REDIRECT_MAX_ROWS} রিডাইরেক্ট সীমা ছাড়িয়ে যাবে।`,
      );
    }

    const loose = db as LooseClient;
    let written = 0;
    for (let i = 0; i < changed.length; i += SWEEP_BATCH) {
      const batch = changed.slice(i, i + SWEEP_BATCH).map((rule) => ({
        merchant_id: merchantId,
        from_path: rule.from,
        to_path: rule.to,
        status_code: 301,
        entity_type: "permalink",
        origin: "pattern_change",
      }));
      const { error } = await loose
        .from("url_redirects")
        .upsert(batch, { onConflict: "merchant_id,from_path" });
      if (error) {
        incr("framique_permalink_sweep_failures_total", {});
        log("error", "permalink.sweep_failed", {
          merchant_id: merchantId,
          written,
          message: error.message,
        });
        throw new PermalinkServerError(
          "sweep_failed",
          "Could not write all redirects — the permalink pattern was left unchanged.",
          "সব রিডাইরেক্ট লেখা যায়নি — পারমালিংক প্যাটার্ন অপরিবর্তিত রাখা হয়েছে।",
        );
      }
      written += batch.length;
      incr("framique_permalink_redirects_written_total", { origin: "pattern_change" }, batch.length);
    }

    const { error: settingsError } = await loose
      .from("merchant_settings")
      .update({ permalinks: plan.after as unknown as Record<string, unknown> })
      .eq("merchant_id", merchantId);
    if (settingsError) {
      throw new PermalinkServerError("settings_write_failed", settingsError.message);
    }

    const slug = await storeSlugOf(loose, merchantId);
    invalidateTenant(merchantId, slug);
    await auditAction(db, merchantId, actor, "permalinks.updated", "permalink_settings", {
      before: plan.before,
      after: plan.after,
      redirects: written,
      dropped: dropped.length,
    });
    log("info", "permalink.applied", {
      merchant_id: merchantId,
      redirects: written,
      moved: plan.total,
      dropped: dropped.length,
    });
    incr("framique_permalink_changes_total", {});
    return { settings: plan.after, redirects: written, dropped: dropped.length };
  });
}

/* -------------------------------- slugs ----------------------------------- */

export type SlugVerdict = {
  ok: boolean;
  slug: string;
  reason: "available" | "invalid" | "reserved" | "taken" | "redirect_source";
  messageEn: string;
  messageBn: string;
  suggestion?: string;
};

/**
 * Inline availability check for the editor's slug field.
 *
 * A slug is unavailable not only when a sibling owns it but also when an
 * existing redirect points *away* from it: reusing such a slug would make the
 * new page unreachable, because the redirect fires first.
 */
export async function checkSlug(
  db: Client,
  merchantId: string,
  input: { kind: PermalinkKind; slug: string; excludeId?: string | null },
): Promise<SlugVerdict> {
  let slug: string;
  try {
    slug = validateSlug(input.slug);
  } catch (error) {
    const err = error as PermalinkError;
    return {
      ok: false,
      slug: (input.slug ?? "").trim().toLowerCase(),
      reason: err.code === "slug_invalid" && /reserved/i.test(err.messageEn) ? "reserved" : "invalid",
      messageEn: err.messageEn,
      messageBn: err.messageBn,
    };
  }

  const loose = db as LooseClient;
  const table =
    input.kind === "article"
      ? "articles"
      : input.kind === "product"
        ? "products"
        : input.kind === "collection"
          ? "collections"
          : "storefront_pages";

  let query = loose.from(table).select("id").eq("merchant_id", merchantId).eq("slug", slug).limit(1);
  if (input.excludeId) query = query.neq("id", input.excludeId);
  const { data, error } = await query;
  if (error) throw new PermalinkServerError("settings_read_failed", error.message);
  if ((data ?? []).length > 0) {
    return {
      ok: false,
      slug,
      reason: "taken",
      messageEn: "Another entry already uses that slug.",
      messageBn: "এই স্লাগ আগে থেকেই ব্যবহৃত।",
      suggestion: `${slug}-2`,
    };
  }

  const settings = await loadPermalinkSettings(db, merchantId);
  const path = buildPermalink(settings, { kind: input.kind, slug });
  const { data: rule } = await loose
    .from("url_redirects")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("from_path", path)
    .limit(1);
  if ((rule ?? []).length > 0) {
    return {
      ok: false,
      slug,
      reason: "redirect_source",
      messageEn: "An existing redirect sends this URL somewhere else — delete it first.",
      messageBn: "একটি রিডাইরেক্ট এই URL অন্যত্র পাঠায় — আগে সেটি মুছুন।",
      suggestion: `${slug}-2`,
    };
  }

  return {
    ok: true,
    slug,
    reason: "available",
    messageEn: `Available at ${path}`,
    messageBn: `${path} — ব্যবহারযোগ্য`,
  };
}

/* --------------------------- redirect manager ----------------------------- */

export type RedirectRow = {
  id: string;
  fromPath: string;
  toPath: string;
  status: 301 | 302 | 410;
  origin: string;
  entityType: string;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
};

export type RedirectQuery = {
  search?: string;
  origin?: string;
  status?: 301 | 302 | 410 | "all";
  page?: number;
  pageSize?: number;
};

function mapRedirect(row: Record<string, any>): RedirectRow {
  const code = Number(row["status_code"] ?? 301);
  return {
    id: String(row["id"]),
    fromPath: String(row["from_path"]),
    toPath: String(row["to_path"] ?? ""),
    status: (code === 410 ? 410 : code === 302 ? 302 : 301) as 301 | 302 | 410,
    origin: String(row["origin"] ?? "manual"),
    entityType: String(row["entity_type"] ?? "manual"),
    hits: Number(row["hits"] ?? 0),
    lastHitAt: (row["last_hit_at"] as string | null) ?? null,
    createdAt: String(row["created_at"]),
  };
}

const SELECT_REDIRECT =
  "id, from_path, to_path, status_code, origin, entity_type, hits, last_hit_at, created_at";

export async function listRedirectsPage(
  db: Client,
  merchantId: string,
  query: RedirectQuery = {},
): Promise<{ rows: RedirectRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200);
  const page = Math.max(query.page ?? 1, 1);
  const loose = db as LooseClient;

  let builder = loose
    .from("url_redirects")
    .select(SELECT_REDIRECT, { count: "exact" })
    .eq("merchant_id", merchantId);
  if (query.search?.trim()) {
    const term = `%${query.search.trim().replace(/[%_]/g, "")}%`;
    builder = builder.or(`from_path.ilike.${term},to_path.ilike.${term}`);
  }
  if (query.origin && query.origin !== "all") builder = builder.eq("origin", query.origin);
  if (query.status && query.status !== "all") builder = builder.eq("status_code", query.status);

  const { data, error, count } = await builder
    .order("hits", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new PermalinkServerError("settings_read_failed", error.message);
  return {
    rows: (data ?? []).map(mapRedirect),
    total: count ?? 0,
    page,
    pageSize,
  };
}

function assertRule(from: string, to: string, status: 301 | 302 | 410) {
  if (!from || from === "/") {
    throw new PermalinkServerError("redirect_invalid", "Source path is required.", "সোর্স পাথ দরকার।");
  }
  if (status !== 410) {
    if (!to) {
      throw new PermalinkServerError(
        "redirect_invalid",
        "A 301 or 302 needs a destination.",
        "৩০১/৩০২-এর জন্য গন্তব্য দরকার।",
      );
    }
    if (to === from) {
      throw new PermalinkServerError(
        "redirect_invalid",
        "A redirect cannot point at itself.",
        "রিডাইরেক্ট নিজের দিকেই নির্দেশ করতে পারে না।",
      );
    }
  }
}

/** Creates or replaces one rule, collapsing any chain it just created. */
export async function upsertRedirect(
  db: Client,
  merchantId: string,
  actor: string,
  input: { fromPath: string; toPath: string; status: 301 | 302 | 410; origin?: string },
): Promise<RedirectRow> {
  await enforceRateLimit("seo.write", `redirect:${merchantId}`);
  const from = normaliseBase(input.fromPath);
  const to = input.status === 410 ? "" : normaliseBase(input.toPath);
  assertRule(from, to, input.status);

  const loose = db as LooseClient;
  const { count } = await loose
    .from("url_redirects")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId);
  if ((count ?? 0) >= REDIRECT_MAX_ROWS) {
    throw new PermalinkServerError(
      "redirect_limit",
      `A store may hold ${REDIRECT_MAX_ROWS} redirects.`,
      `একটি স্টোরে সর্বোচ্চ ${REDIRECT_MAX_ROWS}টি রিডাইরেক্ট রাখা যায়।`,
    );
  }

  const { data, error } = await loose
    .from("url_redirects")
    .upsert(
      {
        merchant_id: merchantId,
        from_path: from,
        to_path: to || null,
        status_code: input.status,
        origin: input.origin ?? "manual",
        entity_type: "manual",
      },
      { onConflict: "merchant_id,from_path" },
    )
    .select(SELECT_REDIRECT)
    .single();
  if (error) throw new PermalinkServerError("settings_write_failed", error.message);

  if (input.status !== 410 && to) {
    // Anything that pointed at the old source now points one hop too far.
    await loose
      .from("url_redirects")
      .update({ to_path: to })
      .eq("merchant_id", merchantId)
      .eq("to_path", from)
      .neq("from_path", from);
    // And a rule whose source we just started serving again is dead weight.
    await loose.from("url_redirects").delete().eq("merchant_id", merchantId).eq("from_path", to);
  }

  const slug = await storeSlugOf(loose, merchantId);
  invalidateTenant(merchantId, slug);
  await auditAction(db, merchantId, actor, "redirect.saved", "url_redirect", {
    from,
    to,
    status: input.status,
  });
  incr("framique_permalink_redirects_written_total", { origin: input.origin ?? "manual" });
  return mapRedirect(data as Record<string, any>);
}

export async function deleteRedirects(
  db: Client,
  merchantId: string,
  actor: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const loose = db as LooseClient;
  const { error, count } = await loose
    .from("url_redirects")
    .delete({ count: "exact" })
    .eq("merchant_id", merchantId)
    .in("id", ids.slice(0, 500));
  if (error) throw new PermalinkServerError("settings_write_failed", error.message);
  const slug = await storeSlugOf(loose, merchantId);
  invalidateTenant(merchantId, slug);
  await auditAction(db, merchantId, actor, "redirect.deleted", "url_redirect", { count: count ?? 0 });
  return count ?? 0;
}

/**
 * CSV import. Parse errors are reported, not thrown: a merchant importing 900
 * rules from an old plugin should get 897 rules and three line numbers, not a
 * rejection.
 */
export async function importRedirectCsv(
  db: Client,
  merchantId: string,
  actor: string,
  text: string,
): Promise<{ imported: number; skipped: number; errors: { line: number; message: string }[] }> {
  await enforceRateLimit("seo.write", `redirect-import:${merchantId}`);
  const { rows, errors } = parseRedirectCsv(text);
  if (rows.length === 0) return { imported: 0, skipped: 0, errors };

  const loose = db as LooseClient;
  const { count } = await loose
    .from("url_redirects")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId);
  const room = REDIRECT_MAX_ROWS - (count ?? 0);
  const accepted = rows.slice(0, Math.max(room, 0));
  const skipped = rows.length - accepted.length;
  if (skipped > 0) {
    errors.push({ line: 0, message: `${skipped} row(s) skipped — store redirect limit reached.` });
  }

  let imported = 0;
  for (let i = 0; i < accepted.length; i += SWEEP_BATCH) {
    const batch = accepted.slice(i, i + SWEEP_BATCH).map((row) => ({
      merchant_id: merchantId,
      from_path: row.from,
      to_path: row.status === 410 ? null : row.to,
      status_code: row.status,
      origin: "import",
      entity_type: "manual",
    }));
    const { error } = await loose
      .from("url_redirects")
      .upsert(batch, { onConflict: "merchant_id,from_path" });
    if (error) {
      errors.push({ line: 0, message: `Batch starting at row ${i + 1} failed: ${error.message}` });
      break;
    }
    imported += batch.length;
  }

  const slug = await storeSlugOf(loose, merchantId);
  invalidateTenant(merchantId, slug);
  await auditAction(db, merchantId, actor, "redirect.imported", "url_redirect", {
    imported,
    skipped,
    errors: errors.length,
  });
  incr("framique_permalink_redirects_written_total", { origin: "import" }, imported);
  log("info", "permalink.csv_imported", { merchant_id: merchantId, imported, skipped });
  return { imported, skipped, errors };
}

/** Export is capped at the same size the importer accepts, so it round-trips. */
export async function exportRedirectCsv(db: Client, merchantId: string): Promise<string> {
  const loose = db as LooseClient;
  const { data, error } = await loose
    .from("url_redirects")
    .select("from_path, to_path, status_code")
    .eq("merchant_id", merchantId)
    .order("from_path")
    .limit(CSV_MAX_ROWS);
  if (error) throw new PermalinkServerError("settings_read_failed", error.message);
  return toRedirectCsv(
    (data ?? []).map((row: Record<string, any>) => ({
      from: String(row["from_path"]),
      to: String(row["to_path"] ?? ""),
      status: Number(row["status_code"] ?? 301),
    })),
  );
}

/* -------------------------------- 404 log --------------------------------- */

export type MissingRow = {
  id: string;
  path: string;
  hits: number;
  referrer: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

/**
 * Records a miss. Called from the storefront's not-found path, so it is
 * fail-soft by construction: a logging failure must never turn a 404 page into
 * a 500. Bot noise is bounded by the unique index — one row per path, a
 * counter, not a row per request.
 */
export async function recordMissingPath(
  merchantId: string,
  path: string,
  referrer?: string | null,
): Promise<void> {
  const normalised = normaliseBase(path);
  if (!normalised || normalised === "/") return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loose = supabaseAdmin as unknown as LooseClient;
    const { data } = await loose
      .from("url_missing_log")
      .select("id, hits")
      .eq("merchant_id", merchantId)
      .eq("path", normalised)
      .maybeSingle();
    if (data) {
      await loose
        .from("url_missing_log")
        .update({ hits: Number(data.hits ?? 0) + 1, last_seen_at: new Date().toISOString() })
        .eq("id", data.id);
    } else {
      await loose.from("url_missing_log").insert({
        merchant_id: merchantId,
        path: normalised,
        referrer: referrer ? referrer.slice(0, 500) : null,
      });
    }
    incr("framique_permalink_missing_total", {});
  } catch (error) {
    log("warn", "permalink.missing_log_failed", {
      merchant_id: merchantId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listMissingPaths(
  db: Client,
  merchantId: string,
  limit = 100,
): Promise<MissingRow[]> {
  const loose = db as LooseClient;
  const { data, error } = await loose
    .from("url_missing_log")
    .select("id, path, hits, referrer, first_seen_at, last_seen_at, resolved_redirect_id")
    .eq("merchant_id", merchantId)
    .is("resolved_redirect_id", null)
    .order("hits", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw new PermalinkServerError("settings_read_failed", error.message);
  return (data ?? []).map((row: Record<string, any>) => ({
    id: String(row["id"]),
    path: String(row["path"]),
    hits: Number(row["hits"] ?? 0),
    referrer: (row["referrer"] as string | null) ?? null,
    firstSeenAt: String(row["first_seen_at"]),
    lastSeenAt: String(row["last_seen_at"]),
  }));
}

/** One click: turn a logged 404 into a redirect and mark the log row resolved. */
export async function resolveMissingPath(
  db: Client,
  merchantId: string,
  actor: string,
  input: { id: string; toPath: string; status: 301 | 302 | 410 },
): Promise<RedirectRow> {
  const loose = db as LooseClient;
  const { data: row, error } = await loose
    .from("url_missing_log")
    .select("id, path")
    .eq("merchant_id", merchantId)
    .eq("id", input.id)
    .maybeSingle();
  if (error) throw new PermalinkServerError("settings_read_failed", error.message);
  if (!row) throw new PermalinkServerError("not_found", "That 404 entry no longer exists.");

  const redirect = await upsertRedirect(db, merchantId, actor, {
    fromPath: String(row.path),
    toPath: input.toPath,
    status: input.status,
    origin: "missing_log",
  });
  await loose
    .from("url_missing_log")
    .update({ resolved_redirect_id: redirect.id })
    .eq("id", row.id)
    .eq("merchant_id", merchantId);
  incr("framique_permalink_missing_resolved_total", {});
  return redirect;
}

export async function dismissMissingPath(db: Client, merchantId: string, id: string): Promise<void> {
  const loose = db as LooseClient;
  const { error } = await loose
    .from("url_missing_log")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("id", id);
  if (error) throw new PermalinkServerError("settings_write_failed", error.message);
}
