import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/** Outbound webhook dispatch: retries pending deliveries, ages out dead letters. */
export const Route = createFileRoute("/api/public/cron/webhooks")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("webhooks", async (ctx) => {
        const { dispatchDueWebhooks } = await import("@/lib/webhooks.server");
        return dispatchDueWebhooks(ctx.num("limit", 25, 100));
      }),
    },
  },
});
