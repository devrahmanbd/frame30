/**
 * Phase 4.4 — real-user monitoring, server half.
 *
 * Ingest is a public, unauthenticated path reachable from every storefront
 * page, so it is written defensively:
 *
 *  - the caller is charged twice (per store *and* per IP) before any DB work;
 *  - the batch is normalised and clamped by `vitals-report.ts` first, so a
 *    hostile payload can never reach Postgres in a shape we did not choose;
 *  - the session key is a salted hash, never a raw identifier — the table can
 *    dedupe and rate-shape without holding anything that identifies a shopper;
 *  - the insert is retried once on a transient failure and then *dropped*:
 *    telemetry must never turn into a storefront error, so every failure is
 *    counted and logged instead of thrown;
 *  - reads are aggregated server-side and cached per tenant with
 *    stale-while-revalidate, so a dashboard poll cannot scan the table.
 */
import {
  MIN_SAMPLES_TO_JUDGE,
  normalizeBatch,
  summarize,
  type VitalMetric,
  type VitalSample,
  type VitalsSummary,
} from "./vitals-report";

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

/** Hard ceiling on the ingest body. Anything larger is refused unread. */
export const MAX_BODY_BYTES = 8 * 1024;
/** Rows read per summary query. Bounded so a busy store cannot stall a page. */
export const SUMMARY_ROW_LIMIT = 5_000;
/** Summary cache lifetime, and how long a stale entry may still be served. */
const CACHE_TTL_MS = 60_000;
const CACHE_STALE_MS = 10 * 60_000;
/** A single DB call may not hold the request open longer than this. */
const DB_TIMEOUT_MS = 2_500;

export type IngestMeta = {
  merchantId: string;
  /** Client address for the per-IP bucket and the session salt. Never stored. */
  ip: string | null;
  userAgent: string | null;
};

export type IngestResult = {
  accepted: number;
  rejected: number;
  /** True when the batch was cut to MAX_BATCH. */
  truncated: boolean;
  /** True when the rows were dropped after a persistent write failure. */
  degraded: boolean;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function withTimeout<T>(label: string, work: Promise<T>, ms = DB_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch (err) {
    const { log } = await import("./observability.server");
    log("warn", "vitals.db_error", { label, message: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Pseudonymous session key: SHA-256 over IP + UA + store + the current hour,
 * truncated. Rotating hourly means the value cannot follow a shopper across a
 * session, which is all the dedupe path needs.
 */
export async function sessionHash(meta: IngestMeta): Promise<string | null> {
  if (!meta.ip && !meta.userAgent) return null;
  const hour = Math.floor(Date.now() / 3_600_000);
  const salt = process.env["VITALS_SALT"] ?? process.env["SUPABASE_PROJECT_ID"] ?? "framique";
  const input = `${salt}|${meta.merchantId}|${meta.ip ?? ""}|${meta.userAgent ?? ""}|${hour}`;
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return [...new Uint8Array(digest)]
      .slice(0, 12)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

function rowsFor(samples: VitalSample[], merchantId: string, hash: string | null) {
  return samples.map((s) => ({
    merchant_id: merchantId,
    template_key: s.template,
    route: s.template,
    // The table stores canonical CWV names in upper case; the wire format and
    // every pure helper use lower case, so the mapping happens exactly here.
    metric: s.metric.toUpperCase(),
    value_num: s.value,
    rating: s.rating,
    device_class: s.device,
    connection: s.connection,
    locale: s.locale,
    path: s.path,
    session_hash: hash,
    occurred_at: s.occurredAt,
  }));
}

/* ------------------------------------------------------------------ */
/* Ingest                                                              */
/* ------------------------------------------------------------------ */

/**
 * Persists one beacon batch. Never throws: the caller is a fire-and-forget
 * browser request and an exception here would be an error the shopper's
 * console reports as a broken storefront.
 */
export async function ingestVitals(input: unknown, meta: IngestMeta): Promise<IngestResult> {
  const { incr, log, observe } = await import("./observability.server");
  const started = Date.now();
  const batch = normalizeBatch(input);

  if (batch.rejected) {
    incr("framique_vitals_rejected_total", { reason: "malformed" }, batch.rejected);
  }
  if (batch.truncated) incr("framique_vitals_rejected_total", { reason: "truncated" });
  if (!batch.samples.length) {
    return { accepted: 0, rejected: batch.rejected, truncated: batch.truncated, degraded: false };
  }

  const hash = await sessionHash(meta);
  const rows = rowsFor(batch.samples, meta.merchantId, hash);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    from: (t: string) => {
      insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
    };
  };

  // One retry: a cold pooler connection is the common transient failure and it
  // succeeds on the second attempt. Anything beyond that is dropped, because a
  // telemetry write must never queue behind a shopper's page.
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await withTimeout("insert", db.from("web_vitals_sample").insert(rows));
    if (result && !result.error) {
      observe("framique_vitals_ingest_ms", Date.now() - started, {});
      incr("framique_vitals_accepted_total", {}, rows.length);
      for (const sample of batch.samples) {
        incr("framique_vitals_sample_total", { metric: sample.metric, rating: sample.rating });
      }
      return { accepted: rows.length, rejected: batch.rejected, truncated: batch.truncated, degraded: false };
    }
    lastError = result?.error?.message ?? "timeout";
  }

  incr("framique_vitals_dropped_total", { reason: "write_failed" }, rows.length);
  log("warn", "vitals.write_failed", { merchant_id: meta.merchantId, rows: rows.length, message: lastError });
  return { accepted: 0, rejected: batch.rejected, truncated: batch.truncated, degraded: true };
}

/* ------------------------------------------------------------------ */
/* Read path                                                           */
/* ------------------------------------------------------------------ */

export type SummaryOptions = {
  /** Look-back window in hours. Clamped to 1..720 (30 days). */
  hours?: number;
  /** Restrict to one template, e.g. "product". */
  template?: string | null;
};

type CacheEntry = { at: number; value: VitalsSummary };
const cache = new Map<string, CacheEntry>();

function cacheKey(merchantId: string, opts: Required<SummaryOptions>) {
  return `${merchantId}|${opts.hours}|${opts.template ?? "*"}`;
}

/** Invalidated by the publish path: a new theme invalidates old field data. */
export function invalidateVitals(merchantId: string) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${merchantId}|`)) cache.delete(key);
  }
}

/**
 * Aggregated field data for one store. Fails soft: on any error the caller
 * gets an empty summary and the dashboard renders "no field data yet" rather
 * than an error state, and a stale cached summary is preferred over nothing.
 */
export async function vitalsSummary(merchantId: string, options: SummaryOptions = {}): Promise<VitalsSummary> {
  const opts = {
    hours: Math.min(720, Math.max(1, Math.trunc(options.hours ?? 24))),
    template: options.template ?? null,
  };
  const key = cacheKey(merchantId, opts);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;

  const { incr, log } = await import("./observability.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(now - opts.hours * 3_600_000).toISOString();

  const db = supabaseAdmin as unknown as { from: (t: string) => any };
  let query = db
    .from("web_vitals_sample")
    .select("metric, value_num, device_class, path")
    .eq("merchant_id", merchantId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(SUMMARY_ROW_LIMIT);
  if (opts.template) query = query.eq("template_key", opts.template);

  const result = await withTimeout<{ data: unknown; error: { message: string } | null }>("summary", query);

  if (!result || result.error) {
    incr("framique_vitals_read_total", { outcome: "failed" });
    log("warn", "vitals.read_failed", { merchant_id: merchantId, message: result?.error?.message ?? "timeout" });
    // Stale-while-revalidate: a recent-enough summary beats a blank panel.
    if (hit && now - hit.at < CACHE_STALE_MS) return hit.value;
    return { total: 0, rollups: [], failing: [], worstPaths: [] };
  }

  const rows = (result.data ?? []) as {
    metric: VitalMetric;
    value_num: number;
    device_class: string;
    path: string;
  }[];
  const summary = summarize(
    rows.map((r) => ({ metric: r.metric, value: r.value_num, device: r.device_class, path: r.path })),
  );

  cache.set(key, { at: now, value: summary });
  incr("framique_vitals_read_total", { outcome: "ok" });
  if (summary.failing.length) {
    log("warn", "vitals.budget_breach", {
      merchant_id: merchantId,
      failing: summary.failing.map((f) => `${f.metric}:${f.p75}`).join(","),
      samples: summary.total,
    });
  }
  return summary;
}

/**
 * Release verdict for one store: `blocked` only when a budgeted metric fails
 * its p75 with enough samples to be believed. Deliberately conservative — a
 * quiet store must never be blocked by three unlucky page loads.
 */
export function vitalsVerdict(summary: VitalsSummary): { ok: boolean; reasons: string[] } {
  const reasons = summary.failing
    .filter((f) => f.device === "unknown" && f.samples >= MIN_SAMPLES_TO_JUDGE)
    .map((f) => `${f.metric.toUpperCase()} p75 ${f.p75} over budget ${f.budget} (${f.samples} samples)`);
  return { ok: reasons.length === 0, reasons };
}
