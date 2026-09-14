import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/blog.atom")({
  server: { handlers: { GET: async ({ request }) => {
    const origin = new URL(request.url).origin;
    const { loadBlogFeed } = await import("@/lib/blog-reader.server");
    const { escapeFeedXml } = await import("@/lib/blog-reader");
    const rows = await loadBlogFeed();
    const updated = rows[0]?.updated_at ?? rows[0]?.published_at ?? new Date(0).toISOString();
    const entries = rows.map((row) => `<entry><title>${escapeFeedXml(row.title)}</title><id>${origin}/blog/${encodeURIComponent(row.slug)}</id><link href="${origin}/blog/${encodeURIComponent(row.slug)}"/>${row.published_at ? `<published>${row.published_at}</published>` : ""}<updated>${row.updated_at ?? row.published_at ?? updated}</updated><summary>${escapeFeedXml(row.excerpt ?? row.title)}</summary>${row.author ? `<author><name>${escapeFeedXml(row.author.displayNameEn || row.author.displayName)}</name></author>` : ""}</entry>`).join("");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Framique Blog</title><id>${origin}/blog</id><link href="${origin}/blog"/><link href="${origin}/blog.atom" rel="self"/><updated>${updated}</updated>${entries}</feed>`, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
  } } },
});