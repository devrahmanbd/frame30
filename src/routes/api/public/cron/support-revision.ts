import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/** Daily Inkling revision pass: scores recent answers, escalates, drafts KB candidates. */
export const Route = createFileRoute("/api/public/cron/support-revision")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("support-revision", async (ctx) => {
        const { runRevisionJob } = await import("@/lib/support-revision.server");
        return runRevisionJob(new Date().toISOString().slice(0, 10), {
          limit: ctx.num("limit", 50, 200),
        });
      }),
    },
  },
});
