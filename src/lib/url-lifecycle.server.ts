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
  DEFAULT_PERMALINKS,
  buildPermalink,
  type PermalinkKind,
  type PermalinkSettings,
} from "./permalink";
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
        .select("from_path, to_path, status_code")
        .eq("merchant_id", merchantId)
        .limit(5000);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        from: row.from_path,
        to: row.to_path,
        status: (row.status_code === 410 ? 410 : 301) as 301 | 410,
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
export async function resolveMissingUrl(
  slug: string,
  path: string,
): Promise<UrlVerdict> {
  return resolveUrl(await loadRedirectMap(slug), path);
}

async function upsertRule(
  merchantId: string,
  entityType: string,
  rule: RedirectRule,
  slug?: string,
) {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("url_redirects").upsert(
    {
      merchant_id: merchantId,
      entity_type: entityType,
      from_path: rule.from,
      to_path: rule.to,
      status_code: rule.status,
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

/**
 * Permalink-aware slug-change rule.
 *
 * `recordSlugChange` takes a caller-supplied `basePath`, which is how every
 * hardcoded `/p` and `/pages` leaked in: the caller guessed the base instead
 * of reading it. This helper builds both ends from the merchant's live
 * permalink settings via `buildPermalink`, so a custom base (or a dated
 * article pattern, where the URL is more than base + slug) produces a rule
 * that actually matches what the store serves. Settings fall back to
 * `DEFAULT_PERMALINKS`, never to an exception.
 *
 * Both URL namespaces are recorded: the custom-host root path (what
 * `url-resolve.server.ts` consults) and, when `storeSlug` is known, the
 * `/store/<slug>`-prefixed path (what the storefront miss path consults).
 */
export function permalinkSlugChangePaths(
  settings: PermalinkSettings,
  entityType: PermalinkKind,
  oldSlug: string,
  newSlug: string,
  opts?: { date?: string | null; category?: string | null },
): { from: string; to: string } | null {
  const entity = (slug: string) => ({
    kind: entityType,
    slug,
    date: opts?.date ?? null,
    category: opts?.category ?? null,
  });
  const from = buildPermalink(settings, entity(oldSlug));
  const to = buildPermalink(settings, entity(newSlug));
  if (!oldSlug || !newSlug || from === to) return null;
  return { from, to };
}

export function permalinkTombstonePath(
  settings: PermalinkSettings,
  entityType: PermalinkKind,
  slug: string,
  opts?: { date?: string | null; category?: string | null },
): string | null {
  if (!slug) return null;
  return buildPermalink(settings, {
    kind: entityType,
    slug,
    date: opts?.date ?? null,
    category: opts?.category ?? null,
  });
}

/** Store-prefixed twin of a root permalink path (`/store/<slug>` + path). */
export function storePermalinkPath(
  storeSlug: string,
  permalinkPath: string,
): string {
  return normalizePath(`/store/${storeSlug}${permalinkPath}`);
}

async function upsertPermalinkRule(
  merchantId: string,
  storeSlug: string | undefined,
  entityType: string,
  from: string,
  to: string | null,
  status: 301 | 410,
) {
  const rule: RedirectRule =
    status === 410 ? { from, to: null, status } : { from, to: to!, status };
  await upsertRule(merchantId, entityType, rule, storeSlug);
  if (storeSlug) {
    const storeFrom = storePermalinkPath(storeSlug, from);
    const storeTo = to ? storePermalinkPath(storeSlug, to) : null;
    // The store twin is a different source path, so it never collides with
    // the root rule written above — one rename keeps both surfaces alive.
    if (storeFrom !== from) {
      const storeRule: RedirectRule =
        status === 410
          ? { from: storeFrom, to: null, status }
          : { from: storeFrom, to: storeTo!, status };
      await upsertRule(merchantId, entityType, storeRule, storeSlug);
    }
  }
}

/** Records the 301 a slug rename creates, resolved against live permalinks. */
export async function recordPermalinkSlugChange(input: {
  merchantId: string;
  storeSlug?: string;
  entityType: PermalinkKind;
  settings?: PermalinkSettings | null;
  oldSlug: string;
  newSlug: string;
  date?: string | null;
  category?: string | null;
}) {
  const settings = input.settings ?? DEFAULT_PERMALINKS;
  const paths = permalinkSlugChangePaths(
    settings,
    input.entityType,
    input.oldSlug,
    input.newSlug,
    { date: input.date, category: input.category },
  );
  if (!paths) return;
  await upsertPermalinkRule(
    input.merchantId,
    input.storeSlug,
    input.entityType,
    paths.from,
    paths.to,
    301,
  );
}

/** Records the 410 a permanent deletion creates, resolved against live permalinks. */
export async function recordPermalinkTombstone(input: {
  merchantId: string;
  storeSlug?: string;
  entityType: PermalinkKind;
  settings?: PermalinkSettings | null;
  slug: string;
  date?: string | null;
  category?: string | null;
}) {
  const settings = input.settings ?? DEFAULT_PERMALINKS;
  const path = permalinkTombstonePath(settings, input.entityType, input.slug, {
    date: input.date,
    category: input.category,
  });
  if (!path) return;
  await upsertPermalinkRule(
    input.merchantId,
    input.storeSlug,
    input.entityType,
    path,
    null,
    410,
  );
}

export { normalizePath };
