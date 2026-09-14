import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Infrastructure RPC surface (§4.4).
 *
 * Thin by design: authenticate, resolve the caller's merchant server-side, rate
 * limit, then delegate. The queue itself is service-role only, so every mutation
 * here is a deliberate, audited control-plane action rather than direct table
 * access from the browser.
 */
async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

export const infraOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ enforceRateLimit }, { queueDepths }, { loadBackend }] = await Promise.all([
      import("./rate-limit.server"),
      import("./job-queue.server"),
      import("./search-backend.server"),
    ]);
    const merchantId = await scope(context.supabase, context.userId);
    await enforceRateLimit("infra.read", merchantId);

    const [queues, backend] = await Promise.all([queueDepths(), loadBackend(merchantId)]);
    const { data: jobs } = await (context.supabase as unknown as { from: (t: string) => any })
      .from("job_queue")
      .select("id,queue,name,state,attempts,max_attempts,run_after,last_error_code,last_error_message,created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50);
    const { data: loadTests } = await (context.supabase as unknown as { from: (t: string) => any })
      .from("load_test_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      merchantId,
      queues,
      jobs: jobs ?? [],
      loadTests: loadTests ?? [],
      search: {
        ...backend.config,
        hasApiKey: Boolean(backend.apiKeySealed),
        breaker: backend.breaker,
        lastIndexedAt: backend.lastIndexedAt,
        documentsIndexed: backend.documentsIndexed,
      },
    };
  });

export const infraSaveSearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        engine: z.enum(["postgres", "meilisearch", "typesense"]),
        host: z.string().trim().max(300).nullable().optional(),
        indexName: z.string().trim().max(100).nullable().optional(),
        timeoutMs: z.number().int().min(50).max(5000).optional(),
        failureThreshold: z.number().int().min(1).max(100).optional(),
        cooldownSeconds: z.number().int().min(5).max(3600).optional(),
        apiKey: z.string().trim().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ enforceRateLimit }, { saveBackend }] = await Promise.all([
      import("./rate-limit.server"),
      import("./search-backend.server"),
    ]);
    const merchantId = await scope(context.supabase, context.userId);
    await enforceRateLimit("infra.write", merchantId);
    return saveBackend(merchantId, data);
  });

export const infraReindexFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ enforceRateLimit }, { queueIndexOps }] = await Promise.all([
      import("./rate-limit.server"),
      import("./search-backend.server"),
    ]);
    const merchantId = await scope(context.supabase, context.userId);
    await enforceRateLimit("infra.reindex", merchantId);

    const { data } = await (context.supabase as unknown as { from: (t: string) => any })
      .from("products")
      .select("id")
      .eq("merchant_id", merchantId)
      .limit(5000);
    const ops = ((data ?? []) as Array<{ id: string }>).map((p) => ({
      documentId: p.id,
      op: "upsert" as const,
    }));
    return queueIndexOps(merchantId, ops);
  });

export const infraJobActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ jobId: z.string().uuid(), action: z.enum(["replay", "cancel"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ enforceRateLimit }, { replayJob, cancelJob }] = await Promise.all([
      import("./rate-limit.server"),
      import("./job-queue.server"),
    ]);
    const merchantId = await scope(context.supabase, context.userId);
    await enforceRateLimit("infra.replay", merchantId);

    // RLS lets a member read only their own jobs; re-check ownership before a
    // service-role mutation so the control plane cannot cross tenants.
    const { data: owned } = await (context.supabase as unknown as { from: (t: string) => any })
      .from("job_queue")
      .select("id")
      .eq("id", data.jobId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (!owned) throw new Error("job_not_found");

    return data.action === "replay" ? replayJob(data.jobId) : cancelJob(data.jobId);
  });

export const infraRecordLoadTestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scenario: z.string().trim().min(2).max(80),
        targetUrl: z.string().url().max(300),
        durationSeconds: z.number().int().min(1).max(3600),
        concurrency: z.number().int().min(1).max(1000),
        requests: z.number().int().min(0),
        failures: z.number().int().min(0),
        p50Ms: z.number().int().min(0),
        p95Ms: z.number().int().min(0),
        p99Ms: z.number().int().min(0),
        rps: z.number().min(0),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await scope(context.supabase, context.userId);
    await enforceRateLimit("infra.loadtest", merchantId);

    const errorRate = data.requests > 0 ? data.failures / data.requests : 0;
    const verdict = errorRate > 0.01 || data.p95Ms > 1500 ? "fail" : data.p95Ms > 800 ? "warn" : "pass";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as unknown as { from: (t: string) => any }).from("load_test_runs").insert({
      merchant_id: merchantId,
      scenario: data.scenario,
      target_url: data.targetUrl,
      duration_seconds: data.durationSeconds,
      concurrency: data.concurrency,
      requests: data.requests,
      failures: data.failures,
      p50_ms: data.p50Ms,
      p95_ms: data.p95Ms,
      p99_ms: data.p99Ms,
      rps: data.rps,
      verdict,
      notes: data.notes ?? null,
    });
    return { verdict };
  });
