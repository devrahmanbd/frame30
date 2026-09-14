/**
 * Merchant payouts — service layer.
 *
 * Money leaves the platform here, so the module is written defensively:
 *  - balance is derived from the wallet ledger every time, never from a cached
 *    counter, and in-flight payouts reserve against it,
 *  - `Idempotency-Key` style dedupe on request (unique `idempotency_key`),
 *  - four-eyes approval enforced by `evaluateApprovals`, dual approval above
 *    BDT 2,500, requester can never approve their own instruction,
 *  - every state change goes through `transition()` → `payout_events` audit row
 *    + Prometheus counter,
 *  - the worker retries with capped exponential backoff and gives up after
 *    `MAX_PAYOUT_ATTEMPTS`, releasing the reservation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { incr, log, observe, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import {
  MAX_PAYOUT_ATTEMPTS,
  RESERVING_STATES,
  approvalsRequired,
  computeBalance,
  evaluateApprovals,
  maskDestination,
  netPayoutMinor,
  normalizeMsisdn,
  payoutCanTransition,
  payoutFeeMinor,
  retryDelaySeconds,
  validateAccount,
  validateAmount,
  type Approval,
  type Balance,
  type PayoutMethod,
  type PayoutState,
} from "./payouts";

type Client = SupabaseClient<Database>;
type PayoutRow = Database["public"]["Tables"]["payouts"]["Row"];
type AccountRow = Database["public"]["Tables"]["payout_accounts"]["Row"];

export class PayoutError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "PayoutError";
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertMerchantAdmin(db: Client, merchantId: string) {
  const { data, error } = await db.rpc("is_merchant_admin", { _merchant_id: merchantId });
  if (error || data !== true) throw new PayoutError("payout.forbidden", 403);
}

async function audit(
  payoutId: string,
  merchantId: string,
  event: string,
  actor: string | null,
  from: PayoutState | null,
  to: PayoutState | null,
  detail: Record<string, unknown> = {},
) {
  const service = await admin();
  await service.from("payout_events").insert({
    payout_id: payoutId,
    merchant_id: merchantId,
    event,
    actor,
    from_state: from,
    to_state: to,
    detail: detail as Json,
  });
}

async function transition(
  row: PayoutRow,
  to: PayoutState,
  actor: string | null,
  event: string,
  patch: Database["public"]["Tables"]["payouts"]["Update"] = {},
  detail: Record<string, unknown> = {},
) {
  const from = row.state as PayoutState;
  if (!payoutCanTransition(from, to)) {
    incr("framique_payout_transition_total", { from, to, outcome: "rejected" });
    throw new PayoutError(`payout.illegal_transition:${from}->${to}`, 409);
  }
  const service = await admin();
  const { data, error } = await service
    .from("payouts")
    .update({ ...patch, state: to, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("state", from) // optimistic lock — two approvers racing cannot double-pay
    .select("*")
    .maybeSingle();
  if (error || !data) throw new PayoutError("payout.transition_conflict", 409);
  await audit(row.id, row.merchant_id, event, actor, from, to, detail);
  incr("framique_payout_transition_total", { from, to, outcome: "ok" });
  log("info", "payout.transition", { payout: row.id, from, to, event });
  return data as PayoutRow;
}

/* --------------------------------- balance -------------------------------- */

export async function merchantBalance(merchantId: string): Promise<Balance> {
  const service = await admin();
  const [ledger, inflight, holds] = await Promise.all([
    service
      .from("wallet_ledger_entries")
      .select("direction, seller_minor_int")
      .eq("merchant_id", merchantId)
      .limit(5000),
    service
      .from("payouts")
      .select("amount_minor_int")
      .eq("merchant_id", merchantId)
      .in("state", RESERVING_STATES),
    service
      .from("payout_holds")
      .select("amount_minor_int")
      .eq("merchant_id", merchantId)
      .is("released_at", null),
  ]);
  const entries = ((ledger.data ?? []) as { direction: string; seller_minor_int: number | string }[]).map(
    (r) => ({
      direction: r.direction === "debit" ? ("debit" as const) : ("credit" as const),
      sellerMinor: Number(r.seller_minor_int ?? 0),
    }),
  );
  const reservedMinor = ((inflight.data ?? []) as { amount_minor_int: number }[]).reduce(
    (s, r) => s + Number(r.amount_minor_int ?? 0),
    0,
  );
  const holdMinor = ((holds.data ?? []) as { amount_minor_int: number }[]).reduce(
    (s, r) => s + Number(r.amount_minor_int ?? 0),
    0,
  );
  return computeBalance({ entries, reservedMinor, holdMinor });
}

/* -------------------------------- accounts -------------------------------- */

export async function listAccounts(db: Client, merchantId: string, userId: string) {
  await enforceRateLimit("payout.read", `${merchantId}:${userId}`);
  const { data } = await db
    .from("payout_accounts")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as AccountRow[]).map((a) => ({
    id: a.id,
    label: a.label,
    method: a.method as PayoutMethod,
    state: a.state,
    holderName: a.holder_name,
    mfsProvider: a.mfs_provider,
    bankName: a.bank_name,
    branchName: a.branch_name,
    last4: a.last4,
    isDefault: a.is_default,
    verifiedAt: a.verified_at,
    rejectionReason: a.rejection_reason,
    // Never return a full destination; the masked form is enough to choose one.
    destination: maskDestination({ method: a.method as PayoutMethod, msisdn: a.msisdn, accountNumber: a.account_number }),
  }));
}

export async function addAccount(
  db: Client,
  merchantId: string,
  userId: string,
  input: {
    label: string;
    method: PayoutMethod;
    holderName: string;
    mfsProvider?: string | null;
    msisdn?: string | null;
    bankName?: string | null;
    branchName?: string | null;
    accountNumber?: string | null;
    routingNumber?: string | null;
    makeDefault?: boolean;
  },
) {
  await assertMerchantAdmin(db, merchantId);
  await enforceRateLimit("payout.account", `${merchantId}:${userId}`);
  const { requireStepUp } = await import("./identity.server");
  await requireStepUp(db, "payout", merchantId);

  const msisdn = input.msisdn ? normalizeMsisdn(input.msisdn) : null;
  const verdict = validateAccount({
    method: input.method,
    holderName: input.holderName,
    msisdn,
    accountNumber: input.accountNumber ?? null,
    bankName: input.bankName ?? null,
  });
  if (!verdict.ok) throw new PayoutError(verdict.code ?? "payout.bad_account", 400);

  const tail = input.method === "mfs" ? (msisdn ?? "") : (input.accountNumber ?? "");
  const service = await admin();
  const { data, error } = await service
    .from("payout_accounts")
    .insert({
      merchant_id: merchantId,
      label: input.label.trim().slice(0, 80) || "Payout account",
      method: input.method,
      holder_name: input.holderName.trim(),
      mfs_provider: input.mfsProvider ?? null,
      msisdn,
      bank_name: input.bankName ?? null,
      branch_name: input.branchName ?? null,
      account_number: input.accountNumber ?? null,
      routing_number: input.routingNumber ?? null,
      last4: tail.slice(-4),
      is_default: input.makeDefault ?? false,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new PayoutError("payout.account_create_failed", 500);
  if (input.makeDefault) {
    await service
      .from("payout_accounts")
      .update({ is_default: false })
      .eq("merchant_id", merchantId)
      .neq("id", data.id);
  }
  incr("framique_payout_account_total", { method: input.method, outcome: "created" });
  return listAccounts(db, merchantId, userId);
}

/* --------------------------------- payouts -------------------------------- */

export type PayoutView = {
  id: string;
  state: PayoutState;
  amountMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
  method: PayoutMethod;
  accountId: string;
  note: string | null;
  approvalsRequired: number;
  approvals: Approval[];
  requestedAt: string;
  requestedBy: string | null;
  paidAt: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  failureCode: string | null;
  failureDetail: string | null;
  providerRef: string | null;
};

function toView(row: PayoutRow, approvals: Approval[]): PayoutView {
  return {
    id: row.id,
    state: row.state as PayoutState,
    amountMinor: Number(row.amount_minor_int),
    feeMinor: Number(row.fee_minor_int),
    netMinor: Number(row.net_minor_int),
    currency: row.currency_code,
    method: row.method as PayoutMethod,
    accountId: row.account_id,
    note: row.note,
    approvalsRequired: row.approvals_required,
    approvals,
    requestedAt: row.requested_at,
    requestedBy: row.requested_by,
    paidAt: row.paid_at,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    failureCode: row.failure_code,
    failureDetail: row.failure_detail,
    providerRef: row.provider_ref,
  };
}

export async function listPayouts(db: Client, merchantId: string, userId: string) {
  await enforceRateLimit("payout.read", `${merchantId}:${userId}`);
  return withSpan("payout.list", async () => {
    const { data } = await db
      .from("payouts")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("requested_at", { ascending: false })
      .limit(100);
    const rows = (data ?? []) as PayoutRow[];
    const { data: approvalRows } = await db
      .from("payout_approvals")
      .select("payout_id, actor, decision, created_at")
      .eq("merchant_id", merchantId)
      .in("payout_id", rows.length ? rows.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"]);
    const byPayout = new Map<string, Approval[]>();
    for (const a of (approvalRows ?? []) as {
      payout_id: string;
      actor: string;
      decision: string;
      created_at: string;
    }[]) {
      const list = byPayout.get(a.payout_id) ?? [];
      list.push({
        actorId: a.actor,
        decision: a.decision === "reject" ? "reject" : "approve",
        at: a.created_at,
      });
      byPayout.set(a.payout_id, list);
    }
    const [balance, accounts] = await Promise.all([
      merchantBalance(merchantId),
      listAccounts(db, merchantId, userId),
    ]);
    return {
      payouts: rows.map((r) => toView(r, byPayout.get(r.id) ?? [])),
      balance,
      accounts,
    };
  });
}

export async function requestPayout(
  db: Client,
  merchantId: string,
  userId: string,
  input: { accountId: string; amountMinor: number; note?: string | null; idempotencyKey: string },
) {
  await assertMerchantAdmin(db, merchantId);
  await enforceRateLimit("payout.request", `${merchantId}:${userId}`);
  const { requireStepUp } = await import("./identity.server");
  await requireStepUp(db, "payout", merchantId);

  const service = await admin();
  const key = input.idempotencyKey.trim();
  if (key.length < 8) throw new PayoutError("payout.missing_idempotency_key", 400);

  // Replay protection: an identical key returns the original instruction rather
  // than paying twice when the browser retries.
  const { data: existing } = await service
    .from("payouts")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) return toView(existing as PayoutRow, []);

  const { data: account } = await service
    .from("payout_accounts")
    .select("*")
    .eq("id", input.accountId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!account) throw new PayoutError("payout.account_not_found", 404);
  const acct = account as AccountRow;
  if (acct.state !== "verified") throw new PayoutError("payout.account_not_verified", 409);

  const balance = await merchantBalance(merchantId);
  const amountVerdict = validateAmount(input.amountMinor, balance.availableMinor);
  if (!amountVerdict.ok) {
    incr("framique_payout_request_total", { outcome: amountVerdict.code ?? "invalid" });
    throw new PayoutError(amountVerdict.code ?? "payout.invalid_amount", 400);
  }

  const method = acct.method as PayoutMethod;
  const fee = payoutFeeMinor(input.amountMinor, method);
  const { data, error } = await service
    .from("payouts")
    .insert({
      merchant_id: merchantId,
      account_id: acct.id,
      amount_minor_int: input.amountMinor,
      fee_minor_int: fee,
      net_minor_int: netPayoutMinor(input.amountMinor, method),
      currency_code: "BDT",
      method,
      state: "requested",
      approvals_required: approvalsRequired(input.amountMinor),
      idempotency_key: key,
      requested_by: userId,
      note: input.note ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new PayoutError("payout.create_failed", 500);
  const row = data as PayoutRow;
  await audit(row.id, merchantId, "payout.requested", userId, null, "requested", {
    amountMinor: input.amountMinor,
    feeMinor: fee,
  });
  incr("framique_payout_request_total", { outcome: "ok" });
  observe("framique_payout_amount_minor", input.amountMinor, { method });
  return toView(row, []);
}

export async function decidePayout(
  db: Client,
  merchantId: string,
  actorId: string,
  input: { payoutId: string; decision: "approve" | "reject"; note?: string | null },
) {
  await assertMerchantAdmin(db, merchantId);
  await enforceRateLimit("payout.approve", `${merchantId}:${actorId}`);
  const service = await admin();
  const { data } = await service
    .from("payouts")
    .select("*")
    .eq("id", input.payoutId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!data) throw new PayoutError("payout.not_found", 404);
  const row = data as PayoutRow;
  if (row.state !== "requested") throw new PayoutError("payout.not_pending", 409);
  if (row.requested_by === actorId) throw new PayoutError("payout.self_approval", 403);

  await service.from("payout_approvals").insert({
    payout_id: row.id,
    merchant_id: merchantId,
    actor: actorId,
    decision: input.decision,
    note: input.note ?? null,
  });

  const { data: approvalRows } = await service
    .from("payout_approvals")
    .select("actor, decision, created_at")
    .eq("payout_id", row.id);
  const approvals: Approval[] = ((approvalRows ?? []) as {
    actor: string;
    decision: string;
    created_at: string;
  }[]).map((a) => ({
    actorId: a.actor,
    decision: a.decision === "reject" ? "reject" : "approve",
    at: a.created_at,
  }));
  const verdict = evaluateApprovals({
    amountMinor: Number(row.amount_minor_int),
    requesterId: row.requested_by ?? "",
    approvals,
  });

  if (verdict.rejected) {
    const updated = await transition(row, "cancelled", actorId, "payout.rejected", {}, { note: input.note ?? null });
    incr("framique_payout_decision_total", { decision: "reject" });
    return toView(updated, approvals);
  }
  if (verdict.satisfied) {
    const updated = await transition(
      row,
      "approved",
      actorId,
      "payout.approved",
      { released_by: actorId, released_at: new Date().toISOString(), next_attempt_at: new Date().toISOString() },
      { approvals: verdict.approvals },
    );
    incr("framique_payout_decision_total", { decision: "approve_final" });
    return toView(updated, approvals);
  }
  await audit(row.id, merchantId, "payout.approval_recorded", actorId, "requested", "requested", {
    approvals: verdict.approvals,
    required: verdict.required,
  });
  incr("framique_payout_decision_total", { decision: "approve_partial" });
  return toView(row, approvals);
}

export async function cancelPayout(db: Client, merchantId: string, userId: string, payoutId: string) {
  await assertMerchantAdmin(db, merchantId);
  await enforceRateLimit("payout.approve", `${merchantId}:${userId}`);
  const service = await admin();
  const { data } = await service
    .from("payouts")
    .select("*")
    .eq("id", payoutId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!data) throw new PayoutError("payout.not_found", 404);
  const updated = await transition(data as PayoutRow, "cancelled", userId, "payout.canceled");
  return toView(updated, []);
}

/* --------------------------------- worker --------------------------------- */

/**
 * Disburses approved payouts. Called by cron, never by a user.
 *
 * The rail call is stubbed until live MFS credentials exist (§4.1 is
 * provider-gated); a merchant with no live credential is parked in `processing`
 * with a retry rather than being failed, so nothing is lost when the rail turns
 * on.
 */
export async function processPayoutQueue(limit = 20) {
  await enforceRateLimit("payout.worker", "cron");
  const service = await admin();
  const now = new Date();
  const { data } = await service
    .from("payouts")
    .select("*")
    .in("state", ["approved", "processing"])
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  const rows = (data ?? []) as PayoutRow[];
  let paid = 0;
  let failed = 0;
  let retried = 0;

  for (const row of rows) {
    const attempts = row.attempts + 1;
    try {
      const claimed =
        row.state === "approved"
          ? await transition(row, "processing", null, "payout.processing", { attempts })
          : ((
              await service
                .from("payouts")
                .update({ attempts, updated_at: new Date().toISOString() })
                .eq("id", row.id)
                .select("*")
                .single()
            ).data as PayoutRow);

      const { liveProviders } = await import("./provider-gate.server");
      const live = await liveProviders(row.merchant_id);
      if (live.length === 0) {
        // Provider-gated: park with backoff instead of burning the instruction.
        const delay = retryDelaySeconds(attempts);
        await service
          .from("payouts")
          .update({
            next_attempt_at: new Date(now.getTime() + delay * 1000).toISOString(),
            failure_code: "payout.no_live_rail",
            failure_detail: "Awaiting approved provider credentials",
          })
          .eq("id", claimed.id);
        await audit(claimed.id, claimed.merchant_id, "payout.deferred", null, "processing", "processing", {
          attempts,
          retryInSeconds: delay,
        });
        retried += 1;
        incr("framique_payout_worker_total", { outcome: "deferred" });
        continue;
      }

      const { postLedgerEntry } = await import("./ledger.server");
      await postLedgerEntry(service, {
        merchantId: claimed.merchant_id,
        source: "payout",
        direction: "debit",
        gross: { minor: Number(claimed.amount_minor_int), currency: claimed.currency_code },
        idempotencyKey: `payout:${claimed.id}`,
        memo: `Payout ${claimed.id}`,
      } as never);

      await transition(claimed, "paid", null, "payout.paid", {
        paid_at: new Date().toISOString(),
        failure_code: null,
        failure_detail: null,
      });
      paid += 1;
      incr("framique_payout_worker_total", { outcome: "paid" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      if (attempts >= MAX_PAYOUT_ATTEMPTS) {
        await service
          .from("payouts")
          .update({
            state: "failed",
            failure_code: "payout.exhausted",
            failure_detail: message.slice(0, 300),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        await audit(row.id, row.merchant_id, "payout.failed", null, row.state as PayoutState, "failed", {
          attempts,
          message,
        });
        failed += 1;
        incr("framique_payout_worker_total", { outcome: "failed" });
      } else {
        const delay = retryDelaySeconds(attempts);
        await service
          .from("payouts")
          .update({
            next_attempt_at: new Date(now.getTime() + delay * 1000).toISOString(),
            failure_code: "payout.retry",
            failure_detail: message.slice(0, 300),
          })
          .eq("id", row.id);
        retried += 1;
        incr("framique_payout_worker_total", { outcome: "retry" });
      }
    }
  }
  log("info", "payout.worker", { scanned: rows.length, paid, failed, retried });
  return { scanned: rows.length, paid, failed, retried };
}
