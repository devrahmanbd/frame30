/**
 * Shared test doubles for the `[A]` failure suites.
 *
 * `metricRecorder()` is designed to be used from inside a `vi.mock` factory
 * (via `vi.hoisted`), so a test can assert on the exact counter a guard emits —
 * that emission *is* the audit trail the standing rule asks for.
 */
import { vi } from "vitest";

export type Metric = { name: string; labels: Record<string, string>; value: number };

export function metricRecorder() {
  const metrics: Metric[] = [];
  const logs: { level: string; event: string; fields: Record<string, unknown> }[] = [];

  const observability = {
    incr: (name: string, labels: Record<string, string> = {}, by = 1) => {
      metrics.push({ name, labels, value: by });
    },
    setGauge: () => {},
    observe: () => {},
    registerMetric: () => {},
    log: (level: string, event: string, fields: Record<string, unknown> = {}) => {
      logs.push({ level, event, fields });
    },
    addBreadcrumb: () => {},
    setTraceTag: () => {},
    currentTrace: () => null,
    traceHeaders: () => ({}),
    captureError: async () => {},
    sentryEnabled: () => false,
    withSpan: async <T,>(_name: string, fn: () => Promise<T>) => fn(),
  };

  return {
    metrics,
    logs,
    observability,
    reset() {
      metrics.length = 0;
      logs.length = 0;
    },
    /** Counter samples for one metric name, optionally narrowed by a label. */
    of(name: string, label?: [string, string]) {
      return metrics.filter(
        (m) => m.name === name && (!label || m.labels[label[0]] === label[1]),
      );
    },
    names() {
      return metrics.map((m) => m.name);
    },
  };
}

/** Rate limiting is enforced elsewhere; these suites test the business guard. */
export function allowAllRateLimits() {
  return {
    enforceRateLimit: vi.fn(async () => ({
      allowed: true,
      hits: 1,
      limit: 100,
      remaining: 99,
      reset_at: new Date(Date.now() + 60_000).toISOString(),
    })),
    rateLimit: vi.fn(async () => ({
      allowed: true,
      hits: 1,
      limit: 100,
      remaining: 99,
      reset_at: new Date(Date.now() + 60_000).toISOString(),
    })),
    rateLimitHeaders: () => ({}),
    RateLimitError: class RateLimitError extends Error {},
    BUCKETS: {},
  };
}
