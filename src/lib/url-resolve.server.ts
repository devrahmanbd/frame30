/**
 * Phase 3/4 closing gap — runtime resolution of merchant-owned permalinks.
 *
 * The permalink desk lets a merchant publish articles at `/journal/2026/08/x`,
 * but the route table only ships literal files. Without this resolver every
 * non-default pattern would build correct sitemap URLs that 404 on click.
 *
 * Resolution order, deliberately cheapest-first:
 *
 *  1. **Redirect table** — tenant-scoped, an explicit 301/302/410 always wins.
 *  2. **Entity lookup** by the path's last segment across articles, products,
 *     collections and pages, then a *verification* that the owning merchant's
 *     own settings rebuild exactly this path via `buildPermalink`. A near-miss
 *     becomes a 301 to the canonical path instead of a soft 404.
 *  3. **Miss** — recorded in `url_missing_log` (fail-soft) so the desk queue
 *     stays useful. Unattributable misses are dropped, never assigned to the
 *     first active merchant.
 *
 * Every read is cached with SWR and hard-timed-out. A resolver failure returns
 * a miss, never an exception.
 */
import { cached } from "./cache.server";
import { incr, log, observe } from "./observability.server";
import {
  buildPermalink,
  DEFAULT_PERMALINKS,
  normaliseBase,
  parsePath,
  type PermalinkKind,
} from "./permalink";

const RESOLVE_TTL = 120;
const RESOLVE_TIMEOUT_MS = 1_500;
/** Redirect chains are collapsed on write; this is belt-and-braces at read. */
const MAX_HOPS = 3;

export type PathResolution =
  | {
      type: "article" | "product" | "collection" | "page";
      slug: string;
      merchantSlug: string | null;
      canonicalPath: string;
    }
  | { type: "redirect"; to: string; status: 301 | 302 | 410 }
  | { type: "gone" }
  | { type: "miss" };

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

type Loose = { from: (table: string) => any };

type HostResolver = (
  hostname: string | null,
) => Promise<{ merchantId: string } | null>;

async function defaultHostResolver(
  hostname: string | null,
): Promise<{ merchantId: string } | null> {
  try {
    const mod = await import("./storefront-host.server");
    const res = hostname
      ? await mod.resolveStorefrontHostFor(hostname)
      : await mod.resolveStorefrontHost();
    return res ? { merchantId: res.merchantId } : null;
  } catch {
    return null;
  }
}

/**
 * Owning merchant for a URL: the `/store/<slug>` prefix first, otherwise the
 * request's custom host. Null when neither resolves — callers must fail
 * closed on null, never fall back to an arbitrary tenant.
 */
export async function resolveTenantForUrl(
  db: Loose,
  path: string,
  hostname?: string | null,
  resolveHost: HostResolver = defaultHostResolver,
): Promise<string | null> {
  const segments = normaliseBase(path).split("/").filter(Boolean);
  if (segments[0] === "store" && segments[1]) {
    const { data } = await db
      .from("merchants")
      .select("id")
      .eq("slug", segments[1])
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  try {
    const res = await resolveHost(hostname ?? null);
    if (res?.merchantId) return res.merchantId;
  } catch {
    // Fail closed below.
  }
  return null;
}

/**
 * Tenant-scoped redirect lookup. `merchantId` is required: an unscoped
 * `from_path` scan would serve one merchant's rule to another merchant's
 * traffic whenever two stores own the same source path.
 */
export async function lookupRedirect(
  db: Loose,
  path: string,
  merchantId: string | null,
): Promise<PathResolution | null> {
  if (!merchantId) return null;
  let current = path;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const { data } = await db
      .from("url_redirects")
      .select("to_path, status_code, merchant_id, id, hits")
      .eq("merchant_id", merchantId)
      .eq("from_path", current)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const status = Number(data.status_code ?? 301) as 301 | 302 | 410;
    if (status === 410) return { type: "gone" };
    const to = String(data.to_path ?? "");
    if (!to || to === current) return null;
    void db
      .from("url_redirects")
      .update({
        hits: Number(data.hits ?? 0) + 1,
        last_hit_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .then(
        () => undefined,
        () => undefined,
      );
    const next = normaliseBase(to);
    const { data: chained } = await db
      .from("url_redirects")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("from_path", next)
      .limit(1)
      .maybeSingle();
    if (!chained) return { type: "redirect", to: next, status };
    current = next;
  }
  log("warn", "url_resolve.chain_too_long", { path });
  return null;
}

export type ResolveOptions = {
  /** Known tenant — skips host/slug inference. */
  merchantId?: string | null;
  /** Raw request hostname for custom-domain tenant inference. */
  hostname?: string | null;
};

type CandidateRow = {
  slug: string;
  merchant_id: string;
  published_at?: string | null;
};

/**
 * Shared tail: given the entity a path names, verify it against that
 * entity's own tenant settings. A slug that is real but stale becomes a 301
 * to the canonical path; anything else is a miss.
 */
async function resolveEntityTail(
  db: Loose,
  path: string,
  kind: PermalinkKind,
  row: CandidateRow,
): Promise<PathResolution | null> {
  const { permalinkSettingsFor } = await import("./permalink.server");
  const settings = await permalinkSettingsFor(db as never, row.merchant_id);
  const canonicalPath = buildPermalink(settings, {
    kind,
    slug: row.slug,
    date: (row.published_at as string | null) ?? null,
    category: null,
  });
  if (canonicalPath === path) {
    const { data: merchant } = await db
      .from("merchants")
      .select("slug")
      .eq("id", row.merchant_id)
      .maybeSingle();
    return {
      type: kind,
      slug: row.slug,
      merchantSlug: merchant?.slug ?? null,
      canonicalPath,
    };
  }
  const parsed = parsePath(settings, path);
  const legacy =
    buildPermalink(DEFAULT_PERMALINKS, {
      kind,
      slug: row.slug,
      date: (row.published_at as string | null) ?? null,
      category: null,
    }) === path;
  if (parsed?.kind === kind || legacy) {
    return { type: "redirect", to: canonicalPath, status: 301 };
  }
  return null;
}

async function resolveUncached(
  rawPath: string,
  opts: ResolveOptions = {},
): Promise<PathResolution> {
  const path = normaliseBase(rawPath);
  if (!path || path === "/") return { type: "miss" };
  const { publicClient } = await import("./pricing.server");
  const db = publicClient() as unknown as Loose;

  const merchantId =
    opts.merchantId ??
    (await resolveTenantForUrl(db, path, opts.hostname).catch(() => null));

  if (merchantId) {
    const redirect = await lookupRedirect(db, path, merchantId);
    if (redirect) return redirect;
  }

  const segments = path.split("/").filter(Boolean);
  const slug = segments[segments.length - 1] ?? "";
  if (!slug) return { type: "miss" };

  // One indexed lookup per kind, in parallel. A known tenant scopes every
  // lookup to its own rows so merchant B's slug never resolves on A's host.
  const scoped = (q: any) => (merchantId ? q.eq("merchant_id", merchantId) : q);
  const [articleRes, productRes, collectionRes, pageRes] = await Promise.all([
    scoped(
      db
        .from("articles")
        .select("id, slug, merchant_id, published_at, status")
        .eq("slug", slug)
        .eq("status", "published"),
    )
      .limit(1)
      .maybeSingle(),
    scoped(
      db
        .from("products")
        .select("id, slug, merchant_id")
        .eq("slug", slug)
        .eq("status", "active"),
    )
      .limit(1)
      .maybeSingle(),
    scoped(
      db
        .from("collections")
        .select("id, slug, merchant_id")
        .eq("slug", slug)
        .eq("is_published", true),
    )
      .limit(1)
      .maybeSingle(),
    scoped(
      db
        .from("storefront_pages")
        .select("id, slug, merchant_id")
        .eq("slug", slug)
        .eq("is_published", true)
        .is("deleted_at", null),
    )
      .limit(1)
      .maybeSingle(),
  ]);
  const candidates: { kind: PermalinkKind; row: CandidateRow }[] = [];
  const push = (kind: PermalinkKind, res: { data?: CandidateRow | null }) => {
    const row = res?.data;
    if (row?.slug && row?.merchant_id) candidates.push({ kind, row });
  };
  push("article", articleRes as { data?: CandidateRow | null });
  push("product", productRes as { data?: CandidateRow | null });
  push("collection", collectionRes as { data?: CandidateRow | null });
  push("page", pageRes as { data?: CandidateRow | null });
  if (!candidates.length) return { type: "miss" };

  if (!merchantId) {
    // No host/path tenant signal: the entity identifies the tenant, so that
    // tenant's redirect still wins — scoped to it, never scanned globally.
    for (const { row } of candidates) {
      const redirect = await lookupRedirect(db, path, row.merchant_id);
      if (redirect) return redirect;
    }
  }

  let alias: PathResolution | null = null;
  for (const { kind, row } of candidates) {
    const hit = await resolveEntityTail(db, path, kind, row);
    if (hit && hit.type !== "miss") {
      if (hit.type === "redirect") {
        alias = alias ?? hit;
        continue;
      }
      return hit;
    }
  }
  return alias ?? { type: "miss" };
}

/** Cached resolution. Never throws; a failure degrades to a miss. */
export async function resolveStorefrontPath(
  rawPath: string,
  opts: ResolveOptions = {},
): Promise<PathResolution> {
  const started = Date.now();
  try {
    let merchantId = opts.merchantId ?? null;
    if (!merchantId) {
      try {
        const { publicClient } = await import("./pricing.server");
        const db = publicClient() as unknown as Loose;
        merchantId = await resolveTenantForUrl(db, rawPath, opts.hostname);
      } catch {
        merchantId = null;
      }
    }
    const key = `url-resolve|${merchantId ?? "global"}|${rawPath}`;
    const result = await cached(
      key,
      RESOLVE_TTL,
      () =>
        withTimeout(
          resolveUncached(rawPath, {
            merchantId,
            hostname: opts.hostname,
          }),
          RESOLVE_TIMEOUT_MS,
          {
            type: "miss",
          } as PathResolution,
        ),
      { staleSeconds: 600 },
    );
    observe("framique_url_resolve_ms", Date.now() - started, {
      type: result.type,
    });
    incr("framique_url_resolve_total", { type: result.type });
    return result;
  } catch (error) {
    log("warn", "url_resolve.failed", {
      path: rawPath,
      message: error instanceof Error ? error.message : String(error),
    });
    incr("framique_url_resolve_total", { type: "error" });
    return { type: "miss" };
  }
}

/**
 * Records a 404 against the owning merchant: the `/store/<slug>` prefix when
 * present, otherwise the request's custom host. When neither resolves the
 * miss is dropped. Fail-soft — logging must never turn a 404 into a 500.
 */
export async function recordResolvedMiss(
  path: string,
  referrer?: string | null,
  hostname?: string | null,
): Promise<void> {
  try {
    const { publicClient } = await import("./pricing.server");
    const db = publicClient() as unknown as Loose;
    const merchantId = await resolveTenantForUrl(db, path, hostname);
    if (!merchantId) return;
    const { recordMissingPath } = await import("./permalink.server");
    await recordMissingPath(merchantId, path, referrer ?? null);
  } catch (error) {
    log("warn", "url_resolve.miss_log_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
