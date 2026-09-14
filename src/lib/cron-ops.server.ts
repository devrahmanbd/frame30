/**
 * Owner-side scheduler operations (§9.3).
 *
 * The run desk answers one question an operator asks at 3am: *is anything not
 * running, and what happened last time it did?* To answer honestly it joins the
 * static registry with the live ledger, so a job that never received a single
 * invocation is as visible as one that failed loudly.
 *
 * Everything reachable from the console goes through `ownerGate`
 * (platform-admin check, rate limit, metric, span, append-only audit row).
 * `syncRegistry`, `reapStaleLeases` and `evaluateFleet` are also called by the
 * nightly ops job, so the desk is correct even if nobody opens it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ownerGate, OwnerError } from "./owner-ops.server";
import { incr, log, withSpan } from "./observability.server";
import {
  CRON_JOBS,
  alertForJob,
  classifyJob,
  cronJob,
  isUnhealthy,
  nextRunAfter,
  renderCrontab,
  renderGithubWorkflow,
  renderPgCron,
  summarizeFleet,
  type CronJobState,
  type CronJobView,
} from "./cron-registry";

type Client = SupabaseClient<Database>;
type Admin = {
  from: (table: string) => ReturnType<Client["from"]>;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

/** Ledger stats are deliberately scalar-only: the RPC boundary is serialisable. */
export type CronRunStats = Record<string, string | number | boolean | null>;

export type CronRunRow = {
  id: string;
  job_key: string;
  status: string;
  trigger: string;
  attempt: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  stats: CronRunStats | null;
};

function stateFromRow(row: Record<string, unknown>): CronJobState {
  return {
    key: String(row["key"]),
    enabled: Boolean(row["enabled"]),
    lastRunAt: (row["last_run_at"] as string | null) ?? null,
    lastSuccessAt: (row["last_success_at"] as string | null) ?? null,
    lastStatus: (row["last_status"] as string | null) ?? null,
    lastDurationMs: row["last_duration_ms"] === null ? null : Number(row["last_duration_ms"]),
    lastError: (row["last_error"] as string | null) ?? null,
    consecutiveFailures: Number(row["consecutive_failures"] ?? 0),
    totalRuns: Number(row["total_runs"] ?? 0),
    totalFailures: Number(row["total_failures"] ?? 0),
    nextRunAt: (row["next_run_at"] as string | null) ?? null,
    leaseExpiresAt: (row["lease_expires_at"] as string | null) ?? null,
  };
}

/**
 * Makes the database match the code. New jobs are inserted, renamed labels and
 * retuned budgets are updated, and rows whose handler was deleted are reported
 * (never silently dropped — their run history is the evidence they existed).
 */
export async function syncRegistry(): Promise<{
  inserted: string[];
  updated: string[];
  orphaned: string[];
}> {
  return withSpan("cron.sync_registry", async () => {
    const a = await admin();
    const { data, error } = await a.from("ops_cron_jobs").select("key, schedule, enabled");
    if (error) throw new OwnerError("cron.registry_unreadable", String((error as Error).message));
    const existing = new Map(
      ((data ?? []) as Record<string, unknown>[]).map((r) => [String(r["key"]), r]),
    );
    const inserted: string[] = [];
    const updated: string[] = [];

    for (const job of CRON_JOBS) {
      const next = nextRunAfter(job.schedule, new Date());
      const payload = {
        key: job.key,
        label: job.label,
        description: job.description,
        schedule: job.schedule,
        timezone: job.timezone,
        timeout_ms: job.timeoutMs,
        sla_max_duration_ms: job.slaMaxDurationMs,
        alert_after_failures: job.alertAfterFailures,
        max_overdue_seconds: job.maxOverdueSeconds,
        next_run_at: next ? next.toISOString() : null,
      };
      if (existing.has(job.key)) {
        // `enabled` and `paused_reason` are operator state, never overwritten by a deploy.
        const { error: upErr } = await a
          .from("ops_cron_jobs")
          .update(payload as never)
          .eq("key", job.key);
        if (upErr) log("error", "cron.registry_update_failed", { job: job.key });
        else updated.push(job.key);
      } else {
        const { error: insErr } = await a.from("ops_cron_jobs").insert(payload as never);
        if (insErr) log("error", "cron.registry_insert_failed", { job: job.key });
        else inserted.push(job.key);
      }
    }

    const known = new Set(CRON_JOBS.map((j) => j.key));
    const orphaned = [...existing.keys()].filter((k) => !known.has(k));
    if (orphaned.length) log("warn", "cron.registry_orphans", { keys: orphaned.join(",") });
    incr("framique_cron_registry_sync_total", { outcome: "ok" });
    return { inserted, updated, orphaned };
  });
}

/** Releases leases held by runners that died mid-flight. */
export async function reapStaleLeases() {
  const a = await admin();
  const { data, error } = await a.rpc("ops_cron_reap_stale");
  if (error) {
    log("error", "cron.reap_failed", { message: String((error as Error).message) });
    return { reaped: 0 };
  }
  const reaped = Number((data as { reaped?: number } | null)?.reaped ?? 0);
  if (reaped) incr("framique_cron_reaped_total", {}, reaped);
  return { reaped };
}

/** Registry ∪ ledger, classified. The single source of truth for fleet health. */
export async function evaluateFleet(now = new Date()): Promise<CronJobView[]> {
  const a = await admin();
  const { data } = await a
    .from("ops_cron_jobs")
    .select(
      "key, enabled, last_run_at, last_success_at, last_status, last_duration_ms, last_error, consecutive_failures, total_runs, total_failures, next_run_at, lease_expires_at",
    );
  const states = new Map(
    ((data ?? []) as Record<string, unknown>[]).map((r) => [String(r["key"]), stateFromRow(r)]),
  );
  return CRON_JOBS.map((job) => classifyJob(job, states.get(job.key) ?? null, now));
}

/**
 * Scheduled watchdog. Called by the nightly ops job: pages for jobs that have
 * gone quiet, which is the failure the per-run alert path cannot see (a job that
 * never runs never fails).
 */
export async function watchFleet() {
  const views = await evaluateFleet();
  const summary = summarizeFleet(views);
  const alerted: string[] = [];
  const { emitAlert } = await import("./ops-alerts.server");
  for (const view of views) {
    const intent = alertForJob(view);
    if (!intent) continue;
    const out = await emitAlert(intent);
    if (out.delivered) alerted.push(view.definition.key);
  }
  for (const view of views) {
    incr("framique_cron_health", { job: view.definition.key, health: view.health }, 0);
  }
  log("info", "cron.fleet_evaluated", {
    total: summary.total,
    attention: summary.attention,
    alerted: alerted.length,
  });
  return {
    summary,
    alerted,
    attention: views.filter((v) => isUnhealthy(v.health)).map((v) => ({
      key: v.definition.key,
      health: v.health,
      overdueSeconds: v.overdueSeconds,
      reasons: v.reasons,
    })),
  };
}

// ------------------------------------------------------------- owner surfaces

export type CronDesk = {
  jobs: CronJobView[];
  summary: ReturnType<typeof summarizeFleet>;
  runs: CronRunRow[];
  alerts: Awaited<ReturnType<typeof import("./ops-alerts.server").loadAlertHistory>>;
  channels: { key: string; label: string; kind: string; minSeverity: string; configured: boolean }[];
  objectives: typeof import("./cron-registry").OPS_OBJECTIVES;
  lastDrillAt: string | null;
  drillStale: boolean;
  schedulerConfigured: boolean;
};

export async function loadCronDesk(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    { action: "cron.desk_read", entity: "ops_cron_jobs", bucket: "ops.read", kind: "read" },
    async (): Promise<CronDesk> => {
      const a = await admin();
      const [views, runsRes, alerts, channels, drillAt] = await Promise.all([
        evaluateFleet(),
        a
          .from("ops_cron_runs")
          .select(
            "id, job_key, status, trigger, attempt, started_at, finished_at, duration_ms, http_status, error_code, error_message, stats",
          )
          .order("started_at", { ascending: false })
          .limit(120),
        import("./ops-alerts.server").then((m) => m.loadAlertHistory(40)),
        import("./ops-alerts.server").then((m) => m.loadAlertChannels()),
        import("./backup-drill.server").then((m) => m.lastPassedDrillAt()),
      ]);
      const { OPS_OBJECTIVES } = await import("./cron-registry");
      const drillStale =
        !drillAt ||
        Date.now() - new Date(drillAt).getTime() > OPS_OBJECTIVES.drillMaxAgeDays * 86_400_000;
      return {
        jobs: views,
        summary: summarizeFleet(views),
        runs: (runsRes.data ?? []) as unknown as CronRunRow[],
        alerts,
        channels: channels.map((c) => ({
          key: c.key,
          label: c.label,
          kind: c.kind,
          minSeverity: c.minSeverity,
          configured: Boolean(c.target),
        })),
        objectives: OPS_OBJECTIVES,
        lastDrillAt: drillAt,
        drillStale,
        schedulerConfigured: Boolean(process.env["BILLING_CRON_SECRET"]),
      };
    },
  );
}

/** Pause or resume a job. A pause requires a reason: silent pauses cause outages. */
export async function setCronJobEnabled(
  db: Client,
  userId: string,
  input: { key: string; enabled: boolean; reason?: string | null },
) {
  return ownerGate(
    db,
    userId,
    {
      action: input.enabled ? "cron.resume" : "cron.pause",
      entity: "ops_cron_jobs",
      entityId: input.key,
      bucket: "ops.backup",
      kind: "write",
      meta: { key: input.key, reason: input.reason ?? null },
    },
    async () => {
      const job = cronJob(input.key);
      if (!job) throw new OwnerError("cron.unknown_job", "No such scheduled job");
      const reason = (input.reason ?? "").trim().slice(0, 300);
      if (!input.enabled && reason.length < 4) {
        throw new OwnerError("cron.reason_required", "Pausing a job requires a reason");
      }
      const a = await admin();
      const { error } = await a
        .from("ops_cron_jobs")
        .update({
          enabled: input.enabled,
          paused_reason: input.enabled ? null : reason,
        } as never)
        .eq("key", input.key);
      if (error) throw new OwnerError("cron.toggle_failed", String((error as Error).message));
      incr("framique_cron_toggle_total", { job: input.key, enabled: String(input.enabled) });
      log("warn", "cron.toggled", { job: input.key, enabled: input.enabled, actor: userId });
      return { key: input.key, enabled: input.enabled };
    },
  );
}

/**
 * Runs a job now, through its real HTTP endpoint.
 *
 * Invoking the endpoint rather than the underlying function is deliberate: a
 * manual run must exercise authorisation, leasing, timeout and ledgering
 * exactly as the scheduler does, otherwise "it works when I click it" proves
 * nothing about the schedule.
 */
export async function triggerCronJob(db: Client, userId: string, key: string) {
  return ownerGate(
    db,
    userId,
    {
      action: "cron.trigger",
      entity: "ops_cron_jobs",
      entityId: key,
      bucket: "ops.replay",
      kind: "write",
      meta: { key },
    },
    async () => {
      const job = cronJob(key);
      if (!job) throw new OwnerError("cron.unknown_job", "No such scheduled job");
      const secret = process.env["BILLING_CRON_SECRET"];
      if (!secret) {
        throw new OwnerError(
          "cron.secret_missing",
          "No scheduler secret is configured, so jobs cannot be invoked",
        );
      }
      const base = (
        process.env["PUBLIC_SITE_URL"] ??
        process.env["SITE_URL"] ??
        "http://localhost:8080"
      ).replace(/\/$/, "");
      const qs = new URLSearchParams(job.query ?? "");
      qs.set("trigger", "manual");
      const url = `${base}/api/public/cron/${job.key}?${qs.toString()}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), job.timeoutMs + 5_000);
      const started = Date.now();
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}`, "user-agent": "framique-owner-console/1" },
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        incr("framique_cron_manual_total", { job: key, outcome: res.ok ? "ok" : "failed" });
        return {
          ok: res.ok,
          httpStatus: res.status,
          runId: res.headers.get("x-cron-run-id"),
          durationMs: Date.now() - started,
          skipped: Boolean(body["skipped"]),
          reason: (body["reason"] as string | undefined) ?? null,
        };
      } catch (err) {
        incr("framique_cron_manual_total", { job: key, outcome: "unreachable" });
        throw new OwnerError(
          "cron.trigger_failed",
          (err as Error)?.name === "AbortError"
            ? "The job did not answer inside its timeout"
            : "The scheduled endpoint could not be reached",
        );
      } finally {
        clearTimeout(timer);
      }
    },
  );
}

/** Generates the schedule files an operator installs, from the registry. */
export async function exportSchedules(
  db: Client,
  userId: string,
  format: "crontab" | "github" | "pgcron",
) {
  return ownerGate(
    db,
    userId,
    { action: "cron.export", entity: "ops_cron_jobs", bucket: "ops.read", kind: "read", meta: { format } },
    async () => {
      const base = (
        process.env["PUBLIC_SITE_URL"] ??
        process.env["SITE_URL"] ??
        "https://app.framique.com"
      ).replace(/\/$/, "");
      const target = { baseUrl: base, secretRef: "FRAMIQUE_CRON_SECRET" };
      const content =
        format === "crontab"
          ? renderCrontab(target)
          : format === "github"
            ? renderGithubWorkflow(target)
            : renderPgCron(target);
      return { format, baseUrl: base, content };
    },
  );
}

/** Fires the synthetic alert drill and returns the per-channel outcome. */
export async function testAlerting(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    { action: "ops.alert_test", entity: "ops_alert_channels", bucket: "ops.incident", kind: "write" },
    async () => {
      const { sendSyntheticAlert } = await import("./ops-alerts.server");
      const out = await sendSyntheticAlert(userId);
      if (!out.delivered) {
        throw new OwnerError(
          "ops.alert_undelivered",
          out.attempted
            ? "No channel accepted the drill — check the receiver URL"
            : "No alert channel is configured",
        );
      }
      return out;
    },
  );
}