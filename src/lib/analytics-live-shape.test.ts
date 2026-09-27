/**
 * Analytics readers vs the live warehouse shape.
 *
 * The repo migrations describe per-entity buckets (entity/totals) and a raw
 * events table, but live holds flat daily/geo/cohort/batch rows — and the
 * `analytics_events` name belongs to another app sharing this database, so
 * readers must never query it. These tests pin the adapters: real numbers
 * where the flat schema has them, honest zeros elsewhere, never a throw.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { loadFunnel, loadCohorts, loadTraffic, loadPipelineHealth } =
  await import("./analytics-warehouse.server");

const MERCHANT = "77777777-7777-7777-7777-777777777777";

function warehouseDb() {
  return fakeDb({
    tables: {
      analytics_daily: [
        {
          merchant_id: MERCHANT,
          day: "2026-09-20",
          pageviews: 100,
          unique_visitors: 80,
          sessions: 90,
          orders_count: 5,
          revenue_minor_int: 250000,
        },
      ],
      analytics_geo_daily: [
        {
          merchant_id: MERCHANT,
          day: "2026-09-20",
          country_code: "BD",
          unique_visitors: 80,
          revenue_minor_int: 250000,
        },
      ],
      analytics_cohorts: [
        {
          merchant_id: MERCHANT,
          cohort_week: "2026-09-14",
          cohort_size: 10,
          returning_count: 4,
          revenue_minor_int: 100000,
        },
      ],
      analytics_batches: [
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          merchant_id: MERCHANT,
          batch_date: "2026-09-20",
          status: "committed",
          row_count: 42,
          created_at: "2026-09-20T00:00:00Z",
        },
      ],
    },
  });
}

beforeEach(() => recorder.reset());

describe("live-shape adapters", () => {
  it("builds a funnel from flat daily rows without touching events", async () => {
    const db = warehouseDb();
    const out: any = await loadFunnel(db.asClient(), MERCHANT, 30);
    const byKey = new Map(out.stages.map((s: any) => [s.key, s.count]));
    expect(byKey.get("visit")).toBe(100);
    expect(byKey.get("paid")).toBe(5);
    expect(out.channels).toEqual([]);
  });

  it("maps weekly cohort rows to a single honest offset", async () => {
    const db = warehouseDb();
    const matrix: any = await loadCohorts(db.asClient(), MERCHANT);
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0].size).toBe(10);
    expect(matrix.rows[0].cells[0].active).toBe(4);
  });

  it("serves traffic from flat geo+daily rows with empty splits", async () => {
    const db = warehouseDb();
    const out: any = await loadTraffic(db.asClient(), MERCHANT, 30);
    expect(out.totals.visitors).toBe(80);
    expect(out.countries[0]).toMatchObject({ key: "BD", visitors: 80 });
    expect(out.series).toHaveLength(1);
    expect(out.devices).toEqual([]);
    expect(out.sources).toEqual([]);
    expect(out.regions).toEqual([]);
  });

  it("audits the flat batch ledger without raw event counts", async () => {
    const db = warehouseDb();
    const out: any = await loadPipelineHealth(db.asClient(), MERCHANT);
    expect(out.healthy).toBe(true);
    expect(out.rawRows).toBe(0);
    expect(out.totalEvents).toBe(42);
  });

  it("renders empty states instead of throwing on empty tables", async () => {
    const db = fakeDb({
      tables: {
        analytics_daily: [],
        analytics_geo_daily: [],
        analytics_cohorts: [],
        analytics_batches: [],
      },
    });
    const funnel: any = await loadFunnel(db.asClient(), MERCHANT, 30);
    expect(funnel.stages.every((s: any) => s.count === 0)).toBe(true);
    const traffic: any = await loadTraffic(db.asClient(), MERCHANT, 30);
    expect(traffic.totals.visitors).toBe(0);
    const health: any = await loadPipelineHealth(db.asClient(), MERCHANT);
    expect(health.healthy).toBe(true);
  });
});
