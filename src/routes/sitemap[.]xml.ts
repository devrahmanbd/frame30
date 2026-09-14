import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
  /** bn/en alternates, emitted as `xhtml:link` rows. */
  alternates?: { hrefLang: string; href: string }[];
}

/** XML-safe attribute value: `?lang=` URLs carry `&` once more params exist. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const BASE_URL = new URL(request.url).origin;
        const { listPublishedArticles, listPublicStores } = await import("@/lib/marketing.server");
        const { marketingSitemapEntries } = await import("@/lib/marketing-seo");

        // Marketing URLs come from the one registry that also feeds every
        // route's canonical, so a page can never be in the sitemap with a
        // canonical pointing somewhere else. Non-indexable rows (e.g. /status)
        // are filtered out there, not here.
        const entries: SitemapEntry[] = marketingSitemapEntries(BASE_URL).map((entry) => ({
          path: entry.path,
          lastmod: entry.lastmod,
          changefreq: entry.changefreq,
          priority: entry.priority,
          alternates: entry.alternates ?? [],
        }));

        for (const store of await listPublicStores()) {
          entries.push({ path: `/store/${store.slug}`, changefreq: "daily", priority: "0.9" });
        }

        for (const article of await listPublishedArticles()) {
          entries.push({
            path: `/blog/${article.slug}`,
            lastmod: (article.updated_at ?? article.published_at ?? undefined)?.slice(0, 10),
            changefreq: "monthly",
            priority: "0.7",
          });
        }

        // Term archives, but only the indexable ones: `listArchiveUrls` filters
        // out empty and `robots_index = false` terms, because submitting a URL
        // we render `noindex` is the "Submitted URL marked noindex" conflict.
        const { listArchiveUrls } = await import("@/lib/blog-index.server");
        for (const archive of await listArchiveUrls()) {
          entries.push({
            path: archive.path,
            lastmod: archive.updatedAt?.slice(0, 10),
            changefreq: "weekly",
            priority: "0.5",
          });
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            ...(e.alternates ?? []).map(
              (alt) =>
                `    <xhtml:link rel="alternate" hreflang="${alt.hrefLang}" href="${escapeXml(alt.href)}"/>`,
            ),
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
