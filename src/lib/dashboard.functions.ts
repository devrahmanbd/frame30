import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const dashboardHomeFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadDashboardHome } = await import("./dashboard.server");
    const { cached } = await import("./cache.server");
    const merchantId = await currentMerchantId(
      context.supabase,
      context.userId,
    );
    return cached(
      `dashboard:home:${merchantId}`,
      15,
      () => loadDashboardHome(context.supabase, merchantId),
      { staleSeconds: 30, shared: true },
    );
  });
