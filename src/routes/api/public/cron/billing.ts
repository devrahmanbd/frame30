import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Scheduled billing sweep: invoices due subscriptions, advances dunning and
 * suspends non-payers. Money moves here, so the registry gives it a
 * one-failure alert threshold — the wrapper pages on the first failed run.
 */
export const Route = createFileRoute("/api/public/cron/billing")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("billing", async () => {
        const { runBillingSweep } = await import("@/lib/billing-cron.server");
        return runBillingSweep("cron");
      }),
    },
  },
});
