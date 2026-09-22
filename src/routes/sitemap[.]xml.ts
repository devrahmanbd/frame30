import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Merchant sitemap branch: catalogue entries with root-shape paths for the
 * custom host's own merchant. Bounded queries, fail-soft to an index-only
 * document — a sitemap must render even when catalogue reads fail.
 */
async function merchantSitemap(
  slug: string,
  origin: string,
): Promise<Response> {
  const { renderSitemapXml, buildMerchantSitemapEntries } = await import(
    "@/lib/store-sitemap.server"
  );
  try {
    const { publicClient } = await import("@/lib/pricing.server");
    const db = publicClient() as unknown as {
      from: (t: string) => any;
    };
    const { data: merchant } = await db
      .from("merchants")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) throw new Error("unknown_merchant");
    const merchantId = (merchant as { id: string }).id;
    const now = new Date().toISOString();
    const [products, collections, pages, articles, settings] =
      await Promise.all([
        db
          .from("products")
          .select("slug, updated_at")
          .eq("merchant_id", merchantId)
          .eq("status", "active")
          .limit(500)
          .then((r: any) => r.data ?? []),
        db
          .from("collections")
          .select("slug, updated_at")
          .eq("merchant_id", merchantId)
          .eq("is_published", true)
          .limit(200)
          .then((r: any) => r.data ?? []),
        db
          .from("storefront_pages")
          .select("slug, updated_at")
          .eq("merchant_id", merchantId)
          .eq("is_published", true)
          .is("deleted_at", null)
          .limit(200)
          .then((r: any) => r.data ?? []),
        db
          .from("articles")
          .select("slug, updated_at, published_at")
          .eq("merchant_id", merchantId)
          .eq("status", "published")
          .lte("published_at", now)
          .is("deleted_at", null)
          .limit(500)
          .then((r: any) => r.data ?? []),
        import("@/lib/permalink.server")
          .then((m) =>
            m.permalinkSettingsFor(db as never, merchantId),
          )
          .catch(() => null),
      ]);
    return renderSitemapXml(
      origin,
      buildMerchantSitemapEntries({
        products,
        collections,
        pages,
        articles,
        settings,
      }),
    );
  } catch {
    const { renderSitemapXml } = await import("@/lib/store-sitemap.server");
    return renderSitemapXml(origin, [
      { path: "/", changefreq: "daily", priority: "1.0" },
    ]);
  }
}

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?:
    "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
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
        const { requestOrigin } = await import("@/lib/site-origin.server");
        const BASE_URL = requestOrigin() ?? new URL(request.url).origin;
        // Custom-domain-only cutover: on a merchant host serve that
        // merchant's catalogue with root-shape paths. Prefer the sharded
        // index (same renderer as the per-store route, rebased to root shard
        // locs via absolutePermalink canonicals); fall back to the flat
        // merchant urlset when crawl settings are unavailable. The platform
        // shape below must not advertise dead /store/* locs (path URLs 410),
        // so the per-store loop is gone; global articles stay (they resolve).
        try {
          const { resolveStorefrontHost } = await import(
            "@/lib/storefront-host.server"
          );
          const host = await resolveStorefrontHost();
          if (host) {
            try {
              const { renderStoreSitemapIndex } = await import(
                "@/lib/sitemap-config.server"
              );
              const doc = await renderStoreSitemapIndex(
                host.merchantSlug,
                BASE_URL,
                { root: true },
              );
              if (doc) {
                return new Response(doc.body, {
                  headers: {
                    "Content-Type": "application/xml",
                    "Cache-Control": doc.cacheControl,
                    "x-robots-tag": "noindex",
                  },
                });
              }
            } catch {
              // Fall through to the flat merchant urlset below.
            }
            return merchantSitemap(host.merchantSlug, BASE_URL);
          }
        } catch {
          // Fall through to the platform sitemap.
        }
        const { listPublishedArticles } = await import(
          "@/lib/marketing.server"
        );
        const { marketingSitemapEntries } = await import("@/lib/marketing-seo");

        // Marketing URLs come from the one registry that also feeds every
        // route's canonical, so a page can never be in the sitemap with a
        // canonical pointing somewhere else. Non-indexable rows (e.g. /status)
        // are filtered out there, not here.
        const entries: SitemapEntry[] = marketingSitemapEntries(BASE_URL).map(
          (entry) => ({
            path: entry.path,
            lastmod: entry.lastmod,
            changefreq: entry.changefreq,
            priority: entry.priority,
            alternates: entry.alternates ?? [],
          }),
        );

        // NOTE: no per-store /store/<slug> entries — path storefronts are
        // retired (410); stores are discovered via their own domains.
        // The custom-host branch above serves merchant catalogues.

        for (const article of await listPublishedArticles()) {
          entries.push({
            path: `/blog/${article.slug}`,
            lastmod: (
              article.updated_at ??
              article.published_at ??
              undefined
            )?.slice(0, 10),
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
            e.changefreq
              ? `    <changefreq>${e.changefreq}</changefreq>`
              : null,
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
