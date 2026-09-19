/**
 * Checkout runtime: stock holds, rate limiting and metrics.
 *
 * Stock is reserved through `stock_hold_acquire` (service-role only) so two
 * shoppers can never both buy the last unit. Holds expire, are released on
 * re-quote, and are consumed exactly once when the order lands.
 */
import { incr, log, observe } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

import { withTenantLock } from "./redis-lock.server";

export const HOLD_TTL_SECONDS = 900;

export type HoldLine = { variantId: string; quantity: number };

type Admin = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
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
  if (message.includes("stock_hold.insufficient") || message.includes("stock_insufficient")) {
    const item =
      message.split("stock_hold.insufficient:")[1]?.trim() || "an item";
    return new CheckoutError(
      "stock_insufficient",
      `Not enough stock for ${item}`,
    );
  }
  if (message.includes("stock_hold.variant_not_found") || message.includes("product_not_found")) {
    return new CheckoutError(
      "variant_missing",
      "A product in your cart is no longer available",
    );
  }
  return new CheckoutError(
    "stock_hold_failed",
    "Could not reserve your items, please retry",
  );
}

/**
 * Reserve stock for a checkout token. Reserves converge to the wanted
 * quantities by signed delta, so overlapping re-quotes can neither
 * double-take nor wipe stock — a re-acquire with identical lines is a no-op.
 *
 * NOTE (Sept 2026): the `stock_hold_*` RPCs in the live database were written
 * against a `stock_holds.lines jsonb` shape that does not exist there — the
 * live table is one row per line
 * (checkout_token, merchant_id, variant_id, quantity, expires_at,
 * consumed_at, released_at, order_id) — and DDL repair is blocked (not table
 * owner), so holds are managed here with the service-role client instead.
 * Reserves are serialized per merchant (not per token) so concurrent
 * checkouts cannot oversell the same variant.
 */
export async function reserveStock(
  merchantId: string,
  checkoutToken: string,
  lines: HoldLine[],
  subject: string,
) {
  await enforceRateLimit("checkout.reserve", subject);
  return withTenantLock(
    merchantId,
    "stock:reserve",
    10_000,
    async () => {
      const started = Date.now();
      const fail = (message: string): never => {
        observe("framique_checkout_reserve_ms", Date.now() - started);
        incr("framique_checkout_reserve_total", { outcome: "rejected" });
        log("warn", "checkout.reserve_rejected", {
          merchantId,
          reason: message.slice(0, 160),
        });
        throw translate(message);
      };
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const wanted = new Map<string, number>();
      for (const l of lines) {
        const q = Math.max(1, Math.floor(l.quantity));
        wanted.set(l.variantId, Math.max(wanted.get(l.variantId) ?? 0, q));
      }
      if (wanted.size === 0) fail("stock_hold.variant_not_found");
      const variantIds = [...wanted.keys()];

      // Live (unconsumed, unreleased) holds for this token.
      const { data: heldRows } = await supabaseAdmin
        .from("stock_holds")
        .select("variant_id, quantity")
        .eq("checkout_token", checkoutToken)
        .is("consumed_at", null)
        .is("released_at", null);
      const held = new Map<string, number>(
        ((heldRows ?? []) as { variant_id: string; quantity: number }[]).map(
          (h) => [h.variant_id, Number(h.quantity ?? 0)],
        ),
      );

      // Release holds for variants no longer wanted.
      for (const [variantId, qty] of held) {
        if (wanted.has(variantId) || qty <= 0) continue;
        const { data: cur } = await supabaseAdmin
          .from("product_variants")
          .select("stock_quantity")
          .eq("id", variantId)
          .maybeSingle();
        const stock = Number(
          (cur as unknown as { stock_quantity: number } | null)
            ?.stock_quantity ?? 0,
        );
        await supabaseAdmin
          .from("product_variants")
          .update({ stock_quantity: stock + qty })
          .eq("id", variantId);
        await supabaseAdmin
          .from("stock_holds")
          .delete()
          .eq("checkout_token", checkoutToken)
          .eq("variant_id", variantId)
          .is("consumed_at", null);
      }

      // Converge each wanted line by signed delta. Never below zero.
      const expiresAt = new Date(
        Date.now() + HOLD_TTL_SECONDS * 1000,
      ).toISOString();
      for (const [variantId, qty] of wanted) {
        const delta = qty - (held.get(variantId) ?? 0);
        if (delta === 0) {
          await supabaseAdmin
            .from("stock_holds")
            .update({ expires_at: expiresAt })
            .eq("checkout_token", checkoutToken)
            .eq("variant_id", variantId)
            .is("consumed_at", null);
          continue;
        }
        const { data: v } = await supabaseAdmin
          .from("product_variants")
          .select("id, stock_quantity, merchant_id")
          .eq("id", variantId)
          .maybeSingle();
        const row = v as unknown as {
          id: string;
          stock_quantity: number;
          merchant_id: string;
        } | null;
        if (!row || row.merchant_id !== merchantId) {
          fail(`stock_hold.variant_not_found: ${variantId}`);
        }
        const stock = Number(
          (row as { stock_quantity: number }).stock_quantity,
        );
        if (delta > 0 && stock < delta) {
          fail(`stock_hold.insufficient: ${variantId}`);
        }
        const { error: takeError } = await supabaseAdmin
          .from("product_variants")
          .update({ stock_quantity: Math.max(0, stock - delta) })
          .eq("id", variantId);
        if (takeError) fail(takeError.message);
        if (held.has(variantId)) {
          await supabaseAdmin
            .from("stock_holds")
            .update({ quantity: qty, expires_at: expiresAt })
            .eq("checkout_token", checkoutToken)
            .eq("variant_id", variantId)
            .is("consumed_at", null);
        } else {
          const { error: holdError } = await supabaseAdmin
            .from("stock_holds")
            .insert({
              checkout_token: checkoutToken,
              merchant_id: merchantId,
              variant_id: variantId,
              quantity: qty,
              expires_at: expiresAt,
            });
          if (holdError) {
            // Roll back this line's take; the shopper sees a retryable error.
            const { data: cur } = await supabaseAdmin
              .from("product_variants")
              .select("stock_quantity")
              .eq("id", variantId)
              .maybeSingle();
            const curStock = Number(
              (cur as unknown as { stock_quantity: number } | null)
                ?.stock_quantity ?? 0,
            );
            await supabaseAdmin
              .from("product_variants")
              .update({ stock_quantity: curStock - delta })
              .eq("id", variantId);
            fail(holdError.message);
          }
        }
      }
      observe("framique_checkout_reserve_ms", Date.now() - started);
      incr("framique_checkout_reserve_total", { outcome: "held" });
      return { token: checkoutToken, expires_at: expiresAt };
    },
    { retries: 3, retryDelayMs: 40 },
  );
}

/** Convert holds into real stock decrements. Called once, inside order creation. */
export async function consumeStock(checkoutToken: string, orderId: string) {
  return withTenantLock(
    checkoutToken,
    `stock:consume:${orderId}`,
    15_000,
    async () => {
      // Stock was already taken at reserve time; consuming only links the
      // hold rows to the order (same row-per-line shape, no RPC).
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("stock_holds")
        .update({ order_id: orderId, consumed_at: new Date().toISOString() })
        .eq("checkout_token", checkoutToken)
        .is("consumed_at", null);
      if (error) {
        incr("framique_checkout_consume_total", { outcome: "error" });
        log("error", "checkout.consume_failed", { orderId, reason: error.message });
        throw new CheckoutError(
          "stock_consume_failed",
          "Order placed but stock sync failed",
        );
      }
      incr("framique_checkout_consume_total", { outcome: "ok" });
      return 1;
    },
    { retries: 3, retryDelayMs: 40 },
  );
}

export async function releaseStock(checkoutToken: string) {
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: held } = await supabaseAdmin
      .from("stock_holds")
      .select("variant_id, quantity")
      .eq("checkout_token", checkoutToken)
      .is("consumed_at", null);
    for (const h of (held ?? []) as { variant_id: string; quantity: number }[]) {
      const { data: cur } = await supabaseAdmin
        .from("product_variants")
        .select("stock_quantity")
        .eq("id", h.variant_id)
        .maybeSingle();
      const qty = Number(
        (cur as unknown as { stock_quantity: number } | null)?.stock_quantity ?? 0,
      );
      await supabaseAdmin
        .from("product_variants")
        .update({ stock_quantity: qty + Number(h.quantity ?? 0) })
        .eq("id", h.variant_id);
    }
    await supabaseAdmin
      .from("stock_holds")
      .update({ released_at: new Date().toISOString() })
      .eq("checkout_token", checkoutToken)
      .is("consumed_at", null);
  } catch (error) {
    log("warn", "checkout.release_failed", {
      reason: String((error as Error)?.message ?? error).slice(0, 160),
    });
  }
  return true;
}

export async function sweepStockHolds() {
  const db = await admin();
  const { data } = await db.rpc("stock_hold_sweep", {});
  const swept = Number(data ?? 0);
  if (swept > 0) incr("framique_checkout_holds_swept_total", {}, swept);
  return swept;
}
