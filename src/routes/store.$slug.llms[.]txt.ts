import { createFileRoute } from "@tanstack/react-router";

/**
 * Phase 7.4 — per-store `llms.txt`.
 *
 * A markdown map of what the catalogue contains, for answer engines that would
 * otherwise have to crawl every facet URL to learn it. Opt-in: it is served
 * only when the merchant lets AI crawlers in, which is the same decision
 * robots.txt already carries.
 */
export const Route = createFileRoute("/store/$slug/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { loadStoreRobotsPolicy, loadStoreLlmsSummary } = await import("@/lib/seo.server");
        const { renderLlmsTxt } = await import("@/lib/seo-answers");
        const origin = new URL(request.url).origin;
        const policy = await loadStoreRobotsPolicy(params.slug);
        if (!policy) return new Response("Not found", { status: 404 });
        if (!policy.indexable || !policy.aiCrawlers) {
          return new Response("Not found", { status: 404 });
        }
        const summary = await loadStoreLlmsSummary(params.slug);
        if (!summary) return new Response("Not found", { status: 404 });
        const body = renderLlmsTxt({
          storeName: summary.storeName,
          origin,
          slug: params.slug,
          tagline: summary.tagline || undefined,
          currency: summary.currency,
          productCount: summary.productCount,
          collections: summary.collections,
          pages: summary.pages,
          guides: summary.guides,
          locales: ["en", "bn"],
          contact: summary.contact || undefined,
        });
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
