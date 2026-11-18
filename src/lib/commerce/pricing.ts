/**
 * Pure commerce pricing, discount calculation, and order total resolution.
 *
 * Invariants:
 *  1. 0 <= discountMinor <= subtotalMinor
 *  2. finalTotal = subtotalMinor - discountMinor + shippingMinor >= 0
 *  3. All values are strictly integer minor units.
 */

export type CouponType = "fixed" | "percent" | "free_shipping" | "bogo";

export interface CouponCalculationInput {
  type: CouponType;
  amount_minor_int?: number | string | null;
  percent_off?: number | null;
  buy_quantity?: number | null;
  get_quantity?: number | null;
}

export interface PricingLineItem {
  unitPriceMinor: number;
  quantity: number;
}

export interface DiscountResult {
  discountMinor: number;
  freeShipping: boolean;
}

/**
 * Calculates discount amount in minor units for a coupon against a cart subtotal and line items.
 * Guaranteed to satisfy: 0 <= discountMinor <= subtotalMinor.
 */
export function calculateDiscount(
  coupon: CouponCalculationInput,
  subtotalMinor: number,
  lines: readonly PricingLineItem[] = [],
): DiscountResult {
  const safeSubtotal = Math.max(0, Math.trunc(subtotalMinor));

  if (coupon.type === "fixed") {
    const rawAmount = Number(coupon.amount_minor_int ?? 0);
    const safeAmount = Math.max(0, Math.trunc(rawAmount));
    return {
      discountMinor: Math.min(safeAmount, safeSubtotal),
      freeShipping: false,
    };
  }

  if (coupon.type === "percent") {
    const rawPercent = Number(coupon.percent_off ?? 0);
    const clampedPercent = Math.min(100, Math.max(0, Math.trunc(rawPercent)));
    return {
      discountMinor: Math.floor((safeSubtotal * clampedPercent) / 100),
      freeShipping: false,
    };
  }

  if (coupon.type === "free_shipping") {
    return {
      discountMinor: 0,
      freeShipping: true,
    };
  }

  // BOGO / Buy-X-Get-Y
  const buy = Math.max(1, Math.trunc(Number(coupon.buy_quantity ?? 1)));
  const get = Math.max(1, Math.trunc(Number(coupon.get_quantity ?? 1)));
  const totalQty = lines.reduce((acc, l) => acc + Math.max(0, Math.trunc(l.quantity)), 0);
  const cheapest = lines.length
    ? Math.min(...lines.map((l) => Math.max(0, Math.trunc(l.unitPriceMinor))))
    : 0;

  const freeUnits = Math.floor(totalQty / (buy + get)) * get;
  const rawDiscount = freeUnits * cheapest;

  return {
    discountMinor: Math.min(rawDiscount, safeSubtotal),
    freeShipping: false,
  };
}

/**
 * Calculate the net order total after discount and shipping.
 * Invariant: Always returns an integer minor unit >= 0.
 */
export function calculateOrderTotal(
  subtotalMinor: number,
  discountMinor: number,
  shippingMinor = 0,
): number {
  const safeSubtotal = Math.max(0, Math.trunc(subtotalMinor));
  const safeDiscount = Math.min(Math.max(0, Math.trunc(discountMinor)), safeSubtotal);
  const safeShipping = Math.max(0, Math.trunc(shippingMinor));

  return safeSubtotal - safeDiscount + safeShipping;
}
