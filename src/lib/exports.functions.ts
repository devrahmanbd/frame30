import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const objectType = z.enum(["orders", "products", "customers", "product_events", "analytics_raw"]);

export const exportListFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listJobs } = await import("./exports.server");
    const merchantId = await scope(context.supabase, context.userId);
    return listJobs(context.supabase, merchantId);
  });

export const exportCreateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        objectType,
        rangeStart: z.string().nullable().optional(),
        rangeEnd: z.string().nullable().optional(),
        status: z.string().trim().max(40).nullable().optional(),
        reason: z.string().trim().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createJob } = await import("./exports.server");
    const merchantId = await scope(context.supabase, context.userId);
    const id = await createJob(context.supabase, merchantId, context.userId, {
      objectType: data.objectType,
      rangeStart: data.rangeStart ?? null,
      rangeEnd: data.rangeEnd ?? null,
      status: data.status ?? null,
      reason: data.reason ?? null,
    });
    return { id };
  });

export const exportRetryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { runJob } = await import("./exports.server");
    const merchantId = await scope(context.supabase, context.userId);
    return runJob(context.supabase, merchantId, data.jobId);
  });

export const exportDownloadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { downloadJob } = await import("./exports.server");
    const merchantId = await scope(context.supabase, context.userId);
    return downloadJob(context.supabase, merchantId, data.jobId);
  });

export const apiKeysListFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listKeys } = await import("./api-keys.server");
    const merchantId = await scope(context.supabase, context.userId);
    return listKeys(context.supabase, merchantId);
  });

export const apiKeyCreateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(60),
        scopes: z.array(z.enum(["orders.read", "products.write", "analytics.read"])).min(1),
        env: z.enum(["test", "live"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createKey } = await import("./api-keys.server");
    const merchantId = await scope(context.supabase, context.userId);
    return createKey(context.supabase, merchantId, context.userId, data);
  });

export const apiKeyRevokeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { revokeKey } = await import("./api-keys.server");
    const merchantId = await scope(context.supabase, context.userId);
    return revokeKey(context.supabase, merchantId, context.userId, data.keyId);
  });
