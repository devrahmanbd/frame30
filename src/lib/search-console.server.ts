/**
 * Phase 5 — Search Console / Site Kit server runtime.
 *
 * This module is the *only* place in the product that talks to Google. Every
 * other surface (admin desk, cron route, storefront) reads rows this module
 * has already written. That single rule is what makes the integration safe to
 * operate:
 *
 *  1. **Quota is a shared, finite resource.** Google's Search Console quota is
 *     per connected project, not per tenant, so one merchant hammering
 *     "refresh" must not starve the other thousand. Every outbound class has
 *     its own limiter bucket (`gsc.*`) and the scheduled sweep is bounded by
 *     merchant count *and* wall-clock deadline.
 *  2. **A page render never calls Google.** Dashboard reads come from
 *     `search_console_daily`; the storefront only ever reads a cached settings
 *     projection. If Google is down, the product is merely stale.
 *  3. **Failures are typed, logged and humanised — never leaked.** The gateway
 *     relays the provider's status and body; we log both server-side and hand
 *     the UI a stable code plus `humaniseFailure()` copy.
 *  4. **403 stops, 429/5xx retries.** Retrying a permission error burns quota
 *     to reproduce a fact we already know, and hides a reconnect behind a
 *     "temporary" story.
 *  5. **Every run is auditable.** `search_console_jobs` records kind, trigger,
 *     attempts, rows written, duration and the error code for both successes
 *     and failures, so "why are my numbers stale" is answerable from data.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached, invalidate } from "./cache.server";
import { auditAction } from "./hardening.server";
import { captureError, incr, log, observe, registerMetric, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { publicClient } from "./pricing.server";
import {
  DATA_LAG_DAYS,
  DEFAULT_SITE_KIT,
  MAX_ATTEMPTS,
  aggregate,
  backoffSeconds,
  classifyResponse,
  comparePeriods,
  dateRange,
  humaniseFailure,
  latestUsableDay,
  normaliseRows,
  readInspection,
  resolveProperty,
  shouldSubmitSitemap,
  tagPlan,
  validateSiteKit,
  verificationTags,
  type AnalyticsSettings,
  type Delta,
  type GscApiRow,
  type GscProperty,
  type PropertyResolution,
  type SiteKitSettings,
  type SnapshotRow,
  type UrlInspection,
  type VerificationSettings,
} from "./search-console";

type Client = SupabaseClient<Database>;
/**
 * The Site Kit tables are newer than the committed generated types in some
 * environments. One narrow, named escape hatch beats scattering `as any`
 * across forty call sites.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type LooseClient = Client & { from: (table: string) => any };

/* ========================================================================== *
 * Constants
 * ========================================================================== */

const DEFAULT_GATEWAY = "https://searchconsole.googleapis.com/webmasters/v3";

/** Per-request ceiling. Google answers analytics queries well inside this. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Whole-refresh ceiling for one merchant, retries and pagination included. */
const REFRESH_DEADLINE_MS = 60_000;
/** Whole-sweep ceiling: a cron invocation must return, not run until killed. */
const SWEEP_DEADLINE_MS = 240_000;
/** Rows per analytics page. Google caps at 25 000. */
const PAGE_SIZE = 5_000;
/** Hard stop on pagination so a pathological property cannot run forever. */
const MAX_PAGES = 8;
/** Rows per insert batch — small enough to stay under statement limits. */
const INSERT_CHUNK = 500;
/** Days of history the snapshot keeps. Older rows are pruned every refresh. */
export const RETENTION_DAYS = 180;
/** Default window a refresh pulls. */
export const DEFAULT_WINDOW_DAYS = 28;
/** Backoff between scheduled refreshes of the same merchant. */
const REFRESH_INTERVAL_HOURS = 12;
/** After this many consecutive failures the connection is parked for a day. */
const FAILURE_PARK_THRESHOLD = 5;

const SETTINGS_TTL = 300;
const SITES_TTL = 300;
const STOREFRONT_TTL = 600;

registerMetric("framique_gsc_request_total", "counter", "Search Console gateway calls by operation and outcome");
registerMetric("framique_gsc_request_ms", "histogram", "Search Console gateway latency in milliseconds", [
  100, 250, 500, 1000, 2500, 5000, 10000, 20000,
]);
registerMetric("framique_gsc_retry_total", "counter", "Search Console gateway retries by reason");
registerMetric("framique_gsc_refresh_total", "counter", "Search Console snapshot refreshes by trigger and outcome");
registerMetric("framique_gsc_rows_written_total", "counter", "Snapshot rows persisted by dimension");
registerMetric("framique_gsc_sweep_ms", "histogram", "Scheduled Search Console sweep duration in milliseconds", [
  500, 2000, 10000, 30000, 60000, 120000, 240000,
]);
registerMetric("framique_gsc_sitemap_total", "counter", "Sitemap submissions by outcome");
registerMetric("framique_gsc_inspect_total", "counter", "URL inspections by verdict");

/* ========================================================================== *
 * Errors
 * ========================================================================== */

export type SearchConsoleErrorCode =
  | "unconfigured"
  | "unauthorized"
  | "forbidden"
  | "invalid"
  | "no_property"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "read_failed"
  | "write_failed";

export class SearchConsoleError extends Error {
  constructor(
    readonly code: SearchConsoleErrorCode,
    message: string,
    readonly status: number | null = null,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SearchConsoleError";
  }

  /** Bilingual, non-technical copy for a banner. Never the provider's body. */
  humanise() {
    return humaniseFailure(this.code);
  }
}

function asError(err: unknown): SearchConsoleError {
  if (err instanceof SearchConsoleError) return err;
  return new SearchConsoleError("upstream", err instanceof Error ? err.message : String(err));
}

/* ========================================================================== *
 * Gateway transport
 * ========================================================================== */

type Credentials = { apiKey: string; connectionKey: string };

/**
 * Secrets are read inside the call, never at module scope: env injection
 * happens per request in the worker runtime, and a module-scope read would
 * freeze whatever was (or was not) present at cold start.
 */
function credentials(): Credentials {
  const apiKey = process.env["SEARCH_CONSOLE_API_KEY"] || process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"] || "";
  const connectionKey = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"] || apiKey;
  if (!apiKey && !connectionKey) {
    throw new SearchConsoleError(
      "unconfigured",
      "Google Search Console is not connected for this project.",
    );
  }
  return { apiKey, connectionKey };
}

/** Is the connector linked at all? Used to render setup state without calling out. */
export function siteKitConfigured(): boolean {
  return Boolean(process.env["SEARCH_CONSOLE_API_KEY"] || process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"]);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Full jitter: synchronised retries across tenants are their own outage. */
function jitter(seconds: number) {
  return Math.round(seconds * 1000 * (0.5 + Math.random() * 0.5));
}

function truncate(text: string, max = 400) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type GatewayOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  /** Absolute wall-clock budget for this call including retries. */
  deadline?: number;
  merchantId?: string | null;
};

/**
 * One gateway call with the full retry policy applied.
 *
 * Returns the parsed JSON body. Throws `SearchConsoleError` with a stable code
 * on every failure path; the provider's own body is logged, never rethrown to
 * a caller that might render it.
 */
async function gatewayCall<T>(operation: string, path: string, opts: GatewayOptions = {}): Promise<T> {
  const { apiKey, connectionKey } = credentials();
  const deadline = opts.deadline ?? Date.now() + REQUEST_TIMEOUT_MS * MAX_ATTEMPTS;
  const method = opts.method ?? "GET";

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    const started = Date.now();
    const controller = new AbortController();
    const budget = Math.min(REQUEST_TIMEOUT_MS, Math.max(1_000, deadline - Date.now()));
    const timer = setTimeout(() => controller.abort(), budget);

    let response: Response;
    try {
      const gateway = process.env["GOOGLE_SEARCH_CONSOLE_GATEWAY_URL"] || DEFAULT_GATEWAY;
      response = await fetch(`${gateway}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey || connectionKey}`,
          "X-Connection-Api-Key": connectionKey,
          ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      observe("framique_gsc_request_ms", Date.now() - started, { operation });
      const aborted = (err as { name?: string })?.name === "AbortError";
      const code: SearchConsoleErrorCode = aborted ? "timeout" : "upstream";
      if (attempt >= MAX_ATTEMPTS || Date.now() >= deadline) {
        incr("framique_gsc_request_total", { operation, outcome: code });
        log("warn", "gsc.transport_failed", { operation, attempt, aborted, merchantId: opts.merchantId ?? null });
        throw new SearchConsoleError(code, "Google could not be reached.", null, true);
      }
      incr("framique_gsc_retry_total", { operation, reason: code });
      await sleep(jitter(backoffSeconds(attempt)));
      continue;
    }
    clearTimeout(timer);
    observe("framique_gsc_request_ms", Date.now() - started, { operation });

    if (response.ok) {
      incr("framique_gsc_request_total", { operation, outcome: "ok" });
      // PUT /sitemaps returns 204 with an empty body.
      const text = await response.text();
      return (text ? JSON.parse(text) : {}) as T;
    }

    const body = truncate(await response.text().catch(() => ""));
    const verdict = classifyResponse(response.status, response.headers, attempt);
    if (verdict.action === "retry" && Date.now() + verdict.afterSeconds * 1000 < deadline) {
      incr("framique_gsc_retry_total", { operation, reason: verdict.reason });
      log("warn", "gsc.retry", {
        operation,
        attempt,
        status: response.status,
        reason: verdict.reason,
        merchantId: opts.merchantId ?? null,
      });
      await sleep(jitter(verdict.afterSeconds));
      continue;
    }

    const code: SearchConsoleErrorCode =
      verdict.action === "stop"
        ? verdict.code === "fatal"
          ? response.status === 429
            ? "rate_limited"
            : "upstream"
          : verdict.code
        : "upstream";
    incr("framique_gsc_request_total", { operation, outcome: code });
    log("error", "gsc.request_failed", {
      operation,
      status: response.status,
      code,
      attempt,
      merchantId: opts.merchantId ?? null,
      body,
    });
    throw new SearchConsoleError(
      code,
      verdict.action === "stop" ? verdict.reason : `Google rejected the request (HTTP ${response.status}).`,
      response.status,
      code === "rate_limited" || code === "upstream",
    );
  }
}

/* ========================================================================== *
 * Property discovery
 * ========================================================================== */

type SitesResponse = { siteEntry?: { siteUrl?: string; permissionLevel?: string }[] };

/**
 * The verified properties on the connected account.
 *
 * Cached per isolate because the list changes at human speed and the call is
 * on the interactive path of the settings screen. Not tenant data — it belongs
 * to the workspace connection — so the key carries no merchant id.
 */
export async function listVerifiedProperties(force = false): Promise<GscProperty[]> {
  if (force) invalidate("gsc-sites");
  return cached("gsc-sites", SITES_TTL, async () => {
    const payload = await gatewayCall<SitesResponse>("sites.list", "/webmasters/v3/sites");
    return (payload.siteEntry ?? [])
      .filter((entry) => entry.siteUrl && entry.permissionLevel !== "siteUnverifiedUser")
      .map((entry) => ({ siteUrl: entry.siteUrl as string, permissionLevel: entry.permissionLevel ?? "unknown" }));
  });
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}

/**
 * Matches this store's host against the verified properties.
 *
 * Ambiguity is surfaced, never guessed: two plausible properties come back as
 * `selection_required` and the merchant picks. Auto-picking binds reporting to
 * the wrong property and the mistake only shows up weeks later.
 */
export async function resolvePropertyForStore(origin: string): Promise<PropertyResolution> {
  const host = hostOf(origin);
  if (!host) return { status: "none", reason: "no_verified_property" };
  return resolveProperty(await listVerifiedProperties(), host);
}

/** Re-validates a merchant's stored choice against the live verified list. */
async function assertSelectable(siteUrl: string): Promise<GscProperty> {
  const properties = await listVerifiedProperties();
  const match = properties.find((p) => p.siteUrl === siteUrl);
  if (!match) {
    throw new SearchConsoleError(
      "forbidden",
      "The selected property is no longer verified for the connected account.",
      403,
    );
  }
  return match;
}

/* ========================================================================== *
 * Settings
 * ========================================================================== */

const settingsKey = (merchantId: string) => `sitekit|${merchantId}`;
const storefrontKey = (merchantId: string) => `sitekit-public|${merchantId}`;

/** Merchant-scoped read through the caller's own client, so RLS still applies. */
export async function loadSiteKit(db: Client, merchantId: string): Promise<SiteKitSettings> {
  const { data, error } = await (db as LooseClient)
    .from("merchant_settings")
    .select("site_kit")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw new SearchConsoleError("read_failed", "Could not read Site Kit settings.");
  return validateSiteKit(data?.site_kit ?? null).value;
}

export type StorefrontSiteKit = {
  verification: VerificationSettings;
  analytics: AnalyticsSettings;
};

/**
 * The projection the storefront is allowed to see: verification tags (public
 * by design — they live in the HTML) and the analytics plan. The chosen
 * Search Console property never ships to a shopper's browser.
 */
export async function storefrontSiteKit(merchantId: string): Promise<StorefrontSiteKit> {
  return cached(storefrontKey(merchantId), STOREFRONT_TTL, async () => {
    try {
      const db = publicClient();
      const { data } = await (db as LooseClient)
        .from("merchant_settings")
        .select("site_kit")
        .eq("merchant_id", merchantId)
        .maybeSingle();
      const value = validateSiteKit(data?.site_kit ?? null).value;
      return { verification: value.verification, analytics: value.analytics };
    } catch (err) {
      // The storefront must never 500 because a settings row misbehaved.
      log("warn", "sitekit.storefront_read_failed", { merchantId });
      void captureError(err, { scope: "sitekit.storefront" });
      return { verification: DEFAULT_SITE_KIT.verification, analytics: DEFAULT_SITE_KIT.analytics };
    }
  });
}

/** Head tags for a storefront document, ready to spread into `head().meta`. */
export function siteKitHeadMeta(kit: StorefrontSiteKit) {
  return verificationTags(kit.verification).map((tag) => ({ name: tag.name, content: tag.content }));
}

export type SaveResult = {
  settings: SiteKitSettings;
  issues: { field: string; message: string }[];
};

/**
 * Persists the Site Kit envelope.
 *
 * Invalid entries are dropped by `validateSiteKit` and returned as issues, so
 * a mistyped GA4 id can never be written and then silently emitted into every
 * storefront page. A property change resets the connection health so the next
 * sweep re-reads from a clean slate instead of inheriting the old failures.
 */
export async function saveSiteKit(
  db: Client,
  merchantId: string,
  actor: string | null,
  input: unknown,
): Promise<SaveResult> {
  await enforceRateLimit("sitekit.write", `${merchantId}:${actor ?? "anon"}`);
  const previous = await loadSiteKit(db, merchantId);
  const { value, issues } = validateSiteKit(input);

  if (value.searchConsoleSiteUrl && value.searchConsoleSiteUrl !== previous.searchConsoleSiteUrl) {
    // Never store a property the connected account cannot actually read.
    await assertSelectable(value.searchConsoleSiteUrl);
  }

  const { error } = await (db as LooseClient)
    .from("merchant_settings")
    .update({ site_kit: value as unknown as Record<string, unknown> })
    .eq("merchant_id", merchantId);
  if (error) {
    log("error", "sitekit.save_failed", { merchantId, message: error.message });
    throw new SearchConsoleError("write_failed", "Could not save Site Kit settings.");
  }

  if (value.searchConsoleSiteUrl !== previous.searchConsoleSiteUrl) {
    await upsertConnection(merchantId, {
      site_url: value.searchConsoleSiteUrl,
      property_type: value.searchConsoleSiteUrl?.startsWith("sc-domain:")
        ? "domain"
        : value.searchConsoleSiteUrl
          ? "url_prefix"
          : "unknown",
      status: value.searchConsoleSiteUrl ? "connected" : "unconfigured",
      selected_at: new Date().toISOString(),
      selected_by: actor,
      consecutive_failures: 0,
      last_error_code: null,
      last_error_message: null,
      next_refresh_at: new Date().toISOString(),
    });
  }

  invalidate(settingsKey(merchantId));
  invalidate(storefrontKey(merchantId));
  await auditAction(db, merchantId, actor, "sitekit.save", "merchant_settings", {
    verification: Object.keys(value.verification.tokens),
    customTags: value.verification.custom.length,
    analytics: Object.keys(value.analytics.enabled),
    consentRequired: value.analytics.consentRequired,
    property: value.searchConsoleSiteUrl,
    rejected: issues.length,
  });
  log("info", "sitekit.saved", { merchantId, issues: issues.length, tags: tagPlan(value.analytics).length });
  return { settings: value, issues };
}

/* ========================================================================== *
 * Connection health
 * ========================================================================== */

export type ConnectionRow = {
  merchant_id: string;
  site_url: string | null;
  property_type: string;
  status: string;
  last_refresh_at: string | null;
  last_success_at: string | null;
  next_refresh_at: string | null;
  consecutive_failures: number;
  last_error_code: string | null;
  last_error_message: string | null;
  last_sitemap_url: string | null;
  last_sitemap_fingerprint: string | null;
  last_sitemap_submitted_at: string | null;
  rows_cached: number;
};

async function admin(): Promise<LooseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseClient;
}

export async function readConnection(db: Client, merchantId: string): Promise<ConnectionRow | null> {
  const { data, error } = await (db as LooseClient)
    .from("search_console_connections")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw new SearchConsoleError("read_failed", "Could not read the Search Console connection.");
  return (data as ConnectionRow | null) ?? null;
}

async function upsertConnection(merchantId: string, patch: Record<string, unknown>) {
  const db = await admin();
  const { error } = await db
    .from("search_console_connections")
    .upsert({ merchant_id: merchantId, ...patch }, { onConflict: "merchant_id" });
  if (error) log("error", "gsc.connection_write_failed", { merchantId, message: error.message });
}

/* ========================================================================== *
 * Job log
 * ========================================================================== */

export type JobKind = "refresh" | "sitemap" | "inspect" | "sweep";
export type JobTrigger = "cron" | "manual" | "system";

async function startJob(input: {
  merchantId: string;
  kind: JobKind;
  trigger: JobTrigger;
  requestedBy?: string | null;
  detail?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const db = await admin();
    const { data, error } = await db
      .from("search_console_jobs")
      .insert({
        merchant_id: input.merchantId,
        kind: input.kind,
        trigger: input.trigger,
        status: "running",
        requested_by: input.requestedBy ?? null,
        detail: input.detail ?? {},
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    // A job row is observability, not correctness: losing it must not abort
    // the work the merchant asked for.
    log("warn", "gsc.job_start_failed", { merchantId: input.merchantId, kind: input.kind });
    void captureError(err, { scope: "gsc.job_start" });
    return null;
  }
}

async function finishJob(
  jobId: string | null,
  patch: {
    status: "success" | "failed" | "skipped";
    attempts?: number;
    rowsWritten?: number;
    daysCovered?: number;
    durationMs?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    detail?: Record<string, unknown>;
  },
) {
  if (!jobId) return;
  try {
    const db = await admin();
    await db
      .from("search_console_jobs")
      .update({
        status: patch.status,
        attempts: patch.attempts ?? 1,
        rows_written: patch.rowsWritten ?? 0,
        days_covered: patch.daysCovered ?? 0,
        duration_ms: patch.durationMs ?? null,
        error_code: patch.errorCode ?? null,
        error_message: patch.errorMessage ? truncate(patch.errorMessage, 300) : null,
        detail: patch.detail ?? {},
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (err) {
    void captureError(err, { scope: "gsc.job_finish" });
  }
}

/* ========================================================================== *
 * Refresh
 * ========================================================================== */

type AnalyticsResponse = { rows?: GscApiRow[] };

const DIMENSIONS: { dimension: "date" | "query" | "page"; keys: string[] }[] = [
  { dimension: "date", keys: ["date"] },
  { dimension: "query", keys: ["date", "query"] },
  { dimension: "page", keys: ["date", "page"] },
];

async function fetchDimension(
  siteUrl: string,
  dimension: "date" | "query" | "page",
  keys: string[],
  range: { start: string; end: string },
  deadline: number,
  merchantId: string,
): Promise<SnapshotRow[]> {
  const rows: SnapshotRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (Date.now() >= deadline) {
      log("warn", "gsc.refresh_deadline", { merchantId, dimension, page });
      break;
    }
    const payload = await gatewayCall<AnalyticsResponse>(
      `analytics.${dimension}`,
      `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        merchantId,
        deadline,
        body: {
          startDate: range.start,
          endDate: range.end,
          dimensions: keys,
          rowLimit: PAGE_SIZE,
          startRow: page * PAGE_SIZE,
          type: "web",
          // `final` only: fresh rows are still moving and would make our
          // snapshot permanently disagree with the Search Console UI.
          dataState: "final",
        },
      },
    );
    const batch = payload.rows ?? [];
    rows.push(...normaliseRows(batch, dimension));
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function persistRows(
  merchantId: string,
  siteUrl: string,
  range: { start: string; end: string },
  rows: SnapshotRow[],
): Promise<number> {
  const db = await admin();
  // Replace-in-window rather than upsert: the unique index is on a hashed
  // expression (values can exceed btree limits), which `onConflict` cannot
  // target. Delete + insert inside one window is also self-healing — rows
  // Google has since dropped do not linger forever.
  const { error: delError } = await db
    .from("search_console_daily")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("site_url", siteUrl)
    .gte("day", range.start)
    .lte("day", range.end);
  if (delError) throw new SearchConsoleError("write_failed", "Could not replace the snapshot window.");

  let written = 0;
  const fetchedAt = new Date().toISOString();
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK).map((row) => ({
      merchant_id: merchantId,
      site_url: siteUrl,
      day: row.day,
      dimension: row.dimension,
      value: row.value,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      fetched_at: fetchedAt,
    }));
    const { error } = await db.from("search_console_daily").insert(chunk);
    if (error) throw new SearchConsoleError("write_failed", "Could not persist the search snapshot.");
    written += chunk.length;
  }
  return written;
}

async function pruneOld(merchantId: string) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const db = await admin();
  const { error } = await db.from("search_console_daily").delete().eq("merchant_id", merchantId).lt("day", cutoff);
  if (error) log("warn", "gsc.prune_failed", { merchantId, message: error.message });
}

export type RefreshResult = {
  merchantId: string;
  siteUrl: string;
  rowsWritten: number;
  daysCovered: number;
  range: { start: string; end: string };
  durationMs: number;
};

/**
 * Pulls one merchant's window and replaces it in the snapshot table.
 *
 * The caller supplies the trigger so the job row can tell a cron sweep from a
 * merchant clicking "refresh now" six months later during an incident review.
 */
export async function refreshMerchant(input: {
  merchantId: string;
  trigger: JobTrigger;
  requestedBy?: string | null;
  days?: number;
  siteUrl?: string | null;
  deadline?: number;
}): Promise<RefreshResult> {
  const started = Date.now();
  const deadline = input.deadline ?? started + REFRESH_DEADLINE_MS;
  const days = Math.min(90, Math.max(1, input.days ?? DEFAULT_WINDOW_DAYS));
  const jobId = await startJob({
    merchantId: input.merchantId,
    kind: "refresh",
    trigger: input.trigger,
    requestedBy: input.requestedBy ?? null,
    detail: { days },
  });

  try {
    const siteUrl = input.siteUrl ?? (await connectionSiteUrl(input.merchantId));
    if (!siteUrl) throw new SearchConsoleError("no_property", "No Search Console property is selected.");
    await assertSelectable(siteUrl);

    const range = dateRange(latestUsableDay(new Date()), days);
    const collected: SnapshotRow[] = [];
    for (const spec of DIMENSIONS) {
      const rows = await fetchDimension(
        siteUrl,
        spec.dimension,
        spec.keys,
        range,
        deadline,
        input.merchantId,
      );
      incr("framique_gsc_rows_written_total", { dimension: spec.dimension }, rows.length);
      collected.push(...rows);
    }

    const rowsWritten = await persistRows(input.merchantId, siteUrl, range, collected);
    await pruneOld(input.merchantId);

    const now = new Date();
    await upsertConnection(input.merchantId, {
      site_url: siteUrl,
      status: "connected",
      last_refresh_at: now.toISOString(),
      last_success_at: now.toISOString(),
      next_refresh_at: new Date(now.getTime() + REFRESH_INTERVAL_HOURS * 3_600_000).toISOString(),
      consecutive_failures: 0,
      last_error_code: null,
      last_error_message: null,
      rows_cached: rowsWritten,
    });

    const durationMs = Date.now() - started;
    const daysCovered = new Set(collected.map((r) => r.day)).size;
    await finishJob(jobId, {
      status: "success",
      rowsWritten,
      daysCovered,
      durationMs,
      detail: { range, siteUrl },
    });
    incr("framique_gsc_refresh_total", { trigger: input.trigger, outcome: "ok" });
    log("info", "gsc.refresh", { merchantId: input.merchantId, rowsWritten, daysCovered, durationMs });
    return { merchantId: input.merchantId, siteUrl, rowsWritten, daysCovered, range, durationMs };
  } catch (err) {
    const error = asError(err);
    const failures = await bumpFailure(input.merchantId, error);
    await finishJob(jobId, {
      status: "failed",
      durationMs: Date.now() - started,
      errorCode: error.code,
      errorMessage: error.message,
      detail: { failures },
    });
    incr("framique_gsc_refresh_total", { trigger: input.trigger, outcome: error.code });
    log("error", "gsc.refresh_failed", {
      merchantId: input.merchantId,
      code: error.code,
      status: error.status,
      failures,
    });
    void captureError(error, { scope: "gsc.refresh", merchantId: input.merchantId });
    throw error;
  }
}

async function connectionSiteUrl(merchantId: string): Promise<string | null> {
  const db = await admin();
  const { data } = await db
    .from("search_console_connections")
    .select("site_url")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if ((data as { site_url?: string } | null)?.site_url) return (data as { site_url: string }).site_url;
  // Fall back to the settings envelope: a merchant may have chosen a property
  // before the connection row existed.
  const { data: settings } = await db
    .from("merchant_settings")
    .select("site_kit")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return validateSiteKit((settings as { site_kit?: unknown } | null)?.site_kit ?? null).value.searchConsoleSiteUrl;
}

/**
 * Records a failure and decides when the connection stops being retried.
 *
 * Auth failures park the connection immediately — they cannot heal without a
 * human reconnecting, and retrying them every twelve hours is pure quota burn
 * plus a log full of noise that hides real incidents.
 */
async function bumpFailure(merchantId: string, error: SearchConsoleError): Promise<number> {
  const db = await admin();
  const { data } = await db
    .from("search_console_connections")
    .select("consecutive_failures")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  const failures = Number((data as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0) + 1;
  const terminal = error.code === "unauthorized" || error.code === "forbidden" || error.code === "invalid";
  const parked = terminal || failures >= FAILURE_PARK_THRESHOLD;
  await upsertConnection(merchantId, {
    status: terminal ? "needs_reconnect" : parked ? "parked" : "degraded",
    last_refresh_at: new Date().toISOString(),
    consecutive_failures: failures,
    last_error_code: error.code,
    last_error_message: truncate(error.message, 300),
    next_refresh_at: new Date(Date.now() + (parked ? 24 : 1) * 3_600_000).toISOString(),
  });
  return failures;
}

/* ========================================================================== *
 * Scheduled sweep
 * ========================================================================== */

export type SweepResult = {
  considered: number;
  refreshed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  failures: { merchantId: string; code: string }[];
};

/**
 * The only scheduled caller. Merchants are processed sequentially: parallel
 * fan-out against a shared, project-level quota converts one slow tenant into
 * a 429 for everybody.
 */
export async function runSearchConsoleSweep(options: { limit?: number; days?: number } = {}): Promise<SweepResult> {
  const started = Date.now();
  await enforceRateLimit("gsc.sweep", "platform");
  return withSpan("gsc.sweep", async () => {
    const deadline = started + SWEEP_DEADLINE_MS;
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));
    const db = await admin();
    const { data, error } = await db
      .from("search_console_connections")
      .select("merchant_id, site_url, next_refresh_at, status")
      .not("site_url", "is", null)
      .neq("status", "needs_reconnect")
      .or(`next_refresh_at.is.null,next_refresh_at.lte.${new Date().toISOString()}`)
      .order("next_refresh_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw new SearchConsoleError("read_failed", "Could not list connections due for refresh.");

    const due = (data ?? []) as { merchant_id: string; site_url: string }[];
    const result: SweepResult = {
      considered: due.length,
      refreshed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      failures: [],
    };

    for (const row of due) {
      if (Date.now() >= deadline) {
        // Leaving the rest for the next tick is correct: their `next_refresh_at`
        // is already in the past, so they sort first next run.
        result.skipped += due.length - (result.refreshed + result.failed);
        log("warn", "gsc.sweep_deadline", { remaining: result.skipped });
        break;
      }
      try {
        await refreshMerchant({
          merchantId: row.merchant_id,
          siteUrl: row.site_url,
          trigger: "cron",
          days: options.days ?? DEFAULT_WINDOW_DAYS,
          deadline: Math.min(deadline, Date.now() + REFRESH_DEADLINE_MS),
        });
        result.refreshed += 1;
      } catch (err) {
        const error = asError(err);
        result.failed += 1;
        result.failures.push({ merchantId: row.merchant_id, code: error.code });
        // One tenant's expired connection must not end the sweep. A global
        // rate limit, however, means every remaining call would fail too.
        if (error.code === "rate_limited") {
          result.skipped += due.length - (result.refreshed + result.failed);
          log("warn", "gsc.sweep_rate_limited", { done: result.refreshed, remaining: result.skipped });
          break;
        }
      }
    }

    result.durationMs = Date.now() - started;
    observe("framique_gsc_sweep_ms", result.durationMs);
    log("info", "gsc.sweep", { ...result, failures: result.failures.length });
    return result;
  });
}

/* ========================================================================== *
 * Sitemap submission
 * ========================================================================== */

export type SitemapSubmission = { submitted: boolean; reason: string; sitemapUrl: string };

/**
 * Submits a sitemap **only when its content actually changed**. Google treats
 * repeat submission of an unchanged file as noise, and it costs quota we would
 * rather spend on reporting.
 */
export async function submitSitemapIfChanged(input: {
  merchantId: string;
  sitemapUrl: string;
  fingerprint: string;
  trigger?: JobTrigger;
  requestedBy?: string | null;
}): Promise<SitemapSubmission> {
  const db = await admin();
  const { data } = await db
    .from("search_console_connections")
    .select("site_url, last_sitemap_url, last_sitemap_fingerprint, last_sitemap_submitted_at")
    .eq("merchant_id", input.merchantId)
    .maybeSingle();
  const row = (data ?? null) as Partial<ConnectionRow> | null;
  if (!row?.site_url) return { submitted: false, reason: "no_property", sitemapUrl: input.sitemapUrl };

  const verdict = shouldSubmitSitemap({
    sitemapUrl: input.sitemapUrl,
    lastSubmittedUrl: row.last_sitemap_url ?? null,
    lastSubmittedAt: row.last_sitemap_submitted_at ?? null,
    changed: (row.last_sitemap_fingerprint ?? null) !== input.fingerprint,
  });
  if (!verdict.submit) {
    incr("framique_gsc_sitemap_total", { outcome: "skipped" });
    return { submitted: false, reason: verdict.reason, sitemapUrl: input.sitemapUrl };
  }

  await enforceRateLimit("gsc.sitemap", input.merchantId);
  const jobId = await startJob({
    merchantId: input.merchantId,
    kind: "sitemap",
    trigger: input.trigger ?? "system",
    requestedBy: input.requestedBy ?? null,
    detail: { sitemapUrl: input.sitemapUrl, reason: verdict.reason },
  });
  const started = Date.now();
  try {
    await gatewayCall(
      "sitemaps.submit",
      `/webmasters/v3/sites/${encodeURIComponent(row.site_url)}/sitemaps/${encodeURIComponent(input.sitemapUrl)}`,
      { method: "PUT", merchantId: input.merchantId },
    );
    await upsertConnection(input.merchantId, {
      last_sitemap_url: input.sitemapUrl,
      last_sitemap_fingerprint: input.fingerprint,
      last_sitemap_submitted_at: new Date().toISOString(),
    });
    await finishJob(jobId, { status: "success", durationMs: Date.now() - started });
    incr("framique_gsc_sitemap_total", { outcome: "ok" });
    log("info", "gsc.sitemap_submitted", { merchantId: input.merchantId, reason: verdict.reason });
    return { submitted: true, reason: verdict.reason, sitemapUrl: input.sitemapUrl };
  } catch (err) {
    const error = asError(err);
    await finishJob(jobId, {
      status: "failed",
      durationMs: Date.now() - started,
      errorCode: error.code,
      errorMessage: error.message,
    });
    incr("framique_gsc_sitemap_total", { outcome: error.code });
    log("error", "gsc.sitemap_failed", { merchantId: input.merchantId, code: error.code });
    throw error;
  }
}

/* ========================================================================== *
 * URL inspection
 * ========================================================================== */

/**
 * Reads Google's *index record* for one URL.
 *
 * This is not a live test and not a re-crawl request — the API cannot do
 * either, and the returned `disclaimer` says so verbatim so the UI cannot
 * accidentally over-promise. Quota here is tiny (a handful per day per site),
 * hence the tight `gsc.inspect` bucket.
 */
export async function inspectUrl(input: {
  merchantId: string;
  url: string;
  requestedBy?: string | null;
}): Promise<UrlInspection> {
  await enforceRateLimit("gsc.inspect", input.merchantId);
  const siteUrl = await connectionSiteUrl(input.merchantId);
  if (!siteUrl) throw new SearchConsoleError("no_property", "No Search Console property is selected.");
  await assertSelectable(siteUrl);

  const jobId = await startJob({
    merchantId: input.merchantId,
    kind: "inspect",
    trigger: "manual",
    requestedBy: input.requestedBy ?? null,
    detail: { url: input.url },
  });
  const started = Date.now();
  try {
    const payload = await gatewayCall<unknown>("urlInspection", "/v1/urlInspection/index:inspect", {
      method: "POST",
      merchantId: input.merchantId,
      body: { inspectionUrl: input.url, siteUrl },
    });
    const result = readInspection(payload, input.url);
    await finishJob(jobId, {
      status: "success",
      durationMs: Date.now() - started,
      detail: { verdict: result.verdict, coverage: result.coverageState },
    });
    incr("framique_gsc_inspect_total", { verdict: result.verdict });
    return result;
  } catch (err) {
    const error = asError(err);
    await finishJob(jobId, {
      status: "failed",
      durationMs: Date.now() - started,
      errorCode: error.code,
      errorMessage: error.message,
    });
    incr("framique_gsc_inspect_total", { verdict: "error" });
    throw error;
  }
}

/* ========================================================================== *
 * Reporting reads (snapshot only — never Google)
 * ========================================================================== */

type DailyRow = {
  day: string;
  dimension: "date" | "query" | "page";
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

async function readWindow(
  db: Client,
  merchantId: string,
  range: { start: string; end: string },
): Promise<SnapshotRow[]> {
  const { data, error } = await (db as LooseClient)
    .from("search_console_daily")
    .select("day, dimension, value, clicks, impressions, ctr, position")
    .eq("merchant_id", merchantId)
    .gte("day", range.start)
    .lte("day", range.end)
    .limit(20_000);
  if (error) throw new SearchConsoleError("read_failed", "Could not read the search snapshot.");
  return ((data ?? []) as DailyRow[]).map((row) => ({
    day: row.day,
    dimension: row.dimension,
    value: row.value,
    clicks: Number(row.clicks) || 0,
    impressions: Number(row.impressions) || 0,
    ctr: Number(row.ctr) || 0,
    position: Number(row.position) || 0,
  }));
}

export type SnapshotCards = {
  window: { start: string; end: string; days: number; lagDays: number };
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  previousTotals: { clicks: number; impressions: number; ctr: number; position: number };
  timeseries: { day: string; clicks: number; impressions: number; position: number }[];
  topQueries: Delta[];
  topPages: Delta[];
  freshness: { lastSuccessAt: string | null; stale: boolean };
};

function totalsOf(rows: readonly SnapshotRow[]) {
  const dateRows = rows.filter((r) => r.dimension === "date");
  const agg = aggregate(dateRows);
  const clicks = agg.reduce((s, r) => s + r.clicks, 0);
  const impressions = agg.reduce((s, r) => s + r.impressions, 0);
  const weighted = dateRows.reduce((s, r) => s + r.position * r.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0,
    position: impressions > 0 ? Number((weighted / impressions).toFixed(2)) : 0,
  };
}

/** Dashboard payload. Reads rows only — a page render never calls Google. */
export async function snapshotCards(
  db: Client,
  merchantId: string,
  days = DEFAULT_WINDOW_DAYS,
): Promise<SnapshotCards> {
  await enforceRateLimit("sitekit.read", merchantId);
  const window = Math.min(90, Math.max(7, days));
  const end = latestUsableDay(new Date());
  const current = dateRange(end, window);
  const previousEnd = new Date(`${current.start}T00:00:00Z`).getTime() - 86_400_000;
  const previous = dateRange(new Date(previousEnd).toISOString().slice(0, 10), window);

  const [currentRows, previousRows, connection] = await Promise.all([
    readWindow(db, merchantId, current),
    readWindow(db, merchantId, previous),
    readConnection(db, merchantId).catch(() => null),
  ]);

  const byDimension = (rows: SnapshotRow[], dimension: "query" | "page") =>
    rows.filter((r) => r.dimension === dimension);

  const lastSuccessAt = connection?.last_success_at ?? null;
  const stale = !lastSuccessAt || Date.now() - Date.parse(lastSuccessAt) > 48 * 3_600_000;

  return {
    window: { ...current, days: window, lagDays: DATA_LAG_DAYS },
    totals: totalsOf(currentRows),
    previousTotals: totalsOf(previousRows),
    timeseries: aggregate(currentRows.filter((r) => r.dimension === "date"))
      .map((row) => ({ day: row.value, clicks: row.clicks, impressions: row.impressions, position: row.position }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    topQueries: comparePeriods(byDimension(currentRows, "query"), byDimension(previousRows, "query")).slice(0, 25),
    topPages: comparePeriods(byDimension(currentRows, "page"), byDimension(previousRows, "page")).slice(0, 25),
    freshness: { lastSuccessAt, stale },
  };
}

export type ArticlePerformance = {
  articleId: string;
  slug: string;
  title: string;
  url: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/**
 * Joins page rows onto the CMS.
 *
 * Matching is by path suffix, not by exact URL: the same article is reachable
 * as an apex URL, a www URL and (for a domain property) both schemes, and
 * treating those as different pages under-reports every post.
 */
export async function articlePerformance(
  db: Client,
  merchantId: string,
  days = DEFAULT_WINDOW_DAYS,
): Promise<ArticlePerformance[]> {
  await enforceRateLimit("sitekit.read", merchantId);
  const range = dateRange(latestUsableDay(new Date()), Math.min(90, Math.max(7, days)));
  const [rows, articles] = await Promise.all([
    readWindow(db, merchantId, range),
    (db as LooseClient)
      .from("articles")
      .select("id, slug, title")
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .limit(500),
  ]);

  const pages = aggregate(rows.filter((r) => r.dimension === "page"));
  const list = (articles.data ?? []) as { id: string; slug: string; title: string }[];
  return list
    .map((article) => {
      const matches = pages.filter((page) => {
        try {
          const path = new URL(page.value).pathname.replace(/\/+$/, "");
          return path.endsWith(`/${article.slug}`);
        } catch {
          return page.value.endsWith(`/${article.slug}`);
        }
      });
      const clicks = matches.reduce((s, m) => s + m.clicks, 0);
      const impressions = matches.reduce((s, m) => s + m.impressions, 0);
      const weighted = matches.reduce((s, m) => s + m.position * m.impressions, 0);
      return {
        articleId: article.id,
        slug: article.slug,
        title: article.title,
        url: matches[0]?.value ?? null,
        clicks,
        impressions,
        ctr: impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0,
        position: impressions > 0 ? Number((weighted / impressions).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

export type JobRow = {
  id: string;
  kind: string;
  status: string;
  trigger: string;
  rows_written: number;
  days_covered: number;
  duration_ms: number | null;
  error_code: string | null;
  started_at: string;
  finished_at: string | null;
};

export async function jobHistory(db: Client, merchantId: string, limit = 20): Promise<JobRow[]> {
  const { data, error } = await (db as LooseClient)
    .from("search_console_jobs")
    .select("id, kind, status, trigger, rows_written, days_covered, duration_ms, error_code, started_at, finished_at")
    .eq("merchant_id", merchantId)
    .order("started_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));
  if (error) throw new SearchConsoleError("read_failed", "Could not read the job history.");
  return (data ?? []) as JobRow[];
}
