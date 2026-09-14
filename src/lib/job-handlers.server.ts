/**
 * Job handler registry — §4.4.
 *
 * The queue must not import every feature module (that would drag half the app
 * into any worker), so handlers are registered here and loaded lazily by name.
 * A job whose handler is missing dead-letters instead of silently disappearing.
 */
import type { ClaimedJob, JobHandler } from "./job-queue.server";

export const JOB_HANDLERS: Record<string, JobHandler> = {
  "search.sync": async (job: ClaimedJob) => {
    const { applyIndexOps } = await import("./search-backend.server");
    if (!job.merchantId) throw Object.assign(new Error("missing merchant"), { status: 400 });
    const ops = (job.payload["ops"] as Array<{ documentId: string; op: "upsert" | "delete" }>) ?? [];
    return applyIndexOps(job.merchantId, ops);
  },

  "maintenance.noop": async () => ({ ok: true }),

  "maintenance.reclaim": async () => {
    const { reclaimStalled } = await import("./job-queue.server");
    return { reclaimed: await reclaimStalled() };
  },
};

export const WORKER_QUEUES = [
  "payments",
  "delivery",
  "search-index",
  "notifications",
  "exports",
  "maintenance",
] as const;
