/**
 * Phase 7.1 — URL lifecycle: 301 map, 410 tombstones, soft-404 discipline.
 *
 * A storefront's URLs outlive the rows behind them. When a merchant renames a
 * product slug the old link is already in search results, in a WhatsApp thread
 * and on a customer's phone: it must move, not break. When a product is pulled
 * for good the honest answer is 410 Gone, so a crawler drops it instead of
 * re-requesting it for months. And an empty collection is not a missing page —
 * returning 404 for "no results today" is the classic soft-404 that costs a
 * catalogue its crawl budget.
 *
 * Pure module: rules only, no React, no network, no Supabase.
 */

export type RedirectStatus = 301 | 410;

export type RedirectRule = {
  /** Normalised source path, store-relative and query-free. */
  from: string;
  /** Destination for a 301; always null for a 410. */
  to: string | null;
  status: RedirectStatus;
};

export type UrlVerdict =
  | { kind: "redirect"; status: 301; location: string }
  | { kind: "gone"; status: 410 }
  | { kind: "miss"; status: 404 };

/**
 * Canonical form of a path: no query, no hash, no trailing slash, no repeated
 * separators, case-folded. Two links that differ only in these ways are the
 * same URL and must resolve to the same rule.
 */
export function normalizePath(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "/";
  const withoutQuery = raw.split(/[?#]/)[0] ?? "";
  const collapsed = `/${withoutQuery}`.replace(/\/{2,}/g, "/");
  const trimmed = collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : "/";
  return trimmed.toLowerCase();
}

/** Indexes rules by normalised source; later rules win, so a re-rename is live. */
export function buildRedirectMap(rules: RedirectRule[]): Map<string, RedirectRule> {
  const map = new Map<string, RedirectRule>();
  for (const rule of rules) {
    const from = normalizePath(rule.from);
    if (rule.status === 301 && !rule.to) continue;
    map.set(from, { ...rule, from, to: rule.to ? normalizePath(rule.to) : null });
  }
  return map;
}

/** Longest redirect chain we will follow before declaring a loop. */
export const MAX_HOPS = 5;

/**
 * Resolves a missing URL. Chains are followed (a → b → c collapses to a → c)
 * so a merchant who renames twice never serves a redirect to a redirect, and a
 * cycle degrades to a plain 404 rather than an infinite loop.
 */
export function resolveUrl(map: Map<string, RedirectRule>, path: string): UrlVerdict {
  let current = normalizePath(path);
  const seen = new Set<string>([current]);
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const rule = map.get(current);
    if (!rule) return hop === 0 ? { kind: "miss", status: 404 } : { kind: "redirect", status: 301, location: current };
    if (rule.status === 410) return { kind: "gone", status: 410 };
    const next = rule.to!;
    if (seen.has(next)) return { kind: "miss", status: 404 };
    seen.add(next);
    current = next;
  }
  return { kind: "miss", status: 404 };
}

/**
 * The rule a slug rename creates. Renaming back to a previous slug removes the
 * stale hop rather than creating a cycle, which is why the caller is handed
 * both the new rule and the source it should delete.
 */
export function slugChangeRule(basePath: string, oldSlug: string, newSlug: string): RedirectRule | null {
  const from = normalizePath(`${basePath}/${oldSlug}`);
  const to = normalizePath(`${basePath}/${newSlug}`);
  if (!oldSlug || !newSlug || from === to) return null;
  return { from, to, status: 301 };
}

/** The tombstone a permanent deletion creates. */
export function tombstoneRule(basePath: string, slug: string): RedirectRule | null {
  if (!slug) return null;
  return { from: normalizePath(`${basePath}/${slug}`), to: null, status: 410 };
}

/* -------------------------------- soft 404s -------------------------------- */

export type ListingState = {
  /** Rows the listing actually rendered. */
  total: number;
  /** A facet value that does not exist in this store's taxonomy. */
  unknownFacet?: boolean;
  /** Free-text search rather than a browsable collection. */
  hasQuery?: boolean;
  /** Any facet or page beyond the clean collection URL. */
  filtered?: boolean;
};

export type ListingVerdict = { status: 200 | 404; robots: string; reason: string };

/**
 * Whether an empty listing is a missing page or simply an empty one.
 *
 * A collection that exists but has nothing in stock today is a real page: it
 * stays 200 and stays indexable, because tomorrow it has products. A facet
 * value that does not exist is a fabricated URL and gets a real 404. An empty
 * *filtered* view is a 200 the crawler should not keep — `noindex,follow`, so
 * the links out of it are still discovered.
 */
export function listingPolicy(state: ListingState): ListingVerdict {
  if (state.unknownFacet) {
    return { status: 404, robots: "noindex,follow", reason: "unknown-facet" };
  }
  if (state.total > 0) {
    return { status: 200, robots: "index,follow", reason: "populated" };
  }
  if (state.hasQuery) {
    return { status: 200, robots: "noindex,follow", reason: "empty-query" };
  }
  if (state.filtered) {
    return { status: 200, robots: "noindex,follow", reason: "empty-filtered" };
  }
  return { status: 200, robots: "index,follow", reason: "empty-collection" };
}
