import {
  createFileRoute,
  Link,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import {
  getStoreCollection,
  resolveStorefrontHostFn,
} from "@/lib/storefront.functions";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { flattenAst } from "@/lib/builder-ast";
import { CollectionView } from "@/components/store/CollectionView";

/**
 * Custom-host collection page (`microscrop.shop/c/<slug>`).
 *
 * Host-gated like `/p/$productSlug`: resolves the request host, serves the
 * merchant collection. Same-route SSR + hydration (no rewrite).
 */
export const Route = createFileRoute("/c/$collectionSlug")({
  loader: async ({ params, location }) => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (!host) {
      // No merchant on this host (platform domain): render the theme demo
      // instead of a dead end. Demo data, blocked actions, noindex.
      const { defaultPreviewKey } = await import("@/lib/preview-sources");
      throw redirect({
        to: "/theme-preview/$key",
        params: { key: defaultPreviewKey() },
        search: {
          template: "collection",
          slug: params.collectionSlug.toLowerCase().slice(0, 64),
        },
        replace: true,
      });
    }
    const data = await getStoreCollection({
      data: { slug: host.merchantSlug, collectionSlug: params.collectionSlug },
    });
    if (!data) throw notFound();
    // Custom bases: the old prefixed URL still matches this static route,
    // so canonicalize it here instead of serving duplicates.
    const { canonicalRedirectFn } = await import("@/lib/permalink.functions");
    const { to } = await canonicalRedirectFn({
      data: {
        merchantId: data.merchant.id,
        kind: "collection",
        slug: data.collection.slug,
        pathname: location.pathname,
      },
    });
    if (to) throw redirect({ href: to, replace: true });
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Collection unavailable" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title =
      loaderData.seo?.metaTitle ||
      `${loaderData.collection.name} — ${loaderData.merchant.name}`;
    const description =
      loaderData.seo?.metaDescription ||
      loaderData.collection.description ||
      `Shop ${loaderData.collection.name} at ${loaderData.merchant.name}.`;
    const canonicalPath = `/c/${loaderData.collection.slug}`;
    const canonical = loaderData.origin
      ? `${loaderData.origin}${canonicalPath}`
      : canonicalPath;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: function RouteComponent() {
    return <CollectionView data={Route.useLoaderData()} />;
  },
  notFoundComponent: () => (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Collection not found</h1>
    </main>
  ),
});
