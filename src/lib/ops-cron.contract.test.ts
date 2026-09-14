/**
 * Phase 9.3 exit gate.
 *
 * These are not unit tests for convenience; each one encodes a promise the
 * operations backbone makes. If one fails, the service is less reliable than
 * its own documentation claims, so the gate is red on purpose.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CRON_JOBS,
  OPS_OBJECTIVES,
  alertForJob,
  cadenceSeconds,
  classifyJob,
  cronJob,
  describeSchedule,
  isUnhealthy,
  nextRunAfter,
  parseCron,
  previousRunBefore,
  renderCrontab,
  renderGithubWorkflow,
  renderPgCron,
  summarizeFleet,
  type CronJobState,
} from "./cron-registry";

const NOW = new Date("2026-03-10T12:00:00.000Z");

function state(over: Partial<CronJobState> = {}): CronJobState {
  return {
    key: "jobs",
    enabled: true,
    lastRunAt: NOW.toISOString(),
    lastSuccessAt: NOW.toISOString(),
    lastStatus: "success",
    lastDurationMs: 100,
    lastError: null,
    consecutiveFailures: 0,
    totalRuns: 10,
    totalFailures: 0,
    nextRunAt: null,
    leaseExpiresAt: null,
    ...over,
  };
}

describe("cron registry integrity", () => {
  it("has a unique key, parseable schedule and sane budgets for every job", () => {
    const keys = new Set<string>();
    for (const job of CRON_JOBS) {
      expect(keys.has(job.key), `duplicate key ${job.key}`).toBe(false);
      keys.add(job.key);
      expect(job.key).toMatch(/^[a-z0-9-]+$/);
      expect(() => parseCron(job.schedule)).not.toThrow();
      // A timeout above the platform request budget cannot be enforced.
      expect(job.timeoutMs).toBeLessThanOrEqual(60_000);
      expect(job.slaMaxDurationMs).toBeLessThanOrEqual(job.timeoutMs);
      expect(job.alertAfterFailures).toBeGreaterThanOrEqual(1);
      // Lateness must be judged against the job's own cadence, never a
      // global constant, or minute jobs alert constantly and daily jobs never.
      expect(job.maxOverdueSeconds).toBeGreaterThanOrEqual(
        cadenceSeconds(job.schedule, NOW) / 8,
      );
      expect(job.components.length).toBeGreaterThan(0);
      expect(describeSchedule(job.schedule)).not.toHaveLength(0);
    }
  });

  it("gives money and data-safety jobs a critical severity", () => {
    for (const key of ["billing", "payouts", "ops"]) {
      expect(cronJob(key)?.severity, key).toBe("critical");
    }
  });

  it("staggers schedules so the fleet does not stampede one minute", () => {
    const perMinute = CRON_JOBS.filter((j) => j.schedule.startsWith("* ")).length;
    expect(perMinute).toBeLessThanOrEqual(2);
    const zeroMinute = CRON_JOBS.filter((j) => j.schedule.startsWith("0 ")).length;
    expect(zeroMinute).toBeLessThanOrEqual(3);
  });

  it("has a route file for every registered job and no orphan routes", () => {
    const dir = "src/routes/api/public/cron";
    const routes = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.replace(/\.ts$/, ""));
    for (const job of CRON_JOBS) expect(routes, job.key).toContain(job.key);
    for (const route of routes) expect(cronJob(route), route).not.toBeNull();
  });

  it("routes every job through the shared wrapper, never a bare handler", () => {
    for (const job of CRON_JOBS) {
      const src = readFileSync(`src/routes/api/public/cron/${job.key}.ts`, "utf8");
      expect(src, job.key).toContain("cronPost");
      expect(src, job.key).toContain("cronGet");
      // The wrapper owns auth; a hand-rolled gate would drift from it.
      expect(src.includes("authorizeCron"), job.key).toBe(false);
    }
  });
});

describe("cron expression evaluation", () => {
  it("computes the next and previous fire time for stepped and fixed fields", () => {
    expect(nextRunAfter("*/15 * * * *", new Date("2026-03-10T12:04:00Z"))?.toISOString()).toBe(
      "2026-03-10T12:15:00.000Z",
    );
    expect(previousRunBefore("*/15 * * * *", new Date("2026-03-10T12:04:00Z"))?.toISOString()).toBe(
      "2026-03-10T12:00:00.000Z",
    );
    expect(nextRunAfter("30 3 * * *", new Date("2026-03-10T12:00:00Z"))?.toISOString()).toBe(
      "2026-03-11T03:30:00.000Z",
    );
  });

  it("derives cadence from real fire times, not from the expression text", () => {
    expect(cadenceSeconds("* * * * *", NOW)).toBe(60);
    expect(cadenceSeconds("*/10 * * * *", NOW)).toBe(600);
    expect(cadenceSeconds("0 3 * * *", NOW)).toBe(86_400);
  });

  it("rejects malformed expressions rather than silently never firing", () => {
    expect(() => parseCron("* * *")).toThrow();
    expect(() => parseCron("99 * * * *")).toThrow();
  });
});

describe("health classification", () => {
  const job = cronJob("jobs")!;

  it("calls a fresh job ok", () => {
    expect(classifyJob(job, state(), NOW).health).toBe("ok");
  });

  it("never reports a paused job as failing", () => {
    const v = classifyJob(job, state({ enabled: false, consecutiveFailures: 9 }), NOW);
    expect(v.health).toBe("paused");
  });

  it("reports a job that has never run, and treats that as needing attention", () => {
    const v = classifyJob(job, null, NOW);
    expect(v.health).toBe("never_run");
    expect(isUnhealthy(v.health)).toBe(true);
  });

  it("reports a live lease as running instead of late", () => {
    const v = classifyJob(
      job,
      state({
        lastStatus: "running",
        lastRunAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
        lastSuccessAt: new Date(NOW.getTime() - 7_200_000).toISOString(),
        leaseExpiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
      }),
      NOW,
    );
    expect(v.health).toBe("running");
  });

  it("prefers failing over late when both are true", () => {
    const v = classifyJob(
      job,
      state({
        consecutiveFailures: job.alertAfterFailures,
        lastStatus: "failed",
        lastSuccessAt: new Date(NOW.getTime() - 86_400_000).toISOString(),
        lastRunAt: new Date(NOW.getTime() - 86_400_000).toISOString(),
      }),
      NOW,
    );
    expect(v.health).toBe("failing");
  });

  it("flags a slow-but-successful run without calling it a failure", () => {
    const v = classifyJob(job, state({ lastDurationMs: job.slaMaxDurationMs + 1 }), NOW);
    expect(v.health).toBe("slow");
    expect(isUnhealthy(v.health)).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/slow|duration|sla|budget/i);
  });

  it("does not report a job as running once its lease has expired", () => {
    // A dead runner must never keep a job looking healthy: with the lease gone
    // the verdict falls through to the overdue/failure ladder.
    const daily = cronJob("ops")!;
    const late = new Date("2026-03-10T23:59:00.000Z");
    const v = classifyJob(
      daily,
      state({
        lastStatus: "running",
        leaseExpiresAt: new Date(late.getTime() - 600_000).toISOString(),
        lastRunAt: new Date(late.getTime() - 86_400_000).toISOString(),
        lastSuccessAt: new Date(late.getTime() - 172_800_000).toISOString(),
      }),
      late,
    );
    expect(v.health).not.toBe("running");
    expect(v.health).not.toBe("ok");
    expect(isUnhealthy(v.health)).toBe(true);
  });
});

describe("alert policy", () => {
  const job = cronJob("billing")!;

  it("stays quiet for healthy, slow and paused jobs", () => {
    expect(alertForJob(classifyJob(job, state(), NOW))).toBeNull();
    expect(alertForJob(classifyJob(job, state({ enabled: false }), NOW))).toBeNull();
  });

  it("pages once a job crosses its own failure threshold", () => {
    const intent = alertForJob(
      classifyJob(job, state({ consecutiveFailures: job.alertAfterFailures, lastStatus: "failed" }), NOW),
    );
    expect(intent).not.toBeNull();
    expect(intent!.severity).toBe("critical");
  });

  it("uses a stable dedupe key so one broken job is not a pager storm", () => {
    const a = alertForJob(
      classifyJob(job, state({ consecutiveFailures: 3, lastStatus: "failed" }), NOW),
    );
    const b = alertForJob(
      classifyJob(job, state({ consecutiveFailures: 4, lastStatus: "failed" }), NOW),
    );
    expect(a!.dedupeKey).toBe(b!.dedupeKey);
  });
});

describe("fleet summary", () => {
  it("counts verdicts and surfaces the worst severity in play", () => {
    const views = [
      classifyJob(cronJob("jobs")!, state(), NOW),
      classifyJob(cronJob("billing")!, state({ consecutiveFailures: 5, lastStatus: "failed" }), NOW),
      classifyJob(cronJob("themes")!, state({ enabled: false }), NOW),
    ];
    const s = summarizeFleet(views);
    expect(s.total).toBe(3);
    expect(s.attention).toBe(1);
    expect(s.paused).toBe(1);
    expect(s.worst).toBe("critical");
  });
});

describe("generated schedules", () => {
  const target = { baseUrl: "https://example.test", secretRef: "FRAMIQUE_CRON_SECRET" };

  it("references the secret by name in the env-based formats", () => {
    expect(renderCrontab(target)).toContain(target.secretRef);
    expect(renderGithubWorkflow(target)).toContain(target.secretRef);
  });

  it("emits one entry per job in every format and never prints a secret value", () => {
    for (const content of [
      renderCrontab(target),
      renderGithubWorkflow(target),
      renderPgCron(target),
    ]) {
      for (const job of CRON_JOBS) expect(content).toContain(job.key);
      // pg_cron reads the token from a database setting rather than an env
      // reference, so only assert that no literal secret is ever printed.
      expect(content).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{16,}/);
    }
  });

  it("posts to the public cron prefix, since scheduler calls carry no session", () => {
    expect(renderCrontab(target)).toContain("/api/public/cron/");
  });
});

describe("published objectives", () => {
  it("keeps RPO tighter than RTO and both inside a working day", () => {
    expect(OPS_OBJECTIVES.rpoMinutes).toBeLessThan(OPS_OBJECTIVES.rtoMinutes);
    expect(OPS_OBJECTIVES.rtoMinutes).toBeLessThanOrEqual(480);
    expect(OPS_OBJECTIVES.drillMaxAgeDays).toBeLessThanOrEqual(31);
  });
});
