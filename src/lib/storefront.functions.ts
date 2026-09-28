import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAYMENT_METHOD_KEYS } from "./payment-rails";

const cartSchema = z.array(
  z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  }),
);

const methodSchema = z.enum(PAYMENT_METHOD_KEYS);

export const getStorefront = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1),
        previewToken: z.string().max(500).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { loadStorefront } = await import("./storefront.server");
    const { requestOrigin } = await import("./site-origin.server");
    let preview: { merchantId: string; themeId: string } | null = null;
    if (data.previewToken) {
      try {
        const { verifyPreviewToken, previewSecret } =
          await import("./theme-preview.server");
        preview = verifyPreviewToken(previewSecret(), data.previewToken);
        if (!preview) {
          // Rule 17: unverifiable tokens are observable (counter), but still
          // fail closed to the published theme below.
          const { incr } = await import("./observability.server");
          incr("framique_preview_token_verify_failed_total", {
            reason: "invalid",
          });
        }
      } catch {
        // Unverifiable token: fail closed to published + count.
        preview = null;
        try {
          const { incr } = await import("./observability.server");
          incr("framique_preview_token_verify_failed_total", {
            reason: "error",
          });
        } catch {
          // Observability must never break the storefront.
        }
      }
    }
    const found = await loadStorefront(data.slug, preview);
    if (!found) return null;
    // CMS-designated homepage: when the merchant chose a published page as
    // the storefront home, its rendered payload rides along so both index
    // routes (path-based and custom host) can serve it at `/` instead of
    // the theme index template. Unresolvable designations stay null and the
    // theme template renders — never a broken `/`.
    let homepage: Awaited<
      ReturnType<typeof import("./storefront-search.functions").getStorePageFn>
    > | null = null;
    if (found.homepageSlug) {
      try {
        const { getStorePageFn } =
          await import("./storefront-search.functions");
        homepage = await getStorePageFn({
          data: { slug: data.slug, pageSlug: found.homepageSlug },
        });
      } catch {
        homepage = null;
      }
    }
    // Signed responsive variants are built here, not in the cached tenant
    // loader: the HMAC secret is server-only and the URLs are cheap to derive.
    const { responsiveImage } = await import("./image-cdn.server");
    const products = await Promise.all(
      found.products.map(async (p) => ({
        ...p,
        image: await responsiveImage(p.image_url, "card"),
      })),
    );
    // Origin is per-request, so it is resolved outside the tenant cache.
    return { ...found, products, origin: requestOrigin(), homepage };
  });

/**
 * Published layout + tokens for a functional storefront page. Lets search,
 * cart and checkout wear the merchant's theme without re-reading the whole
 * catalogue the way the home loader does.
 */
export const getStoreChrome = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1),
        template: z.enum([
          "index",
          "product",
          "collection",
          "search",
          "page",
          "blog",
          "cart",
          "checkout",
          "account",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { loadStoreChrome } = await import("./storefront.server");
    const { requestOrigin } = await import("./site-origin.server");
    const chrome = await loadStoreChrome(data.slug, data.template);
    if (!chrome) return null;
    return { ...chrome, origin: requestOrigin() };
  });

export const getStoreProduct = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ slug: z.string().min(1), productSlug: z.string().min(1) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { loadStoreProduct } = await import("./storefront.server");
    const { requestOrigin } = await import("./site-origin.server");
    const found = await loadStoreProduct(data.slug, data.productSlug);
    if (!found) return null;
    const { responsiveImage } = await import("./image-cdn.server");
    const image = await responsiveImage(found.product.image_url, "hero");
    return {
      ...found,
      product: { ...found.product, image },
      origin: requestOrigin(),
    };
  });

export const quoteCart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1),
        cart: cartSchema,
        paymentMethod: methodSchema,
        couponCode: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { priceCart } = await import("./pricing.server");
    const { totals, settings } = await priceCart(
      data.slug,
      data.cart,
      data.paymentMethod,
      data.couponCode,
    );
    return { totals, settings };
  });

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1),
        cart: cartSchema,
        paymentMethod: methodSchema,
        idempotencyKey: z.string().min(8).max(64),
        checkoutToken: z.string().min(8).max(80).optional(),
        couponCode: z.string().max(40).optional(),
        honeypot: z.string().max(200).optional(),
        beacon: z
          .object({
            userAgent: z.string().max(400).nullable().optional(),
            interactions: z.number().int().min(0).max(100000).optional(),
            dwellMs: z.number().int().min(0).max(86_400_000).optional(),
            pointerMoves: z.number().int().min(0).max(1_000_000).optional(),
            webdriver: z.boolean().optional(),
          })
          .nullable()
          .optional(),

        customer: z.object({
          name: z.string().min(2).max(120),
          phone: z.string().min(6).max(24),
          email: z.string().email().optional().or(z.literal("")),
          addressLine: z.string().min(4).max(300),
          city: z.string().min(2).max(80),
          postcode: z.string().max(16).optional().or(z.literal("")),
          note: z.string().max(500).optional().or(z.literal("")),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { createOrder } = await import("./orders.server");
    const { requestFingerprint } = await import("./identity.server");
    const { ipHash } = await requestFingerprint();
    return createOrder(data, ipHash);
  });

export const reserveCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1),
        cart: cartSchema,
        checkoutToken: z.string().min(8).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { reserveCheckoutStock } = await import("./orders.server");
    const { requestFingerprint } = await import("./identity.server");
    const { ipHash } = await requestFingerprint();
    return reserveCheckoutStock(
      data.slug,
      data.checkoutToken,
      data.cart,
      ipHash,
    );
  });

export const releaseCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        checkoutToken: z.string().min(8).max(80),
        // Store slug lets the server bind the token to its merchant.
        // REQUIRED (fail-closed): a missing slug is a validation error and
        // an unknown slug throws below — no bare-token release path exists.
        slug: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { releaseStock } = await import("./checkout.server");
    const { publicClient } = await import("./pricing.server");
    const { data: merchant } = await publicClient()
      .from("merchants")
      .select("id")
      .eq("slug", data.slug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) {
      const { log, incr } = await import("./observability.server");
      log("warn", "checkout.release_unscoped", {
        reason: "rejected: unknown store slug; no rows touched",
      });
      incr("framique_checkout_release_rejected_total", {
        reason: "unknown_slug",
      });
      throw new Error("checkout_release_unknown_store");
    }
    return releaseStock(
      data.checkoutToken,
      (merchant as unknown as { id: string }).id,
    );
  });

export const getOrder = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        token: z.string().min(16).max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { loadOrder } = await import("./orders.server");
    const { requestFingerprint } = await import("./identity.server");
    const { ipHash } = await requestFingerprint();
    return loadOrder(data.orderId, data.token, ipHash);
  });

export const getFeaturedStoreSlug = createServerFn({ method: "GET" }).handler(
  async () => {
    const { featuredStoreSlug } = await import("./storefront.server");
    return featuredStoreSlug();
  },
);

export const resolveProductLocation = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ productId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { locateProduct } = await import("./storefront.server");
    return locateProduct(data.productId);
  });

export const resolveOrderLocation = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { locateOrder } = await import("./storefront.server");
    return locateOrder(data.orderId);
  });

export const getStoreCollection = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ slug: z.string().min(1), collectionSlug: z.string().min(1) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { loadStoreCollection } = await import("./storefront.server");
    const { requestOrigin } = await import("./site-origin.server");
    const found = await loadStoreCollection(data.slug, data.collectionSlug);
    if (!found) return null;
    const { responsiveImage } = await import("./image-cdn.server");
    const products = await Promise.all(
      found.products.map(async (p) => ({
        ...p,
        image: await responsiveImage(p.image_url, "card"),
      })),
    );
    return { ...found, products, origin: requestOrigin() };
  });

/**
 * Custom-domain host resolution (public, unauthenticated).
 *
 * Reads the request host server-side and returns the active-domain mapping,
 * or null when this host is a platform host / unknown / not active. Null
 * means "fall through to normal routes" — the `/` landing is never hijacked.
 */
export const resolveStorefrontHostFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { resolveStorefrontHost } = await import("./storefront-host.server");
  return resolveStorefrontHost();
});

/**
 * System-domain-only theme preview gate (Sept 2026 security fix).
 *
 * The `/theme-preview/$key` route loader calls this and throws notFound()
 * when denied. Reads the live request host server-side, so client-side SPA
 * navigation on a merchant host is denied exactly like direct hits (which
 * the `server.ts` edge gate already 404s before SSR). Fail closed: any
 * resolution failure denies.
 */
export const themePreviewHostGateFn = createServerFn({
  method: "GET",
}).handler(async () => {
  // Rule 28 shared path: loopback-aware preview host (not the strict
  // custom-domain normalizer), with trusted XFH handling. Fail closed.
  const { currentPreviewHost, isThemePreviewHostAllowed } =
    await import("./storefront-host.server");
  return { allowed: isThemePreviewHostAllowed(currentPreviewHost()) };
});

/**
 * Primary custom-domain hostname for the signed-in merchant's active store.
 *
 * Powers the dashboard "View store" anchor: custom-domain-only storefront
 * means the link must be `https://<primary>/` when a primary exists, with a
 * `/store/<slug>` fallback otherwise. Returns `{ primaryHost: null }` when
 * the merchant has no active primary — never throws.
 */
export const currentMerchantPrimaryHostFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { currentMerchantId } = await import("./marketing.server");
      const merchantId = await currentMerchantId(
        context.supabase,
        context.userId,
      );
      if (!merchantId) return { primaryHost: null as string | null };
      const { primaryHostForMerchant } =
        await import("./storefront-host.server");
      return {
        primaryHost: await primaryHostForMerchant(merchantId),
      };
    } catch {
      return { primaryHost: null as string | null };
    }
  });

/**
 * `redirect_to_primary` enforcement for `/store/<slug>` path URLs (public).
 *
 * Returns `{ to }` with an absolute `https://<primary>/` URL when the
 * merchant has an active primary custom domain and the request did not
 * already arrive on it; otherwise `{ to: null }` and the path URL keeps
 * serving. Never throws: resolution failure degrades to no-redirect.
 */
export const resolveStoreRedirectFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        subpath: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { resolveStoreRedirectForSlug, resolveStoreRedirectForSlugPath } =
        await import("./storefront-host.server");
      if (data.subpath) {
        return {
          to: await resolveStoreRedirectForSlugPath(data.slug, data.subpath),
        };
      }
      return { to: await resolveStoreRedirectForSlug(data.slug) };
    } catch {
      return { to: null };
    }
  });
