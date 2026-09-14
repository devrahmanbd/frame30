/**
 * Load driver statistics (BUILD.md §4.4).
 *
 * The driver decides whether a release is allowed through, so its percentile
 * and verdict logic is unit-tested rather than trusted.
 */
import { describe, expect, it } from "vitest";
// Plain .mjs harness, deliberately dependency-free.
import { percentile, summarize, verdictFor } from "../../scripts/load-drive.mjs";

describe("percentile", () => {
  it("is 0 for an empty sample rather than NaN", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("uses nearest rank and does not interpolate", () => {
    const s = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(s, 50)).toBe(50);
    expect(percentile(s, 95)).toBe(100);
    expect(percentile(s, 99)).toBe(100);
  });

  it("does not care about input order", () => {
    expect(percentile([90, 10, 50], 50)).toBe(50);
  });
});

describe("verdictFor", () => {
  it("fails a run that produced no requests", () => {
    expect(verdictFor({ requests: 0, failures: 0, p95Ms: 0 })).toBe("fail");
  });

  it("fails on a failure share above 2%", () => {
    expect(verdictFor({ requests: 1000, failures: 25, p95Ms: 100 })).toBe("fail");
  });

  it("fails on p95 latency above 2s even with no errors", () => {
    expect(verdictFor({ requests: 1000, failures: 0, p95Ms: 2500 })).toBe("fail");
  });

  it("warns before it fails", () => {
    expect(verdictFor({ requests: 1000, failures: 10, p95Ms: 100 })).toBe("warn");
    expect(verdictFor({ requests: 1000, failures: 0, p95Ms: 900 })).toBe("warn");
  });

  it("passes a clean fast run", () => {
    expect(verdictFor({ requests: 1000, failures: 0, p95Ms: 120 })).toBe("pass");
  });
});

describe("summarize", () => {
  const base = {
    scenario: "storefront_browse",
    targetUrl: "https://example.test/",
    concurrency: 10,
    durationSeconds: 10,
    failures: 2,
    latencies: Array.from({ length: 98 }, (_, i) => i + 1),
    notes: null,
  };

  it("counts failures as requests so throughput is not flattered", () => {
    const out = summarize(base);
    expect(out.requests).toBe(100);
    expect(out.rps).toBe(10);
  });

  it("emits exactly the columns load_test_runs stores", () => {
    expect(Object.keys(summarize(base)).sort()).toEqual(
      [
        "concurrency",
        "durationSeconds",
        "failures",
        "notes",
        "p50Ms",
        "p95Ms",
        "p99Ms",
        "requests",
        "rps",
        "scenario",
        "targetUrl",
        "verdict",
      ].sort(),
    );
  });

  it("reports integer millisecond latencies", () => {
    const out = summarize({ ...base, latencies: [1.4, 2.6, 3.5] });
    for (const key of ["p50Ms", "p95Ms", "p99Ms"] as const) {
      expect(Number.isInteger(out[key])).toBe(true);
    }
  });

  it("never divides by zero on a zero-duration run", () => {
    expect(summarize({ ...base, durationSeconds: 0 }).rps).toBe(0);
  });
});
