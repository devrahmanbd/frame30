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
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data, error } = await (
      supabaseAdmin as unknown as {
        rpc: (
          fn: string,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("billing_sweep");
    if (error) throw new Error(`billing_sweep_failed: ${error.message}`);

    const result = data as SweepResult;
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === "number")
        incr("framique_billing_sweep_total", { bucket: key }, value);
    }
    // Freshness gauge: a sweep that stops running is invisible in error ratios.
    setGauge("framique_billing_sweep_timestamp", Math.floor(Date.now() / 1000));
    log("info", "billing.sweep", { ...result });
    return result;
  });
}

export type InstallRenewalSweepResult = {
  renewed: number;
  past_due: number;
  skipped: number;
  failed: number;
  /** True when the recurring columns are not migrated yet — nothing was due. */
  degraded: boolean;
  swept_at: string;
};

/**
 * LANE G — daily renewal sweep entry point (function only).
 *
 * Renews every `installed`/`past_due` install whose renews_at has passed, one
 * row at a time with per-row failure isolation (a failed charge parks that
 * row on `past_due` inside processInstallRenewal; an unexpected throw counts
 * `failed` and the sweep continues). Pre-migration DBs return
 * `{ degraded: true }` with zero counts instead of throwing.
 *
 * NOTE (registry wiring, NOT done here): `src/lib/cron-registry.ts` and the
 * route handlers under `src/routes/api/public/cron/` are outside this lane's
 * owned files, so this function is not yet scheduled. To wire it: add a
 * `marketplace-renewals` entry to CRON_JOBS (daily, e.g. `30 2 * * *`) and a
 * route that calls `runInstallRenewalSweep()`. See the RETURN report.
 */
export async function runInstallRenewalSweep(
  options: {
    db?: unknown;
    nowMs?: number;
    limit?: number;
    subject?: string;
  } = {},
): Promise<InstallRenewalSweepResult> {
  return withSpan("billing.install_renewal_sweep", async () => {
    await enforceRateLimit("billing.sweep", options.subject ?? "cron");
    const { processInstallRenewal, isMissingRecurringColumnError } =
      await import("./marketplace-install.server");
    const nowMs = options.nowMs ?? Date.now();
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    let db: {
      from: (
        t: string,
      ) => {
        select: (c: string) => {
          in: (
            c: string,
            v: string[],
          ) => {
            lte: (
              c: string,
              v: string,
            ) => {
              limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
            };
          };
        };
      };
    };
    if (options.db) {
      db = options.db as typeof db;
    } else {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      db = supabaseAdmin as unknown as typeof db;
    }
    const result: InstallRenewalSweepResult = {
      renewed: 0,
      past_due: 0,
      skipped: 0,
      failed: 0,
      degraded: false,
      swept_at: new Date(nowMs).toISOString(),
    };
    let due: { id: string; merchant_id: string }[];
    try {
      const { data, error } = await db
        .from("marketplace_installs")
        .select("id, merchant_id")
        .in("status", ["installed", "past_due"])
        .lte("renews_at", new Date(nowMs).toISOString())
        .limit(limit);
      if (error) throw error;
      due = ((data ?? []) as { id: string; merchant_id: string }[]).map(
        (r) => ({ id: r.id, merchant_id: r.merchant_id }),
      );
    } catch (err) {
      if (!isMissingRecurringColumnError(err))
        throw new Error("install_renewal_sweep_failed");
      result.degraded = true;
      log("warn", "billing.install_renewal_degraded", {});
      return result;
    }
    for (const row of due) {
      try {
        const verdict = await processInstallRenewal(
          db as unknown as Parameters<typeof processInstallRenewal>[0],
          row.merchant_id,
          row.id,
          { nowMs },
        );
        if (verdict.renewed) result.renewed += 1;
        else if (verdict.reason === "past_due") result.past_due += 1;
        else result.skipped += 1;
        incr("framique_install_renewal_total", {
          outcome: verdict.renewed ? "renewed" : verdict.reason,
        });
      } catch {
        result.failed += 1;
        incr("framique_install_renewal_total", { outcome: "failed" });
      }
    }
    log("info", "billing.install_renewal_sweep", { ...result });
    return result;
  });
}
