/**
 * Plan usage RPC. Read-only and cheap: one SECURITY DEFINER snapshot, shaped
 * for the usage panel and the editor's pre-flight badge.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "./authz-middleware";

export const entitlementPanelFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("settings.read")])
  .inputValidator((d: unknown) => z.object({ fresh: z.boolean().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { entitlementPanel } = await import("./entitlements.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("entitlements.read", `${merchantId}:${context.userId}`);
    try {
      return {
        merchantId,
        ...(await entitlementPanel(context.supabase, merchantId, data?.fresh === true)),
      };
    } catch {
      // A limits outage must not blank the screen it decorates.
      throw new Error("entitlements_unavailable");
    }
  });