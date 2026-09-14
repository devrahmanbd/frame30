import { createServerFn } from "@tanstack/react-start";

/**
 * Phase 10.5 — per-request context every marketing route's `head()` needs.
 *
 * Canonical URLs, `og:url`, hreflang alternates and JSON-LD `@id`s must be
 * absolute, and the only honest source for the host is the live request:
 * preview, published and custom-domain traffic each have to canonicalise to
 * themselves. So the origin travels with the loader payload rather than being
 * baked at build time.
 *
 * The demo-store slug rides along because the shared public chrome links to it
 * and every marketing route already needed it; folding both into one call
 * saves a round trip per navigation.
 *
 * Public and unauthenticated on purpose — it is called from prerendered public
 * loaders, where no bearer token exists. It reads nothing tenant-private and
 * cannot throw: a failed slug lookup degrades to "no demo link".
 */
export const getSiteContext = createServerFn({ method: "GET" }).handler(async () => {
  const { requestOrigin } = await import("./site-origin.server");
  
  try {
    const { featuredStoreSlug } = await import("./storefront.server");
    
  } catch (error) {
    const { log } = await import("./observability.server");
    log("warn", "site_context.demo_slug_failed", {
      reason: String((error as Error)?.message ?? error).slice(0, 160)});
  }
  return { origin: requestOrigin() };
});
