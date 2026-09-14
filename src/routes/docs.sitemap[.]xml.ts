import { createFileRoute } from "@tanstack/react-router";

/**
 * Docs-only sitemap shard.
 *
 * A shard rather than more rows in `/sitemap.xml` for two reasons: the docs
 * change on a different cadence to the marketing pages, and Search Console
 * coverage problems are far easier to read when the reference is isolated from
 * the landing pages. Only the current version is submitted — a retired version
 * is still served, but submitting both would be self-inflicted duplicate
 * content against a canonical that already points at the live page.
 */
export const Route = createFileRoute("/docs/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const { docsSitemapEntries } = await import("@/lib/docs");

        const urls = docsSitemapEntries()
          .filter((entry) => entry.indexable)
          .map((entry) =>
            [
              "  <url>",
              `    <loc>${origin}${entry.path}</loc>`,
              `    <lastmod>${entry.lastmod}</lastmod>`,
              "    <changefreq>weekly</changefreq>",
              `    <priority>${entry.priority}</priority>`,
              `    <xhtml:link rel="alternate" hreflang="en" href="${origin}${entry.path}"/>`,
              `    <xhtml:link rel="alternate" hreflang="bn-BD" href="${origin}${entry.path}?lang=bn"/>`,
              `    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}${entry.path}"/>`,
              "  </url>",
            ].join("\n"),
          )
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`;

        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            // Static content, but a short TTL keeps a docs edit from taking a
            // day to reach a crawler that honours cache headers.
            "cache-control": "public, max-age=600, s-maxage=3600",
          },
        });
      },
    },
  },
});
