import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getMerchantRiskTier,
  setMerchantRiskTier,
} from "@/lib/risk-tier.server";
import { RISK_TIERS, type RiskTier } from "@/lib/risk-tier";

const GetSchema = z.object({ merchantId: z.string().uuid() });
const SetSchema = z.object({
  merchantId: z.string().uuid(),
  tier: z.enum(RISK_TIERS),
  reason: z.string().min(1).max(500),
});

export const getMerchantRiskTierFn = createServerFn({ method: "GET" })
  .validator(GetSchema)
  .handler(async ({ data }) => {
    const tier = await getMerchantRiskTier(data.merchantId);
    return { tier };
  });

export const setMerchantRiskTierFn = createServerFn({ method: "POST" })
  .validator(SetSchema)
  .handler(async ({ data }) => {
    await setMerchantRiskTier(data.merchantId, data.tier, data.reason, "admin");
    return { ok: true };
  });
