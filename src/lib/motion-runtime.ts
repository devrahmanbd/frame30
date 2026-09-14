/**
 * Phase 10.1 — browser runtime for the marketing motion layer.
 *
 * Nothing here touches the DOM at module scope: SSR imports this file, renders
 * the final (settled) state, and the hooks only start doing work after
 * hydration. The runtime owns three shared, page-wide resources so that a
 * 12-section landing page does not create 12 observers, 12 rAF loops and 12
 * media-query listeners:
 *
 *   1. one IntersectionObserver per (rootMargin, threshold) pair;
 *   2. one rAF ticker, which stops entirely when nothing is subscribed and
 *      when the tab is hidden (off-screen work is wasted battery);
 *   3. one motion-preference store, live-updated when the OS setting changes
 *      mid-session — an accessibility setting that only applies on reload is
 *      not an accessibility setting.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  MOTION_TOKENS,
  MotionBudget,
  type MotionEnvironment,
  type MotionIntent,
  type MotionLogRecord,
  motionLogRecord,
  resolveIntent,
  shouldSampleLog,
} from "./motion-policy";

/* -------------------------------------------------------------- log sink */

type LogSink = (record: MotionLogRecord) => void;

const recent: MotionLogRecord[] = [];
let sink: LogSink | null = null;

/** Tests and the observability layer can capture instead of printing. */
export function setMotionLogSink(next: LogSink | null) {
  sink = next;
}

export function motionLog(
  level: MotionLogRecord["level"],
  event: string,
  fields: Record<string, unknown> = {},
) {
  const record = motionLogRecord(level, event, fields);
  recent.push(record);
  if (recent.length > 50) recent.shift();
  if (sink) {
    sink(record);
    return record;
  }
  if (!shouldSampleLog(level)) return record;
  const line = `[motion] ${record.event} ${JSON.stringify(record.fields)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (import.meta.env?.DEV) console.info(line);
  return record;
}

/** Last 50 records — surfaced by the debug overlay, never by the page. */
export function recentMotionLogs() {
  return [...recent];
}

/* ------------------------------------------------------ motion preference */

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
const prefListeners = new Set<() => void>();
let prefSnapshot: MotionIntent = "off";
let prefBound = false;

function readEnvironment(): MotionEnvironment {
  if (typeof window === "undefined") return { hydrated: false };
  const nav = window.navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  return {
    hydrated: true,
    prefersReduced: window.matchMedia?.(REDUCE_QUERY)?.matches ?? false,
    saveData: nav.connection?.saveData ?? false,
    deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
  };
}

function recomputePreference() {
  const next = resolveIntent(readEnvironment());
  if (next === prefSnapshot) return;
  prefSnapshot = next;
  motionLog("info", "intent.changed", { intent: next });
  for (const listener of prefListeners) listener();
}

function subscribePreference(listener: () => void) {
  prefListeners.add(listener);
  if (!prefBound && typeof window !== "undefined") {
    prefBound = true;
    const mql = window.matchMedia?.(REDUCE_QUERY);
    mql?.addEventListener?.("change", recomputePreference);
    recomputePreference();
  }
  return () => {
    prefListeners.delete(listener);
  };
}

/**
 * The resolved intent for this session. `off` during SSR and the first client
 * render, so hydration always matches; it upgrades on the first effect.
 */
export function useMotionIntent(): MotionIntent {
  return useSyncExternalStore(
    subscribePreference,
    () => prefSnapshot,
    () => "off" as const,
  );
}

/* ------------------------------------------------------------- visibility */

const visibilityListeners = new Set<(visible: boolean) => void>();
let visibilityBound = false;

function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    const visible = !document.hidden;
    for (const listener of visibilityListeners) listener(visible);
  });
}

export function onTabVisibility(listener: (visible: boolean) => void) {
  bindVisibility();
  visibilityListeners.add(listener);
  return () => visibilityListeners.delete(listener);
}

export function isTabVisible() {
  return typeof document === "undefined" ? true : !document.hidden;
}

/* ---------------------------------------------------- shared intersection */

type InViewCallback = (entry: { visible: boolean; ratio: number }) => void;

const observers = new Map<string, IntersectionObserver>();
const callbacks = new WeakMap<Element, InViewCallback>();

function observerFor(rootMargin: string, threshold: number) {
  const key = `${rootMargin}|${threshold}`;
  const existing = observers.get(key);
  if (existing) return existing;
  if (typeof IntersectionObserver === "undefined") return null;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        callbacks.get(entry.target)?.({
          visible: entry.isIntersecting,
          ratio: entry.intersectionRatio,
        });
      }
    },
    { rootMargin, threshold },
  );
  observers.set(key, io);
  return io;
}

export type InViewOptions = {
  /** Stop observing after the first entry — the default for entrance motion. */
  once?: boolean;
  rootMargin?: string;
  threshold?: number;
  /** When false the hook reports visible immediately and never observes. */
  enabled?: boolean;
};

export function useInView<T extends HTMLElement>(options: InViewOptions = {}) {
  const { once = true, rootMargin = "0px 0px -12% 0px", threshold = 0.05, enabled = true } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setInView(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const io = observerFor(rootMargin, threshold);
    if (!io) {
      // No IntersectionObserver (very old browser, jsdom): never hide content.
      setInView(true);
      motionLog("warn", "observer.unavailable", { rootMargin });
      return;
    }
    let done = false;
    callbacks.set(node, ({ visible }) => {
      if (done) return;
      setInView(visible);
      if (visible && once) {
        done = true;
        io.unobserve(node);
        callbacks.delete(node);
      }
    });
    io.observe(node);
    return () => {
      callbacks.delete(node);
      io.unobserve(node);
    };
  }, [enabled, once, rootMargin, threshold]);

  return { ref, inView };
}

/* ------------------------------------------------------------- rAF ticker */

type Tick = (now: number) => void;
const tickers = new Set<Tick>();
let frame: number | null = null;
let tickerPausedByVisibility = false;

function pump(now: number) {
  frame = null;
  for (const tick of [...tickers]) {
    try {
      tick(now);
    } catch (error) {
      // One broken animation must never kill the whole page's ticker.
      tickers.delete(tick);
      motionLog("error", "ticker.callback_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  if (tickers.size > 0 && !tickerPausedByVisibility) frame = requestAnimationFrame(pump);
}

function ensurePumping() {
  if (frame !== null || tickers.size === 0 || tickerPausedByVisibility) return;
  if (typeof requestAnimationFrame === "undefined") return;
  frame = requestAnimationFrame(pump);
}

if (typeof document !== "undefined") {
  onTabVisibility((visible) => {
    tickerPausedByVisibility = !visible;
    if (visible) ensurePumping();
    else if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  });
}

/** Subscribe to the shared frame loop. Returns an unsubscribe function. */
export function addTicker(tick: Tick) {
  tickers.add(tick);
  ensurePumping();
  return () => {
    tickers.delete(tick);
    if (tickers.size === 0 && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
}

export function tickerSize() {
  return tickers.size;
}

/* -------------------------------------------------------------- page budget */

/** One budget for the whole document; primitives borrow a slot while animating. */
export const pageMotionBudget = new MotionBudget(14);

let budgetWarned = false;

export function withMotionBudget(id: string) {
  const granted = pageMotionBudget.acquire(id);
  if (!granted && !budgetWarned) {
    budgetWarned = true;
    motionLog("warn", "budget.exhausted", pageMotionBudget.stats());
  }
  return granted;
}

export function releaseMotionBudget(id: string) {
  pageMotionBudget.release(id);
}

/* ------------------------------------------------------------------ ids */

let seq = 0;
export function useMotionId(prefix: string) {
  const ref = useRef<string>("");
  if (!ref.current) ref.current = `${prefix}-${(seq += 1)}`;
  return ref.current;
}

/** `useCallback`-stable merge of a forwarded ref and the runtime's own ref. */
export function useMergedRef<T>(...refs: Array<React.Ref<T> | undefined>) {
  return useCallback((node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, refs);
}

export { MOTION_TOKENS };
