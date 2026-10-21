/**
 * Songoskriti's theme-owned preview demo data.
 *
 * **The contract: synthetic data, never a merchant's, and never a price the
 * platform would not compute.** The preview is the merchant's first
 * impression — the cart it shows, the account it shows and the facets it
 * shows must be *representative* and *visibly labelled*, exactly as
 * "Demo Shopper" (`src/lib/preview-demo-data.ts:42`) and "Sample product"
 * (`src/components/builder/CartContext.tsx:95`) are.
 *
 * Everything here is **derived from the Songoskriti demo catalogue**
 * (`demoCatalogFor("songoskriti")`, `src/lib/demo-catalog.ts:3216`), so the
 * preview's facets, its cart lines and its order history all name the same
 * demo products at the same prices — one source of truth, never a number
 * typed twice. The money is **derived**, never authored: `subtotalMinor` is
 * the sum of the lines, `totalMinor` is the subtotal plus the shipping.
 */
import type {
  CartContextValue,
  CartTotals,
} from "@/components/builder/CartContext";
import type { BlogFeed } from "@/components/builder/blog";
import type { BlogCardData } from "@/components/store/BlogList";
import type { CartLine } from "@/lib/cart";
import type { AccountOverview } from "@/lib/accounts.server";
import type { AccountOrderDetail } from "@/components/store/AccountDashboard";
import type { PaymentMethodKey } from "@/lib/payment-rails";
import type { WidgetRow } from "@/lib/widget-data";
import {
  mapOrdersToRows,
  mapProfileToRow,
} from "@/components/store/account-slots";
import { demoCatalogFor } from "../../demo-catalog";

/** The Songoskriti demo catalogue — the one source of truth for this file. */
const CATALOG = demoCatalogFor("songoskriti");

/**
 * The demo products the preview's cart and order history name, by slug. The
 * catalogue owns the titles, the variant names, the prices and the stock —
 * this list only says which three the preview shows.
 */
const PREVIEW_PRODUCT_SLUGS = [
  "dhakai-jamdani-heritage-saree",
  "comilla-khadi-casual-kurta",
  "dhamrai-brass-heritage-necklace",
] as const;

/** The store's free-shipping threshold, in minor units (৳3,000). */
const FREE_SHIPPING_THRESHOLD_MINOR = 300000;

/** The delivery fee the preview quotes, in minor units (৳60). */
const SHIPPING_MINOR = 6000;

type DemoLine = CartTotals["lines"][number];

/** One demo catalogue product, priced the way the platform prices it. */
function demoLine(slug: string): DemoLine {
  const product = CATALOG.products.find((p) => p.slug === slug);
  const variant = product?.variants[0];
  if (!product || !variant) {
    throw new Error(
      `songoskriti preview demo data: no demo product "${slug}" in the Songoskriti catalogue`,
    );
  }
  const quantity = 1;
  const unitPriceMinor = variant.price;
  return {
    variantId: variant.sku ?? `${product.slug}-0`,
    productTitle: product.title,
    variantName: variant.name,
    unitPriceMinor,
    quantity,
    lineTotalMinor: unitPriceMinor * quantity,
    stock: variant.stock ?? 0,
  };
}

/** The three priced lines the preview's cart and order history share. */
function demoLines(): DemoLine[] {
  return PREVIEW_PRODUCT_SLUGS.map(demoLine);
}

/* ------------------------------------------------------------------ facets */

/**
 * Facet rows for the preview's `facets` widget source, shaped exactly as
 * the platform's own facet reader expects
 * (`groupFacetRows`, `src/components/builder/collection.tsx:94-108`; the
 * server's own rows, `src/lib/widget-data.server.ts:898-936`).
 *
 * The category rows come from the catalogue's categories **that at least one
 * demo product actually uses**, so the preview's filters and the preview's
 * products always agree — the catalogue's `new-in` entry is a collection
 * name, not a product category, and is therefore not a facet.
 */
export function songoskritiPreviewFacets(): WidgetRow[] {
  const categoryRows: WidgetRow[] = CATALOG.categories
    .filter((category) =>
      CATALOG.products.some((product) => product.category === category.slug),
    )
    .map((category) => ({
      id: category.slug,
      title: category.name,
      count: CATALOG.products.filter((p) => p.category === category.slug)
        .length,
      subtitle: "category",
    }));

  // The platform's default kind for a product with no declared kind is
  // "physical" (`src/lib/widget-data.server.ts:888-891`); the demo
  // catalogue declares none, so every demo product is physical and there is
  // no digital product to count.
  const kindRows: WidgetRow[] = [
    {
      id: "physical",
      title: "physical",
      count: CATALOG.products.length,
      subtitle: "kind",
    },
    { id: "digital", title: "digital", count: 0, subtitle: "kind" },
  ];

  const inStock = CATALOG.products.filter((product) =>
    product.variants.some((variant) => (variant.stock ?? 0) > 0),
  ).length;

  const stockRow: WidgetRow = {
    id: "1",
    title: "in_stock",
    count: inStock,
    subtitle: "stock",
  };
  const totalRow: WidgetRow = {
    id: "total",
    title: "total",
    count: CATALOG.products.length,
    subtitle: "total",
  };

  return [...categoryRows, ...kindRows, stockRow, totalRow];
}

/* -------------------------------------------------------------------- cart */

/**
 * The preview's synthetic cart.
 *
 * Two parts, because the type has two parts: the **context value** carries
 * `lines: CartLine[]` (`{ variantId, quantity }`,
 * `src/lib/cart.ts:4`) — the field the `cart_lines` widget merges
 * quantities from — plus the inert mutation no-ops; the **`totals`** field
 * is a `CartTotals` (`src/components/builder/CartContext.tsx:26`), and it is
 * where the money and the two free-shipping fields live. The context value
 * itself has **no** `freeShippingThresholdMinor` and **no**
 * `freeShippingRemainingMinor` — those are not its fields.
 */
export function songoskritiPreviewCart(): CartContextValue {
  const lines = demoLines();
  const subtotalMinor = lines.reduce(
    (sum, line) => sum + line.lineTotalMinor,
    0,
  );
  const shippingMinor = SHIPPING_MINOR;
  const totals: CartTotals = {
    currency: "BDT",
    subtotalMinor,
    discountMinor: 0,
    shippingMinor,
    codSurchargeMinor: 0,
    vatMinor: 0,
    totalMinor: subtotalMinor + shippingMinor,
    freeShippingThresholdMinor: FREE_SHIPPING_THRESHOLD_MINOR,
    freeShippingRemainingMinor: Math.max(
      0,
      FREE_SHIPPING_THRESHOLD_MINOR - subtotalMinor,
    ),
    coupon: null,
    lines,
  };
  const cartLines: CartLine[] = lines.map((line) => ({
    variantId: line.variantId,
    quantity: line.quantity,
  }));
  const methods: PaymentMethodKey[] = ["cod", "bkash", "nagad"];
  return {
    lines: cartLines,
    count: cartLines.reduce((sum, line) => sum + line.quantity, 0),
    totals,
    pending: false,
    error: null,
    methods,
    method: "cod",
    setMethod: () => {},
    couponCode: "",
    setCouponCode: () => {},
    setQuantity: () => {},
    remove: () => {},
    clear: () => {},
    live: false,
  };
}

/* ----------------------------------------------------------------- account */

/**
 * The preview's order history — three rows built with the **same mapping
 * the live account route uses** (`mapOrdersToRows`,
 * `src/components/store/account-slots.tsx:31`), so the row contract cannot
 * drift from the storefront's. Each order's total is the catalogue price of
 * the product it names.
 */
export function songoskritiPreviewOrders(): WidgetRow[] {
  return mapOrdersToRows(DEMO_ORDERS);
}

/**
 * The preview's demo orders — the RAW rows, the shape the `customer_overview`
 * RPC returns. The order list (`songoskritiPreviewOrders`) and the demo
 * account overview (`songoskritiPreviewAccountOverview`) read the SAME rows,
 * so the preview's order history and its dashboard can never disagree.
 */
const DEMO_ORDERS: AccountOverview["orders"] = [
  {
    id: "songoskriti-demo-order-2451",
    order_number: "ORD-2451",
    status: "delivered",
    total_minor_int: demoLine("dhakai-jamdani-heritage-saree").lineTotalMinor,
    currency_code: "BDT",
    created_at: "2026-09-12T09:30:00.000Z",
  },
  {
    id: "songoskriti-demo-order-2468",
    order_number: "ORD-2468",
    status: "shipped",
    total_minor_int: demoLine("comilla-khadi-casual-kurta").lineTotalMinor,
    currency_code: "BDT",
    created_at: "2026-09-29T13:05:00.000Z",
  },
  {
    id: "songoskriti-demo-order-2477",
    order_number: "ORD-2477",
    status: "packed",
    total_minor_int: demoLine("dhamrai-brass-heritage-necklace").lineTotalMinor,
    currency_code: "BDT",
    created_at: "2026-10-06T08:15:00.000Z",
  },
];

/**
 * The preview's demo ACCOUNT — the shape the `customer_overview` RPC returns
 * for the signed-in shopper.
 *
 * **Synthetic and visibly labelled**, exactly like the order history above:
 * the name carries the demo marker, the email uses the reserved `.example`
 * domain (RFC 2606) and the phone is the platform's own placeholder. A real
 * shopper's data can never reach this surface — the preview has no session
 * and no shopper.
 */
export function songoskritiPreviewAccountOverview(): AccountOverview {
  const saree = demoLine("dhakai-jamdani-heritage-saree");
  const kurta = demoLine("comilla-khadi-casual-kurta");
  return {
    profile: {
      id: "songoskriti-demo-profile",
      name: "Rumana Haque (demo shopper)",
      email: "rumana@example.com",
      phone: "01700000000",
    },
    addresses: [
      {
        id: "songoskriti-demo-address-1",
        address_type: "shipping",
        label: "Home (demo)",
        full_name: "Rumana Haque (demo shopper)",
        phone: "01700000000",
        line1: "12 Demo Road",
        line2: null,
        city: "Dhaka",
        district: "Dhaka",
        postcode: "1207",
        is_default: true,
      },
    ],
    wishlist: [
      {
        id: "songoskriti-demo-wish-1",
        variant_id: saree.variantId,
        stock_alert: false,
        variant_name: saree.variantName,
        price_amount_minor_int: saree.unitPriceMinor,
        stock_quantity: saree.stock,
        product_title: saree.productTitle,
        product_slug: "dhakai-jamdani-heritage-saree",
      },
      {
        id: "songoskriti-demo-wish-2",
        variant_id: kurta.variantId,
        stock_alert: false,
        variant_name: kurta.variantName,
        price_amount_minor_int: kurta.unitPriceMinor,
        stock_quantity: kurta.stock,
        product_title: kurta.productTitle,
        product_slug: "comilla-khadi-casual-kurta",
      },
    ],
    consents: [
      { channel: "email", purpose: "marketing", granted: true },
      { channel: "email", purpose: "cart_recovery", granted: true },
      { channel: "sms", purpose: "marketing", granted: false },
    ],
    orders: DEMO_ORDERS,
    reviews: [],
  };
}

/**
 * The preview's demo order DETAIL — the shape the session-scoped
 * `customer_order_detail` RPC returns for the shopper's own order.
 *
 * Derived from the SAME demo catalogue the order history reads, so the
 * disclosed order can never disagree with the row that opened it: same
 * product, same variant, same price, same order number, same status.
 * Synthetic, and derived — no number is typed twice.
 */
export function songoskritiPreviewOrderDetail(
  orderId: string,
): AccountOrderDetail | null {
  const slug = DEMO_ORDER_SLUGS[orderId];
  if (!slug) return null;
  const order = DEMO_ORDERS.find((row) => row.id === orderId);
  if (!order) return null;
  const line = demoLine(slug);
  const total = line.lineTotalMinor;
  return {
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      payment_method: "cod",
      currency_code: order.currency_code,
      subtotal_minor_int: total,
      shipping_minor_int: 0,
      discount_minor_int: 0,
      cod_surcharge_minor_int: 0,
      vat_minor_int: 0,
      total_minor_int: total,
      city: "Dhaka",
      created_at: order.created_at,
    },
    items: [
      {
        title: line.productTitle,
        variant_name: line.variantName,
        quantity: line.quantity,
        unit_minor: line.unitPriceMinor,
        line_minor: line.lineTotalMinor,
      },
    ],
  };
}

/** The demo product each demo order names — one source of truth with the rows. */
const DEMO_ORDER_SLUGS: Record<string, string> = {
  "songoskriti-demo-order-2451": "dhakai-jamdani-heritage-saree",
  "songoskriti-demo-order-2468": "comilla-khadi-casual-kurta",
  "songoskriti-demo-order-2477": "dhamrai-brass-heritage-necklace",
};

/**
 * The preview's shopper profile. The title carries the **visible demo
 * indicator** and the email uses the reserved `.example` domain (RFC 2606),
 * so the address can never be mistaken for a real customer's.
 */
export function songoskritiPreviewProfile(): WidgetRow {
  const row = mapProfileToRow({
    name: "Rumana Haque (demo shopper)",
    email: "rumana@example.com",
    phone: "01700000000",
  });
  return { ...row!, id: "songoskriti-demo-profile" };
}

/* ------------------------------------------------------------ search total */

/**
 * The preview's **demo** result count.
 *
 * The Songoskriti demo catalogue holds **13** products
 * (`src/lib/demo-catalog.ts`, the `SONGOSKRITI` catalogue's `products`
 * array), and the platform pages at `PAGE_SIZE = 24`
 * (`src/lib/storefront-search.ts:29`), so a fixture-derived total of 13 would
 * render **no pager** — the `Pagination` widget returns `null` when
 * `pageCount(total) <= 1` (`src/components/builder/collection.tsx:537-541`).
 * The preview therefore carries an explicit, representative demo total of
 * **38** — two pages — so the preview shows the pager the storefront shows.
 *
 * This number is **preview-only**: the storefront's count is the live
 * `result.total`, and no merchant query ever sees 38.
 */
export const SONGOSKRITI_PREVIEW_SEARCH_TOTAL = 38;

/* --------------------------------------------------------------------- blog */

/**
 * The preview's **demo blog feed** — five Songoskriti-flavoured articles.
 *
 * The platform's blog pack reads its articles through `BlogFeedProvider`
 * (`src/components/builder/blog.tsx:32`); with no provider it falls back to
 * the pack's own `SAMPLE` rows ("Sample article 1"…, `blog.tsx:51-62`). This
 * feed is what the Songoskriti preview shows instead: the articles are about
 * the house's own craft, their categories are the taxonomy the terms rail
 * shows, and the pager's base path points at the **preview's own blog tab**
 * (`/theme-preview/<key>?template=blog`) rather than at a storefront route
 * that does not exist for a demo.
 *
 * The copy is **synthetic demo content**, never a merchant's post — the same
 * contract as the cart lines and the order rows above.
 */
export function songoskritiPreviewFeed(): BlogFeed {
  const articles: BlogCardData[] = [
    {
      slug: "the-jamdani-loom",
      title: "The jamdani loom, and the eleven days one saree takes",
      titleEn: null,
      excerpt:
        "A jamdani saree is not woven, it is drawn: the motif is built on the loom with a separate thread for each colour, and a fine jamdani takes eleven days of a weaver's time.",
      coverImageUrl: null,
      publishedAt: "2026-08-14T00:00:00.000Z",
      merchantName: "Songoskriti",
      merchantSlug: "songoskriti",
      category: { slug: "craft", name: "Craft" },
      readingMinutes: 6,
    },
    {
      slug: "what-jamdani-means",
      title: "What a jamdani actually is, and how to tell a real one",
      titleEn: null,
      excerpt:
        "The word names a technique, not a pattern: a jamdani is any motif drawn on the loom rather than woven into it, and the tell is the loose thread end on the reverse.",
      coverImageUrl: null,
      publishedAt: "2026-09-02T00:00:00.000Z",
      merchantName: "Songoskriti",
      merchantSlug: "songoskriti",
      category: { slug: "fabric", name: "Fabric" },
      readingMinutes: 5,
    },
    {
      slug: "washing-handloom-cotton",
      title: "Five ways to wash a handloom cotton at home",
      titleEn: null,
      excerpt:
        "Cold water, no wringing, dried flat in the shade: the three rules that keep a handloom cotton's sizing and its weave intact for a decade of wear.",
      coverImageUrl: null,
      publishedAt: "2026-09-21T00:00:00.000Z",
      merchantName: "Songoskriti",
      merchantSlug: "songoskriti",
      category: { slug: "care", name: "Care" },
      readingMinutes: 4,
    },
    {
      slug: "weaving-clusters",
      title: "From Tangail to Sonargaon: a map of the weaving clusters",
      titleEn: null,
      excerpt:
        "Each cluster weaves what it knows best — Tangail for the fine cottons, Sonargaon for the jamdani, Comilla for the khadi, Dhamrai for the brass — and the price on the tag is the price of that work.",
      coverImageUrl: null,
      publishedAt: "2026-10-05T00:00:00.000Z",
      merchantName: "Songoskriti",
      merchantSlug: "songoskriti",
      category: { slug: "provenance", name: "Provenance" },
      readingMinutes: 7,
    },
    {
      slug: "why-khadi-softens",
      title: "Why a khadi kurta softens for years and a printed one never does",
      titleEn: null,
      excerpt:
        "Handspun khadi keeps a little slack in the yarn, so it relaxes with every wash instead of pilling — which is why the same cotton can cost differently from one cluster to the next.",
      coverImageUrl: null,
      publishedAt: "2026-10-12T00:00:00.000Z",
      merchantName: "Songoskriti",
      merchantSlug: "songoskriti",
      category: { slug: "fabric", name: "Fabric" },
      readingMinutes: 5,
    },
  ];
  const facets: BlogFeed["facets"] = [
    { slug: "craft", name: "Craft", kind: "category", count: 1 },
    { slug: "fabric", name: "Fabric", kind: "category", count: 2 },
    { slug: "care", name: "Care", kind: "category", count: 1 },
    { slug: "provenance", name: "Provenance", kind: "category", count: 1 },
    { slug: "handloom", name: "handloom", kind: "tag", count: 3 },
  ];
  return {
    articles,
    facets,
    paging: {
      page: 1,
      pageSize: 9,
      total: articles.length,
      lastPage: 1,
      from: 1,
      to: articles.length,
      overrun: false,
      prevPath: null,
      nextPath: null,
    },
    basePath: (page: number) =>
      `/theme-preview/songoskriti?template=blog&page=${page}`,
  };
}
