import { createFileRoute } from "@tanstack/react-router";

/** Signed-in and transactional paths are kept out of crawlers; every published
 * store advertises its own sitemap so per-tenant pages are discoverable. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { listPublicStores } = await import("@/lib/marketing.server");
        const { marketingAllowPaths, MARKETING_ROUTES } = await import("@/lib/marketing-seo");
        const origin = new URL(request.url).origin;
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
          ...MARKETING_ROUTES.filter((r) => !r.indexable).map((r) => `Disallow: ${r.path}`),
          "Disallow: /admin",
          "Disallow: /root",
          "Disallow: /auth",
          "Disallow: /checkout",
          "Disallow: /api/",
          "Disallow: /unsubscribe",
          "Disallow: /newsletter/verify",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
        ];
        for (const store of await listPublicStores()) {
          lines.push(`Sitemap: ${origin}/store/${store.slug}/sitemap.xml`);
        }
        // Answer engines get the marketing map the same way each store
        // advertises its own; a plain-text pointer costs nothing and saves a
        // crawler six page fetches to learn what the product is.
        lines.push("");
        lines.push(`# llms.txt: ${origin}/llms.txt`);
        return new Response(`${lines.join("\n")}\n`, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});
