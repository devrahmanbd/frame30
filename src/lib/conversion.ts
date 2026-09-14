/**
 * Pure conversion-surface logic (no I/O, no browser, no database).
 *
 * Everything here is deterministic so it can be unit tested and reused on both
 * sides of the SSR boundary. Anything that needs a tenant, a session or a row
 * lives in `conversion.server.ts`.
 */

export type ReviewAgg = {
  count: number;
  mean: number;
  histogram: Record<string, number>;
};

export const EMPTY_AGG: ReviewAgg = { count: 0, mean: 0, histogram: {} };

/**
 * Normalises whatever the aggregate routine returned into a shape the UI can
 * render without guards: five buckets, always present, always summing to the
 * reported count.
 */
export function reviewSummary(agg: ReviewAgg | null | undefined) {
  const source = agg ?? EMPTY_AGG;
  const count = Math.max(0, Number(source.count) || 0);
  const mean = count === 0 ? 0 : Math.min(5, Math.max(0, Number(source.mean) || 0));
  const bars = [5, 4, 3, 2, 1].map((stars) => {
    const n = Math.max(0, Number(source.histogram?.[String(stars)] ?? 0) || 0);
    return { stars, count: n, pct: count === 0 ? 0 : Math.round((n / count) * 100) };
  });
  return {
    count,
    mean,
    // Half-star rounding keeps the rendered star row honest at 4.25 vs 4.75.
    rounded: Math.round(mean * 2) / 2,
    bars,
    hasReviews: count > 0,
  };
}

/** Star row descriptor: full / half / empty, in display order. */
export function starRow(rounded: number): ("full" | "half" | "empty")[] {
  return [1, 2, 3, 4, 5].map((i) => {
    if (rounded >= i) return "full";
    if (rounded >= i - 0.5) return "half";
    return "empty";
  });
}

export type ScarcityLevel = "none" | "low" | "critical" | "out";

/**
 * Scarcity messaging must never invent urgency: it is derived from real stock
 * and returns `none` above the threshold so the widget stays hidden.
 */
export function scarcity(stock: number, threshold = 10): { level: ScarcityLevel; left: number } {
  const left = Math.max(0, Math.floor(Number(stock) || 0));
  if (left <= 0) return { level: "out", left: 0 };
  if (left <= Math.min(3, threshold)) return { level: "critical", left };
  if (left <= threshold) return { level: "low", left };
  return { level: "none", left };
}

/** Remaining whole seconds until an ISO deadline; never negative. */
export function countdownSeconds(endsAt: string | null | undefined, now = Date.now()): number {
  if (!endsAt) return 0;
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - now) / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export type RecommendedProduct = {
  id: string;
  title: string;
  slug: string;
  image_url: string | null;
  price_minor: number | null;
  reason?: string;
};

/**
 * Merges recommendation sources into one rail: first occurrence wins, the
 * current product is always dropped, and the rail is capped so a slow store
 * cannot render a hundred cards.
 */
export function mergeRails(
  rails: (RecommendedProduct[] | null | undefined)[],
  excludeId: string | null,
  limit = 6,
): RecommendedProduct[] {
  const seen = new Set<string>(excludeId ? [excludeId] : []);
  const out: RecommendedProduct[] = [];
  for (const rail of rails) {
    for (const item of rail ?? []) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const SESSION_RE = /^[a-z0-9]{16,64}$/;

/** Anonymous browsing key. Not an identifier of a person — no PII, rotates per browser. */
export function isSessionKey(value: unknown): value is string {
  return typeof value === "string" && SESSION_RE.test(value);
}

export function newSessionKey(random: () => number = Math.random): string {
  let out = "";
  while (out.length < 24) out += Math.floor(random() * 36 ** 8).toString(36);
  return out.slice(0, 24);
}
