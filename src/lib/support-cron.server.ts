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

/**
 * Pure coercion for the `support_sla_sweep` RPC payload. The RPC is a
 * database-side contract outside this repo, so every counter is clamped to a
 * finite non-negative integer — a null, string or NaN must never reach the
 * ledger or the gauges.
 */
export function normaliseSweepResult(raw: unknown): SupportSweepResult {
  const r = (raw ?? {}) as Partial<Record<keyof SupportSweepResult, unknown>>;
  const num = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  return {
    breached_first_response: num(r.breached_first_response),
    breached_resolution: num(r.breached_resolution),
    stale_conversations: num(r.stale_conversations),
    retried_events: num(r.retried_events),
  };
}

export async function runSupportSweep(
  subject: string,
): Promise<SupportSweepResult> {
  await rateLimit("support.sweep", subject);
  return withSpan("support.sweep", async () => {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    // A throw here is the alerting contract: the cron wrapper records the tick
    // as failed, the consecutive-failure streak grows, and the alert router
    // pages once the job's threshold is crossed. Never swallow it.
    const { data, error } = await supabaseAdmin.rpc("support_sla_sweep");
    if (error) throw error;

    const result = normaliseSweepResult(data);
    const breaches =
      result.breached_first_response + result.breached_resolution;
    incr("framique_support_sweep_total", {
      outcome: breaches ? "breaches" : "ok",
    });
    if (breaches > 0) {
      incr("framique_support_sweep_breaches_total", { subject });
    }
    // Warn level on breaches so log-based alerting sees the same signal the
    // gauge carries; quiet info otherwise to keep the per-minute tick cheap.
    log(breaches > 0 ? "warn" : "info", "support.sweep", {
      ...result,
      subject,
    });
    return result;
  });
}
