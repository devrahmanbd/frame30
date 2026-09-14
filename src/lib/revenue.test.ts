import { describe, expect, it } from "vitest";
import { churnWindow, formatMinor, revenueSnapshot, type SubscriptionRow } from "./revenue";

const plans = [
  { plan: "starter", currencyCode: "BDT", priceMinorInt: 99_000 },
  { plan: "growth", currencyCode: "BDT", priceMinorInt: 299_000 },
  { plan: "scale", currencyCode: "USD", priceMinorInt: 9_900 },
];

const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  merchantId: crypto.randomUUID(),
  plan: "starter",
  status: "active",
  currencyCode: "BDT",
  cancelledAt: null,
  createdAt: "2025-01-01T00:00:00Z",
  ...over,
});

describe("revenueSnapshot", () => {
  it("sums MRR in integer minor units and derives ARR and ARPA", () => {
    const s = revenueSnapshot(
      [sub({}), sub({ plan: "growth" }), sub({ plan: "growth", status: "past_due" })],
      plans,
    );
    expect(s.mrrMinorInt).toBe(99_000 + 299_000 + 299_000);
    expect(Number.isInteger(s.mrrMinorInt)).toBe(true);
    expect(s.arrMinorInt).toBe(s.mrrMinorInt * 12);
    expect(s.paying).toBe(3);
    expect(s.arpaMinorInt).toBe(Math.round(s.mrrMinorInt / 3));
    expect(Number.isInteger(s.arpaMinorInt)).toBe(true);
  });

  it("counts past_due as billing but trial, paused and cancelled as not", () => {
    const s = revenueSnapshot(
      [
        sub({ status: "trial" }),
        sub({ status: "paused" }),
        sub({ status: "cancelled", cancelledAt: "2025-02-01T00:00:00Z" }),
        sub({ status: "past_due" }),
      ],
      plans,
    );
    expect(s.paying).toBe(1);
    expect(s.trialing).toBe(1);
    expect(s.paused).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.pastDue).toBe(1);
    expect(s.mrrMinorInt).toBe(99_000);
  });

  it("never converts a foreign-currency contract into the reporting currency", () => {
    const s = revenueSnapshot(
      [sub({}), sub({ plan: "scale", currencyCode: "USD" })],
      plans,
      "BDT",
    );
    expect(s.mrrMinorInt).toBe(99_000);
    expect(s.paying).toBe(1);
    expect(s.mixedCurrencies).toEqual(["USD"]);
  });

  it("treats an unpriced plan as zero rather than throwing", () => {
    const s = revenueSnapshot([sub({ plan: "ghost" })], plans);
    expect(s.mrrMinorInt).toBe(0);
    expect(s.paying).toBe(1);
    expect(s.perPlan).toEqual([{ plan: "ghost", paying: 1, mrrMinorInt: 0 }]);
  });

  it("orders the plan mix by contribution", () => {
    const s = revenueSnapshot([sub({}), sub({ plan: "growth" })], plans);
    expect(s.perPlan.map((p) => p.plan)).toEqual(["growth", "starter"]);
  });

  it("returns an empty snapshot for no subscriptions", () => {
    const s = revenueSnapshot([], plans);
    expect(s).toMatchObject({ mrrMinorInt: 0, arrMinorInt: 0, arpaMinorInt: 0, paying: 0 });
    expect(s.perPlan).toEqual([]);
  });
});

describe("churnWindow", () => {
  const now = new Date("2025-06-30T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it("divides cancellations by the population alive at window start", () => {
    const c = churnWindow(
      [
        sub({ createdAt: daysAgo(200) }),
        sub({ createdAt: daysAgo(200) }),
        sub({ createdAt: daysAgo(200) }),
        sub({ createdAt: daysAgo(200), status: "cancelled", cancelledAt: daysAgo(10) }),
      ],
      30,
      now,
    );
    expect(c.atRiskStart).toBe(4);
    expect(c.cancelled).toBe(1);
    expect(c.rate).toBeCloseTo(0.25, 6);
  });

  it("excludes tenants that signed up inside the window from the denominator", () => {
    const c = churnWindow([sub({ createdAt: daysAgo(5) })], 30, now);
    expect(c.atRiskStart).toBe(0);
    expect(c.rate).toBeNull();
  });

  it("ignores cancellations that happened before the window opened", () => {
    const c = churnWindow(
      [sub({ createdAt: daysAgo(300), status: "cancelled", cancelledAt: daysAgo(120) })],
      30,
      now,
    );
    expect(c.cancelled).toBe(0);
    expect(c.atRiskStart).toBe(0);
  });

  it("reports null instead of a divide-by-zero rate on an empty platform", () => {
    expect(churnWindow([], 90, now).rate).toBeNull();
  });
});

describe("formatMinor", () => {
  it("renders paisa as two-decimal major units without float drift", () => {
    expect(formatMinor(99_000, "BDT")).toBe("BDT 990.00");
    expect(formatMinor(1, "BDT")).toBe("BDT 0.01");
    expect(formatMinor(0, "USD")).toBe("USD 0.00");
  });
});
