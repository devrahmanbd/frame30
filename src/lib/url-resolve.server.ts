/**
 * Phase 3/4 closing gap — runtime resolution of merchant-owned permalinks.
 *
 * The permalink desk lets a merchant publish articles at `/journal/2026/08/x`,
 * but the route table only ships a literal `/blog/$slug` file. Without this
 * resolver every non-default pattern would build correct sitemap URLs that
 * 404 on click — the worst possible SEO failure mode, because Google sees the
 * sitemap as a lie.
 *
 * Resolution order, deliberately cheapest-first:
 *
 *  1. **Redirect table** — an explicit 301/302/410 always wins, so a pattern
 *     migration keeps working even for paths that no longer parse.
 *  2. **Article lookup** by the path's last segment, then a *verification*
 *     that the merchant's own settings rebuild exactly this path. A near-miss
 *     (right article, stale pattern) becomes a 301 to the canonical path
 *     instead of a soft 404.
 *  3. **Miss** — recorded in `url_missing_log` (fail-soft, deduplicated by a
 *     unique index) so the 404 queue in the desk stays useful.
 *
 * Every read is cached with SWR and hard-timed-out. A resolver failure returns
 * a miss, never an exception: a broken settings table must not 500 the site.
 */
import { cached } from "./cache.server";
import { incr, log, observe } from "./observability.server";
import { buildPermalink, normaliseBase, parsePath } from "./permalink";

const RESOLVE_TTL = 120;
const RESOLVE_TIMEOUT_MS = 1_500;
/** Redirect chains are collapsed on write; this is belt-and-braces at read. */
const MAX_HOPS = 3;

export type PathResolution =
  | { type: "article"; slug: string; merchantSlug: string | null; canonicalPath: string }
  | { type: "redirect"; to: string; status: 301 | 302 | 410 }
  | { type: "gone" }
  | { type: "miss" };

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
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

async function lookupRedirect(db: Loose, path: string): Promise<PathResolution | null> {
  let current = path;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const { data } = await db
      .from("url_redirects")
      .select("to_path, status_code, merchant_id, id, hits")
      .eq("from_path", current)
      .limit(1)
      .maybeSingle();
    if (!data) return hop === 0 ? null : null;
    const status = Number(data.status_code ?? 301) as 301 | 302 | 410;
    if (status === 410) return { type: "gone" };
    const to = String(data.to_path ?? "");
    if (!to || to === current) return null;
    // Hit accounting is best-effort: a counter update must never delay or
    // break the redirect itself.
    void db
      .from("url_redirects")
      .update({ hits: Number(data.hits ?? 0) + 1, last_hit_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(
        () => undefined,
        () => undefined,
      );
    const next = normaliseBase(to);
    const { data: chained } = await db
      .from("url_redirects")
      .select("id")
      .eq("from_path", next)
      .limit(1)
      .maybeSingle();
    if (!chained) return { type: "redirect", to: next, status };
    current = next;
  }
  log("warn", "url_resolve.chain_too_long", { path });
  return null;
}

async function resolveUncached(rawPath: string): Promise<PathResolution> {
  const path = normaliseBase(rawPath);
  if (!path || path === "/") return { type: "miss" };
  const { publicClient } = await import("./pricing.server");
  const db = publicClient() as unknown as Loose;

  const redirect = await lookupRedirect(db, path);
  if (redirect) return redirect;

  const segments = path.split("/").filter(Boolean);
  const slug = segments[segments.length - 1] ?? "";
  if (!slug) return { type: "miss" };

  const { data: article } = await db
    .from("articles")
    .select("id, slug, merchant_id, published_at, status")
    .eq("slug", slug)
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  if (!article) return { type: "miss" };

  const { permalinkSettingsFor } = await import("./permalink.server");
  const settings = await permalinkSettingsFor(db as never, article.merchant_id);
  const canonicalPath = buildPermalink(settings, {
    kind: "article",
    slug: article.slug,
    date: article.published_at ?? null,
  });
  const { data: merchant } = await db
    .from("merchants")
    .select("slug")
    .eq("id", article.merchant_id)
    .maybeSingle();

  if (canonicalPath === path) {
    return { type: "article", slug: article.slug, merchantSlug: merchant?.slug ?? null, canonicalPath };
  }

  // The slug is real but the path shape is stale (an old pattern, a shared
  // link, a hand-typed URL). Only treat it as an alias when the path at least
  // parses as an article URL under the current settings, or is the legacy
  // `/blog/:slug` shape — otherwise it is somebody else's namespace.
  const parsed = parsePath(settings, path);
  const legacy = path === `/blog/${article.slug}`;
  if (parsed?.kind === "article" || legacy) {
    return { type: "redirect", to: canonicalPath, status: 301 };
  }
  return { type: "miss" };
}

/** Cached resolution. Never throws; a failure degrades to a miss. */
export async function resolveStorefrontPath(rawPath: string): Promise<PathResolution> {
  const started = Date.now();
  try {
    const result = await cached(
      `url-resolve|${rawPath}`,
      RESOLVE_TTL,
      () => withTimeout(resolveUncached(rawPath), RESOLVE_TIMEOUT_MS, { type: "miss" } as PathResolution),
      { staleSeconds: 600 },
    );
    observe("framique_url_resolve_ms", Date.now() - started, { type: result.type });
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
 * Records a 404 against the owning merchant when one can be inferred from the
 * path's first segment (a store URL), otherwise against the article's tenant.
 * Fail-soft by construction — logging must never turn a 404 into a 500.
 */
export async function recordResolvedMiss(path: string, referrer?: string | null): Promise<void> {
  try {
    const { publicClient } = await import("./pricing.server");
    const db = publicClient() as unknown as Loose;
    const segments = normaliseBase(path).split("/").filter(Boolean);
    let merchantId: string | null = null;
    if (segments[0] === "store" && segments[1]) {
      const { data } = await db.from("merchants").select("id").eq("slug", segments[1]).maybeSingle();
      merchantId = data?.id ?? null;
    }
    if (!merchantId) {
      const { data } = await db.from("merchants").select("id").eq("status", "active").limit(1).maybeSingle();
      merchantId = data?.id ?? null;
    }
    if (!merchantId) return;
    const { recordMissingPath } = await import("./permalink.server");
    await recordMissingPath(merchantId, path, referrer ?? null);
  } catch (error) {
    log("warn", "url_resolve.miss_log_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
