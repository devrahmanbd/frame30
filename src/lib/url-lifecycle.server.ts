/**
 * Phase 7.1 — server side of the URL lifecycle.
 *
 * Reads the per-store redirect map (cached, because it is consulted on every
 * miss) and records the rules a rename or a permanent deletion creates. The
 * decision logic itself lives in the pure `url-lifecycle` module.
 */
import { publicClient } from "./pricing.server";
import { invalidate } from "./cache.server";
import { renderRead } from "./render-read.server";
import {
  buildRedirectMap,
  normalizePath,
  resolveUrl,
  slugChangeRule,
  tombstoneRule,
  type RedirectRule,
  type UrlVerdict,
} from "./url-lifecycle";

const KEY = (slug: string) => `sf-redirects|${slug}`;

async function merchantIdFor(slug: string): Promise<string | null> {
  const db = publicClient();
  const { data } = await db
    .from("merchants")
    .select("id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  return data?.id ?? null;
}

/** Every rule for a store, keyed by normalised source path. */
export async function loadRedirectMap(slug: string) {
  // Phase 7: consulted on every storefront miss, so it runs under the render
  // read contract — bounded, cached SWR per store, and empty (not thrown) when
  // the redirect table is unreachable. An outage costs 404s, never a 500.
  const rules = await renderRead<RedirectRule[]>({
    name: "url.redirects",
    key: KEY(slug),
    fallback: [],
    ttlSeconds: 300,
    staleSeconds: 900,
    context: { slug },
    load: async () => {
      const merchantId = await merchantIdFor(slug);
      if (!merchantId) return [];
      const { data, error } = await publicClient()
        .from("url_redirects")
        .select("from_path, to_path, status")
        .eq("merchant_id", merchantId)
        .limit(5000);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        from: row.from_path,
        to: row.to_path,
        status: (row.status === 410 ? 410 : 301) as 301 | 410,
      }));
    },
  });
  return buildRedirectMap(rules);
}

/**
 * What to do with a store-relative path that resolved to nothing. Absolute
 * `Location` values are the caller's job — the map is host-agnostic so a store
 * served from a custom domain redirects within that domain.
 */
export async function resolveMissingUrl(slug: string, path: string): Promise<UrlVerdict> {
  return resolveUrl(await loadRedirectMap(slug), path);
}

async function upsertRule(merchantId: string, entityType: string, rule: RedirectRule, slug?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("url_redirects")
    .upsert(
      {
        merchant_id: merchantId,
        entity_type: entityType,
        from_path: rule.from,
        to_path: rule.to,
        status: rule.status,
      },
      { onConflict: "merchant_id,from_path" },
    );
  // A rename back to a previous slug would otherwise leave a hop pointing at
  // the URL we just started serving again.
  if (rule.to) {
    await supabaseAdmin
      .from("url_redirects")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("from_path", rule.to);
  }
  if (slug) invalidate(KEY(slug));
}

/** Records the 301 a slug rename creates. No-op when nothing actually moved. */
export async function recordSlugChange(input: {
  merchantId: string;
  storeSlug?: string;
  entityType: "product" | "collection" | "page" | "article";
  basePath: string;
  oldSlug: string;
  newSlug: string;
}) {
  const rule = slugChangeRule(input.basePath, input.oldSlug, input.newSlug);
  if (!rule) return;
  await upsertRule(input.merchantId, input.entityType, rule, input.storeSlug);
}

/** Records the 410 a permanent deletion creates. */
export async function recordTombstone(input: {
  merchantId: string;
  storeSlug?: string;
  entityType: "product" | "collection" | "page" | "article";
  basePath: string;
  slug: string;
}) {
  const rule = tombstoneRule(input.basePath, input.slug);
  if (!rule) return;
  await upsertRule(input.merchantId, input.entityType, rule, input.storeSlug);
}

export { normalizePath };
