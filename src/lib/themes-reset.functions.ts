/**
 * The RESET server function (Batch C).
 *
 * A NEW module on purpose: the reset needs a server function, and
 * `src/lib/themes.functions.ts` is not named by the task's file list — a new
 * file keeps that list intact and the port spec's §7 allows new files.
 *
 * The function exposes exactly ONE capability: restore ONE template to the
 * theme's own default. It is a `themes.update` action (it writes a draft
 * and a version), and it never publishes — publishing stays the merchant's
 * explicit second step.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requirePermission } from "./authz-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

export const builderResetTemplateFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        themeId: z.string().uuid(),
        /**
         * The template to reset: a base key, or a variant of the CLOSED
         * vocabulary. The server validates it again against the same table
         * the editor used — the client is never the only gate.
         */
        template: z.string().min(1).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { resetTemplateToDefault } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return resetTemplateToDefault(context.supabase, merchantId, data);
  });
