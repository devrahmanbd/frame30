import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/** Notification fan-out: queued merchant notifications and digest rollups. */
export const Route = createFileRoute("/api/public/cron/notifications")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("notifications", async () => {
        const { runNotificationSweep } = await import("@/lib/notifications-cron.server");
        return runNotificationSweep("cron");
      }),
    },
  },
});
