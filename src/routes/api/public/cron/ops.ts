import { createFileRoute } from "@tanstack/react-router";
import { cronGet, cronPost } from "@/lib/cron-endpoint.server";

/**
 * Nightly reliability sweep — the job that keeps the other fifteen honest (§9.3).
 *
 * Order matters:
 *   1. `syncRegistry` makes the ledger match the code (new jobs, retuned budgets).
 *   2. `reapStaleLeases` releases leases whose runner died, so a crashed worker
 *      cannot wedge a job forever.
 *   3. Retention sweep, then the backup drill — a snapshot plus a verified
 *      read-back, because an untested backup is not a backup. The drill is only
 *      re-run once the published freshness window has elapsed, so a nightly tick
 *      does not burn the database every 24h when the objective is 30 days.
 *   4. `refreshComponentHealth` derives the public status page from real signals.
 *   5. `watchFleet` pages for jobs that have gone quiet — the failure mode a
 *      per-run alert can never see, because a job that never runs never fails.
 */
export const Route = createFileRoute("/api/public/cron/ops")({
  server: {
    handlers: {
      GET: cronGet,
      POST: cronPost("ops", async (ctx) => {
        const [{ syncRegistry, reapStaleLeases, watchFleet }, { runRetentionSweep }] =
          await Promise.all([import("@/lib/cron-ops.server"), import("@/lib/ops.server")]);

        const registry = await syncRegistry();
        const leases = await reapStaleLeases();
        const retention = await runRetentionSweep("cron");

        const { lastPassedDrillAt, runBackupDrill } = await import("@/lib/backup-drill.server");
        const { OPS_OBJECTIVES } = await import("@/lib/cron-registry");
        const lastDrill = await lastPassedDrillAt();
        const drillDue =
          ctx.url.searchParams.get("drill") === "1" ||
          !lastDrill ||
          Date.now() - new Date(lastDrill).getTime() >
            (OPS_OBJECTIVES.drillMaxAgeDays / 2) * 86_400_000;
        const drill = drillDue ? await runBackupDrill({ scope: "platform", actor: null }) : null;

        const { refreshComponentHealth } = await import("@/lib/status-health.server");
        const status = await refreshComponentHealth();
        const fleet = await watchFleet();

        // A failed drill is a data-safety event: fail the run so it alerts.
        if (drill && drill.status === "failed") {
          throw new Error("backup drill failed verification");
        }

        return {
          registrySynced: registry.inserted.length + registry.updated.length,
          registryOrphans: registry.orphaned.length,
          leasesReaped: leases.reaped,
          retentionTables: retention.swept.length,
          drillRan: Boolean(drill),
          drillStatus: drill?.status ?? "skipped",
          lastDrillAt: lastDrill,
          statusChanged: status.changed,
          jobsNeedingAttention: fleet.attention.length,
          alerted: fleet.alerted.length,
        };
      }),
    },
  },
});
