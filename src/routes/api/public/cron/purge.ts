import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Data purge: executes honoured erasure requests and expires soft-deleted
 * rows. Batches stay small on purpose — a purge is irreversible, so each tick
 * does a little and the ledger records exactly how much.
 */
export const Route = createFileRoute("/api/public/cron/purge")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("purge", async (ctx) => {
        const { runDuePurges } = await import("@/lib/tenancy.server");
        return runDuePurges(ctx.num("limit", 5, 25));
      }),
    },
  },
});
