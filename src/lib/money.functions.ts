import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const moneyDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadMoneyDesk } = await import("./money.server");
    return loadMoneyDesk(context.supabase, context.userId);
  });
