/**
 * Scheduled alert sweep. The scan lives in `public.notifications_sweep()` so it
 * is one idempotent statement set; this wrapper adds the burst gate, a span and
 * a Prometheus counter per generated bucket.
 */
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

export type NotificationSweepResult = {
  low_stock: number;
  past_due: number;
  trial_ending: number;
  approvals: number;
};

export async function runNotificationSweep(subject = "cron"): Promise<NotificationSweepResult> {
  return withSpan("notifications.sweep", async () => {
    await enforceRateLimit("notifications.sweep", subject);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (
      supabaseAdmin as unknown as {
        rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("notifications_sweep");
    if (error) throw new Error(`notifications_sweep_failed: ${error.message}`);

    const result = data as NotificationSweepResult;
    for (const [key, value] of Object.entries(result ?? {})) {
      if (typeof value === "number") incr("framique_notifications_total", { bucket: key }, value);
    }
    log("info", "notifications.sweep", { ...result });
    return result;
  });
}
