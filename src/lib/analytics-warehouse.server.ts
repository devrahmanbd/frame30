/**
 * Analytics warehouse — ingest, ETL, reports and ad-conversion outbox (§3.4).
 *
 * Every write path goes through a security-definer RPC so a merchant can never
 * mint a number; every read path is a tenant-scoped select over precomputed
 * rollups rather than a scan of the raw store. Spans and counters are emitted
 * around each unit of work so Prometheus/Grafana can alert on ingest volume,
 * ETL latency and conversion delivery failures.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  auditBatchChain,
  buildCohortMatrix,
  buildFunnel,
  classifyPersona,
  isStale,
  nextRunAt,
  PERSONAS,
  summarizeAging,
  toCsv,
  validateReport,
  vipThreshold,
  type AgingInput,
  type BatchRow,
  type CohortRow,
  type DailyBucket,
  type Persona,
  type ReportDefinition,
} from "./analytics-pipeline";
import { incr, log, observe, withSpan } from "./observability.server";

type Client = SupabaseClient<Database>;
type Rpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const REVENUE_STATUSES = ["paid", "confirmed", "packed", "shipped", "delivered", "fulfilled"];

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dayString(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Tenant-scoped, non-reversible visitor id. A raw session id or ip never
 * reaches the warehouse; only this digest does, and it rotates with the daily
 * salt so cross-day re-identification is impossible.
 */
export async function pseudonymize(merchantId: string, raw: string, day = dayString(new Date())) {
  const salt = process.env["ANALYTICS_SALT"] ?? "framique-analytics";
  const bytes = new TextEncoder().encode(`${salt}:${merchantId}:${day}:${raw}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export type BeaconInput = {
  entity: string;
  action: string;
  occurredAt?: string;
  visitorRaw?: string | null;
  sessionRaw?: string | null;
  source?: string | null;
  campaign?: string | null;
  valueMinorInt?: number;
  currencyCode?: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
};

/**
 * Coarse, server-derived location for one batch. Never comes from the browser:
 * a shopper could otherwise claim any country and skew a merchant's report.
 */
export type BeaconGeo = {
  countryCode?: string;
  region?: string;
  city?: string;
  asn?: number | null;
  network?: string;
  deviceClass?: string;
};

const PII_KEYS = ["phone", "email", "name", "address", "token", "card"];

function scrubBeaconPayload(payload: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (PII_KEYS.some((bad) => key.toLowerCase().includes(bad))) continue;
    if (typeof value === "string" && value.length > 200) continue;
    if (typeof value === "object" && value !== null) continue;
    out[key] = value;
  }
  return out;
}

/** Buffered write: a batch of beacons lands in the raw store in one round trip. */
export async function ingestBeacons(
  admin: Client,
  merchantId: string,
  beacons: BeaconInput[],
  geo: BeaconGeo = {},
) {
  return withSpan("analytics.ingest", async () => {
    const prepared: Record<string, unknown>[] = [];
    for (const beacon of beacons.slice(0, 100)) {
      const day = dayString(beacon.occurredAt ? new Date(beacon.occurredAt) : new Date());
      prepared.push({
        entity: beacon.entity,
        action: beacon.action,
        occurred_at: beacon.occurredAt ?? new Date().toISOString(),
        visitor_hash: beacon.visitorRaw
          ? await pseudonymize(merchantId, beacon.visitorRaw, day)
          : "",
        session_key: beacon.sessionRaw ? await pseudonymize(merchantId, beacon.sessionRaw, day) : "",
        source: beacon.source ?? "",
        campaign: beacon.campaign ?? "",
        value_minor_int: Math.max(0, Math.round(beacon.valueMinorInt ?? 0)),
        currency_code: beacon.currencyCode ?? "BDT",
        payload: scrubBeaconPayload(beacon.payload),
        country_code: (geo.countryCode ?? "").slice(0, 2).toUpperCase(),
        region: (geo.region ?? "").slice(0, 60),
        city: (geo.city ?? "").slice(0, 80),
        asn: geo.asn ?? null,
        network: (geo.network ?? "").slice(0, 80),
        device_class: geo.deviceClass ?? "unknown",
        dedupe_key:
          beacon.dedupeKey ??
          `${beacon.entity}:${beacon.action}:${beacon.occurredAt ?? Date.now()}:${Math.random()
            .toString(36)
            .slice(2)}`,
      });
    }

    const { data, error } = await (admin as unknown as Rpc).rpc("analytics_ingest", {
      _merchant_id: merchantId,
      _events: prepared,
    });
    if (error) throw error;

    const result = data as { accepted: number; rejected: number };
    incr("framique_analytics_events_total", { outcome: "accepted" }, result.accepted ?? 0);
    incr("framique_analytics_events_total", { outcome: "rejected" }, result.rejected ?? 0);
    return result;
  }, { merchant: merchantId });
}

/** Batch ETL run: folds the raw window into `(merchant, entity, day)` rollups. */
export async function flushBatch(admin: Client, merchantId: string) {
  const started = Date.now();
  const { data, error } = await (admin as unknown as Rpc).rpc("analytics_flush", {
    _merchant_id: merchantId,
  });
  if (error) {
    incr("framique_analytics_etl_total", { outcome: "error" });
    throw error;
  }
  const result = data as {
    batch_id: string;
    events: number;
    buckets: number;
    gap_detected: boolean;
  };
  observe("framique_analytics_etl_ms", Date.now() - started, {});
  incr("framique_analytics_etl_total", { outcome: result.gap_detected ? "gap" : "committed" });
  if (result.gap_detected) {
    log("warn", "analytics.batch_gap", { merchantId, batchId: result.batch_id });
  } else {
    log("info", "analytics.batch_committed", {
      merchantId,
      batchId: result.batch_id,
      events: result.events,
    });
  }
  return result;
}

export async function rebuildCohorts(db: Client, merchantId: string, weeks = 12) {
  const { data, error } = await (db as unknown as Rpc).rpc("analytics_rebuild_cohorts", {
    _merchant_id: merchantId,
    _weeks: weeks,
  });
  if (error) throw error;
  return data as { ok: boolean; buckets: number };
}

// ------------------------------------------------------------------ reads

export async function loadFunnel(db: Client, merchantId: string, days: number) {
  const since = dayString(isoDaysAgo(days));
  const { data, error } = await db
    .from("analytics_daily")
    .select("entity, day, totals")
    .eq("merchant_id", merchantId)
    .gte("day", since)
    .limit(2000);
  if (error) throw error;

  const buckets = (data ?? []) as unknown as DailyBucket[];
  const funnel = buildFunnel(buckets);

  const bySource = new Map<string, number>();
  const { data: sources } = await db
    .from("analytics_events")
    .select("source, campaign")
    .eq("merchant_id", merchantId)
    .gte("day", since)
    .limit(5000);
  for (const row of sources ?? []) {
    const key = (row.source || "direct") as string;
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }

  return {
    ...funnel,
    days,
    channels: [...bySource.entries()]
      .map(([source, events]) => ({ source, events }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 8),
  };
}

export async function loadCohorts(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("analytics_cohorts")
    .select("cohort_week, week_offset, customers, active_customers, orders, revenue_minor_int")
    .eq("merchant_id", merchantId)
    .order("cohort_week", { ascending: true })
    .limit(500);
  if (error) throw error;
  return buildCohortMatrix((data ?? []) as unknown as CohortRow[]);
}

export type PersonaBreakdown = {
  persona: Persona;
  customers: number;
  orders: number;
  revenueMinorInt: number;
  aovMinorInt: number;
};

export async function loadPersonas(db: Client, merchantId: string, days = 365) {
  const since = isoDaysAgo(days).toISOString();
  const { data, error } = await db
    .from("orders")
    .select("customer_id, status, total_minor_int, created_at, currency_code")
    .eq("merchant_id", merchantId)
    .gte("created_at", since)
    .not("customer_id", "is", null)
    .limit(10000);
  if (error) throw error;

  const rows = (data ?? []).filter((o) => REVENUE_STATUSES.includes(o.status as string));
  const now = Date.now();
  const perCustomer = new Map<string, { orders: number; spend: number; last: number }>();
  for (const order of rows) {
    const id = String(order.customer_id);
    const entry = perCustomer.get(id) ?? { orders: 0, spend: 0, last: 0 };
    entry.orders += 1;
    entry.spend += Number(order.total_minor_int ?? 0);
    entry.last = Math.max(entry.last, new Date(order.created_at as string).getTime());
    perCustomer.set(id, entry);
  }

  const threshold = vipThreshold([...perCustomer.values()].map((v) => v.spend));
  const buckets = new Map<Persona, PersonaBreakdown>();
  for (const persona of PERSONAS) {
    buckets.set(persona, { persona, customers: 0, orders: 0, revenueMinorInt: 0, aovMinorInt: 0 });
  }

  for (const stats of perCustomer.values()) {
    const persona = classifyPersona(
      {
        orders: stats.orders,
        spendMinorInt: stats.spend,
        daysSinceLast: Math.floor((now - stats.last) / 86400000),
      },
      threshold,
    );
    const bucket = buckets.get(persona)!;
    bucket.customers += 1;
    bucket.orders += stats.orders;
    bucket.revenueMinorInt += stats.spend;
  }

  const breakdown = [...buckets.values()].map((b) => ({
    ...b,
    aovMinorInt: b.orders > 0 ? Math.round(b.revenueMinorInt / b.orders) : 0,
  }));

  return {
    breakdown,
    totalCustomers: perCustomer.size,
    vipThresholdMinorInt: threshold,
    currency: (rows[0]?.currency_code as string) ?? "BDT",
  };
}

export async function loadProductPerformance(db: Client, merchantId: string, days = 90) {
  const since = isoDaysAgo(days).toISOString();
  const { data: orders, error } = await db
    .from("orders")
    .select("id, status, created_at, currency_code")
    .eq("merchant_id", merchantId)
    .gte("created_at", since)
    .limit(5000);
  if (error) throw error;

  const paidIds = (orders ?? [])
    .filter((o) => REVENUE_STATUSES.includes(o.status as string))
    .map((o) => o.id as string);

  const perVariant = new Map<
    string,
    { title: string; sku: string | null; units: number; revenue: number; lastSold: number }
  >();

  if (paidIds.length > 0) {
    const { data: items } = await db
      .from("order_items")
      .select("variant_id, product_title, sku, quantity, line_total_minor_int, created_at")
      .eq("merchant_id", merchantId)
      .in("order_id", paidIds.slice(0, 1000))
      .limit(10000);
    for (const item of items ?? []) {
      const key = (item.variant_id as string) ?? `title:${item.product_title}`;
      const row = perVariant.get(key) ?? {
        title: item.product_title as string,
        sku: (item.sku as string) ?? null,
        units: 0,
        revenue: 0,
        lastSold: 0,
      };
      row.units += Number(item.quantity ?? 0);
      row.revenue += Number(item.line_total_minor_int ?? 0);
      row.lastSold = Math.max(row.lastSold, new Date(item.created_at as string).getTime());
      perVariant.set(key, row);
    }
  }

  const { data: variants } = await db
    .from("product_variants")
    .select("id, name, sku, stock_quantity, price_amount_minor_int")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .limit(2000);

  const now = Date.now();
  const aging: AgingInput[] = (variants ?? []).map((v) => {
    const sold = perVariant.get(v.id as string);
    return {
      variantId: v.id as string,
      title: sold?.title ?? (v.name as string),
      sku: (v.sku as string) ?? null,
      stock: Number(v.stock_quantity ?? 0),
      unitCostMinorInt: Number(v.price_amount_minor_int ?? 0),
      daysSinceLastSale: sold?.lastSold
        ? Math.floor((now - sold.lastSold) / 86400000)
        : Number.POSITIVE_INFINITY,
    };
  });

  const top = [...perVariant.values()]
    .map((v) => ({
      title: v.title,
      sku: v.sku,
      units: v.units,
      revenueMinorInt: v.revenue,
      aovMinorInt: v.units > 0 ? Math.round(v.revenue / v.units) : 0,
    }))
    .sort((a, b) => b.revenueMinorInt - a.revenueMinorInt);

  return {
    days,
    currency: (orders?.[0]?.currency_code as string) ?? "BDT",
    top: top.slice(0, 25),
    slow: top.slice(-10).reverse(),
    aging: summarizeAging(aging),
    deadVariants: aging
      .filter((a) => a.daysSinceLastSale > 90 && a.stock > 0)
      .sort((a, b) => b.stock * b.unitCostMinorInt - a.stock * a.unitCostMinorInt)
      .slice(0, 20)
      .map((a) => ({
        title: a.title,
        sku: a.sku,
        stock: a.stock,
        tiedUpMinorInt: a.stock * a.unitCostMinorInt,
      })),
  };
}

/** Ledger health for the pipeline tab — gap-honest by construction. */
export async function loadPipelineHealth(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("analytics_batches")
    .select("id, previous_batch_id, status, committed_at, event_count, gap_detected, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const audit = auditBatchChain(((data ?? []) as unknown as BatchRow[]).slice().reverse());
  const { count: rawCount } = await db
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId);

  return {
    ...audit,
    stale: isStale(audit.lastCommittedAt, new Date()),
    rawRows: rawCount ?? 0,
    batches: (data ?? []).slice(0, 20),
  };
}

// ----------------------------------------------------------- report builder

export async function listReports(db: Client, merchantId: string) {
  const [{ data: reports }, { data: runs }] = await Promise.all([
    db
      .from("analytics_reports")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("analytics_report_runs")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return { reports: reports ?? [], runs: runs ?? [] };
}

export async function saveReport(
  db: Client,
  merchantId: string,
  userId: string,
  input: ReportDefinition & { id?: string | null; name: string },
) {
  const verdict = validateReport(input);
  if (!verdict.ok) throw new Error(`analytics.report_invalid: ${verdict.errors.join("; ")}`);

  const row = {
    merchant_id: merchantId,
    name: input.name.trim().slice(0, 80),
    dataset: input.dataset,
    dimensions: input.dimensions,
    metrics: input.metrics,
    range_days: input.rangeDays,
    schedule: input.schedule,
    format: input.format,
    recipients: input.recipients,
    next_run_at: nextRunAt(input.schedule, new Date()),
    created_by: userId,
  };

  if (input.id) {
    const { data, error } = await db
      .from("analytics_reports")
      .update(row)
      .eq("id", input.id)
      .eq("merchant_id", merchantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db.from("analytics_reports").insert(row).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteReport(db: Client, merchantId: string, reportId: string) {
  const { error } = await db
    .from("analytics_reports")
    .delete()
    .eq("id", reportId)
    .eq("merchant_id", merchantId);
  if (error) throw error;
  return { ok: true };
}

/** Materializes a report definition into rows + CSV, from rollups only. */
export async function runReport(db: Client, merchantId: string, reportId: string) {
  const { data: report, error } = await db
    .from("analytics_reports")
    .select("*")
    .eq("id", reportId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw error;
  if (!report) throw new Error("analytics.report_not_found");

  const { data: run } = await db
    .from("analytics_report_runs")
    .insert({ merchant_id: merchantId, report_id: reportId, status: "running" })
    .select()
    .maybeSingle();

  try {
    const rows = await materialize(db, merchantId, report as never);
    const columns = [
      ...((report as { dimensions: string[] }).dimensions ?? []),
      ...((report as { metrics: string[] }).metrics ?? []),
    ];
    const csv = toCsv(rows, columns);

    if (run) {
      await db
        .from("analytics_report_runs")
        .update({ status: "succeeded", row_count: rows.length, finished_at: new Date().toISOString() })
        .eq("id", (run as { id: string }).id);
    }
    incr("framique_analytics_report_total", { outcome: "succeeded" });
    return { rows, columns, csv, rowCount: rows.length };
  } catch (err) {
    if (run) {
      await db
        .from("analytics_report_runs")
        .update({
          status: "failed",
          error: String((err as Error)?.message ?? err).slice(0, 300),
          finished_at: new Date().toISOString(),
        })
        .eq("id", (run as { id: string }).id);
    }
    incr("framique_analytics_report_total", { outcome: "failed" });
    throw err;
  }
}

type ReportRow = {
  dataset: string;
  dimensions: string[];
  metrics: string[];
  range_days: number;
};

async function materialize(db: Client, merchantId: string, report: ReportRow) {
  const days = report.range_days ?? 30;
  const dims = report.dimensions ?? [];
  const metrics = report.metrics ?? [];

  if (report.dataset === "traffic") {
    const { data } = await db
      .from("analytics_daily")
      .select("entity, day, totals")
      .eq("merchant_id", merchantId)
      .gte("day", dayString(isoDaysAgo(days)))
      .limit(5000);
    return (data ?? []).map((row) => {
      const totals = (row.totals ?? {}) as Record<string, number>;
      const out: Record<string, unknown> = {};
      if (dims.includes("day")) out["day"] = row.day;
      if (dims.includes("entity")) out["entity"] = row.entity;
      for (const metric of metrics) out[metric] = totals[metric] ?? 0;
      return out;
    });
  }

  if (report.dataset === "customers") {
    const personas = await loadPersonas(db, merchantId, Math.max(days, 90));
    return personas.breakdown.map((row) => {
      const out: Record<string, unknown> = {};
      if (dims.includes("persona")) out["persona"] = row.persona;
      if (metrics.includes("customers")) out["customers"] = row.customers;
      if (metrics.includes("orders")) out["orders"] = row.orders;
      if (metrics.includes("revenue_minor_int")) out["revenue_minor_int"] = row.revenueMinorInt;
      return out;
    });
  }

  if (report.dataset === "products") {
    const perf = await loadProductPerformance(db, merchantId, days);
    return perf.top.map((row) => {
      const out: Record<string, unknown> = {};
      if (dims.includes("product_title")) out["product_title"] = row.title;
      if (metrics.includes("units")) out["units"] = row.units;
      if (metrics.includes("revenue_minor_int")) out["revenue_minor_int"] = row.revenueMinorInt;
      if (metrics.includes("orders")) out["orders"] = row.units;
      return out;
    });
  }

  // orders
  const { data } = await db
    .from("orders")
    .select("status, payment_method, total_minor_int, discount_minor_int, created_at")
    .eq("merchant_id", merchantId)
    .gte("created_at", isoDaysAgo(days).toISOString())
    .limit(10000);

  const grouped = new Map<string, Record<string, number>>();
  for (const order of data ?? []) {
    const key = dims
      .map((dim) =>
        dim === "day"
          ? String(order.created_at).slice(0, 10)
          : String((order as Record<string, unknown>)[dim] ?? ""),
      )
      .join("|");
    const bucket = grouped.get(key) ?? { orders: 0, revenue_minor_int: 0, discount_minor_int: 0 };
    bucket["orders"] = (bucket["orders"] ?? 0) + 1;
    if (REVENUE_STATUSES.includes(order.status as string)) {
      bucket["revenue_minor_int"] =
        (bucket["revenue_minor_int"] ?? 0) + Number(order.total_minor_int ?? 0);
    }
    bucket["discount_minor_int"] =
      (bucket["discount_minor_int"] ?? 0) + Number(order.discount_minor_int ?? 0);
    grouped.set(key, bucket);
  }

  return [...grouped.entries()].map(([key, values]) => {
    const parts = key.split("|");
    const out: Record<string, unknown> = {};
    dims.forEach((dim, i) => (out[dim] = parts[i] ?? ""));
    for (const metric of metrics) {
      out[metric] =
        metric === "aov_minor_int"
          ? Math.round((values["revenue_minor_int"] ?? 0) / Math.max(1, values["orders"] ?? 0))
          : (values[metric] ?? 0);
    }
    return out;
  });
}

// -------------------------------------------------- server-side ad conversions

/** SHA-256 of a normalised identifier — the format both FB CAPI and Google ask for. */
async function hashIdentifier(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function queueConversion(
  admin: Client,
  input: {
    merchantId: string;
    provider: "facebook" | "google";
    eventName: string;
    orderId: string | null;
    eventId: string;
    valueMinorInt: number;
    currencyCode: string;
    email?: string | null;
    phone?: string | null;
  },
) {
  const hashed: Record<string, string> = {};
  if (input.email) hashed["em"] = await hashIdentifier(input.email);
  if (input.phone) hashed["ph"] = await hashIdentifier(input.phone.replace(/\D/g, ""));

  const { data, error } = await (admin as unknown as Rpc).rpc("analytics_queue_conversion", {
    _merchant_id: input.merchantId,
    _provider: input.provider,
    _event_name: input.eventName,
    _event_id: input.eventId,
    _order_id: input.orderId,
    _value_minor_int: input.valueMinorInt,
    _currency_code: input.currencyCode,
    _hashed_payload: hashed,
  });
  if (error) throw error;
  incr("framique_analytics_conversion_total", { provider: input.provider, outcome: "queued" });
  return data as { ok: boolean; queued: boolean; id: string | null };
}

type ClaimedConversion = {
  id: string;
  merchant_id: string;
  provider: "facebook" | "google";
  event_name: string;
  event_id: string;
  value_minor_int: number;
  currency_code: string;
  hashed_payload: Record<string, string>;
  attempts: number;
};

const merchantAnalyticsCache = new Map<
  string,
  { fbPixel?: string; fbToken?: string; googleUrl?: string; expiresAt: number }
>();

/** Load per-merchant analytics credentials, unsealing encrypted tokens if needed. */
export async function loadMerchantAnalyticsConfig(admin: Client, merchantId: string) {
  const now = Date.now();
  const cached = merchantAnalyticsCache.get(merchantId);
  if (cached && cached.expiresAt > now) return cached;

  let fbPixel = process.env["FACEBOOK_PIXEL_ID"];
  let fbToken = process.env["FACEBOOK_CAPI_TOKEN"];
  let googleUrl = process.env["GOOGLE_CONVERSION_URL"];

  try {
    const { data } = await admin
      .from("merchant_settings")
      .select("seo_settings")
      .eq("merchant_id", merchantId)
      .maybeSingle();

    if (data?.seo_settings && typeof data.seo_settings === "object") {
      const seo = data.seo_settings as Record<string, unknown>;
      if (typeof seo["facebook_pixel_id"] === "string" && seo["facebook_pixel_id"].trim()) {
        fbPixel = seo["facebook_pixel_id"].trim();
      }
      if (typeof seo["facebook_capi_token"] === "string" && seo["facebook_capi_token"].trim()) {
        const rawToken = seo["facebook_capi_token"].trim();
        if (rawToken.startsWith("v1.")) {
          const { unsealSecret } = await import("./webhook-secret.server");
          fbToken = (await unsealSecret(rawToken)) ?? fbToken;
        } else {
          fbToken = rawToken;
        }
      }
      if (typeof seo["google_conversion_url"] === "string" && seo["google_conversion_url"].trim()) {
        googleUrl = seo["google_conversion_url"].trim();
      }
    }
  } catch {
    // Fall back to bootstrap process.env
  }

  const result = { fbPixel, fbToken, googleUrl, expiresAt: now + 30_000 };
  merchantAnalyticsCache.set(merchantId, result);
  return result;
}

async function deliver(row: ClaimedConversion, admin?: Client) {
  let fbToken = process.env["FACEBOOK_CAPI_TOKEN"];
  let fbPixel = process.env["FACEBOOK_PIXEL_ID"];
  let googleUrl = process.env["GOOGLE_CONVERSION_URL"];

  if (admin && row.merchant_id) {
    const config = await loadMerchantAnalyticsConfig(admin, row.merchant_id);
    if (config.fbPixel) fbPixel = config.fbPixel;
    if (config.fbToken) fbToken = config.fbToken;
    if (config.googleUrl) googleUrl = config.googleUrl;
  }

  if (row.provider === "facebook") {
    if (!fbToken || !fbPixel) return { ok: false, error: "facebook_not_configured" };
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${fbPixel}/events?access_token=${fbToken}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: [
            {
              event_name: row.event_name,
              event_id: row.event_id,
              event_time: Math.floor(Date.now() / 1000),
              action_source: "website",
              user_data: row.hashed_payload,
              custom_data: {
                value: row.value_minor_int / 100,
                currency: row.currency_code,
              },
            },
          ],
        }),
      },
    );
    return res.ok ? { ok: true } : { ok: false, error: `facebook_${res.status}` };
  }

  if (!googleUrl) return { ok: false, error: "google_not_configured" };
  const res = await fetch(googleUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event_name: row.event_name,
      transaction_id: row.event_id,
      value: row.value_minor_int / 100,
      currency: row.currency_code,
      user_data: row.hashed_payload,
    }),
  });
  return res.ok ? { ok: true } : { ok: false, error: `google_${res.status}` };
}

/** Outbox drain: claims due conversions, delivers, settles with backoff. */
export async function dispatchConversions(admin: Client, limit = 25) {
  const { data, error } = await (admin as unknown as Rpc).rpc("analytics_claim_conversions", {
    _limit: limit,
  });
  if (error) throw error;

  const claimed = (data ?? []) as ClaimedConversion[];
  let sent = 0;
  let failed = 0;

  for (const row of claimed) {
    let verdict: { ok: boolean; error?: string };
    try {
      verdict = await deliver(row, admin);
    } catch (err) {
      verdict = { ok: false, error: String((err as Error)?.message ?? err) };
    }
    await (admin as unknown as Rpc).rpc("analytics_settle_conversion", {
      _id: row.id,
      _ok: verdict.ok,
      _error: verdict.error ?? null,
    });
    if (verdict.ok) sent += 1;
    else failed += 1;
    incr("framique_analytics_conversion_total", {
      provider: row.provider,
      outcome: verdict.ok ? "sent" : "failed",
    });
  }

  return { claimed: claimed.length, sent, failed };
}

/** Cron entry point: flush + cohorts + conversions + due scheduled reports. */
export async function runAnalyticsSweep(limit = 20) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;

  const { data: merchants } = await admin
    .from("merchants")
    .select("id")
    .limit(Math.max(1, limit));

  let batches = 0;
  let gaps = 0;
  for (const merchant of merchants ?? []) {
    try {
      const result = await flushBatch(admin, merchant.id as string);
      batches += 1;
      if (result.gap_detected) gaps += 1;
      await rebuildCohorts(admin, merchant.id as string);
    } catch (err) {
      log("error", "analytics.sweep_failed", { merchantId: merchant.id, error: String(err) });
    }
  }

  const conversions = await dispatchConversions(admin, 50);

  const { data: due } = await (admin as unknown as Rpc).rpc("analytics_claim_reports", {
    _limit: 20,
  });
  let reports = 0;
  for (const report of (due ?? []) as { id: string; merchant_id: string }[]) {
    try {
      await runReport(admin, report.merchant_id, report.id);
      reports += 1;
    } catch (err) {
      log("error", "analytics.report_failed", { reportId: report.id, error: String(err) });
    }
  }

  return { batches, gaps, conversions, reports };
}

// ------------------------------------------------------- traffic & geography

export type TrafficDay = {
  day: string;
  events: number;
  visitors: number;
  sessions: number;
  clicks: number;
};

export type TrafficBreakdown = { key: string; label: string; visitors: number; events: number; orders: number; revenueMinorInt: number };

export type TrafficSummary = {
  days: number;
  totals: { events: number; visitors: number; sessions: number; clicks: number; orders: number; revenueMinorInt: number };
  series: TrafficDay[];
  countries: TrafficBreakdown[];
  regions: TrafficBreakdown[];
  devices: { key: string; events: number }[];
  sources: { key: string; events: number }[];
  clickTargets: { key: string; events: number }[];
  /** Shopping funnel over the same window, counted from the raw events. */
  funnel: { productViews: number; cartAdds: number; checkouts: number; orders: number };
  lastEventAt: string | null;
};

type GeoRow = {
  day: string;
  country_code: string;
  region: string;
  visitors: number;
  sessions: number;
  events: number;
  clicks: number;
  orders: number;
  revenue_minor_int: number;
};

/**
 * Traffic tab source: visitors, clicks and geography for one store.
 *
 * The day series and the country/region tables come from the rollup so a busy
 * store never scans the raw store; device, source and click-target splits come
 * from a bounded raw window because they are diagnostic, not billing figures.
 */
export async function loadTraffic(db: Client, merchantId: string, days: number): Promise<TrafficSummary> {
  const since = dayString(isoDaysAgo(days));

  const [{ data: geo, error: geoError }, { data: raw }] = await Promise.all([
    db
      .from("analytics_geo_daily")
      .select("day, country_code, region, visitors, sessions, events, clicks, orders, revenue_minor_int")
      .eq("merchant_id", merchantId)
      .gte("day", since)
      .limit(5000),
    db
      .from("analytics_events")
      .select("device_class, source, action, entity, payload, occurred_at")
      .eq("merchant_id", merchantId)
      .gte("day", since)
      .order("occurred_at", { ascending: false })
      .limit(5000),
  ]);
  if (geoError) throw geoError;

  const rows = (geo ?? []) as unknown as GeoRow[];
  const byDay = new Map<string, TrafficDay>();
  const byCountry = new Map<string, TrafficBreakdown>();
  const byRegion = new Map<string, TrafficBreakdown>();
  const totals = { events: 0, visitors: 0, sessions: 0, clicks: 0, orders: 0, revenueMinorInt: 0 };

  for (const row of rows) {
    const day = byDay.get(row.day) ?? { day: row.day, events: 0, visitors: 0, sessions: 0, clicks: 0 };
    day.events += Number(row.events ?? 0);
    day.visitors += Number(row.visitors ?? 0);
    day.sessions += Number(row.sessions ?? 0);
    day.clicks += Number(row.clicks ?? 0);
    byDay.set(row.day, day);

    const code = row.country_code || "ZZ";
    const country = byCountry.get(code) ?? { key: code, label: code, visitors: 0, events: 0, orders: 0, revenueMinorInt: 0 };
    country.visitors += Number(row.visitors ?? 0);
    country.events += Number(row.events ?? 0);
    country.orders += Number(row.orders ?? 0);
    country.revenueMinorInt += Number(row.revenue_minor_int ?? 0);
    byCountry.set(code, country);

    if (row.region) {
      const rkey = `${code}·${row.region}`;
      const region = byRegion.get(rkey) ?? { key: rkey, label: `${row.region} (${code})`, visitors: 0, events: 0, orders: 0, revenueMinorInt: 0 };
      region.visitors += Number(row.visitors ?? 0);
      region.events += Number(row.events ?? 0);
      region.orders += Number(row.orders ?? 0);
      region.revenueMinorInt += Number(row.revenue_minor_int ?? 0);
      byRegion.set(rkey, region);
    }

    totals.events += Number(row.events ?? 0);
    totals.visitors += Number(row.visitors ?? 0);
    totals.sessions += Number(row.sessions ?? 0);
    totals.clicks += Number(row.clicks ?? 0);
    totals.orders += Number(row.orders ?? 0);
    totals.revenueMinorInt += Number(row.revenue_minor_int ?? 0);
  }

  const rawRows = (raw ?? []) as unknown as {
    device_class: string | null;
    source: string | null;
    action: string;
    entity: string;
    payload: Record<string, unknown> | null;
    occurred_at: string;
  }[];

  const tally = (pick: (r: (typeof rawRows)[number]) => string | null) => {
    const map = new Map<string, number>();
    for (const row of rawRows) {
      const key = pick(row);
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([key, events]) => ({ key, events }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 10);
  };

  return {
    days,
    totals,
    series: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    countries: [...byCountry.values()].sort((a, b) => b.visitors - a.visitors || b.events - a.events).slice(0, 15),
    regions: [...byRegion.values()].sort((a, b) => b.visitors - a.visitors).slice(0, 15),
    devices: tally((r) => r.device_class || "unknown"),
    sources: tally((r) => r.source || "direct"),
    clickTargets: tally((r) =>
      r.action === "click" ? String((r.payload?.["label"] ?? r.payload?.["target"] ?? "unlabelled")).slice(0, 60) : null,
    ),
    funnel: {
      productViews: rawRows.filter((r) => r.entity === "product" && r.action === "view").length,
      cartAdds: rawRows.filter((r) => r.entity === "cart" && r.action === "add").length,
      checkouts: rawRows.filter((r) => r.entity === "checkout" && r.action === "start").length,
      orders: rawRows.filter((r) => r.entity === "order").length,
    },
    lastEventAt: rawRows[0]?.occurred_at ?? null,
  };
}

/** Platform view: the same traffic shape, aggregated across every store. */
export async function loadPlatformTraffic(days = 30) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  const since = dayString(isoDaysAgo(days));

  const { data, error } = await admin
    .from("analytics_geo_daily")
    .select("merchant_id, day, country_code, visitors, sessions, events, clicks, orders, revenue_minor_int")
    .gte("day", since)
    .limit(20000);
  if (error) throw error;

  const rows = (data ?? []) as unknown as (GeoRow & { merchant_id: string })[];
  const totals = { events: 0, visitors: 0, sessions: 0, clicks: 0, orders: 0, revenueMinorInt: 0 };
  const byCountry = new Map<string, number>();
  const byStore = new Map<string, number>();
  for (const row of rows) {
    totals.events += Number(row.events ?? 0);
    totals.visitors += Number(row.visitors ?? 0);
    totals.sessions += Number(row.sessions ?? 0);
    totals.clicks += Number(row.clicks ?? 0);
    totals.orders += Number(row.orders ?? 0);
    totals.revenueMinorInt += Number(row.revenue_minor_int ?? 0);
    const code = row.country_code || "ZZ";
    byCountry.set(code, (byCountry.get(code) ?? 0) + Number(row.visitors ?? 0));
    byStore.set(row.merchant_id, (byStore.get(row.merchant_id) ?? 0) + Number(row.visitors ?? 0));
  }

  const names = new Map<string, string>();
  const storeIds = [...byStore.keys()].slice(0, 200);
  if (storeIds.length) {
    const { data: merchants } = await admin.from("merchants").select("id, name, slug").in("id", storeIds);
    for (const m of merchants ?? []) {
      names.set(m.id as string, ((m as { name?: string; slug?: string }).name ?? (m as { slug?: string }).slug ?? "") as string);
    }
  }

  return {
    days,
    totals,
    storesReporting: byStore.size,
    countries: [...byCountry.entries()]
      .map(([key, visitors]) => ({ key, visitors }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 12),
    stores: [...byStore.entries()]
      .map(([id, visitors]) => ({ id, name: names.get(id) || id.slice(0, 8), visitors }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 12),
  };
}
