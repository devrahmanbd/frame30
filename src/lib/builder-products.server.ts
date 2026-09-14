/**
 * Phase 18 — resolves the `products` widgets in a builder document.
 *
 * The builder stores only *what* to list (category, count); the actual cards
 * are fetched at render time through the public client so the storefront
 * always shows live prices and stock-aware titles.
 */
import type { BuilderDoc, ProductCard, ProductData } from "./page-builder";
import { productWidgets } from "./page-builder";

type Row = {
  id: string;
  title: string;
  slug: string;
  image_url: string | null;
  categories?: { slug: string } | null;
  product_variants: { price_amount_minor_int: number }[] | null;
};

const MAX_CARDS = 24;

function toCard(row: Row, storeSlug: string): ProductCard {
  const prices = (row.product_variants ?? []).map((v) => Number(v.price_amount_minor_int));
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    imageUrl: row.image_url,
    priceMinor: prices.length ? Math.min(...prices) : null,
    currency: "BDT",
    href: `/store/${storeSlug}/p/${row.slug}`,
  };
}

/**
 * One query per document (not per widget): the widest requested set is fetched
 * once and each widget takes the slice it asked for.
 */
export async function resolveBuilderProducts(
  merchantId: string,
  storeSlug: string,
  doc: BuilderDoc,
): Promise<ProductData> {
  const widgets = productWidgets(doc);
  if (!widgets.length) return {};

  const { publicClient } = await import("@/lib/pricing.server");
  const db = publicClient() as unknown as {
    from: (t: string) => any;
  };

  const { data } = await db
    .from("products")
    .select("id, title, slug, image_url, categories(slug), product_variants(price_amount_minor_int)")
    .eq("merchant_id", merchantId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(120);

  const rows = (data ?? []) as Row[];
  const out: ProductData = {};
  for (const widget of widgets) {
    const category = (widget.settings.category ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(widget.settings.limit ?? 4, 1), MAX_CARDS);
    const scoped = category
      ? rows.filter((r) => (r.categories?.slug ?? "").toLowerCase() === category)
      : rows;
    out[widget.id] = scoped.slice(0, limit).map((r) => toCard(r, storeSlug));
  }
  return out;
}
