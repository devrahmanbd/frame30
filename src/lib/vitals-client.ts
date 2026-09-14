/**
 * Phase 4.4 — real-user monitoring, browser half.
 *
 * Deliberately dependency-free (no `web-vitals` package): the collector is
 * ~2KB of `PerformanceObserver` glue, and shipping a library to measure how
 * much we ship would be self-defeating. It follows the same rules the spec
 * uses:
 *
 *  - LCP is the last entry before the first user interaction or page hide;
 *  - CLS is the largest *session window* (1s gap, 5s cap), not the raw sum;
 *  - INP approximates to the worst event duration seen, which matches p75 INP
 *    closely enough for a merchant-facing dashboard;
 *  - everything is flushed exactly once, on `visibilitychange: hidden` (plus
 *    `pagehide` for Safari), via `sendBeacon` so the report survives the
 *    navigation that ended the page view.
 *
 * Failure is silent by design: telemetry may never break a storefront, so the
 * whole collector is wrapped and any unsupported API is simply skipped.
 */
import { deviceFromWidth, type VitalMetric } from "./vitals-report";

export type ReporterOptions = {
  merchantId: string;
  template: string;
  locale?: "en" | "bn";
  /** Override for tests. Defaults to the public ingest route. */
  endpoint?: string;
  /** Fraction of page views reported, 0..1. Field data does not need 100%. */
  sampleRate?: number;
};

type Pending = Partial<Record<VitalMetric, number>>;

const ENDPOINT = "/api/public/vitals";

function connectionClass(): string {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  return nav.connection?.effectiveType ?? "unknown";
}

/**
 * Starts collecting. Returns a disposer so a client-side route change can end
 * the page view cleanly (the reporter is per page view, not per session).
 */
export function startVitalsReporter(options: ReporterOptions): () => void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return () => {};

  const rate = options.sampleRate ?? 1;
  if (rate < 1 && Math.random() > rate) return () => {};

  const pending: Pending = {};
  const observers: PerformanceObserver[] = [];
  let flushed = false;

  const observe = (type: string, cb: (entries: PerformanceEntryList) => void, buffered = true) => {
    try {
      const po = new PerformanceObserver((list) => cb(list.getEntries()));
      po.observe({ type, buffered } as PerformanceObserverInit);
      observers.push(po);
    } catch {
      /* unsupported entry type — skip this metric, never the whole reporter */
    }
  };

  // --- LCP: keep the latest candidate until interaction or hide. ----------
  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1] as (PerformanceEntry & { startTime: number }) | undefined;
    if (last) pending.lcp = Math.round(last.startTime);
  });

  // --- FCP / TTFB: diagnostics that explain a bad LCP. --------------------
  observe("paint", (entries) => {
    for (const entry of entries) {
      if (entry.name === "first-contentful-paint") pending.fcp = Math.round(entry.startTime);
    }
  });
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) pending.ttfb = Math.round(nav.responseStart);
  } catch {
    /* navigation timing unavailable */
  }

  // --- CLS: largest session window, per the CWV definition. ---------------
  let clsValue = 0;
  let windowValue = 0;
  let windowStart = 0;
  let windowLast = 0;
  observe("layout-shift", (entries) => {
    for (const raw of entries) {
      const entry = raw as PerformanceEntry & { value: number; hadRecentInput: boolean };
      if (entry.hadRecentInput) continue;
      if (windowValue && entry.startTime - windowLast < 1_000 && entry.startTime - windowStart < 5_000) {
        windowValue += entry.value;
      } else {
        windowValue = entry.value;
        windowStart = entry.startTime;
      }
      windowLast = entry.startTime;
      if (windowValue > clsValue) clsValue = windowValue;
    }
  });

  // --- INP: worst interaction latency observed. ---------------------------
  let worstInteraction = 0;
  observe("event", (entries) => {
    for (const raw of entries) {
      const entry = raw as PerformanceEntry & { duration: number; interactionId?: number };
      if (!entry.interactionId) continue;
      if (entry.duration > worstInteraction) worstInteraction = Math.round(entry.duration);
    }
  });

  const flush = () => {
    if (flushed) return;
    flushed = true;
    for (const po of observers) {
      try {
        po.takeRecords();
        po.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    if (clsValue > 0) pending.cls = Number(clsValue.toFixed(4));
    if (worstInteraction > 0) pending.inp = worstInteraction;

    const samples = (Object.keys(pending) as VitalMetric[])
      .map((metric) => ({
        metric,
        value: pending[metric]!,
        template: options.template,
        path: window.location.pathname,
        locale: options.locale ?? "en",
        device: deviceFromWidth(window.innerWidth),
        connection: connectionClass(),
        ts: Date.now(),
      }))
      .filter((s) => Number.isFinite(s.value));
    if (!samples.length) return;

    const body = JSON.stringify({ merchantId: options.merchantId, samples });
    const url = options.endpoint ?? ENDPOINT;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch(url, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
    } catch {
      /* the page is going away; a lost sample is acceptable */
    }
  };

  const onHide = () => {
    if (document.visibilityState === "hidden") flush();
  };
  document.addEventListener("visibilitychange", onHide, { capture: true });
  window.addEventListener("pagehide", flush, { capture: true });

  return () => {
    document.removeEventListener("visibilitychange", onHide, { capture: true });
    window.removeEventListener("pagehide", flush, { capture: true });
    flush();
  };
}
