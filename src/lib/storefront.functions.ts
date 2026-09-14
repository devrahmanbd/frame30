import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PAYMENT_METHOD_KEYS } from "./payment-rails";

const cartSchema = z.array(
  z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) }),
);

const methodSchema = z.enum(PAYMENT_METHOD_KEYS);

export const getStorefront = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { loadStorefront } = await import("./storefront.server");
    const { requestOrigin } = await import("./site-origin.server");
    const found = await loadStorefront(data.slug);
    if (!found) return null;
    // Signed responsive variants are built here, not in the cached tenant
    // loader: the HMAC secret is server-only and the URLs are cheap to derive.
    const { responsiveImage } = await import("./image-cdn.server");
    const products = await Promise.all(
      found.products.map(async (p) => ({ ...p, image: await responsiveImage(p.image_url, "card") })),
    );
    // Origin is per-request, so it is resolved outside the tenant cache.
    return { ...found, products, origin: requestOrigin() };
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
        template: z.enum(["index", "product", "collection", "search", "page", "blog", "cart", "checkout"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { loadStoreChrome } = await import("./storefront.server");
    return loadStoreChrome(data.slug, data.template);
  });

export const getStoreProduct = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ slug: z.string().min(1), productSlug: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadStoreProduct } = await import("./storefront.server");
    const { requestOrigin } = await import("./site-origin.server");
    const found = await loadStoreProduct(data.slug, data.productSlug);
    if (!found) return null;
    const { responsiveImage } = await import("./image-cdn.server");
    const image = await responsiveImage(found.product.image_url, "hero");
    return { ...found, product: { ...found.product, image }, origin: requestOrigin() };
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
      .object({ slug: z.string().min(1), cart: cartSchema, checkoutToken: z.string().min(8).max(80) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { reserveCheckoutStock } = await import("./orders.server");
    const { requestFingerprint } = await import("./identity.server");
    const { ipHash } = await requestFingerprint();
    return reserveCheckoutStock(data.slug, data.checkoutToken, data.cart, ipHash);
  });

export const releaseCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ checkoutToken: z.string().min(8).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { releaseStock } = await import("./checkout.server");
    return releaseStock(data.checkoutToken);
  });

export const getOrder = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ orderId: z.string().uuid(), token: z.string().min(16).max(80).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadOrder } = await import("./orders.server");
    const { requestFingerprint } = await import("./identity.server");
    const { ipHash } = await requestFingerprint();
    return loadOrder(data.orderId, data.token, ipHash);
  });

export const getFeaturedStoreSlug = createServerFn({ method: "GET" }).handler(async () => {
  const { featuredStoreSlug } = await import("./storefront.server");
  return featuredStoreSlug();
});

export const resolveProductLocation = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { locateProduct } = await import("./storefront.server");
    return locateProduct(data.productId);
  });

export const resolveOrderLocation = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { locateOrder } = await import("./storefront.server");
    return locateOrder(data.orderId);
  });


export const getStoreCollection = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ slug: z.string().min(1), collectionSlug: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadStoreCollection } = await import("./storefront.server");
    const { requestOrigin } = await import("./site-origin.server");
    const found = await loadStoreCollection(data.slug, data.collectionSlug);
    if (!found) return null;
    const { responsiveImage } = await import("./image-cdn.server");
    const products = await Promise.all(
      found.products.map(async (p) => ({ ...p, image: await responsiveImage(p.image_url, "card") })),
    );
    return { ...found, products, origin: requestOrigin() };
  });
