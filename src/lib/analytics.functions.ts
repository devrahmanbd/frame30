/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

export const analyticsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ range: z.enum(["7d", "30d", "90d"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadAnalytics } = await import("./analytics.server");
    const merchantId = await scope(context.supabase, context.userId);
    return loadAnalytics(context.supabase, merchantId, data.range);
  });

const rangeDays = z.number().int().min(1).max(365).default(30);

export const analyticsFunnelFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: rangeDays }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { loadFunnel, loadCohorts } = await import("./analytics-warehouse.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("analytics.read", merchantId);
    const [funnel, cohorts] = await Promise.all([
      loadFunnel(context.supabase, merchantId, data.days),
      loadCohorts(context.supabase, merchantId),
    ]);
    return { funnel, cohorts };
  });

export const analyticsAudienceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: rangeDays }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { loadPersonas, loadProductPerformance } = await import("./analytics-warehouse.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("analytics.read", merchantId);
    const [personas, products] = await Promise.all([
      loadPersonas(context.supabase, merchantId, Math.max(90, data.days)),
      loadProductPerformance(context.supabase, merchantId, data.days),
    ]);
    return { personas, products };
  });

export const analyticsPipelineFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { loadPipelineHealth } = await import("./analytics-warehouse.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("analytics.read", merchantId);
    const health = await loadPipelineHealth(context.supabase, merchantId);
    const { data: conversions } = await (context.supabase as any)
      .from("analytics_conversion_events")
      .select("id, provider, event_name, status, attempts, last_error, created_at, value_minor_int")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(25);
    return { health, conversions: conversions ?? [] };
  });

export const analyticsFlushFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { flushBatch, rebuildCohorts } = await import("./analytics-warehouse.server");
    const merchantId = await scope(context.supabase, context.userId);
    await enforceRateLimit("analytics.flush", merchantId);
    const batch = await flushBatch(context.supabase, merchantId);
    await rebuildCohorts(context.supabase, merchantId);
    return batch;
  });

export const analyticsReportsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { listReports } = await import("./analytics-warehouse.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("analytics.read", merchantId);
    return { merchantId, ...(await listReports(context.supabase, merchantId)) };
  });

const reportInput = z.object({
  id: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(2).max(80),
  dataset: z.enum(["orders", "products", "customers", "traffic"]),
  dimensions: z.array(z.string().min(1).max(40)).max(3),
  metrics: z.array(z.string().min(1).max(40)).min(1).max(6),
  rangeDays: z.number().int().min(1).max(365),
  schedule: z.enum(["off", "daily", "weekly", "monthly"]),
  format: z.enum(["csv", "json"]),
  recipients: z.array(z.string().trim().email()).max(10),
});

export const analyticsSaveReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { saveReport } = await import("./analytics-warehouse.server");
    const merchantId = await scope(context.supabase, context.userId);
    await enforceRateLimit("analytics.report_write", merchantId);
    return saveReport(context.supabase, merchantId, context.userId, data);
  });

export const analyticsDeleteReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reportId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { deleteReport } = await import("./analytics-warehouse.server");
    const merchantId = await scope(context.supabase, context.userId);
    await enforceRateLimit("analytics.report_write", merchantId);
    return deleteReport(context.supabase, merchantId, data.reportId);
  });

export const analyticsRunReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reportId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { runReport } = await import("./analytics-warehouse.server");
    const merchantId = await scope(context.supabase, context.userId);
    await enforceRateLimit("analytics.report_run", merchantId);
    const result = await runReport(context.supabase, merchantId, data.reportId);
    // Keep the payload small: the preview is capped, the CSV carries everything.
    return { rowCount: result.rowCount, columns: result.columns, preview: result.rows.slice(0, 50) as Record<string, string | number | null>[], csv: result.csv };
  });

/** Traffic tab: visitors, clicks, geography and device/source mix. */
export const analyticsTrafficFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: rangeDays }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const { loadTraffic } = await import("./analytics-warehouse.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("analytics.read", merchantId);
    return loadTraffic(context.supabase, merchantId, data.days);
  });
