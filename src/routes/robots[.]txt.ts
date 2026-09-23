import { createFileRoute } from "@tanstack/react-router";

/** Signed-in and transactional paths are kept out of crawlers; every published
 * store advertises its own sitemap so per-tenant pages are discoverable. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { marketingAllowPaths, MARKETING_ROUTES } =
          await import("@/lib/marketing-seo");
        const { requestOrigin } = await import("@/lib/site-origin.server");
        const origin = requestOrigin() ?? new URL(request.url).origin;
        // Custom host: this merchant's robots + sitemap pointer, composed from
        // the merchant's own crawl settings (same renderer as the per-store
        // route, rebased to root paths). Platform hosts fall through to the
        // marketing document below.
        try {
          const { resolveStorefrontHost } = await import(
            "@/lib/storefront-host.server"
          );
          const host = await resolveStorefrontHost();
          if (host) {
            try {
              const { renderStoreRobotsTxt } = await import(
                "@/lib/sitemap-config.server"
              );
              const doc = await renderStoreRobotsTxt(
                host.merchantSlug,
                origin,
                { root: true },
              );
              if (doc) {
                return new Response(doc.body, {
                  headers: {
                    "content-type": "text/plain; charset=utf-8",
                    "cache-control": doc.cacheControl,
                  },
                });
              }
            } catch {
              // Fall through to the generic merchant document below.
            }
            return new Response(
              [
                "User-agent: *",
                "Allow: /",
                "Disallow: /cart",
                "Disallow: /checkout",
                "Disallow: /account",
                "Disallow: /order",
                "",
                `Sitemap: ${origin}/sitemap.xml`,
                "",
                `# llms.txt: ${origin}/llms.txt`,
                "",
              ].join("\n"),
              {
                headers: {
                  "content-type": "text/plain; charset=utf-8",
                  "cache-control": "public, max-age=3600",
                },
              },
            );
          }
        } catch {
          // Fall through to the platform document.
        }
        const lines = [
          "User-agent: *",
          "Allow: /",
          "",
          "User-agent: SemrushBot",
          "Allow: /",
          "",
          // Marketing surfaces are named explicitly so a future broad
          // Disallow cannot accidentally swallow the pages we rank on.
          ...marketingAllowPaths().map((path) => `Allow: ${path}`),
          // Non-indexable marketing routes (live status) stay out of the index
          // and out of the crawl budget; the head also carries noindex.
          ...MARKETING_ROUTES.filter((r) => !r.indexable).map(
            (r) => `Disallow: ${r.path}`,
          ),
          "Disallow: /dashboard",
          "Disallow: /admin",
          "Disallow: /auth",
          "Disallow: /checkout",
          "Disallow: /api/",
          "Disallow: /unsubscribe",
          "Disallow: /newsletter/verify",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
        ];
        // NOTE: per-store /store/<slug>/sitemap.xml locs are intentionally
        // absent — path storefronts are retired (410), so advertising them
        // would submit dead URLs. Stores are discovered via their own
        // domains (see the custom-host branch above).
        // Answer engines get the marketing map the same way each store
        // advertises its own; a plain-text pointer costs nothing and saves a
        // crawler six page fetches to learn what the product is.
        lines.push("");
        lines.push(`# llms.txt: ${origin}/llms.txt`);
        return new Response(`${lines.join("\n")}\n`, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
