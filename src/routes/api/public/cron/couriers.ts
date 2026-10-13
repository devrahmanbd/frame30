import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/** Courier DLQ replay + stalled-parcel sweep, on the shared cron contract. */
export const Route = createFileRoute("/api/public/cron/couriers")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("couriers", async () => {
        const { runCourierSweep } = await import("@/lib/courier-cron.server");
        const { dlqDepthAlert, retryNullAwbShipments } =
          await import("@/lib/courier.server");
        const [sweep, dlq, awb] = await Promise.all([
          runCourierSweep("cron"),
          // Loud DLQ-depth signal: unmatched-AWB parks no longer sit silent.
          dlqDepthAlert({}),
          // Null-AWB backlog drains without staff clicks; poisoned carriers
          // are counted per shipment, never thrown.
          retryNullAwbShipments({ limit: 50 }),
        ]);
        return { ...sweep, dlq, awb };
      }),
    },
  },
});
