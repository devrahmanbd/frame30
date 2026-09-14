import { createFileRoute } from "@tanstack/react-router";

/**
 * One sitemap shard: `/store/:slug/sitemaps/products-2.xml`.
 *
 * The `$kind` param carries both kind and page (`products`, `products-2`,
 * with or without `.xml`) so a 50 000-row catalogue is served as bounded,
 * individually cacheable files. Every shard is range-queried server-side; the
 * route itself never sees more rows than the configured page size.
 */
export const Route = createFileRoute("/store/$slug/sitemaps/$kind")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { parseShardParam } = await import("@/lib/sitemap-config");
        const parsed = parseShardParam(params.kind);
        if (!parsed) return new Response("Not found", { status: 404 });
        const origin = new URL(request.url).origin;
        try {
          const { renderStoreSitemapShard } = await import("@/lib/sitemap-config.server");
          const doc = await renderStoreSitemapShard(params.slug, parsed.kind, parsed.page, origin);
          if (!doc) return new Response("Not found", { status: 404 });
          return new Response(doc.body, {
            headers: {
              "content-type": "application/xml; charset=utf-8",
              "cache-control": doc.cacheControl,
              "x-robots-tag": "noindex",
            },
          });
        } catch (error) {
          const { log, incr } = await import("@/lib/observability.server");
          log("error", "sitemap.shard_failed", {
            slug: params.slug,
            kind: parsed.kind,
            page: parsed.page,
            message: error instanceof Error ? error.message : String(error),
          });
          incr("framique_sitemap_error_total", { surface: "shard" });
          return new Response("Sitemap temporarily unavailable", {
            status: 503,
            headers: { "retry-after": "120", "content-type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
