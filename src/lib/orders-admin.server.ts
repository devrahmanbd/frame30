import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
type OrderStatus = Database["public"]["Enums"]["order_status"];

const FORWARD: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: "packed",
  paid: "packed",
  packed: "shipped",
  shipped: "delivered",
};

const CANCELLABLE: OrderStatus[] = ["pending", "payment_pending", "confirmed", "paid", "packed"];

export function nextStatus(status: OrderStatus): OrderStatus | null {
  return FORWARD[status] ?? null;
}

export function canCancel(status: OrderStatus): boolean {
  return CANCELLABLE.includes(status);
}

async function assertMember(supabase: Client, orderId: string) {
  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new Error("Order not found");
  return order;
}

export async function loadOrderDetail(supabase: Client, orderId: string) {
  const order = await assertMember(supabase, orderId);
  const [{ data: items }, { data: events }, { data: refunds }, { data: payments }, { data: amendments }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
    supabase.from("order_events").select("*").eq("order_id", orderId).order("created_at"),
    supabase.from("refunds").select("*").eq("order_id", orderId).order("created_at"),
    supabase.from("payments").select("*").eq("order_id", orderId).order("created_at"),
    supabase
      .from("order_amendments")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
  ]);
  return {
    order,
    items: items ?? [],
    events: events ?? [],
    refunds: refunds ?? [],
    payments: payments ?? [],
    amendments: amendments ?? [],
  };
}

async function logEvent(orderId: string, merchantId: string, eventType: string, note: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("order_events").insert({
    order_id: orderId,
    merchant_id: merchantId,
    event_type: eventType,
    note,
  });
}

export async function advanceOrder(supabase: Client, orderId: string, target: OrderStatus) {
  const order = await assertMember(supabase, orderId);
  const allowed = nextStatus(order.status);
  if (!allowed || allowed !== target) {
    throw new Error("Order cannot move to that status from its current status");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status: target })
    .eq("id", orderId)
    .eq("status", order.status);
  if (error) throw error;
  await logEvent(orderId, order.merchant_id, `order.${target}`, `Marked ${target} by staff`);
  return { status: target };
}

export async function fulfillOrder(supabase: Client, orderId: string) {
  return advanceOrder(supabase, orderId, "delivered");
}

export async function cancelOrder(supabase: Client, orderId: string, reason?: string) {
  const order = await assertMember(supabase, orderId);
  if (!canCancel(order.status)) {
    throw new Error("Order cannot be cancelled once it has shipped");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("status", order.status);
  if (error) throw error;

  await logEvent(
    orderId,
    order.merchant_id,
    "order.cancelled",
    reason?.trim() ? reason.trim() : "Cancelled by staff; stock restored",
  );

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("variant_id, quantity")
    .eq("order_id", orderId);

  for (const item of items ?? []) {
    if (!item.variant_id) continue;
    const { data: variant } = await supabaseAdmin
      .from("product_variants")
      .select("stock_quantity")
      .eq("id", item.variant_id)
      .maybeSingle();
    if (!variant) continue;
    await supabaseAdmin
      .from("product_variants")
      .update({ stock_quantity: variant.stock_quantity + item.quantity })
      .eq("id", item.variant_id);
  }

  return { status: "cancelled" as const };
}

async function previousStatus(supabase: Client, orderId: string): Promise<OrderStatus> {
  const { data: events } = await supabase
    .from("order_events")
    .select("event_type, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  const known: OrderStatus[] = ["delivered", "shipped", "packed", "paid", "confirmed"];
  for (const e of events ?? []) {
    const s = e.event_type.replace(/^order\./, "") as OrderStatus;
    if (known.includes(s)) return s;
  }
  return "delivered";
}

export async function declineRefund(supabase: Client, orderId: string, reason?: string) {
  const order = await assertMember(supabase, orderId);
  if (order.status !== "refund_requested") throw new Error("No refund request pending on this order");
  const restored = await previousStatus(supabase, orderId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status: restored })
    .eq("id", orderId)
    .eq("status", "refund_requested");
  if (error) throw error;
  await logEvent(
    orderId,
    order.merchant_id,
    "refund.declined",
    reason?.trim() ? reason.trim() : `Refund declined by staff; order returned to ${restored}`,
  );
  return { status: restored };
}

export async function refundOrder(supabase: Client, orderId: string, reason?: string) {
  const order = await assertMember(supabase, orderId);
  const refundKey = `refund:${orderId}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("refunds")
    .select("id, amount_minor_int")
    .eq("refund_key", refundKey)
    .maybeSingle();
  if (existing) return { refundId: existing.id, status: "refunded" as const, replayed: true };

  const refundable: OrderStatus[] = ["paid", "delivered", "refund_requested"];
  if (!refundable.includes(order.status)) {
    throw new Error("Only paid, delivered or refund-requested orders can be refunded");
  }

  // Money leaves the business here: require a fresh second factor (single-use).
  const { requireStepUp } = await import("./identity.server");
  await requireStepUp(supabase, "refund", order.merchant_id);

  const { data: refund, error } = await supabaseAdmin
    .from("refunds")
    .insert({
      order_id: orderId,
      merchant_id: order.merchant_id,
      amount_minor_int: order.total_minor_int,
      refund_key: refundKey,
      payment_provider: order.payment_method,
      status: "issued",
      reason: reason?.trim() || null,
    })
    .select("id")
    .single();
  if (error) {
    const { data: raced } = await supabaseAdmin
      .from("refunds")
      .select("id")
      .eq("refund_key", refundKey)
      .maybeSingle();
    if (raced) return { refundId: raced.id, status: "refunded" as const, replayed: true };
    throw error;
  }

  await supabaseAdmin
    .from("orders")
    .update({ status: "refunded" })
    .eq("id", orderId)
    .eq("status", order.status);
  await logEvent(orderId, order.merchant_id, "refund.settled", "Refund approved and issued (sandbox)");

  return { refundId: refund.id, status: "refunded" as const, replayed: false };
}

/**
 * Amount edits go through `order_amend`, which recomputes VAT off the order's
 * stored basis points, writes an append-only amendment row with the delta and
 * lifts the money-immutability trigger for exactly that statement.
 */
export async function amendOrderAmounts(
  supabase: Client,
  orderId: string,
  reason: string,
  newShippingMinor: number,
  newDiscountMinor: number,
) {
  const { incr, log } = await import("./observability.server");
  const { data, error } = await (
    supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("order_amend", {
    _order_id: orderId,
    _reason: reason,
    _new_shipping_minor: newShippingMinor,
    _new_discount_minor: newDiscountMinor,
  });
  if (error) {
    incr("framique_order_amend_total", { outcome: "rejected" });
    log("warn", "order.amend_rejected", { orderId, reason: error.message });
    if (error.message.includes("forbidden")) throw new Error("Only an owner or admin can edit order amounts");
    if (error.message.includes("terminal_status")) throw new Error("Cancelled or refunded orders cannot be edited");
    if (error.message.includes("reason_required")) throw new Error("Give a reason of at least 4 characters");
    if (error.message.includes("invalid_amounts")) throw new Error("Amounts are out of range for this order");
    throw new Error("Order amendment failed");
  }
  incr("framique_order_amend_total", { outcome: "applied" });
  return data as { total_minor_int: number; vat_minor_int: number; delta_minor_int: number };
}

/**
 * Bulk move: each order advances only along its own legal transition, so a
 * mixed selection never forces an illegal jump. Failures are reported per row.
 */
export async function bulkAdvanceOrders(
  supabase: Client,
  orderIds: string[],
  target: OrderStatus | "next",
) {
  const results: { orderId: string; ok: boolean; status?: OrderStatus; error?: string }[] = [];
  for (const orderId of orderIds) {
    try {
      const order = await assertMember(supabase, orderId);
      const step = target === "next" ? nextStatus(order.status) : target;
      if (!step) throw new Error("No further step for this order");
      const res = await advanceOrder(supabase, orderId, step);
      results.push({ orderId, ok: true, status: res.status });
    } catch (e) {
      results.push({ orderId, ok: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }
  return {
    moved: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/* ------------------------- line-level refunds, COD calls, notes ------------------------- */

/** Reason taxonomy — a free-text box hides why money leaves; a closed list reports. */
export const REFUND_REASONS = [
  "damaged",
  "wrong_item",
  "not_as_described",
  "late_delivery",
  "customer_changed_mind",
  "price_adjustment",
  "duplicate_charge",
  "other",
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export type RefundLineInput = { orderItemId: string; quantity: number; restock: boolean };

/**
 * Refund selected lines. Quantities are checked against what has already been
 * refunded on each line, so a double submit can never over-refund. Restock is a
 * per-line choice: a damaged unit comes back as money but not as stock.
 */
export async function refundOrderLines(
  supabase: Client,
  orderId: string,
  lines: RefundLineInput[],
  reason: RefundReason,
  note?: string,
) {
  const order = await assertMember(supabase, orderId);
  if (["cancelled", "refunded"].includes(order.status)) {
    throw new Error("This order is closed; nothing further can be refunded");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("id, quantity, unit_price_minor_int, variant_id, product_title")
    .eq("order_id", orderId);
  const byId = new Map((items ?? []).map((i) => [i.id, i]));

  const { data: priorRefunds } = await supabaseAdmin
    .from("refunds")
    .select("id")
    .eq("order_id", orderId);
  const priorIds = (priorRefunds ?? []).map((r) => r.id);
  const { data: priorLines } = priorIds.length
    ? await supabaseAdmin
        .from("refund_items")
        .select("order_item_id, quantity")
        .in("refund_id", priorIds)
    : { data: [] as { order_item_id: string; quantity: number }[] };
  const already = new Map<string, number>();
  for (const l of priorLines ?? []) {
    already.set(l.order_item_id, (already.get(l.order_item_id) ?? 0) + Number(l.quantity));
  }

  const planned: (RefundLineInput & { amount: number; variantId: string | null })[] = [];
  for (const line of lines) {
    const item = byId.get(line.orderItemId);
    if (!item) throw new Error("One of those lines is not on this order");
    const qty = Math.floor(line.quantity);
    if (qty <= 0) continue;
    const remaining = Number(item.quantity) - (already.get(item.id) ?? 0);
    if (qty > remaining) {
      throw new Error(`Only ${remaining} of "${item.product_title}" can still be refunded`);
    }
    planned.push({
      ...line,
      quantity: qty,
      amount: qty * Number(item.unit_price_minor_int),
      variantId: item.variant_id,
    });
  }
  if (planned.length === 0) throw new Error("Pick at least one line to refund");

  const total = planned.reduce((s, l) => s + l.amount, 0);
  const refundKey = `refund:${orderId}:${planned
    .map((l) => `${l.orderItemId}x${l.quantity}`)
    .sort()
    .join(",")}`;

  const { data: existing } = await supabaseAdmin
    .from("refunds")
    .select("id")
    .eq("refund_key", refundKey)
    .maybeSingle();
  if (existing) return { refundId: existing.id, amountMinor: total, replayed: true };

  const { data: refund, error } = await supabaseAdmin
    .from("refunds")
    .insert({
      order_id: orderId,
      merchant_id: order.merchant_id,
      amount_minor_int: total,
      currency_code: order.currency_code,
      refund_key: refundKey,
      payment_provider: order.payment_method,
      status: "issued",
      reason: note?.trim() ? `${reason}: ${note.trim().slice(0, 240)}` : reason,
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabaseAdmin.from("refund_items").insert(
    planned.map((l) => ({
      merchant_id: order.merchant_id,
      refund_id: refund.id,
      order_item_id: l.orderItemId,
      quantity: l.quantity,
      amount_minor_int: l.amount,
      restock: l.restock,
    })),
  );

  for (const l of planned) {
    if (!l.restock || !l.variantId) continue;
    const { data: variant } = await supabaseAdmin
      .from("product_variants")
      .select("stock_quantity")
      .eq("id", l.variantId)
      .maybeSingle();
    if (!variant) continue;
    await supabaseAdmin
      .from("product_variants")
      .update({ stock_quantity: Number(variant.stock_quantity) + l.quantity })
      .eq("id", l.variantId);
  }

  const refundedQty = planned.reduce((s, l) => s + l.quantity, 0);
  const orderedQty = (items ?? []).reduce((s, i) => s + Number(i.quantity), 0);
  const priorQty = [...already.values()].reduce((s, n) => s + n, 0);
  const fully = priorQty + refundedQty >= orderedQty;
  if (fully) {
    await supabaseAdmin.from("orders").update({ status: "refunded" }).eq("id", orderId);
  }

  await logEvent(
    orderId,
    order.merchant_id,
    fully ? "refund.settled" : "refund.partial",
    `${reason} · ${refundedQty} unit(s) refunded${
      planned.some((l) => l.restock) ? ", stock returned" : ", stock not returned"
    }${note?.trim() ? ` · ${note.trim().slice(0, 120)}` : ""}`,
  );

  return { refundId: refund.id, amountMinor: total, fully, replayed: false };
}

/* ---------------------------------- COD confirm-by-call --------------------------------- */

export const COD_OUTCOMES = [
  "confirmed",
  "no_answer",
  "wrong_number",
  "refused",
  "callback_requested",
] as const;
export type CodOutcome = (typeof COD_OUTCOMES)[number];

const COD_FAIL_LIMIT = 3;

/**
 * Record a confirm-by-call outcome. A confirmed call moves a pending COD order
 * forward; a refusal cancels it; three consecutive unreachable attempts
 * auto-cancel so unconfirmable COD never enters the courier stream.
 */
export async function recordCodCall(
  supabase: Client,
  orderId: string,
  outcome: CodOutcome,
  note?: string,
) {
  const order = await assertMember(supabase, orderId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: prior } = await supabaseAdmin
    .from("cod_call_attempts")
    .select("outcome")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  const attemptNo = (prior?.length ?? 0) + 1;

  await supabaseAdmin.from("cod_call_attempts").insert({
    merchant_id: order.merchant_id,
    order_id: orderId,
    attempt_no: attemptNo,
    outcome,
    note: note?.trim() ? note.trim().slice(0, 300) : null,
  });
  await logEvent(orderId, order.merchant_id, `cod.call_${outcome}`, note?.trim() || `Call attempt ${attemptNo}`);

  const failures = [...(prior ?? []).map((p) => p.outcome), outcome].filter(
    (o) => o === "no_answer" || o === "wrong_number",
  ).length;

  if (outcome === "confirmed" && ["pending", "payment_pending"].includes(order.status)) {
    await supabaseAdmin.from("orders").update({ status: "confirmed" }).eq("id", orderId).eq("status", order.status);
    await logEvent(orderId, order.merchant_id, "order.confirmed", "Confirmed by call");
    return { attemptNo, outcome, orderStatus: "confirmed" as const };
  }
  if (outcome === "refused" && canCancel(order.status)) {
    await cancelOrder(supabase, orderId, "Customer refused on confirmation call");
    return { attemptNo, outcome, orderStatus: "cancelled" as const };
  }
  if (failures >= COD_FAIL_LIMIT && canCancel(order.status)) {
    await cancelOrder(supabase, orderId, `Unreachable after ${failures} confirmation calls`);
    return { attemptNo, outcome, orderStatus: "cancelled" as const };
  }
  return { attemptNo, outcome, orderStatus: order.status };
}

/* ------------------------------- internal notes and tags -------------------------------- */

export async function addOrderNote(supabase: Client, orderId: string, body: string, pinned = false) {
  const order = await assertMember(supabase, orderId);
  const text = body.trim();
  if (text.length < 2) throw new Error("Write a note first");
  const { data, error } = await supabase
    .from("order_notes")
    .insert({ merchant_id: order.merchant_id, order_id: orderId, body: text.slice(0, 2000), pinned })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteOrderNote(supabase: Client, noteId: string) {
  const { error } = await supabase.from("order_notes").delete().eq("id", noteId);
  if (error) throw error;
  return { ok: true };
}

/** Internal tags are staff-only labels; the storefront never reads them. */
export async function setOrderTags(supabase: Client, orderId: string, tags: string[]) {
  await assertMember(supabase, orderId);
  const clean = [...new Set(tags.map((t) => t.trim().toLowerCase().slice(0, 32)).filter(Boolean))].slice(0, 20);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("orders").update({ tags: clean }).eq("id", orderId);
  if (error) throw error;
  return { tags: clean };
}

/** Everything the order desk needs beyond the base detail payload. */
export async function loadOrderDesk(supabase: Client, orderId: string) {
  const [{ data: notes }, { data: calls }, { data: refunds }] = await Promise.all([
    supabase.from("order_notes").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("cod_call_attempts").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("refunds").select("id").eq("order_id", orderId),
  ]);
  const refundIds = (refunds ?? []).map((r) => r.id);
  const { data: refundLines } = refundIds.length
    ? await supabase.from("refund_items").select("*").in("refund_id", refundIds)
    : { data: [] };
  return { notes: notes ?? [], calls: calls ?? [], refundLines: refundLines ?? [] };
}
