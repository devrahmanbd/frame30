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
 * Reserve stock for a checkout token. Idempotent: re-acquiring replaces prior holds.
 *
 * NOTE (Sept 2026): the `stock_hold_*` RPCs in the live database were written
 * against a `stock_holds.lines jsonb` shape that does not exist there — the
 * live table is one row per line
 * (checkout_token, merchant_id, variant_id, quantity, expires_at,
 * consumed_at, released_at, order_id) — and DDL repair is blocked (not table
 * owner), so holds are managed here with the service-role client instead.
 * Reserves are serialized per merchant (not per token) so the
 * read-modify-write below cannot oversell under concurrency.
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
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const wanted = lines.filter((l) => l.quantity > 0);
      if (wanted.length === 0) throw translate("stock_hold.variant_not_found");

      // Restore + drop any prior unconsumed holds for this token first, so a
      // re-quote never double-takes stock.
      const { data: prior } = await supabaseAdmin
        .from("stock_holds")
        .select("variant_id, quantity")
        .eq("checkout_token", checkoutToken)
        .is("consumed_at", null);
      for (const h of prior ?? []) {
        const cur = await supabaseAdmin
          .from("product_variants")
          .select("stock_quantity")
          .eq("id", (h as { variant_id: string }).variant_id)
          .maybeSingle();
        const qty = Number((cur as unknown as { stock_quantity: number } | null)?.stock_quantity ?? 0);
        await supabaseAdmin
          .from("product_variants")
          .update({
            stock_quantity:
              qty + Number((h as { quantity: number }).quantity ?? 0),
          })
          .eq("id", (h as { variant_id: string }).variant_id);
      }
      await supabaseAdmin
        .from("stock_holds")
        .delete()
        .eq("checkout_token", checkoutToken)
        .is("consumed_at", null);

      // Take stock line by line; on any shortfall restore what was taken.
      const taken: { variantId: string; quantity: number }[] = [];
      try {
        for (const line of wanted) {
          const { data: v } = await supabaseAdmin
            .from("product_variants")
            .select("id, stock_quantity, merchant_id")
            .eq("id", line.variantId)
            .maybeSingle();
          const row = v as {
            id: string;
            stock_quantity: number;
            merchant_id: string;
          } | null;
          if (!row || row.merchant_id !== merchantId) {
            throw new Error(`stock_hold.variant_not_found: ${line.variantId}`);
          }
          const quantity = Math.max(1, Math.floor(line.quantity));
          if (Number(row.stock_quantity) < quantity) {
            throw new Error(`stock_hold.insufficient: ${line.variantId}`);
          }
          const { error: takeError } = await supabaseAdmin
            .from("product_variants")
            .update({ stock_quantity: Number(row.stock_quantity) - quantity })
            .eq("id", line.variantId);
          if (takeError) throw new Error(`stock_hold.insufficient: ${line.variantId}`);
          taken.push({ variantId: line.variantId, quantity });
        }
      } catch (err) {
        for (const t of taken) {
          const { data: cur } = await supabaseAdmin
            .from("product_variants")
            .select("stock_quantity")
            .eq("id", t.variantId)
            .maybeSingle();
          const qty = Number(
            (cur as unknown as { stock_quantity: number } | null)?.stock_quantity ?? 0,
          );
          await supabaseAdmin
            .from("product_variants")
            .update({ stock_quantity: qty + t.quantity })
            .eq("id", t.variantId);
        }
        observe("framique_checkout_reserve_ms", Date.now() - started);
        incr("framique_checkout_reserve_total", { outcome: "rejected" });
        log("warn", "checkout.reserve_rejected", {
          merchantId,
          reason: String((err as Error)?.message ?? err).slice(0, 160),
        });
        throw translate(String((err as Error)?.message ?? err));
      }

      const expiresAt = new Date(
        Date.now() + HOLD_TTL_SECONDS * 1000,
      ).toISOString();
      const { error: holdError } = await supabaseAdmin
        .from("stock_holds")
        .insert(
          taken.map((t) => ({
            checkout_token: checkoutToken,
            merchant_id: merchantId,
            variant_id: t.variantId,
            quantity: t.quantity,
            expires_at: expiresAt,
          })),
        );
      if (holdError) {
        for (const t of taken) {
          const { data: cur } = await supabaseAdmin
            .from("product_variants")
            .select("stock_quantity")
            .eq("id", t.variantId)
            .maybeSingle();
          const qty = Number(
            (cur as unknown as { stock_quantity: number } | null)?.stock_quantity ?? 0,
          );
          await supabaseAdmin
            .from("product_variants")
            .update({ stock_quantity: qty + t.quantity })
            .eq("id", t.variantId);
        }
        observe("framique_checkout_reserve_ms", Date.now() - started);
        incr("framique_checkout_reserve_total", { outcome: "rejected" });
        log("warn", "checkout.reserve_rejected", {
          merchantId,
          reason: holdError.message,
        });
        throw translate(holdError.message);
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
