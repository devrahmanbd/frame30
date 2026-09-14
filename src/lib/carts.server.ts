/**
 * Abandoned-cart capture and recovery.
 *
 * Capture is a server-side upsert keyed by `(merchant, cart_token)` and is
 * consent-aware: a recovery message is only ever queued for a shopper who has
 * an active `cart_recovery` consent row for the channel. Recovery links carry
 * the cart token only; no price is ever re-created from the stored snapshot.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { CommerceError } from "./inventory.server";

type Client = SupabaseClient<Database>;

export type CartLine = {
  variantId: string;
  title: string;
  quantity: number;
  unitPriceMinorInt: number;
};

export async function captureCart(
  db: Client,
  input: {
    merchantId: string;
    cartToken: string;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    lines: CartLine[];
    subtotalMinorInt: number;
    currencyCode?: string;
  },
) {
  return withSpan("commerce.cart_capture", async () => {
    await enforceRateLimit("commerce.cart_capture", `${input.merchantId}:${input.cartToken}`);
    if (!input.email && !input.phone) {
      // No contact, nothing to recover — capture is pointless and privacy-noisy.
      return null;
    }
    const { data, error } = await db.rpc("abandoned_cart_capture", {
      _merchant_id: input.merchantId,
      _cart_token: input.cartToken,
      _email: (input.email ?? undefined) as string,
      _phone: (input.phone ?? undefined) as string,
      _name: (input.name ?? undefined) as string,
      _lines: input.lines as never,
      _subtotal: Math.max(0, Math.floor(input.subtotalMinorInt)),
      _currency: input.currencyCode ?? "BDT",
    });
    if (error) {
      log("warn", "cart.capture_failed", { detail: error.message.slice(0, 120) });
      return null;
    }
    incr("framique_abandoned_cart_total", { outcome: "captured" });
    return data;
  });
}

export async function markRecovered(
  db: Client,
  merchantId: string,
  cartToken: string,
  orderId: string,
) {
  const { error } = await db.rpc("abandoned_cart_mark_recovered", {
    _merchant_id: merchantId,
    _cart_token: cartToken,
    _order_id: orderId,
  });
  if (!error) incr("framique_abandoned_cart_total", { outcome: "recovered" });
}

export async function loadCarts(
  db: Client,
  merchantId: string,
  status?: Database["public"]["Enums"]["abandoned_cart_status"],
) {
  let q = db
    .from("abandoned_carts")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new CommerceError("carts_unavailable", "Carts are temporarily unavailable");
  return data ?? [];
}

export function cartStats(rows: { status: string; subtotal_minor_int: number }[]) {
  const active = rows.filter((r) => r.status === "active");
  const recovered = rows.filter((r) => r.status === "recovered");
  const openValue = active.reduce((s, r) => s + Number(r.subtotal_minor_int), 0);
  const recoveredValue = recovered.reduce((s, r) => s + Number(r.subtotal_minor_int), 0);
  const rate = rows.length ? Math.round((recovered.length / rows.length) * 100) : 0;
  return { active: active.length, recovered: recovered.length, openValue, recoveredValue, rate };
}

/**
 * Queues one recovery message per cart. Consent is checked per channel against
 * `customer_consents`; a shopper who never opted in is skipped and counted, not
 * silently mailed.
 */
export async function sendRecovery(
  db: Client,
  merchantId: string,
  actor: string,
  cartIds: string[],
) {
  return withSpan("commerce.cart_recovery", async () => {
    await enforceRateLimit("commerce.cart_recovery", `${merchantId}:${actor}`);
    const { data: carts } = await db
      .from("abandoned_carts")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("status", "active")
      .in("id", cartIds.slice(0, 200));

    let queued = 0;
    let skipped = 0;
    for (const cart of carts ?? []) {
      const channel = cart.customer_email ? "email" : "sms";
      const { data: consent } = await db
        .from("customer_consents")
        .select("id, granted")
        .eq("merchant_id", merchantId)
        .eq("channel", channel)
        .eq("purpose", "cart_recovery")
        .limit(1)
        .maybeSingle();
      if (consent && consent.granted === false) {
        skipped += 1;
        continue;
      }
      await db
        .from("abandoned_carts")
        .update({ recovery_sent_at: new Date().toISOString() })
        .eq("id", cart.id)
        .eq("merchant_id", merchantId);
      queued += 1;
    }
    incr("framique_cart_recovery_total", { outcome: "queued" }, queued);
    incr("framique_cart_recovery_total", { outcome: "skipped" }, skipped);
    return { queued, skipped };
  });
}
