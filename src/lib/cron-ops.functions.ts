/**
 * Owner RPCs for the scheduled-job desk (§9.3).
 *
 * Thin by design: validation here, behaviour in `cron-ops.server.ts`, loaded
 * inside each handler so the service-role client never enters a client bundle.
 * Every call is re-authorised server-side — the route guard on `/root/*` is UX,
 * `ownerGate` is the boundary.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const jobKey = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "invalid job key");

export const cronDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCronDesk } = await import("./cron-ops.server");
    return loadCronDesk(context.supabase, context.userId);
  });

export const cronToggleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: jobKey,
        enabled: z.boolean(),
        reason: z.string().trim().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setCronJobEnabled } = await import("./cron-ops.server");
    return setCronJobEnabled(context.supabase, context.userId, data);
  });

export const cronTriggerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: jobKey }).parse(d))
  .handler(async ({ data, context }) => {
    const { triggerCronJob } = await import("./cron-ops.server");
    return triggerCronJob(context.supabase, context.userId, data.key);
  });

export const cronSyncFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncRegistry, reapStaleLeases } = await import("./cron-ops.server");
    const { ownerGate } = await import("./owner-ops.server");
    return ownerGate(
      context.supabase,
      context.userId,
      { action: "cron.sync", entity: "ops_cron_jobs", bucket: "ops.backup", kind: "write" },
      async () => ({ ...(await syncRegistry()), ...(await reapStaleLeases()) }),
    );
  });

export const cronExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ format: z.enum(["crontab", "github", "pgcron"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { exportSchedules } = await import("./cron-ops.server");
    return exportSchedules(context.supabase, context.userId, data.format);
  });

export const opsAlertTestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { testAlerting } = await import("./cron-ops.server");
    return testAlerting(context.supabase, context.userId);
  });