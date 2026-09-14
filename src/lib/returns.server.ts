/**
 * Returns and disputes.
 *
 * The state machines live in Postgres (`return_open`, `return_advance`,
 * `dispute_advance`) so an invalid jump is impossible from any client, restock
 * lands on the store's default location, and the refund is created by the
 * existing `refund_request` ledger path — never by a second money path here.
 * Every transition writes an append-only event row (actor, from, to, reason).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { CommerceError } from "./inventory.server";

type Client = SupabaseClient<Database>;
export type ReturnStatus = Database["public"]["Enums"]["return_status"];
export type DisputeStatus = Database["public"]["Enums"]["dispute_status"];

const MESSAGES: Record<string, string> = {
  forbidden: "You do not have permission to do that",
  order_not_found: "Order not found",
  order_not_returnable: "This order is not eligible for a return",
  order_item_not_found: "One of the selected items is not on this order",
  return_items_required: "Select at least one item to return",
  return_not_found: "Return not found",
  invalid_return_transition: "That return step is not allowed from here",
  dispute_not_found: "Dispute not found",
  invalid_dispute_transition: "That dispute step is not allowed from here",
};

function mapError(message: string) {
  const code = Object.keys(MESSAGES).find((k) => message.includes(k));
  if (code) return new CommerceError(code, MESSAGES[code] as string);
  log("warn", "returns.rpc_failed", { detail: message.slice(0, 120) });
  return new CommerceError("returns_unavailable", "That action is temporarily unavailable");
}

export async function loadReturns(db: Client, merchantId: string, status?: ReturnStatus) {
  return withSpan("commerce.returns_load", async () => {
    let q = db
      .from("return_requests")
      .select(
        "*, return_items(id, order_item_id, quantity, restock, amount_minor_int), orders(order_number, customer_name, customer_phone)",
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw mapError(error.message);
    return data ?? [];
  });
}

export async function loadReturnEvents(db: Client, merchantId: string, returnId: string) {
  const { data } = await db
    .from("return_events")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("return_id", returnId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function openReturn(
  db: Client,
  input: {
    orderId: string;
    reason: string;
    note?: string | null;
    items: { orderItemId: string; quantity: number; restock?: boolean }[];
    accessToken?: string | null;
    subject: string;
  },
) {
  return withSpan("commerce.return_open", async () => {
    await enforceRateLimit("commerce.return_open", input.subject);
    const items = input.items
      .map((i) => ({
        order_item_id: i.orderItemId,
        quantity: Math.max(1, Math.floor(i.quantity)),
        restock: i.restock ?? true,
      }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) throw new CommerceError("return_items_required", "Select an item");
    if (!input.reason.trim()) throw new CommerceError("reason_required", "Give a reason");

    const { data, error } = await db.rpc("return_open", {
      _order_id: input.orderId,
      _reason: input.reason.trim().slice(0, 200),
      _note: (input.note ?? undefined) as string,
      _items: items as never,
      _access_token: (input.accessToken ?? undefined) as string,
    });
    if (error) {
      incr("framique_return_total", { outcome: "rejected" });
      throw mapError(error.message);
    }
    incr("framique_return_total", { outcome: "opened" });
    return data;
  });
}

export async function advanceReturn(
  db: Client,
  merchantId: string,
  actor: string,
  input: { returnId: string; status: ReturnStatus; note?: string | null },
) {
  return withSpan(
    "commerce.return_advance",
    async () => {
      await enforceRateLimit("commerce.return_advance", `${merchantId}:${actor}`);
      const { data, error } = await db.rpc("return_advance", {
        _return_id: input.returnId,
        _to: input.status,
        _note: (input.note ?? undefined) as string,
      });
      if (error) throw mapError(error.message);
      incr("framique_return_state_total", { status: input.status });
      return data;
    },
    { status: input.status },
  );
}

/* ----------------------------------- disputes ----------------------------------- */

export async function loadDisputes(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("disputes")
    .select("*, orders(order_number, customer_name)")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw mapError(error.message);
  return data ?? [];
}

export async function loadDisputeEvents(db: Client, merchantId: string, disputeId: string) {
  const { data } = await db
    .from("dispute_events")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("dispute_id", disputeId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function openDispute(
  db: Client,
  merchantId: string,
  actor: string,
  input: {
    orderId: string;
    reason: string;
    amountMinorInt: number;
    provider?: string | null;
    providerReference?: string | null;
    dueAt?: string | null;
  },
) {
  return withSpan("commerce.dispute_open", async () => {
    await enforceRateLimit("commerce.dispute", `${merchantId}:${actor}`);
    const reference = `DSP-${Date.now().toString(36).toUpperCase()}`;
    const { data, error } = await db
      .from("disputes")
      .insert({
        merchant_id: merchantId,
        order_id: input.orderId,
        reference,
        reason: input.reason.trim().slice(0, 300),
        amount_minor_int: Math.max(0, Math.floor(input.amountMinorInt)),
        provider: input.provider ?? null,
        provider_reference: input.providerReference ?? null,
        due_at: input.dueAt ?? null,
      })
      .select("*")
      .single();
    if (error) throw mapError(error.message);
    await db.from("dispute_events").insert({
      merchant_id: merchantId,
      dispute_id: data.id,
      to_status: "open",
      note: input.reason.slice(0, 300),
      actor,
    });
    incr("framique_dispute_total", { outcome: "opened" });
    return data;
  });
}

export async function advanceDispute(
  db: Client,
  merchantId: string,
  actor: string,
  input: { disputeId: string; status: DisputeStatus; note?: string | null },
) {
  return withSpan(
    "commerce.dispute_advance",
    async () => {
      await enforceRateLimit("commerce.dispute", `${merchantId}:${actor}`);
      const { data, error } = await db.rpc("dispute_advance", {
        _dispute_id: input.disputeId,
        _to: input.status,
        _note: (input.note ?? undefined) as string,
      });
      if (error) throw mapError(error.message);
      incr("framique_dispute_state_total", { status: input.status });
      return data;
    },
    { status: input.status },
  );
}
