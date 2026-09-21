/**
 * Custom-domain storefront host resolution.
 *
 * Lets a merchant's active primary custom domain (e.g. microscrop.shop) serve
 * their storefront at `/`, the way WordPress serves a site on its mapped
 * domain. Platform hosts always fall through to the normal routes — the `/`
 * landing is never hijacked.
 *
 * Security model
 * - The `Host` header is never trusted blindly: only a hostname present in
 *   `merchant_domains` with `status = 'active'` resolves. Everything else
 *   returns null and the caller falls through to normal routing.
 * - Lookups are cached 300s (same window as tenant-canary's
 *   `domain_tenant:*` entries) via `cached()` with a shared Redis L2 tier.
 * - Header injection is rejected at normalization: anything carrying a path,
 *   query, fragment, credentials, whitespace, control chars or a scheme is
 *   not a hostname and resolves to null. A `:port` suffix is stripped.
 *
 * Request plumbing: the host is read off the live request with the same
 * `x-forwarded-host` → `host` precedence as `site-origin.server.ts`, so edge
 * forwarding and direct traffic behave identically.
 */
import { getRequest } from "@tanstack/react-start/server";
import { cached } from "./cache.server";

export type StorefrontHostResolution = {
  merchantId: string;
  merchantSlug: string;
  hostname: string;
  isPrimary: boolean;
};

type DomainRow = {
  merchant_id: string;
  hostname: string;
  status: string;
  is_primary: boolean;
} | null;

/**
 * Hostnames that always fall through to platform routing, never to a
 * storefront. Mirrors the tenant-canary exclusions (framique.app/dev,
 * localhost) plus the live platform origins.
 */
const PLATFORM_SUFFIXES = [
  "localhost",
  "framique.app",
  "framique.dev",
  "framique.store",
  "framique.com",
] as const;

const PLATFORM_EXACT = new Set([
  "localhost",
  "127.0.0.1",
  "framique.qubickle.com",
  "edge.framique.store",
]);

export function isPlatformHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (PLATFORM_EXACT.has(host)) return true;
  return PLATFORM_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/**
 * Normalize a raw `Host` / `x-forwarded-host` header value to a lookup key,
 * or null when the value is not a plausible bare hostname.
 *
 * - Takes the first comma-separated value (proxy chains), lowercases, trims
 *   a single trailing dot (FQDN form) and strips a `:port` suffix.
 * - Rejects: empty, over-long (>253), IP literals are left to the DB (they
 *   can never match a merchant_domains row, so they fall through to null),
 *   and anything containing `/ \ ? # @`, whitespace or control characters —
 *   the header-injection / cache-poisoning surface.
 */
export function normalizeRequestHost(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let value = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!value) return null;
  // A scheme means this is not a Host header value at all — reject outright
  // rather than trying to salvage a hostname out of it.
  if (value.includes("://")) return null;
  value = value.replace(/\.$/, "");
  // Strip :port (and reject a second colon, i.e. unbracketed IPv6 / garbage).
  if (value.includes(":")) {
    const parts = value.split(":");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    if (!/^\d{1,5}$/.test(parts[1] ?? "")) return null;
    value = parts[0] ?? "";
  }
  // Strip bracketed IPv6 like [::1] (optional port already handled above).
  if (value.startsWith("[") || value.endsWith("]")) return null;
  if (!value || value.length > 253) return null;
  // Control chars / whitespace / URL delimiters: header injection surface.
  // eslint-disable-next-line no-control-regex
  if (/[\s\x00-\x1f\x7f/\\?#@]/.test(value)) return null;
  if (!/^[a-z0-9._-]+$/.test(value)) return null;
  if (!value.includes(".")) return null;
  return value;
}

/** Read the request host with edge-forwarding precedence. Null outside a request. */
export function currentRequestHost(): string | null {
  try {
    const req = getRequest();
    if (!req) return null;
    const raw =
      req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
      req.headers.get("host");
    return normalizeRequestHost(raw);
  } catch {
    return null;
  }
}

/**
 * Hosts the edge may serve a storefront on: exactly the set the TLS edge
 * gate (`verify-sni`) allows a certificate for. Ownership + routing are
 * proven for all three; only the certificate state differs (edge-owned).
 * Everything else (pending_dns, verifying, failed, disabled, unknown)
 * falls through to normal platform routing.
 */
export const SERVABLE_DOMAIN_STATUSES = [
  "dns_verified",
  "issuing_cert",
  "active",
] as const;

/**
 * Pure resolution decision: given a normalized hostname and the
 * merchant_domains row for it (null when no row), decide.
 *
 * - No row, platform host, or any non-servable status (pending_dns,
 *   verifying, failed, disabled) → null.
 * - Servable rows resolve — primary and non-primary alike serve the store
 *   (non-primary serves, no redirect; canonicalisation to the primary is a
 *   separate redirect concern, not a serving gate).
 */
export function decideHostResolution(
  hostname: string | null,
  row: (DomainRow & { merchantSlug?: string | null }) | null,
): StorefrontHostResolution | null {
  if (!hostname) return null;
  if (isPlatformHost(hostname)) return null;
  if (
    !row ||
    !(SERVABLE_DOMAIN_STATUSES as readonly string[]).includes(row.status)
  )
    return null;
  if (!row.merchantSlug) return null;
  return {
    merchantId: row.merchant_id,
    merchantSlug: row.merchantSlug,
    hostname,
    isPrimary: row.is_primary,
  };
}

async function lookupDomainRow(
  hostname: string,
): Promise<(DomainRow & { merchantSlug?: string | null }) | null> {
  return cached(
    `storefront_host:${hostname}`,
    300,
    async () => {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { data: domain } = await supabaseAdmin
        .from("merchant_domains")
        .select("merchant_id, hostname, status, is_primary")
        .eq("hostname", hostname)
        .in("status", [...SERVABLE_DOMAIN_STATUSES])
        .maybeSingle();
      if (!domain) return null;
      const { data: merchant } = await supabaseAdmin
        .from("merchants")
        .select("slug, status")
        .eq("id", domain.merchant_id)
        .maybeSingle();
      if (!merchant || (merchant as { status?: string }).status !== "active")
        return null;
      const d = domain as {
        merchant_id: string;
        hostname: string;
        status: string;
        is_primary: boolean;
      };
      return {
        merchant_id: d.merchant_id,
        hostname: d.hostname,
        status: d.status,
        is_primary: d.is_primary,
        merchantSlug: (merchant as { slug: string }).slug,
      };
    },
    { shared: true, sharedTtlSeconds: 300 },
  );
}

/** Resolve the current request's host to a storefront, or null (platform routing). */
export async function resolveStorefrontHost(): Promise<StorefrontHostResolution | null> {
  return resolveStorefrontHostFor(currentRequestHost());
}

/**
 * Host-explicit variant for entry points (e.g. `server.ts` rewrites) where
 * the TanStack request context is unavailable. Pure hostname in, resolution
 * out — the slug always comes from the domain allowlist, never user input.
 */
export async function resolveStorefrontHostFor(
  hostname: string | null,
): Promise<StorefrontHostResolution | null> {
  if (!hostname) return null;
  if (isPlatformHost(hostname)) return null;
  const row = await lookupDomainRow(hostname);
  return decideHostResolution(hostname, row);
}

/* ------------------------- primary-host redirect ------------------------- */

/**
 * Pure redirect decision for `/store/<slug>` path URLs.
 *
 * When a merchant has an active primary custom domain, path traffic should
 * 301 to `https://<primary>/`. No primary → null (path URLs keep working).
 * A request already on the primary host → null (no self-redirect loop).
 */
export function decideStoreRedirect(
  primaryHost: string | null,
  requestHost: string | null,
): string | null {
  if (!primaryHost) return null;
  const primary = primaryHost.toLowerCase();
  if (requestHost && requestHost.toLowerCase() === primary) return null;
  return `https://${primary}/`;
}

/**
 * Custom-domain-only cutover: path-based storefront URLs (`/store/*`) served
 * on a platform host are an abuse surface (free platform-trust hosting for
 * malicious stores) and must not serve. Pure gate decision:
 *
 * - platform host + `/store/...` catalog path → true (caller answers 410)
 * - token-gated order flows (`/track`, `/order/...`) → false (buyers need
 *   email/SMS links; they carry order tokens, not browsable catalog)
 * - draft preview (`preview_token`) → false (token-verified downstream)
 * - loopback dev (`localhost`, `127.0.0.1`) → false (local development)
 * - non-store paths, custom hosts, null host → false
 */
const PATH_STORE_ALLOWLIST = new Set(["track", "order"]);

export function isBlockedPathStorefront(
  hostname: string | null | undefined,
  pathname: string,
  hasPreviewToken: boolean,
): boolean {
  if (!hostname || hasPreviewToken) return false;
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (!isPlatformHost(host)) return false;
  const match = /^\/store\/[^/]+(?:\/([^/?#]+))?/.exec(pathname);
  if (!match) return false;
  const segment = (match[1] ?? "").toLowerCase();
  if (!segment) return true; // index
  return !PATH_STORE_ALLOWLIST.has(segment);
}

/**
 * Client-safe host-shape check — re-exported here for server consumers.
 * Canonical home is `./storefront-url` (importable from client bundles).
 */
export { isCustomHostPath } from "./storefront-url";

export function decideStoreRedirectForPath(
  primaryHost: string | null,
  requestHost: string | null,
  subpath: string,
): string | null {
  if (!primaryHost) return null;
  const primary = primaryHost.toLowerCase();
  if (requestHost && requestHost.toLowerCase() === primary) return null;
  let path = subpath || "/";
  // Split off query/fragment, normalize leading slash, collapse doubles.
  let suffix = "";
  const qIdx = path.search(/[?#]/);
  if (qIdx >= 0) {
    suffix = path.slice(qIdx);
    path = path.slice(0, qIdx);
  }
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  // Strip a leading `/store/<slug>` prefix — custom hosts serve at `/`.
  path = path.replace(/^\/store\/[^/]+(?=\/|$)/, "") || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  return `https://${primary}${path}${suffix}`;
}

/** Active primary custom-domain hostname for a merchant id, or null. Cached 300s. */
export async function primaryHostForMerchant(
  merchantId: string,
): Promise<string | null> {
  return cached(
    `storefront_primary:${merchantId}`,
    300,
    async () => {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("merchant_domains")
        .select("hostname")
        .eq("merchant_id", merchantId)
        .eq("status", "active")
        .eq("is_primary", true)
        .maybeSingle();
      return (data?.hostname as string | undefined) ?? null;
    },
    { shared: true, sharedTtlSeconds: 300 },
  );
}

/** Merchant id for an active store slug, or null. */
export async function merchantIdForSlug(slug: string): Promise<string | null> {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("merchants")
    .select("id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Redirect target for a `/store/<slug>` index visit, or null when the path
 * URL should keep serving. Reads the request host server-side so a visit
 * already on the primary domain never bounces.
 */
export async function resolveStoreRedirectForSlug(
  slug: string,
): Promise<string | null> {
  const merchantId = await merchantIdForSlug(slug);
  if (!merchantId) return null;
  const primary = await primaryHostForMerchant(merchantId);
  return decideStoreRedirect(primary, currentRequestHost());
}

/**
 * Custom-domain-only cutover: path-based storefront URLs (`/store/*`) served
 * on a platform host are an abuse surface (free platform-trust hosting for
 * malicious stores) and must not serve. Pure gate decision:
 *
 * - platform host + `/store/...` catalog path → true (caller answers 404)
 * - token-gated order flows (`/track`, `/order/...`) → false (buyers need
 *   email/SMS links; they carry order tokens, not browsable catalog)
 * - draft preview (`preview_token`) → false (token-verified downstream)
 * - loopback dev (`localhost`, `127.0.0.1`) → false (local development)
 * - non-store paths, custom hosts, null host → false
 */
const PATH_STORE_ALLOWLIST = new Set(["track", "order"]);

export function isBlockedPathStorefront(
  hostname: string | null | undefined,
  pathname: string,
  hasPreviewToken: boolean,
): boolean {
  if (!hostname || hasPreviewToken) return false;
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (!isPlatformHost(host)) return false;
  const match = /^\/store\/[^/]+(?:\/([^/?#]+))?/.exec(pathname);
  if (!match) return false;
  const segment = (match[1] ?? "").toLowerCase();
  if (!segment) return true; // index
  return !PATH_STORE_ALLOWLIST.has(segment);
}

/**
 * Client-safe host-shape check — re-exported here for server consumers.
 * Canonical home is `./storefront-url` (importable from client bundles).
 */
export { isCustomHostPath } from "./storefront-url";

export function decideStoreRedirectForPath(
  primaryHost: string | null,
  requestHost: string | null,
  subpath: string,
): string | null {
  if (!primaryHost) return null;
  const primary = primaryHost.toLowerCase();
  if (requestHost && requestHost.toLowerCase() === primary) return null;
  let path = subpath || "/";
  // Split off query/fragment, normalize leading slash, collapse doubles.
  let suffix = "";
  const qIdx = path.search(/[?#]/);
  if (qIdx >= 0) {
    suffix = path.slice(qIdx);
    path = path.slice(0, qIdx);
  }
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  // Strip a leading `/store/<slug>` prefix — custom hosts serve at `/`.
  path = path.replace(/^\/store\/[^/]+(?=\/|$)/, "") || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  return `https://${primary}${path}${suffix}`;
}

/**
 * Deep-path variant: `/store/<slug>/...` → `https://<primary>/...`.
 * `subpath` is the portion after `/store/<slug>` (e.g. `/p/x?y=1`)
 * or the full path — the `/store/<slug>` prefix is stripped.
 */
export async function resolveStoreRedirectForSlugPath(
  slug: string,
  subpath: string,
): Promise<string | null> {
  const merchantId = await merchantIdForSlug(slug);
  if (!merchantId) return null;
  const primary = await primaryHostForMerchant(merchantId);
  return decideStoreRedirectForPath(primary, currentRequestHost(), subpath);
}
