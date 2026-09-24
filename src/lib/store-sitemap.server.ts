/**
 * Merchant sitemap entries (custom-domain cutover).
 *
 * Pure builder: root-shape paths for the merchant catalogue. Every kind honors
 * the merchant's permalink settings via `buildPermalink`, so the `<loc>`s a
 * custom host advertises are exactly the canonicals the storefront renders.
 */
import {
  absolutePermalink,
  buildPermalink,
  DEFAULT_PERMALINKS,
  type PermalinkSettings,
} from "./permalink";

export type MerchantSitemapInput = {
  products: { slug: string; updated_at?: string | null }[];
  collections: { slug: string; updated_at?: string | null }[];
  pages: { slug: string; updated_at?: string | null }[];
  articles: {
    slug: string;
    updated_at?: string | null;
    published_at?: string | null;
  }[];
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
    {
      path: settings.articleBase || "/blog",
      changefreq: "daily",
      priority: "0.8",
    },
  ];
  for (const p of input.products) {
    entries.push({
      path: buildPermalink(settings, { kind: "product", slug: p.slug }),
      lastmod: p.updated_at?.slice(0, 10),
      changefreq: "weekly",
      priority: "0.8",
    });
  }
  for (const c of input.collections) {
    entries.push({
      path: buildPermalink(settings, { kind: "collection", slug: c.slug }),
      lastmod: c.updated_at?.slice(0, 10),
      changefreq: "weekly",
      priority: "0.7",
    });
  }
  for (const p of input.pages) {
    entries.push({
      path: buildPermalink(settings, { kind: "page", slug: p.slug }),
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

export type MerchantLlmsInput = {
  storeName: string;
  products: { slug: string; title?: string | null }[];
  collections: { slug: string; name?: string | null }[];
  pages: { slug: string; title?: string | null }[];
  articles?: {
    slug: string;
    title?: string | null;
    published_at?: string | null;
  }[];
  settings?: PermalinkSettings | null;
};

/**
 * Pure `llms.txt` body for a custom host. Every catalogue link is an
 * `absolutePermalink` canonical from the merchant's own permalink settings,
 * so the answer-engine map can never advertise a URL the storefront does not
 * serve (the exact drift the hardcoded `/p`/`/c`/`/pages` shapes caused after
 * a merchant renamed a base).
 */
export function buildMerchantLlmsTxt(
  origin: string,
  input: MerchantLlmsInput,
): string {
  const settings = input.settings ?? DEFAULT_PERMALINKS;
  const base = origin.replace(/\/+$/, "");
  const lines = [
    `# ${input.storeName}`,
    "",
    `Storefront: ${base}/`,
    "",
    "## Products",
    ...input.products
      .map((p) =>
        absolutePermalink(base, settings, {
          kind: "product",
          slug: p.slug,
        }),
      )
      .map(
        (url, i) =>
          `- [${input.products[i]?.title || input.products[i]?.slug}](${url})`,
      ),
    "",
    "## Collections",
    ...input.collections
      .map((c) =>
        absolutePermalink(base, settings, {
          kind: "collection",
          slug: c.slug,
        }),
      )
      .map(
        (url, i) =>
          `- [${input.collections[i]?.name || input.collections[i]?.slug}](${url})`,
      ),
    "",
    "## Pages",
    ...input.pages
      .map((p) =>
        absolutePermalink(base, settings, { kind: "page", slug: p.slug }),
      )
      .map(
        (url, i) =>
          `- [${input.pages[i]?.title || input.pages[i]?.slug}](${url})`,
      ),
    "",
    ...(input.articles?.length
      ? [
          "## Articles",
          ...input.articles.map(
            (a) =>
              `- [${a.title || a.slug}](${absolutePermalink(base, settings, {
                kind: "article",
                slug: a.slug,
                date: a.published_at ?? null,
              })})`,
          ),
          "",
        ]
      : []),
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ];
  return lines.join("\n");
}
