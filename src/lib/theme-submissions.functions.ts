import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requirePermission } from "./authz-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const packageTree: z.ZodType<unknown> = z.custom<unknown>(() => true);

export const submitThemePackageFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) => z.object({ package: packageTree }).parse(d))
  .handler(async ({ data, context }) => {
    const { submitThemePackage } = await import("./theme-submissions.server");
    const merchantId = await scope(context.supabase, context.userId);
    return submitThemePackage(context.supabase, merchantId, data.package);
  });

export const decideThemeSubmissionFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.publish")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { decideThemeSubmission } = await import(
      "./theme-submissions.server"
    );
    return decideThemeSubmission(
      context.supabase,
      data.id,
      data.approve,
      data.note,
    );
  });
