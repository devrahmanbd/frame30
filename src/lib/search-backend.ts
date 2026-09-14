/**
 * Search backend selection engine — §4.4.
 *
 * The product must never depend on a search cluster being up. Postgres FTS is
 * the floor: it is in the same database as the catalogue, so it can only fail
 * when the whole store is already down. Meilisearch/Typesense are an *upgrade*
 * layered on top, chosen per merchant, and demoted automatically the moment
 * they misbehave.
 *
 * This module is pure — no network, no database — so the promotion/demotion
 * rules that decide which engine serves shopper traffic are unit-testable
 * rather than something you only discover in production.
 */

export type SearchEngine = "postgres" | "meilisearch" | "typesense";

/** `degraded` still serves traffic; `down` is fully bypassed until probes pass. */
export type BackendHealth = "healthy" | "degraded" | "down";

export type BackendConfig = {
  engine: SearchEngine;
  host?: string | null;
  indexName?: string | null;
  /** Milliseconds before the external engine is abandoned for this request. */
  timeoutMs: number;
  /** Consecutive failures that trip the breaker. */
  failureThreshold: number;
  /** How long the breaker stays open before a single probe is allowed. */
  cooldownSeconds: number;
};

export const DEFAULT_BACKEND: BackendConfig = {
  engine: "postgres",
  host: null,
  indexName: null,
  // 400ms: past this, falling back to FTS is faster than waiting, and shoppers
  // abandon a search box long before a 2s timeout would fire.
  timeoutMs: 400,
  failureThreshold: 5,
  cooldownSeconds: 60,
};

export function normalizeBackend(input: Partial<BackendConfig> | null | undefined): BackendConfig {
  const c = { ...DEFAULT_BACKEND, ...(input ?? {}) };
  const engine: SearchEngine =
    c.engine === "meilisearch" || c.engine === "typesense" ? c.engine : "postgres";
  const host = c.host?.trim() || null;
  return {
    // A remote engine without a host is a misconfiguration, not a reason to
    // break search: silently fall back rather than 500 the storefront.
    engine: engine !== "postgres" && !host ? "postgres" : engine,
    host,
    indexName: c.indexName?.trim() || null,
    timeoutMs: Math.min(5_000, Math.max(50, Math.trunc(c.timeoutMs))),
    failureThreshold: Math.min(100, Math.max(1, Math.trunc(c.failureThreshold))),
    cooldownSeconds: Math.min(3_600, Math.max(5, Math.trunc(c.cooldownSeconds))),
  };
}

/* ------------------------------------------------------------ circuit breaker */

export type BreakerState = {
  consecutiveFailures: number;
  openedAt: number | null;
  lastFailureCode: string | null;
};

export const FRESH_BREAKER: BreakerState = {
  consecutiveFailures: 0,
  openedAt: null,
  lastFailureCode: null,
};

export type BreakerDecision = {
  /** `probe` means one request is allowed through to test recovery. */
  action: "closed" | "open" | "probe";
  engine: SearchEngine;
  health: BackendHealth;
  reason: string | null;
};

/**
 * Decides which engine serves this request. Half-open probing matters: without
 * it a single blip would pin every merchant to Postgres until someone noticed
 * and clicked something.
 */
export function decideEngine(
  config: BackendConfig,
  breaker: BreakerState,
  now = Date.now(),
): BreakerDecision {
  if (config.engine === "postgres") {
    return { action: "closed", engine: "postgres", health: "healthy", reason: null };
  }
  if (breaker.openedAt === null) {
    const health: BackendHealth = breaker.consecutiveFailures > 0 ? "degraded" : "healthy";
    return { action: "closed", engine: config.engine, health, reason: null };
  }
  const elapsed = now - breaker.openedAt;
  if (elapsed >= config.cooldownSeconds * 1000) {
    return { action: "probe", engine: config.engine, health: "degraded", reason: "cooldown_elapsed" };
  }
  return {
    action: "open",
    engine: "postgres",
    health: "down",
    reason: breaker.lastFailureCode ?? "breaker_open",
  };
}

export function recordFailure(
  config: BackendConfig,
  breaker: BreakerState,
  code: string,
  now = Date.now(),
): BreakerState {
  const consecutiveFailures = breaker.consecutiveFailures + 1;
  const trips = consecutiveFailures >= config.failureThreshold;
  return {
    consecutiveFailures,
    // Re-opening on every failure while already open resets the cooldown clock,
    // which would starve probes forever under sustained load.
    openedAt: trips ? (breaker.openedAt ?? now) : breaker.openedAt,
    lastFailureCode: code,
  };
}

export function recordSuccess(): BreakerState {
  return FRESH_BREAKER;
}

/* ---------------------------------------------------------------- query shape */

/**
 * Engine-neutral query. Both remote adapters and the FTS RPC are fed from this
 * single shape, so a merchant switching engines cannot change what a filter
 * means — only how fast the answer arrives.
 */
export type NeutralQuery = {
  term: string;
  filters: Record<string, string | number | boolean | null>;
  sort: "relevance" | "price_asc" | "price_desc" | "newest";
  limit: number;
  offset: number;
};

export function normalizeQuery(input: Partial<NeutralQuery>): NeutralQuery {
  const term = (input.term ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, 120);
  return {
    term,
    filters: input.filters ?? {},
    sort: input.sort ?? "relevance",
    limit: Math.min(60, Math.max(1, Math.trunc(input.limit ?? 24))),
    offset: Math.min(10_000, Math.max(0, Math.trunc(input.offset ?? 0))),
  };
}

/**
 * Filters are rendered as an engine expression, so anything user-supplied has
 * to be quoted rather than concatenated. Meilisearch and Typesense both take
 * expression strings; an unescaped quote there is an injection, exactly like
 * SQL.
 */
export function toFilterExpression(engine: SearchEngine, filters: NeutralQuery["filters"]) {
  const parts: string[] = [];
  for (const [rawKey, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "") continue;
    const key = rawKey.replace(/[^a-z0-9_]/gi, "");
    if (!key) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key} = ${value}`);
      continue;
    }
    const safe = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').slice(0, 120);
    parts.push(`${key} = "${safe}"`);
  }
  return parts.join(engine === "typesense" ? " && " : " AND ");
}

export function sortExpression(engine: SearchEngine, sort: NeutralQuery["sort"]): string[] {
  if (sort === "relevance") return engine === "typesense" ? ["_text_match:desc"] : [];
  const field = sort === "newest" ? "created_at" : "price_minor";
  const dir = sort === "price_asc" ? "asc" : "desc";
  return [engine === "typesense" ? `${field}:${dir}` : `${field}:${dir}`];
}

/* --------------------------------------------------------------- index sync */

export type IndexOp = "upsert" | "delete";

/**
 * Collapses a burst of edits into the final intent per document. Bulk price
 * updates otherwise push the same product a hundred times, and a delete that
 * arrives before an earlier upsert is applied would resurrect the row.
 */
export function coalesceIndexOps(
  ops: Array<{ documentId: string; op: IndexOp; seq: number }>,
): Array<{ documentId: string; op: IndexOp }> {
  const last = new Map<string, { op: IndexOp; seq: number }>();
  for (const item of ops) {
    const prev = last.get(item.documentId);
    if (!prev || item.seq >= prev.seq) last.set(item.documentId, { op: item.op, seq: item.seq });
  }
  return [...last.entries()].map(([documentId, v]) => ({ documentId, op: v.op }));
}

/** Merchant-facing explanation; no cluster internals leak to the desk. */
export const SEARCH_MESSAGES: Record<string, { en: string; bn: string }> = {
  healthy: {
    en: "Fast search is running normally.",
    bn: "দ্রুত সার্চ স্বাভাবিকভাবে চলছে।",
  },
  degraded: {
    en: "Fast search is slow. Some searches use the built-in engine instead.",
    bn: "দ্রুত সার্চ ধীর চলছে। কিছু সার্চ বিল্ট-ইন ইঞ্জিন ব্যবহার করছে।",
  },
  down: {
    en: "Fast search is unavailable. Your store is still fully searchable using the built-in engine.",
    bn: "দ্রুত সার্চ বন্ধ আছে। আপনার দোকানে সার্চ এখনও বিল্ট-ইন ইঞ্জিন দিয়ে কাজ করছে।",
  },
};

export function explainHealth(health: BackendHealth, lang: "en" | "bn" = "en") {
  return (SEARCH_MESSAGES[health] ?? SEARCH_MESSAGES["healthy"]!)[lang];
}
