/**
 * Scheduled-job registry (§9.3).
 *
 * Every handler under `src/routes/api/public/cron/` is declared here once, with
 * the schedule it is supposed to run on, the wall-clock budget it must finish
 * inside, and the lateness/failure thresholds that turn a quiet job into a
 * paged alert. Nothing in this file touches the network or the database: it is
 * the shared vocabulary used by the runner, the owner run desk, the alert
 * router, the status-page health derivation and the schedule generator.
 *
 * Two rules this module exists to enforce:
 *
 *   1. An unscheduled cron is dead code. If a route has no registry entry the
 *      contract test fails, so a handler cannot be merged without an owner, a
 *      schedule and an alerting policy.
 *   2. Silence is not health. Every job declares `maxOverdueSeconds`, so a job
 *      that simply stops being invoked is reported as `late` and eventually
 *      `stalled` — the failure mode a "last run: ok" table hides.
 */

export type CronSeverity = "info" | "warning" | "critical";

export type CronJobDefinition = {
  /** Route segment: `/api/public/cron/<key>`. Also the ledger key. */
  key: string;
  label: string;
  description: string;
  /** Standard 5-field cron expression, evaluated in `timezone`. */
  schedule: string;
  timezone: "UTC";
  /** Hard wall-clock budget for one invocation. */
  timeoutMs: number;
  /** Above this, the run is recorded ok but flagged as slow. */
  slaMaxDurationMs: number;
  /** Consecutive failures before the alert router pages. */
  alertAfterFailures: number;
  /** How far past the expected time before the job counts as late. */
  maxOverdueSeconds: number;
  /** Severity used when this job breaches its policy. */
  severity: CronSeverity;
  /** Status-page components this job keeps honest. */
  components: string[];
  /** True when the job is allowed to call a third party. */
  touchesThirdParty: boolean;
  /** Query string appended by the generated schedules. */
  query?: string;
};

/**
 * The fleet. Schedules are deliberately staggered off the top of the hour:
 * sixteen jobs firing at :00 on one worker is a self-inflicted thundering herd.
 */
export const CRON_JOBS: CronJobDefinition[] = [
  {
    key: "jobs",
    label: "Queue worker tick",
    description: "Fires due schedules, reclaims stalled jobs and drains every worker queue.",
    schedule: "* * * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 20_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 300,
    severity: "critical",
    components: ["jobs", "api"],
    touchesThirdParty: false,
  },
  {
    key: "webhooks",
    label: "Outbound webhook dispatch",
    description: "Retries pending merchant webhook deliveries and ages out dead letters.",
    schedule: "*/2 * * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 20_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 600,
    severity: "critical",
    components: ["webhooks"],
    touchesThirdParty: true,
  },
  {
    key: "notifications",
    label: "Notification fan-out",
    description: "Delivers queued merchant notifications and digest rollups.",
    schedule: "*/5 * * * *",
    timezone: "UTC",
    timeoutMs: 45_000,
    slaMaxDurationMs: 15_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 1_200,
    severity: "warning",
    components: ["notifications"],
    touchesThirdParty: true,
  },
  {
    key: "couriers",
    label: "Courier tracking poll",
    description: "Polls carrier tracking for shipments awaiting movement.",
    schedule: "7,37 * * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 25_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 3_600,
    severity: "warning",
    components: ["shipping"],
    touchesThirdParty: true,
  },
  {
    key: "payouts",
    label: "Payout sweep",
    description: "Advances payout batches, applies holds and reconciles settlements.",
    schedule: "12 * * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 25_000,
    alertAfterFailures: 2,
    maxOverdueSeconds: 7_200,
    severity: "critical",
    components: ["payments"],
    touchesThirdParty: true,
  },
  {
    key: "billing",
    label: "Subscription billing run",
    description: "Invoices due subscriptions, advances dunning and suspends non-payers.",
    schedule: "20 2 * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 30_000,
    alertAfterFailures: 1,
    maxOverdueSeconds: 10_800,
    severity: "critical",
    components: ["billing"],
    touchesThirdParty: false,
  },
  {
    key: "ops",
    label: "Reliability sweep",
    description: "Retention sweep, backup drill, registry sync, lease reaping, status health.",
    schedule: "40 3 * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 30_000,
    alertAfterFailures: 1,
    maxOverdueSeconds: 10_800,
    severity: "critical",
    components: ["database", "jobs"],
    touchesThirdParty: false,
  },
  {
    key: "purge",
    label: "Data purge",
    description: "Executes honoured erasure requests and expires soft-deleted rows.",
    schedule: "55 3 * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 30_000,
    alertAfterFailures: 2,
    maxOverdueSeconds: 10_800,
    severity: "warning",
    components: ["database"],
    touchesThirdParty: false,
  },
  {
    key: "analytics",
    label: "Analytics rollup",
    description: "Rolls raw events into daily aggregates and cohort tables.",
    schedule: "25 * * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 30_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 7_200,
    severity: "warning",
    components: ["analytics"],
    touchesThirdParty: false,
  },
  {
    key: "ad-fraud",
    label: "Ad integrity sweep",
    description: "Scores click sessions, updates blocklists and closes integrity days.",
    schedule: "35 * * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 30_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 7_200,
    severity: "warning",
    components: ["analytics"],
    touchesThirdParty: false,
  },
  {
    key: "growth",
    label: "Growth automations",
    description: "Abandoned-cart recovery, stock alerts and campaign sends.",
    schedule: "*/15 * * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 25_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 3_600,
    severity: "warning",
    components: ["notifications"],
    touchesThirdParty: true,
  },
  {
    key: "support",
    label: "Support SLA sweep",
    description: "Escalates unanswered conversations and closes resolved threads.",
    schedule: "*/20 * * * *",
    timezone: "UTC",
    timeoutMs: 45_000,
    slaMaxDurationMs: 20_000,
    alertAfterFailures: 4,
    maxOverdueSeconds: 5_400,
    severity: "info",
    components: ["support"],
    touchesThirdParty: false,
  },
  {
    key: "domains",
    label: "Custom domain sweep",
    description: "Re-checks DNS, renews certificates and expires stale challenges.",
    schedule: "50 */2 * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 30_000,
    alertAfterFailures: 2,
    maxOverdueSeconds: 14_400,
    severity: "warning",
    components: ["storefront"],
    touchesThirdParty: true,
  },
  {
    key: "themes",
    label: "Marketplace theme sweep",
    description: "Reconciles installs, rolls back failed versions and settles payouts.",
    schedule: "45 4 * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 30_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 14_400,
    severity: "info",
    components: ["storefront"],
    touchesThirdParty: false,
  },
  {
    key: "search-console",
    label: "Search Console refresh",
    description: "The only scheduled Google pull: performance snapshots and sitemap pings.",
    schedule: "15 5 * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 40_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 172_800,
    severity: "warning",
    components: ["seo"],
    touchesThirdParty: true,
    query: "limit=50&days=28",
  },
  {
    key: "content-health",
    label: "Content health scan",
    description: "Rebuilds the internal link graph and refreshes editorial findings.",
    schedule: "30 6 * * *",
    timezone: "UTC",
    timeoutMs: 55_000,
    slaMaxDurationMs: 40_000,
    alertAfterFailures: 3,
    maxOverdueSeconds: 172_800,
    severity: "info",
    components: ["seo"],
    touchesThirdParty: true,
  },
];

export const CRON_JOB_KEYS = CRON_JOBS.map((j) => j.key);

export function cronJob(key: string): CronJobDefinition | null {
  return CRON_JOBS.find((j) => j.key === key) ?? null;
}

/** Recovery objectives we publish, and therefore have to measure. */
export const OPS_OBJECTIVES = {
  /** Maximum acceptable data loss window. */
  rpoMinutes: 60,
  /** Maximum acceptable time to restore service from a verified snapshot. */
  rtoMinutes: 240,
  /** A restore drill older than this is not evidence any more. */
  drillMaxAgeDays: 30,
} as const;

// ------------------------------------------------------------ cron expression

type Field = { min: number; max: number; values: number[] };

function parseField(spec: string, min: number, max: number, label: string): Field {
  const values = new Set<number>();
  for (const part of spec.split(",")) {
    const piece = part.trim();
    if (!piece) throw new Error(`cron: empty ${label} field`);
    const [range, stepRaw] = piece.split("/");
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) throw new Error(`cron: bad step in ${label}`);
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const bounds = (range ?? "").split("-");
      lo = Number(bounds[0]);
      hi = bounds.length > 1 ? Number(bounds[1]) : stepRaw === undefined ? lo : max;
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`cron: bad ${label} value`);
      if (lo < min || hi > max || hi < lo) throw new Error(`cron: ${label} out of range`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  if (!values.size) throw new Error(`cron: ${label} matched nothing`);
  return { min, max, values: [...values].sort((a, b) => a - b) };
}

export type ParsedCron = {
  minute: Field;
  hour: Field;
  dayOfMonth: Field;
  month: Field;
  dayOfWeek: Field;
  /** True when both day fields are restricted (cron ORs them, like POSIX). */
  orDays: boolean;
};

/** Parses a 5-field UTC cron expression. Throws on anything it cannot honour. */
export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("cron: expected 5 fields");
  const [m, h, dom, mon, dow] = parts as [string, string, string, string, string];
  return {
    minute: parseField(m, 0, 59, "minute"),
    hour: parseField(h, 0, 23, "hour"),
    dayOfMonth: parseField(dom, 1, 31, "day-of-month"),
    month: parseField(mon, 1, 12, "month"),
    dayOfWeek: parseField(dow, 0, 6, "day-of-week"),
    orDays: dom !== "*" && dow !== "*",
  };
}

function matches(parsed: ParsedCron, d: Date): boolean {
  const inField = (f: Field, v: number) => f.values.includes(v);
  if (!inField(parsed.minute, d.getUTCMinutes())) return false;
  if (!inField(parsed.hour, d.getUTCHours())) return false;
  if (!inField(parsed.month, d.getUTCMonth() + 1)) return false;
  const domHit = inField(parsed.dayOfMonth, d.getUTCDate());
  const dowHit = inField(parsed.dayOfWeek, d.getUTCDay());
  return parsed.orDays ? domHit || dowHit : domHit && dowHit;
}

/**
 * Next firing strictly after `from`. Minute-resolution scan bounded to about
 * four years so an unsatisfiable expression (e.g. 31 February) returns null
 * instead of spinning.
 */
export function nextRunAfter(expr: string, from: Date = new Date()): Date | null {
  const parsed = parseCron(expr);
  const cursor = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000);
  const limit = 60 * 24 * 366 * 4;
  for (let i = 0; i < limit; i += 1) {
    if (matches(parsed, cursor)) return cursor;
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

/** Previous firing at or before `from`; used to judge lateness. */
export function previousRunBefore(expr: string, from: Date = new Date()): Date | null {
  const parsed = parseCron(expr);
  const cursor = new Date(Math.floor(from.getTime() / 60_000) * 60_000);
  const limit = 60 * 24 * 366 * 4;
  for (let i = 0; i < limit; i += 1) {
    if (matches(parsed, cursor)) return cursor;
    cursor.setUTCMinutes(cursor.getUTCMinutes() - 1);
  }
  return null;
}

/** Average seconds between firings, from the next eight occurrences. */
export function cadenceSeconds(expr: string, from: Date = new Date()): number {
  let cursor = from;
  const stamps: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    const next = nextRunAfter(expr, cursor);
    if (!next) break;
    stamps.push(next.getTime());
    cursor = next;
  }
  if (stamps.length < 2) return 86_400;
  const first = stamps[0] as number;
  const last = stamps[stamps.length - 1] as number;
  return Math.round((last - first) / (stamps.length - 1) / 1000);
}

/** Plain-English schedule, because "40 3 * * *" is not an operations document. */
export function describeSchedule(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [m, h, dom, mon, dow] = parts as [string, string, string, string, string];
  const every = (spec: string, unit: string) => {
    if (spec === "*") return `every ${unit}`;
    if (spec.startsWith("*/")) return `every ${spec.slice(2)} ${unit}s`;
    return null;
  };
  if (m === "*" && h === "*") return "every minute";
  const mEvery = every(m, "minute");
  if (mEvery && h === "*") return `${mEvery} (UTC)`;
  if (h === "*" && dom === "*" && mon === "*" && dow === "*") return `hourly at :${m.padStart(2, "0")} UTC`;
  if (dom === "*" && mon === "*" && dow === "*") {
    const hEvery = every(h, "hour");
    if (hEvery) return `${hEvery} at :${m.padStart(2, "0")} UTC`;
    return `daily at ${h.padStart(2, "0")}:${m.padStart(2, "0")} UTC`;
  }
  return `${expr} (UTC)`;
}

// ------------------------------------------------------------------- health

export type CronJobState = {
  key: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  totalRuns: number;
  totalFailures: number;
  nextRunAt: string | null;
  leaseExpiresAt: string | null;
};

export type CronHealth =
  | "ok"
  | "slow"
  | "late"
  | "stalled"
  | "failing"
  | "running"
  | "paused"
  | "never_run";

export type CronJobView = {
  definition: CronJobDefinition;
  state: CronJobState | null;
  health: CronHealth;
  /** Seconds past the expected run time; 0 when on time. */
  overdueSeconds: number;
  /** Seconds since the last successful run, or null when never. */
  sinceSuccessSeconds: number | null;
  cadenceSeconds: number;
  scheduleText: string;
  nextRunAt: string | null;
  failureRate: number;
  reasons: string[];
};

const NEVER_STATE: CronJobState = {
  key: "",
  enabled: true,
  lastRunAt: null,
  lastSuccessAt: null,
  lastStatus: null,
  lastDurationMs: null,
  lastError: null,
  consecutiveFailures: 0,
  totalRuns: 0,
  totalFailures: 0,
  nextRunAt: null,
  leaseExpiresAt: null,
};

/**
 * Judges one job. Order matters: an operator needs the most actionable verdict,
 * so a currently-running job is never reported as late, a disabled job is never
 * reported as failing, and lateness beats slowness.
 */
export function classifyJob(
  definition: CronJobDefinition,
  state: CronJobState | null,
  now: Date = new Date(),
): CronJobView {
  const s = state ?? { ...NEVER_STATE, key: definition.key };
  const reasons: string[] = [];
  const cadence = cadenceSeconds(definition.schedule, now);
  const scheduleText = describeSchedule(definition.schedule);
  const next = nextRunAfter(definition.schedule, now);
  const expected = previousRunBefore(definition.schedule, now);
  const lastRun = s.lastRunAt ? new Date(s.lastRunAt) : null;
  const lastSuccess = s.lastSuccessAt ? new Date(s.lastSuccessAt) : null;
  const leaseLive = s.leaseExpiresAt ? new Date(s.leaseExpiresAt).getTime() > now.getTime() : false;

  const overdueSeconds =
    expected && (!lastRun || lastRun.getTime() < expected.getTime())
      ? Math.max(0, Math.round((now.getTime() - expected.getTime()) / 1000))
      : 0;
  const sinceSuccessSeconds = lastSuccess
    ? Math.max(0, Math.round((now.getTime() - lastSuccess.getTime()) / 1000))
    : null;
  const failureRate = s.totalRuns > 0 ? s.totalFailures / s.totalRuns : 0;

  let health: CronHealth;
  if (!s.enabled) {
    health = "paused";
    reasons.push("Job is disabled in the registry");
  } else if (leaseLive && s.lastStatus === "running") {
    health = "running";
    reasons.push("A run currently holds the lease");
  } else if (!s.lastRunAt) {
    health = "never_run";
    reasons.push("No invocation has ever reached this endpoint");
  } else if (s.consecutiveFailures >= definition.alertAfterFailures) {
    health = "failing";
    reasons.push(`${s.consecutiveFailures} consecutive failures`);
  } else if (overdueSeconds > definition.maxOverdueSeconds * 4) {
    health = "stalled";
    reasons.push(`No run for ${Math.round(overdueSeconds / 60)} minutes`);
  } else if (overdueSeconds > definition.maxOverdueSeconds) {
    health = "late";
    reasons.push(`Overdue by ${Math.round(overdueSeconds / 60)} minutes`);
  } else if (s.consecutiveFailures > 0) {
    health = "failing";
    reasons.push(`Last run failed (${s.lastError ?? "no detail"})`);
  } else if ((s.lastDurationMs ?? 0) > definition.slaMaxDurationMs) {
    health = "slow";
    reasons.push(`Last run took ${Math.round((s.lastDurationMs ?? 0) / 1000)}s over budget`);
  } else {
    health = "ok";
  }

  return {
    definition,
    state: state ? s : null,
    health,
    overdueSeconds,
    sinceSuccessSeconds,
    cadenceSeconds: cadence,
    scheduleText,
    nextRunAt: (s.nextRunAt ?? next?.toISOString()) ?? null,
    failureRate,
    reasons,
  };
}

export const UNHEALTHY: CronHealth[] = ["failing", "stalled", "late", "never_run"];

export function isUnhealthy(health: CronHealth) {
  return UNHEALTHY.includes(health);
}

export type FleetSummary = {
  total: number;
  ok: number;
  attention: number;
  paused: number;
  neverRun: number;
  worst: CronSeverity | null;
  byHealth: Record<CronHealth, number>;
};

export function summarizeFleet(views: CronJobView[]): FleetSummary {
  const byHealth = {
    ok: 0,
    slow: 0,
    late: 0,
    stalled: 0,
    failing: 0,
    running: 0,
    paused: 0,
    never_run: 0,
  } as Record<CronHealth, number>;
  let worst: CronSeverity | null = null;
  const rank: Record<CronSeverity, number> = { info: 1, warning: 2, critical: 3 };
  for (const v of views) {
    byHealth[v.health] += 1;
    if (isUnhealthy(v.health)) {
      const sev = v.definition.severity;
      if (!worst || rank[sev] > rank[worst]) worst = sev;
    }
  }
  return {
    total: views.length,
    ok: byHealth.ok + byHealth.running + byHealth.slow,
    attention: byHealth.failing + byHealth.late + byHealth.stalled + byHealth.never_run,
    paused: byHealth.paused,
    neverRun: byHealth.never_run,
    worst,
    byHealth,
  };
}

// -------------------------------------------------------------- alert policy

export type AlertIntent = {
  severity: CronSeverity;
  dedupeKey: string;
  title: string;
  body: string;
  source: string;
  payload: Record<string, unknown>;
};

/**
 * Turns a verdict into at most one alert. Dedupe keys are stable per job and
 * per condition so the router's cooldown collapses a flapping job into one
 * page, and a recovered job's next breach is still a new alert bucket.
 */
export function alertForJob(view: CronJobView): AlertIntent | null {
  if (!isUnhealthy(view.health)) return null;
  const { definition: d, state } = view;
  // A brand-new deployment has never-run jobs by definition; only page once the
  // job has been overdue by more than its own tolerance.
  if (view.health === "never_run" && view.overdueSeconds <= d.maxOverdueSeconds) return null;
  const severity: CronSeverity =
    view.health === "late" && d.severity === "critical" ? "warning" : d.severity;
  return {
    severity,
    dedupeKey: `cron:${d.key}:${view.health}`,
    title: `[${severity}] cron ${d.key} is ${view.health}`,
    body: [
      `${d.label} (${view.scheduleText})`,
      ...view.reasons.map((r) => `- ${r}`),
      state?.lastRunAt ? `Last run: ${state.lastRunAt}` : "Last run: never",
      state?.lastSuccessAt ? `Last success: ${state.lastSuccessAt}` : "Last success: never",
      `Next expected: ${view.nextRunAt ?? "unknown"}`,
    ].join("\n"),
    source: `cron.${d.key}`,
    payload: {
      job: d.key,
      health: view.health,
      overdue_seconds: view.overdueSeconds,
      consecutive_failures: state?.consecutiveFailures ?? 0,
      last_error: state?.lastError ?? null,
    },
  };
}

// ------------------------------------------------- schedule file generation

export type ScheduleTarget = { baseUrl: string; secretRef: string };

/** Crontab a self-hosted scheduler can install verbatim. */
export function renderCrontab(target: ScheduleTarget): string {
  const lines = [
    "# Framique scheduled jobs — generated from src/lib/cron-registry.ts",
    "# Install with: crontab framique.cron   (times are UTC)",
    "SHELL=/bin/bash",
    "CRON_TZ=UTC",
    "",
  ];
  for (const job of CRON_JOBS) {
    const url = `${target.baseUrl.replace(/\/$/, "")}/api/public/cron/${job.key}${job.query ? `?${job.query}` : ""}`;
    lines.push(`# ${job.label} — ${job.description}`);
    lines.push(
      `${job.schedule} curl -fsS -m ${Math.ceil(job.timeoutMs / 1000)} -X POST ` +
        `-H "authorization: Bearer $${target.secretRef}" "${url}" >> /var/log/framique-cron.log 2>&1`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

/** GitHub Actions workflow for teams without a always-on box. */
export function renderGithubWorkflow(target: ScheduleTarget): string {
  const jobs = CRON_JOBS.map((job) => {
    const url = `${target.baseUrl.replace(/\/$/, "")}/api/public/cron/${job.key}${job.query ? `?${job.query}` : ""}`;
    return [
      `  ${job.key.replace(/[^a-z0-9]/g, "_")}:`,
      `    if: github.event_name == 'schedule' || github.event.inputs.job == '${job.key}'`,
      "    runs-on: ubuntu-latest",
      "    steps:",
      `      - name: ${job.label}`,
      `        run: |`,
      `          curl -fsS --max-time ${Math.ceil(job.timeoutMs / 1000)} -X POST \\`,
      `            -H "authorization: Bearer \${{ secrets.${target.secretRef} }}" \\`,
      `            "${url}"`,
    ].join("\n");
  }).join("\n");
  const schedules = [...new Set(CRON_JOBS.map((j) => j.schedule))]
    .map((s) => `    - cron: "${s}"`)
    .join("\n");
  return [
    "# Generated from src/lib/cron-registry.ts — do not hand-edit.",
    "name: framique-cron",
    "on:",
    "  schedule:",
    schedules,
    "  workflow_dispatch:",
    "    inputs:",
    "      job:",
    "        description: Single job key to run",
    "        required: false",
    "jobs:",
    jobs,
    "",
  ].join("\n");
}

/** SQL a database-side scheduler (pg_cron + pg_net) can apply. */
export function renderPgCron(target: ScheduleTarget): string {
  const head = [
    "-- Generated from src/lib/cron-registry.ts — requires pg_cron and pg_net.",
    "-- The scheduler token lives in ops_cron_secrets; never inline it here.",
    "",
  ];
  const body = CRON_JOBS.map((job) => {
    const url = `${target.baseUrl.replace(/\/$/, "")}/api/public/cron/${job.key}${job.query ? `?${job.query}` : ""}`;
    return [
      `select cron.unschedule('framique_${job.key}') where exists (`,
      `  select 1 from cron.job where jobname = 'framique_${job.key}');`,
      `select cron.schedule('framique_${job.key}', '${job.schedule}', $$`,
      `  select net.http_post(`,
      `    url := '${url}',`,
      `    headers := jsonb_build_object('authorization', 'Bearer ' || current_setting('framique.cron_token', true)),`,
      `    timeout_milliseconds := ${job.timeoutMs}`,
      `  );`,
      "$$);",
      "",
    ].join("\n");
  }).join("\n");
  return head.join("\n") + body;
}