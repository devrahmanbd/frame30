import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/** Courier DLQ replay + stalled-parcel sweep, on the shared cron contract. */
export const Route = createFileRoute("/api/public/cron/couriers")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("couriers", async () => {
        const { runCourierSweep } = await import("@/lib/courier-cron.server");
        return runCourierSweep("cron");
      }),
    },
  },
});
