import { describe, expect, it } from "vitest";
import {
  afterFailure,
  assertJobTransition,
  backoffSeconds,
  canTransitionJob,
  cronMatches,
  isLeaseExpired,
  isRetryableError,
  judgeQueue,
  policyFor,
  PRIORITY_RANK,
  scheduleIsDue,
} from "./job-queue";

describe("job state machine", () => {
  it("allows the retry path but never resurrects a succeeded job", () => {
    expect(canTransitionJob("running", "queued")).toBe(true);
    expect(canTransitionJob("succeeded", "queued")).toBe(false);
  });

  it("allows replaying a dead job after a human fixes the cause", () => {
    expect(canTransitionJob("dead", "queued")).toBe(true);
  });

  it("throws with both states named", () => {
    expect(() => assertJobTransition("cancelled", "running")).toThrow(
      "job_invalid_transition:cancelled->running",
    );
  });
});

describe("policies", () => {
  it("retries money far harder than bulk work", () => {
    expect(policyFor("payments").maxAttempts).toBeGreaterThan(policyFor("exports").maxAttempts);
  });

  it("ranks critical work ahead of bulk", () => {
    expect(PRIORITY_RANK.critical).toBeLessThan(PRIORITY_RANK.bulk);
  });

  it("falls back to the maintenance policy for unknown queues", () => {
    expect(policyFor("nope")).toEqual(policyFor("maintenance"));
  });
});

describe("backoff", () => {
  const policy = policyFor("delivery");

  it("grows with attempts", () => {
    expect(backoffSeconds(policy, 3, "job-a")).toBeGreaterThan(backoffSeconds(policy, 1, "job-a"));
  });

  it("never exceeds the cap", () => {
    expect(backoffSeconds(policy, 40, "job-a")).toBeLessThanOrEqual(policy.maxBackoffSeconds * 1.25);
  });

  it("is deterministic per job but differs across jobs (thundering-herd spread)", () => {
    expect(backoffSeconds(policy, 4, "job-a")).toBe(backoffSeconds(policy, 4, "job-a"));
    expect(backoffSeconds(policy, 4, "job-a")).not.toBe(backoffSeconds(policy, 4, "job-zzzz"));
  });
});

describe("afterFailure", () => {
  const policy = policyFor("delivery");

  it("requeues a retryable failure with a delay", () => {
    const out = afterFailure(policy, 1, "j1", true);
    expect(out.next).toBe("queued");
    expect(out.runAfterSeconds).toBeGreaterThan(0);
  });

  it("dead-letters immediately for non-retryable errors", () => {
    expect(afterFailure(policy, 1, "j1", false)).toMatchObject({ next: "dead", dead: true });
  });

  it("dead-letters once attempts are exhausted", () => {
    expect(afterFailure(policy, policy.maxAttempts, "j1", true).dead).toBe(true);
  });
});

describe("isRetryableError", () => {
  it("retries transport, throttling and 5xx", () => {
    expect(isRetryableError(null, "socket hang up")).toBe(true);
    expect(isRetryableError(429, "slow down")).toBe(true);
    expect(isRetryableError(503, "unavailable")).toBe(true);
  });

  it("does not retry client mistakes", () => {
    expect(isRetryableError(400, "bad request")).toBe(false);
    expect(isRetryableError(404, "missing")).toBe(false);
  });

  it("retries a 400 whose body says timeout", () => {
    expect(isRetryableError(400, "upstream timeout")).toBe(true);
  });
});

describe("isLeaseExpired", () => {
  it("treats a missing or unparseable lock as expired", () => {
    expect(isLeaseExpired(null, 60)).toBe(true);
    expect(isLeaseExpired("nonsense", 60)).toBe(true);
  });

  it("keeps a fresh lease and releases an old one", () => {
    const now = Date.now();
    expect(isLeaseExpired(new Date(now - 5_000).toISOString(), 60, now)).toBe(false);
    expect(isLeaseExpired(new Date(now - 120_000).toISOString(), 60, now)).toBe(true);
  });
});

describe("cronMatches", () => {
  const at = (iso: string) => new Date(iso);

  it("matches a wildcard every minute", () => {
    expect(cronMatches("* * * * *", at("2026-01-01T00:00:00Z"))).toBe(true);
  });

  it("matches step and exact fields", () => {
    expect(cronMatches("*/5 * * * *", at("2026-01-01T00:10:00Z"))).toBe(true);
    expect(cronMatches("*/5 * * * *", at("2026-01-01T00:11:00Z"))).toBe(false);
    expect(cronMatches("0 9 * * 1", at("2026-01-05T09:00:00Z"))).toBe(true); // Monday
    expect(cronMatches("0 9 * * 1", at("2026-01-06T09:00:00Z"))).toBe(false);
  });

  it("matches ranges and lists", () => {
    expect(cronMatches("0 9-17 * * *", at("2026-01-01T12:00:00Z"))).toBe(true);
    expect(cronMatches("0 9,21 * * *", at("2026-01-01T21:00:00Z"))).toBe(true);
    expect(cronMatches("0 9-17 * * *", at("2026-01-01T20:00:00Z"))).toBe(false);
  });

  it("rejects malformed expressions instead of firing", () => {
    expect(cronMatches("* * *", at("2026-01-01T00:00:00Z"))).toBe(false);
    expect(cronMatches("bogus * * * *", at("2026-01-01T00:00:00Z"))).toBe(false);
  });
});

describe("scheduleIsDue", () => {
  it("suppresses a second fire inside the same minute", () => {
    const now = new Date("2026-01-01T00:00:30Z");
    expect(scheduleIsDue("* * * * *", "2026-01-01T00:00:05Z", now)).toBe(false);
  });

  it("fires once when the gap has passed", () => {
    const now = new Date("2026-01-01T00:05:00Z");
    expect(scheduleIsDue("* * * * *", "2026-01-01T00:00:00Z", now)).toBe(true);
  });

  it("fires on first run with no history", () => {
    expect(scheduleIsDue("* * * * *", null, new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("judgeQueue", () => {
  const base = { queue: "delivery", queued: 0, running: 0, dead: 0, oldestQueuedAgeSeconds: 0 };

  it("calls a draining queue healthy", () => {
    expect(judgeQueue({ ...base, queued: 40, oldestQueuedAgeSeconds: 20 }).status).toBe("healthy");
  });

  it("flags a stalled head even when shallow", () => {
    expect(judgeQueue({ ...base, queued: 2, oldestQueuedAgeSeconds: 1200 }).status).toBe("stalled");
  });

  it("flags a deep backlog", () => {
    expect(judgeQueue({ ...base, queued: 5000, oldestQueuedAgeSeconds: 30 }).status).toBe("backlogged");
  });

  it("flags dead letters above everything else", () => {
    expect(judgeQueue({ ...base, dead: 12, queued: 3 }).status).toBe("failing");
  });
});
