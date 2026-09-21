/**
 * Merchant sitemap entries (custom-domain cutover).
 *
 * Pure builder: root-shape paths for the merchant catalogue. Articles honor
 * the merchant's permalink settings; everything else uses the fixed shapes
 * the custom routes serve (/, /p, /c, /pages, /blog).
 */
import {
  buildPermalink,
  DEFAULT_PERMALINKS,
  type PermalinkSettings,
} from "./permalink";

export type MerchantSitemapInput = {
  products: { slug: string; updated_at?: string | null }[];
  collections: { slug: string; updated_at?: string | null }[];
  pages: { slug: string; updated_at?: string | null }[];
  articles: { slug: string; updated_at?: string | null; published_at?: string | null }[];
  settings?: PermalinkSettings | null;
};

export type SitemapEntry = {
  path: string;
  lastmod?: string;
  changefreq: "daily" | "weekly" | "monthly";
  priority: string;
};

export function buildMerchantSitemapEntries(
  input: MerchantSitemapInput,
): SitemapEntry[] {
  const settings = input.settings ?? DEFAULT_PERMALINKS;
  const entries: SitemapEntry[] = [
    { path: "/", changefreq: "daily", priority: "1.0" },
    { path: "/blog", changefreq: "daily", priority: "0.8" },
  ];
  for (const p of input.products) {
    entries.push({
      path: `/p/${p.slug}`,
      lastmod: p.updated_at?.slice(0, 10),
      changefreq: "weekly",
      priority: "0.8",
    });
  }
  for (const c of input.collections) {
    entries.push({
      path: `/c/${c.slug}`,
      lastmod: c.updated_at?.slice(0, 10),
      changefreq: "weekly",
      priority: "0.7",
    });
  }
  for (const p of input.pages) {
    entries.push({
      path: `/pages/${p.slug}`,
      lastmod: p.updated_at?.slice(0, 10),
      changefreq: "monthly",
      priority: "0.6",
    });
  }
  for (const a of input.articles) {
    entries.push({
      path: buildPermalink(settings, {
        kind: "article",
        slug: a.slug,
        date: a.published_at ?? null,
      }),
      lastmod: (a.updated_at ?? a.published_at ?? undefined)?.slice(0, 10),
      changefreq: "monthly",
      priority: "0.6",
    });
  }
  return entries;
}

export function renderSitemapXml(
  origin: string,
  entries: SitemapEntry[],
): Response {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${origin}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      `    <changefreq>${e.changefreq}</changefreq>`,
      `    <priority>${e.priority}</priority>`,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return new Response(
    [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...urls,
      `</urlset>`,
    ].join("\n"),
    {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
