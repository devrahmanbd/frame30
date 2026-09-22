import { createFileRoute } from "@tanstack/react-router";

/**
 * Custom-host sitemap shard: `/sitemaps/products-2.xml`.
 *
 * Mirrors the per-store `store.$slug.sitemaps.$kind` loader, but resolves the
 * merchant from the request host (`resolveStorefrontHost`) instead of the
 * `$slug` param, and renders root-shape `<loc>`s from the merchant's own
 * permalink settings (`absolutePermalink` canonicals). Off-host (platform,
 * unknown, loopback) there is no merchant to serve, so the route 404s and the
 * platform `/sitemap.xml` stays the only index crawlers see.
 */
export const Route = createFileRoute("/sitemaps/$kind")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { parseShardParam } = await import("@/lib/sitemap-config");
        const parsed = parseShardParam(params.kind);
        if (!parsed) return new Response("Not found", { status: 404 });
        const origin = new URL(request.url).origin;
        try {
          const { resolveStorefrontHost } = await import(
            "@/lib/storefront-host.server"
          );
          const host = await resolveStorefrontHost();
          if (!host) return new Response("Not found", { status: 404 });
          const { renderStoreSitemapShard } = await import(
            "@/lib/sitemap-config.server"
          );
          const doc = await renderStoreSitemapShard(
            host.merchantSlug,
            parsed.kind,
            parsed.page,
            origin,
            { root: true },
          );
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
            kind: parsed.kind,
            page: parsed.page,
            root: true,
            message: error instanceof Error ? error.message : String(error),
          });
          incr("framique_sitemap_error_total", { surface: "shard-root" });
          return new Response("Sitemap temporarily unavailable", {
            status: 503,
            headers: {
              "retry-after": "120",
              "content-type": "text/plain; charset=utf-8",
            },
          });
        }
      },
    },
  },
});
