/**
 * Observability runtime: metrics registry, structured logs, W3C trace context
 * and Sentry transport.
 *
 * Contract for callers:
 *  - `incr` / `setGauge` / `observe` record Prometheus series (scraped at
 *    `/api/public/metrics`);
 *  - `withSpan` wraps any unit of server work with latency, outcome and error
 *    capture, and nests under the active trace;
 *  - `withRequestTrace` opens a trace for an inbound request, continuing an
 *    upstream `traceparent` when present, and emits a Sentry transaction;
 *  - `log` writes PII-scrubbed JSON lines that Loki/Grafana can parse, always
 *    stamped with trace and span ids so a log line links to its trace.
 *
 * Observability must never take a request down: every transport failure is
 * swallowed, every send is budgeted, and every label value is bounded.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import {
  baseTags,
  errorEnvironment,
  errorQuota,
  errorRelease,
  errorSampleRate,
  errorTargets,
  errorTrackingEnabled,
  sanitizeEventFields,
  shouldSample,
  type BrowserErrorReport,
  type ErrorTargetName,
} from "./error-tracking";
import { scrubPayload, scrubText } from "./ops";
import {
  MetricRegistry,
  SendBudget,
  buildEnvelope,
  errorFingerprint,
  formatTraceparent,
  newSpanId,
  parseSentryDsn,
  sentryAuthHeader,
  sentryEnvelopeUrl,
  startTrace,
  type Breadcrumb,
  type Labels,
  type TraceContext,
} from "./telemetry";

export type { Labels, TraceContext } from "./telemetry";

const registry = new MetricRegistry(6000);

/** Per-fingerprint send quota, sized from the environment (Phase 12). */
let budget: { instance: SendBudget; limit: number } | null = null;
function errorBudget() {
  const { limit, windowMs } = errorQuota(process.env);
  if (!budget || budget.limit !== limit) budget = { instance: new SendBudget(limit, windowMs), limit };
  return budget.instance;
}

/* Metric catalogue — declaring HELP/TYPE up front makes the scrape
 * self-documenting and lets Grafana panels rely on stable names. */
registry.describe("framique_span_total", "counter", "Server work units by span and outcome");
registry.describe("framique_span_duration_ms", "histogram", "Span latency in milliseconds");
registry.describe("framique_http_requests_total", "counter", "Inbound HTTP requests by route and status class");
registry.describe("framique_http_request_duration_ms", "histogram", "Inbound HTTP latency in milliseconds");
registry.describe("framique_errors_total", "counter", "Captured exceptions by scope");
registry.describe("framique_ad_clicks_total", "counter", "Ad clicks ingested by verdict and network");
registry.describe("framique_ad_click_rejected_total", "counter", "Ad click beacons rejected before scoring, by reason");
registry.describe("framique_ad_click_replay_total", "counter", "Ad click beacons deduped by idempotency key");
registry.describe("framique_ad_ingest_ms", "histogram", "Ad click ingest latency in milliseconds");
registry.describe("framique_ad_score", "histogram", "Distribution of ad click fraud scores", [10, 25, 40, 55, 70, 85, 100]);
registry.describe("framique_ad_cron_runs_total", "counter", "Ad-fraud cron executions by outcome");
registry.describe("framique_ad_cron_duration_ms", "histogram", "Ad-fraud cron duration in milliseconds", [100, 500, 1000, 5000, 15000, 30000, 60000]);
registry.describe("framique_ad_cron_rollups_total", "counter", "Merchant/day integrity rollups produced by the sweep");
registry.describe("framique_ad_blocklist_expired_total", "counter", "Auto-blocks released by the sweep");
registry.describe("framique_ad_last_sweep_timestamp", "gauge", "Unix seconds of the last successful ad-fraud sweep");
registry.describe("framique_idempotency_total", "counter", "Idempotency claims by route and outcome (fresh/replay/conflict)");
// Phase 8.7 — page-builder pipeline health.
registry.describe("framique_template_render_ms", "histogram", "Storefront template server render time in milliseconds");
registry.describe("framique_widget_resolver_ms", "histogram", "Batched widget data-resolver latency in milliseconds");
registry.describe("framique_widget_resolver_total", "counter", "Widget data-resolver source calls by outcome");
registry.describe("framique_widget_errors_total", "counter", "Widget renderer failures by widget type");
registry.describe("framique_plugin_hook_total", "counter", "Plugin hook calls by hook and outcome (ok/timeout/error/skipped)");
registry.describe("framique_theme_demo_total", "counter", "Demo-content import/purge calls by action and outcome");
registry.describe("framique_plugin_hook_ms", "histogram", "Plugin hook latency in milliseconds");
registry.describe("framique_metrics_series", "gauge", "Active metric series in this isolate");
// Phase 7 (content roadmap) — the render-path read contract.
registry.describe("framique_render_read_total", "counter", "Render-path reads by read name and result (ok/timeout/error/cache_error)");
registry.describe("framique_render_read_ms", "histogram", "Render-path read latency in milliseconds", [5, 25, 50, 100, 250, 500, 1000, 1500]);
registry.describe("framique_seo_head_bytes", "histogram", "Gzipped head payload per rendered template in bytes", [1024, 2048, 4096, 6144, 8192, 12288]);
registry.describe("framique_seo_weight_findings_total", "counter", "SEO weight-audit findings by code and severity");
registry.describe("framique_seo_weight_runs_total", "counter", "SEO weight audits by trigger and outcome");
registry.describe("framique_metrics_dropped_series", "gauge", "Series rejected by the cardinality cap in this isolate");
registry.describe("framique_sentry_events_total", "counter", "Error events by backend target and transport outcome");
registry.describe("framique_error_alert_bridge_total", "counter", "GlitchTip/Sentry webhooks forwarded to Alertmanager, by outcome");

export function registerMetric(
  name: string,
  kind: "counter" | "gauge" | "histogram",
  help: string,
  buckets?: number[],
) {
  registry.describe(name, kind, help, buckets);
}

export function incr(name: string, labels: Labels = {}, by = 1) {
  registry.incr(name, labels, by);
}

export function setGauge(name: string, value: number, labels: Labels = {}) {
  registry.gauge(name, value, labels);
}

export function observe(name: string, value: number, labels: Labels = {}) {
  registry.observe(name, value, labels);
}

/* ------------------------------------------------------------------ */
/* Per-tenant labels (Phase 11)                                        */
/* ------------------------------------------------------------------ */

/**
 * Business metrics carry a bounded, opaque tenant label so a merchant-scoped
 * Grafana view is possible without either (a) exploding cardinality or (b)
 * publishing merchant ids on a scrape endpoint anyone can read.
 *
 * Rules:
 *  - the label value is a short non-reversible digest of the merchant id,
 *    stable across restarts (same input -> same bucket);
 *  - at most TENANT_LABEL_CAP distinct tenants are labelled per isolate; the
 *    rest collapse into `other`, so a burst of new stores cannot blow up the
 *    series count;
 *  - the digest is never logged next to the raw id, so a dashboard viewer with
 *    only Prometheus access cannot map a bucket back to a store. Operators map
 *    it deliberately with `tenantLabel(id)`.
 */
const TENANT_LABEL_CAP = 200;
const tenantBuckets = new Map<string, string>();

export function tenantLabel(merchantId: string | null | undefined): string {
  if (!merchantId) return "unknown";
  const cached = tenantBuckets.get(merchantId);
  if (cached) return cached;
  if (tenantBuckets.size >= TENANT_LABEL_CAP) return "other";
  // FNV-1a: cheap, stable, and not reversible without the id set.
  let hash = 0x811c9dc5;
  for (let i = 0; i < merchantId.length; i += 1) {
    hash ^= merchantId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const bucket = `t_${hash.toString(36)}`;
  tenantBuckets.set(merchantId, bucket);
  return bucket;
}

/** Test/ops helper: how many tenants currently hold a label slot. */
export function tenantLabelCount() {
  return tenantBuckets.size;
}


/* ------------------------------------------------------------------ */
/* Trace context                                                       */
/* ------------------------------------------------------------------ */

type ActiveTrace = TraceContext & {
  name: string;
  startedAt: number;
  breadcrumbs: Breadcrumb[];
  tags: Record<string, string>;
  spans: { op: string; description: string; spanId: string; start: number; end: number; status: string }[];
};

const traceStore = new AsyncLocalStorage<ActiveTrace>();

export function currentTrace(): TraceContext | null {
  const active = traceStore.getStore();
  return active ? { traceId: active.traceId, spanId: active.spanId, sampled: active.sampled } : null;
}

/** Outbound propagation headers so downstream services join the same trace. */
export function traceHeaders(): Record<string, string> {
  const active = currentTrace();
  return active ? { traceparent: formatTraceparent(active) } : {};
}

/** Attach a searchable breadcrumb to the active trace (Sentry + logs). */
export function addBreadcrumb(category: string, message: string, data: Record<string, unknown> = {}) {
  const active = traceStore.getStore();
  if (!active) return;
  active.breadcrumbs.push({
    ts: new Date().toISOString(),
    category,
    message: scrubText(message),
    data: scrubPayload(data) as Record<string, unknown>,
  });
  if (active.breadcrumbs.length > 30) active.breadcrumbs.shift();
}

export function setTraceTag(key: string, value: string) {
  const active = traceStore.getStore();
  if (active) active.tags[key] = String(value).slice(0, 64);
}

/* ------------------------------------------------------------------ */
/* Logging                                                             */
/* ------------------------------------------------------------------ */

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured line. Callers should stay PII-minimal, but every field is passed
 * through the scrubber anyway so a stray email, phone, card or token can never
 * reach stdout, Loki or Sentry.
 */
export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const safe = scrubPayload(fields) as Record<string, unknown>;
  const active = traceStore.getStore();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    service: process.env["SENTRY_ENVIRONMENT"] ? "framique" : "framique-dev",
    ...(active ? { trace_id: active.traceId, span_id: active.spanId } : {}),
    ...safe,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/* ------------------------------------------------------------------ */
/* Error transport — GlitchTip + Sentry (Phase 12)                     */
/* ------------------------------------------------------------------ */

/**
 * One reporter, many backends. Both GlitchTip and self-hosted Sentry speak the
 * same envelope protocol, so a single builder is fanned out to every DSN that
 * is configured. Neither configured means the app just logs — and an
 * unreachable backend is swallowed: error reporting can never take a request
 * down or leave anything sensitive buffered.
 */
function sentryEnv() {
  return {
    dsn: parseSentryDsn(process.env["SENTRY_DSN"]),
    environment: errorEnvironment(process.env),
    release: errorRelease(process.env),
    tracesSampleRate: Number(process.env["SENTRY_TRACES_SAMPLE_RATE"] ?? "0.1"),
  };
}

export function sentryEnabled() {
  return errorTrackingEnabled(process.env);
}

/** Configured error backends: `[]`, `["glitchtip"]`, `["sentry"]` or both. */
export function errorBackends(): ErrorTargetName[] {
  return errorTargets(process.env).map((t) => t.name);
}

async function sendEnvelope(build: (dsnString: string) => string, kind: string) {
  let targets = errorTargets(process.env);
  try {
    const { getDynamicPlatformConfig } = await import("./dynamic-config.server");
    const dynamic = await getDynamicPlatformConfig<{ glitchtip_dsn?: string; sentry_dsn?: string }>("error_tracking");
    if (dynamic && (dynamic.glitchtip_dsn || dynamic.sentry_dsn)) {
      targets = errorTargets({
        ...process.env,
        ...(dynamic.glitchtip_dsn ? { GLITCHTIP_DSN: dynamic.glitchtip_dsn } : {}),
        ...(dynamic.sentry_dsn ? { SENTRY_DSN: dynamic.sentry_dsn } : {}),
      });
    }
  } catch {
    // Fall back to process.env
  }
  await Promise.all(
    targets.map(async (target) => {
      const labels = { kind, target: target.name };
      try {
        const res = await fetch(sentryEnvelopeUrl(target.dsn), {
          method: "POST",
          headers: {
            "content-type": "application/x-sentry-envelope",
            "x-sentry-auth": sentryAuthHeader(target.dsn),
          },
          body: build(target.dsnString),
        });
        incr("framique_sentry_events_total", { ...labels, outcome: res.ok ? "sent" : `http_${res.status}` });
      } catch {
        // Backend down: degrade silently. No retry queue, no disk buffer.
        incr("framique_sentry_events_total", { ...labels, outcome: "transport_error" });
      }
    }),
  );
}

/**
 * Capture an exception. Always logs; forwards to every configured backend when
 * sampling and the per-fingerprint quota allow it. Message, stack and context
 * are scrubbed, and whole PII/money-shaped fields are dropped before send, so
 * an event body carries no personal data — tenant identity travels as an
 * opaque tag only.
 */
export async function captureError(err: unknown, context: Record<string, unknown> = {}) {
  const raw = err instanceof Error ? err.message : String(err);
  const message = scrubText(raw);
  const safeContext = sanitizeEventFields(scrubPayload(context) as Record<string, unknown>);
  const scope = String(context["span"] ?? context["route"] ?? "unknown");
  incr("framique_errors_total", { scope });
  log("error", "exception", { message, ...safeContext });

  if (!errorTrackingEnabled(process.env)) return;
  const { environment, release } = sentryEnv();
  const fingerprint = errorFingerprint(scope, message);
  const key = fingerprint.join("|");
  if (!shouldSample(key, errorSampleRate(process.env))) {
    incr("framique_sentry_events_total", { kind: "error", outcome: "sampled_out" });
    return;
  }
  if (!errorBudget().allow(key)) {
    incr("framique_sentry_events_total", { kind: "error", outcome: "budgeted" });
    return;
  }

  const active = traceStore.getStore();
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const stack = err instanceof Error && err.stack ? scrubText(err.stack).split("\n").slice(0, 30) : [];

  await sendEnvelope(
    (dsnString) =>
      buildEnvelope({ event_id: eventId, sent_at: new Date().toISOString(), dsn: dsnString }, [
        {
          type: "event",
          payload: {
            event_id: eventId,
            timestamp: Date.now() / 1000,
            platform: "javascript",
            logger: "framique",
            level: "error",
            environment,
            release,
            server_name: "worker",
            message,
            fingerprint,
            tags: baseTags(process.env, { scope, ...(active?.tags ?? {}) }),
            extra: { ...safeContext, stack },
            breadcrumbs: active ? { values: active.breadcrumbs } : undefined,
            contexts: active
              ? { trace: { trace_id: active.traceId, span_id: active.spanId, op: active.name } }
              : undefined,
            exception: {
              values: [
                { type: err instanceof Error ? err.name : "Error", value: message, mechanism: { handled: true } },
              ],
            },
          },
        },
      ]),
    "error",
  );
}

/**
 * Browser-reported failure arriving at `/api/public/errors`. Reuses the same
 * scrub, sample, quota and fan-out path as a server exception; the browser
 * never holds a DSN.
 */
export async function captureBrowserError(report: BrowserErrorReport) {
  const error = new Error(scrubText(report.message).slice(0, 500));
  error.name = "BrowserError";
  if (report.stack) error.stack = scrubText(report.stack).slice(0, 4_000);
  await captureError(error, {
    route: report.route ? `client${report.route}` : "client",
    mechanism: report.mechanism,
    origin: "browser",
    ...(report.release ? { client_release: report.release } : {}),
    ...(report.commit ? { client_commit: report.commit } : {}),
  });
}


async function sendTransaction(active: ActiveTrace, status: string) {
  const { environment, release } = sentryEnv();
  if (!errorTrackingEnabled(process.env) || !active.sampled) return;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const start = active.startedAt / 1000;
  const end = Date.now() / 1000;
  await sendEnvelope(
    (dsnString) =>
      buildEnvelope({ event_id: eventId, sent_at: new Date().toISOString(), dsn: dsnString }, [
        {
          type: "transaction",
          payload: {
            event_id: eventId,
            type: "transaction",
            transaction: active.name,
            start_timestamp: start,
            timestamp: end,
            platform: "javascript",
            environment,
            release,
            tags: baseTags(process.env, active.tags),
            breadcrumbs: { values: active.breadcrumbs },
            contexts: {
              trace: {
                trace_id: active.traceId,
                span_id: active.spanId,
                parent_span_id: active.parentSpanId,
                op: "http.server",
                status,
              },
            },
            spans: active.spans.map((s) => ({
              span_id: s.spanId,
              parent_span_id: active.spanId,
              trace_id: active.traceId,
              op: s.op,
              description: s.description,
              start_timestamp: s.start / 1000,
              timestamp: s.end / 1000,
              status: s.status,
            })),
          },
        },
      ]),
    "transaction",
  );
}

/* ------------------------------------------------------------------ */
/* Spans and request traces                                            */
/* ------------------------------------------------------------------ */

/** Wrap a unit of server work: latency histogram, outcome counter, error capture. */
export async function withSpan<T>(name: string, fn: () => Promise<T>, labels: Labels = {}): Promise<T> {
  const started = Date.now();
  const active = traceStore.getStore();
  const spanId = newSpanId();
  const finish = (status: string) => {
    const ms = Date.now() - started;
    observe("framique_span_duration_ms", ms, { span: name, ...labels });
    incr("framique_span_total", { span: name, outcome: status === "ok" ? "ok" : "error", ...labels });
    if (active && active.spans.length < 80) {
      active.spans.push({ op: "function", description: name, spanId, start: started, end: Date.now(), status });
    }
  };
  try {
    const out = await fn();
    finish("ok");
    return out;
  } catch (err) {
    finish("internal_error");
    void captureError(err, { span: name, ...labels });
    throw err;
  }
}

export type RequestTraceResult = { response: Response };

/**
 * Open a trace around an inbound request. Records HTTP metrics, emits a Sentry
 * transaction when sampled, and returns the handler's response with
 * `traceparent` echoed back so a client can correlate a support ticket with a
 * trace.
 */
export async function withRequestTrace(
  route: string,
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const { tracesSampleRate } = sentryEnv();
  const ctx = startTrace(request.headers.get("traceparent"), tracesSampleRate);
  const active: ActiveTrace = {
    ...ctx,
    name: route,
    startedAt: Date.now(),
    breadcrumbs: [],
    tags: { route, method: request.method },
    spans: [],
  };

  return traceStore.run(active, async () => {
    let status = 500;
    try {
      const response = await handler();
      status = response.status;
      const headers = new Headers(response.headers);
      headers.set("traceparent", formatTraceparent(active));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (err) {
      await captureError(err, { route });
      throw err;
    } finally {
      const ms = Date.now() - active.startedAt;
      observe("framique_http_request_duration_ms", ms, { route });
      incr("framique_http_requests_total", { route, status: `${Math.floor(status / 100)}xx` });
      log(status >= 500 ? "error" : "info", "http.request", { route, status, ms });
      void sendTransaction(active, status < 400 ? "ok" : status < 500 ? "invalid_argument" : "internal_error");
    }
  });
}

export function metricsSnapshot() {
  return registry.snapshot();
}

/** Prometheus text exposition format (v0.0.4). */
export function renderPrometheus() {
  registry.gauge("framique_metrics_series", registry.totalSeries());
  registry.gauge("framique_metrics_dropped_series", registry.droppedSeries());
  return registry.render();
}
