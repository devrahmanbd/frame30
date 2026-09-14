/**
 * Pluggable search backend service layer — §4.4.
 *
 * A merchant can point search at Meilisearch or Typesense for speed, but the
 * storefront must never go dark because that cluster did. So every remote call
 * here is wrapped three ways:
 *
 *  - a hard per-request timeout (an AbortController, not a promise race, so the
 *    socket actually closes),
 *  - a persisted circuit breaker with half-open probing, so a dead cluster is
 *    bypassed after N failures and re-tested once the cooldown elapses,
 *  - an automatic fall back to the Postgres FTS path, which is always correct
 *    and merely slower.
 *
 * Index writes never happen inline on a request; they are coalesced and pushed
 * through the durable job queue.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  coalesceIndexOps,
  decideEngine,
  explainHealth,
  normalizeBackend,
  normalizeQuery,
  recordFailure,
  recordSuccess,
  sortExpression,
  toFilterExpression,
  type BackendConfig,
  type BackendHealth,
  type BreakerState,
  type IndexOp,
  type NeutralQuery,
  type SearchEngine,
} from "./search-backend";
import { unsealSecret, sealSecret } from "./webhook-secret.server";
import { captureError, incr, log, observe, setGauge } from "./observability.server";
import { enqueueJob } from "./job-queue.server";

type Client = SupabaseClient<Database>;
type Row = Record<string, unknown>;

export class SearchBackendError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SearchBackendError";
  }
}

async function admin(): Promise<Client> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Client;
}

function table(client: Client, name: string) {
  return (client as unknown as { from: (t: string) => any }).from(name);
}

/* ------------------------------------------------------------------- config */

export type StoredBackend = {
  config: BackendConfig;
  breaker: BreakerState;
  apiKeySealed: string | null;
  lastIndexedAt: string | null;
  documentsIndexed: number;
};

export async function loadBackend(merchantId: string, client?: Client): Promise<StoredBackend> {
  const db = client ?? (await admin());
  const { data } = await table(db, "search_backends").select("*").eq("merchant_id", merchantId).maybeSingle();
  const row = (data ?? {}) as Row;
  return {
    config: normalizeBackend({
      engine: row["engine"] as SearchEngine,
      host: (row["host"] as string | null) ?? null,
      indexName: (row["index_name"] as string | null) ?? null,
      timeoutMs: (row["timeout_ms"] as number) ?? undefined,
      failureThreshold: (row["failure_threshold"] as number) ?? undefined,
      cooldownSeconds: (row["cooldown_seconds"] as number) ?? undefined,
    }),
    breaker: {
      consecutiveFailures: (row["consecutive_failures"] as number) ?? 0,
      openedAt: row["breaker_opened_at"] ? Date.parse(row["breaker_opened_at"] as string) : null,
      lastFailureCode: (row["last_failure_code"] as string | null) ?? null,
    },
    apiKeySealed: (row["api_key_sealed"] as string | null) ?? null,
    lastIndexedAt: (row["last_indexed_at"] as string | null) ?? null,
    documentsIndexed: (row["documents_indexed"] as number) ?? 0,
  };
}

export type SaveBackendInput = Partial<BackendConfig> & { apiKey?: string | null };

/** Writes config. The API key is sealed at rest and never returned to a client. */
export async function saveBackend(merchantId: string, input: SaveBackendInput, client?: Client) {
  const db = client ?? (await admin());
  const config = normalizeBackend(input);
  const patch: Row = {
    merchant_id: merchantId,
    engine: config.engine,
    host: config.host,
    index_name: config.indexName,
    timeout_ms: config.timeoutMs,
    failure_threshold: config.failureThreshold,
    cooldown_seconds: config.cooldownSeconds,
    // Changing config always resets the breaker; the old failures described a
    // cluster the merchant may have just replaced.
    consecutive_failures: 0,
    breaker_opened_at: null,
    last_failure_code: null,
    updated_at: new Date().toISOString(),
  };
  if (input.apiKey) patch["api_key_sealed"] = await sealSecret(input.apiKey);
  if (input.apiKey === null) patch["api_key_sealed"] = null;

  const { error } = await table(db, "search_backends").upsert(patch, { onConflict: "merchant_id" });
  if (error) throw new SearchBackendError("search_backend_save_failed");
  log("info", "search.backend_saved", { engine: config.engine });
  return config;
}

async function persistBreaker(merchantId: string, breaker: BreakerState, client: Client) {
  await table(client, "search_backends")
    .update({
      consecutive_failures: breaker.consecutiveFailures,
      breaker_opened_at: breaker.openedAt ? new Date(breaker.openedAt).toISOString() : null,
      last_failure_code: breaker.lastFailureCode,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId);
}

/* -------------------------------------------------------------------- query */

export type SearchHit = { id: string; [key: string]: unknown };

export type BackendSearchResult = {
  hits: SearchHit[];
  total: number;
  engine: SearchEngine;
  health: BackendHealth;
  tookMs: number;
  fellBack: boolean;
  explanation: string;
};

/**
 * Runs a neutral query against whichever engine the breaker allows, falling
 * back to the caller's Postgres FTS path on any remote failure.
 */
export async function searchWithBackend(
  merchantId: string,
  rawQuery: Partial<NeutralQuery>,
  fallback: (query: NeutralQuery) => Promise<{ hits: SearchHit[]; total: number }>,
  opts: { lang?: "en" | "bn"; client?: Client } = {},
): Promise<BackendSearchResult> {
  const db = opts.client ?? (await admin());
  const query = normalizeQuery(rawQuery);
  const stored = await loadBackend(merchantId, db);
  const decision = decideEngine(stored.config, stored.breaker);
  const started = Date.now();

  if (decision.action === "open" || stored.config.engine === "postgres") {
    const result = await fallback(query);
    incr("framique_search_total", { engine: "postgres", outcome: decision.action === "open" ? "breaker_open" : "native" });
    return {
      ...result,
      engine: "postgres",
      health: decision.health,
      tookMs: Date.now() - started,
      fellBack: decision.action === "open",
      explanation: explainHealth(decision.health, opts.lang ?? "en"),
    };
  }

  try {
    const apiKey = stored.apiKeySealed ? await unsealSecret(stored.apiKeySealed) : null;
    const remote = await queryRemote(stored.config, apiKey, query);
    if (stored.breaker.consecutiveFailures > 0 || stored.breaker.openedAt !== null) {
      await persistBreaker(merchantId, recordSuccess(), db);
      incr("framique_search_breaker_recoveries_total", { engine: stored.config.engine });
    }
    setGauge("framique_search_breaker_open", 0, { merchant: merchantId, engine: stored.config.engine });
    observe("framique_search_ms", Date.now() - started, { engine: stored.config.engine });
    incr("framique_search_total", { engine: stored.config.engine, outcome: "ok" });
    return {
      ...remote,
      engine: stored.config.engine,
      health: "healthy",
      tookMs: Date.now() - started,
      fellBack: false,
      explanation: explainHealth("healthy", opts.lang ?? "en"),
    };
  } catch (error) {
    const code = error instanceof SearchBackendError ? error.code : "search_upstream_error";
    const nextBreaker = recordFailure(stored.config, stored.breaker, code);
    await persistBreaker(merchantId, nextBreaker, db);
    incr("framique_search_total", { engine: stored.config.engine, outcome: "fallback" });
    log("warn", "search.fallback", { engine: stored.config.engine, code });
    // A trip is the event on-call cares about; failures alone are noise.
    setGauge("framique_search_breaker_open", nextBreaker.openedAt ? 1 : 0, {
      merchant: merchantId,
      engine: stored.config.engine,
    });
    if (nextBreaker.openedAt && !stored.breaker.openedAt) {
      incr("framique_search_breaker_trips_total", { engine: stored.config.engine, code });
      await captureError(new Error(`search breaker opened: ${code}`), {
        scope: "search.breaker",
        engine: stored.config.engine,
        merchant_id: merchantId,
      });
    }

    const result = await fallback(query);
    return {
      ...result,
      engine: "postgres",
      health: nextBreaker.openedAt ? "down" : "degraded",
      tookMs: Date.now() - started,
      fellBack: true,
      explanation: explainHealth(nextBreaker.openedAt ? "down" : "degraded", opts.lang ?? "en"),
    };
  }
}

async function queryRemote(config: BackendConfig, apiKey: string | null, query: NeutralQuery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const filter = toFilterExpression(config.engine, query.filters);
    const sort = sortExpression(config.engine, query.sort);
    const index = config.indexName ?? "products";
    const base = (config.host ?? "").replace(/\/+$/, "");

    const url =
      config.engine === "meilisearch"
        ? `${base}/indexes/${encodeURIComponent(index)}/search`
        : `${base}/collections/${encodeURIComponent(index)}/documents/search`;

    const init: RequestInit =
      config.engine === "meilisearch"
        ? {
            method: "POST",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({
              q: query.term,
              limit: query.limit,
              offset: query.offset,
              ...(filter ? { filter } : {}),
              ...(sort.length ? { sort } : {}),
            }),
          }
        : {
            method: "GET",
            signal: controller.signal,
            headers: apiKey ? { "x-typesense-api-key": apiKey } : {},
          };

    const finalUrl =
      config.engine === "typesense"
        ? `${url}?${new URLSearchParams({
            q: query.term || "*",
            query_by: "title,description,sku",
            per_page: String(query.limit),
            page: String(Math.floor(query.offset / query.limit) + 1),
            ...(filter ? { filter_by: filter } : {}),
            ...(sort.length ? { sort_by: sort.join(",") } : {}),
          }).toString()}`
        : url;

    const res = await fetch(finalUrl, init);
    if (!res.ok) throw new SearchBackendError(`search_http_${res.status}`);
    const body = (await res.json()) as Row;

    if (config.engine === "meilisearch") {
      const hits = ((body["hits"] as SearchHit[]) ?? []).slice(0, query.limit);
      return { hits, total: (body["estimatedTotalHits"] as number) ?? hits.length };
    }
    const rawHits = (body["hits"] as Array<{ document: SearchHit }>) ?? [];
    return { hits: rawHits.map((h) => h.document), total: (body["found"] as number) ?? rawHits.length };
  } catch (error) {
    if (error instanceof SearchBackendError) throw error;
    if ((error as { name?: string }).name === "AbortError") throw new SearchBackendError("search_timeout");
    throw new SearchBackendError("search_unreachable");
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------- index sync */

/**
 * Queues index work instead of writing inline. A bulk price edit that touches
 * 5,000 products must not turn into 5,000 blocking HTTP calls on the request
 * that saved it.
 */
export async function queueIndexOps(
  merchantId: string,
  ops: Array<{ documentId: string; op: IndexOp; seq?: number }>,
  client?: Client,
) {
  if (ops.length === 0) return { queued: 0 };
  const db = client ?? (await admin());
  const coalesced = coalesceIndexOps(ops.map((o, i) => ({ ...o, seq: o.seq ?? i })));
  await enqueueJob(
    {
      queue: "search-index",
      name: "search.sync",
      merchantId,
      payload: { ops: coalesced },
      idempotencyKey: `idx:${merchantId}:${Date.now()}`,
    },
    db,
  );
  incr("framique_search_index_ops_total", {}, coalesced.length);
  return { queued: coalesced.length };
}

/** Handler body for the `search.sync` job. Pushes documents to the cluster. */
export async function applyIndexOps(
  merchantId: string,
  ops: Array<{ documentId: string; op: IndexOp }>,
  client?: Client,
) {
  const db = client ?? (await admin());
  const stored = await loadBackend(merchantId, db);
  if (stored.config.engine === "postgres") return { skipped: true, applied: 0 };

  const apiKey = stored.apiKeySealed ? await unsealSecret(stored.apiKeySealed) : null;
  const base = (stored.config.host ?? "").replace(/\/+$/, "");
  const index = stored.config.indexName ?? "products";
  const upserts = ops.filter((o) => o.op === "upsert").map((o) => o.documentId);
  const deletes = ops.filter((o) => o.op === "delete").map((o) => o.documentId);

  let applied = 0;
  if (upserts.length) {
    const { data } = await table(db, "products").select("*").in("id", upserts).limit(1000);
    const docs = (data ?? []) as Row[];
    if (docs.length) {
      const url =
        stored.config.engine === "meilisearch"
          ? `${base}/indexes/${encodeURIComponent(index)}/documents`
          : `${base}/collections/${encodeURIComponent(index)}/documents/import?action=upsert`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": stored.config.engine === "meilisearch" ? "application/json" : "text/plain",
          ...(apiKey
            ? stored.config.engine === "meilisearch"
              ? { authorization: `Bearer ${apiKey}` }
              : { "x-typesense-api-key": apiKey }
            : {}),
        },
        body:
          stored.config.engine === "meilisearch"
            ? JSON.stringify(docs)
            : docs.map((d) => JSON.stringify(d)).join("\n"),
      });
      if (!res.ok) throw new SearchBackendError(`search_index_http_${res.status}`);
      applied += docs.length;
    }
  }

  for (const id of deletes) {
    const url =
      stored.config.engine === "meilisearch"
        ? `${base}/indexes/${encodeURIComponent(index)}/documents/${encodeURIComponent(id)}`
        : `${base}/collections/${encodeURIComponent(index)}/documents/${encodeURIComponent(id)}`;
    await fetch(url, {
      method: "DELETE",
      headers: apiKey
        ? stored.config.engine === "meilisearch"
          ? { authorization: `Bearer ${apiKey}` }
          : { "x-typesense-api-key": apiKey }
        : {},
    });
    applied += 1;
  }

  await table(db, "search_backends")
    .update({
      last_indexed_at: new Date().toISOString(),
      documents_indexed: stored.documentsIndexed + applied,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId);

  return { skipped: false, applied };
}
