/**
 * Platform collection RPCs.
 *
 * Guarded with `finance.*` permissions: paying the platform is a money action,
 * so a marketing-only staff account can see nothing here and initiate nothing.
 * Errors are translated to the stable `code|en|bn` wire format the desk knows
 * how to render, so a provider or database message never reaches a merchant.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "./authz-middleware";

function wireError(error: unknown): Error {
  if (error && typeof error === "object" && (error as { name?: string }).name === "PlatformBillingError") {
    const e = error as { code: string; en: string; bn: string };
    const wrapped = new Error(`${e.code}|${e.en}|${e.bn}`);
    wrapped.name = "PlatformBillingError";
    return wrapped;
  }
  if (error instanceof Error && error.name === "RateLimitError") {
    return new Error(
      "platform.retry_too_soon|Too many payment attempts just now — try again shortly.|এই মুহূর্তে অনেকবার চেষ্টা হয়েছে — কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    );
  }
  return new Error(
    "platform.unavailable|Payments are temporarily unavailable. Your invoice is unchanged.|পেমেন্ট সাময়িকভাবে বন্ধ। আপনার ইনভয়েস অপরিবর্তিত আছে।",
  );
}

export const platformCollectionFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("finance.read")])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadCollection } = await import("./platform-billing.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("platform.read", `${merchantId}:${context.userId}`);
    try {
      return { merchantId, ...(await loadCollection(context.supabase, merchantId)) };
    } catch (error) {
      throw wireError(error);
    }
  });

export const platformStartChargeFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("finance.initiate")])
  .inputValidator((d: unknown) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        method: z.string().min(2).max(40),
        idempotencyKey: z.string().min(8).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { startPlatformCharge } = await import("./platform-billing.server");
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const host = getRequestHost();
    const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
    try {
      return await startPlatformCharge(context.supabase, merchantId, context.userId, {
        invoiceId: data.invoiceId,
        method: data.method,
        ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
        origin,
      });
    } catch (error) {
      throw wireError(error);
    }
  });

export const platformCancelChargeFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("finance.initiate")])
  .inputValidator((d: unknown) => z.object({ chargeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { cancelPlatformCharge } = await import("./platform-billing.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    try {
      return await cancelPlatformCharge(context.supabase, merchantId, context.userId, data.chargeId);
    } catch (error) {
      throw wireError(error);
    }
  });