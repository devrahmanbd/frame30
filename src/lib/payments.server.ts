/**
 * Payment rail runtime — charge intents, signed provider returns, the mock MFS
 * sandbox, the refund engine, COD reconcile and settlement intake.
 *
 * Invariants enforced here (the DB enforces the rest):
 *  - every charge attempt carries a caller-supplied idempotency key; a replay
 *    returns the same attempt instead of opening a second one,
 *  - a provider return URL is only trusted when its HMAC over
 *    `intentId.status.nonce` matches the merchant's gateway secret,
 *  - money never moves without a ledger entry keyed on the same idempotency key,
 *  - every path is rate limited, span-timed and counted for Prometheus.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { money } from "./money";
import { ONLINE_METHOD_KEYS } from "./payment-rails";
import { postLedgerEntry } from "./ledger.server";
import { incr, log, tenantLabel, withSpan } from "./observability.server";
import { assertPaymentsNotFrozen } from "./owner-ops.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

export type ChargeIntent = Database["public"]["Tables"]["charge_intents"]["Row"];
export type RefundRow = Database["public"]["Tables"]["refunds"]["Row"];

/**
 * Every online rail the sandbox can stand in for. Derived from the rail
 * catalogue so a newly contracted gateway is testable the day it is added —
 * a hardcoded triple is how bKash-and-nothing-else happens.
 */
export const MOCK_PROVIDERS = ONLINE_METHOD_KEYS;
export type MockProvider = (typeof ONLINE_METHOD_KEYS)[number];

export class PaymentError extends Error {
  constructor(
    readonly code:
      | "payment.gateway_not_configured"
      | "payment.intent_not_found"
      | "payment.order_not_chargeable"
      | "payment.signature_invalid"
      | "payment.unsupported_provider"
      | "payment.refund_rejected"
      | "payment.forbidden",
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "PaymentError";
  }
}

function admin() {
  return import("@/integrations/supabase/client.server").then((m) => m.supabaseAdmin as unknown as Client & Rpc);
}

/** Per-merchant gateway secret; sandbox rows are created on demand by the seeder. */
async function gatewaySecret(db: Client, merchantId: string, provider: string) {
  const { data } = await db
    .from("gateway_accounts")
    .select("webhook_secret, active")
    .eq("merchant_id", merchantId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data || !data.active) throw new PaymentError("payment.gateway_not_configured", provider);
  return data.webhook_secret;
}

export function signReturn(secret: string, intentId: string, status: string, nonce: string) {
  return createHmac("sha256", secret).update(`${intentId}.${status}.${nonce}`).digest("hex");
}

export function returnSignatureMatches(
  secret: string,
  intentId: string,
  status: string,
  nonce: string,
  given: string,
) {
  const a = Buffer.from(signReturn(secret, intentId, status, nonce));
  const b = Buffer.from((given ?? "").trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

// ------------------------------------------------------------------ charge open
export type OpenChargeResult = {
  intentId: string;
  status: string;
  provider: string;
  amountMinorInt: number;
  currencyCode: string;
  expiresAt: string;
  /** Where the shopper is sent to authorise. COD skips the rail entirely. */
  redirectUrl: string | null;
};

export async function openCharge(
  slug: string,
  orderId: string,
  idempotencyKey: string,
  origin: string,
  subject: string,
): Promise<OpenChargeResult> {
  await enforceRateLimit("payments.charge", subject);
  const db = await admin();
  // A suspended tenant with a payment freeze cannot open a new charge, even
  // when a checkout was already in flight in the shopper's tab.
  const { data: frozenCheck } = await db
    .from("merchants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (frozenCheck) await assertPaymentsNotFrozen(frozenCheck.id);

  return withSpan("payments.open_charge", async () => {
    const { data, error } = await db.rpc("charge_intent_open", {
      _order_id: orderId,
      _idempotency_key: idempotencyKey,
      _ttl_seconds: 1800,
    });
    if (error) {
      incr("framique_charge_intent_total", { outcome: "rejected" });
      log("warn", "payments.intent_rejected", { orderId, message: error.message });
      if (error.message.includes("order_not_chargeable")) {
        throw new PaymentError("payment.order_not_chargeable", orderId);
      }
      throw new PaymentError("payment.intent_not_found", error.message);
    }
    const intent = data as ChargeIntent;
    incr("framique_charge_intent_total", { outcome: "opened", method: intent.method });

    if (intent.method === "cod") {
      // COD is a first-class tender with no rail: the attempt stays pending until
      // the courier reconciles the collected cash.
      await db.rpc("charge_intent_advance", {
        _intent_id: intent.id,
        _to: "pending",
        _provider_reference: `cod:${intent.attempt}`,
      });
      return {
        intentId: intent.id,
        status: "pending",
        provider: "cod",
        amountMinorInt: Number(intent.amount_minor_int),
        currencyCode: intent.currency_code,
        expiresAt: intent.expires_at,
        redirectUrl: null,
      };
    }

    const provider = intent.method as MockProvider;
    if (!MOCK_PROVIDERS.includes(provider)) {
      throw new PaymentError("payment.unsupported_provider", intent.method);
    }
    // Fail closed when the rail is not configured — never silently mark paid.
    await gatewaySecret(db, intent.merchant_id, provider);
    await db.rpc("charge_intent_advance", { _intent_id: intent.id, _to: "pending" });

    // Phase 2: a rail contracted with real credentials takes the shopper to the
    // provider's own hosted page. A rail still in mock mode keeps the sandbox,
    // so a half-configured shop never sends a shopper to a dead gateway.
    const { loadLiveAccount, openLiveSession } = await import("./live-gateway.server");
    const account = await loadLiveAccount(db, intent.merchant_id, provider);
    if (account) {
      const back = (path: string) => new URL(path, origin).toString();
      const session = await openLiveSession(account, {
        intentId: intent.id,
        amountMinorInt: Number(intent.amount_minor_int),
        currencyCode: intent.currency_code,
        callbackUrl: back(`/api/public/payments/live/${provider}`),
        returnUrl: back(`/api/public/payments/live/${provider}?redirect=1`),
        cancelUrl: back(`/store/${slug}/checkout?payment=cancelled`),
      });
      if (session.providerReference) {
        await db
          .from("charge_intents")
          .update({ provider_reference: session.providerReference })
          .eq("id", intent.id);
      }
      return {
        intentId: intent.id,
        status: "pending",
        provider,
        amountMinorInt: Number(intent.amount_minor_int),
        currencyCode: intent.currency_code,
        expiresAt: intent.expires_at,
        redirectUrl: session.redirectUrl,
      };
    }

    const url = new URL(`/api/public/payments/mock/${provider}`, origin);
    url.searchParams.set("intent", intent.id);
    url.searchParams.set("slug", slug);
    return {
      intentId: intent.id,
      status: "pending",
      provider,
      amountMinorInt: Number(intent.amount_minor_int),
      currencyCode: intent.currency_code,
      expiresAt: intent.expires_at,
      redirectUrl: url.pathname + url.search,
    };
  }, { slug });
}

// ------------------------------------------------------- mock MFS sandbox rail
/** Signed conclusion the sandbox hands back, mirroring a real rail's return URL. */
export async function mockAuthorise(
  provider: string,
  intentId: string,
  outcome: "success" | "fail" | "cancel",
  origin: string,
) {
  if (!MOCK_PROVIDERS.includes(provider as MockProvider)) {
    throw new PaymentError("payment.unsupported_provider", provider);
  }
  const db = await admin();
  const { data: intent } = await db
    .from("charge_intents")
    .select("id, merchant_id, method, return_nonce, order_id")
    .eq("id", intentId)
    .maybeSingle();
  if (!intent || intent.method !== provider) throw new PaymentError("payment.intent_not_found", intentId);

  const secret = await gatewaySecret(db, intent.merchant_id, provider);
  const status = outcome === "success" ? "paid" : outcome === "cancel" ? "cancelled" : "failed";
  const url = new URL("/api/public/payments/return", origin);
  url.searchParams.set("intent", intent.id);
  url.searchParams.set("status", status);
  url.searchParams.set("sig", signReturn(secret, intent.id, status, intent.return_nonce));
  incr("framique_mock_mfs_total", { provider, outcome });
  return { redirectTo: url.pathname + url.search, orderId: intent.order_id };
}

// --------------------------------------------------------- verified return path
export type ReturnResult = {
  orderId: string;
  slug: string;
  status: "paid" | "failed" | "cancelled";
  accessToken: string | null;
};

export async function applySignedReturn(
  intentId: string,
  status: string,
  signature: string,
  subject: string,
): Promise<ReturnResult> {
  await enforceRateLimit("payments.return", subject);
  const db = await admin();

  return withSpan("payments.apply_return", async () => {
    const { data: intent } = await db
      .from("charge_intents")
      .select(
        "id, merchant_id, order_id, method, attempt, amount_minor_int, currency_code, return_nonce, idempotency_key, status",
      )
      .eq("id", intentId)
      .maybeSingle();
    if (!intent) throw new PaymentError("payment.intent_not_found", intentId);

    const secret = await gatewaySecret(db, intent.merchant_id, intent.method);
    if (!["paid", "failed", "cancelled"].includes(status)) {
      throw new PaymentError("payment.signature_invalid", "status");
    }
    if (!returnSignatureMatches(secret, intent.id, status, intent.return_nonce, signature)) {
      incr("framique_payment_return_total", { outcome: "signature_invalid" });
      log("warn", "payments.return_signature_invalid", { intentId });
      throw new PaymentError("payment.signature_invalid");
    }

    const reference = `${intent.method}:${intent.idempotency_key.slice(0, 12)}`;
    if (intent.status !== status) {
      await db.rpc("charge_intent_advance", {
        _intent_id: intent.id,
        _to: status,
        _provider_reference: reference,
        _failure_code: status === "failed" ? "provider_declined" : null,
      });
    }

    if (status === "paid") {
      // Idempotent: the payment row and the ledger entry share the attempt key.
      await db.from("payments").upsert(
        {
          merchant_id: intent.merchant_id,
          order_id: intent.order_id,
          payment_provider: intent.method,
          payment_status: "paid",
          currency_code: intent.currency_code,
          amount_minor_int: intent.amount_minor_int,
          provider_reference: reference,
          idempotency_key: intent.idempotency_key,
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true },
      );
      await postLedgerEntry(db, {
        merchantId: intent.merchant_id,
        source: "order.captured",
        referenceId: intent.order_id,
        direction: "credit",
        gross: money(Number(intent.amount_minor_int), intent.currency_code),
        idempotencyKey: `capture:${intent.idempotency_key}`,
        memo: `${intent.method} attempt ${intent.attempt}`,
      });
      await db.from("orders").update({ status: "paid" }).eq("id", intent.order_id).in("status", ["pending", "payment_pending", "confirmed"]);
    }

    const { data: order } = await db
      .from("orders")
      .select("id, access_token, merchant_id")
      .eq("id", intent.order_id)
      .maybeSingle();
    const { data: merchant } = await db
      .from("merchants")
      .select("slug")
      .eq("id", intent.merchant_id)
      .maybeSingle();

    incr("framique_payment_return_total", { outcome: status });
    return {
      orderId: intent.order_id,
      slug: merchant?.slug ?? "",
      status: status as ReturnResult["status"],
      accessToken: order?.access_token ?? null,
    };
  }, { status });
}

// ------------------------------------------------------------- refund engine
export async function requestRefund(
  db: Client,
  orderId: string,
  amountMinor: number,
  reason: string,
  refundKey: string,
  subject: string,
) {
  await enforceRateLimit("payments.refund", subject);
  const { data: refundOrder } = await db
    .from("orders")
    .select("merchant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (refundOrder) await assertPaymentsNotFrozen(refundOrder.merchant_id);
  const { data, error } = await (db as unknown as Rpc).rpc("refund_request", {
    _order_id: orderId,
    _amount_minor: amountMinor,
    _reason: reason,
    _refund_key: refundKey,
  });
  if (error) {
    incr("framique_refund_total", { outcome: "rejected" });
    log("warn", "payments.refund_rejected", { orderId, message: error.message });
    if (error.message.includes("forbidden")) throw new PaymentError("payment.forbidden");
    if (error.message.includes("exceeds_captured")) {
      throw new PaymentError("payment.refund_rejected", "more than the captured amount");
    }
    if (error.message.includes("nothing_captured")) {
      throw new PaymentError("payment.refund_rejected", "no money was captured for this order");
    }
    if (error.message.includes("reason_required")) {
      throw new PaymentError("payment.refund_rejected", "give a reason of at least 4 characters");
    }
    throw new PaymentError("payment.refund_rejected", error.message);
  }
  incr("framique_refund_total", { outcome: "requested" });
  return data as RefundRow;
}

/**
 * Advance a refund on its own rail. `settled` posts the compensating ledger
 * debit; a provider rejection lands on `failed` and money stays with us.
 */
export async function advanceRefund(db: Client, refundId: string, to: string, providerRef?: string) {
  const { data, error } = await (db as unknown as Rpc).rpc("refund_advance", {
    _refund_id: refundId,
    _to: to,
    _provider_reference: providerRef ?? null,
    _failure_code: to === "failed" ? "provider_rejected" : null,
  });
  if (error) {
    incr("framique_refund_total", { outcome: "advance_rejected" });
    if (error.message.includes("forbidden")) throw new PaymentError("payment.forbidden");
    throw new PaymentError("payment.refund_rejected", error.message);
  }
  const row = data as RefundRow;
  if (to === "settled") {
    const ledgerDb = await admin();
    await postLedgerEntry(ledgerDb, {
      merchantId: row.merchant_id,
      source: "order.refunded",
      referenceId: row.order_id,
      direction: "debit",
      gross: money(Number(row.amount_minor_int), row.currency_code),
      idempotencyKey: `refund:${row.refund_key}`,
      memo: `refund attempt ${row.attempt}`,
    });
  }
  incr("framique_refund_total", { outcome: to, tenant: tenantLabel(row.merchant_id) });
  return row;
}

// ----------------------------------------------------------------- COD reconcile
export async function reconcileCod(
  db: Client,
  orderId: string,
  collectedMinor: number,
  carrierCode: string | null,
  note: string | null,
) {
  const { data, error } = await (db as unknown as Rpc).rpc("cod_reconcile", {
    _order_id: orderId,
    _collected_minor: collectedMinor,
    _carrier_code: carrierCode,
    _note: note,
  });
  if (error) {
    incr("framique_cod_reconcile_total", { outcome: "rejected" });
    if (error.message.includes("forbidden")) throw new PaymentError("payment.forbidden");
    if (error.message.includes("not_a_cod_order")) {
      throw new PaymentError("payment.refund_rejected", "this order is not cash on delivery");
    }
    throw new PaymentError("payment.refund_rejected", error.message);
  }
  const row = data as Database["public"]["Tables"]["cod_reconciliations"]["Row"];
  incr("framique_cod_reconcile_total", { outcome: row.status });

  if (Number(row.collected_minor_int) > 0) {
    const ledgerDb = await admin();
    await postLedgerEntry(ledgerDb, {
      merchantId: row.merchant_id,
      source: "cod.collected",
      referenceId: row.order_id,
      direction: "credit",
      gross: money(Number(row.collected_minor_int), row.currency_code),
      idempotencyKey: `cod:${row.order_id}:${row.collected_minor_int}`,
      memo: carrierCode ? `collected by ${carrierCode}` : "collected at door",
    });
  }
  return row;
}

export async function clearCodVariance(db: Client, reconId: string, note: string) {
  const { data, error } = await (db as unknown as Rpc).rpc("cod_clear_variance", {
    _recon_id: reconId,
    _note: note,
  });
  if (error) {
    if (error.message.includes("forbidden")) throw new PaymentError("payment.forbidden");
    throw new PaymentError("payment.refund_rejected", error.message);
  }
  incr("framique_cod_reconcile_total", { outcome: "cleared" });
  return { ok: true, reconId, cleared: Boolean(data) };
}

// -------------------------------------------------------------------- settlement
export type SettlementItemInput = { ref: string; gross: number; fee: number; net: number };

export async function ingestSettlement(
  merchantId: string,
  provider: string,
  fileDate: string,
  fileHash: string,
  items: SettlementItemInput[],
) {
  await enforceRateLimit("settlement.ingest", merchantId);
  const db = await admin();
  const { data, error } = await db.rpc("settlement_ingest", {
    _merchant_id: merchantId,
    _provider: provider,
    _file_date: fileDate,
    _file_hash: fileHash,
    _items: items as unknown as Database["public"]["Tables"]["settlement_files"]["Row"]["id"],
  });
  if (error) {
    incr("framique_settlement_file_total", { outcome: "error" });
    log("error", "payments.settlement_ingest_failed", { provider, message: error.message });
    throw new PaymentError("payment.refund_rejected", error.message);
  }
  const file = data as Database["public"]["Tables"]["settlement_files"]["Row"];
  incr("framique_settlement_file_total", { outcome: file.status });
  return file;
}

/** Only matched, unposted items ever create ledger rows. */
export async function postSettlement(fileId: string) {
  const db = await admin();
  const { data: file } = await db
    .from("settlement_files")
    .select("id, merchant_id, provider, status, file_date")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) throw new PaymentError("payment.intent_not_found", fileId);
  if (file.status !== "matched") {
    throw new PaymentError("payment.refund_rejected", `file is ${file.status}, not matched`);
  }

  const { data: items } = await db
    .from("settlement_items")
    .select("id, order_id, net_minor_int, fee_minor_int, gross_minor_int, currency_code, match_kind, posted")
    .eq("file_id", fileId)
    .eq("posted", false)
    .in("match_kind", ["exact", "manual"]);

  let posted = 0;
  for (const item of items ?? []) {
    await postLedgerEntry(db, {
      merchantId: file.merchant_id,
      source: "payout.sent",
      referenceId: item.order_id,
      direction: "credit",
      gross: money(Number(item.gross_minor_int), item.currency_code),
      platformFee: money(Number(item.fee_minor_int), item.currency_code),
      idempotencyKey: `settle:${fileId}:${item.id}`,
      memo: `${file.provider} settlement ${file.file_date}`,
    });
    await db.from("settlement_items").update({ posted: true }).eq("id", item.id);
    posted += 1;
  }

  await db.from("settlement_files").update({ status: "posted", posted_at: new Date().toISOString() }).eq("id", fileId);
  incr("framique_settlement_posted_total", {}, posted);
  return { posted };
}

export async function resolveSettlementAlert(db: Client, alertId: string, note: string) {
  const { data, error } = await (db as unknown as Rpc).rpc("settlement_resolve_alert", {
    _alert_id: alertId,
    _note: note,
  });
  if (error) {
    if (error.message.includes("forbidden")) throw new PaymentError("payment.forbidden");
    throw new PaymentError("payment.refund_rejected", error.message);
  }
  return { ok: true, alertId, resolved: Boolean(data) };
}

// ------------------------------------------------------------------- desk reads
export async function loadPaymentsDesk(db: Client, merchantId: string) {
  const [intents, refunds, cod, files, alerts] = await Promise.all([
    db
      .from("charge_intents")
      .select("id, order_id, method, status, attempt, amount_minor_int, currency_code, provider_reference, expires_at, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(40),
    db
      .from("refunds")
      .select("id, order_id, status, amount_minor_int, currency_code, attempt, reason, method, settled_at, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(40),
    db
      .from("cod_reconciliations")
      .select("id, order_id, carrier_code, expected_minor_int, collected_minor_int, variance_minor_int, status, note, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(40),
    db
      .from("settlement_files")
      .select("id, provider, file_date, status, gross_minor_int, fee_minor_int, net_minor_int, item_count, matched_count, reject_reason, created_at")
      .eq("merchant_id", merchantId)
      .order("file_date", { ascending: false })
      .limit(20),
    db
      .from("settlement_variance_alerts")
      .select("id, file_id, kind, expected_minor_int, actual_minor_int, resolved, resolution_note, created_at")
      .eq("merchant_id", merchantId)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  return {
    intents: intents.data ?? [],
    refunds: refunds.data ?? [],
    cod: cod.data ?? [],
    files: files.data ?? [],
    alerts: alerts.data ?? [],
  };
}
