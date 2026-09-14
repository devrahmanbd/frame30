import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const couponSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(3).max(32),
  type: z.enum(["fixed", "percent", "bogo", "free_shipping"]),
  amountMinorInt: z.number().int().min(0),
  percentOff: z.number().int().min(0).max(100),
  buyQuantity: z.number().int().min(0).max(99),
  getQuantity: z.number().int().min(0).max(99),
  minSubtotalMinorInt: z.number().int().min(0),
  usageLimit: z.number().int().min(1).nullable(),
  perCustomerLimit: z.number().int().min(1).nullable(),
  startsAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  allowCombine: z.boolean(),
  onePerOrder: z.boolean(),
  status: z.enum(["draft", "active", "paused", "expired"]),
});

export const saveCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => couponSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId, saveCoupon } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return saveCoupon(context.supabase, merchantId, data);
  });

export const sendCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId, sendCampaign } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return sendCampaign(context.supabase, merchantId, data.campaignId);
  });

export const retrySendFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sendId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId, retryCampaignSend } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return retryCampaignSend(context.supabase, merchantId, data.sendId);
  });

export const deleteArticleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ articleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId, deleteArticle } = await import("./marketing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return deleteArticle(context.supabase, merchantId, data.articleId);
  });

export const unsubscribeFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { unsubscribeByToken } = await import("./marketing.server");
    return unsubscribeByToken(data.token);
  });

export const getPublicArticle = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { loadPublicArticle } = await import("./marketing.server");
    return loadPublicArticle(data.slug);
  });
