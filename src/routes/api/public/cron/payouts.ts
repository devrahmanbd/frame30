import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/** Payout worker: advances payout batches, applies holds, reconciles settlements. */
export const Route = createFileRoute("/api/public/cron/payouts")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("payouts", async (ctx) => {
        const { processPayoutQueue } = await import("@/lib/payouts.server");
        return processPayoutQueue(ctx.num("limit", 20, 100));
      }),
    },
  },
});
