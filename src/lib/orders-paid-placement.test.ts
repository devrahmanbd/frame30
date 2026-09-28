/**
 * T1 (audit fix, CRITICAL): paid-at-placement → pending until settlement.
 *
 * An online order must be created with a non-paid status and NO payment row;
 * `paid` is reachable only via the verified settlement path
 * (`applySignedReturn` with a valid HMAC). COD (`confirmed`) stays as-is.
 *
 * Money-path coverage per AGENTS.md Testing §: deny (forged settle rejected),
 * replay (same idempotency key returns the existing pending order), audit
 * (every placement/settlement emits its funnel + ledger trail).
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({
  holder: null as ReturnType<typeof metricRecorder> | null,
}));
const recorder = metricRecorder();
rec.holder = recorder;

const priceCartMock = vi.hoisted(() => vi.fn());
const ingestBeaconsMock = vi.hoisted(() => vi.fn(async () => ({})));
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
vi.mock("./fraud.server", () => ({
  assessCheckout: vi.fn(async () => ({
    action: "allow",
    score: 0,
    decisiveCode: null,
  })),
  recordHoneypotTrip: vi.fn(async () => {}),
  recordOrderVerdict: vi.fn(async () => null),
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
vi.mock("./owner-ops.server", () => ({
  assertPaymentsNotFrozen: vi.fn(async () => {}),
}));
vi.mock("./redis-lock.server", () => ({
  withTenantLock: async <T>(
    _tenantId: string,
    _resource: string,
    _ttlMs: number,
    fn: (handle: never) => Promise<T>,
  ): Promise<T> => fn({} as never),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminHolder.db;
  },
}));

const { createOrder } = await import("./orders.server");
const { applySignedReturn, signReturn, PaymentError } =
  await import("./payments.server");

function seedPricing() {
  priceCartMock.mockResolvedValue({
    merchant: { id: "m1" },
    totals: {
      currency: "BDT",
      subtotalMinor: 1000,
      discountMinor: 0,
      shippingMinor: 0,
      codSurchargeMinor: 0,
      vatMinor: 0,
      vatRateBasisPoints: 0,
      totalMinor: 1000,
      coupons: [],
      lines: [
        {
          variantId: "v1",
          productTitle: "Shari",
          variantName: "Default",
          sku: null,
          unitPriceMinor: 1000,
          quantity: 1,
          lineTotalMinor: 1000,
          stock: 9,
          vatMinor: 0,
        },
      ],
    },
  });
}

function orderDb() {
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
      product_variants: [{ id: "v1", merchant_id: "m1", stock_quantity: 10 }],
    },
  });
}

function baseInput(key: string) {
  return {
    slug: "shop",
    cart: [{ variantId: "v1", quantity: 1 }],
    idempotencyKey: key,
    checkoutToken: `${key}-hold`,
    customer: {
      name: "Ayesha",
      phone: "01700000000",
      addressLine: "Dhaka",
      city: "Dhaka",
    },
  };
}

beforeEach(() => {
  seedPricing();
});

afterEach(() => {
  recorder.reset();
  priceCartMock.mockReset();
  ingestBeaconsMock.mockClear();
  listInstalledPluginsMock.mockClear();
  runHookMock.mockClear();
  adminHolder.db = null;
});

describe("T1 placement: online orders stay unpaid until settlement", () => {
  it("creates a bkash order as payment_pending with NO payment row", async () => {
    const db = orderDb();
    adminHolder.db = db.asClient();
    const out = await createOrder(
      { ...baseInput("idem-t1-online-1"), paymentMethod: "bkash" },
      "subject-1",
    );
    expect(out.orderId).toBeTruthy();

    const orders = db.rows("orders");
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("payment_pending");

    // No premature money: no payment row exists before any charge.
    expect(db.rows("payments")).toHaveLength(0);

    // No paid event or paid funnel beacon before settlement either.
    const events = db.rows("order_events").map((e) => e.event_type);
    expect(events).toContain("order.placed");
    expect(events).not.toContain("order.paid");
    const paidBeacons = ingestBeaconsMock.mock.calls.filter((call) =>
      (call[2] as { action: string }[]).some((b) => b.action === "paid"),
    );
    expect(paidBeacons).toHaveLength(0);
  });

  it("leaves the COD confirmed path exactly as-is", async () => {
    const db = orderDb();
    adminHolder.db = db.asClient();
    const out = await createOrder(
      { ...baseInput("idem-t1-cod-1"), paymentMethod: "cod" },
      "subject-1",
    );
    expect(out.orderId).toBeTruthy();

    expect(db.rows("orders")[0].status).toBe("confirmed");
    const payments = db.rows("payments");
    expect(payments).toHaveLength(1);
    expect(payments[0].payment_status).toBe("pending");
    expect(payments[0].provider_reference).toBeNull();
    const events = db.rows("order_events").map((e) => e.event_type);
    expect(events).toContain("order.cod_confirmed");
  });
});

describe("T1 replay: same idempotency key returns the existing pending order", () => {
  it("replays without inserting a second order or payment row", async () => {
    const db = orderDb();
    db.rows("orders").push({
      id: "o-seed",
      merchant_id: "m1",
      order_number: "FQ-SEED-1",
      access_token: "tok-seed-12345678",
      status: "payment_pending",
      idempotency_key: "idem-t1-replay-1",
    });
    adminHolder.db = db.asClient();

    const out = await createOrder(
      { ...baseInput("idem-t1-replay-1"), paymentMethod: "bkash" },
      "subject-1",
    );
    expect(out.orderId).toBe("o-seed");
    expect(out.orderNumber).toBe("FQ-SEED-1");
    expect(db.rows("orders")).toHaveLength(1);
    expect(db.rows("payments")).toHaveLength(0);
  });
});

describe("T1 settlement: verified return settles, forged return is denied", () => {
  function settleDb() {
    return fakeDb({
      tables: {
        gateway_accounts: [
          {
            merchant_id: "m1",
            provider: "bkash",
            webhook_secret: "s3cr3t",
            active: true,
          },
        ],
        charge_intents: [
          {
            id: "intent-1",
            merchant_id: "m1",
            order_id: "o1",
            method: "bkash",
            attempt: 1,
            amount_minor_int: 1000,
            currency_code: "BDT",
            return_nonce: "n1",
            idempotency_key: "idem-settle-1",
            status: "pending",
          },
        ],
        orders: [
          {
            id: "o1",
            merchant_id: "m1",
            order_number: "FQ-SETTLE-1",
            access_token: "a".repeat(20),
            status: "payment_pending",
            total_minor_int: 1000,
          },
        ],
        merchants: [{ id: "m1", slug: "shop" }],
        payments: [],
        wallet_ledger_entries: [],
      },
      rpc: (fn) =>
        fn === "charge_intent_advance"
          ? { data: { ok: true }, error: null }
          : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
    });
  }

  it("denies a forged settle attempt: no status move, no payment row", async () => {
    const db = settleDb();
    adminHolder.db = db.asClient();
    await expect(
      applySignedReturn("intent-1", "paid", "bogus-signature", "attacker"),
    ).rejects.toMatchObject({ code: "payment.signature_invalid" });
    expect(PaymentError).toBeTruthy();
    expect(db.rows("orders")[0].status).toBe("payment_pending");
    expect(db.rows("payments")).toHaveLength(0);
    expect(db.rows("wallet_ledger_entries")).toHaveLength(0);
  });

  it("settles a pending order to paid with payment row + ledger + beacon", async () => {
    const db = settleDb();
    adminHolder.db = db.asClient();
    const sig = signReturn("s3cr3t", "intent-1", "paid", "n1");
    const res = await applySignedReturn("intent-1", "paid", sig, "shopper");
    expect(res.status).toBe("paid");
    expect(res.orderId).toBe("o1");

    expect(db.rows("orders")[0].status).toBe("paid");
    const payments = db.rows("payments");
    expect(payments).toHaveLength(1);
    expect(payments[0].payment_status).toBe("paid");

    const ledger = db.rows("wallet_ledger_entries");
    expect(ledger).toHaveLength(1);
    expect(ledger[0].source).toBe("order.captured");

    const paidBeacons = ingestBeaconsMock.mock.calls.filter((call) =>
      (call[2] as { action: string }[]).some((b) => b.action === "paid"),
    );
    expect(paidBeacons).toHaveLength(1);
    expect(paidBeacons[0][2]).toMatchObject([{ dedupeKey: "order:paid:o1" }]);
  });
});
