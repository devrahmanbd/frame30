/**
 * Bulk discount codes — [A1]/[A7] failure suite.
 *
 * Generated codes are bearer discounts, so the guards are: no malformed
 * campaign, no collision inside a batch, and no unbounded generation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { metricRecorder, allowAllRateLimits } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { generateCodes, randomCode } = await import("./discount-codes.server");

const MERCHANT = "11111111-1111-1111-1111-111111111111";

const base = {
  prefix: "EID",
  count: 5,
  type: "percent" as const,
  percentOff: 10,
  usageLimit: 1,
  perCustomerLimit: 1,
  batchLabel: "Eid 2026",
};

beforeEach(() => recorder.reset());

describe("randomCode", () => {
  it("uses only unambiguous characters", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(randomCode("EID")).toMatch(/^EID-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("strips punctuation from a caller-supplied prefix", () => {
    expect(randomCode(" eid/2026! ")).toMatch(/^EID2026-/);
  });
});

describe("generateCodes", () => {
  it("denies a batch with no label (deny)", async () => {
    const db = fakeDb();
    await expect(
      generateCodes(db.asClient(), MERCHANT, "staff-1", { ...base, batchLabel: "  " }),
    ).rejects.toMatchObject({ code: "batch_required" });
    expect(db.callsOf("insert")).toHaveLength(0);
  });

  it("denies a percent campaign with no percentage", async () => {
    const db = fakeDb();
    await expect(
      generateCodes(db.asClient(), MERCHANT, "staff-1", { ...base, percentOff: 0 }),
    ).rejects.toMatchObject({ code: "percent_required" });
  });

  it("denies a fixed campaign with no amount", async () => {
    const db = fakeDb();
    await expect(
      generateCodes(db.asClient(), MERCHANT, "staff-1", {
        ...base,
        type: "fixed",
        percentOff: undefined,
        amountMinorInt: 0,
      }),
    ).rejects.toMatchObject({ code: "amount_required" });
  });

  it("caps a runaway request at 500 codes", async () => {
    const db = fakeDb();
    const out = await generateCodes(db.asClient(), MERCHANT, "staff-1", { ...base, count: 100_000 });
    expect(out.codes).toHaveLength(500);
  });

  it("emits unique codes inside a batch (replay guard)", async () => {
    const db = fakeDb();
    const out = await generateCodes(db.asClient(), MERCHANT, "staff-1", { ...base, count: 200 });
    expect(new Set(out.codes).size).toBe(out.codes.length);
  });

  it("clamps money and percentage fields to integer, in-range values (audit)", async () => {
    const db = fakeDb();
    await generateCodes(db.asClient(), MERCHANT, "staff-1", {
      ...base,
      count: 1,
      percentOff: 250,
      minSubtotalMinorInt: 99.9,
      maxDiscountMinorInt: -5,
    });
    const row = db.rows("coupons")[0]!;
    expect(row["percent_off"]).toBe(100);
    expect(row["min_subtotal_minor_int"]).toBe(99);
    expect(row["max_discount_minor_int"]).toBe(0);
    expect(row["merchant_id"]).toBe(MERCHANT);
    expect(row["batch_label"]).toBe("Eid 2026");
    expect(row["status"]).toBe("active");
  });

  it("counts generated codes so a batch is auditable after the fact (audit)", async () => {
    const db = fakeDb();
    await generateCodes(db.asClient(), MERCHANT, "staff-1", { ...base, count: 7 });
    const samples = recorder.of("framique_discount_codes_generated_total");
    expect(samples).toHaveLength(1);
    expect(samples[0]!.value).toBe(7);
  });
});
