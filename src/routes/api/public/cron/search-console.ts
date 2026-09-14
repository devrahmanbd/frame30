import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Scheduled Search Console refresh (§5).
 *
 * The only place in the product that pulls performance data on a schedule, and
 * the only path that may call Google without a human present. The sweep is
 * bounded twice — by merchant count and by the wrapper's wall clock — because a
 * cron invocation must return a result, not run until the platform kills it.
 * Anything it did not reach keeps its elapsed `next_refresh_at` and sorts first
 * on the following tick.
 */
export const Route = createFileRoute("/api/public/cron/search-console")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("search-console", async (ctx) => {
        const { runSearchConsoleSweep } = await import("@/lib/search-console.server");
        return runSearchConsoleSweep({
          limit: ctx.num("limit", 50, 200),
          days: ctx.num("days", 28, 90),
        });
      }),
    },
  },
});
