import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { useLang } from "@/lib/i18n";
import { buildPageHead } from "@/lib/theme-seo";
import { getStorePageFn } from "@/lib/storefront-search.functions";
import { verificationTags } from "@/lib/search-console";
import { handleMissingStoreUrl } from "@/lib/missing-url";
import { resolveStorefrontHostFn } from "@/lib/storefront.functions";
import { PageView } from "@/components/store/PageView";

/**
 * Custom-host store page (`microscrop.shop/pages/<slug>`).
 *
 * Host-gated like `/p/$productSlug`: resolves the request host, serves the
 * merchant page. Same-route SSR + hydration (no rewrite), so no mismatch.
 */
export const Route = createFileRoute("/pages/$pageSlug")({
  loader: async ({ params, location }) => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (!host) throw notFound();
    const found = await getStorePageFn({
      data: { slug: host.merchantSlug, pageSlug: params.pageSlug },
    });
    if (!found)
      throw await handleMissingStoreUrl(
        host.merchantSlug,
        `/pages/${params.pageSlug}`,
      );
    // Custom bases: the old prefixed URL still matches this static route,
    // so canonicalize it here instead of serving duplicates.
    const { canonicalRedirectFn } = await import(
      "@/lib/permalink.functions"
    );
    const { to } = await canonicalRedirectFn({
      data: {
        merchantId: found.merchant.id,
        kind: "page",
        slug: found.page.slug,
        pathname: location.pathname,
      },
    });
    if (to) throw redirect({ href: to, replace: true });
    return found;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Page unavailable" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const base = buildPageHead({
      origin: loaderData.origin,
      path: `/pages/${loaderData.page.slug}`,
      storePath: `/`,
      storeName: loaderData.merchant.name,
      themeKey: loaderData.themeKey,
      robots: loaderData.page.robots,
      noindex: (loaderData.page.robots ?? "").startsWith("noindex"),
      seo: loaderData.seo ?? null,
      page: loaderData.page,
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
    return <PageView data={Route.useLoaderData()} />;
  },
});
