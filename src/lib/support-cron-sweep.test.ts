/**
 * TODO-7 — sweep hardening + alerting-path proof.
 *
 * The per-minute `support` sweep must (a) coerce the database-side RPC payload
 * to finite counters, (b) surface breaches at warn level with a dedicated
 * counter, and (c) throw on RPC failure — the throw is the alerting contract
 * the cron wrapper turns into a failed tick, a streak, and a page.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  normaliseSweepResult,
  runSupportSweep,
} from "./support-cron.server";
import { cronJob } from "./cron-registry";

const rpc = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => (rpc.fn as (...a: unknown[]) => unknown)(...args),
  },
}));
// Inline allow-all double (top-level imports are not visible in factories).
vi.mock("./rate-limit.server", () => ({
  enforceRateLimit: vi.fn(async () => ({
    allowed: true,
    hits: 1,
    limit: 100,
    remaining: 99,
    reset_at: new Date(Date.now() + 60_000).toISOString(),
  })),
  rateLimit: vi.fn(async () => ({
    allowed: true,
    hits: 1,
    limit: 100,
    remaining: 99,
    reset_at: new Date(Date.now() + 60_000).toISOString(),
  })),
  rateLimitHeaders: () => ({}),
  RateLimitError: class RateLimitError extends Error {},
  BUCKETS: {},
}));

beforeEach(() => {
  rpc.fn.mockReset();
});

describe("normaliseSweepResult — RPC payload coercion", () => {
  it("passes clean counters through", () => {
    expect(
      normaliseSweepResult({
        breached_first_response: 2,
        breached_resolution: 1,
        stale_conversations: 3,
        retried_events: 4,
      }),
    ).toEqual({
      breached_first_response: 2,
      breached_resolution: 1,
      stale_conversations: 3,
      retried_events: 4,
    });
  });

  it("zeroes null / missing / NaN / negative / fractional counters", () => {
    expect(
      normaliseSweepResult({
        breached_first_response: null,
        breached_resolution: "NaN",
        stale_conversations: -5,
        retried_events: 2.7,
      }),
    ).toEqual({
      breached_first_response: 0,
      breached_resolution: 0,
      stale_conversations: 0,
      retried_events: 2,
    });
    expect(normaliseSweepResult(null)).toEqual({
      breached_first_response: 0,
      breached_resolution: 0,
      stale_conversations: 0,
      retried_events: 0,
    });
  });
});

describe("runSupportSweep — sweep + alerting contract", () => {
  it("returns zeroed counters on an empty sweep", async () => {
    rpc.fn.mockResolvedValue({ data: {}, error: null });
    const res = await runSupportSweep("test");
    expect(res).toEqual({
      breached_first_response: 0,
      breached_resolution: 0,
      stale_conversations: 0,
      retried_events: 0,
    });
    expect(rpc.fn).toHaveBeenCalledWith("support_sla_sweep");
  });

  it("passes breach counters through for the ledger and gauges", async () => {
    rpc.fn.mockResolvedValue({
      data: {
        breached_first_response: 2,
        breached_resolution: 1,
        stale_conversations: 0,
        retried_events: 3,
      },
      error: null,
    });
    const res = await runSupportSweep("test");
    expect(res.breached_first_response).toBe(2);
    expect(res.breached_resolution).toBe(1);
    expect(res.retried_events).toBe(3);
  });

  it("THROWS on RPC failure so the cron wrapper pages (alerting path)", async () => {
    rpc.fn.mockResolvedValue({
      data: null,
      error: { message: "db_down" },
    });
    await expect(runSupportSweep("test")).rejects.toMatchObject({
      message: "db_down",
    });
  });

  it("the support job is registered with an alerting policy", () => {
    const job = cronJob("support");
    expect(job).not.toBeNull();
    expect(job!.schedule).toBeTruthy();
    // A streak past this threshold pages via the cron wrapper's maybeAlert.
    expect(job!.alertAfterFailures).toBeGreaterThan(0);
    expect(job!.severity).toBeTruthy();
    expect(job!.maxOverdueSeconds).toBeGreaterThan(0);
  });
});
