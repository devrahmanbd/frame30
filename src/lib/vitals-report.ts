/**
 * Phase 4.4 — real-user monitoring, pure half.
 *
 * Field data is the only honest answer to "is the storefront fast?" — a lab
 * run on a warm CDN says nothing about a 3G Android in Sylhet. This module
 * owns everything about a vitals sample that does not need a database:
 * normalisation and clamping of hostile client input, device/connection
 * classification, p75 aggregation (the percentile CWV actually grades on) and
 * the budget verdict.
 *
 * The ingest route, the aggregation job and the tests share it, so a sample
 * can never be validated one way on the way in and read back another way.
 */
import { VITALS_BUDGET, rateVital, type VitalName, type VitalRating } from "./web-vitals";

/** Metrics accepted from the browser. TTFB/FCP are diagnostics, not budgets. */
export const VITAL_METRICS = ["lcp", "inp", "cls", "ttfb", "fcp"] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];

/** Which accepted metrics map onto a budgeted CWV. */
const BUDGET_KEY: Partial<Record<VitalMetric, VitalName>> = {
  lcp: "lcpMs",
  inp: "inpMs",
  cls: "cls",
};

/**
 * Hard clamps. A browser can report anything — a background tab wakes after
 * an hour and posts an LCP of 3.6e6 — and one such sample would move a p75
 * for a whole day. Values above the clamp are kept but capped, because
 * dropping them would flatter the number.
 */
export const VITAL_CLAMP: Record<VitalMetric, { min: number; max: number }> = {
  lcp: { min: 0, max: 60_000 },
  inp: { min: 0, max: 60_000 },
  cls: { min: 0, max: 10 },
  ttfb: { min: 0, max: 60_000 },
  fcp: { min: 0, max: 60_000 },
};

export const DEVICE_CLASSES = ["mobile", "tablet", "desktop", "unknown"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export const CONNECTION_CLASSES = ["slow-2g", "2g", "3g", "4g", "unknown"] as const;
export type ConnectionClass = (typeof CONNECTION_CLASSES)[number];

/** Max samples one beacon may carry — bounds parse cost and abuse. */
export const MAX_BATCH = 12;
/** Max characters accepted for any free-text field before truncation. */
export const MAX_TEXT = 120;

export type RawSample = {
  metric: string;
  value: unknown;
  template?: unknown;
  path?: unknown;
  locale?: unknown;
  device?: unknown;
  connection?: unknown;
  ts?: unknown;
};

export type VitalSample = {
  metric: VitalMetric;
  value: number;
  rating: VitalRating;
  template: string;
  path: string;
  locale: "en" | "bn";
  device: DeviceClass;
  connection: ConnectionClass;
  occurredAt: string;
  /** True when the raw value was outside the clamp and had to be capped. */
  clamped: boolean;
};

function text(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, MAX_TEXT);
}

/**
 * Paths are stored for grouping, never for tracking: the query string can
 * carry a session id or an email, so it is dropped, and long paths are
 * truncated. Anything that is not an absolute path collapses to "/".
 */
export function normalizePath(value: unknown): string {
  const raw = text(value, "/");
  const withoutQuery = raw.split("?")[0]!.split("#")[0]!;
  if (!withoutQuery.startsWith("/")) return "/";
  return withoutQuery.slice(0, MAX_TEXT) || "/";
}

export function deviceClass(value: unknown): DeviceClass {
  const raw = text(value, "unknown").toLowerCase();
  return (DEVICE_CLASSES as readonly string[]).includes(raw) ? (raw as DeviceClass) : "unknown";
}

export function connectionClass(value: unknown): ConnectionClass {
  const raw = text(value, "unknown").toLowerCase();
  return (CONNECTION_CLASSES as readonly string[]).includes(raw) ? (raw as ConnectionClass) : "unknown";
}

/** Device class from viewport width, used when the client sends no hint. */
export function deviceFromWidth(width: number): DeviceClass {
  if (!Number.isFinite(width) || width <= 0) return "unknown";
  if (width < 768) return "mobile";
  if (width < 1280) return "tablet";
  return "desktop";
}

export function rateMetric(metric: VitalMetric, value: number): VitalRating {
  const key = BUDGET_KEY[metric];
  if (!key) {
    // Un-budgeted diagnostics still get a rating so dashboards can colour
    // them: TTFB/FCP are graded against the LCP budget's leading fractions.
    const soft = metric === "ttfb" ? 800 : 1_800;
    if (value <= soft) return "good";
    return value <= soft * 2 ? "needs-improvement" : "poor";
  }
  return rateVital(key, value);
}

/**
 * Turns one hostile client payload into a storable sample, or `null` when the
 * payload cannot be salvaged. Never throws: a malformed beacon must cost the
 * server nothing.
 */
export function normalizeSample(raw: RawSample, now = Date.now()): VitalSample | null {
  const metric = text(raw.metric, "").toLowerCase() as VitalMetric;
  if (!(VITAL_METRICS as readonly string[]).includes(metric)) return null;

  const numeric = typeof raw.value === "number" ? raw.value : Number(raw.value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;

  const clamp = VITAL_CLAMP[metric];
  const value = Math.min(clamp.max, Math.max(clamp.min, metric === "cls" ? numeric : Math.round(numeric)));
  const clamped = value !== numeric;

  // Timestamps are trusted only within a sane window; anything else is "now".
  const tsNumber = Number(raw.ts);
  const withinWindow =
    Number.isFinite(tsNumber) && tsNumber > now - 6 * 3_600_000 && tsNumber < now + 60_000;
  const occurredAt = new Date(withinWindow ? tsNumber : now).toISOString();

  const localeRaw = text(raw.locale, "en").toLowerCase();

  return {
    metric,
    value,
    rating: rateMetric(metric, value),
    template: text(raw.template, "unknown").slice(0, 40),
    path: normalizePath(raw.path),
    locale: localeRaw === "bn" ? "bn" : "en",
    device: deviceClass(raw.device),
    connection: connectionClass(raw.connection),
    occurredAt,
    clamped,
  };
}

export type NormalizeResult = {
  samples: VitalSample[];
  /** Count of rows rejected outright, for the ingest metric. */
  rejected: number;
  /** Count of rows whose value had to be capped. */
  clamped: boolean;
  /** True when the batch was longer than MAX_BATCH and had to be cut. */
  truncated: boolean;
};

export function normalizeBatch(input: unknown, now = Date.now()): NormalizeResult {
  const rows = Array.isArray(input) ? input : [];
  const truncated = rows.length > MAX_BATCH;
  const slice = rows.slice(0, MAX_BATCH);
  const samples: VitalSample[] = [];
  let rejected = 0;
  let clamped = false;

  for (const row of slice) {
    const sample = row && typeof row === "object" ? normalizeSample(row as RawSample, now) : null;
    if (!sample) {
      rejected += 1;
      continue;
    }
    clamped = clamped || sample.clamped;
    samples.push(sample);
  }

  // One page view reports each metric once; a client that posts the same
  // metric+path repeatedly in a batch is either buggy or hostile. Keep the
  // worst value per key so dedupe can never be used to hide a bad sample.
  const worst = new Map<string, VitalSample>();
  for (const sample of samples) {
    const key = `${sample.metric}|${sample.path}|${sample.device}`;
    const existing = worst.get(key);
    if (!existing || sample.value > existing.value) worst.set(key, sample);
  }

  return { samples: [...worst.values()], rejected, clamped, truncated };
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

/** Nearest-rank percentile. CWV grades at p75, so that is the default. */
export function percentile(values: readonly number[], p = 0.75): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank]!;
}

export type MetricRollup = {
  metric: VitalMetric;
  device: DeviceClass;
  samples: number;
  p75: number;
  p95: number;
  rating: VitalRating;
  budget: number | null;
  /** False when p75 is over the budget for a budgeted metric. */
  withinBudget: boolean;
};

export type VitalsSummary = {
  total: number;
  /** Rollups sorted by metric then device, with an "all devices" row first. */
  rollups: MetricRollup[];
  /** Budgeted metrics whose p75 fails, across all devices. */
  failing: MetricRollup[];
  /** Slowest paths by LCP p75 — where a merchant should look first. */
  worstPaths: { path: string; samples: number; lcpP75: number }[];
};

function budgetFor(metric: VitalMetric): number | null {
  const key = BUDGET_KEY[metric];
  return key ? VITALS_BUDGET[key] : null;
}

function rollup(metric: VitalMetric, device: DeviceClass, values: number[]): MetricRollup {
  const p75 = percentile(values, 0.75);
  const budget = budgetFor(metric);
  return {
    metric,
    device,
    samples: values.length,
    p75: metric === "cls" ? Number(p75.toFixed(3)) : Math.round(p75),
    p95: metric === "cls" ? Number(percentile(values, 0.95).toFixed(3)) : Math.round(percentile(values, 0.95)),
    rating: rateMetric(metric, p75),
    budget,
    withinBudget: budget === null ? true : p75 <= budget,
  };
}

/**
 * Aggregates raw rows into the shape the merchant dashboard renders. A rollup
 * needs a floor of samples before it is allowed to fail a budget: p75 of three
 * samples is noise, and a false alarm trains merchants to ignore the panel.
 */
export const MIN_SAMPLES_TO_JUDGE = 20;

export function summarize(
  rows: readonly { metric: VitalMetric | string; value: number; device?: string; path?: string }[],
): VitalsSummary {
  const byMetricDevice = new Map<string, number[]>();
  const byPathLcp = new Map<string, number[]>();

  for (const row of rows) {
    const metric = String(row.metric).toLowerCase();
    if (!(VITAL_METRICS as readonly string[]).includes(metric)) continue;
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    const device = deviceClass(row.device);
    push(byMetricDevice, `${metric}|all`, value);
    push(byMetricDevice, `${metric}|${device}`, value);
    if (metric === "lcp") push(byPathLcp, normalizePath(row.path), value);
  }

  const rollups: MetricRollup[] = [];
  for (const metric of VITAL_METRICS) {
    for (const device of ["unknown", ...DEVICE_CLASSES] as const) {
      const key = `${metric}|${device === "unknown" ? "unknown" : device}`;
      const all = byMetricDevice.get(`${metric}|all`);
      if (device === "unknown" && all) {
        // "all" row, emitted once per metric under the synthetic device key.
        rollups.push({ ...rollup(metric, "unknown", all), device: "unknown" });
      }
      const values = byMetricDevice.get(key);
      if (values && device !== "unknown") rollups.push(rollup(metric, device, values));
    }
  }

  const failing = rollups.filter(
    (r) => r.budget !== null && !r.withinBudget && r.samples >= MIN_SAMPLES_TO_JUDGE,
  );

  const worstPaths = [...byPathLcp.entries()]
    .map(([path, values]) => ({ path, samples: values.length, lcpP75: Math.round(percentile(values, 0.75)) }))
    .filter((row) => row.samples >= 5)
    .sort((a, b) => b.lcpP75 - a.lcpP75)
    .slice(0, 10);

  return { total: rows.length, rollups, failing, worstPaths };
}

function push(map: Map<string, number[]>, key: string, value: number) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** One-line verdict for logs, CI output and the studio footer. */
export function describeSummary(summary: VitalsSummary): string {
  if (!summary.total) return "no field data yet";
  const parts = summary.rollups
    .filter((r) => r.device === "unknown" && r.budget !== null)
    .map((r) => `${r.metric.toUpperCase()} p75 ${r.metric === "cls" ? r.p75 : `${r.p75}ms`} (${r.rating})`);
  return `${summary.total} samples · ${parts.join(" · ") || "—"}`;
}
