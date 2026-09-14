import { createFileRoute } from "@tanstack/react-router";

/**
 * Per-store robots.txt, composed from the merchant's crawl settings.
 *
 * The platform's safety directives (`/admin`, `/checkout`, `/api`, `/auth`
 * and the store's transactional paths) are re-appended after every merchant
 * rule by `renderRobotsTxt`, so no dashboard input can open them. On failure
 * we serve a conservative fallback instead of nothing: an unreachable
 * robots.txt is treated by Google as "crawl everything".
 */
export const Route = createFileRoute("/store/$slug/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const origin = new URL(request.url).origin;
        try {
          const { renderStoreRobotsTxt } = await import("@/lib/sitemap-config.server");
          const doc = await renderStoreRobotsTxt(params.slug, origin);
          if (!doc) return new Response("Not found", { status: 404 });
          return new Response(doc.body, {
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": doc.cacheControl,
            },
          });
        } catch (error) {
          const { log, incr } = await import("@/lib/observability.server");
          log("error", "robots.render_failed", {
            slug: params.slug,
            message: error instanceof Error ? error.message : String(error),
          });
          incr("framique_robots_error_total", {});
          const base = `/store/${params.slug}`;
          const fallback = [
            "# degraded: merchant settings unavailable, serving platform defaults",
            "User-agent: *",
            `Allow: ${base}`,
            `Disallow: ${base}/checkout`,
            `Disallow: ${base}/account`,
            `Disallow: ${base}/order`,
            `Disallow: ${base}/track`,
            "Disallow: /admin",
            "Disallow: /root",
            "Disallow: /auth",
            "Disallow: /checkout",
            "Disallow: /api/",
            "",
            `Sitemap: ${origin}${base}/sitemap.xml`,
          ].join("\n");
          return new Response(`${fallback}\n`, {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "public, max-age=60",
            },
          });
        }
      },
    },
  },
});
