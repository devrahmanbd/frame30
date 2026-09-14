import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Custom-domain sweep: re-checks DNS for pending domains with per-domain
 * backoff, renews certificates inside the 30-day window, and clears expired
 * ACME challenges.
 */
export const Route = createFileRoute("/api/public/cron/domains")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("domains", async () => {
        const { sweepDomains } = await import("@/lib/domains.server");
        return sweepDomains();
      }),
    },
  },
});
