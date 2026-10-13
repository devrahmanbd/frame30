import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StudioNodes } from "@/components/store/StudioNodes";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { useLang } from "@/lib/i18n";
import { buildPageHead } from "@/lib/theme-seo";
import { getStorePageFn } from "@/lib/storefront-search.functions";
import {
  StorefrontError,
  isStorefrontInfrastructureError,
  normalizeStorefrontLoaderError,
} from "@/components/store/StorefrontError";
import { verificationTags } from "@/lib/search-console";
import { handleMissingStoreUrl } from "@/lib/missing-url";
import { PageView } from "@/components/store/PageView";

export const Route = createFileRoute("/store/$slug/pages/$pageSlug")({
  loader: async ({ params }) => {
    let found;
    try {
      found = await getStorePageFn({
        data: { slug: params.slug, pageSlug: params.pageSlug },
      });
    } catch (err) {
      // Infrastructure blips (5xx/timeout) reach the shared errorComponent
      // with retry; only a null payload below takes the missing-URL verdict.
      if (!isStorefrontInfrastructureError(err)) throw err;
      throw normalizeStorefrontLoaderError(err);
    }
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
  errorComponent: StorefrontError,
  notFoundComponent: StorePageMissing,
});

function StorePageMissing() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">
        {t("Store not found", "দোকান পাওয়া যায়নি")}
      </h1>
    </main>
  );
}
