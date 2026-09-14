import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Queue worker tick (§4.4). Fires due schedules, returns jobs abandoned by
 * crashed workers, then drains each queue within its policy batch size. The
 * drain loop watches the wrapper's remaining budget so a busy queue yields
 * instead of being killed mid-job — the next tick is one minute away.
 */
export const Route = createFileRoute("/api/public/cron/jobs")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("jobs", async (ctx) => {
        const [{ drainQueue, reclaimStalled, runDueSchedules }, { JOB_HANDLERS, WORKER_QUEUES }] =
          await Promise.all([import("@/lib/job-queue.server"), import("@/lib/job-handlers.server")]);

        const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
        const fired = await runDueSchedules();
        const reclaimed = await reclaimStalled();

        const drains: Array<Awaited<ReturnType<typeof drainQueue>>> = [];
        const deferred: string[] = [];
        for (const queue of WORKER_QUEUES) {
          // Keep 5s of headroom so the ledger write always lands.
          if (ctx.remainingMs() < 5_000) {
            deferred.push(queue);
            continue;
          }
          drains.push(await drainQueue(queue, workerId, JOB_HANDLERS));
        }

        return { workerId, schedulesFired: fired, reclaimed, drains, deferred };
      }),
    },
  },
});
