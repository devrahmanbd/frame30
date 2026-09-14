import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const gatewayEventsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadGatewayEvents } = await import("./gateway.server");
    return loadGatewayEvents(context.supabase, context.userId);
  });

export const gatewayRetryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { retryGatewayEvent } = await import("./gateway.server");
    return retryGatewayEvent(context.supabase, context.userId, data.eventId);
  });
