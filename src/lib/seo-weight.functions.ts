import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "./authz-middleware";

export const seoWeightStateFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) => z.object({ historyLimit: z.number().int().min(1).max(30).default(12) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadSeoWeightState } = await import("./seo-weight.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.weight_read", `${merchantId}:${context.userId}`);
    return loadSeoWeightState(context.supabase, merchantId, data.historyLimit);
  });

export const seoWeightRunFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { runSeoWeightAudit } = await import("./seo-weight.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("seo.weight_run", `${merchantId}:${context.userId}`);
    return runSeoWeightAudit({ merchantId, requestedBy: context.userId, trigger: "manual" });
  });