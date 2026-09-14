import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/blog.xml")({
  server: { handlers: { GET: async ({ request }) => {
    const origin = new URL(request.url).origin;
    const { loadBlogFeed } = await import("@/lib/blog-reader.server");
    const { escapeFeedXml } = await import("@/lib/blog-reader");
    const rows = await loadBlogFeed();
    const items = rows.map((row) => `<item><title>${escapeFeedXml(row.title)}</title><link>${origin}/blog/${encodeURIComponent(row.slug)}</link><guid isPermaLink="true">${origin}/blog/${encodeURIComponent(row.slug)}</guid><description>${escapeFeedXml(row.excerpt ?? row.title)}</description>${row.author ? `<author>${escapeFeedXml(row.author.displayNameEn || row.author.displayName)}</author>` : ""}${row.published_at ? `<pubDate>${new Date(row.published_at).toUTCString()}</pubDate>` : ""}</item>`).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Framique Blog</title><link>${origin}/blog</link><description>Commerce guides, product stories and platform updates.</description><language>en</language><atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${origin}/blog.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
    return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
  } } },
});