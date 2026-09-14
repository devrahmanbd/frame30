import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const tenancyDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTenancyDesk } = await import("./tenancy.server");
    return loadTenancyDesk(context.supabase, context.userId);
  });

export const tenancyRequestPurgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: z.string().uuid(),
        reason: z.string().min(8).max(500),
        delayDays: z.number().int().min(0).max(90),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requestPurge } = await import("./tenancy.server");
    return requestPurge(context.supabase, context.userId, data);
  });

export const tenancyCancelPurgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ requestId: z.string().uuid(), reason: z.string().min(4).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { cancelPurge } = await import("./tenancy.server");
    return cancelPurge(context.supabase, context.userId, data);
  });

export const tenancyExecutePurgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { executePurge } = await import("./tenancy.server");
    return executePurge(context.supabase, context.userId, data.requestId);
  });
