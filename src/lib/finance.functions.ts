import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Provider sign-off, payouts and the USD pilot gate — RPC surface.
 *
 * Deliberately thin: tenancy resolution, rate limits, step-up MFA, the state
 * machines and every audit write live in the `.server` modules.
 */
async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const providerKey = z.enum([
  "bkash",
  "nagad",
  "rocket",
  "bkash_paylater",
  "nagad_bnpl",
  "bank_transfer",
  "bank_emi",
  "card_acquiring",
]);

/* ------------------------------ provider gate ----------------------------- */

export const providersListFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listCredentials } = await import("./provider-gate.server");
    return listCredentials(context.supabase, await scope(context.supabase, context.userId), context.userId);
  });

export const providerSaveEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        provider: providerKey,
        checklist: z.record(z.string(), z.boolean()),
        providerRef: z.string().trim().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveEvidence } = await import("./provider-gate.server");
    return saveEvidence(context.supabase, await scope(context.supabase, context.userId), context.userId, {
      provider: data.provider,
      checklist: data.checklist,
      providerRef: data.providerRef ?? null,
    });
  });

export const providerSaveSecretsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        provider: providerKey,
        secrets: z.record(z.string(), z.string().max(500)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveSecrets } = await import("./provider-gate.server");
    return saveSecrets(context.supabase, await scope(context.supabase, context.userId), context.userId, data);
  });

export const providerSubmitFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: providerKey }).parse(d))
  .handler(async ({ data, context }) => {
    const { submitForReview } = await import("./provider-gate.server");
    return submitForReview(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
      data.provider,
    );
  });

export const providerHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ credentialId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { credentialHistory } = await import("./provider-gate.server");
    return credentialHistory(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.credentialId,
    );
  });

/** Platform reviewer only — `decideCredential` enforces the admin check. */
export const providerDecideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        credentialId: z.string().uuid(),
        decision: z.enum(["in_review", "approved", "changes_requested", "rejected", "live", "suspended", "revoked"]),
        note: z.string().trim().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { decideCredential } = await import("./provider-gate.server");
    return decideCredential(context.supabase, context.userId, {
      credentialId: data.credentialId,
      decision: data.decision,
      note: data.note ?? null,
    });
  });

export const providerReviewQueueFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { reviewQueue } = await import("./provider-gate.server");
    return reviewQueue(context.supabase, context.userId);
  });

/* --------------------------------- payouts -------------------------------- */

export const payoutsListFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listPayouts } = await import("./payouts.server");
    return listPayouts(context.supabase, await scope(context.supabase, context.userId), context.userId);
  });

export const payoutAccountAddFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        label: z.string().trim().min(1).max(80),
        method: z.enum(["mfs", "bank"]),
        holderName: z.string().trim().min(2).max(120),
        mfsProvider: z.string().trim().max(40).nullable().optional(),
        msisdn: z.string().trim().max(20).nullable().optional(),
        bankName: z.string().trim().max(120).nullable().optional(),
        branchName: z.string().trim().max(120).nullable().optional(),
        accountNumber: z.string().trim().max(34).nullable().optional(),
        routingNumber: z.string().trim().max(20).nullable().optional(),
        makeDefault: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { addAccount } = await import("./payouts.server");
    return addAccount(context.supabase, await scope(context.supabase, context.userId), context.userId, data);
  });

export const payoutRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().uuid(),
        amountMinor: z.number().int().positive().max(500_000_000),
        note: z.string().trim().max(300).nullable().optional(),
        idempotencyKey: z.string().trim().min(8).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { requestPayout, listPayouts } = await import("./payouts.server");
    await requestPayout(context.supabase, merchantId, context.userId, data);
    return listPayouts(context.supabase, merchantId, context.userId);
  });

export const payoutDecideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payoutId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        note: z.string().trim().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { decidePayout, listPayouts } = await import("./payouts.server");
    await decidePayout(context.supabase, merchantId, context.userId, data);
    return listPayouts(context.supabase, merchantId, context.userId);
  });

export const payoutCancelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ payoutId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { cancelPayout, listPayouts } = await import("./payouts.server");
    await cancelPayout(context.supabase, merchantId, context.userId, data.payoutId);
    return listPayouts(context.supabase, merchantId, context.userId);
  });

/* ------------------------------ currency gate ----------------------------- */

export const currencyStateFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currencyState } = await import("./currency-gate.server");
    return currencyState(context.supabase, await scope(context.supabase, context.userId), context.userId);
  });

export const currencyConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { recordConsent } = await import("./currency-gate.server");
    return recordConsent(context.supabase, await scope(context.supabase, context.userId), context.userId);
  });

export const currencyModeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ mode: z.enum(["bdt_locked", "pilot_assessing", "usd_enabled"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setCurrencyMode } = await import("./currency-gate.server");
    return setCurrencyMode(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
      data.mode,
    );
  });
