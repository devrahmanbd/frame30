/**
 * Billing sweep runner (renewals, trial end, dunning ladder, scheduled
 * downgrades). The whole ladder lives in `public.billing_sweep()` so a partial
 * run can never leave a half-applied state; this wrapper adds the burst gate,
 * a span, and Prometheus counters for each verdict bucket.
 */
import { incr, log, setGauge, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

export type SweepResult = {
  trials_ended: number;
  downgrades_applied: number;
  invoices_renewed: number;
  dunning_attempts: number;
  paused: number;
  cancelled: number;
  swept_at: string;
};

export async function runBillingSweep(subject = "cron"): Promise<SweepResult> {
  return withSpan("billing.sweep", async () => {
    await enforceRateLimit("billing.sweep", subject);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (
      supabaseAdmin as unknown as {
        rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("billing_sweep");
    if (error) throw new Error(`billing_sweep_failed: ${error.message}`);

    const result = data as SweepResult;
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === "number") incr("framique_billing_sweep_total", { bucket: key }, value);
    }
    // Freshness gauge: a sweep that stops running is invisible in error ratios.
    setGauge("framique_billing_sweep_timestamp", Math.floor(Date.now() / 1000));
    log("info", "billing.sweep", { ...result });
    return result;
  });
}
