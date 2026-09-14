import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/** Marketplace sweep: reconciles installs, rolls back bad versions, settles payouts. */
export const Route = createFileRoute("/api/public/cron/themes")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("themes", async () => {
        const { runThemeSweep } = await import("@/lib/themes-cron.server");
        return runThemeSweep("cron");
      }),
    },
  },
});
