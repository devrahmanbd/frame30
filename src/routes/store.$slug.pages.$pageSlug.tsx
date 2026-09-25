import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StudioNodes } from "@/components/store/StudioNodes";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { useLang } from "@/lib/i18n";
import { buildPageHead } from "@/lib/theme-seo";
import { getStorePageFn } from "@/lib/storefront-search.functions";
import { verificationTags } from "@/lib/search-console";
import { handleMissingStoreUrl } from "@/lib/missing-url";
import { PageView } from "@/components/store/PageView";

export const Route = createFileRoute("/store/$slug/pages/$pageSlug")({
  loader: async ({ params }) => {
    const found = await getStorePageFn({
      data: { slug: params.slug, pageSlug: params.pageSlug },
    });
    if (!found)
      throw await handleMissingStoreUrl(
        params.slug,
        `/store/${params.slug}/pages/${params.pageSlug}`,
      );
    return found;
  },
  head: ({ loaderData, params }) => {
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
      path: `/store/${params.slug}/pages/${loaderData.page.slug}`,
      storePath: `/store/${params.slug}`,
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
