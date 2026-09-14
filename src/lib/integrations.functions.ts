import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const serviceKey = z.enum([
  "supabase",
  "prometheus",
  "loki",
  "grafana",
  "alertmanager",
  "glitchtip",
  "sentry",
]);

export const loadIntegrationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadIntegrations } = await import("./integrations.server");
    return loadIntegrations(context.supabase, context.userId);
  });

export const saveIntegrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        service: serviceKey,
        baseUrl: z.string().min(4).max(300),
        notes: z.string().max(500).nullable().optional(),
        enabled: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveIntegration } = await import("./integrations.server");
    return saveIntegration(context.supabase, context.userId, data);
  });

export const testIntegrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ service: serviceKey }).parse(d))
  .handler(async ({ data, context }) => {
    const { testIntegration } = await import("./integrations.server");
    return testIntegration(context.supabase, context.userId, data.service);
  });

export const disconnectIntegrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ service: serviceKey }).parse(d))
  .handler(async ({ data, context }) => {
    const { disconnectIntegration } = await import("./integrations.server");
    return disconnectIntegration(context.supabase, context.userId, data.service);
  });

export const loadOpsSignalsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadOpsSignals } = await import("./integrations.server");
    return loadOpsSignals(context.supabase, context.userId);
  });
