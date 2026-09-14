import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Scheduled analytics sweep: flushes the buffered raw window into daily
 * rollups, rebuilds cohorts, drains the ad-conversion outbox and runs due
 * scheduled reports. Auth, leasing, timeout, ledger, metrics and alerting all
 * come from the shared cron wrapper (§9.3) — the job body only does the work.
 */
export const Route = createFileRoute("/api/public/cron/analytics")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("analytics", async (ctx) => {
        const { runAnalyticsSweep } = await import("@/lib/analytics-warehouse.server");
        return runAnalyticsSweep(ctx.num("limit", 50, 200));
      }),
    },
  },
});
