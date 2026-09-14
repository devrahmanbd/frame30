import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;
type CouponRow = Database["public"]["Tables"]["coupons"]["Row"];

export type CouponLine = { unitPriceMinor: number; quantity: number };

export type AppliedCoupon = {
  couponId: string;
  code: string;
  type: CouponRow["type"];
  discountMinor: number;
  freeShipping: boolean;
};

export class CouponError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CouponError";
    // Every rejection is a metric: enumeration attempts and misconfigured
    // campaigns both show up as spikes per reason code in Grafana.
    incr("framique_coupon_validate_total", { outcome: "rejected", reason: code });
  }
}

const BN = {
  not_found: "Coupon not found",
  not_active: "Coupon is not currently active",
  expired: "Coupon has expired",
  not_started: "Coupon has not started yet",
  min_subtotal: "Minimum purchase requirement not met",
  usage_limit: "Coupon usage limit has been reached",
  customer_limit: "You have already used this coupon",
} as const;

export function discountFor(coupon: CouponRow, subtotalMinor: number, lines: CouponLine[]) {
  if (coupon.type === "fixed") {
    return { discountMinor: Math.min(Number(coupon.amount_minor_int), subtotalMinor), freeShipping: false };
  }
  if (coupon.type === "percent") {
    return {
      discountMinor: Math.floor((subtotalMinor * Math.min(100, coupon.percent_off)) / 100),
      freeShipping: false,
    };
  }
  if (coupon.type === "free_shipping") return { discountMinor: 0, freeShipping: true };

  const buy = Math.max(1, coupon.buy_quantity);
  const get = Math.max(1, coupon.get_quantity);
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const cheapest = lines.length ? Math.min(...lines.map((l) => l.unitPriceMinor)) : 0;
  const freeUnits = Math.floor(totalQty / (buy + get)) * get;
  return { discountMinor: Math.min(freeUnits * cheapest, subtotalMinor), freeShipping: false };
}

export async function validateCoupon(
  db: Client,
  merchantId: string,
  rawCode: string,
  subtotalMinor: number,
  lines: CouponLine[],
  customerKey?: string,
): Promise<AppliedCoupon> {
  const code = rawCode.trim().toUpperCase();
  const { data: coupon } = await db
    .from("coupons")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("code", code)
    .maybeSingle();
  if (!coupon) throw new CouponError("coupon_not_found", BN.not_found);
  if (coupon.status === "draft" || coupon.status === "paused") {
    throw new CouponError("coupon_not_active", BN.not_active);
  }
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
    throw new CouponError("coupon_not_started", BN.not_started);
  }
  if (
    coupon.status === "expired" ||
    (coupon.expires_at && new Date(coupon.expires_at).getTime() < now)
  ) {
    throw new CouponError("coupon_expired", BN.expired);
  }
  if (subtotalMinor < Number(coupon.min_subtotal_minor_int)) {
    throw new CouponError("coupon_min_subtotal", BN.min_subtotal);
  }
  if (coupon.usage_limit !== null && coupon.redeemed_count >= coupon.usage_limit) {
    throw new CouponError("coupon_usage_limit", BN.usage_limit);
  }
  if (coupon.per_customer_limit !== null && customerKey) {
    const { count } = await db
      .from("coupon_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id)
      .eq("customer_key", customerKey);
    if ((count ?? 0) >= coupon.per_customer_limit) {
      throw new CouponError("coupon_customer_limit", BN.customer_limit);
    }
  }

  const { discountMinor, freeShipping } = discountFor(coupon, subtotalMinor, lines);
  return { couponId: coupon.id, code: coupon.code, type: coupon.type, discountMinor, freeShipping };
}

/**
 * Stack rules, evaluated server-side only:
 *  - deterministic order by `priority` then code,
 *  - the first coupon may always apply; later ones require `allow_combine`
 *    on both the incumbent set and the candidate,
 *  - a coupon flagged `one_per_order` refuses any companion,
 *  - each coupon respects `max_discount_minor_int`,
 *  - the combined discount never exceeds the subtotal.
 */
export async function validateCoupons(
  db: Client,
  merchantId: string,
  rawCodes: string[],
  subtotalMinor: number,
  lines: CouponLine[],
  customerKey?: string,
): Promise<{ applied: AppliedCoupon[]; discountMinor: number; freeShipping: boolean }> {
  const codes = Array.from(
    new Set(rawCodes.map((c) => c.trim().toUpperCase()).filter((c) => c.length > 0)),
  );
  if (codes.length === 0) return { applied: [], discountMinor: 0, freeShipping: false };

  // Coupon validation is an unauthenticated, guessable endpoint: throttle it per
  // shopper (falling back to the merchant when we have no customer key) so code
  // enumeration is expensive, and record outcomes for the Grafana panel.
  await enforceRateLimit("commerce.coupon_validate", `${merchantId}:${customerKey ?? "anon"}`);

  const candidates = await withSpan("commerce.coupon_validate", () => Promise.all(
    codes.map(async (code) => {
      const applied = await validateCoupon(db, merchantId, code, subtotalMinor, lines, customerKey);
      const { data: row } = await db
        .from("coupons")
        .select("priority, allow_combine, one_per_order, max_discount_minor_int")
        .eq("id", applied.couponId)
        .maybeSingle();
      const cap = row?.max_discount_minor_int == null ? null : Number(row.max_discount_minor_int);
      return {
        applied: { ...applied, discountMinor: cap === null ? applied.discountMinor : Math.min(applied.discountMinor, cap) },
        priority: row?.priority ?? 100,
        allowCombine: row?.allow_combine ?? false,
        onePerOrder: row?.one_per_order ?? false,
      };
    }),
  ));

  candidates.sort((a, b) => a.priority - b.priority || a.applied.code.localeCompare(b.applied.code));

  const applied: AppliedCoupon[] = [];
  let combinable = true;
  for (const c of candidates) {
    if (applied.length > 0) {
      if (!combinable || !c.allowCombine || c.onePerOrder) {
        throw new CouponError("coupon_not_stackable", `${c.applied.code} cannot be combined with another coupon`);
      }
    }
    applied.push(c.applied);
    combinable = combinable && c.allowCombine && !c.onePerOrder;
  }

  const discountMinor = Math.min(
    subtotalMinor,
    applied.reduce((sum, a) => sum + a.discountMinor, 0),
  );
  incr("framique_coupon_validate_total", { outcome: "accepted", count: String(applied.length) });
  return { applied, discountMinor, freeShipping: applied.some((a) => a.freeShipping) };
}
