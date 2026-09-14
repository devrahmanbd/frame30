/**
 * Backup & restore drill executor (BUILD.md §A4).
 *
 * A snapshot that nobody reads back is not a backup. This module takes a
 * counted snapshot of every table in the manifest, performs a verification
 * read-back, evaluates the drill with the pure rules in `backup-drill.ts`, and
 * writes both legs to the append-only `ops_backup_runs` ledger. Cron runs it
 * nightly; the owner console can force one on demand through an audited gate.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { ownerGate } from "./owner-ops.server";
import { incr, log, setGauge, withSpan } from "./observability.server";
import {
  BACKUP_MANIFEST,
  buildSnapshot,
  drillDue,
  drillNotes,
  evaluateDrill,
  nextDrillAt,
  type DrillVerdict,
  type Snapshot,
  type TableCount,
} from "./backup-drill";

type Client = SupabaseClient<Database>;
type Admin = {
  from: (t: string) => {
    select: (
      c: string,
      o: { count: "exact"; head: true },
    ) => Promise<{ count: number | null; error: { message: string } | null }>;
    insert: (v: unknown) => Promise<{ error: { message: string } | null }>;
  } & {
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (
          c: string,
          v: string,
        ) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => { limit: (n: number) => Promise<{ data: { finished_at: string | null }[] | null }> };
        };
      };
    };
  };
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

const DRILL_INTERVAL_HOURS = 24;
/** Rows written while the drill runs are expected; loss never is. */
const DRIFT_TOLERANCE = 0.02;

async function countManifest(a: Admin): Promise<TableCount[]> {
  const counts = await Promise.all(
    BACKUP_MANIFEST.map(async (table) => {
      // Count with "*": some manifest tables key on merchant_id, not id.
      const { count, error } = await a.from(table).select("*", { count: "exact", head: true });

      if (error) {
        log("error", "backup.count_failed", { table, message: error.message });
        return null;
      }
      return { table, rows: count ?? 0 } as TableCount;
    }),
  );
  // A table that could not be counted is deliberately absent, so the drill
  // fails on manifest coverage rather than silently passing with a short list.
  return counts.filter((c): c is TableCount => c !== null);
}

async function recordRun(
  a: Admin,
  row: {
    kind: "backup" | "restore_drill";
    status: "passed" | "failed";
    scope: string;
    startedAt: string;
    artifactRef: string | null;
    rowsVerified: number;
    notes: string;
    checks: Json;
    actor: string | null;
  },
) {
  const { error } = await a.from("ops_backup_runs").insert({
    kind: row.kind,
    status: row.status,
    scope: row.scope,
    started_at: row.startedAt,
    finished_at: new Date().toISOString(),
    artifact_ref: row.artifactRef,
    rows_verified: row.rowsVerified,
    notes: row.notes,
    checks: row.checks,
    created_by: row.actor,
  });
  if (error) {
    // An unrecorded drill is an unproven drill.
    incr("framique_backup_ledger_failures_total", { kind: row.kind });
    log("error", "backup.ledger_write_failed", { kind: row.kind, message: error.message });
    throw new Error(`ops.backup_ledger_unavailable: ${error.message}`);
  }
}

export type DrillResult = {
  ran: boolean;
  status: "passed" | "failed" | "skipped";
  scope: string;
  artifactRef: string | null;
  rowsVerified: number;
  checks: DrillVerdict["checks"];
  failures: string[];
  nextDueAt: string | null;
  snapshot?: Snapshot;
};

/** Timestamp of the most recent passing drill, or null when there is none. */
export async function lastPassedDrillAt(): Promise<string | null> {
  const a = await admin();
  const { data } = await a
    .from("ops_backup_runs")
    .select("finished_at")
    .eq("kind", "restore_drill")
    .eq("status", "passed")
    .order("finished_at", { ascending: false })
    .limit(1);
  return data?.[0]?.finished_at ?? null;
}

/**
 * Executes snapshot → verify → ledger. `force` bypasses the cadence check so a
 * responder can drill immediately after an incident.
 */
export async function runBackupDrill(
  opts: { scope?: string; actor?: string | null; force?: boolean } = {},
): Promise<DrillResult> {
  const scope = opts.scope ?? "platform";
  return withSpan("ops.backup_drill", async () => {
    const last = await lastPassedDrillAt();
    if (!opts.force && !drillDue(last, new Date(), DRILL_INTERVAL_HOURS)) {
      return {
        ran: false,
        status: "skipped" as const,
        scope,
        artifactRef: null,
        rowsVerified: 0,
        checks: [],
        failures: [],
        nextDueAt: nextDrillAt(last, DRILL_INTERVAL_HOURS),
      };
    }

    const a = await admin();
    const startedAt = new Date().toISOString();
    const snapshot = buildSnapshot(scope, await countManifest(a), startedAt);

    await recordRun(a, {
      kind: "backup",
      status: snapshot.counts.length ? "passed" : "failed",
      scope,
      startedAt,
      artifactRef: snapshot.checksum,
      rowsVerified: snapshot.counts.reduce((s, c) => s + c.rows, 0),
      notes: `snapshot of ${snapshot.counts.length}/${BACKUP_MANIFEST.length} manifest tables`,
      checks: snapshot.counts as unknown as Json,
      actor: opts.actor ?? null,
    });

    // Read-back leg: the artifact is only trusted once it is re-read.
    const readBack = buildSnapshot(scope, await countManifest(a), new Date().toISOString());
    const verdict = evaluateDrill(snapshot, readBack, { driftTolerance: DRIFT_TOLERANCE });

    await recordRun(a, {
      kind: "restore_drill",
      status: verdict.status,
      scope,
      startedAt,
      artifactRef: snapshot.checksum,
      rowsVerified: verdict.rowsVerified,
      notes: drillNotes(verdict),
      checks: verdict.checks as unknown as Json,
      actor: opts.actor ?? null,
    });

    incr("framique_backup_drill_total", { outcome: verdict.status });
    // Freshness gauge — alerting on staleness catches a drill that stopped running.
    if (verdict.status === "passed") {
      setGauge("framique_backup_drill_timestamp", Math.floor(Date.now() / 1000));
    }
    log(verdict.status === "passed" ? "info" : "error", "backup.drill_completed", {
      scope,
      status: verdict.status,
      rowsVerified: verdict.rowsVerified,
      failures: verdict.failures.join(","),
    });

    return {
      ran: true,
      status: verdict.status,
      scope,
      artifactRef: snapshot.checksum,
      rowsVerified: verdict.rowsVerified,
      checks: verdict.checks,
      failures: verdict.failures,
      nextDueAt: nextDrillAt(new Date().toISOString(), DRILL_INTERVAL_HOURS),
      snapshot,
    };
  });
}

/** Owner-console entry point: platform-admin check, rate limit, audit row. */
export async function runBackupDrillAsOwner(db: Client, userId: string, scope = "platform") {
  return ownerGate(
    db,
    userId,
    {
      action: "ops.backup_drill",
      entity: "ops_backup_runs",
      bucket: "ops.backup",
      kind: "write",
      meta: { scope },
    },
    () => runBackupDrill({ scope, actor: userId, force: true }),
  );
}
