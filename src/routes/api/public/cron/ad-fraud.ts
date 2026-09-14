import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Scheduled ad-fraud sweep: rebuilds attribution-integrity rollups for every
 * merchant with recent clicks, expires stale auto-blocks and prunes spent
 * beacon replay keys. A silent cron is the classic way a fraud pipeline rots
 * unnoticed, so the shared wrapper ledgers and alerts on every tick.
 */
export const Route = createFileRoute("/api/public/cron/ad-fraud")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("ad-fraud", async (ctx) => {
        const { addBreadcrumb, incr, setGauge } = await import("@/lib/observability.server");
        const { runAdFraudSweep } = await import("@/lib/ad-fraud.server");
        addBreadcrumb("cron", "ad-fraud sweep started");
        const result = await runAdFraudSweep(ctx.num("limit", 50, 200));

        // Spent beacon nonces have no value past the freshness window.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pruneIdempotency } = await import("@/lib/replay-guard.server");
        const pruned = await pruneIdempotency(supabaseAdmin as never, 24, "ads.click").catch(() => 0);

        incr("framique_ad_cron_rollups_total", {}, result.processed);
        incr("framique_ad_blocklist_expired_total", {}, result.expired);
        setGauge("framique_ad_last_sweep_timestamp", Math.floor(Date.now() / 1000));
        return { ...result, prunedReplayKeys: pruned };
      }),
    },
  },
});
