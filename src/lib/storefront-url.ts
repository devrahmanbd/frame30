/**
 * Client-safe host-shape check for storefront chrome: root paths (`/`,
 * `/p/x`, `/cart` …) render on a custom host; `/store/<slug>/...` renders
 * on the path host (localhost dev). Shared components branch links on this.
 */
export function isCustomHostPath(pathname: string): boolean {
  return !pathname.startsWith("/store/");
}

/**
 * Dashboard "View store" URL — client-safe pure helper.
 *
 * Custom-domain-only storefront: when the merchant owns an active primary
 * custom domain, the anchor points at `https://<primary>/`; otherwise it
 * falls back to the path URL `/store/<slug>`.
 */
export function storefrontUrlForMerchant(
  primaryHost: string | null | undefined,
  slug: string,
): string {
  const primary = (primaryHost ?? "").trim().toLowerCase();
  if (primary) return `https://${primary}/`;
  return `/store/${slug}`;
}
