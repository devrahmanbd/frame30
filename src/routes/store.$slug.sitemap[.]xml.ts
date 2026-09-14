import { createFileRoute } from "@tanstack/react-router";

/**
 * Per-tenant sitemap index (Phase 4).
 *
 * The index is derived from live row counts and the merchant's own sitemap
 * settings, so it advertises exactly the shards that exist: a kind the
 * merchant excluded, or one with no publishable rows, produces no `<sitemap>`
 * entry at all. Failures answer 503 with `Retry-After` rather than a lie —
 * an empty index would tell Google the store has no URLs.
 */
export const Route = createFileRoute("/store/$slug/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const origin = new URL(request.url).origin;
        try {
          const { renderStoreSitemapIndex } = await import("@/lib/sitemap-config.server");
          const doc = await renderStoreSitemapIndex(params.slug, origin);
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
          log("error", "sitemap.index_failed", {
            slug: params.slug,
            message: error instanceof Error ? error.message : String(error),
          });
          incr("framique_sitemap_error_total", { surface: "index" });
          return new Response("Sitemap temporarily unavailable", {
            status: 503,
            headers: { "retry-after": "120", "content-type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
