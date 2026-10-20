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
import type { CartLine } from "@/lib/cart";
import type { PaymentMethodKey } from "@/lib/payment-rails";
import type { WidgetRow } from "@/lib/widget-data";
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
 * The preview's shopper profile and order history arrive with the account
 * surface (Task 4 of this plan).
 */

/* ------------------------------------------------------------ search total */

/**
 * The preview's **demo** result count arrives with the search surface
 * (Task 4 of this plan).
 */
