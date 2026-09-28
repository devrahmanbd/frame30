/**
 * T4 — atomic order creation on idempotency key (+ coupon counters).
 *
 * Defects under test (verified 2026-09-28):
 *  - replay lookup is check-then-insert with no unique backstop
 *    (`orders.server.ts` lookup vs insert): two submits that both pass the
 *    lookup can stack duplicate orders (or, once a constraint exists, the
 *    loser 500s instead of replaying the winner);
 *  - coupon `redeemed_count` is read-modify-write with no `usage_limit`
 *    guard at write time, so redemptions overshoot the cap;
 *  - a failed `coupon_redemptions` insert is silently skipped (`continue`),
 *    granting the discount without recording it.
 *
 * Money-path rule (§A): every guard gets a deny case, a replay case and an
 * audit assertion — a happy path alone never ticks the gate.
 *
 * NOTE on determinism: the race window is forced by parking both submits at
 * the `orders` insert terminal and releasing them in order, NOT by
 * `Promise.all`. Concurrent in-flight dynamic `import()`s of a mocked module
 * bypass the mock registry in this vitest version (probe: sequential
 * `await import()`s share one namespace, `Promise.all([import, import])`
 * yields two — the loser evaluates the real module), so true-parallel
 * E2E through `createOrder` is harness-flaky. The park-and-release
 * interleaving exercises the exact same window — both lookups observe an
 * empty table — deterministically.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fakeDb, type FakeDb, type Row } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

const adminHolder = vi.hoisted(() => ({ db: null as FakeDb | null }));
const priceCartMock = vi.hoisted(() => vi.fn());
const listInstalledPluginsMock = vi.hoisted(() => vi.fn());

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
  ingestBeacons: vi.fn(async () => {}),
}));
vi.mock("./geo.server", () => ({ requestGeo: vi.fn(async () => ({})) }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => null),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminHolder.db;
  },
}));
vi.mock("./plugins.server", () => ({
  listInstalledPlugins: listInstalledPluginsMock,
}));
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

const { createOrder } = await import("./orders.server");
const { CouponError } = await import("./coupons.server");

const MERCHANT = "m1";

type Totals = {
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  codSurchargeMinor: number;
  vatMinor: number;
  vatRateBasisPoints: number;
  totalMinor: number;
  coupon: Row | null;
  coupons: Row[];
};

function baseTotals(coupons: Row[] = []): Totals {
  return {
    currency: "BDT",
    subtotalMinor: 1000,
    discountMinor: coupons.reduce((s, c) => s + (c.discountMinor ?? 0), 0),
    shippingMinor: 0,
    codSurchargeMinor: 0,
    vatMinor: 0,
    vatRateBasisPoints: 0,
    totalMinor: 1000,
    coupon: coupons[0] ?? null,
    coupons,
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
  } as unknown as Totals;
}

function seedPricing(coupons: Row[] = []) {
  priceCartMock.mockResolvedValue({
    merchant: { id: MERCHANT },
    totals: baseTotals(coupons),
  });
}

function orderDb(
  seed: Record<string, Row[]> = {},
  rpc?: (fn: string, args: Record<string, unknown>) => unknown,
) {
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
      product_variants: [
        { id: "v1", merchant_id: MERCHANT, stock_quantity: 10 },
      ],
      ...seed,
    },
    unique: [{ table: "orders", columns: ["merchant_id", "idempotency_key"] }],
    rpc: rpc as never,
  });
}

function input(key: string, token: string) {
  return {
    slug: "shop",
    cart: [{ variantId: "v1", quantity: 1 }],
    paymentMethod: "cod" as const,
    idempotencyKey: key,
    checkoutToken: token,
    customer: {
      name: "Ayesha",
      phone: "01700000000",
      addressLine: "Dhaka",
      city: "Dhaka",
    },
  };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Minimal structural surface of the fake query builder used to park inserts
 * and force redemption failures. Keeps the test free of `any` casts.
 */
type ProcQuery = {
  insert(rows: unknown): ProcQuery;
  single(): Promise<unknown>;
  then(onF?: unknown, onR?: unknown): Promise<unknown>;
  failWith(message: string): ProcQuery;
};

/**
 * Park every `orders`-table insert at its terminal call. Each insert gets
 * its own gate; the test releases gates explicitly to force an interleaving.
 * Selects (including the replay lookup) pass through untouched.
 */
function parkOrderInserts(db: FakeDb) {
  const innerFrom = db.from.bind(db);
  const gates: Array<() => void> = [];
  const pending: Array<Promise<void>> = [];
  (db as unknown as { from: FakeDb["from"] }).from = ((table: string) => {
    const q = innerFrom(table) as unknown as ProcQuery;
    if (table !== "orders") return q;
    const state = { isInsert: false, gateIdx: -1 };
    const origInsert = q.insert.bind(q);
    q.insert = (rows: unknown) => {
      state.isInsert = true;
      state.gateIdx = gates.length;
      let release!: () => void;
      pending.push(
        new Promise<void>((r) => {
          release = r;
        }),
      );
      gates.push(() => release());
      return origInsert(rows);
    };
    const holdIfInsert = (run: () => Promise<unknown>) => {
      if (!state.isInsert) return run();
      return pending[state.gateIdx].then(run);
    };
    const origSingle = q.single.bind(q);
    q.single = () => holdIfInsert(() => origSingle() as Promise<unknown>);
    const origThen = q.then.bind(q);
    q.then = (onF?: unknown, onR?: unknown) =>
      holdIfInsert(() => origThen(onF, onR) as Promise<unknown>);
    return q;
  }) as unknown as FakeDb["from"];
  return {
    get arrivals() {
      return gates.length;
    },
    release: (idx: number) => gates[idx](),
  };
}

/**
 * In-test model of the `redeem_coupon_slot` SQL function the migration
 * installs: single synchronous check-and-increment, so it is atomic under
 * JS interleaving exactly like the guarded UPDATE is under Postgres.
 * Returns zero rows when the cap is hit (the deny signal).
 */
function couponSlotRpc(db: FakeDb) {
  return (fn: string, args: Record<string, unknown>) => {
    if (fn !== "redeem_coupon_slot")
      return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
    const coupon = db.rows("coupons").find((r) => r.id === args._coupon_id);
    if (!coupon) return { data: null, error: { message: "coupon_not_found" } };
    const limit =
      coupon.usage_limit === null || coupon.usage_limit === undefined
        ? null
        : Number(coupon.usage_limit);
    if (limit !== null && Number(coupon.redeemed_count ?? 0) >= limit)
      return { data: [], error: null };
    coupon.redeemed_count = Number(coupon.redeemed_count ?? 0) + 1;
    return {
      data: [
        {
          slot_coupon_id: coupon.id,
          slot_redeemed: coupon.redeemed_count,
          slot_limit: limit,
        },
      ],
      error: null,
    };
  };
}

const COUPON = {
  id: "c1",
  code: "SAVE",
  discountMinor: 100,
  freeShipping: false,
};

/** FakeDb whose `redeem_coupon_slot` rpc behaves like the migration's SQL. */
function couponDb(coupons: Row[]): FakeDb {
  const holder: { db: FakeDb | null } = { db: null };
  const db = orderDb({ coupons }, (fn, args) =>
    holder.db
      ? couponSlotRpc(holder.db)(fn, args)
      : { data: null, error: { message: "db_not_ready" } },
  );
  holder.db = db;
  return db;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
  listInstalledPluginsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  recorder.reset();
  priceCartMock.mockReset();
  listInstalledPluginsMock.mockReset();
  adminHolder.db = null;
});

describe("T4 — same-key submits that both pass the lookup create one order", () => {
  it("forced race window converges on one row; the loser replays the winner", async () => {
    const db = orderDb();
    const gate = parkOrderInserts(db);
    adminHolder.db = db.asClient<FakeDb>();
    seedPricing();

    // Submit A runs to its insert and parks: lookup saw an empty table,
    // stock reserved, nothing written yet.
    const p1 = createOrder(input("idem-race-1", "ctok-a"), "subject-1");
    while (gate.arrivals < 1) await tick();
    // Submit B runs to its insert and parks: ITS lookup also saw an empty
    // table — the exact check-then-insert race window, forced.
    expect(
      db.rows("orders").filter((r) => r.idempotency_key === "idem-race-1"),
    ).toHaveLength(0);
    const p2 = createOrder(input("idem-race-1", "ctok-b"), "subject-1");
    while (gate.arrivals < 2) await tick();

    gate.release(0); // A wins the insert and runs to completion.
    const a = await p1;
    gate.release(1); // B loses: must replay A, never stack or 500.
    const b = await p2;

    expect(b.orderId).toBe(a.orderId);
    expect(b.orderNumber).toBe(a.orderNumber);
    expect(b.accessToken).toBe(a.accessToken);
    expect(
      db.rows("orders").filter((r) => r.idempotency_key === "idem-race-1"),
    ).toHaveLength(1);
    // No stacked line/payment rows for the loser.
    expect(
      db.rows("order_items").filter((r) => r.order_id === a.orderId),
    ).toHaveLength(1);
    expect(
      db.rows("payments").filter((r) => r.order_id === a.orderId),
    ).toHaveLength(1);
    // Stock math: two takes (10→8), winner consumes, loser releases → 9.
    expect(
      (db.rows("product_variants").find((r) => r.id === "v1") as Row)
        .stock_quantity,
    ).toBe(9);
    // Audit: the loser is recorded as a replay, never a second creation.
    expect(
      recorder.of("framique_orders_total", ["outcome", "replayed"]).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("sequential retry with the same key replays without new rows", async () => {
    const db = orderDb();
    adminHolder.db = db.asClient<FakeDb>();
    seedPricing();

    const first = await createOrder(input("idem-replay-1", "ctok-r1"), "s");
    const second = await createOrder(input("idem-replay-1", "ctok-r2"), "s");

    expect(second.orderId).toBe(first.orderId);
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(second.accessToken).toBe(first.accessToken);
    expect(db.rows("orders")).toHaveLength(1);
    expect(db.rows("payments")).toHaveLength(1);
    expect(db.rows("order_items")).toHaveLength(1);
  });
});

describe("T4 — coupon counters are atomic and loud", () => {
  it("redemptions never overshoot usage_limit: the second order is denied (deny case)", async () => {
    const db = couponDb([{ id: "c1", usage_limit: 1, redeemed_count: 0 }]);
    adminHolder.db = db.asClient<FakeDb>();
    seedPricing([{ ...COUPON }]);

    const first = await createOrder(input("idem-coupon-a", "ctok-ca"), "s");
    expect(first.orderId).toBeTruthy();
    await expect(
      createOrder(input("idem-coupon-b", "ctok-cb"), "s"),
    ).rejects.toMatchObject({ code: "coupon_usage_limit" });

    // The cap holds exactly: no overshoot, no orphan redemption row.
    expect(
      (db.rows("coupons").find((r) => r.id === "c1") as Row).redeemed_count,
    ).toBe(1);
    expect(
      db.rows("coupon_redemptions").filter((r) => r.coupon_id === "c1"),
    ).toHaveLength(1);
  });

  it("a failed redemption insert fails loudly, never grants a silent discount", async () => {
    const db = orderDb(
      { coupons: [{ id: "c1", usage_limit: 10, redeemed_count: 0 }] },
      (fn, args) => couponSlotRpc(db)(fn, args),
    );
    const innerFrom = db.from.bind(db);
    (db as unknown as { from: FakeDb["from"] }).from = ((table: string) => {
      const q = innerFrom(table) as unknown as ProcQuery;
      if (table === "coupon_redemptions") return q.failWith("redeem_boom");
      return q;
    }) as unknown as FakeDb["from"];
    adminHolder.db = db.asClient<FakeDb>();
    seedPricing([{ ...COUPON }]);

    await expect(
      createOrder(input("idem-coupon-loud", "ctok-loud"), "s"),
    ).rejects.toThrow("coupon_redeem_failed");
    // No phantom count for a redemption that never recorded.
    expect(
      (db.rows("coupons").find((r) => r.id === "c1") as Row).redeemed_count,
    ).toBe(0);
  });

  it("happy path records the coupon.redeemed audit event (audit case)", async () => {
    const db = couponDb([{ id: "c1", usage_limit: 10, redeemed_count: 0 }]);
    adminHolder.db = db.asClient<FakeDb>();
    seedPricing([{ ...COUPON }]);

    const out = await createOrder(input("idem-coupon-ok", "ctok-ok"), "s");
    expect(out.orderId).toBeTruthy();
    expect(
      (db.rows("coupons").find((r) => r.id === "c1") as Row).redeemed_count,
    ).toBe(1);
    const events = db
      .rows("order_events")
      .filter((r) => r.order_id === out.orderId)
      .map((r) => r.event_type);
    expect(events).toContain("order.placed");
    expect(events).toContain("coupon.redeemed");
  });
});

describe("T4 — migration contract (static pin)", () => {
  const MIGRATION =
    "supabase/migrations/20260928000000_orders_idempotency_backstop.sql";

  it("installs the (merchant_id, idempotency_key) unique backstop + guarded slot RPC", () => {
    const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf-8");
    expect(sql).toContain(
      "create unique index if not exists orders_merchant_idem_key_uidx",
    );
    expect(sql).toContain("(merchant_id, idempotency_key)");
    // Dedupe keeps the earliest row per tuple — never a blind wipe.
    expect(sql).toMatch(/keep earliest|EARLIEST/i);
    expect(sql).toContain("redeem_coupon_slot");
    expect(sql).toMatch(/redeemed_count\s*<\s*usage_limit/);
  });
});
