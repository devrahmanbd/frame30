import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Scheduled content-health sweep (§6). Walks every tenant's content graph and
 * verifies external links. `?external=0` runs a cheap structural-only pass when
 * outbound budget is tight; the rate-limit bucket is respected and surfaces as a
 * recorded skip rather than a failure.
 */
export const Route = createFileRoute("/api/public/cron/content-health")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("content-health", async (ctx) => {
        const { enforceRateLimit } = await import("@/lib/rate-limit.server");
        await enforceRateLimit("content.health_sweep", "cron");
        const { runContentHealthSweep } = await import("@/lib/content-health.server");
        return runContentHealthSweep({
          limit: ctx.num("limit", 25, 100),
          checkExternal: ctx.url.searchParams.get("external") !== "0",
        });
      }),
    },
  },
});
