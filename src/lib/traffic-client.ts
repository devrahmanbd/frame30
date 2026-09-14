/**
 * Storefront traffic collector, browser half.
 *
 * Sends only *what happened* — page view, product view, add to cart, checkout
 * start, search, and clicks on tracked elements. It never sends a location: the
 * country, region, city, network and device are derived server-side from the
 * request, so a shopper cannot skew a merchant's report.
 *
 * Identifiers are random opaque strings kept in the browser (visitor in
 * localStorage, session in sessionStorage) and are hashed per store *and per
 * day* on the server before storage, so they cannot follow anyone across days
 * or stores. Dependency-free, batched, flushed with `sendBeacon`, and silent on
 * failure — telemetry may never break a storefront.
 */

const ENDPOINT = "/api/public/analytics/beacon";
const VISITOR_KEY = "fq.visitor";
const SESSION_KEY = "fq.session";
const MAX_BATCH = 25;
const FLUSH_MS = 4000;

export type TrackEntity = "page" | "product" | "cart" | "checkout" | "order" | "search";

export type TrackEvent = {
  entity: TrackEntity;
  action: string;
  valueMinorInt?: number;
  currencyCode?: string;
  payload?: Record<string, string | number | boolean>;
};

type Queued = TrackEvent & { occurredAt: string; dedupeKey: string };

function randomId() {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function stored(store: Storage | undefined, key: string) {
  try {
    if (!store) return randomId();
    const existing = store.getItem(key);
    if (existing && existing.length >= 8) return existing;
    const fresh = randomId();
    store.setItem(key, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

/** First-touch attribution: UTM when present, else the referring host. */
function attribution() {
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source");
    const campaign = params.get("utm_campaign") ?? params.get("utm_content") ?? "";
    if (utmSource) return { source: utmSource.slice(0, 60), campaign: campaign.slice(0, 60) };
    if (!document.referrer) return { source: "direct", campaign: "" };
    const host = new URL(document.referrer).hostname;
    if (host === window.location.hostname) return { source: "internal", campaign: "" };
    return { source: host.replace(/^www\./, "").slice(0, 60), campaign: "" };
  } catch {
    return { source: "direct", campaign: "" };
  }
}

type Tracker = {
  track: (event: TrackEvent) => void;
  flush: () => void;
  stop: () => void;
};

let active: Tracker | null = null;
/**
 * Events recorded before the collector mounts. Page components run their
 * effects before the layout that starts the collector, so without this buffer
 * the first product view or cart add of a page view would be lost.
 */
let pending: TrackEvent[] = [];

/** The tracker for the current page, if the collector is running. */
export function tracker(): Tracker | null {
  return active;
}

/** Convenience for components: records an event when a tracker is running. */
export function trackEvent(event: TrackEvent) {
  if (active) active.track(event);
  else if (pending.length < MAX_BATCH) pending.push(event);
}

export function startTrafficReporter(options: {
  merchantId: string;
  template: string;
  /** Override for tests. */
  endpoint?: string;
  /** Fraction of page views reported, 0..1. */
  sampleRate?: number;
}): () => void {
  if (typeof window === "undefined") return () => {};
  const rate = options.sampleRate ?? 1;
  if (rate < 1 && Math.random() > rate) return () => {};

  const endpoint = options.endpoint ?? ENDPOINT;
  const visitorId = stored(window.localStorage, VISITOR_KEY);
  const sessionId = stored(window.sessionStorage, SESSION_KEY);
  const { source, campaign } = attribution();

  let queue: Queued[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function send(batch: Queued[], useBeacon: boolean) {
    if (!batch.length) return;
    const body = JSON.stringify({
      merchantId: options.merchantId,
      visitorId,
      sessionId,
      events: batch.map((e) => ({
        entity: e.entity,
        action: e.action,
        occurredAt: e.occurredAt,
        source,
        campaign,
        valueMinorInt: e.valueMinorInt,
        currencyCode: e.currencyCode,
        payload: { template: options.template, path: window.location.pathname, ...(e.payload ?? {}) },
        dedupeKey: e.dedupeKey,
      })),
    });
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* telemetry is best effort */
    }
  }

  function flush(useBeacon = false) {
    if (!queue.length) return;
    const batch = queue;
    queue = [];
    if (timer) clearTimeout(timer);
    timer = undefined;
    send(batch, useBeacon);
  }

  function track(event: TrackEvent) {
    if (stopped) return;
    queue.push({
      ...event,
      occurredAt: new Date().toISOString(),
      dedupeKey: `${event.entity}:${event.action}:${randomId()}`,
    });
    // Funnel steps are sent at once: a shopper often leaves the page within a
    // second of them, and a lost step would understate the merchant's report.
    const urgent = event.entity !== "page" || event.action === "view";
    if (queue.length >= MAX_BATCH || urgent) flush();
    else if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
  }

  // Clicks on anything the theme marked as trackable, plus every link.
  function onClick(ev: MouseEvent) {
    const target = ev.target as Element | null;
    const el = target?.closest?.("[data-fq-track],a,button") as HTMLElement | null;
    if (!el) return;
    const label =
      el.getAttribute("data-fq-track") ||
      el.getAttribute("aria-label") ||
      (el.textContent ?? "").trim().slice(0, 60) ||
      el.tagName.toLowerCase();
    track({
      entity: "page",
      action: "click",
      payload: { label, tag: el.tagName.toLowerCase() },
    });
  }

  const onHide = () => {
    if (document.visibilityState === "hidden") flush(true);
  };

  document.addEventListener("click", onClick, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", () => flush(true));

  active = { track, flush: () => flush(), stop: () => {} };

  track({ entity: "page", action: "view" });
  // Drain anything the page recorded before this collector mounted.
  const buffered = pending;
  pending = [];
  for (const event of buffered) track(event);

  return () => {
    stopped = true;
    flush(true);
    document.removeEventListener("click", onClick, { capture: true } as EventListenerOptions);
    document.removeEventListener("visibilitychange", onHide);
    if (active && active.track === track) active = null;
  };
}
