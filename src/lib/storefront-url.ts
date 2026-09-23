/**
 * Client-safe host-shape check for storefront chrome: root paths (`/`,
 * `/p/x`, `/cart` …) render on a custom host; `/store/<slug>/...` renders
 * on the path host (localhost dev). Shared components branch links on this.
 *
 * Platform surfaces (`/dashboard`, `/api`, `/auth`, `/onboarding`, `/store`)
 * are never custom-host paths — without this guard dashboard/API routes
 * would be misclassified as storefront root paths and link bases break.
 */
export function isCustomHostPath(pathname: string): boolean {
  if (pathname === "/store" || pathname.startsWith("/store/")) return false;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))
    return false;
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return false;
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/"))
    return false;
  return true;
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

/**
 * Any storefront subpath (`pages/x`, `sitemap.xml`, `search`, …) resolved
 * against the merchant's primary custom domain when one exists, else the
 * legacy path URL. Central rule for every merchant-facing link: path URLs
 * are retired, so no new caller may hard-code `/store/<slug>`.
 */
export function storefrontPathForMerchant(
  primaryHost: string | null | undefined,
  slug: string,
  subpath: string,
): string {
  const primary = (primaryHost ?? "").trim().toLowerCase();
  const clean = subpath.replace(/^\/+/, "");
  if (primary) return `https://${primary}/${clean}`;
  return `/store/${slug}/${clean}`;
}

/** Public page URL for View actions and previews (`preview=1` for drafts). */
export function storePageUrlForMerchant(
  primaryHost: string | null | undefined,
  slug: string,
  pageSlug: string,
  preview = false,
  isHomepage = false,
): string {
  // The designated homepage lives at the store root, not under /pages/.
  const url = isHomepage
    ? storefrontPathForMerchant(primaryHost, slug, "")
    : storefrontPathForMerchant(primaryHost, slug, `pages/${pageSlug}`);
  return preview ? `${url}?preview=1` : url;
}
