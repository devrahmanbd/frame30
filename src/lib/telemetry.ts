/**
 * Pure telemetry core — the engine behind Prometheus exposition, W3C trace
 * context and Sentry envelope construction.
 *
 * Everything here is deterministic and dependency-free so it can be unit
 * tested without a request, a socket or an environment. The server wrapper
 * (`observability.server.ts`) owns process state, env reads and network I/O;
 * this module owns the rules.
 */

export type Labels = Record<string, string | number | boolean | null | undefined>;

export type MetricKind = "counter" | "gauge" | "histogram";

export type MetricMeta = { kind: MetricKind; help: string; buckets?: number[] };

/** Default latency ladder in milliseconds; wide enough for edge and cron work. */
export const DEFAULT_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/** Prometheus name rules: `[a-zA-Z_:][a-zA-Z0-9_:]*`. */
export function isValidMetricName(name: string) {
  return /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name);
}

/** Label values are escaped per exposition spec: backslash, quote, newline. */
export function escapeLabelValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Cardinality is the classic way a metrics endpoint takes down a scrape, so
 * label values are bounded here rather than at every call site.
 */
export function normalizeLabelValue(value: unknown, max = 48) {
  const raw = value === null || value === undefined ? "" : String(value);
  const cleaned = raw.replace(/[\u0000-\u001f]/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

export function seriesKey(name: string, labels: Labels = {}) {
  const parts = Object.keys(labels)
    .filter((k) => labels[k] !== undefined && labels[k] !== null && labels[k] !== "")
    .sort()
    .map((k) => `${k}="${escapeLabelValue(normalizeLabelValue(labels[k]))}"`);
  return parts.length ? `${name}{${parts.join(",")}}` : name;
}

function splitKey(key: string): { name: string; labelBody: string } {
  const brace = key.indexOf("{");
  if (brace === -1) return { name: key, labelBody: "" };
  return { name: key.slice(0, brace), labelBody: key.slice(brace + 1, -1) };
}

type HistogramState = { count: number; sum: number; buckets: number[] };

/**
 * In-isolate metric registry. Serverless isolates are short lived, so values
 * are monotonic *within* an isolate and Prometheus is expected to aggregate
 * across replicas with `sum()` / `rate()` — the same contract as any
 * autoscaled fleet. `maxSeries` is a hard stop against runaway cardinality.
 */
export class MetricRegistry {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, HistogramState>();
  private meta = new Map<string, MetricMeta>();
  private dropped = 0;

  constructor(private readonly maxSeries = 5000) {}

  describe(name: string, kind: MetricKind, help: string, buckets?: number[]) {
    if (!isValidMetricName(name)) throw new Error(`invalid metric name: ${name}`);
    this.meta.set(name, { kind, help, ...(buckets ? { buckets } : {}) });
  }

  private capped(map: Map<string, unknown>, key: string) {
    if (map.has(key)) return false;
    if (this.totalSeries() >= this.maxSeries) {
      this.dropped += 1;
      return true;
    }
    return false;
  }

  totalSeries() {
    return this.counters.size + this.gauges.size + this.histograms.size;
  }

  droppedSeries() {
    return this.dropped;
  }

  incr(name: string, labels: Labels = {}, by = 1) {
    if (!isValidMetricName(name) || !Number.isFinite(by)) return;
    const key = seriesKey(name, labels);
    if (this.capped(this.counters, key)) return;
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  gauge(name: string, value: number, labels: Labels = {}) {
    if (!isValidMetricName(name) || !Number.isFinite(value)) return;
    const key = seriesKey(name, labels);
    if (this.capped(this.gauges, key)) return;
    this.gauges.set(key, value);
  }

  observe(name: string, value: number, labels: Labels = {}) {
    if (!isValidMetricName(name) || !Number.isFinite(value)) return;
    const key = seriesKey(name, labels);
    if (this.capped(this.histograms, key)) return;
    const edges = this.meta.get(name)?.buckets ?? DEFAULT_BUCKETS_MS;
    const cur = this.histograms.get(key) ?? { count: 0, sum: 0, buckets: edges.map(() => 0) };
    cur.count += 1;
    cur.sum += value;
    edges.forEach((edge, i) => {
      if (value <= edge) cur.buckets[i] = (cur.buckets[i] ?? 0) + 1;
    });
    this.histograms.set(key, cur);
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        [...this.histograms].map(([k, v]) => [
          k,
          { count: v.count, sum: v.sum, avg: v.count ? v.sum / v.count : 0 },
        ]),
      ),
      series: this.totalSeries(),
      dropped: this.dropped,
    };
  }

  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.dropped = 0;
  }

  /** Prometheus text exposition format v0.0.4. */
  render() {
    const lines: string[] = [];
    const header = (name: string, kind: MetricKind) => {
      const help = this.meta.get(name)?.help ?? name;
      lines.push(`# HELP ${name} ${help.replace(/\n/g, " ")}`);
      lines.push(`# TYPE ${name} ${kind}`);
    };

    const emit = (map: Map<string, number>, kind: "counter" | "gauge") => {
      const grouped = new Map<string, [string, number][]>();
      for (const [key, value] of map) {
        const { name } = splitKey(key);
        grouped.set(name, [...(grouped.get(name) ?? []), [key, value]]);
      }
      for (const [name, rows] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
        header(name, kind);
        for (const [key, value] of rows) lines.push(`${key} ${value}`);
      }
    };

    emit(this.counters, "counter");
    emit(this.gauges, "gauge");

    const histGroups = new Map<string, [string, HistogramState][]>();
    for (const [key, hist] of this.histograms) {
      const { name } = splitKey(key);
      histGroups.set(name, [...(histGroups.get(name) ?? []), [key, hist]]);
    }
    for (const [name, rows] of [...histGroups].sort(([a], [b]) => a.localeCompare(b))) {
      header(name, "histogram");
      const edges = this.meta.get(name)?.buckets ?? DEFAULT_BUCKETS_MS;
      for (const [key, hist] of rows) {
        const { labelBody } = splitKey(key);
        let cumulative = 0;
        edges.forEach((edge, i) => {
          cumulative += hist.buckets[i] ?? 0;
          const inner = [labelBody, `le="${edge}"`].filter(Boolean).join(",");
          lines.push(`${name}_bucket{${inner}} ${cumulative}`);
        });
        const infInner = [labelBody, 'le="+Inf"'].filter(Boolean).join(",");
        lines.push(`${name}_bucket{${infInner}} ${hist.count}`);
        const suffix = labelBody ? `{${labelBody}}` : "";
        lines.push(`${name}_sum${suffix} ${hist.sum}`);
        lines.push(`${name}_count${suffix} ${hist.count}`);
      }
    }

    return `${lines.join("\n")}\n`;
  }
}

/* ------------------------------------------------------------------ */
/* W3C trace context                                                    */
/* ------------------------------------------------------------------ */

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string | undefined;
  sampled: boolean;
};

function randomHex(bytes: number) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newTraceId() {
  return randomHex(16);
}

export function newSpanId() {
  return randomHex(8);
}

/** `00-<32 hex>-<16 hex>-<flags>`; invalid or all-zero ids are rejected. */
export function parseTraceparent(header: string | null | undefined): TraceContext | null {
  if (!header) return null;
  const m = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(header.trim());
  if (!m) return null;
  const [, version, traceId, spanId, flags] = m as unknown as [string, string, string, string, string];
  if (version === "ff") return null;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return { traceId, spanId, sampled: (parseInt(flags, 16) & 1) === 1 };
}

export function formatTraceparent(ctx: TraceContext) {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? "01" : "00"}`;
}

/**
 * Deterministic head sampling: the same trace id always yields the same
 * decision, so a distributed trace is never half-recorded.
 */
export function sampleTrace(traceId: string, rate: number) {
  if (!(rate > 0)) return false;
  if (rate >= 1) return true;
  const slice = parseInt(traceId.slice(0, 8) || "0", 16);
  return slice / 0xffffffff < rate;
}

/** Continue an upstream trace when present, otherwise start a fresh one. */
export function startTrace(traceparent: string | null | undefined, rate: number): TraceContext {
  const parent = parseTraceparent(traceparent);
  if (parent) {
    return {
      traceId: parent.traceId,
      spanId: newSpanId(),
      parentSpanId: parent.spanId,
      sampled: parent.sampled,
    };
  }
  const traceId = newTraceId();
  return { traceId, spanId: newSpanId(), sampled: sampleTrace(traceId, rate) };
}

/* ------------------------------------------------------------------ */
/* Sentry                                                              */
/* ------------------------------------------------------------------ */

export type SentryDsn = { host: string; protocol: string; projectId: string; publicKey: string };

export function parseSentryDsn(dsn: string | undefined | null): SentryDsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+/, "");
    if (!projectId || !url.username) return null;
    return { host: url.host, protocol: url.protocol, projectId, publicKey: url.username };
  } catch {
    return null;
  }
}

export function sentryEnvelopeUrl(dsn: SentryDsn) {
  return `${dsn.protocol}//${dsn.host}/api/${dsn.projectId}/envelope/`;
}

export function sentryAuthHeader(dsn: SentryDsn) {
  return `Sentry sentry_version=7, sentry_client=framique/1.0, sentry_key=${dsn.publicKey}`;
}

export type Breadcrumb = { ts: string; category: string; message: string; data?: Record<string, unknown> };

/**
 * Envelopes are newline-delimited JSON: header, then (item header, payload)
 * pairs. Building the string here keeps the transport in the server module
 * trivial and testable.
 */
export function buildEnvelope(
  header: Record<string, unknown>,
  items: { type: string; payload: Record<string, unknown> }[],
) {
  const lines = [JSON.stringify(header)];
  for (const item of items) {
    const body = JSON.stringify(item.payload);
    lines.push(JSON.stringify({ type: item.type, length: body.length }));
    lines.push(body);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Fingerprint groups alerts in Sentry. Digits and uuids are collapsed so a
 * per-order or per-merchant message does not explode into thousands of issues.
 */
export function errorFingerprint(scope: string, message: string) {
  const normalized = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d{2,}\b/g, "<n>")
    .slice(0, 160);
  return [scope, normalized];
}

/**
 * Client-side rate limiter for Sentry sends. Keeps a noisy loop from burning
 * the project quota while still letting a genuinely new error through.
 */
export class SendBudget {
  private hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly limit = 30,
    private readonly windowMs = 60_000,
  ) {}

  allow(key: string, now = Date.now()) {
    const cur = this.hits.get(key);
    if (!cur || now - cur.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (cur.count >= this.limit) return false;
    cur.count += 1;
    return true;
  }
}
