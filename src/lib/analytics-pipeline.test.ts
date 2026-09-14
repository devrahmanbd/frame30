import { describe, expect, it } from "vitest";
import {
  agingBucket,
  auditBatchChain,
  buildCohortMatrix,
  buildFunnel,
  classifyPersona,
  isStale,
  nextRunAt,
  summarizeAging,
  toCsv,
  validateReport,
  vipThreshold,
  type DailyBucket,
} from "./analytics-pipeline";

describe("funnel", () => {
  const buckets: DailyBucket[] = [
    { entity: "page", day: "2026-01-01", totals: { actions: { view: 1000 } } },
    { entity: "product", day: "2026-01-01", totals: { actions: { view: 400 } } },
    { entity: "cart", day: "2026-01-01", totals: { actions: { add: 120 } } },
    { entity: "checkout", day: "2026-01-01", totals: { actions: { start: 80 } } },
    { entity: "order", day: "2026-01-01", totals: { actions: { paid: 40 } } },
  ];

  it("computes stage shares and drop-off", () => {
    const funnel = buildFunnel(buckets);
    expect(funnel.stages[0]!.count).toBe(1000);
    expect(funnel.stages[1]!.ofTop).toBe(40);
    expect(funnel.stages[1]!.dropOff).toBe(600);
    expect(funnel.conversionRate).toBe(4);
  });

  it("names the biggest leak", () => {
    expect(buildFunnel(buckets).biggestLeak).toBe("product");
  });

  it("never divides by zero", () => {
    const empty = buildFunnel([]);
    expect(empty.conversionRate).toBe(0);
    expect(empty.stages.every((s) => s.count === 0)).toBe(true);
  });

  it("sums across days", () => {
    const two = buildFunnel([...buckets, { entity: "order", day: "2026-01-02", totals: { actions: { paid: 10 } } } as DailyBucket]);
    expect(two.stages[4]!.count).toBe(50);
  });
});

describe("cohorts", () => {
  const rows = [
    { cohort_week: "2026-01-05", week_offset: 0, customers: 100, active_customers: 100, orders: 100, revenue_minor_int: 100000 },
    { cohort_week: "2026-01-05", week_offset: 1, customers: 100, active_customers: 25, orders: 30, revenue_minor_int: 40000 },
    { cohort_week: "2026-01-12", week_offset: 0, customers: 50, active_customers: 50, orders: 50, revenue_minor_int: 50000 },
  ];

  it("builds a dense grid", () => {
    const matrix = buildCohortMatrix(rows);
    expect(matrix.weeks).toEqual(["2026-01-05", "2026-01-12"]);
    expect(matrix.rows[0]!.cells[1]!.retention).toBe(25);
    expect(matrix.rows[1]!.cells[1]!.active).toBe(0);
  });

  it("averages retention per offset", () => {
    expect(buildCohortMatrix(rows).averages[0]).toEqual({ offset: 1, retention: 12.5 });
  });
});

describe("personas", () => {
  it("bands by spend, recency and frequency", () => {
    expect(classifyPersona({ orders: 1, spendMinorInt: 1000, daysSinceLast: 3 }, 0)).toBe("new");
    expect(classifyPersona({ orders: 2, spendMinorInt: 5000, daysSinceLast: 10 }, 0)).toBe("repeat");
    expect(classifyPersona({ orders: 6, spendMinorInt: 9000, daysSinceLast: 10 }, 0)).toBe("loyal");
    expect(classifyPersona({ orders: 3, spendMinorInt: 9000, daysSinceLast: 80 }, 0)).toBe("at_risk");
    expect(classifyPersona({ orders: 3, spendMinorInt: 9000, daysSinceLast: 200 }, 0)).toBe("dormant");
    expect(classifyPersona({ orders: 2, spendMinorInt: 500000, daysSinceLast: 5 }, 100000)).toBe("vip");
  });

  it("needs five buyers before naming a VIP band", () => {
    expect(vipThreshold([100, 200])).toBe(0);
    expect(vipThreshold([10, 20, 30, 40, 50, 1000])).toBeGreaterThan(0);
  });
});

describe("inventory aging", () => {
  it("buckets by days since last sale", () => {
    expect(agingBucket(5)).toBe("fresh");
    expect(agingBucket(45)).toBe("slow");
    expect(agingBucket(75)).toBe("stale");
    expect(agingBucket(400)).toBe("dead");
    expect(agingBucket(Number.POSITIVE_INFINITY)).toBe("dead");
  });

  it("totals tied-up capital", () => {
    const summary = summarizeAging([
      { variantId: "a", title: "A", sku: null, stock: 10, unitCostMinorInt: 1000, daysSinceLastSale: 5 },
      { variantId: "b", title: "B", sku: null, stock: 4, unitCostMinorInt: 2500, daysSinceLastSale: 300 },
    ]);
    expect(summary.totalTiedUpMinorInt).toBe(20000);
    expect(summary.deadStockMinorInt).toBe(10000);
  });
});

describe("report builder", () => {
  const base = {
    dataset: "orders",
    dimensions: ["day"],
    metrics: ["orders", "revenue_minor_int"],
    rangeDays: 30,
    schedule: "weekly",
    format: "csv",
    recipients: ["ops@example.com"],
  };

  it("accepts a valid definition", () => {
    expect(validateReport(base)).toEqual({ ok: true });
  });

  it("rejects unknown columns and datasets", () => {
    expect(validateReport({ ...base, dataset: "nope" }).ok).toBe(false);
    expect(validateReport({ ...base, metrics: ["profit"] }).ok).toBe(false);
    expect(validateReport({ ...base, dimensions: ["moon_phase"] }).ok).toBe(false);
  });

  it("rejects bad ranges, schedules and recipients", () => {
    expect(validateReport({ ...base, rangeDays: 0 }).ok).toBe(false);
    expect(validateReport({ ...base, schedule: "hourly" }).ok).toBe(false);
    expect(validateReport({ ...base, recipients: ["not-an-email"] }).ok).toBe(false);
    expect(validateReport({ ...base, metrics: [] }).ok).toBe(false);
  });

  it("schedules the next run at 02:00 UTC", () => {
    const next = nextRunAt("daily", new Date("2026-03-01T13:00:00Z"));
    expect(next).toBe("2026-03-02T02:00:00.000Z");
    expect(nextRunAt("off", new Date())).toBeNull();
  });

  it("quotes CSV safely", () => {
    const csv = toCsv([{ title: 'Shirt, "blue"', units: 2 }], ["title", "units"]);
    expect(csv).toBe('title,units\n"Shirt, ""blue""",2');
    expect(toCsv([], ["a"])).toBe("a");
  });
});

describe("batch ledger", () => {
  const b = (id: string, prev: string | null, committed: boolean, created: string) => ({
    id,
    previous_batch_id: prev,
    status: committed ? "committed" : "running",
    committed_at: committed ? created : null,
    event_count: 10,
    gap_detected: false,
    created_at: created,
  });

  it("passes an intact chain", () => {
    const audit = auditBatchChain([
      b("1", null, true, "2026-01-01T00:00:00Z"),
      b("2", "1", true, "2026-01-01T00:05:00Z"),
    ]);
    expect(audit.healthy).toBe(true);
    expect(audit.totalEvents).toBe(20);
  });

  it("flags a broken chain and uncommitted runs", () => {
    const audit = auditBatchChain([
      b("1", null, true, "2026-01-01T00:00:00Z"),
      b("2", null, false, "2026-01-01T00:05:00Z"),
    ]);
    expect(audit.healthy).toBe(false);
    expect(audit.problems.map((p) => p.reason)).toContain("chain_break");
    expect(audit.problems.map((p) => p.reason)).toContain("uncommitted");
  });

  it("treats a long silence as stale", () => {
    const now = new Date("2026-01-01T01:00:00Z");
    expect(isStale(null, now)).toBe(true);
    expect(isStale("2026-01-01T00:00:00Z", now)).toBe(true);
    expect(isStale("2026-01-01T00:58:00Z", now)).toBe(false);
  });
});
