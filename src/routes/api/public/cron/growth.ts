import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Growth automations: loyalty maturation, abandoned-cart recovery and virtual
 * delivery. Growth runs first so commissions matured this tick are visible
 * before the delivery worker reports on the same window.
 */
export const Route = createFileRoute("/api/public/cron/growth")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("growth", async () => {
        const [{ runGrowthSweep }, { runVirtualSweep }] = await Promise.all([
          import("@/lib/loyalty.server"),
          import("@/lib/virtual-delivery.server"),
        ]);
        const growth = await runGrowthSweep();
        const virtual = await runVirtualSweep();
        return { growth, virtual };
      }),
    },
  },
});
