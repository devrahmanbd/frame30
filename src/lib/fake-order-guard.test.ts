/**
 * Fake-order guard: post-order scoring that flags fake/bot orders without
 * ever blocking legitimate revenue.
 *
 * Coverage contract:
 *   - scorer matrix incl. boundary values (velocity / COD-over-limit /
 *     new-customer-high-value / address-quality+cluster / failed streak);
 *   - projector never-blocks proof via throwing-db fixture (fail-open);
 *   - hook fires exactly once per order through real `createOrder`.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { fakeDb, type FakeDb } from "./__fixtures__/fake-db";
import type { FakeOrderHistoryRow } from "./fake-order-guard.server";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

const priceCartMock = vi.hoisted(() => vi.fn());
const ingestBeaconsMock = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({})),
);
const listInstalledPluginsMock = vi.hoisted(() => vi.fn(async () => []));
const runHookMock = vi.hoisted(() => vi.fn(async () => []));
const adminHolder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./observability.server", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  ...rec.holder!.observability,
}));
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("./pricing.server", () => ({
  priceCart: priceCartMock,
  publicClient: vi.fn(() => null),
}));
vi.mock("./identity.server", () => ({
  resolveRequestUserId: vi.fn(async () => null),
}));
vi.mock("./analytics-warehouse.server", () => ({
  ingestBeacons: ingestBeaconsMock,
}));
vi.mock("./geo.server", () => ({ requestGeo: vi.fn(async () => ({})) }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => null),
}));
vi.mock("./plugins.server", () => ({
  listInstalledPlugins: listInstalledPluginsMock,
}));
vi.mock("./plugin-hooks.server", () => ({ runHook: runHookMock }));
vi.mock("./redis-lock.server", () => ({
  withTenantLock: async <T>(
    _tenantId: string,
    _resource: string,
    _ttlMs: number,
    fn: (handle: never) => Promise<T>,
  ): Promise<T> => fn({} as never),
}));
vi.mock("./cache.server", () => ({
  cached: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidate: vi.fn(async () => {}),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminHolder.db;
  },
}));

const {
  scoreFakeOrder,
  evaluateOrderForFraud,
  FAKE_ORDER_VELOCITY_MAX_PER_PHONE,
  FAKE_ORDER_COD_MAX_MINOR_INT,
  FAKE_ORDER_NEW_CUSTOMER_HIGH_VALUE_MINOR_INT,
  FAKE_ORDER_FAILED_STREAK_THRESHOLD,
  FAKE_ORDER_REVIEW_SCORE_THRESHOLD,
} = await import("./fake-order-guard.server");
const { createOrder } = await import("./orders.server");

const NOW = "2026-02-01T12:00:00.000Z";
const PHONE = "01711000000";
const GOOD_ADDRESS = "House 12, Road 5, Dhanmondi, Dhaka 1205";

function historyRow(
  partial: Partial<FakeOrderHistoryRow> = {},
): FakeOrderHistoryRow {
  return {
    phone: PHONE,
    ip: null,
    addressLine: GOOD_ADDRESS,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "delivered",
    paymentMethod: "cod",
    totalMinorInt: 100_000,
    ...partial,
  };
}

function recentHistory(
  n: number,
  partial: Partial<FakeOrderHistoryRow> = {},
): FakeOrderHistoryRow[] {
  const base = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    ...historyRow(),
    createdAt: new Date(base - i * 10 * 60_000).toISOString(),
    ...partial,
  }));
}

function seedPricing(totalMinor = 1000) {
  priceCartMock.mockResolvedValue({
    merchant: { id: "m1" },
    totals: {
      currency: "BDT",
      subtotalMinor: totalMinor,
      discountMinor: 0,
      shippingMinor: 0,
      codSurchargeMinor: 0,
      vatMinor: 0,
      vatRateBasisPoints: 0,
      totalMinor,
      coupons: [],
      lines: [
        {
          variantId: "v1",
          productTitle: "Shari",
          variantName: "Default",
          sku: null,
          unitPriceMinor: totalMinor,
          quantity: 1,
          lineTotalMinor: totalMinor,
          stock: 9,
          vatMinor: 0,
        },
      ],
    },
  });
}

function orderDb(seed: Record<string, Record<string, unknown>[]> = {}): FakeDb {
  return fakeDb({
    tables: {
      orders: [],
      order_items: [],
      payments: [],
      coupon_redemptions: [],
      coupons: [],
      order_events: [],
      customers: [],
      stock_holds: [],
      fraud_rules: [],
      fraud_blacklist: [],
      fraud_assessments: [],
      fraud_cases: [],
      fraud_audit: [],
      product_variants: [{ id: "v1", merchant_id: "m1", stock_quantity: 10 }],
      ...seed,
    },
  });
}

function baseInput(key: string) {
  return {
    slug: "shop",
    cart: [{ variantId: "v1", quantity: 1 }],
    paymentMethod: "cod" as const,
    idempotencyKey: key,
    checkoutToken: `${key}-hold`,
    customer: {
      name: "Ayesha",
      phone: PHONE,
      addressLine: GOOD_ADDRESS,
      city: "Dhaka",
    },
  };
}

beforeEach(() => {
  seedPricing();
  listInstalledPluginsMock.mockResolvedValue([]);
  runHookMock.mockResolvedValue([]);
});

afterEach(() => {
  recorder.reset();
  priceCartMock.mockReset();
  ingestBeaconsMock.mockClear();
  listInstalledPluginsMock.mockClear();
  runHookMock.mockClear();
  adminHolder.db = null;
});

describe("scoreFakeOrder matrix", () => {
  it("allows a clean order with zero scores", () => {
    const v = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: [historyRow()] },
    );
    expect(v.disposition).toBe("allow");
    expect(v.fraudScore).toBe(0);
    expect(v.botScore).toBe(0);
    expect(v.abuseFlags).toBe(0);
    expect(v.reasons).toEqual([]);
  });

  it("velocity boundary: MAX priors allow, MAX+1 review", () => {
    const atMax = Array.from(
      { length: FAKE_ORDER_VELOCITY_MAX_PER_PHONE },
      (_, i) =>
        historyRow({
          createdAt: new Date(Date.parse(NOW) - i * 60_000).toISOString(),
        }),
    );
    const allow = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: atMax },
    );
    expect(allow.reasons).not.toContain("velocity_phone");
    expect(allow.disposition).toBe("allow");

    const overMax = [
      ...atMax,
      historyRow({
        createdAt: new Date(Date.parse(NOW) - 30_000).toISOString(),
      }),
    ];
    const review = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: overMax },
    );
    expect(review.reasons).toContain("velocity_phone");
    expect(review.disposition).toBe("review");
    expect(review.botScore).toBeGreaterThanOrEqual(60);
  });

  it("ignores priors outside the velocity window", () => {
    const old = Array.from({ length: 6 }, () =>
      historyRow({ createdAt: "2026-01-01T00:00:00.000Z" }),
    );
    const v = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: old },
    );
    expect(v.reasons).not.toContain("velocity_phone");
    expect(v.disposition).toBe("allow");
  });

  it("COD boundary: exactly at ceiling allow, one unit over review", () => {
    const returning = [historyRow()];
    const atCeil = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: FAKE_ORDER_COD_MAX_MINOR_INT,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: returning },
    );
    expect(atCeil.reasons).not.toContain("cod_over_limit");
    expect(atCeil.disposition).toBe("allow");

    const over = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: FAKE_ORDER_COD_MAX_MINOR_INT + 1,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: returning },
    );
    expect(over.reasons).toContain("cod_over_limit");
    // Exactly at the review threshold reviews (>=).
    expect(over.fraudScore).toBe(FAKE_ORDER_REVIEW_SCORE_THRESHOLD);
    expect(over.disposition).toBe("review");
  });

  it("does not flag COD-over-limit for online rails", () => {
    const v = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: FAKE_ORDER_COD_MAX_MINOR_INT + 500_000,
        paymentMethod: "bkash",
        createdAt: NOW,
      },
      { history: [historyRow()] },
    );
    expect(v.reasons).not.toContain("cod_over_limit");
  });

  it("new-customer-high-value boundary: HIGH-1 allow, HIGH review", () => {
    const below = scoreFakeOrder(
      {
        phone: "01799000000",
        addressLine: GOOD_ADDRESS,
        totalMinorInt: FAKE_ORDER_NEW_CUSTOMER_HIGH_VALUE_MINOR_INT - 1,
        paymentMethod: "bkash",
        createdAt: NOW,
      },
      { history: [] },
    );
    expect(below.reasons).not.toContain("new_customer_high_value");
    expect(below.disposition).toBe("allow");

    const atHigh = scoreFakeOrder(
      {
        phone: "01799000000",
        addressLine: GOOD_ADDRESS,
        totalMinorInt: FAKE_ORDER_NEW_CUSTOMER_HIGH_VALUE_MINOR_INT,
        paymentMethod: "bkash",
        createdAt: NOW,
      },
      { history: [] },
    );
    expect(atHigh.reasons).toContain("new_customer_high_value");
    expect(atHigh.disposition).toBe("review");
  });

  it("returning high-value shoppers are not flagged as new", () => {
    const v = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: FAKE_ORDER_NEW_CUSTOMER_HIGH_VALUE_MINOR_INT + 1_000_000,
        paymentMethod: "bkash",
        createdAt: NOW,
      },
      { history: [historyRow()] },
    );
    expect(v.reasons).not.toContain("new_customer_high_value");
    expect(v.disposition).toBe("allow");
  });

  it("failed-streak boundary: threshold-1 allow, threshold review", () => {
    const below = Array.from(
      { length: FAKE_ORDER_FAILED_STREAK_THRESHOLD - 1 },
      () => historyRow({ status: "cancelled" }),
    );
    const allow = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: below },
    );
    expect(allow.reasons).not.toContain("failed_payment_streak");

    const atThreshold = Array.from(
      { length: FAKE_ORDER_FAILED_STREAK_THRESHOLD },
      () => historyRow({ status: "cancelled" }),
    );
    const review = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: atThreshold },
    );
    expect(review.reasons).toContain("failed_payment_streak");
    expect(review.disposition).toBe("review");
  });

  it("poor address alone stays allow (weight below threshold), with corroboration reviews", () => {
    const lone = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: "Dhaka",
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: [historyRow()] },
    );
    expect(lone.reasons).toContain("address_quality");
    expect(lone.fraudScore).toBeLessThan(FAKE_ORDER_REVIEW_SCORE_THRESHOLD);
    expect(lone.disposition).toBe("allow");

    const corroborated = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: "Dhaka",
        totalMinorInt: FAKE_ORDER_COD_MAX_MINOR_INT + 1,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: [historyRow()] },
    );
    expect(corroborated.disposition).toBe("review");
  });

  it("flags one address shared across distinct phones", () => {
    const v = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      {
        history: [
          historyRow({ phone: "01722000000" }),
          historyRow({ phone: "01733000000" }),
        ],
      },
    );
    expect(v.reasons).toContain("address_cluster");
    expect(v.disposition).toBe("review");
  });

  it("abuseFlags equals reasons and fraudScore caps at 100", () => {
    const everything = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: "x",
        totalMinorInt: 9_000_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      {
        history: [
          ...Array.from({ length: 6 }, (_, i) =>
            historyRow({
              status: "cancelled",
              createdAt: new Date(Date.parse(NOW) - i * 60_000).toISOString(),
            }),
          ),
          historyRow({ phone: "01722000000" }),
          historyRow({ phone: "01733000000" }),
        ],
        isNewCustomer: true,
      },
    );
    expect(everything.abuseFlags).toBe(everything.reasons.length);
    expect(everything.fraudScore).toBeLessThanOrEqual(100);
    expect(everything.disposition).toBe("review");
    for (const d of [everything.disposition]) {
      expect(["allow", "review"]).toContain(d);
    }
  });

  it("botScore stays low for clean orders and passes hints through", () => {
    const clean = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: [historyRow()] },
    );
    expect(clean.botScore).toBe(0);

    const hinted = scoreFakeOrder(
      {
        phone: PHONE,
        addressLine: GOOD_ADDRESS,
        totalMinorInt: 100_000,
        paymentMethod: "cod",
        createdAt: NOW,
      },
      { history: [historyRow()], botScoreHint: 42 },
    );
    expect(hinted.botScore).toBe(42);
    expect(hinted.disposition).toBe("allow");
  });
});

describe("evaluateOrderForFraud never blocks", () => {
  it("fail-open on a throwing db: resolves allow with a loud metric, never rejects", async () => {
    const broken = {
      from: () => {
        throw new Error("db_down");
      },
    };
    const verdict = await evaluateOrderForFraud(broken as never, {
      merchantId: "m1",
      orderId: "o1",
      phone: PHONE,
      totalMinorInt: 100_000,
      paymentMethod: "cod",
    });
    expect(verdict.disposition).toBe("allow");
    expect(verdict.fraudScore).toBe(0);
    expect(
      recorder.of("framique_fake_order_guard_total", ["outcome", "error"])
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("tolerates malformed rows without throwing", async () => {
    const db = orderDb({
      orders: [
        {
          id: "o-bad",
          merchant_id: "m1",
          customer_phone: null,
          address_line: null,
          total_minor_int: null,
          payment_method: "cod",
          status: null,
          created_at: "not-a-date",
        },
      ],
    });
    const verdict = await evaluateOrderForFraud(db.asClient(), {
      merchantId: "m1",
      orderId: "o-new",
      phone: PHONE,
      addressLine: GOOD_ADDRESS,
      totalMinorInt: 100_000,
      paymentMethod: "cod",
      createdAt: new Date().toISOString(),
    });
    expect(["allow", "review"]).toContain(verdict.disposition);
  });

  it("scores review over real bounded history and audits via the fraud path", async () => {
    const db = orderDb({
      orders: recentHistory(4).map((h, i) => ({
        id: `o-prior-${i}`,
        merchant_id: "m1",
        customer_phone: h["phone"],
        address_line: h["addressLine"],
        total_minor_int: 100_000,
        payment_method: "cod",
        status: "delivered",
        created_at: h["createdAt"],
      })),
    });
    const verdict = await evaluateOrderForFraud(db.asClient(), {
      merchantId: "m1",
      orderId: "o-new",
      orderNumber: "FQ-NEW",
      phone: PHONE,
      addressLine: GOOD_ADDRESS,
      totalMinorInt: 100_000,
      paymentMethod: "cod",
      createdAt: new Date().toISOString(),
    });
    expect(verdict.disposition).toBe("review");
    expect(verdict.reasons).toContain("velocity_phone");
    // Bounded read: exactly one history select with a limit.
    const selects = db.selects("orders");
    expect(selects).toHaveLength(1);
    expect(selects[0]!.limit).toBeLessThanOrEqual(100);
    // Fraud-signal row via the existing fraud.server audit path.
    const audits = db.rows("fraud_audit");
    expect(audits).toHaveLength(1);
    expect(audits[0]!.action).toBe("fraud.guard_scored");
    // Shared rule-hit series.
    expect(
      recorder.of("framique_fraud_rule_hits_total", ["rule", "VELOCITY_LIMIT"])
        .length,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("order-create hook fires once per order", () => {
  it("clean order: guard scores allow once, order created, beacon enriched", async () => {
    const db = orderDb();
    adminHolder.db = db.asClient();
    const out = await createOrder(baseInput("idem-guard-clean-1"), "subject-1");
    expect(out.orderId).toBeTruthy();
    expect(db.rows("orders")).toHaveLength(1);

    const guardAudits = db
      .rows("fraud_audit")
      .filter((r) => r.action === "fraud.guard_scored");
    expect(guardAudits).toHaveLength(1);
    expect(
      recorder.of("framique_fake_order_guard_total", ["outcome", "scored"])
        .length,
    ).toBe(1);

    const paidCalls = ingestBeaconsMock.mock.calls.filter((call) =>
      (call[2] as { action: string }[]).some((b) => b.action === "paid"),
    );
    expect(paidCalls).toHaveLength(1);
    expect(
      (paidCalls[0]![2] as { payload: Record<string, unknown> }[])[0]!.payload,
    ).toMatchObject({ fraud_disposition: "allow" });

    expect(
      (runHookMock.mock.calls as unknown as unknown[][]).filter(
        (call) => call[1] === "order.created",
      ),
    ).toHaveLength(1);
  });

  it("fake-looking order is still created (never blocks), flagged review exactly once", async () => {
    const db = orderDb({
      orders: recentHistory(4).map((h, i) => ({
        id: `o-prior-${i}`,
        merchant_id: "m1",
        customer_phone: PHONE,
        address_line: GOOD_ADDRESS,
        total_minor_int: 100_000,
        payment_method: "cod",
        status: "delivered",
        created_at: h["createdAt"],
      })),
    });
    adminHolder.db = db.asClient();
    const out = await createOrder(baseInput("idem-guard-fake-1"), "subject-1");
    // Commerce continuity: the order exists despite the review flag.
    expect(out.orderId).toBeTruthy();
    expect(
      db.rows("orders").filter((r) => r.status !== "cancelled"),
    ).toHaveLength(5);

    const guardAudits = db
      .rows("fraud_audit")
      .filter((r) => r.action === "fraud.guard_scored");
    expect(guardAudits).toHaveLength(1);

    const paidCalls = ingestBeaconsMock.mock.calls.filter((call) =>
      (call[2] as { action: string }[]).some((b) => b.action === "paid"),
    );
    expect(paidCalls).toHaveLength(1);
    expect(
      (paidCalls[0]![2] as { payload: Record<string, unknown> }[])[0]!.payload,
    ).toMatchObject({ fraud_disposition: "review" });
  });
});
