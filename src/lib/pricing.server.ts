import { one } from "./embed";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { clampAtZero, money, sub } from "./money";
import { resolveVatRate } from "./vat.server";
import { type VatMode, splitVatAcrossLines, vatBreakdown } from "./vat";
import {
  type PaymentMethodKey,
  assertMethodAllowed,
  availableMethods,
  credentialKeyToMethod,
} from "./payment-rails";

export function publicClient() {
  return createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** The storefront method set is the Bangladesh rail catalogue, not a literal list. */
export type PaymentMethod = PaymentMethodKey;

export type CartInput = { variantId: string; quantity: number }[];

export type Totals = {
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  codSurchargeMinor: number;
  vatMinor: number;
  /** inclusive = listed prices already contained VAT; exclusive = added on top. */
  vatMode: VatMode;
  vatRateBasisPoints: number;
  /** false when no legal-year VAT row covered this sale — surfaced, never silent. */
  vatResolved: boolean;
  totalMinor: number;
  /** Free-shipping threshold for this store, or null when it has none. */
  freeShippingThresholdMinor: number | null;
  /** How much more the shopper must spend to earn free shipping. Server math. */
  freeShippingRemainingMinor: number;
  coupon: { id: string; code: string; discountMinor: number; freeShipping: boolean } | null;
  /** Every coupon that survived the stack rules, in application order. */
  coupons: { id: string; code: string; discountMinor: number; freeShipping: boolean }[];
  lines: {
    variantId: string;
    productTitle: string;
    variantName: string;
    sku: string | null;
    unitPriceMinor: number;
    quantity: number;
    lineTotalMinor: number;
    stock: number;
    vatMinor: number;
  }[];
};

export async function priceCart(
  slug: string,
  cart: CartInput,
  paymentMethod: PaymentMethod,
  couponCode?: string,
  customerKey?: string,
) {
  const db = publicClient();
  const { data: merchant, error: mErr } = await db
    .from("merchants")
    .select("id, name, slug, currency_code, status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (mErr) throw mErr;
  if (!merchant) throw new Error("Store not found");

  const { data: settings } = await db
    .from("merchant_settings")
    .select("cod_enabled, mfs_enabled, cod_surcharge_minor_int, shipping_flat_minor_int, free_shipping_threshold_minor_int, prices_include_vat")
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  const codEnabled = settings?.cod_enabled ?? true;
  const mfsEnabled = settings?.mfs_enabled ?? true;

  // Which online rails this merchant has actually taken live. A rail without a
  // live credential is never offered — quoting it would take an order the
  // merchant has no way to capture.
  const { data: liveRails } = await db.rpc("storefront_payment_methods", { _slug: slug });
  const configured = (liveRails ?? []).map((r) => credentialKeyToMethod(r.provider_key));
  const availability = { codEnabled, onlineEnabled: mfsEnabled, configured };
  const gate = assertMethodAllowed(paymentMethod, availability);
  if (!gate.ok) {
    throw new Error(
      gate.reason === "payment.cod_unavailable"
        ? "Cash on delivery is unavailable"
        : "This payment method is unavailable for this store",
    );
  }
  const methods = availableMethods(availability);

  const ids = cart.filter((l) => l.quantity > 0).map((l) => l.variantId);
  if (ids.length === 0) throw new Error("Cart is empty");

  const { data: variants, error: vErr } = await db
    .from("product_variants")
    .select("id, name, sku, price_amount_minor_int, stock_quantity, currency_code, products(title, status, merchant_id)")
    .in("id", ids);
  if (vErr) throw vErr;

  const lines: Totals["lines"] = [];
  for (const line of cart) {
    const v = variants?.find((x) => x.id === line.variantId);
    const product = one<{ title: string; status: string; merchant_id: string }>(v?.products);
    if (!v || !product || product.merchant_id !== merchant.id || product.status !== "active") {
      throw new Error("A product in your cart is no longer available");
    }
    const quantity = Math.max(1, Math.floor(line.quantity));
    if (v.stock_quantity < quantity) throw new Error(`Not enough stock for ${product.title}`);
    lines.push({
      variantId: v.id,
      productTitle: product.title,
      variantName: v.name,
      sku: v.sku,
      unitPriceMinor: Number(v.price_amount_minor_int),
      quantity,
      lineTotalMinor: Number(v.price_amount_minor_int) * quantity,
      stock: v.stock_quantity,
      vatMinor: 0,
    });
  }

  const subtotalMinor = lines.reduce((s, l) => s + l.lineTotalMinor, 0);
  const flat = Number(settings?.shipping_flat_minor_int ?? 6000);
  const threshold = settings?.free_shipping_threshold_minor_int
    ? Number(settings.free_shipping_threshold_minor_int)
    : null;
  let shippingMinor = threshold !== null && subtotalMinor >= threshold ? 0 : flat;

  let discountMinor = 0;
  let coupon: Totals["coupon"] = null;
  let coupons: Totals["coupons"] = [];
  if (couponCode && couponCode.trim()) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { validateCoupons } = await import("./coupons.server");
    const result = await validateCoupons(
      supabaseAdmin,
      merchant.id,
      couponCode.split(","),
      subtotalMinor,
      lines.map((l) => ({ unitPriceMinor: l.unitPriceMinor, quantity: l.quantity })),
      customerKey,
    );
    discountMinor = result.discountMinor;
    if (result.freeShipping) shippingMinor = 0;
    coupons = result.applied.map((a) => ({
      id: a.couponId,
      code: a.code,
      discountMinor: a.discountMinor,
      freeShipping: a.freeShipping,
    }));
    coupon = coupons[0] ?? null;
  }
  const codSurchargeMinor =
    paymentMethod === "cod" ? Number(settings?.cod_surcharge_minor_int ?? 0) : 0;

  // VAT comes from the legal-year table via `vat_resolve`, never a constant.
  const rate = await resolveVatRate(db, { country: "BD", category: "standard" });
  const currency = merchant.currency_code;
  const net = clampAtZero(sub(money(subtotalMinor, currency), money(discountMinor, currency)));
  const taxableMoney = money(net.minor + shippingMinor + codSurchargeMinor, currency);

  // Display parity: when the merchant lists VAT-inclusive prices, VAT is
  // extracted from the amount the shopper already saw instead of added on top,
  // so the stored total always equals the displayed total.
  const vatMode: VatMode = settings?.prices_include_vat ? "inclusive" : "exclusive";
  const breakdown = vatBreakdown(taxableMoney, rate, vatMode);

  // Per-line VAT reconciles to the invoice VAT paisa for paisa.
  const lineVat = splitVatAcrossLines(
    breakdown,
    lines.map((l) => money(l.lineTotalMinor, currency)),
  );
  lines.forEach((l, i) => {
    l.vatMinor = lineVat[i]?.minor ?? 0;
  });

  return {
    merchant,
    totals: {
      currency: merchant.currency_code,
      subtotalMinor,
      discountMinor,
      shippingMinor,
      codSurchargeMinor,
      vatMinor: breakdown.vat.minor,
      vatMode,
      vatRateBasisPoints: rate.rateBasisPoints,
      vatResolved: rate.resolved,
      totalMinor: breakdown.gross.minor,
      freeShippingThresholdMinor: threshold,
      freeShippingRemainingMinor:
        threshold === null ? 0 : Math.max(0, threshold - clampAtZero(sub(money(subtotalMinor, currency), money(discountMinor, currency))).minor),
      coupon,
      coupons,
      lines,
    } satisfies Totals,
    settings: { codEnabled, mfsEnabled, methods, priceDisplayInclusive: vatMode === "inclusive" },
  };
}

