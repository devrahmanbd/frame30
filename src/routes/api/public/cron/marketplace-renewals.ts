import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Scheduled marketplace-install renewals: charges due plugin subscriptions
 * and parks failed charges as past-due. Money moves here, so the registry
 * gives it a one-failure alert threshold like the billing sweep.
 */
export const Route = createFileRoute("/api/public/cron/marketplace-renewals")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("marketplace-renewals", async () => {
        const { runInstallRenewalSweep } = await import(
          "@/lib/billing-cron.server"
        );
        return runInstallRenewalSweep();
      }),
    },
  },
});
