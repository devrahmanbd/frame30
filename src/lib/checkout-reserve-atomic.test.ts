/**
 * Checkout reserve atomicity: the take must be a single conditional UPDATE.
 *
 * Defects under test (`checkout.server.ts`):
 *  - `reserveStock` is read-modify-write guarded only by a tenant lock that
 *    degrades to isolate-local without Redis — two reserves that both read
 *    the last unit both write success (oversell).
 *  - `Math.max(0, stock - delta)` floors the take, masking the oversell
 *    instead of denying it.
 *  - `Math.max(1, ...)` coerces a quantity-0 line into reserving 1 unit.
 *
 * The lock is deliberately bypassed here (passthrough double): these tests
 * prove the UPDATE itself is atomic. The lock stays as belt-and-braces.
 *
 * Money-path rule (§A): every guard gets a deny case, a replay case and an
 * audit assertion — a happy path alone never ticks the gate.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeDb, type FakeDb } from "./__fixtures__/fake-db";
import { allowAllRateLimits } from "./__fixtures__/test-doubles";

const adminHolder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./observability.server", () => ({
  incr: vi.fn(),
  log: vi.fn(),
  observe: vi.fn(),
  withSpan: async <T>(_name: string, fn: () => Promise<T>) => fn(),
}));
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("./plugins.server", () => ({
  listInstalledPlugins: vi.fn(async () => []),
}));
vi.mock("./plugin-hooks.server", () => ({
  runHook: vi.fn(async () => []),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminHolder.db;
  },
}));
vi.mock("./redis-lock.server", () => ({
  withTenantLock: async <T>(
    _tenantId: string,
    _resource: string,
    _ttlMs: number,
    fn: (handle: never) => Promise<T>,
  ): Promise<T> => fn({} as never),
}));

const { reserveStock, sweepStockHolds } = await import("./checkout.server");

afterEach(() => {
  adminHolder.db = null;
});

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

type ProcQuery = {
  insert(rows: unknown): ProcQuery;
  update(patch: Record<string, unknown>): ProcQuery;
  single(): Promise<unknown>;
  then(onF?: unknown, onR?: unknown): Promise<unknown>;
  failWith(message: string): ProcQuery;
};

function reserveDb(stock = 10) {
  return fakeDb({
    tables: {
      product_variants: [
        { id: "v1", merchant_id: "m1", stock_quantity: stock },
        { id: "v2", merchant_id: "m1", stock_quantity: stock },
      ],
      stock_holds: [],
    },
  });
}

/**
 * Park every `product_variants` update at its terminal call so two reserves
 * can be interleaved with both reads observing the same stock — the exact
 * read-modify-write race window, forced deterministically.
 */
function parkVariantTakes(db: FakeDb) {
  const innerFrom = db.from.bind(db);
  const gates: Array<() => void> = [];
  const pending: Array<Promise<void>> = [];
  (db as unknown as { from: FakeDb["from"] }).from = ((table: string) => {
    const q = innerFrom(table) as unknown as ProcQuery;
    if (table !== "product_variants") return q;
    const state = { isTake: false, gateIdx: -1 };
    const origUpdate = q.update.bind(q);
    q.update = (patch: Record<string, unknown>) => {
      state.isTake = true;
      state.gateIdx = gates.length;
      let release!: () => void;
      pending.push(
        new Promise<void>((r) => {
          release = r;
        }),
      );
      gates.push(() => release());
      return origUpdate(patch);
    };
    const holdIfTake = (run: () => Promise<unknown>) => {
      if (!state.isTake) return run();
      return pending[state.gateIdx].then(run);
    };
    const origThen = q.then.bind(q);
    q.then = (onF?: unknown, onR?: unknown) =>
      holdIfTake(() => origThen(onF, onR) as Promise<unknown>);
    return q;
  }) as unknown as FakeDb["from"];
  return {
    get arrivals() {
      return gates.length;
    },
    release: (idx: number) => gates[idx]!(),
  };
}

describe("reserveStock — conditional take", () => {
  it("last-unit race: one reserve wins, the loser is denied, stock never negative", async () => {
    const db = reserveDb(1);
    adminHolder.db = db.asClient();
    const gate = parkVariantTakes(db);

    const p1 = reserveStock(
      "m1",
      "tok-a",
      [{ variantId: "v1", quantity: 1 }],
      "s1",
    );
    while (gate.arrivals < 1) await tick();
    // Both reads observed stock = 1: the exact oversell window, forced.
    const p2 = reserveStock(
      "m1",
      "tok-b",
      [{ variantId: "v1", quantity: 1 }],
      "s2",
    );
    while (gate.arrivals < 2) await tick();

    gate.release(0);
    await expect(p1).resolves.toMatchObject({ token: "tok-a" });
    gate.release(1);
    await expect(p2).rejects.toMatchObject({ code: "stock_insufficient" });

    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(0);
    expect(
      db.rows("stock_holds").filter((r) => r.variant_id === "v1"),
    ).toHaveLength(1);
  });

  it("sequential second take on the last unit is denied (deny case)", async () => {
    const db = reserveDb(1);
    adminHolder.db = db.asClient();
    await reserveStock("m1", "tok-a", [{ variantId: "v1", quantity: 1 }], "s1");
    await expect(
      reserveStock("m1", "tok-b", [{ variantId: "v1", quantity: 1 }], "s2"),
    ).rejects.toMatchObject({ code: "stock_insufficient" });
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(0);
  });

  it("the take carries the sufficiency predicate (audit case)", async () => {
    const db = reserveDb(5);
    adminHolder.db = db.asClient();
    await reserveStock("m1", "tok-a", [{ variantId: "v1", quantity: 2 }], "s1");
    const takes = db
      .callsOf("update")
      .filter((c) => c.table === "product_variants");
    expect(takes).toHaveLength(1);
    expect(takes[0]!.filters).toContainEqual({
      op: "gte",
      column: "stock_quantity",
      value: 2,
    });
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(3);
  });

  it("re-acquire with identical lines is a no-op (replay case)", async () => {
    const db = reserveDb(10);
    adminHolder.db = db.asClient();
    await reserveStock("m1", "tok-a", [{ variantId: "v1", quantity: 2 }], "s1");
    await reserveStock("m1", "tok-a", [{ variantId: "v1", quantity: 2 }], "s1");
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(8);
    expect(
      db.rows("stock_holds").filter((r) => r.checkout_token === "tok-a"),
    ).toHaveLength(1);
  });
});

describe("reserveStock — quantity hygiene", () => {
  it("quantity-0 lines reserve nothing (deny case)", async () => {
    const db = reserveDb(10);
    adminHolder.db = db.asClient();
    await expect(
      reserveStock("m1", "tok-z", [{ variantId: "v1", quantity: 0 }], "s"),
    ).rejects.toMatchObject({ code: "variant_missing" });
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(10);
    expect(db.rows("stock_holds")).toHaveLength(0);
  });

  it("quantity-0 lines are ignored alongside real lines", async () => {
    const db = reserveDb(10);
    adminHolder.db = db.asClient();
    await reserveStock(
      "m1",
      "tok-m",
      [
        { variantId: "v1", quantity: 0 },
        { variantId: "v2", quantity: 1 },
      ],
      "s",
    );
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(10);
    expect(Number(db.rows("product_variants")[1]!.stock_quantity)).toBe(9);
    expect(
      db.rows("stock_holds").filter((r) => r.variant_id === "v1"),
    ).toHaveLength(0);
  });

  it("fractional quantities floor without coercing to 1", async () => {
    const db = reserveDb(10);
    adminHolder.db = db.asClient();
    await reserveStock(
      "m1",
      "tok-f",
      [{ variantId: "v1", quantity: 2.7 }],
      "s",
    );
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(8);
    expect(db.rows("stock_holds")[0]!.quantity).toBe(2);
  });
});

describe("sweepStockHolds — cron-wireable contract", () => {
  it("returns the reclaimed count", async () => {
    const db = fakeDb({
      rpc: (fn) =>
        fn === "stock_hold_sweep"
          ? { data: 3, error: null }
          : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
    });
    adminHolder.db = db.asClient();
    await expect(sweepStockHolds()).resolves.toBe(3);
    expect(db.rpcCalls("stock_hold_sweep")).toHaveLength(1);
  });

  it("throws on RPC failure so the cron wrapper pages (alerting contract)", async () => {
    const db = fakeDb({
      rpc: () => ({ data: null, error: { message: "sweep_boom" } }),
    });
    adminHolder.db = db.asClient();
    await expect(sweepStockHolds()).rejects.toThrow(/sweep_boom/);
  });
});
