import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CUSTOM_CODE_LIMITS } from "./custom-code";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const themeId = z.string().uuid();

export const customCodeWorkspaceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ themeId }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadCustomCode } = await import("./custom-code.server");
    const merchantId = await scope(context.supabase, context.userId);
    return loadCustomCode(context.supabase, merchantId, data.themeId);
  });

export const customCodeSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        themeId,
        css: z.string().max(CUSTOM_CODE_LIMITS.css),
        js: z.string().max(CUSTOM_CODE_LIMITS.js),
        head: z.string().max(CUSTOM_CODE_LIMITS.head),
        bodyStart: z.string().max(CUSTOM_CODE_LIMITS.body),
        bodyEnd: z.string().max(CUSTOM_CODE_LIMITS.body),
        jsRequiresConsent: z.boolean(),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveCustomCode } = await import("./custom-code.server");
    const merchantId = await scope(context.supabase, context.userId);
    return saveCustomCode(context.supabase, merchantId, data);
  });

export const customCodeRestoreFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ themeId, versionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { restoreCustomCode } = await import("./custom-code.server");
    const merchantId = await scope(context.supabase, context.userId);
    return restoreCustomCode(context.supabase, merchantId, data.themeId, data.versionId);
  });

/** Platform owner only — RLS rejects a merchant who tries. */
export const customCodeKillFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ merchantId: z.string().uuid(), disabled: z.boolean(), reason: z.string().max(200).nullable() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setCustomCodeKill } = await import("./custom-code.server");
    return setCustomCodeKill(context.supabase, data.merchantId, data.disabled, data.reason);
  });
