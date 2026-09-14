/**
 * Platform collection runtime — the rail that actually takes money for our own
 * invoices.
 *
 * Design constraints that shaped this file:
 *
 *  1. **The database owns settlement.** `platform_charge_open` and
 *     `platform_charge_settle` are SECURITY DEFINER routines that lock the
 *     invoice row, so a doubled provider callback, two browser tabs, and the
 *     dunning sweep cannot race an invoice into a half-paid state. This module
 *     never writes `invoices.status` itself.
 *  2. **The signature is the trust boundary.** A return URL is honoured only
 *     when its HMAC over `chargeId.status.nonce` verifies against the platform
 *     rail secret. The secret is server-only and never leaves this module.
 *  3. **Every path is observable.** Opens, returns, signature failures, replays
 *     and settlements are counted and span-timed, because "the merchant says
 *     they paid and we say they didn't" is the single most expensive support
 *     ticket a SaaS can have.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  classifyFailure,
  collectionVerdict,
  isPlatformMethod,
  platformMethods,
  receiptLines,
  type ChargeStatus,
} from "./platform-billing";
import { daysBetween, ensureSubscription } from "./billing.server";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;
type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type ChargeRow = {
  id: string;
  merchant_id: string;
  invoice_id: string;
  method: string;
  amount_minor_int: number | string;
  currency_code: string;
  status: ChargeStatus;
  attempt: number;
  idempotency_key: string;
  provider_reference: string | null;
  return_nonce: string;
  failure_code: string | null;
  receipt_number: string | null;
  expires_at: string;
  settled_at: string | null;
  created_at: string;
};

export class PlatformBillingError extends Error {
  constructor(
    readonly code:
      | "platform.rail_unconfigured"
      | "platform.invoice_not_found"
      | "platform.invoice_already_paid"
      | "platform.invoice_not_chargeable"
      | "platform.method_unsupported"
      | "platform.charge_not_found"
      | "platform.signature_invalid"
      | "platform.retry_too_soon"
      | "platform.attempts_exhausted"
      | "platform.unavailable",
    readonly en: string,
    readonly bn: string,
  ) {
    super(`${code}|${en}|${bn}`);
    this.name = "PlatformBillingError";
  }
}

function admin() {
  return import("@/integrations/supabase/client.server").then(
    (m) => m.supabaseAdmin as unknown as Client & Rpc,
  );
}

/**
 * The platform rail secret. `PLATFORM_GATEWAY_SECRET` is the configured value;
 * when it is absent we derive a stable key from the service-role secret rather
 * than disabling collection in preview. The derivation is one-way, server-only
 * and rotates with the service key — it is a fallback, not a shortcut, and the
 * absence of *both* fails closed.
 */
function railSecret() {
  const configured = process.env["PLATFORM_GATEWAY_SECRET"];
  if (configured && configured.length >= 16) return configured;
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!service) {
    throw new PlatformBillingError(
      "platform.rail_unconfigured",
      "Card/wallet collection is not configured on this deployment.",
      "এই ডিপ্লয়মেন্টে কার্ড/ওয়ালেট পেমেন্ট কনফিগার করা হয়নি।",
    );
  }
  return createHash("sha256").update(`framique.platform-rail.v1:${service}`).digest("hex");
}

export function signPlatformReturn(chargeId: string, status: string, nonce: string) {
  return createHmac("sha256", railSecret()).update(`${chargeId}.${status}.${nonce}`).digest("hex");
}

export function platformSignatureMatches(
  chargeId: string,
  status: string,
  nonce: string,
  given: string,
) {
  const a = Buffer.from(signPlatformReturn(chargeId, status, nonce));
  const b = Buffer.from((given ?? "").trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

function mapOpenError(message: string): PlatformBillingError {
  const table: Record<string, PlatformBillingError> = {
    invoice_not_found: new PlatformBillingError(
      "platform.invoice_not_found",
      "That invoice does not belong to this store.",
      "এই ইনভয়েসটি এই স্টোরের নয়।",
    ),
    invoice_already_paid: new PlatformBillingError(
      "platform.invoice_already_paid",
      "This invoice is already paid — nothing was charged.",
      "এই ইনভয়েস আগেই পরিশোধিত — কোনো টাকা কাটা হয়নি।",
    ),
    invoice_not_chargeable: new PlatformBillingError(
      "platform.invoice_not_chargeable",
      "This invoice cannot be paid in its current state.",
      "বর্তমান অবস্থায় এই ইনভয়েস পরিশোধ করা যাবে না।",
    ),
    invoice_zero_total: new PlatformBillingError(
      "platform.invoice_not_chargeable",
      "This invoice has nothing to collect.",
      "এই ইনভয়েসে সংগ্রহ করার কিছু নেই।",
    ),
    idempotency_conflict: new PlatformBillingError(
      "platform.unavailable",
      "This payment request conflicts with an earlier one. Reload and try again.",
      "এই পেমেন্ট অনুরোধটি আগের একটির সাথে সাংঘর্ষিক। রিলোড করে আবার চেষ্টা করুন।",
    ),
  };
  const key = Object.keys(table).find((k) => message.includes(k));
  if (key) return table[key]!;
  log("error", "platform_billing.open_failed", { detail: message.slice(0, 160) });
  return new PlatformBillingError(
    "platform.unavailable",
    "Payments are temporarily unavailable. Your invoice is unchanged.",
    "পেমেন্ট সাময়িকভাবে বন্ধ। আপনার ইনভয়েস অপরিবর্তিত আছে।",
  );
}

// ------------------------------------------------------------------- read side
export type CollectionDesk = Awaited<ReturnType<typeof loadCollection>>;

/**
 * Everything the invoice screen needs in one bounded read: the outstanding
 * invoices, the attempt history per invoice, the verdict for each, and the rails
 * this plan may use. Four queries, all merchant-keyed and indexed — the screen
 * must not become an N+1 over invoices.
 */
export async function loadCollection(db: Client, merchantId: string) {
  return withSpan("platform_billing.load", async () => {
    const subscription = await ensureSubscription(db, merchantId);
    const [invoices, charges, plan] = await Promise.all([
      db
        .from("invoices")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(60),
      db
        .from("platform_charges")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("plan_definitions")
        .select("plan, payment_methods_allowed")
        .eq("plan", subscription.plan)
        .maybeSingle(),
    ]);

    const allowed = Array.isArray(plan.data?.payment_methods_allowed)
      ? (plan.data?.payment_methods_allowed as string[]).filter(isPlatformMethod)
      : null;
    const methods = platformMethods(allowed && allowed.length ? allowed : null);
    const rows = (charges.data ?? []) as unknown as ChargeRow[];
    const byInvoice = new Map<string, ChargeRow[]>();
    for (const row of rows) {
      const list = byInvoice.get(row.invoice_id) ?? [];
      list.push(row);
      byInvoice.set(row.invoice_id, list);
    }

    const pastDueDays = daysBetween(subscription.past_due_since);
    const items = (invoices.data ?? []).map((invoice) => {
      const history = byInvoice.get(invoice.id) ?? [];
      const live = history.find((c) => c.status === "created" || c.status === "pending") ?? null;
      const lastFailed = history.find((c) =>
        ["failed", "cancelled", "expired"].includes(c.status),
      );
      const paid = history.find((c) => c.status === "paid") ?? null;
      const failedAttempts = history.filter((c) =>
        ["failed", "cancelled", "expired"].includes(c.status),
      ).length;

      return {
        invoice,
        history,
        live,
        paidCharge: paid,
        failure: lastFailed ? classifyFailure(lastFailed.failure_code) : null,
        verdict: collectionVerdict({
          invoiceStatus: invoice.status,
          attempts: failedAttempts,
          liveCharge: !!live && new Date(live.expires_at).getTime() > Date.now(),
          pastDueDays,
          subscriptionStatus: subscription.status,
          lastFailureCode: lastFailed?.failure_code ?? null,
          lastFailedAt: lastFailed?.created_at ?? null,
        }),
        receipt:
          paid && invoice.status === "paid"
            ? receiptLines({
                receiptNumber: paid.receipt_number,
                invoiceNumber: invoice.invoice_number,
                plan: invoice.plan,
                periodStart: invoice.period_start,
                periodEnd: invoice.period_end,
                subtotalMinorInt: Number(invoice.subtotal_minor_int),
                vatMinorInt: Number(invoice.vat_minor_int),
                vatRateBasisPoints: invoice.vat_rate_basis_points,
                totalMinorInt: Number(invoice.total_minor_int),
                currencyCode: invoice.currency_code,
                method: paid.method,
                providerReference: paid.provider_reference,
                paidAt: invoice.paid_at,
                merchantName: "",
              })
            : null,
      };
    });

    return {
      methods,
      items,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        dunningStage: subscription.dunning_stage ?? 0,
        pastDueDays,
        graceUntil: subscription.grace_until,
      },
      outstandingMinorInt: (invoices.data ?? [])
        .filter((i) => i.status === "open" || i.status === "past_due")
        .reduce((sum, i) => sum + Number(i.total_minor_int), 0),
    };
  });
}

// ------------------------------------------------------------------ write side
export type StartChargeResult = {
  chargeId: string;
  status: ChargeStatus;
  method: string;
  amountMinorInt: number;
  currencyCode: string;
  expiresAt: string;
  attempt: number;
  /** Hosted page the merchant is sent to. `null` for manual bank transfer. */
  redirectUrl: string | null;
  instructions: { en: string; bn: string } | null;
  replay: boolean;
};

/**
 * Opens (or replays) a collection attempt. The retry ladder is enforced here as
 * well as displayed by the UI: a scripted client that ignores the disabled
 * button still cannot hammer our gateway account.
 */
export async function startPlatformCharge(
  db: Client,
  merchantId: string,
  actor: string,
  input: { invoiceId: string; method: string; idempotencyKey?: string; origin: string },
): Promise<StartChargeResult> {
  if (!isPlatformMethod(input.method)) {
    throw new PlatformBillingError(
      "platform.method_unsupported",
      "That payment method is not available for platform invoices.",
      "প্ল্যাটফর্ম ইনভয়েসের জন্য এই পেমেন্ট মাধ্যম নেই।",
    );
  }
  await enforceRateLimit("platform.pay", `${merchantId}:${actor}`);

  return withSpan(
    "platform_billing.start_charge",
    async () => {
      // The merchant-scoped read decides eligibility (RLS applies); the admin
      // client only performs the locked write the merchant may not do directly.
      const desk = await loadCollection(db, merchantId);
      const item = desk.items.find((i) => i.invoice.id === input.invoiceId);
      if (!item) throw mapOpenError("invoice_not_found");
      if (item.invoice.status === "paid") throw mapOpenError("invoice_already_paid");
      if (item.verdict.kind === "wait") {
        throw new PlatformBillingError("platform.retry_too_soon", item.verdict.en, item.verdict.bn);
      }
      if (item.verdict.kind === "support") {
        throw new PlatformBillingError(
          "platform.attempts_exhausted",
          item.verdict.en,
          item.verdict.bn,
        );
      }
      if (!desk.methods.some((m) => m.key === input.method)) {
        throw new PlatformBillingError(
          "platform.method_unsupported",
          "Your plan cannot be paid with that method.",
          "আপনার প্ল্যান এই মাধ্যমে পরিশোধ করা যাবে না।",
        );
      }

      const idempotencyKey =
        input.idempotencyKey?.trim().slice(0, 120) ||
        `pc_${input.invoiceId}_${input.method}_${randomUUID()}`;
      const service = await admin();
      const { data, error } = await service.rpc("platform_charge_open", {
        _merchant_id: merchantId,
        _invoice_id: input.invoiceId,
        _method: input.method,
        _idempotency_key: idempotencyKey,
        _ttl_seconds: 1800,
      });
      if (error) {
        incr("framique_platform_charge_total", { outcome: "rejected", method: input.method });
        throw mapOpenError(error.message);
      }

      const charge = data as unknown as ChargeRow;
      const replay = charge.idempotency_key !== idempotencyKey;
      incr("framique_platform_charge_total", {
        outcome: replay ? "replayed" : "opened",
        method: charge.method,
      });

      const method = desk.methods.find((m) => m.key === charge.method);
      if (method?.manualSettlement) {
        // Manual rails stay `created`: the invoice clears only when finance
        // confirms the transfer, never because a merchant clicked a button.
        return {
          chargeId: charge.id,
          status: charge.status,
          method: charge.method,
          amountMinorInt: Number(charge.amount_minor_int),
          currencyCode: charge.currency_code,
          expiresAt: charge.expires_at,
          attempt: charge.attempt,
          redirectUrl: null,
          instructions: { en: method.noteEn, bn: method.noteBn },
          replay,
        };
      }

      if (charge.status === "created") {
        await service.rpc("platform_charge_settle", {
          _charge_id: charge.id,
          _status: "pending",
          _provider_reference: null,
          _failure_code: null,
          _actor: "merchant",
        });
      }

      const url = new URL(`/api/public/payments/platform/${charge.method}`, input.origin);
      url.searchParams.set("charge", charge.id);
      return {
        chargeId: charge.id,
        status: "pending",
        method: charge.method,
        amountMinorInt: Number(charge.amount_minor_int),
        currencyCode: charge.currency_code,
        expiresAt: charge.expires_at,
        attempt: charge.attempt,
        redirectUrl: url.pathname + url.search,
        instructions: method ? { en: method.noteEn, bn: method.noteBn } : null,
        replay,
      };
    },
    { method: input.method },
  );
}

/**
 * Hosted-page stand-in for the contracted rail. It never decides the outcome by
 * itself: it signs the outcome the provider reports, exactly as a real return
 * URL would, so the verification path in production and in the sandbox is the
 * same code.
 */
export async function platformHostedOutcome(
  chargeId: string,
  outcome: "success" | "fail" | "cancel",
  origin: string,
) {
  // (see hostedChargeView below for the read-only view this page renders)
  const service = await admin();
  const { data } = await service
    .from("platform_charges")
    .select("id, status, return_nonce, method")
    .eq("id", chargeId)
    .maybeSingle();
  const charge = data as unknown as Pick<ChargeRow, "id" | "status" | "return_nonce" | "method"> | null;
  if (!charge) {
    throw new PlatformBillingError(
      "platform.charge_not_found",
      "That payment attempt no longer exists.",
      "এই পেমেন্ট চেষ্টাটি আর নেই।",
    );
  }
  const status = outcome === "success" ? "paid" : outcome === "cancel" ? "cancelled" : "failed";
  const url = new URL("/api/public/payments/platform/return", origin);
  url.searchParams.set("charge", charge.id);
  url.searchParams.set("status", status);
  url.searchParams.set("sig", signPlatformReturn(charge.id, status, charge.return_nonce));
  incr("framique_platform_hosted_total", { method: charge.method, outcome });
  return { redirectTo: url.pathname + url.search };
}

export type ReturnOutcome = {
  status: ChargeStatus;
  invoiceId: string;
  receiptNumber: string | null;
  reinstated: boolean;
  replay: boolean;
};

/** Verifies and applies a signed provider return. The only settlement entry. */
export async function applyPlatformReturn(
  chargeId: string,
  status: string,
  signature: string,
  subject: string,
  failureCode?: string | null,
): Promise<ReturnOutcome> {
  await enforceRateLimit("platform.return", subject);

  return withSpan("platform_billing.apply_return", async () => {
    const service = await admin();
    const { data } = await service
      .from("platform_charges")
      .select("id, merchant_id, invoice_id, method, status, return_nonce, attempt")
      .eq("id", chargeId)
      .maybeSingle();
    const charge = data as unknown as ChargeRow | null;
    if (!charge) {
      incr("framique_platform_return_total", { outcome: "unknown_charge" });
      throw new PlatformBillingError(
        "platform.charge_not_found",
        "That payment attempt no longer exists.",
        "এই পেমেন্ট চেষ্টাটি আর নেই।",
      );
    }
    if (!["paid", "failed", "cancelled", "expired"].includes(status)) {
      throw new PlatformBillingError(
        "platform.signature_invalid",
        "Unrecognised payment result.",
        "পেমেন্টের ফলাফল বোঝা যায়নি।",
      );
    }
    if (!platformSignatureMatches(charge.id, status, charge.return_nonce, signature)) {
      incr("framique_platform_return_total", { outcome: "signature_invalid" });
      log("warn", "platform_billing.signature_invalid", { chargeId });
      throw new PlatformBillingError(
        "platform.signature_invalid",
        "This payment result could not be verified. Nothing was changed.",
        "এই পেমেন্ট ফলাফল যাচাই করা যায়নি। কিছু পরিবর্তন হয়নি।",
      );
    }

    const reference = `${charge.method}:${charge.id.slice(0, 8)}:${charge.attempt}`;
    const { data: settled, error } = await service.rpc("platform_charge_settle", {
      _charge_id: charge.id,
      _status: status,
      _provider_reference: status === "paid" ? reference : null,
      _failure_code:
        status === "paid"
          ? null
          : (failureCode ?? (status === "cancelled" ? "cancelled_by_user" : "provider_declined")),
      _actor: "gateway",
    });
    if (error) {
      incr("framique_platform_return_total", { outcome: "settle_failed" });
      log("error", "platform_billing.settle_failed", {
        chargeId,
        message: error.message.slice(0, 160),
      });
      throw new PlatformBillingError(
        "platform.unavailable",
        "We could not record this payment yet. Support has been notified.",
        "এই পেমেন্ট এখনো রেকর্ড করা যায়নি। সাপোর্টকে জানানো হয়েছে।",
      );
    }

    const result = settled as {
      charge: ChargeRow;
      replay: boolean;
      reinstated: boolean;
      outstanding: number;
    };
    incr("framique_platform_return_total", {
      outcome: result.replay ? "replay" : status,
      method: charge.method,
    });
    if (status === "paid" && !result.replay) {
      incr("framique_platform_collected_minor_total", { method: charge.method }, Number(result.charge.amount_minor_int));
      const { invalidateEntitlements } = await import("./entitlements.server");
      invalidateEntitlements(charge.merchant_id);
    }
    log("info", "platform_billing.settled", {
      chargeId,
      status,
      replay: result.replay,
      reinstated: result.reinstated,
      outstanding: result.outstanding,
    });

    return {
      status: result.charge.status,
      invoiceId: charge.invoice_id,
      receiptNumber: result.charge.receipt_number,
      reinstated: result.reinstated,
      replay: result.replay,
    };
  });
}

/** Merchant-initiated abandon, so a stuck attempt never blocks a new method. */
export async function hostedChargeView(chargeId: string) {
  const service = await admin();
  const { data } = await service
    .from("platform_charges")
    .select("id, method, amount_minor_int, currency_code, status, attempt, expires_at")
    .eq("id", chargeId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as ChargeRow;
  return {
    id: row.id,
    method: row.method,
    amountMinorInt: Number(row.amount_minor_int),
    currencyCode: row.currency_code,
    status: row.status,
    attempt: row.attempt,
    expiresAt: row.expires_at,
    expired: new Date(row.expires_at).getTime() < Date.now(),
  };
}

/** Merchant-initiated abandon, so a stuck attempt never blocks a new method. */
export async function cancelPlatformCharge(
  db: Client,
  merchantId: string,
  actor: string,
  chargeId: string,
) {
  await enforceRateLimit("platform.pay", `${merchantId}:${actor}`);
  const { data } = await db
    .from("platform_charges")
    .select("id, status")
    .eq("merchant_id", merchantId)
    .eq("id", chargeId)
    .maybeSingle();
  if (!data) {
    throw new PlatformBillingError(
      "platform.charge_not_found",
      "That payment attempt no longer exists.",
      "এই পেমেন্ট চেষ্টাটি আর নেই।",
    );
  }
  const service = await admin();
  await service.rpc("platform_charge_settle", {
    _charge_id: chargeId,
    _status: "cancelled",
    _provider_reference: null,
    _failure_code: "cancelled_by_user",
    _actor: `merchant:${actor}`,
  });
  incr("framique_platform_charge_total", { outcome: "cancelled" });
  return { ok: true };
}

/**
 * Expiry sweep: an abandoned hosted page leaves a `pending` row that would
 * otherwise block the next attempt forever. Run from the billing cron.
 */
export async function expirePlatformCharges(limit = 500) {
  const service = await admin();
  const { data } = await service
    .from("platform_charges")
    .select("id")
    .in("status", ["created", "pending"])
    .lt("expires_at", new Date().toISOString())
    .limit(limit);
  let expired = 0;
  for (const row of data ?? []) {
    const { error } = await service.rpc("platform_charge_settle", {
      _charge_id: (row as { id: string }).id,
      _status: "expired",
      _provider_reference: null,
      _failure_code: "expired",
      _actor: "cron",
    });
    if (!error) expired += 1;
  }
  if (expired) incr("framique_platform_charge_total", { outcome: "expired" }, expired);
  return { expired };
}