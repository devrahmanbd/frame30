import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/** Payout worker: advances payout batches, applies holds, reconciles settlements. */
export const Route = createFileRoute("/api/public/cron/payouts")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("payouts", async (ctx) => {
        const { processPayoutQueue } = await import("@/lib/payouts.server");
        const { reconcileSettlementCompletions } =
          await import("@/lib/payments.server");
        const [payouts, settlement] = await Promise.all([
          processPayoutQueue(ctx.num("limit", 20, 100)),
          // Crash-safe compensation: heals paid-row-unpaid-order shapes left
          // by a ledger/order-update failure in the settlement path. Both
          // legs are idempotent, so this is safe alongside live traffic.
          reconcileSettlementCompletions({ limit: 100 }),
        ]);
        return { ...payouts, settlement };
      }),
    },
  },
});
