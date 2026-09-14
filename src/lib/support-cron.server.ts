/**
 * Support platform sweep. Marks SLA breaches, re-drives stuck channel events
 * and emits the desk gauges Prometheus scrapes. Service-role only, idempotent,
 * safe to run every minute.
 */
import { incr, log, withSpan } from "./observability.server";
import { rateLimit } from "./rate-limit.server";

export type SupportSweepResult = {
  breached_first_response: number;
  breached_resolution: number;
  stale_conversations: number;
  retried_events: number;
};

export async function runSupportSweep(subject: string): Promise<SupportSweepResult> {
  await rateLimit("support.sweep", subject);
  return withSpan("support.sweep", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("support_sla_sweep");
    if (error) throw error;

    const raw = (data ?? {}) as Partial<Record<keyof SupportSweepResult, number>>;
    const result: SupportSweepResult = {
      breached_first_response: Number(raw.breached_first_response ?? 0),
      breached_resolution: Number(raw.breached_resolution ?? 0),
      stale_conversations: Number(raw.stale_conversations ?? 0),
      retried_events: Number(raw.retried_events ?? 0),
    };
    incr("framique_support_sweep_total", {
      outcome: result.breached_first_response + result.breached_resolution ? "breaches" : "ok",
    });
    log("info", "support.sweep", { ...result, subject });
    return result;
  });
}
