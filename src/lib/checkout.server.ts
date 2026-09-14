/**
 * Checkout runtime: stock holds, rate limiting and metrics.
 *
 * Stock is reserved through `stock_hold_acquire` (service-role only) so two
 * shoppers can never both buy the last unit. Holds expire, are released on
 * re-quote, and are consumed exactly once when the order lands.
 */
import { incr, log, observe } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

export const HOLD_TTL_SECONDS = 900;

export type HoldLine = { variantId: string; quantity: number };

type Admin = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

export class CheckoutError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

function translate(message: string): CheckoutError {
  if (message.includes("stock_hold.insufficient")) {
    const item = message.split("stock_hold.insufficient:")[1]?.trim() || "an item";
    return new CheckoutError("stock_insufficient", `Not enough stock for ${item}`);
  }
  if (message.includes("stock_hold.variant_not_found")) {
    return new CheckoutError("variant_missing", "A product in your cart is no longer available");
  }
  return new CheckoutError("stock_hold_failed", "Could not reserve your items, please retry");
}

/** Reserve stock for a checkout token. Idempotent: re-acquiring replaces prior holds. */
export async function reserveStock(
  merchantId: string,
  checkoutToken: string,
  lines: HoldLine[],
  subject: string,
) {
  await enforceRateLimit("checkout.reserve", subject);
  const started = Date.now();
  const db = await admin();
  const { data, error } = await db.rpc("stock_hold_acquire", {
    _merchant_id: merchantId,
    _checkout_token: checkoutToken,
    _lines: lines,
    _ttl_seconds: HOLD_TTL_SECONDS,
  });
  observe("framique_checkout_reserve_ms", Date.now() - started);
  if (error) {
    incr("framique_checkout_reserve_total", { outcome: "rejected" });
    log("warn", "checkout.reserve_rejected", { merchantId, reason: error.message });
    throw translate(error.message);
  }
  incr("framique_checkout_reserve_total", { outcome: "held" });
  return data as { token: string; expires_at: string };
}

/** Convert holds into real stock decrements. Called once, inside order creation. */
export async function consumeStock(checkoutToken: string, orderId: string) {
  const db = await admin();
  const { data, error } = await db.rpc("stock_hold_consume", {
    _checkout_token: checkoutToken,
    _order_id: orderId,
  });
  if (error) {
    incr("framique_checkout_consume_total", { outcome: "error" });
    log("error", "checkout.consume_failed", { orderId, reason: error.message });
    throw new CheckoutError("stock_consume_failed", "Order placed but stock sync failed");
  }
  incr("framique_checkout_consume_total", { outcome: "ok" });
  return Number(data ?? 0);
}

export async function releaseStock(checkoutToken: string) {
  const db = await admin();
  const { error } = await db.rpc("stock_hold_release", { _checkout_token: checkoutToken });
  if (error) log("warn", "checkout.release_failed", { reason: error.message });
  return true;
}

export async function sweepStockHolds() {
  const db = await admin();
  const { data } = await db.rpc("stock_hold_sweep", {});
  const swept = Number(data ?? 0);
  if (swept > 0) incr("framique_checkout_holds_swept_total", {}, swept);
  return swept;
}
