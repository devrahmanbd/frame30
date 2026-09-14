/**
 * Merchant billing desk (1.8 platform billing core).
 *
 * Every money decision lives in Postgres: `billing_plan_preview`,
 * `billing_plan_change`, `billing_trial_claim` and `billing_sweep` read prices
 * from `plan_definitions` and VAT from the legal-year `vat_rates` table, in
 * integer minor units, under the caller's RLS role. This module only shapes
 * the payload, enforces the burst gate and records spans — it never computes a
 * chargeable amount in TypeScript and never trusts a client-sent price.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  BillingError,
  daysBetween,
  ensureLimits,
  ensureSubscription,
  logEvent,
  loadPlanDefs,
  vatBasisPoints,
  type Plan,
} from "./billing.server";
import { withSpan, incr, log } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;

export type PlanPreview = {
  kind: "upgrade" | "downgrade" | "noop" | "contact_sales" | "no_subscription";
  plan: Plan;
  currency_code?: string;
  remaining_days?: number;
  period_days?: number;
  credit_minor_int?: number;
  subtotal_minor_int?: number;
  vat_rate_basis_points?: number;
  vat_minor_int?: number;
  total_minor_int?: number;
  products_limit?: number;
  staff_limit?: number;
  effective_at?: string;
};

/** Postgres error codes/messages are mapped to stable, secret-free app codes. */
function mapRpcError(message: string): BillingError {
  const known: Record<string, string> = {
    forbidden: "You do not have permission to change this plan",
    no_subscription: "No subscription on this store yet",
    subscription_cancelled: "This subscription is cancelled — contact support",
    plan_unavailable: "That plan is not available",
    contact_sales: "Contact sales for the Enterprise plan",
    fingerprint_required: "Signup signal missing — cannot issue a trial",
    already_claimed: "A trial was already issued for this store",
  };
  const code = Object.keys(known).find((k) => message.includes(k));
  if (code) return new BillingError(code, known[code] as string);
  log("warn", "billing.rpc_failed", { detail: message.slice(0, 120) });
  return new BillingError("billing_unavailable", "Billing is temporarily unavailable");
}

async function usage(db: Client, merchantId: string) {
  const [products, staff] = await Promise.all([
    db.from("products").select("id", { count: "exact", head: true }).eq("merchant_id", merchantId),
    db
      .from("merchant_members")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId),
  ]);
  return { products: products.count ?? 0, staff: staff.count ?? 0 };
}

const DUNNING_LADDER = [
  { stage: 1, day: 3, channel: "email" },
  { stage: 2, day: 7, channel: "sms" },
  { stage: 3, day: 14, channel: "system" },
  { stage: 4, day: 20, channel: "system" },
  { stage: 5, day: 45, channel: "system" },
] as const;

export function nextDunningStep(pastDueDays: number | null) {
  if (pastDueDays === null) return null;
  return DUNNING_LADDER.find((s) => s.day > pastDueDays) ?? null;
}

export async function loadBilling(db: Client, merchantId: string) {
  return withSpan("billing.load", async () => {
    const subscription = await ensureSubscription(db, merchantId);
    const [plans, limits, counts, vat, invoices, merchant, attempts] = await Promise.all([
      loadPlanDefs(db),
      ensureLimits(db, merchantId, subscription.plan),
      usage(db, merchantId),
      vatBasisPoints(db),
      db
        .from("invoices")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("merchants")
        .select("id, name, kyc_status, currency_code")
        .eq("id", merchantId)
        .single(),
      db
        .from("billing_dunning_attempts")
        .select("stage, channel, outcome, created_at, invoice_id")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const pastDueDays = daysBetween(subscription.past_due_since);
    const trialDaysLeft = subscription.trial_ends_at
      ? Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86400000)
      : null;
    const graceDaysLeft = subscription.grace_until
      ? Math.ceil((new Date(subscription.grace_until).getTime() - Date.now()) / 86400000)
      : null;

    return {
      plans,
      subscription,
      limits,
      usage: counts,
      vat,
      invoices: invoices.data ?? [],
      merchant: merchant.data,
      trialDaysLeft,
      dunning: {
        stage: subscription.dunning_stage ?? 0,
        pastDueDays,
        graceDaysLeft,
        /** Storefront writes are blocked from `paused` onward, not before. */
        limited: subscription.status === "past_due",
        paused: subscription.status === "paused",
        cancelled: subscription.status === "cancelled",
        next: nextDunningStep(pastDueDays),
        attempts: attempts.data ?? [],
        ladder: DUNNING_LADDER,
      },
      scheduled:
        subscription.scheduled_plan && subscription.scheduled_plan_at
          ? { plan: subscription.scheduled_plan, at: subscription.scheduled_plan_at }
          : null,
    };
  });
}

export async function planPreview(db: Client, merchantId: string, target: Plan) {
  const { data, error } = await db.rpc("billing_plan_preview", {
    _merchant_id: merchantId,
    _target: target,
  });
  if (error) throw mapRpcError(error.message);
  return data as unknown as PlanPreview;
}

/**
 * Upgrade bills immediately for the unused remainder of the period (prorated
 * per day, credit for the current plan deducted); downgrade is scheduled at
 * period end so the merchant keeps what they paid for. Both are audited.
 */
export async function changePlan(db: Client, merchantId: string, actor: string, target: Plan) {
  return withSpan(
    "billing.plan_change",
    async () => {
      await enforceRateLimit("billing.plan_change", `${merchantId}:${actor}`);
      const { data, error } = await db.rpc("billing_plan_change", {
        _merchant_id: merchantId,
        _target: target,
        _actor: actor,
      });
      if (error) {
        incr("framique_billing_plan_change_total", { outcome: "error" });
        throw mapRpcError(error.message);
      }
      const result = data as unknown as { kind: string; total_minor_int?: number };
      incr("framique_billing_plan_change_total", { outcome: result.kind });
      return result;
    },
    { plan: target },
  );
}

/**
 * Trial issuance is fingerprinted: the same signup signal reused across more
 * than two stores stops earning a trial. The raw signal never reaches the
 * database — only its SHA-256 digest does.
 */
export async function fingerprintOf(parts: (string | null | undefined)[]) {
  const seed = parts
    .map((p) => (p ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed || "unknown"));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function claimTrial(
  db: Client,
  merchantId: string,
  actor: string,
  fingerprint: string,
) {
  return withSpan("billing.trial_claim", async () => {
    await enforceRateLimit("billing.trial_claim", actor);
    const { data, error } = await db.rpc("billing_trial_claim", {
      _merchant_id: merchantId,
      _fingerprint: fingerprint,
      _actor: actor,
    });
    if (error) throw mapRpcError(error.message);
    const result = data as unknown as { kind: string; reuse_count?: number };
    incr("framique_billing_trial_total", { outcome: result.kind });
    return result;
  });
}

export async function payInvoice(db: Client, merchantId: string, actor: string, invoiceId: string) {
  return withSpan("billing.pay_invoice", async () => {
    await enforceRateLimit("billing.pay_invoice", `${merchantId}:${actor}`);
    const { data: invoice } = await db
      .from("invoices")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("id", invoiceId)
      .maybeSingle();
    if (!invoice) throw new BillingError("invoice_not_found", "Invoice not found");
    // Replay of a settled invoice returns the original verdict, never a second effect.
    if (invoice.status === "paid") return { invoice };
    if (invoice.status === "void") throw new BillingError("invoice_void", "Invoice is void");

    const { data: paid, error } = await db
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("merchant_id", merchantId)
      .in("status", ["open", "past_due"])
      .select("*")
      .maybeSingle();
    if (error) throw new BillingError("payment_failed", error.message);
    if (!paid) return { invoice };

    const { count } = await db
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .in("status", ["open", "past_due"]);

    if (!count) {
      // Settling the last balance clears dunning and lifts the pause.
      await db
        .from("subscriptions")
        .update({
          status: "active",
          past_due_since: null,
          grace_until: null,
          paused_at: null,
          dunning_stage: 0,
        })
        .eq("merchant_id", merchantId)
        .neq("status", "cancelled");
      await logEvent(db, merchantId, actor, "subscription.reinstated", {});
    }

    await logEvent(db, merchantId, actor, "invoice.paid", {
      invoice_id: invoiceId,
      total_minor_int: paid.total_minor_int,
    });
    incr("framique_billing_invoice_paid_total", {});
    return { invoice: paid };
  });
}

export async function warnLimit(db: Client, merchantId: string, actor: string, resource: string) {
  incr("framique_plan_limit_exceeded_total", { resource });
  await logEvent(db, merchantId, actor, "plan.limit_exceeded", { resource });
}
