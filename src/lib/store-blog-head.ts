/**
 * Tenant blog head builders (T5+D3).
 *
 * Pure module by contract: no React, no Supabase, no clock. Every canonical
 * and JSON-LD URL comes from `buildPermalink`/`absolutePermalink` in
 * `permalink.ts`, so a merchant pattern change flows to the listing, the
 * article canonical and the sitemap without a second code path.
 *
 * Canonical decision: on a custom host the store URL wins — every canonical,
 * `og:url` and JSON-LD `url` is absolute against the request origin. Without
 * an origin (no request context) the builders degrade to store-relative
 * paths rather than inventing a host.
 */
import {
  absolutePermalink,
  buildPermalink,
  type PermalinkSettings,
} from "./permalink";
import {
  archiveHead,
  blogPagePath,
  breadcrumbJsonLd,
  type Paging,
} from "./blog-taxonomy";
import type { StoreArticle } from "./store-blog.server";

export type StoreArticleIdentity = {
  slug: string;
  publishedAt?: string | null;
  categorySlug?: string | null;
};

/** Serving base of the tenant listing on a custom host (`/blog` default). */
export function storeBlogBasePath(settings: PermalinkSettings): string {
  return settings.articleBase || "/blog";
}

/** Store-relative article path under the merchant's live pattern. */
export function storeArticlePath(
  settings: PermalinkSettings,
  article: StoreArticleIdentity,
): string {
  return buildPermalink(settings, {
    kind: "article",
    slug: article.slug,
    date: article.publishedAt ?? null,
    category: article.categorySlug ?? null,
  });
}

/**
 * Absolute store canonical for an article when the request origin is known,
 * otherwise the store-relative path. An explicit author `canonical` override
 * is honoured first — same precedence as the global reader.
 */
export function storeArticleCanonical(
  origin: string | null,
  settings: PermalinkSettings,
  article: StoreArticleIdentity & { canonical?: string | null },
): string {
  if (article.canonical) return article.canonical;
  const entity = {
    kind: "article" as const,
    slug: article.slug,
    date: article.publishedAt ?? null,
    category: article.categorySlug ?? null,
  };
  return origin
    ? absolutePermalink(origin, settings, entity)
    : buildPermalink(settings, entity);
}

function absolute(origin: string | null, path: string): string {
  if (!origin || !/^https?:\/\//.test(origin)) return path;
  return `${origin.replace(/\/+$/, "")}${path}`;
}

export function storeListingHead(input: {
  origin: string | null;
  settings: PermalinkSettings;
  merchantName: string;
  description?: string;
  paging: Paging;
  articles: {
    slug: string;
    title: string;
    publishedAt?: string | null;
    categorySlug?: string | null;
  }[];
}): {
  meta: Record<string, string>[];
  links: Record<string, string>[];
  scripts: { type: string; children: string }[];
} {
  const basePath = storeBlogBasePath(input.settings);
  const description =
    input.description ??
    `Guides, product stories and updates from ${input.merchantName}.`;
  const { meta, links } = archiveHead({
    origin: input.origin,
    basePath,
    titleEn: `${input.merchantName} Blog`,
    description,
    paging: input.paging,
    indexable: true,
    siteName: input.merchantName,
  });
  // Platform RSS alternates and `listingJsonLd` (both hardcode `/blog/*`
  // platform paths) stay global-mode-only by design: the store graph below
  // advertises the merchant's own permalink URLs instead.
  const start = input.paging.from;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${input.merchantName} Blog`,
    description,
    url: absolute(input.origin, blogPagePath(basePath, input.paging.page)),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.paging.total,
      itemListElement: input.articles.map((article, index) => ({
        "@type": "ListItem",
        position: start + index + 1,
        url: storeArticleCanonical(input.origin, input.settings, article),
        name: article.title,
      })),
    },
  };
  return {
    meta,
    links,
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(jsonLd) },
    ],
  };
}

export function storeArticleHead(input: {
  origin: string | null;
  settings: PermalinkSettings;
  merchantName: string;
  article: StoreArticle;
}): {
  meta: Record<string, string>[];
  links: Record<string, string>[];
  scripts: { type: string; children: string }[];
} {
  const { article } = input;
  const title = article.metaTitle ?? `${article.title} — ${input.merchantName}`;
  const description =
    article.metaDescription ?? article.excerpt ?? article.title;
  const canonical = storeArticleCanonical(input.origin, input.settings, {
    slug: article.slug,
    publishedAt: article.publishedAt,
    categorySlug: article.category?.slug ?? null,
    canonical: article.canonical,
  });
  const robots = article.robots ?? "index,follow";
  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robots },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: canonical },
    {
      name: "twitter:card",
      content: article.coverImageUrl ? "summary_large_image" : "summary",
    },
    { property: "article:published_time", content: article.publishedAt ?? "" },
    {
      property: "article:modified_time",
      content: article.updatedAt ?? article.publishedAt ?? "",
    },
  ];
  if (article.coverImageUrl?.startsWith("https://"))
    meta.push(
      { property: "og:image", content: article.coverImageUrl },
      { name: "twitter:image", content: article.coverImageUrl },
    );
  const crumbs = [
    { name: input.merchantName, path: "/" },
    { name: "Blog", path: storeBlogBasePath(input.settings) },
    {
      name: article.title,
      path: storeArticlePath(input.settings, {
        slug: article.slug,
        publishedAt: article.publishedAt,
        categorySlug: article.category?.slug ?? null,
      }),
    },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description,
    url: canonical,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    ...(article.coverImageUrl?.startsWith("https://")
      ? { image: [article.coverImageUrl] }
      : {}),
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
    timeRequired: `PT${Math.max(1, article.readingMinutes)}M`,
    author: { "@type": "Organization", name: input.merchantName },
    publisher: { "@type": "Organization", name: input.merchantName },
  };
  return {
    meta,
    links: [{ rel: "canonical", href: canonical }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(jsonLd) },
      {
        type: "application/ld+json",
        children: JSON.stringify(breadcrumbJsonLd(input.origin, crumbs)),
      },
    ],
  };
}
