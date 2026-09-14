import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Merchant-facing custom-domain RPC. Thin wrappers: tenancy, rate limits, the
 * state machine and audit all live in `domains.server.ts`.
 */
async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const idInput = (d: unknown) => z.object({ id: z.string().uuid() }).parse(d);

export const domainsListFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listDomains } = await import("./domains.server");
    return listDomains(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
    );
  });

export const domainAddFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostname: z.string().trim().min(3).max(253) }).parse(d))
  .handler(async ({ data, context }) => {
    const { addDomain } = await import("./domains.server");
    await addDomain(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
      data.hostname,
    );
    const { listDomains } = await import("./domains.server");
    return listDomains(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
    );
  });

export const domainVerifyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const { verifyDomain, listDomains } = await import("./domains.server");
    const merchantId = await scope(context.supabase, context.userId);
    await verifyDomain(context.supabase, merchantId, context.userId, data.id, {
      actor: context.userId,
    });
    return listDomains(context.supabase, merchantId, context.userId);
  });

export const domainPrimaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const { setPrimary } = await import("./domains.server");
    return setPrimary(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
      data.id,
    );
  });

export const domainRedirectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), redirect: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setRedirect } = await import("./domains.server");
    return setRedirect(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
      data.id,
      data.redirect,
    );
  });

export const domainEnabledFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setDomainEnabled } = await import("./domains.server");
    return setDomainEnabled(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
      data.id,
      data.enabled,
    );
  });

export const domainRemoveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const { removeDomain } = await import("./domains.server");
    return removeDomain(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
      data.id,
    );
  });

export const domainHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const { domainHistory } = await import("./domains.server");
    return domainHistory(
      context.supabase,
      await scope(context.supabase, context.userId),
      context.userId,
      data.id,
    );
  });
