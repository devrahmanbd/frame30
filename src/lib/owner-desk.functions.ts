import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Cross-tenant payout queue, holds and totals. */
export const ownerPayoutsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ state: z.string().max(20).nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadOwnerPayouts } = await import("./owner-payouts.server");
    return loadOwnerPayouts(context.supabase, context.userId, { state: data.state ?? null });
  });

export const ownerPlaceHoldFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: z.string().uuid(),
        amountMinor: z.number().int().min(1).max(1_000_000_000),
        reason: z.string().min(3).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ownerPlaceHold } = await import("./owner-payouts.server");
    return ownerPlaceHold(context.supabase, context.userId, data);
  });

export const ownerReleaseHoldFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ holdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ownerReleaseHold } = await import("./owner-payouts.server");
    return ownerReleaseHold(context.supabase, context.userId, data.holdId);
  });

export const ownerCancelPayoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ payoutId: z.string().uuid(), reason: z.string().min(3).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ownerCancelPayout } = await import("./owner-payouts.server");
    return ownerCancelPayout(context.supabase, context.userId, data.payoutId, data.reason);
  });

/** People: who can sign in, which stores they belong to, who owns the platform. */
export const ownerPeopleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ page: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { loadPeople } = await import("./owner-people.server");
    return loadPeople(context.supabase, context.userId, data.page ?? 1);
  });

export const ownerSetOwnerRightFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), grant: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setOwnerRight } = await import("./owner-people.server");
    return setOwnerRight(context.supabase, context.userId, data.userId, data.grant);
  });
