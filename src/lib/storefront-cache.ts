/**
 * Phase 8.2 — the storefront cache contract.
 *
 * Pure module: no I/O, so both the origin cache (`cache.server`) and the edge
 * response headers derive their keys from the same place.
 *
 * A cached storefront value is always keyed by
 * `tenant · template · locale · theme_version`:
 *  - **tenant** first, so a prefix purge can only ever clear one merchant and a
 *    hit can never cross tenants;
 *  - **template + locale**, because the same tenant serves different bodies for
 *    `index`/`product`/`page` and for `en`/`bn`;
 *  - **theme_version**, so publishing a new immutable version changes the key
 *    instead of mutating a live one. That is what makes "purge on publish only"
 *    safe: nothing else in the pipeline may invalidate.
 */

export const STOREFRONT_CACHE_PREFIX = "storefront:";

/** Locales the storefront renders. `*` means "same body for every locale". */
export type CacheLocale = "en" | "bn" | "*";

export type StorefrontCacheKeyInput = {
  merchantId: string;
  /** Template key, or `*` for a tenant-wide value such as the theme pointer. */
  template: string;
  locale?: CacheLocale;
  /** Published version id, or `null` before the pointer is known. */
  themeVersion?: string | null;
};

export class CacheKeyError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CacheKeyError";
  }
}

function segment(value: string, field: string): string {
  const clean = value.trim();
  if (!clean) throw new CacheKeyError("cache.segment_required", `${field} (tenant scope) is required in a storefront cache key`);
  if (clean.includes(":")) {
    throw new CacheKeyError("cache.segment_invalid", `${field} may not contain ":" (key separator)`);
  }
  return clean;
}

/**
 * Prefix owning every cached value for one tenant. Purge takes this, never the
 * bare `storefront:` prefix, so one merchant publishing cannot cold-start every
 * other merchant's storefront.
 */
export function tenantCachePrefix(merchantId: string): string {
  return `${STOREFRONT_CACHE_PREFIX}${segment(merchantId, "merchantId")}:`;
}

export function storefrontCacheKey(input: StorefrontCacheKeyInput): string {
  const template = segment(input.template, "template");
  const locale = input.locale ?? "*";
  const version = input.themeVersion ? segment(input.themeVersion, "themeVersion") : "unversioned";
  return `${tenantCachePrefix(input.merchantId)}${template}:${locale}:${version}`;
}

/** Every part of a key, for assertions and debugging. */
export function parseCacheKey(key: string) {
  const [prefix, merchantId, template, locale, version] = key.split(":");
  if (`${prefix}:` !== STOREFRONT_CACHE_PREFIX || !merchantId || !template) return null;
  return { merchantId, template, locale: (locale ?? "*") as CacheLocale, themeVersion: version ?? "unversioned" };
}

/* ------------------------------------------------------------- edge response */

/** Fresh window at the edge. Short, because publish purges the origin key. */
export const EDGE_TTL_SECONDS = 60;
/** Serve-stale window while the origin revalidates. */
export const EDGE_STALE_SECONDS = 300;

/** Storefront document paths — the only HTML we let a shared cache keep. */
export function isStorefrontPath(pathname: string): boolean {
  return /^\/store\/[^/]+(\/.*)?$/.test(pathname);
}

/**
 * Response headers for a cacheable storefront document. The version is folded
 * into the ETag so a publish makes every previously issued validator stale
 * without any edge purge call.
 */
export function storefrontCacheHeaders(themeVersion: string | null): Record<string, string> {
  return {
    "cache-control": `public, max-age=0, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=${EDGE_STALE_SECONDS}`,
    // Locale is part of the cache identity, and it is negotiated per request.
    vary: "accept-language",
    ...(themeVersion ? { etag: `W/"tv-${themeVersion}"` } : {}),
  };
}
