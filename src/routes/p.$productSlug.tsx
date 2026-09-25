import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { SupportWidget } from "@/components/store/SupportWidget";
import {
  getStoreProduct,
  resolveStorefrontHostFn,
} from "@/lib/storefront.functions";
import { handleMissingStoreUrl } from "@/lib/missing-url";
import { fmtMinor } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { trackEvent } from "@/lib/traffic-client";
import { useSectionChannel } from "@/components/builder/useSectionChannel";
import { useLang } from "@/lib/i18n";
import { buildProductHead } from "@/lib/theme-seo";
import { verificationTags } from "@/lib/search-console";
import { ProductView, ProductNotFound } from "@/components/store/ProductView";

/**
 * Custom-host product page (`microscrop.shop/p/<slug>`).
 *
 * Host-gated: resolves the request host to a merchant and serves its PDP.
 * Off custom hosts it 404s (platform hosts serve `/store/<slug>/p/...`;
 * the server gate 410s those). Same chrome + data as the path route, so
 * SPA hydration stays on this route instead of bouncing to notFound.
 */
export const Route = createFileRoute("/p/$productSlug")({
  loader: async ({ params }) => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (!host) throw notFound();
    const data = await getStoreProduct({
      data: { slug: host.merchantSlug, productSlug: params.productSlug },
    });
    if (!data)
      throw await handleMissingStoreUrl(
        host.merchantSlug,
        `/p/${params.productSlug}`,
      );
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Product unavailable" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const variants = loaderData.product.product_variants ?? [];
    const cheapest = variants
      .map((v) => Number(v.price_amount_minor_int ?? 0))
      .sort((x, y) => x - y)[0];
    const base = buildProductHead({
      origin: loaderData.origin,
      path: `/p/${loaderData.product.slug}`,
      storePath: `/`,
      storeName: loaderData.merchant.name,
      themeKey: loaderData.themeKey,
      seo: loaderData.seo,
      product: {
        title: loaderData.product.title,
        slug: loaderData.product.slug,
        description: loaderData.product.description,
        image_url: loaderData.product.image_url,
        sku: variants[0]?.sku ?? null,
      },
      currency: loaderData.merchant.currency_code,
      priceMinor: cheapest ?? 0,
      inStock: variants.some((v) => Number(v.stock_quantity ?? 0) > 0),
      reviews: loaderData.reviews ?? [],
      returnPolicy: { days: 7, fees: "shopper" },
      shipping: {
        flatMinor: Number(loaderData.settings?.shipping_flat_minor_int ?? 0),
        freeThresholdMinor:
          loaderData.settings?.free_shipping_threshold_minor_int ?? null,
      },
    });
    return {
      ...base,
      meta: [
        ...(base.meta ?? []),
        ...verificationTags(loaderData.siteKit.verification),
      ],
    };
  },
  component: function RouteComponent() {
    return <ProductView data={Route.useLoaderData()} />;
  },
  notFoundComponent: ProductNotFound,
});

