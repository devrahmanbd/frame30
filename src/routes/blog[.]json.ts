import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/blog.json")({
  server: { handlers: { GET: async ({ request }) => {
    const origin = new URL(request.url).origin;
    const { loadBlogFeed } = await import("@/lib/blog-reader.server");
    const rows = await loadBlogFeed();
    return Response.json({ version: "https://jsonfeed.org/version/1.1", title: "Framique Blog", home_page_url: `${origin}/blog`, feed_url: `${origin}/blog.json`, language: "en", items: rows.map((row) => ({ id: `${origin}/blog/${row.slug}`, url: `${origin}/blog/${row.slug}`, title: row.title, summary: row.excerpt ?? undefined, date_published: row.published_at ?? undefined, date_modified: row.updated_at ?? undefined, authors: row.author ? [{ name: row.author.displayNameEn || row.author.displayName, url: `${origin}/blog/author/${row.author.slug}` }] : undefined })) }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
  } } },
});