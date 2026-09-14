import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const COMPONENT_STATES = [
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
] as const;
const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;

export const opsDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadDeadLetters, loadReliability } = await import("./ops.server");
    const [dlq, reliability] = await Promise.all([
      loadDeadLetters(context.supabase, context.userId),
      loadReliability(context.supabase, context.userId),
    ]);
    return { ...dlq, ...reliability };
  });

export const opsReplayFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), source: z.enum(["payments", "courier"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { replayDeadLetter } = await import("./ops.server");
    return replayDeadLetter(context.supabase, context.userId, data);
  });

export const opsBackupRecordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["backup", "restore_drill"]),
        status: z.enum(["running", "passed", "failed"]),
        scope: z.string().trim().max(60).optional(),
        artifactRef: z.string().trim().max(200).nullable().optional(),
        rowsVerified: z.number().int().min(0).max(1_000_000_000).optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { recordBackupRun } = await import("./ops.server");
    return recordBackupRun(context.supabase, context.userId, data);
  });

export const opsRetentionSweepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requestRetentionSweep } = await import("./ops.server");
    return requestRetentionSweep(context.supabase, context.userId);
  });

export const opsIncidentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadIncidents } = await import("./ops.server");
    return loadIncidents(context.supabase, context.userId);
  });

export const opsIncidentOpenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(4).max(160),
        severity: z.enum(["minor", "major", "critical"]),
        components: z.array(z.string().trim().max(40)).max(10).default([]),
        isPublic: z.boolean().default(true),
        body: z.string().trim().min(4).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { openIncident } = await import("./ops.server");
    return openIncident(context.supabase, context.userId, data);
  });

export const opsIncidentUpdateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(INCIDENT_STATUSES),
        body: z.string().trim().min(4).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { postIncidentUpdate } = await import("./ops.server");
    return postIncidentUpdate(context.supabase, context.userId, data);
  });

export const opsComponentStateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ key: z.string().trim().min(1).max(40), state: z.enum(COMPONENT_STATES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setComponentState } = await import("./ops.server");
    return setComponentState(context.supabase, context.userId, data);
  });

/** Public status snapshot: unauthenticated, cached, public incidents only. */
export const opsPublicStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const { publicStatus } = await import("./ops.server");
  return publicStatus();
});
