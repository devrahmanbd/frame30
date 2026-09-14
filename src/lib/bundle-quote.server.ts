/**
 * Phase 1.4 — the bundle/total contract, server side.
 *
 * A widget posts an item set (variant ids + quantities) and receives a total
 * computed here from current variant prices. The browser never multiplies,
 * sums or divides money: it renders the integer minor units it is handed.
 */
import { publicClient } from "./pricing.server";
import { one } from "./embed";

export type BundleItemInput = { variantId: string; quantity: number };

export type BundleQuote = {
  currency: string;
  totalMinor: number;
  lines: { variantId: string; title: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }[];
};

export async function quoteBundleTotal(slug: string, items: BundleItemInput[]): Promise<BundleQuote> {
  const db = publicClient();
  const { data: merchant } = await db
    .from("merchants")
    .select("id, currency_code, status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!merchant) throw new Error("Store not found");

  const currency = merchant.currency_code ?? "BDT";
  const wanted = items.filter((i) => i.quantity > 0);
  if (wanted.length === 0) return { currency, totalMinor: 0, lines: [] };

  const { data: variants, error } = await db
    .from("product_variants")
    .select("id, name, price_amount_minor_int, products(title, status, merchant_id)")
    .in(
      "id",
      wanted.map((i) => i.variantId),
    );
  if (error) throw new Error("Bundle pricing is temporarily unavailable");

  const lines: BundleQuote["lines"] = [];
  for (const item of wanted) {
    const variant = variants?.find((v) => v.id === item.variantId);
    const product = one<{ title: string; status: string; merchant_id: string }>(variant?.products);
    // Silently skipping an unavailable item would quote a price the shopper
    // cannot buy, so the whole quote fails instead.
    if (!variant || !product || product.merchant_id !== merchant.id || product.status !== "active") {
      throw new Error("An item in this bundle is no longer available");
    }
    const quantity = Math.max(1, Math.floor(item.quantity));
    const unitPriceMinor = Number(variant.price_amount_minor_int);
    lines.push({
      variantId: variant.id,
      title: product.title,
      quantity,
      unitPriceMinor,
      lineTotalMinor: unitPriceMinor * quantity,
    });
  }

  return { currency, totalMinor: lines.reduce((sum, l) => sum + l.lineTotalMinor, 0), lines };
}
