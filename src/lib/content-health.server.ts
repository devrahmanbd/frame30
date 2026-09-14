/**
 * Phase 6 — content health server runtime.
 *
 * This module owns everything the pure domain in `content-health.ts` cannot do
 * by itself: loading the tenant's real content, normalising it into
 * `ContentNode`s, verifying external links over the network under a strict
 * budget, persisting an auditable run, reconciling findings against what the
 * merchant already triaged, and pruning history.
 *
 * Rules this file obeys, because a scan is the most expensive thing an SEO
 * desk can trigger:
 *
 *  - Storefront requests never import it. It is admin/cron only.
 *  - One scan per tenant at a time; a second request is refused, not queued.
 *  - Outbound HTTP is capped per run, per host and by wall clock, with
 *    exponential backoff + full jitter and a hard per-request timeout.
 *  - Findings are upserted on (merchant_id, code, fingerprint) so an
 *    "ignored" verdict survives every later rescan.
 *  - Every terminal state — ok, partial, failed — writes a row. A crash that
 *    leaves `running` behind is treated as stale after 15 minutes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CRAWL_POLICY,
  FINDING_SEVERITY,
  analyseContentHealth,
  backoffMs,
  classifyHttpStatus,
  fingerprintOf,
  healthScore,
  isRetryable,
  parseRetryAfter,
  schemaReport,
  suggestInternalLinks,
  type ContentEntityType,
  type ContentHealthReport,
  type ContentNode,
  type Finding,
  type FindingCode,
  type LinkSuggestion,
  type RedirectRow,
} from "./content-health";
import { buildPermalink, type PermalinkSettings } from "./permalink";
import { captureError, incr, log, observe, withSpan } from "./observability.server";

type Client = SupabaseClient<Database>;
type LooseClient = Client & { from: (table: string) => any };

export class ContentHealthError extends Error {
  constructor(
    readonly code:
      | "merchant_not_found"
      | "scan_busy"
      | "read_failed"
      | "persist_failed"
      | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "ContentHealthError";
  }
}

/** A `running` row older than this is a crashed run, not a live one. */
const STALE_RUN_MS = 15 * 60_000;
/** Rows written per insert batch. Keeps every statement inside the DB timeout. */
const INSERT_CHUNK = 500;

const nowIso = () => new Date().toISOString();
const safeMessage = (err: unknown) =>
  err instanceof Error ? err.message.slice(0, 240) : "Unknown content-health error";

function chunk<T>(rows: T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/* ==========================================================================
 * Loading — tenant content into ContentNodes
 * ========================================================================== */

/** Rendered-text word count. Markup, scripts and entities never count as words. */
export function countWords(markup: string): number {
  const text = String(markup ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
  if (!text) return 0;
  // Bangla and Latin both split on whitespace; CJK would not, and this product
  // does not sell into a CJK market, so whitespace splitting is honest here.
  return text.split(" ").filter(Boolean).length;
}

/**
 * Editors paste absolute storefront URLs as often as they type relative ones.
 * The graph resolves store-relative permalinks, so the loader rewrites the
 * `/store/<slug>` prefix out of hrefs before analysis. Doing it here — once,
 * on load — keeps the pure domain free of tenant routing knowledge.
 */
export function normaliseBodyLinks(body: string, storeSlug: string, origins: string[]): string {
  let out = String(body ?? "");
  for (const origin of origins) {
    if (!origin) continue;
    out = out.split(origin).join("");
  }
  if (storeSlug) {
    const prefix = `/store/${storeSlug}`;
    out = out.split(`${prefix}/`).join("/");
    out = out.split(`"${prefix}"`).join('"/"');
    out = out.split(`'${prefix}'`).join("'/'");
  }
  return out;
}

type SeoMetaRow = {
  entity_type: string;
  entity_id: string | null;
  focus_keyword: string | null;
  secondary_keywords: string[] | null;
  robots_index: boolean;
  sitemap_exclude: boolean;
};

export type LoadedContent = {
  merchant: { id: string; slug: string; name: string };
  nodes: ContentNode[];
  redirects: RedirectRow[];
  truncated: boolean;
  permalinks: PermalinkSettings;
};

/**
 * Everything scannable the tenant owns, already normalised. Each kind is one
 * bounded query with a tenant-first index behind it — never a per-row fetch.
 */
export async function loadContentGraph(db: Client, merchantId: string): Promise<LoadedContent> {
  const loose = db as LooseClient;
  const limit = CRAWL_POLICY.maxNodesPerKind;

  const { data: merchant, error: merchantError } = await db
    .from("merchants")
    .select("id, slug, name")
    .eq("id", merchantId)
    .maybeSingle();
  if (merchantError) throw new ContentHealthError("read_failed", merchantError.message);
  if (!merchant) throw new ContentHealthError("merchant_not_found", "Store not found.");

  const { permalinkSettingsFor } = await import("./permalink.server");
  const permalinks = await permalinkSettingsFor(db, merchantId);

  const [articles, pages, products, collections, redirects, metas, domains] = await Promise.all([
    loose
      .from("articles")
      .select("id, title, title_en, slug, body, excerpt, tags, status, published_at, updated_at, robots, cover_image_url, category_id")
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit + 1),
    loose
      .from("storefront_pages")
      .select("id, title, slug, body_markdown, excerpt, is_published, published_at, updated_at, robots, cover_image_url")
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit + 1),
    loose
      .from("products")
      .select("id, title, slug, description, tags, status, image_url, updated_at, created_at")
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit + 1),
    loose
      .from("collections")
      .select("id, name, slug, description, is_published, image_url, updated_at, created_at")
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit + 1),
    loose
      .from("url_redirects")
      .select("from_path, to_path, status_code")
      .eq("merchant_id", merchantId)
      .limit(20_000),
    loose
      .from("seo_meta")
      .select("entity_type, entity_id, focus_keyword, secondary_keywords, robots_index, sitemap_exclude")
      .eq("merchant_id", merchantId)
      .limit(20_000),
    loose
      .from("custom_domains")
      .select("hostname, status")
      .eq("merchant_id", merchantId)
      .limit(20),
  ]);

  for (const result of [articles, pages, products, collections, redirects, metas]) {
    if (result?.error) throw new ContentHealthError("read_failed", result.error.message);
  }

  const metaIndex = new Map<string, SeoMetaRow>();
  for (const row of (metas?.data ?? []) as SeoMetaRow[]) {
    metaIndex.set(`${row.entity_type}:${row.entity_id ?? "-"}`, row);
  }

  const origins: string[] = [];
  for (const row of ((domains as { data?: { hostname?: string }[] })?.data ?? [])) {
    if (row?.hostname) origins.push(`https://${row.hostname}`, `http://${row.hostname}`);
  }

  let truncated = false;
  const take = <T>(rows: T[] | null | undefined): T[] => {
    const list = rows ?? [];
    if (list.length > limit) {
      truncated = true;
      return list.slice(0, limit);
    }
    return list;
  };

  const nodes: ContentNode[] = [];
  const push = (node: ContentNode) => {
    node.body = normaliseBodyLinks(node.body, merchant.slug, origins);
    nodes.push(node);
  };

  const metaFor = (type: string, id: string) => metaIndex.get(`${type}:${id}`);
  const indexable = (type: string, id: string, fallback: boolean) => {
    const meta = metaFor(type, id);
    if (!meta) return fallback;
    return fallback && meta.robots_index !== false && meta.sitemap_exclude !== true;
  };

  for (const row of take((articles?.data ?? []) as any[])) {
    const meta = metaFor("article", row.id);
    const body = `${row.excerpt ?? ""}\n${row.body ?? ""}`;
    push({
      type: "article",
      id: row.id,
      slug: row.slug,
      path: buildPermalink(permalinks, {
        kind: "article",
        slug: row.slug,
        date: row.published_at ?? null,
        category: null,
      }),
      title: row.title ?? "",
      titleEn: row.title_en ?? null,
      body,
      wordCount: countWords(row.body ?? ""),
      focusKeyword: meta?.focus_keyword ?? "",
      secondaryKeywords: meta?.secondary_keywords ?? [],
      tags: Array.isArray(row.tags) ? row.tags : [],
      updatedAt: row.updated_at ?? nowIso(),
      publishedAt: row.status === "published" ? (row.published_at ?? null) : null,
      indexable: indexable("article", row.id, row.status === "published" && !String(row.robots ?? "").startsWith("noindex")),
      hasImage: Boolean(row.cover_image_url),
      hasAuthor: true,
      hasDescription: Boolean(row.excerpt),
    });
  }

  for (const row of take((pages?.data ?? []) as any[])) {
    const meta = metaFor("page", row.id);
    push({
      type: "page",
      id: row.id,
      slug: row.slug,
      path: buildPermalink(permalinks, { kind: "page", slug: row.slug, date: null, category: null }),
      title: row.title ?? "",
      body: `${row.excerpt ?? ""}\n${row.body_markdown ?? ""}`,
      wordCount: countWords(row.body_markdown ?? ""),
      focusKeyword: meta?.focus_keyword ?? "",
      secondaryKeywords: meta?.secondary_keywords ?? [],
      tags: [],
      updatedAt: row.updated_at ?? nowIso(),
      publishedAt: row.is_published ? (row.published_at ?? row.updated_at ?? null) : null,
      indexable: indexable("page", row.id, Boolean(row.is_published) && !String(row.robots ?? "").startsWith("noindex")),
      hasImage: Boolean(row.cover_image_url),
      hasDescription: Boolean(row.excerpt),
    });
  }

  for (const row of take((products?.data ?? []) as any[])) {
    const meta = metaFor("product", row.id);
    push({
      type: "product",
      id: row.id,
      slug: row.slug,
      path: buildPermalink(permalinks, { kind: "product", slug: row.slug, date: null, category: null }),
      title: row.title ?? "",
      body: row.description ?? "",
      wordCount: countWords(row.description ?? ""),
      focusKeyword: meta?.focus_keyword ?? "",
      secondaryKeywords: meta?.secondary_keywords ?? [],
      tags: Array.isArray(row.tags) ? row.tags : [],
      updatedAt: row.updated_at ?? nowIso(),
      publishedAt: row.status === "active" ? (row.created_at ?? row.updated_at ?? null) : null,
      indexable: indexable("product", row.id, row.status === "active"),
      hasImage: Boolean(row.image_url),
      hasDescription: Boolean(row.description),
      // Price/SKU/availability come from variants; the storefront only emits a
      // complete Offer when at least one variant exists, and the schema audit
      // must not claim otherwise, so they stay unset unless proven below.
    });
  }

  for (const row of take((collections?.data ?? []) as any[])) {
    const meta = metaFor("collection", row.id);
    push({
      type: "collection",
      id: row.id,
      slug: row.slug,
      path: buildPermalink(permalinks, { kind: "collection", slug: row.slug, date: null, category: null }),
      title: row.name ?? "",
      body: row.description ?? "",
      wordCount: countWords(row.description ?? ""),
      focusKeyword: meta?.focus_keyword ?? "",
      secondaryKeywords: meta?.secondary_keywords ?? [],
      tags: [],
      updatedAt: row.updated_at ?? nowIso(),
      publishedAt: row.is_published === false ? null : (row.created_at ?? row.updated_at ?? null),
      indexable: indexable("collection", row.id, row.is_published !== false),
      hasImage: Boolean(row.image_url),
      hasDescription: Boolean(row.description),
    });
  }

  // Variant-derived Offer completeness in one extra bounded query, not N.
  const productIds = nodes.filter((n) => n.type === "product").map((n) => n.id);
  if (productIds.length) {
    const { data: variants } = await loose
      .from("product_variants")
      .select("product_id, sku, price_amount_minor_int, stock_quantity")
      .in("product_id", productIds.slice(0, 2_000))
      .limit(20_000);
    const byProduct = new Map<string, { sku: boolean; price: boolean; stock: boolean }>();
    for (const v of ((variants ?? []) as any[])) {
      const prev = byProduct.get(v.product_id) ?? { sku: false, price: false, stock: false };
      byProduct.set(v.product_id, {
        sku: prev.sku || Boolean(v.sku),
        price: prev.price || Number(v.price_amount_minor_int ?? 0) > 0,
        stock: prev.stock || Number(v.stock_quantity ?? 0) > 0,
      });
    }
    for (const node of nodes) {
      if (node.type !== "product") continue;
      const info = byProduct.get(node.id);
      node.hasSku = Boolean(info?.sku);
      node.hasPrice = Boolean(info?.price);
      node.hasAvailability = Boolean(info);
    }
  }

  const redirectRows: RedirectRow[] = ((redirects?.data ?? []) as any[]).map((r) => ({
    from: r.from_path,
    to: r.to_path ?? null,
    status: Number(r.status_code ?? 301),
  }));

  return {
    merchant: { id: merchant.id, slug: merchant.slug, name: merchant.name },
    nodes,
    redirects: redirectRows,
    truncated,
    permalinks,
  };
}

/* ==========================================================================
 * External link verification — the only outbound traffic in this phase
 * ========================================================================== */

export type ExternalVerdict = {
  url: string;
  status: "ok" | "dead" | "blocked" | "unknown";
  httpStatus: number | null;
  attempts: number;
  reason: string;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Checks one external URL under the crawl policy: HEAD first (cheap for the
 * other site), GET as a fallback for servers that reject HEAD, retries only on
 * classes that can plausibly change, and a hard timeout on every attempt.
 */
export async function checkExternalUrl(
  url: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; maxAttempts?: number; deadline?: number } = {},
): Promise<ExternalVerdict> {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CRAWL_POLICY.externalTimeoutMs;
  const maxAttempts = opts.maxAttempts ?? CRAWL_POLICY.maxAttempts;
  let attempts = 0;
  let last: ExternalVerdict = { url, status: "unknown", httpStatus: null, attempts: 0, reason: "not_attempted" };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (opts.deadline && Date.now() > opts.deadline) {
      return { ...last, attempts, reason: "deadline" };
    }
    attempts += 1;
    const method = attempt === 0 ? "HEAD" : "GET";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "FramiqueLinkCheck/1.0 (+content-health)" },
      });
      const outcome = classifyHttpStatus(
        response.status,
        response.headers?.get?.("location") ?? null,
        response.headers?.get?.("retry-after") ?? null,
      );
      last = {
        url,
        status:
          outcome.kind === "ok"
            ? "ok"
            : outcome.kind === "dead"
              ? "dead"
              : outcome.kind === "blocked"
                ? "blocked"
                : "unknown",
        httpStatus: response.status,
        attempts,
        reason: outcome.kind,
      };
      // A 405/501 on HEAD is the server refusing the method, not a dead link.
      if (last.status === "ok") return last;
      if ((response.status === 405 || response.status === 501) && attempt === 0) continue;
      if (!isRetryable(outcome)) return last;
      const retryAfter = parseRetryAfter(response.headers?.get?.("retry-after") ?? null);
      await sleep(backoffMs(attempt, retryAfter));
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      last = {
        url,
        status: "unknown",
        httpStatus: null,
        attempts,
        reason: aborted ? "timeout" : "network",
      };
      await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

/**
 * Verifies a batch of external URLs with bounded concurrency and a per-host
 * politeness gap. We are a guest on other people's servers: a merchant with
 * 400 links to one blog must not look like a scraper.
 */
export async function verifyExternalLinks(
  urls: string[],
  opts: { deadline?: number; fetchImpl?: typeof fetch; max?: number } = {},
): Promise<ExternalVerdict[]> {
  const max = Math.min(opts.max ?? CRAWL_POLICY.maxExternalChecksPerRun, urls.length);
  const queue = urls.slice(0, max);
  const verdicts: ExternalVerdict[] = [];
  const hostNextAt = new Map<string, number>();
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= queue.length) return;
      const url = queue[index];
      if (!url) return;
      if (opts.deadline && Date.now() > opts.deadline) return;
      let host = "";
      try {
        host = new URL(url).host.toLowerCase();
      } catch {
        verdicts.push({ url, status: "unknown", httpStatus: null, attempts: 0, reason: "unparseable" });
        continue;
      }
      const readyAt = hostNextAt.get(host) ?? 0;
      const wait = readyAt - Date.now();
      if (wait > 0) await sleep(Math.min(wait, CRAWL_POLICY.perHostDelayMs));
      hostNextAt.set(host, Date.now() + CRAWL_POLICY.perHostDelayMs);
      const verdict = await checkExternalUrl(url, {
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        ...(opts.deadline ? { deadline: opts.deadline } : {}),
      });
      incr("framique_content_external_checks_total", { outcome: verdict.status });
      verdicts.push(verdict);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CRAWL_POLICY.externalConcurrency, Math.max(queue.length, 1)) }, worker),
  );
  return verdicts;
}

/** Turns external verdicts into findings attributed to the linking pages. */
export function externalFindings(
  verdicts: ExternalVerdict[],
  edges: ContentHealthReport["edges"],
  nodes: ContentNode[],
): Finding[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byUrl = new Map(verdicts.map((v) => [v.url, v]));
  const out: Finding[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (edge.kind !== "external") continue;
    const verdict = byUrl.get(edge.href);
    if (!verdict || verdict.status === "ok" || verdict.status === "unknown") continue;
    const code: FindingCode = verdict.status === "dead" ? "link.external_dead" : "link.external_blocked";
    const fingerprint = fingerprintOf(code, [edge.sourceId, edge.href]);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const node = byId.get(edge.sourceId);
    out.push({
      code,
      severity: FINDING_SEVERITY[code],
      entityType: edge.sourceType,
      entityId: edge.sourceId,
      entityTitle: node?.title ?? "",
      entityPath: edge.sourcePath,
      target: edge.href,
      fingerprint,
      message:
        verdict.status === "dead"
          ? `Links out to ${edge.href}, which answered ${verdict.httpStatus ?? "an error"}. Replace or remove it.`
          : `${edge.href} refused an automated check (${verdict.httpStatus ?? verdict.reason}). Verify it by hand.`,
      messageBn:
        verdict.status === "dead"
          ? `${edge.href} লিংকটি কাজ করছে না (${verdict.httpStatus ?? "ত্রুটি"})। বদলান বা সরান।`
          : `${edge.href} স্বয়ংক্রিয় চেক আটকে দিয়েছে (${verdict.httpStatus ?? verdict.reason})। নিজে দেখে নিন।`,
      detail: { httpStatus: verdict.httpStatus, attempts: verdict.attempts, reason: verdict.reason },
    });
  }
  return out;
}

/* ==========================================================================
 * Persistence
 * ========================================================================== */

type AdminClient = Client;

async function adminClient(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

/**
 * Upserts this run's findings and closes the ones that no longer reproduce.
 *
 * The merchant's own state wins: an `ignored` finding stays ignored when it
 * reappears, and is never auto-resolved out from under them — it is simply not
 * counted as open. Anything open that this run did not see becomes `resolved`,
 * which is how the desk can honestly say "you fixed 12 things".
 */
export async function reconcileFindings(
  db: AdminClient,
  merchantId: string,
  runId: string,
  findings: Finding[],
): Promise<{ opened: number; resolved: number; reopened: number }> {
  const loose = db as LooseClient;
  const { data: existingRows, error: readError } = await loose
    .from("content_health_findings")
    .select("id, code, fingerprint, state, occurrences")
    .eq("merchant_id", merchantId)
    .limit(50_000);
  if (readError) throw new ContentHealthError("persist_failed", readError.message);

  const existing = new Map<string, { id: string; state: string; occurrences: number }>();
  for (const row of ((existingRows ?? []) as any[])) {
    existing.set(`${row.code}|${row.fingerprint}`, {
      id: row.id,
      state: row.state,
      occurrences: Number(row.occurrences ?? 1),
    });
  }

  const seenKeys = new Set<string>();
  const rows = findings.map((f) => {
    const key = `${f.code}|${f.fingerprint}`;
    seenKeys.add(key);
    const prior = existing.get(key);
    return {
      merchant_id: merchantId,
      run_id: runId,
      code: f.code,
      severity: f.severity,
      entity_type: f.entityType,
      entity_id: f.entityId,
      entity_title: f.entityTitle.slice(0, 300),
      entity_path: f.entityPath.slice(0, 500),
      target: f.target.slice(0, 500),
      fingerprint: f.fingerprint,
      detail: f.detail as never,
      // An ignored finding stays ignored; anything else this run saw is open.
      state: prior?.state === "ignored" ? "ignored" : "open",
      occurrences: (prior?.occurrences ?? 0) + 1,
      last_seen_at: nowIso(),
      resolved_at: null,
    };
  });

  let opened = 0;
  let reopened = 0;
  for (const f of findings) {
    const prior = existing.get(`${f.code}|${f.fingerprint}`);
    if (!prior) opened += 1;
    else if (prior.state === "resolved") reopened += 1;
  }

  for (const batch of chunk(rows)) {
    const { error } = await loose
      .from("content_health_findings")
      .upsert(batch, { onConflict: "merchant_id,code,fingerprint" });
    if (error) throw new ContentHealthError("persist_failed", error.message);
  }

  const staleIds = [...existing.entries()]
    .filter(([key, row]) => row.state === "open" && !seenKeys.has(key))
    .map(([, row]) => row.id);
  for (const batch of chunk(staleIds, 200)) {
    const { error } = await loose
      .from("content_health_findings")
      .update({ state: "resolved", resolved_at: nowIso() })
      .in("id", batch);
    if (error) throw new ContentHealthError("persist_failed", error.message);
  }

  return { opened, resolved: staleIds.length, reopened };
}

/** Replaces the stored link graph with this run's edges. */
export async function persistEdges(
  db: AdminClient,
  merchantId: string,
  runId: string,
  edges: ContentHealthReport["edges"],
): Promise<number> {
  const loose = db as LooseClient;
  const { error: clearError } = await loose
    .from("content_link_edges")
    .delete()
    .eq("merchant_id", merchantId)
    .neq("run_id", runId);
  if (clearError) throw new ContentHealthError("persist_failed", clearError.message);

  const rows = edges.slice(0, CRAWL_POLICY.maxEdgesPerRun).map((e) => ({
    merchant_id: merchantId,
    run_id: runId,
    source_type: e.sourceType,
    source_id: e.sourceId,
    source_path: e.sourcePath.slice(0, 500),
    anchor_text: e.anchorText.slice(0, 300),
    href: e.href.slice(0, 800),
    kind: e.kind,
    target_path: e.targetPath,
    target_type: e.targetType,
    target_id: e.targetId,
    status: e.status,
    hops: e.hops,
    nofollow: e.nofollow,
  }));
  for (const batch of chunk(rows)) {
    const { error } = await loose.from("content_link_edges").insert(batch);
    if (error) throw new ContentHealthError("persist_failed", error.message);
  }
  return rows.length;
}

/** Keeps run history bounded so the desk query stays one indexed page. */
export async function pruneRuns(db: AdminClient, merchantId: string): Promise<number> {
  const loose = db as LooseClient;
  const { data } = await loose
    .from("content_health_runs")
    .select("id")
    .eq("merchant_id", merchantId)
    .order("started_at", { ascending: false })
    .range(CRAWL_POLICY.runRetention, CRAWL_POLICY.runRetention + 200);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return 0;
  await loose.from("content_health_runs").delete().in("id", ids);
  return ids.length;
}

/* ==========================================================================
 * The scan
 * ========================================================================== */

export type ScanInput = {
  merchantId: string;
  trigger?: "cron" | "manual";
  requestedBy?: string | null;
  /** Skip outbound HTTP entirely (cron sweeps under pressure, tests). */
  checkExternal?: boolean;
  deadline?: number;
  fetchImpl?: typeof fetch;
};

export type ScanResult = {
  runId: string;
  merchantId: string;
  status: "ok" | "partial" | "failed";
  score: number;
  scanned: Record<ContentEntityType, number>;
  counts: Record<FindingCode, number>;
  bySeverity: Record<"error" | "warning" | "notice", number>;
  linksChecked: number;
  externalChecked: number;
  opened: number;
  resolved: number;
  reopened: number;
  truncated: boolean;
  durationMs: number;
};

/**
 * One tenant's full content-health scan. Always terminal: it either finishes
 * and writes ok/partial, or it writes failed with a code the desk can explain.
 */
export async function runContentHealthScan(input: ScanInput): Promise<ScanResult> {
  const started = Date.now();
  const trigger = input.trigger ?? "manual";
  const deadline = input.deadline ?? started + CRAWL_POLICY.runBudgetMs;
  const db = await adminClient();
  const loose = db as LooseClient;

  const { data: active } = await loose
    .from("content_health_runs")
    .select("id")
    .eq("merchant_id", input.merchantId)
    .eq("status", "running")
    .gte("started_at", new Date(Date.now() - STALE_RUN_MS).toISOString())
    .limit(1)
    .maybeSingle();
  if (active) throw new ContentHealthError("scan_busy", "A content scan is already running for this store.");

  const { data: run, error: createError } = await loose
    .from("content_health_runs")
    .insert({
      merchant_id: input.merchantId,
      trigger,
      status: "running",
      requested_by: input.requestedBy ?? null,
    })
    .select("id")
    .single();
  if (createError || !run) {
    throw new ContentHealthError("persist_failed", createError?.message ?? "Could not open a scan run.");
  }
  const runId = (run as { id: string }).id;

  try {
    return await withSpan(
      "content.health.scan",
      async () => {
        const loaded = await loadContentGraph(db, input.merchantId);
        const report = analyseContentHealth(loaded.nodes, loaded.redirects, {
          truncated: loaded.truncated,
        });

        let verdicts: ExternalVerdict[] = [];
        if (input.checkExternal !== false && report.externalTargets.length) {
          verdicts = await verifyExternalLinks(report.externalTargets, {
            deadline: Math.min(deadline, started + CRAWL_POLICY.runBudgetMs),
            ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
          });
        }
        const allFindings = [
          ...report.findings,
          ...externalFindings(verdicts, report.edges, loaded.nodes),
        ];

        const reconciliation = await reconcileFindings(db, input.merchantId, runId, allFindings);
        const linksChecked = await persistEdges(db, input.merchantId, runId, report.edges);

        const bySeverity = { error: 0, warning: 0, notice: 0 } as Record<
          "error" | "warning" | "notice",
          number
        >;
        for (const f of allFindings) bySeverity[f.severity] += 1;
        const counts = { ...report.counts };
        for (const f of allFindings) {
          if (f.code === "link.external_dead" || f.code === "link.external_blocked") counts[f.code] += 1;
        }

        const timedOut = Date.now() > deadline;
        const skippedExternal =
          input.checkExternal === false ||
          verdicts.length < Math.min(report.externalTargets.length, CRAWL_POLICY.maxExternalChecksPerRun);
        const status: ScanResult["status"] =
          report.truncated || timedOut || skippedExternal ? "partial" : "ok";
        const durationMs = Date.now() - started;
        const score = healthScore({ bySeverity, scanned: report.scanned });

        const { error: finishError } = await loose
          .from("content_health_runs")
          .update({
            status,
            scanned: report.scanned as never,
            finding_counts: counts as never,
            links_checked: linksChecked,
            external_checked: verdicts.length,
            findings_opened: reconciliation.opened,
            findings_resolved: reconciliation.resolved,
            truncated: report.truncated,
            duration_ms: durationMs,
            finished_at: nowIso(),
          })
          .eq("id", runId);
        if (finishError) throw new ContentHealthError("persist_failed", finishError.message);

        await pruneRuns(db, input.merchantId);

        for (const [code, count] of Object.entries(counts)) {
          if (count > 0) incr("framique_content_health_findings_total", { code }, count);
        }
        observe("framique_content_health_duration_ms", durationMs, { trigger });
        incr("framique_content_health_runs_total", { trigger, outcome: status });
        log("info", "content.health.completed", {
          merchantId: input.merchantId,
          runId,
          status,
          score,
          links: linksChecked,
          external: verdicts.length,
          durationMs,
        });

        return {
          runId,
          merchantId: input.merchantId,
          status,
          score,
          scanned: report.scanned,
          counts,
          bySeverity,
          linksChecked,
          externalChecked: verdicts.length,
          opened: reconciliation.opened,
          resolved: reconciliation.resolved,
          reopened: reconciliation.reopened,
          truncated: report.truncated,
          durationMs,
        };
      },
      { trigger },
    );
  } catch (err) {
    const code = err instanceof ContentHealthError ? err.code : "read_failed";
    await loose
      .from("content_health_runs")
      .update({
        status: "failed",
        error_code: code,
        error_message: safeMessage(err),
        duration_ms: Date.now() - started,
        finished_at: nowIso(),
      })
      .eq("id", runId);
    incr("framique_content_health_runs_total", { trigger, outcome: "failed" });
    void captureError(err, { scope: "content.health.scan", merchantId: input.merchantId, runId });
    throw err;
  }
}

/* ==========================================================================
 * Sweep — the cron entry point
 * ========================================================================== */

export type SweepResult = {
  considered: number;
  scanned: number;
  skipped: number;
  failed: number;
  durationMs: number;
  deadlineHit: boolean;
};

/**
 * Scans the tenants whose content changed most recently, bounded by both a
 * merchant count and a wall clock. Anything not reached this tick keeps its
 * place and sorts first next time: a cron invocation must return a result.
 */
export async function runContentHealthSweep(
  opts: { limit?: number; checkExternal?: boolean } = {},
): Promise<SweepResult> {
  const started = Date.now();
  const deadline = started + CRAWL_POLICY.sweepBudgetMs;
  const limit = Math.max(1, Math.min(opts.limit ?? 25, 200));
  const db = await adminClient();
  const loose = db as LooseClient;

  const { data: merchants, error } = await loose
    .from("merchants")
    .select("id")
    .eq("status", "active")
    .limit(limit * 4);
  if (error) throw new ContentHealthError("read_failed", error.message);

  const ids = ((merchants ?? []) as { id: string }[]).map((m) => m.id);
  const { data: recent } = await loose
    .from("content_health_runs")
    .select("merchant_id, started_at")
    .in("merchant_id", ids.slice(0, 500))
    .order("started_at", { ascending: false })
    .limit(2_000);
  const lastRun = new Map<string, number>();
  for (const row of ((recent ?? []) as any[])) {
    const at = Date.parse(row.started_at ?? "") || 0;
    if (!lastRun.has(row.merchant_id)) lastRun.set(row.merchant_id, at);
  }
  const queue = ids
    .sort((a, b) => (lastRun.get(a) ?? 0) - (lastRun.get(b) ?? 0))
    .slice(0, limit);

  let scanned = 0;
  let failed = 0;
  let skipped = 0;
  let deadlineHit = false;

  for (const merchantId of queue) {
    if (Date.now() > deadline) {
      deadlineHit = true;
      skipped += 1;
      continue;
    }
    try {
      await runContentHealthScan({
        merchantId,
        trigger: "cron",
        requestedBy: null,
        deadline: Math.min(deadline, Date.now() + CRAWL_POLICY.runBudgetMs),
        ...(opts.checkExternal === false ? { checkExternal: false } : {}),
      });
      scanned += 1;
    } catch (err) {
      if (err instanceof ContentHealthError && err.code === "scan_busy") {
        skipped += 1;
        continue;
      }
      failed += 1;
      void captureError(err, { scope: "content.health.sweep", merchantId });
    }
  }

  const durationMs = Date.now() - started;
  log("info", "content.health.sweep", { considered: queue.length, scanned, skipped, failed, durationMs });
  incr("framique_content_health_sweeps_total", { outcome: failed ? "partial" : "ok" });
  return { considered: queue.length, scanned, skipped, failed, durationMs, deadlineHit };
}

/* ==========================================================================
 * Desk reads
 * ========================================================================== */

export type FindingFilter = {
  state?: "open" | "ignored" | "resolved" | "all";
  code?: FindingCode | "all";
  severity?: "error" | "warning" | "notice" | "all";
  entityType?: ContentEntityType | "all";
  limit?: number;
  offset?: number;
};

export async function loadFindings(db: Client, merchantId: string, filter: FindingFilter = {}) {
  const loose = db as LooseClient;
  const limit = Math.max(1, Math.min(filter.limit ?? 50, 200));
  const offset = Math.max(0, filter.offset ?? 0);
  let query = loose
    .from("content_health_findings")
    .select(
      "id, code, severity, entity_type, entity_id, entity_title, entity_path, target, detail, state, occurrences, first_seen_at, last_seen_at",
      { count: "exact" },
    )
    .eq("merchant_id", merchantId);
  if (!filter.state || filter.state !== "all") query = query.eq("state", filter.state ?? "open");
  if (filter.code && filter.code !== "all") query = query.eq("code", filter.code);
  if (filter.severity && filter.severity !== "all") query = query.eq("severity", filter.severity);
  if (filter.entityType && filter.entityType !== "all") query = query.eq("entity_type", filter.entityType);

  const { data, error, count } = await query
    .order("severity", { ascending: true })
    .order("last_seen_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new ContentHealthError("read_failed", error.message);
  return { rows: (data ?? []) as any[], total: count ?? 0, limit, offset };
}

/** First paint for the desk: latest run, history, open counts, worst pages. */
export async function loadContentHealthState(db: Client, merchantId: string) {
  const loose = db as LooseClient;
  const [runs, open, findings] = await Promise.all([
    loose
      .from("content_health_runs")
      .select(
        "id, trigger, status, scanned, finding_counts, links_checked, external_checked, findings_opened, findings_resolved, truncated, duration_ms, error_code, started_at, finished_at",
      )
      .eq("merchant_id", merchantId)
      .order("started_at", { ascending: false })
      .limit(12),
    loose
      .from("content_health_findings")
      .select("code, severity, entity_type, entity_path, entity_title, state")
      .eq("merchant_id", merchantId)
      .eq("state", "open")
      .limit(5_000),
    loadFindings(db, merchantId, { state: "open", limit: 50 }),
  ]);
  if (runs.error) throw new ContentHealthError("read_failed", runs.error.message);

  const openRows = ((open?.data ?? []) as any[]);
  const bySeverity = { error: 0, warning: 0, notice: 0 } as Record<string, number>;
  const byCode: Record<string, number> = {};
  const byPage = new Map<string, { path: string; title: string; count: number }>();
  for (const row of openRows) {
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
    byCode[row.code] = (byCode[row.code] ?? 0) + 1;
    if (!row.entity_path) continue;
    const prev = byPage.get(row.entity_path) ?? {
      path: row.entity_path,
      title: row.entity_title ?? row.entity_path,
      count: 0,
    };
    prev.count += 1;
    byPage.set(row.entity_path, prev);
  }

  const history = ((runs.data ?? []) as any[]);
  const latest = history[0] ?? null;
  const scanned = (latest?.scanned ?? {}) as Record<ContentEntityType, number>;

  return {
    merchantId,
    latest,
    history,
    open: {
      total: openRows.length,
      bySeverity,
      byCode,
      worstPages: [...byPage.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    },
    score: latest
      ? healthScore({
          bySeverity: {
            error: bySeverity["error"] ?? 0,
            warning: bySeverity["warning"] ?? 0,
            notice: bySeverity["notice"] ?? 0,
          },
          scanned: {
            article: scanned.article ?? 0,
            page: scanned.page ?? 0,
            product: scanned.product ?? 0,
            collection: scanned.collection ?? 0,
          },
        })
      : null,
    findings: findings.rows,
    findingsTotal: findings.total,
  };
}

/** Merchant triage. Only the state a human may set, and it is audited. */
export async function setFindingState(
  db: Client,
  merchantId: string,
  findingId: string,
  state: "open" | "ignored",
  userId: string,
) {
  const loose = db as LooseClient;
  const { data, error } = await loose
    .from("content_health_findings")
    .update({ state, state_changed_by: userId, resolved_at: null })
    .eq("id", findingId)
    .eq("merchant_id", merchantId)
    .select("id, state")
    .maybeSingle();
  if (error) throw new ContentHealthError("persist_failed", error.message);
  if (!data) throw new ContentHealthError("not_found", "That finding no longer exists.");
  log("info", "content.health.triage", { merchantId, findingId, state, userId });
  incr("framique_content_health_triage_total", { state });
  return data as { id: string; state: string };
}

/** Editor-side internal link suggestions for one draft. Pure after the load. */
export async function suggestLinksForDraft(
  db: Client,
  merchantId: string,
  draft: { id?: string | null; title: string; body: string; focusKeyword?: string; tags?: string[] },
  limit?: number,
): Promise<LinkSuggestion[]> {
  const loaded = await loadContentGraph(db, merchantId);
  return suggestInternalLinks(draft, loaded.nodes, limit ? { limit } : {});
}

/** Structured-data completeness for one entity, straight from the domain. */
export async function schemaReportFor(db: Client, merchantId: string, entityId: string) {
  const loaded = await loadContentGraph(db, merchantId);
  const node = loaded.nodes.find((n) => n.id === entityId);
  if (!node) throw new ContentHealthError("not_found", "That content no longer exists.");
  return { node: { id: node.id, type: node.type, title: node.title, path: node.path }, rows: schemaReport(node) };
}
