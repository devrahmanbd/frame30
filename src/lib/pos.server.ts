/**
 * POS runtime.
 *
 * Every till decision that touches money or stock is made in Postgres
 * (`pos_sale_capture`, `pos_refund`, `pos_shift_report`) so an offline replay,
 * a double tap or a flaky network can never mint a second sale, a second
 * refund or a phantom stock movement. This module shapes payloads, applies the
 * burst gate and records spans/counters — prices are never client trusted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type JsonRecord = { [k: string]: Json };

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export class PosError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PosError";
  }
}

const RPC_MESSAGES: Record<string, string> = {
  pos_variant_missing: "One of the scanned products no longer exists",
  pos_empty_cart: "Add at least one product before taking payment",
  pos_tender_mismatch: "Tendered amounts do not add up to the sale total",
  pos_order_not_found: "Sale not found",
  pos_order_voided: "This sale was voided",
  pos_refund_exceeds_total: "Refund is larger than the remaining refundable amount",
  pos_shift_not_found: "Shift not found",
};

/** Postgres messages become stable, secret-free app codes. */
function mapRpcError(message: string): PosError {
  const code = Object.keys(RPC_MESSAGES).find((k) => message.includes(k));
  if (code) return new PosError(code, RPC_MESSAGES[code] as string);
  log("warn", "pos.rpc_failed", { detail: message.slice(0, 120) });
  return new PosError("pos_unavailable", "That till action is temporarily unavailable");
}

export type PosLine = { variantId: string; quantity: number };

export type PosTender = {
  method: "cash" | "card" | "cod";
  amountMinorInt: number;
  tenderedMinorInt?: number;
  authCode?: string | null;
};

export type PosCaptureInput = {
  clientId: string;
  sessionId?: string | null;
  origin: "offline" | "online";
  tenders: PosTender[];
  discountMinorInt: number;
  customerName?: string | null;
  customerPhone?: string | null;
  addressLine?: string | null;
  city?: string | null;
  capturedAt?: string | null;
  lines: PosLine[];
};


const CASH_METHODS = ["cash", "card"];

export async function openShift(
  supabase: Client,
  merchantId: string,
  staffUserId: string,
  startingCashMinorInt: number,
  note?: string | null,
) {
  const { data: open } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("staff_user_id", staffUserId)
    .eq("status", "open")
    .maybeSingle();
  if (open) throw new PosError("pos_shift_already_open", "Shift is already open");

  const { data, error } = await supabase
    .from("pos_sessions")
    .insert({
      merchant_id: merchantId,
      staff_user_id: staffUserId,
      starting_cash_minor_int: startingCashMinorInt,
      note: note ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Drawer maths reads tenders, not order-level method, so a split sale
 * (part cash, part card) lands in the right bucket. Cash refunds leave the
 * drawer, so they are subtracted from what the till should hold.
 */
async function sessionTotals(supabase: Client, sessionId: string) {
  const [orders, tenders, refunds] = await Promise.all([
    supabase.from("pos_orders").select("id, total_minor_int, status").eq("session_id", sessionId),
    supabase
      .from("pos_payments")
      .select("method, amount_minor_int, pos_orders!inner(session_id, status)")
      .eq("pos_orders.session_id", sessionId),
    supabase.from("pos_refunds").select("method, amount_minor_int").eq("session_id", sessionId),
  ]);
  if (orders.error) throw orders.error;

  const live = (orders.data ?? []).filter((r) => r.status !== "voided");
  const tenderRows = (tenders.data ?? []).filter(
    (r) => (r as unknown as { pos_orders?: { status?: string } }).pos_orders?.status !== "voided",
  );
  const refundRows = refunds.data ?? [];
  const sum = (rows: { method: string; amount_minor_int: number }[], m: string) =>
    rows.filter((r) => r.method === m).reduce((a, r) => a + Number(r.amount_minor_int), 0);

  const tenderTyped = tenderRows as unknown as { method: string; amount_minor_int: number }[];
  const refundTyped = refundRows as unknown as { method: string; amount_minor_int: number }[];
  const refundTotal = refundTyped.reduce((a, r) => a + Number(r.amount_minor_int), 0);
  const grossMinorInt = live.reduce((a, r) => a + Number(r.total_minor_int), 0);

  return {
    orders: live.length,
    cashMinorInt: sum(tenderTyped, "cash"),
    cardMinorInt: sum(tenderTyped, "card"),
    codMinorInt: sum(tenderTyped, "cod"),
    refundMinorInt: refundTotal,
    refundCashMinorInt: sum(refundTyped, "cash"),
    drawerCashMinorInt: sum(tenderTyped, "cash") - sum(refundTyped, "cash"),
    grossMinorInt,
    netMinorInt: grossMinorInt - refundTotal,
  };
}


export async function currentShift(supabase: Client, merchantId: string, staffUserId: string) {
  const { data } = await supabase
    .from("pos_sessions")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("staff_user_id", staffUserId)
    .eq("status", "open")
    .maybeSingle();
  if (!data) return { session: null, totals: null };
  return { session: data, totals: await sessionTotals(supabase, data.id) };
}

export async function closeShift(
  supabase: Client,
  merchantId: string,
  sessionId: string,
  actualCashMinorInt: number,
) {
  const totals = await sessionTotals(supabase, sessionId);
  const { data: session, error: readError } = await supabase
    .from("pos_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (readError) throw readError;
  if (!session) throw new PosError("pos_shift_not_found", "Shift not found");
  if (session.status === "closed") throw new PosError("pos_shift_closed", "Shift has been closed");

  const expected = Number(session.starting_cash_minor_int) + totals.drawerCashMinorInt;
  const { data, error } = await supabase
    .from("pos_sessions")
    .update({
      status: "closed",
      close_time: new Date().toISOString(),
      expected_cash_minor_int: expected,
      actual_cash_minor_int: actualCashMinorInt,
      variance_minor_int: actualCashMinorInt - expected,
      shift_totals: totals,
    })
    .eq("id", sessionId)
    .eq("status", "open")
    .select("*")
    .single();
  if (error) throw error;
  await emit(merchantId, "pos.shift_closed", { session_id: sessionId });
  return { session: data, totals };
}

async function emit(
  merchantId: string,
  eventType: string,
  payload: Record<string, string | number | boolean | null>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("local_transactions").upsert(
    {
      merchant_id: merchantId,
      client_id: `${eventType}:${JSON.stringify(payload)}`,
      payload: { event: eventType, ...payload },
      status: "synced",
    },
    { onConflict: "merchant_id,client_id", ignoreDuplicates: true },
  );
}

function authCode(clientId: string) {
  let hash = 0;
  for (const ch of clientId) hash = (hash * 31 + ch.charCodeAt(0)) % 1_000_000;
  return `MFS-${hash.toString().padStart(6, "0")}`;
}

/**
 * Capture a till sale. Pricing, tender balancing and stock movement all happen
 * inside `pos_sale_capture`, and the merchant-supplied `clientId` is the
 * idempotency key: a replayed offline queue returns the original sale instead
 * of charging twice.
 */
export async function capturePosOrder(
  supabase: Client,
  merchantId: string,
  input: PosCaptureInput,
) {
  return withSpan("pos.capture", async () => {
    await enforceRateLimit("pos.capture", merchantId);

    const tenders = input.tenders.map((t) => ({
      method: t.method,
      amountMinorInt: Math.max(0, Math.trunc(t.amountMinorInt)),
      tenderedMinorInt: Math.max(0, Math.trunc(t.tenderedMinorInt ?? 0)),
      authCode: t.method === "card" ? (t.authCode ?? authCode(input.clientId)) : null,
    }));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as RpcClient).rpc("pos_sale_capture", {
      _merchant_id: merchantId,
      _session_id: input.sessionId ?? null,
      _client_id: input.clientId,
      _origin: input.origin,
      _lines: input.lines.map((l) => ({
        variantId: l.variantId,
        quantity: Math.max(1, Math.trunc(l.quantity)),
      })),
      _tenders: tenders,
      _discount_minor_int: Math.max(0, Math.trunc(input.discountMinorInt)),
      _customer: {
        name: input.customerName ?? "",
        phone: input.customerPhone ?? "",
        addressLine: input.addressLine ?? "",
        city: input.city ?? "",
      },
      _captured_at: input.capturedAt ?? new Date().toISOString(),
    });
    if (error) {
      incr("framique_pos_capture_total", { outcome: "error", origin: input.origin });
      throw mapRpcError((error as { message?: string }).message ?? "pos_unavailable");
    }

    const result = (data ?? {}) as { order: JsonRecord; duplicate: boolean };
    incr("framique_pos_capture_total", {
      outcome: result.duplicate ? "replayed" : "captured",
      origin: input.origin,
    });

    await supabase.from("local_transactions").upsert(
      {
        merchant_id: merchantId,
        client_id: input.clientId,
        payload: { origin: input.origin, total_minor_int: Number(result.order?.["total_minor_int"] ?? 0) },
        status: "synced",
      },
      { onConflict: "merchant_id,client_id" },
    );
    await emit(merchantId, "pos.order.synced", { client_id: input.clientId });
    log("info", "pos.captured", {
      merchantId,
      origin: input.origin,
      duplicate: result.duplicate,
      tenders: tenders.length,
    });
    return result;
  });
}

export type PosRefundInput = {
  posOrderId: string;
  idempotencyKey: string;
  amountMinorInt: number;
  method: "cash" | "card" | "cod";
  reason?: string | null;
  restock: boolean;
  lines: PosLine[];
};

/**
 * Refund or return at the till. The idempotency key is unique per merchant in
 * SQL, so a double-tapped refund button or a retried request never pays out
 * twice, and restock is a single atomic step with the payout record.
 */
export async function refundPosOrder(
  _supabase: Client,
  merchantId: string,
  staffUserId: string,
  input: PosRefundInput,
) {
  return withSpan("pos.refund", async () => {
    await enforceRateLimit("pos.refund", merchantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as RpcClient).rpc("pos_refund", {
      _merchant_id: merchantId,
      _pos_order_id: input.posOrderId,
      _staff_user_id: staffUserId,
      _idempotency_key: input.idempotencyKey,
      _amount_minor_int: Math.trunc(input.amountMinorInt),
      _method: input.method,
      _reason: input.reason ?? "",
      _restock: input.restock,
      _lines: input.lines.map((l) => ({
        variantId: l.variantId,
        quantity: Math.max(0, Math.trunc(l.quantity)),
      })),
    });
    if (error) {
      incr("framique_pos_refund_total", { outcome: "error" });
      throw mapRpcError((error as { message?: string }).message ?? "pos_unavailable");
    }
    const result = (data ?? {}) as JsonRecord & { replayed?: boolean };
    incr("framique_pos_refund_total", { outcome: result.replayed ? "replayed" : "refunded" });
    log("info", "pos.refunded", { merchantId, replayed: !!result.replayed });
    return result as JsonRecord;
  });
}

/** Z-report for a shift: tender split, refunds, drawer variance, top items. */
export async function shiftReport(supabase: Client, merchantId: string, sessionId: string) {
  return withSpan("pos.report", async () => {
    await enforceRateLimit("pos.report", merchantId);
    const { data: owned } = await supabase
      .from("pos_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (!owned) throw new PosError("pos_shift_not_found", "Shift not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as RpcClient).rpc("pos_shift_report", {
      _merchant_id: merchantId,
      _session_id: sessionId,
    });
    if (error) throw mapRpcError((error as { message?: string }).message ?? "pos_unavailable");
    return (data ?? {}) as JsonRecord;
  });
}

/** Barcode / SKU quick-add. Exact SKU wins; otherwise a narrow prefix match. */
export async function lookupBarcode(supabase: Client, merchantId: string, code: string) {
  const term = code.trim();
  if (term.length < 2) return null;
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, name, sku, price_amount_minor_int, stock_quantity, products(title)")
    .eq("merchant_id", merchantId)
    .ilike("sku", term)
    .limit(1);
  if (error) throw error;
  incr("framique_pos_scan_total", { outcome: (data ?? []).length ? "hit" : "miss" });
  return (data ?? [])[0] ?? null;
}

export async function listPosOrders(supabase: Client, merchantId: string) {
  const { data, error } = await supabase
    .from("pos_orders")
    .select("*, pos_payments(method, amount_minor_int, change_minor_int), pos_refunds(amount_minor_int)")
    .eq("merchant_id", merchantId)
    .order("captured_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}


export async function recordFailure(
  supabase: Client,
  merchantId: string,
  clientId: string,
  message: string,
) {
  await supabase.from("local_transactions").upsert(
    {
      merchant_id: merchantId,
      client_id: clientId,
      payload: {},
      status: "failed",
      error: message.slice(0, 300),
    },
    { onConflict: "merchant_id,client_id" },
  );
}
