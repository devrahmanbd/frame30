/**
 * Deterministic large-tenant fixture — Phase 9.4 query-discipline gate.
 *
 * §7 of the SEO roadmap claims every admin list, sitemap shard and dashboard
 * card stays bounded on a real catalogue. That claim was never proven, so this
 * fixture builds the tenant the claim is about: 50 000 rows spread across the
 * tables those surfaces read, seeded from a fixed PRNG so a failure is
 * reproducible byte-for-byte on CI and on a laptop.
 *
 * It is intentionally cheap: plain objects, no dates parsed per row, no
 * template literals inside the hot loop beyond what the shape needs. Building
 * the whole tenant costs tens of milliseconds, so a test can afford to do it
 * per suite rather than sharing mutable state between cases.
 */
import type { Row } from "./fake-db";

export const LARGE_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const LARGE_TENANT_SLUG = "big-store";

/** Row counts per table. The sum is the headline number in the roadmap. */
export const LARGE_TENANT_SHAPE = {
  products: 30_000,
  articles: 8_000,
  storefront_pages: 4_000,
  collections: 3_000,
  seo_meta: 4_000,
  orders: 1_000,
} as const;

export const LARGE_TENANT_TOTAL_ROWS = Object.values(LARGE_TENANT_SHAPE).reduce((a, b) => a + b, 0);

/** Mulberry32 — small, fast, and identical across runtimes. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "linen",
  "cotton",
  "kettle",
  "lantern",
  "ceramic",
  "walnut",
  "saffron",
  "indigo",
  "brass",
  "rattan",
  "monsoon",
  "delta",
];

function phrase(rand: () => number, count: number) {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) out.push(WORDS[Math.floor(rand() * WORDS.length)]!);
  return out.join(" ");
}

/** ISO timestamps stepping backwards one hour per row, so ordering is stable. */
function isoAt(index: number) {
  return new Date(Date.UTC(2025, 0, 1) - index * 3_600_000).toISOString();
}

export type LargeTenantOptions = {
  merchantId?: string;
  slug?: string;
  seed?: number;
  /** Scale every table down for a faster smoke run. 1 = the full fixture. */
  scale?: number;
  /**
   * Epoch millis the order stream counts back from. The dashboard reads a
   * rolling 7-day window, so orders must be *recent* or the fixture proves
   * nothing about its bounds. Defaults to "now" for that reason.
   */
  ordersNow?: number;
};

/**
 * Builds the seed map for `fakeDb({ tables })`. Every row carries the columns
 * the production selects actually project, plus `deleted_at`/`status` so tenant
 * and soft-delete filters are exercised rather than skipped.
 */
export function largeTenantTables(options: LargeTenantOptions = {}): Record<string, Row[]> {
  const merchantId = options.merchantId ?? LARGE_TENANT_ID;
  const slug = options.slug ?? LARGE_TENANT_SLUG;
  const scale = Math.min(1, Math.max(0.001, options.scale ?? 1));
  const rand = prng(options.seed ?? 20260415);
  const size = (n: number) => Math.max(1, Math.round(n * scale));

  const products: Row[] = [];
  for (let i = 0; i < size(LARGE_TENANT_SHAPE.products); i += 1) {
    products.push({
      id: `prod-${i}`,
      merchant_id: merchantId,
      title: `Product ${i} ${phrase(rand, 2)}`,
      slug: `product-${i}`,
      description: phrase(rand, 24),
      // A tenth of the catalogue is draft or archived: the render path must not
      // pay for rows it will never advertise.
      status: i % 10 === 0 ? "draft" : "active",
      deleted_at: i % 997 === 0 ? isoAt(i) : null,
      updated_at: isoAt(i),
      price_cents: 1000 + (i % 500) * 25,
    });
  }

  const articles: Row[] = [];
  for (let i = 0; i < size(LARGE_TENANT_SHAPE.articles); i += 1) {
    const published = i % 7 !== 0;
    articles.push({
      id: `art-${i}`,
      merchant_id: merchantId,
      title: `Article ${i} ${phrase(rand, 3)}`,
      slug: `article-${i}`,
      excerpt: phrase(rand, 12),
      body: phrase(rand, 220),
      status: published ? "published" : "draft",
      published_at: published ? isoAt(i) : null,
      updated_at: isoAt(i),
      deleted_at: null,
      focus_keyword: WORDS[i % WORDS.length],
    });
  }

  const pages: Row[] = [];
  for (let i = 0; i < size(LARGE_TENANT_SHAPE.storefront_pages); i += 1) {
    pages.push({
      id: `page-${i}`,
      merchant_id: merchantId,
      title: `Page ${i}`,
      slug: `page-${i}`,
      excerpt: phrase(rand, 8),
      body_markdown: phrase(rand, 120),
      is_published: i % 5 !== 0,
      robots: i % 11 === 0 ? "noindex,follow" : "index,follow",
      updated_at: isoAt(i),
      deleted_at: null,
    });
  }

  const collections: Row[] = [];
  for (let i = 0; i < size(LARGE_TENANT_SHAPE.collections); i += 1) {
    collections.push({
      id: `col-${i}`,
      merchant_id: merchantId,
      name: `Collection ${i}`,
      slug: `collection-${i}`,
      description: phrase(rand, 10),
      is_published: true,
      updated_at: isoAt(i),
      deleted_at: null,
    });
  }

  // Overrides cover only part of the catalogue — the realistic case, and the one
  // where a naive implementation issues one lookup per entity.
  const seoMeta: Row[] = [];
  for (let i = 0; i < size(LARGE_TENANT_SHAPE.seo_meta); i += 1) {
    const noindex = i % 13 === 0;
    seoMeta.push({
      id: `meta-${i}`,
      merchant_id: merchantId,
      entity_type: i % 3 === 0 ? "article" : "product",
      entity_id: i % 3 === 0 ? `art-${i}` : `prod-${i}`,
      meta_title: i % 4 === 0 ? "" : `Meta ${i}`,
      meta_description: i % 5 === 0 ? "" : phrase(rand, 14),
      focus_keyword: WORDS[i % WORDS.length],
      robots_index: !noindex,
      robots_follow: true,
      score: 40 + (i % 60),
      updated_at: isoAt(i),
    });
  }

  const orders: Row[] = [];
  const ordersNow = options.ordersNow ?? Date.now();
  for (let i = 0; i < size(LARGE_TENANT_SHAPE.orders); i += 1) {
    // One order per minute walking backwards: ~17 hours of history for the
    // full fixture, which lands inside the dashboard's comparison window.
    const createdAt = new Date(ordersNow - i * 60_000).toISOString();
    orders.push({
      id: `ord-${i}`,
      order_number: 1000 + i,
      merchant_id: merchantId,
      status: i % 9 === 0 ? "pending" : "paid",
      payment_method: i % 4 === 0 ? "cod" : "card",
      customer_name: `Customer ${i}`,
      total_amount: 1500 + (i % 200) * 10,
      total_minor_int: 150000 + (i % 200) * 1000,
      currency_code: "BDT",
      created_at: createdAt,
      updated_at: createdAt,
    });
  }

  return {
    merchants: [
      {
        id: merchantId,
        slug,
        name: "Big Store",
        status: "active",
        currency_code: "BDT",
        created_at: isoAt(0),
      },
    ],
    merchant_settings: [
      {
        merchant_id: merchantId,
        tagline: "Everything, indexed",
        permalinks: null,
        site_kit: null,
        updated_at: isoAt(0),
      },
    ],
    products,
    articles,
    storefront_pages: pages,
    collections,
    seo_meta: seoMeta,
    orders,
    payments: [],
    inventory_levels: [],
    product_variants: [],
    subscribers: [],
    url_redirects: [],
    blog_terms: [],
    article_terms: [],
    builder_template_seo: [],
  };
}

/** Row count of the built fixture, for the assertion that it really is large. */
export function countRows(tables: Record<string, Row[]>) {
  return Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);
}