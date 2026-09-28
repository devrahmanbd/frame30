import type { Database } from "@/integrations/supabase/types";
import {
  priceCart,
  publicClient,
  type CartInput,
  type PaymentMethod,
} from "./pricing.server";
import { consumeStock, releaseStock, reserveStock } from "./checkout.server";
import { CouponError } from "./coupons.server";
import { incr, log, observe, tenantLabel } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type PlaceOrderInput = {
  slug: string;
  cart: CartInput;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  /** Ties the order to the stock holds taken while the shopper was in checkout. */
  checkoutToken?: string;
  couponCode?: string;
  /** Hidden field only automation fills; any value trips the honeypot. */
  honeypot?: string;
  beacon?: {
    userAgent?: string | null;
    interactions?: number;
    dwellMs?: number;
    pointerMoves?: number;
    webdriver?: boolean;
  } | null;
  customer: {
    name: string;
    phone: string;
    email?: string;
    addressLine: string;
    city: string;
    postcode?: string;
    note?: string;
  };
};

function orderNumber() {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `FQ-${stamp}-${rand}`;
}

/** PostgREST unique-violation shape (code 23505), with a message fallback. */
function isUniqueViolation(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error?.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error?.message ?? "");
}

/** Untyped RPC surface for SQL helpers not present in the generated types. */
type SlotRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: { slot_coupon_id: string }[] | null;
    error: { message?: string } | null;
  }>;
};

/**
 * Best-effort release of pre-reserved coupon slots. Compensation must never
 * mask the original failure, so per-slot errors are logged and swallowed.
 */
async function releaseCouponSlots(
  admin: unknown,
  couponIds: string[],
  merchantId: string,
) {
  for (const couponId of couponIds) {
    const { error } = await (admin as unknown as SlotRpc).rpc(
      "release_coupon_slot",
      { _coupon_id: couponId },
    );
    if (error) {
      log("warn", "coupon.slot_release_failed", {
        merchantId,
        couponId,
        reason: (error.message ?? "unknown").slice(0, 160),
      });
    }
  }
}

export async function createOrder(
  input: PlaceOrderInput,
  subject = "anonymous",
) {
  await enforceRateLimit("checkout.place", subject);
  const started = Date.now();
  const { merchant, totals } = await priceCart(
    input.slug,
    input.cart,
    input.paymentMethod,
    input.couponCode,
    input.customer.phone,
  );
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, access_token")
    .eq("merchant_id", merchant.id)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) {
    incr("framique_orders_total", {
      outcome: "replayed",
      tenant: tenantLabel(merchant.id),
    });
    return {
      orderId: existing.id,
      orderNumber: existing.order_number,
      accessToken: existing.access_token,
    };
  }

  // Fraud rail runs before any write: a blocked verdict never reaches stock.
  const { assessCheckout, recordHoneypotTrip } = await import("./fraud.server");
  const honeypotTripped = Boolean(
    input.honeypot && input.honeypot.trim().length > 0,
  );
  if (honeypotTripped) await recordHoneypotTrip(merchant.id, "checkout");
  const verdict = await assessCheckout(
    merchant.id,
    {
      phone: input.customer.phone,
      email: input.customer.email || null,
      addressLine: input.customer.addressLine,
      amountMinorInt: totals.totalMinor,
      paymentMethod: input.paymentMethod,
      honeypotTripped,
      beacon: input.beacon ?? null,
    },
    subject,
  );
  if (verdict.action === "block") {
    incr("framique_orders_total", {
      outcome: "fraud_blocked",
      tenant: tenantLabel(merchant.id),
    });
    log("warn", "order.fraud_blocked", {
      merchantId: merchant.id,
      rule: verdict.decisiveCode,
      score: verdict.score,
    });
    throw new Error("order_blocked_risk");
  }

  // Coupon slots are reserved BEFORE any write, while the cap can still be
  // denied cleanly: a denied coupon leaves no order/items/stock/payment
  // rows behind to compensate. Every reservation is released on any later
  // failure, including losing the same-key race below.
  const reservedCouponIds: string[] = [];
  try {
    for (const applied of totals.coupons) {
      const { data: slot, error: slotError } = await (
        supabaseAdmin as unknown as SlotRpc
      ).rpc("redeem_coupon_slot", { _coupon_id: applied.id });
      if (slotError) {
        incr("framique_coupon_redeem_total", { outcome: "error" });
        log("error", "coupon.slot_failed", {
          merchantId: merchant.id,
          couponId: applied.id,
          reason: (slotError.message ?? "unknown").slice(0, 160),
        });
        throw new Error("coupon_redeem_failed");
      }
      if (!slot || slot.length === 0) {
        incr("framique_coupon_redeem_total", { outcome: "rejected" });
        log("warn", "coupon.usage_exhausted", {
          merchantId: merchant.id,
          couponId: applied.id,
        });
        throw new CouponError(
          "coupon_usage_limit",
          "Coupon usage limit has been reached",
        );
      }
      reservedCouponIds.push(applied.id);
    }
  } catch (error) {
    await releaseCouponSlots(supabaseAdmin, reservedCouponIds, merchant.id);
    throw error;
  }

  // Reserve stock before writing anything; a losing shopper never gets an order row.
  // Guarded: slots were already reserved above, so a reserve throw must give
  // them back (plus release any partial take) instead of leaking the cap.
  const checkoutToken = input.checkoutToken ?? `${input.idempotencyKey}-hold`;
  try {
    await reserveStock(
      merchant.id,
      checkoutToken,
      totals.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
      })),
      subject,
    );
  } catch (error) {
    await releaseStock(checkoutToken, merchant.id);
    await releaseCouponSlots(supabaseAdmin, reservedCouponIds, merchant.id);
    throw error;
  }

  /**
   * Void a half-written order so no LIVE discounted order survives a
   * write failure after the insert: the row is cancelled (lines stay
   * attached for the ops trail, fulfilment gates on status), the stock
   * hold is released when still unconsumed (still unconsumed at every
   * pre-consume call site), the pre-reserved coupon slots go back, and
   * the void itself is audited.
   *
   * Post-consume callers pass `{ consumed: true }`: consumed holds are
   * invisible to `releaseStock` (it only restores unconsumed holds), so
   * the taken quantities are restored directly from the order lines.
   */
  const voidHalfWrittenOrder = async (
    orderId: string,
    reason: string,
    opts?: { consumed?: boolean },
  ) => {
    await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId);
    try {
      await supabaseAdmin.from("order_events").insert({
        order_id: orderId,
        merchant_id: merchant.id,
        event_type: "order.cancelled",
        note: reason.slice(0, 200),
      });
    } catch {
      /* audit is best effort; the throw below is the signal */
    }
    await releaseStock(checkoutToken, merchant.id);
    if (opts?.consumed) {
      for (const l of totals.lines) {
        const { data: cur } = await supabaseAdmin
          .from("product_variants")
          .select("stock_quantity")
          .eq("id", l.variantId)
          .maybeSingle();
        const qty = Number(
          (cur as unknown as { stock_quantity: number } | null)
            ?.stock_quantity ?? 0,
        );
        await supabaseAdmin
          .from("product_variants")
          .update({ stock_quantity: qty + l.quantity })
          .eq("id", l.variantId);
      }
    }
    await releaseCouponSlots(
      supabaseAdmin,
      totals.coupons.map((c) => c.id),
      merchant.id,
    );
  };

  // Associate order with customer (authenticated user or guest by phone)
  const { resolveRequestUserId } = await import("./identity.server");
  const userId = await resolveRequestUserId();
  let customerId: string | null = null;

  if (userId) {
    const { data: existingCustomer } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("merchant_id", merchant.id)
      .eq("auth_uid", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer } = await supabaseAdmin
        .from("customers")
        .insert({
          merchant_id: merchant.id,
          auth_uid: userId,
          name: input.customer.name,
          phone: input.customer.phone,
          email: input.customer.email || null,
        })
        .select("id")
        .maybeSingle();
      customerId = newCustomer?.id ?? null;
    }
  } else if (input.customer.phone) {
    const { data: phoneCustomer } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("merchant_id", merchant.id)
      .eq("phone", input.customer.phone)
      .is("deleted_at", null)
      .maybeSingle();

    if (phoneCustomer) {
      customerId = phoneCustomer.id;
    } else {
      const { data: newCustomer } = await supabaseAdmin
        .from("customers")
        .insert({
          merchant_id: merchant.id,
          name: input.customer.name,
          phone: input.customer.phone,
          email: input.customer.email || null,
        })
        .select("id")
        .maybeSingle();
      customerId = newCustomer?.id ?? null;
    }
  }

  const status =
    input.paymentMethod === "cod" ? "confirmed" : "payment_pending";
  // The orders table defaults access_token to '' — generate it here so the
  // receipt page (which requires ≥16 chars) always has a token to load.
  const accessToken = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      merchant_id: merchant.id,
      customer_id: customerId,
      order_number: orderNumber(),
      access_token: accessToken,
      status,
      payment_method: input.paymentMethod,
      currency_code: totals.currency,
      subtotal_minor_int: totals.subtotalMinor,
      discount_minor_int: totals.discountMinor,
      shipping_minor_int: totals.shippingMinor,
      cod_surcharge_minor_int: totals.codSurchargeMinor,
      vat_minor_int: totals.vatMinor,
      vat_rate_basis_points: totals.vatRateBasisPoints,
      total_minor_int: totals.totalMinor,
      customer_name: input.customer.name,
      customer_phone: input.customer.phone,
      customer_email: input.customer.email || null,
      address_line: input.customer.addressLine,
      city: input.customer.city,
      postcode: input.customer.postcode || null,
      note: input.customer.note || null,
      idempotency_key: input.idempotencyKey,
    })
    .select("id, order_number, access_token")
    .single();
  if (error) {
    // This attempt reserved coupon slots before the insert: give them back
    // whether the insert lost the race or failed outright.
    await releaseCouponSlots(supabaseAdmin, reservedCouponIds, merchant.id);
    // Lost the same-key race: a concurrent submit won the insert (unique
    // backstop `orders_merchant_idem_key_uidx`). Release this attempt's
    // stock hold exactly once, then replay the winner like a normal
    // duplicate — the shopper sees their order, not a 500.
    if (isUniqueViolation(error)) {
      const { data: winner } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, access_token")
        .eq("merchant_id", merchant.id)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (winner) {
        await releaseStock(checkoutToken, merchant.id);
        incr("framique_orders_total", {
          outcome: "replayed",
          tenant: tenantLabel(merchant.id),
        });
        log("info", "order.replayed_on_conflict", {
          merchantId: merchant.id,
          orderId: winner.id,
        });
        return {
          orderId: winner.id,
          orderNumber: winner.order_number,
          accessToken: winner.access_token,
        };
      }
    }
    await releaseStock(checkoutToken, merchant.id);
    incr("framique_orders_total", {
      outcome: "failed",
      tenant: tenantLabel(merchant.id),
    });
    log("error", "order.insert_failed", {
      merchantId: merchant.id,
      reason: error.message,
    });
    throw error;
  }

  const { error: itemsError } = await supabaseAdmin.from("order_items").insert(
    totals.lines.map((l) => ({
      order_id: order.id,
      merchant_id: merchant.id,
      variant_id: l.variantId,
      product_title: l.productTitle,
      variant_name: l.variantName,
      sku: l.sku,
      unit_price_minor_int: l.unitPriceMinor,
      quantity: l.quantity,
      line_total_minor_int: l.lineTotalMinor,
    })),
  );
  if (itemsError) {
    await voidHalfWrittenOrder(
      order.id,
      `items failed: ${itemsError.message.slice(0, 160)}`,
    );
    throw itemsError;
  }

  // Coupon redemptions are RECORDED here; the slots were already reserved
  // atomically before the order insert, so a deny there never leaves a
  // half-written order. A recording failure still voids the order (plus
  // slot release) so the discount is never granted without a record.
  for (const applied of totals.coupons) {
    const { error: redeemError } = await supabaseAdmin
      .from("coupon_redemptions")
      .insert({
        merchant_id: merchant.id,
        coupon_id: applied.id,
        order_id: order.id,
        customer_key: input.customer.phone,
        amount_minor_int: applied.discountMinor,
        currency_code: totals.currency,
      });
    if (redeemError) {
      // A redemption that cannot be recorded must never silently grant the
      // discount: fail loudly (metric + error log + audit attempt), void
      // the half-written order, and release the pre-reserved slots.
      incr("framique_coupon_redeem_total", { outcome: "error" });
      log("error", "coupon.redeem_failed", {
        merchantId: merchant.id,
        orderId: order.id,
        couponId: applied.id,
        reason: redeemError.message,
      });
      try {
        await supabaseAdmin.from("order_events").insert({
          order_id: order.id,
          merchant_id: merchant.id,
          event_type: "coupon.redeem_failed",
          note: `${applied.code} — recording failed: ${redeemError.message.slice(0, 160)}`,
        });
      } catch {
        /* audit is best effort; the throw below is the signal */
      }
      await voidHalfWrittenOrder(
        order.id,
        `${applied.code} — recording failed`,
      );
      throw new Error("coupon_redeem_failed");
    }
    await supabaseAdmin.from("order_events").insert({
      order_id: order.id,
      merchant_id: merchant.id,
      event_type: "coupon.redeemed",
      note: `${applied.code} — ${applied.discountMinor} ${totals.currency} minor units`,
    });
  }

  // Holds become the single source of the decrement — never a read-modify-write.
  // Guarded: a consume throw must void the half-written order (stock is
  // still unconsumed here, so the void's hold-release restores it).
  try {
    await consumeStock(checkoutToken, order.id);
  } catch (error) {
    incr("framique_orders_total", {
      outcome: "failed",
      tenant: tenantLabel(merchant.id),
    });
    log("error", "order.consume_failed", {
      merchantId: merchant.id,
      orderId: order.id,
      reason: String((error as Error)?.message ?? error).slice(0, 160),
    });
    await voidHalfWrittenOrder(
      order.id,
      `consume failed: ${String((error as Error)?.message ?? error).slice(0, 160)}`,
    );
    throw error;
  }

  // Guarded: a payments write failure must void the order. T1: no payment
  // row exists before settlement for online rails — the settlement path
  // (applySignedReturn) inserts the single paid row; a premature
  // MOCK-reference row here would also shadow it on the shared idempotency
  // key. COD keeps its pending row (reconciled at the door). Holds are
  // already consumed here, so the void compensates the taken stock
  // directly (`{ consumed: true }`) instead of relying on hold-release.
  if (input.paymentMethod === "cod") {
    const { error: paymentsError } = await supabaseAdmin
      .from("payments")
      .insert({
        merchant_id: merchant.id,
        order_id: order.id,
        payment_provider: input.paymentMethod,
        payment_status: "pending",
        currency_code: totals.currency,
        amount_minor_int: totals.totalMinor,
        provider_reference: null,
        idempotency_key: input.idempotencyKey,
      });
    if (paymentsError) {
      incr("framique_orders_total", {
        outcome: "failed",
        tenant: tenantLabel(merchant.id),
      });
      log("error", "order.payment_failed", {
        merchantId: merchant.id,
        orderId: order.id,
        reason: paymentsError.message.slice(0, 160),
      });
      await voidHalfWrittenOrder(
        order.id,
        `payments failed: ${paymentsError.message.slice(0, 160)}`,
        { consumed: true },
      );
      throw paymentsError;
    }
  }

  await supabaseAdmin.from("order_events").insert([
    {
      order_id: order.id,
      merchant_id: merchant.id,
      event_type: "order.placed",
    },
    {
      order_id: order.id,
      merchant_id: merchant.id,
      event_type:
        input.paymentMethod === "cod"
          ? "order.cod_confirmed"
          : "order.payment_pending",
      note:
        input.paymentMethod === "cod"
          ? "Cash on delivery confirmed"
          : "Awaiting online payment",
    },
  ]);

  // Review verdicts open a case; the case holds fulfilment until a human clears it.
  const { recordOrderVerdict } = await import("./fraud.server");
  const caseId = await recordOrderVerdict(
    merchant.id,
    order.id,
    order.order_number,
    input.customer.phone,
    totals.currency,
    totals.totalMinor,
    verdict,
  );
  if (caseId)
    await supabaseAdmin.from("order_events").insert({
      order_id: order.id,
      merchant_id: merchant.id,
      event_type: "fraud.review_opened",
      note: `Risk ${verdict.score} — fulfilment held pending review`,
    });

  // Last funnel step. Recorded here, server-side, so the paid count and its
  // value come from the order we just wrote rather than from the browser.
  // T1: only COD (confirmed, first-class tender) reports paid at placement;
  // online rails report paid from the verified settlement path instead, so an
  // unpaid order never counts as paid.
  // Failure is swallowed: telemetry may never fail a shopper's order.
  try {
    if (input.paymentMethod === "cod") {
      const { ingestBeacons } = await import("./analytics-warehouse.server");
      const { requestGeo } = await import("./geo.server");
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      const geo = req ? await requestGeo(req) : {};
      await ingestBeacons(
        supabaseAdmin as never,
        merchant.id,
        [
          {
            entity: "order",
            action: "paid",
            valueMinorInt: totals.totalMinor,
            currencyCode: totals.currency,
            dedupeKey: `order:paid:${order.id}`,
            payload: { method: input.paymentMethod },
          },
        ],
        geo,
      );
    }
  } catch {
    /* analytics is best effort */
  }

  // Automated transactional mail: purchase confirmation & welcome email
  if (input.customer.email) {
    try {
      const { sendOrderConfirmationEmail, sendCustomerWelcomeEmail } =
        await import("./transactional-mailer.server");
      void sendOrderConfirmationEmail({
        db: supabaseAdmin,
        merchantId: merchant.id,
        orderId: order.id,
      });
      if (customerId) {
        void sendCustomerWelcomeEmail({
          db: supabaseAdmin,
          merchantId: merchant.id,
          customerEmail: input.customer.email,
          customerName: input.customer.name,
        });
      }
    } catch {
      /* transactional email failure must never fail order creation */
    }
  }

  observe("framique_order_place_ms", Date.now() - started, {
    method: input.paymentMethod,
  });
  incr("framique_orders_total", {
    outcome: "created",
    method: input.paymentMethod,
    tenant: tenantLabel(merchant.id),
  });
  log("info", "order.created", {
    merchantId: merchant.id,
    orderId: order.id,
    totalMinor: totals.totalMinor,
    currency: totals.currency,
  });
  // R2-4: advisory hook — never affects the core result.
  try {
    const { listInstalledPlugins } = await import("./plugins.server");
    const { runHook } = await import("./plugin-hooks.server");
    const installed = await listInstalledPlugins(
      supabaseAdmin as never,
      merchant.id,
    );
    const outcomes = await runHook(installed, "order.created", {
      merchantId: merchant.id,
      orderId: order.id,
      totalMinor: totals.totalMinor,
      currency: totals.currency,
    });
    log("info", "plugin.hook.emitted", {
      hook: "order.created",
      merchantId: merchant.id,
      outcomes: outcomes.map((o) => `${o.pluginId}:${o.status}`),
    });
  } catch {
    /* emission must never fail order creation */
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    accessToken,
  };
}

type Row<T extends "orders" | "order_items"> =
  Database["public"]["Tables"][T]["Row"];

export type PublicOrderView = {
  order: Omit<Row<"orders">, "access_token" | "idempotency_key">;
  items: (Row<"order_items"> & { image_url?: string | null })[];
  events: { event_type: string; note: string | null; created_at: string }[];
  merchant: { name: string; slug: string } | null;
};

/**
 * Guest-safe order read. Returns null unless the caller holds the order's
 * access token, owns the order, or is staff of the store — an order id alone
 * is never enough.
 *
 * NOTE (Sept 2026): the live `order_public_view` RPC is a stub that neither
 * checks the token nor matches the orders columns, so the read is composed
 * here with the service-role client. The token gate below is strict: empty
 * or mismatched tokens are denied exactly like a missing order.
 */
export async function loadOrder(
  orderId: string,
  accessToken?: string,
  subject = "anonymous",
) {
  await enforceRateLimit("order.lookup", subject);
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    log("warn", "order.lookup_failed", { orderId, reason: error.message });
    return null;
  }
  const row = order as
    | (Record<string, unknown> & {
        access_token?: string;
        idempotency_key?: string;
        merchant_id?: string;
      })
    | null;
  if (
    !row ||
    typeof row.access_token !== "string" ||
    row.access_token.length < 16 ||
    row.access_token !== accessToken
  ) {
    incr("framique_order_lookup_total", { outcome: "denied" });
    return null;
  }
  const [{ data: items }, { data: events }, { data: merchant }] =
    await Promise.all([
      supabaseAdmin
        .from("order_items")
        .select("*, product_variants(products(image_url))")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("order_events")
        .select("event_type, note, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("merchants")
        .select("name, slug")
        .eq("id", row.merchant_id as string)
        .maybeSingle(),
    ]);
  incr("framique_order_lookup_total", { outcome: "ok" });
  const { access_token: _t, idempotency_key: _k, ...publicOrder } = row;
  return {
    order: publicOrder,
    items: (items ?? []).map((i: any) => {
      const img = i.product_variants?.products?.image_url;
      delete i.product_variants;
      return { ...i, image_url: img ?? null };
    }) as (Row<"order_items"> & { image_url?: string | null })[],
    events: (events ?? []) as {
      event_type: string;
      note: string | null;
      created_at: string;
    }[],
    merchant: (merchant ?? null) as { name: string; slug: string } | null,
  } as PublicOrderView;
}

/** Hold stock while the shopper fills in the checkout form. */
export async function reserveCheckoutStock(
  slug: string,
  checkoutToken: string,
  cart: CartInput,
  subject = "anonymous",
) {
  const db = publicClient();
  const { data: merchant } = await db
    .from("merchants")
    .select("id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!merchant) throw new Error("Store not found");
  return reserveStock(
    merchant.id,
    checkoutToken,
    cart
      .filter((l) => l.quantity > 0)
      .map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    subject,
  );
}
