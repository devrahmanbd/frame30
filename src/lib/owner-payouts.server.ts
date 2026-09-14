/**
 * Cross-tenant payout desk (platform owner side).
 *
 * The merchant-facing layer in `payouts.server.ts` owns requesting and
 * approving inside one store. This module is the platform's own control on the
 * same money: it can see every store's queue, park funds behind a hold, and
 * cancel an instruction before it is disbursed. Nothing here can *create* a
 * payment, so an owner can only ever slow money down, never push it out.
 *
 * Every export goes through `ownerGate`, so each read and each write leaves an
 * append-only audit row naming the actor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ownerGate, OwnerError } from "./owner-ops.server";
import { maskDestination, netPayoutMinor, type PayoutMethod, type PayoutState } from "./payouts";

type Client = SupabaseClient<Database>;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = any;

async function service() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export type OwnerPayoutRow = {
  id: string;
  merchantId: string;
  merchantName: string;
  state: PayoutState;
  amountMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
  method: PayoutMethod;
  destination: string;
  note: string | null;
  requestedAt: string;
  paidAt: string | null;
  attempts: number;
  failureCode: string | null;
};

export type OwnerHoldRow = {
  id: string;
  merchantId: string;
  merchantName: string;
  amountMinor: number;
  reason: string;
  createdAt: string;
  releasedAt: string | null;
};

const OPEN_STATES: PayoutState[] = ["requested", "approved", "processing"];

/** The whole desk in one round trip: queue, holds and per-state totals. */
export async function loadOwnerPayouts(db: Client, userId: string, filter: { state?: string | null } = {}) {
  return ownerGate(
    db,
    userId,
    {
      action: "payouts.read",
      entity: "payouts",
      bucket: "owner.read",
      kind: "read",
      meta: { state: filter.state ?? "all" },
    },
    async () => {
      const svc = await service();
      const merchants = await svc.from("merchants").select("id, name, status");
      const names = new Map<string, string>(
        ((merchants.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]),
      );

      let q = svc
        .from("payouts")
        .select(
          "id, merchant_id, state, amount_minor_int, fee_minor_int, net_minor_int, currency_code, method, note, requested_at, paid_at, attempts, failure_code, account_id",
        )
        .order("requested_at", { ascending: false })
        .limit(200);
      if (filter.state && filter.state !== "all") q = q.eq("state", filter.state);
      const { data, error } = await q;
      if (error) throw new OwnerError("payouts.read_failed", error.message);
      const rows = (data ?? []) as Loose[];

      const accountIds = [...new Set(rows.map((r) => r.account_id as string))];
      const accounts = accountIds.length
        ? await svc
            .from("payout_accounts")
            .select("id, method, msisdn, account_number, holder_name, state")
            .in("id", accountIds)
        : { data: [] };
      const byAccount = new Map<string, Loose>(
        ((accounts.data ?? []) as Loose[]).map((a) => [a.id as string, a]),
      );

      const holdRows = await svc
        .from("payout_holds")
        .select("id, merchant_id, amount_minor_int, reason, created_at, released_at")
        .order("created_at", { ascending: false })
        .limit(200);

      const payouts: OwnerPayoutRow[] = rows.map((r) => {
        const acct = byAccount.get(r.account_id as string);
        return {
          id: r.id,
          merchantId: r.merchant_id,
          merchantName: names.get(r.merchant_id) ?? "—",
          state: r.state as PayoutState,
          amountMinor: Number(r.amount_minor_int ?? 0),
          feeMinor: Number(r.fee_minor_int ?? 0),
          netMinor: Number(r.net_minor_int ?? netPayoutMinor(Number(r.amount_minor_int ?? 0), r.method)),
          currency: r.currency_code ?? "BDT",
          method: r.method as PayoutMethod,
          // Never surface a full bank/mobile number in a cross-tenant view.
          destination: acct
            ? maskDestination({
                method: acct.method as PayoutMethod,
                msisdn: acct.msisdn ?? null,
                accountNumber: acct.account_number ?? null,
              })
            : "—",
          note: r.note ?? null,
          requestedAt: r.requested_at,
          paidAt: r.paid_at ?? null,
          attempts: Number(r.attempts ?? 0),
          failureCode: r.failure_code ?? null,
        };
      });

      const holds: OwnerHoldRow[] = ((holdRows.data ?? []) as Loose[]).map((h) => ({
        id: h.id,
        merchantId: h.merchant_id,
        merchantName: names.get(h.merchant_id) ?? "—",
        amountMinor: Number(h.amount_minor_int ?? 0),
        reason: h.reason,
        createdAt: h.created_at,
        releasedAt: h.released_at ?? null,
      }));

      const totals = {
        openCount: payouts.filter((p) => OPEN_STATES.includes(p.state)).length,
        openMinor: payouts
          .filter((p) => OPEN_STATES.includes(p.state))
          .reduce((s, p) => s + p.amountMinor, 0),
        paidMinor: payouts.filter((p) => p.state === "paid").reduce((s, p) => s + p.amountMinor, 0),
        failedCount: payouts.filter((p) => p.state === "failed").length,
        heldMinor: holds.filter((h) => !h.releasedAt).reduce((s, h) => s + h.amountMinor, 0),
      };

      return {
        payouts,
        holds,
        totals,
        tenants: ((merchants.data ?? []) as Loose[]).map((m) => ({
          id: m.id,
          name: m.name,
          status: m.status,
        })),
        generatedAt: new Date().toISOString(),
      };
    },
  );
}

/** Parks an amount so it stops counting as available balance. */
export async function ownerPlaceHold(
  db: Client,
  userId: string,
  input: { merchantId: string; amountMinor: number; reason: string },
) {
  return ownerGate(
    db,
    userId,
    {
      action: "payouts.hold",
      entity: "payout_holds",
      entityId: input.merchantId,
      bucket: "owner.suspend",
      kind: "write",
      meta: { amountMinor: input.amountMinor, reason: input.reason },
    },
    async () => {
      const svc = await service();
      const { error } = await svc.from("payout_holds").insert({
        merchant_id: input.merchantId,
        amount_minor_int: input.amountMinor,
        reason: input.reason.trim().slice(0, 200) || "platform hold",
        created_by: userId,
      });
      if (error) throw new OwnerError("payouts.hold_failed", error.message);
      return { ok: true };
    },
  );
}

export async function ownerReleaseHold(db: Client, userId: string, holdId: string) {
  return ownerGate(
    db,
    userId,
    {
      action: "payouts.hold_release",
      entity: "payout_holds",
      entityId: holdId,
      bucket: "owner.suspend",
      kind: "write",
    },
    async () => {
      const svc = await service();
      const { error } = await svc
        .from("payout_holds")
        .update({ released_at: new Date().toISOString(), released_by: userId })
        .eq("id", holdId)
        .is("released_at", null);
      if (error) throw new OwnerError("payouts.release_failed", error.message);
      return { ok: true };
    },
  );
}

/**
 * Stops an instruction the platform does not want disbursed. Only pre-payment
 * states can be cancelled — a paid payout is history and must be reversed
 * through the ledger, not edited here.
 */
export async function ownerCancelPayout(db: Client, userId: string, payoutId: string, reason: string) {
  return ownerGate(
    db,
    userId,
    {
      action: "payouts.cancel",
      entity: "payouts",
      entityId: payoutId,
      bucket: "owner.suspend",
      kind: "write",
      meta: { reason },
    },
    async () => {
      const svc = await service();
      const { data } = await svc
        .from("payouts")
        .select("id, merchant_id, state")
        .eq("id", payoutId)
        .maybeSingle();
      if (!data) throw new OwnerError("payouts.not_found");
      const state = (data as Loose).state as PayoutState;
      if (!["draft", "requested", "approved", "failed"].includes(state)) {
        throw new OwnerError("payouts.not_cancellable");
      }
      const { error } = await svc
        .from("payouts")
        .update({ state: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", payoutId)
        .eq("state", state);
      if (error) throw new OwnerError("payouts.cancel_failed", error.message);
      await svc.from("payout_events").insert({
        payout_id: payoutId,
        merchant_id: (data as Loose).merchant_id,
        event: "payout.platform_cancelled",
        actor: userId,
        from_state: state,
        to_state: "cancelled",
        detail: { reason: reason.slice(0, 200) },
      });
      return { ok: true };
    },
  );
}
