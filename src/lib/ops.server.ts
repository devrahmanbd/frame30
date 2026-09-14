/**
 * Platform operations desk (§2.9): unified dead-letter queue, backup and
 * restore-drill ledger, retention sweeps, and the incident/status pipeline.
 *
 * Every owner surface goes through `ownerGate` (platform-admin check, rate
 * limit, Prometheus counter, span, append-only audit row). The public status
 * snapshot is the one unauthenticated read and it comes from a security-definer
 * RPC that only exposes public incidents.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ownerGate, OwnerError } from "./owner-ops.server";
import { incr, log, withSpan } from "./observability.server";
import { cached, invalidate } from "./cache.server";
import {
  canTransition,
  dlqSummary,
  type ComponentState,
  type DeadLetter,
  type IncidentStatus,
} from "./ops";

type Client = SupabaseClient<Database>;

export type BackupRunRow = {
  id: string;
  kind: string;
  status: string;
  scope: string;
  started_at: string;
  finished_at: string | null;
  rows_verified: number;
  artifact_ref: string | null;
  notes: string | null;
};
export type RetentionRunRow = {
  id: string;
  table_name: string;
  cutoff: string;
  deleted_rows: number;
  ran_at: string;
};
export type IncidentRow = {
  id: string;
  title: string;
  severity: string;
  status: IncidentStatus;
  components: string[];
  is_public: boolean;
  started_at: string;
  resolved_at: string | null;
};
export type ComponentRow = { key: string; label: string; state: ComponentState; position: number };
export type IncidentUpdateRow = {
  id: string;
  incident_id: string;
  status: string;
  body: string;
  created_at: string;
};
export type StatusIncident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  components: string[];
  started_at: string;
  resolved_at: string | null;
  updates: { status: string; body: string; created_at: string }[];
};
type Admin = { from: Client["from"]; rpc: Client["rpc"] };

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

// --------------------------------------------------------------- dead letters

/**
 * Reads both webhook pipelines (payments + courier) into one triage list.
 * Column names differ per table, so normalisation happens here once.
 */
export async function loadDeadLetters(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    { action: "ops.dlq_read", entity: "dead_letters", bucket: "ops.read", kind: "read" },
    async () => {
      const a = await admin();
      const [payments, couriers, merchants] = await Promise.all([
        a
          .from("webhook_events")
          .select("id, provider, merchant_id, status, reason, redelivery_count, received_at")
          .eq("status", "dead_letter")
          .order("received_at", { ascending: false })
          .limit(100),
        a
          .from("courier_webhook_events")
          .select("id, carrier_code, merchant_id, status, reason, attempts, received_at")
          .eq("status", "dead_letter")
          .order("received_at", { ascending: false })
          .limit(100),
        a.from("merchants").select("id, name"),
      ]);
      const names = new Map(((merchants.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));

      const items: DeadLetter[] = [
        ...((payments.data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: String(r["id"]),
          source: "payments" as const,
          provider: String(r["provider"] ?? "unknown"),
          merchantId: (r["merchant_id"] as string | null) ?? null,
          merchantName: r["merchant_id"] ? (names.get(String(r["merchant_id"])) ?? null) : null,
          reason: (r["reason"] as string | null) ?? null,
          status: String(r["status"]),
          attempts: Number(r["redelivery_count"] ?? 0),
          receivedAt: String(r["received_at"]),
        })),
        ...((couriers.data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: String(r["id"]),
          source: "courier" as const,
          provider: String(r["carrier_code"] ?? "unknown"),
          merchantId: (r["merchant_id"] as string | null) ?? null,
          merchantName: r["merchant_id"] ? (names.get(String(r["merchant_id"])) ?? null) : null,
          reason: (r["reason"] as string | null) ?? null,
          status: String(r["status"]),
          attempts: Number(r["attempts"] ?? 0),
          receivedAt: String(r["received_at"]),
        })),
      ].sort((x, y) => (x.receivedAt > y.receivedAt ? -1 : 1));

      const summary = dlqSummary(items);
      incr("framique_ops_dlq_depth_reads_total");
      for (const [severity, count] of Object.entries(summary.bySeverity)) {
        incr("framique_ops_dlq_items", { severity }, 0);
        if (count) incr("framique_ops_dlq_items", { severity }, count);
      }
      return { items, summary };
    },
  );
}

/** Replays one dead letter through its owning pipeline. Idempotent per event. */
export async function replayDeadLetter(
  db: Client,
  userId: string,
  input: { id: string; source: "payments" | "courier" },
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ops.dlq_replay",
      entity: "dead_letters",
      entityId: input.id,
      bucket: "ops.replay",
      kind: "write",
      meta: { source: input.source },
    },
    async () => {
      if (input.source === "payments") {
        const { retryGatewayEvent } = await import("./gateway.server");
        const out = await retryGatewayEvent(db, userId, input.id);
        incr("framique_ops_dlq_replay_total", {
          source: "payments",
          outcome: out.ok ? "processed" : "failed",
        });
        return { ok: out.ok, outcome: out.status, reason: out.reason };
      }
      const a = await admin();
      const { data: row } = await a
        .from("courier_webhook_events")
        .select("id, merchant_id")
        .eq("id", input.id)
        .maybeSingle();
      const merchantId = (row as { merchant_id?: string } | null)?.merchant_id;
      if (!merchantId) throw new OwnerError("ops.event_not_found", "Courier event not found");
      const { data, error } = await a.rpc("courier_replay_event", {
        _id: input.id,
        _merchant_id: merchantId,
      });
      if (error) throw new OwnerError("ops.replay_failed", error.message);
      const result = (data ?? {}) as { outcome?: string; reason?: string };
      incr("framique_ops_dlq_replay_total", {
        source: "courier",
        outcome: result.outcome ?? "unknown",
      });
      return {
        ok: result.outcome === "processed",
        outcome: result.outcome ?? "unknown",
        reason: result.reason ?? null,
      };
    },
  );
}

// --------------------------------------------------------------- reliability

export async function loadReliability(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    { action: "ops.reliability_read", entity: "ops", bucket: "ops.read", kind: "read" },
    async () => {
      const a = await admin();
      const [backups, retention] = await Promise.all([
        a
          .from("ops_backup_runs")
          .select("id, kind, status, scope, started_at, finished_at, rows_verified, artifact_ref, notes")
          .order("started_at", { ascending: false })
          .limit(30),
        a
          .from("ops_retention_runs")
          .select("id, table_name, cutoff, deleted_rows, ran_at")
          .order("ran_at", { ascending: false })
          .limit(30),
      ]);
      return {
        backups: (backups.data ?? []) as unknown as BackupRunRow[],
        retention: (retention.data ?? []) as unknown as RetentionRunRow[],
      };
    },
  );
}

/**
 * Records a backup or restore drill. A drill counts as `passed` only when the
 * responder confirms row counts were verified after restore — an untested
 * backup is not a backup.
 */
export async function recordBackupRun(
  db: Client,
  userId: string,
  input: {
    kind: "backup" | "restore_drill";
    status: "running" | "passed" | "failed";
    scope?: string;
    artifactRef?: string | null;
    rowsVerified?: number;
    notes?: string | null;
  },
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ops.backup_record",
      entity: "ops_backup_runs",
      bucket: "ops.backup",
      kind: "write",
      meta: { kind: input.kind, status: input.status },
    },
    async () => {
      if (input.kind === "restore_drill" && input.status === "passed" && !(input.rowsVerified ?? 0)) {
        throw new OwnerError("ops.drill_unverified", "A passed restore drill needs verified rows");
      }
      const a = await admin();
      const { data, error } = await a
        .from("ops_backup_runs")
        .insert({
          kind: input.kind,
          status: input.status,
          scope: input.scope ?? "full",
          artifact_ref: input.artifactRef ?? null,
          rows_verified: Math.max(0, Math.trunc(input.rowsVerified ?? 0)),
          notes: input.notes ?? null,
          created_by: userId,
          finished_at: input.status === "running" ? null : new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      if (error) throw new OwnerError("ops.backup_write_failed", error.message);
      incr("framique_ops_backup_total", { kind: input.kind, status: input.status });
      return { id: (data as { id: string }).id };
    },
  );
}

/** Retention sweep. Callable by the owner console and by the ops cron route. */
export async function runRetentionSweep(actor: string) {
  return withSpan("ops.retention_sweep", async () => {
    const a = await admin();
    const { data, error } = await a.rpc("ops_retention_sweep");
    if (error) throw new OwnerError("ops.retention_failed", error.message);
    const swept = ((data as { swept?: { table: string; deleted: number }[] })?.swept ?? []) as {
      table: string;
      deleted: number;
    }[];
    for (const row of swept) {
      incr("framique_ops_retention_deleted_total", { table: row.table }, Number(row.deleted ?? 0));
    }
    log("info", "ops.retention_swept", { actor, tables: swept.length });
    return { swept };
  });
}

export async function requestRetentionSweep(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    { action: "ops.retention_sweep", entity: "ops_retention_runs", bucket: "ops.backup", kind: "write" },
    () => runRetentionSweep(userId),
  );
}

// --------------------------------------------------------------- incidents

export async function loadIncidents(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    { action: "ops.incident_read", entity: "ops_incidents", bucket: "ops.read", kind: "read" },
    async () => {
      const a = await admin();
      const [incidents, components, updates] = await Promise.all([
        a
          .from("ops_incidents")
          .select("id, title, severity, status, components, is_public, started_at, resolved_at")
          .order("started_at", { ascending: false })
          .limit(50),
        a.from("ops_status_components").select("key, label, state, position").order("position"),
        a
          .from("ops_incident_updates")
          .select("id, incident_id, status, body, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      return {
        incidents: (incidents.data ?? []) as unknown as IncidentRow[],
        components: (components.data ?? []) as unknown as ComponentRow[],
        updates: (updates.data ?? []) as unknown as IncidentUpdateRow[],
      };
    },
  );
}

export async function openIncident(
  db: Client,
  userId: string,
  input: {
    title: string;
    severity: "minor" | "major" | "critical";
    components: string[];
    isPublic: boolean;
    body: string;
  },
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ops.incident_open",
      entity: "ops_incidents",
      bucket: "ops.incident",
      kind: "write",
      meta: { severity: input.severity },
    },
    async () => {
      const title = input.title.trim().slice(0, 160);
      const body = input.body.trim().slice(0, 4000);
      if (title.length < 4) throw new OwnerError("ops.title_required", "Incident title is too short");
      if (body.length < 4) throw new OwnerError("ops.body_required", "First update is required");
      const a = await admin();
      const { data, error } = await a
        .from("ops_incidents")
        .insert({
          title,
          severity: input.severity,
          components: input.components.slice(0, 10),
          is_public: input.isPublic,
          created_by: userId,
        } as never)
        .select("id")
        .single();
      if (error) throw new OwnerError("ops.incident_write_failed", error.message);
      const id = (data as { id: string }).id;
      await a
        .from("ops_incident_updates")
        .insert({ incident_id: id, status: "investigating", body, created_by: userId } as never);
      incr("framique_ops_incident_total", { severity: input.severity, action: "open" });
      invalidate("ops.status");
      return { id };
    },
  );
}

/** Posts a timeline update and advances the lifecycle. Forward-only. */
export async function postIncidentUpdate(
  db: Client,
  userId: string,
  input: { id: string; status: IncidentStatus; body: string },
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ops.incident_update",
      entity: "ops_incidents",
      entityId: input.id,
      bucket: "ops.incident",
      kind: "write",
      meta: { status: input.status },
    },
    async () => {
      const body = input.body.trim().slice(0, 4000);
      if (body.length < 4) throw new OwnerError("ops.body_required", "Update text is required");
      const a = await admin();
      const { data: current } = await a
        .from("ops_incidents")
        .select("status")
        .eq("id", input.id)
        .maybeSingle();
      const from = (current as { status?: IncidentStatus } | null)?.status;
      if (!from) throw new OwnerError("ops.incident_not_found", "Incident not found");
      if (from !== input.status && !canTransition(from, input.status)) {
        throw new OwnerError("ops.invalid_transition", `Cannot move ${from} to ${input.status}`);
      }
      await a
        .from("ops_incident_updates")
        .insert({ incident_id: input.id, status: input.status, body, created_by: userId } as never);
      const patch: Record<string, unknown> = {
        status: input.status,
        updated_at: new Date().toISOString(),
      };
      if (input.status === "resolved") patch["resolved_at"] = new Date().toISOString();
      const { error } = await a.from("ops_incidents").update(patch as never).eq("id", input.id);
      if (error) throw new OwnerError("ops.incident_write_failed", error.message);
      incr("framique_ops_incident_total", { severity: "n/a", action: input.status });
      invalidate("ops.status");
      return { ok: true };
    },
  );
}

export async function setComponentState(
  db: Client,
  userId: string,
  input: { key: string; state: ComponentState },
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ops.component_state",
      entity: "ops_status_components",
      entityId: input.key,
      bucket: "ops.incident",
      kind: "write",
      meta: { state: input.state },
    },
    async () => {
      const a = await admin();
      const { error } = await a
        .from("ops_status_components")
        .update({ state: input.state, updated_at: new Date().toISOString() } as never)
        .eq("key", input.key);
      if (error) throw new OwnerError("ops.component_write_failed", error.message);
      incr("framique_ops_component_state_total", { state: input.state });
      invalidate("ops.status");
      return { ok: true };
    },
  );
}

/** Public status snapshot. Cached briefly so an outage cannot be a load test. */
export async function publicStatus() {
  return cached("ops.status", 30_000, async () => {
    const a = await admin();
    const { data, error } = await a.rpc("ops_status_public");
    if (error) {
      log("warn", "ops.status_unavailable", { message: error.message });
      return { components: [], incidents: [] } as {
        components: { key: string; label: string; state: ComponentState }[];
        incidents: StatusIncident[];
      };
    }
    return (data ?? { components: [], incidents: [] }) as unknown as {
      components: { key: string; label: string; state: ComponentState }[];
      incidents: StatusIncident[];
    };
  });
}
