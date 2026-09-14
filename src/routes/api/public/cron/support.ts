import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/** Support SLA sweep: escalates unanswered conversations, closes resolved ones. */
export const Route = createFileRoute("/api/public/cron/support")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("support", async () => {
        const { runSupportSweep } = await import("@/lib/support-cron.server");
        return runSupportSweep("cron");
      }),
    },
  },
});
