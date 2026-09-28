/**
 * T6: stock rollback sign + release scoping (RED → GREEN).
 *
 * 1. Failed-hold rollback must restore stock (curStock + delta), not
 *    double-decrement (curStock - delta).
 * 2. releaseStock must be merchant-scoped: releasing token T as merchant B
 *    must not touch merchant A's holds or stock, even though checkout
 *    tokens are client-generated predictable strings.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { allowAllRateLimits } from "./__fixtures__/test-doubles";

const adminHolder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./observability.server", () => ({
  incr: vi.fn(),
  log: vi.fn(),
  observe: vi.fn(),
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

const { reserveStock, releaseStock } = await import("./checkout.server");

afterEach(() => {
  adminHolder.db = null;
});

/** Fake store whose stock_holds INSERT always fails, to hit the rollback path. */
function failingHoldDb() {
  const db = fakeDb({
    tables: {
      product_variants: [{ id: "v1", merchant_id: "m1", stock_quantity: 10 }],
      stock_holds: [],
    },
  });
  const origFrom = db.from.bind(db);
  db.from = ((table: string) => {
    const q = origFrom(table) as unknown as Record<string, unknown>;
    if (table === "stock_holds") {
      const origInsert = (q["insert"] as (...a: unknown[]) => unknown).bind(q);
      (q as Record<string, unknown>)["insert"] = (...args: unknown[]) => {
        const qb = origInsert(...args) as Record<string, unknown>;
        qb["then"] = (
          onF?: (v: unknown) => unknown,
          onR?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: null,
            error: { message: "hold_insert_boom" },
          }).then(onF, onR);
        return qb;
      };
    }
    return q;
  }) as unknown as typeof db.from;
  return db;
}

describe("T6 rollback sign", () => {
  it("restores stock when the hold insert fails (no double-decrement)", async () => {
    const db = failingHoldDb();
    adminHolder.db = db.asClient();
    await expect(
      reserveStock(
        "m1",
        "tok-rollback",
        [{ variantId: "v1", quantity: 2 }],
        "s1",
      ),
    ).rejects.toThrow();
    const stock = Number(db.rows("product_variants")[0]!.stock_quantity);
    expect(stock).toBe(10);
  });
});

describe("T6 release scoping", () => {
  function twoMerchantDb() {
    return fakeDb({
      tables: {
        product_variants: [
          { id: "v1", merchant_id: "m-victim", stock_quantity: 8 },
          { id: "v9", merchant_id: "m-other", stock_quantity: 5 },
        ],
        stock_holds: [
          {
            checkout_token: "tok-shared",
            merchant_id: "m-victim",
            variant_id: "v1",
            quantity: 2,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            consumed_at: null,
            released_at: null,
          },
        ],
      },
    });
  }

  it("releasing as a foreign merchant leaves victim holds and stock alone", async () => {
    const db = twoMerchantDb();
    adminHolder.db = db.asClient();
    await releaseStock("tok-shared", "m-other");
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(8);
    expect(db.rows("stock_holds")[0]!.released_at).toBe(null);
  });

  it("releasing as the owning merchant still restores stock", async () => {
    const db = twoMerchantDb();
    adminHolder.db = db.asClient();
    await releaseStock("tok-shared", "m-victim");
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(10);
    expect(db.rows("stock_holds")[0]!.released_at).not.toBe(null);
  });

  it("bare-token release (no merchant scope) is rejected and changes nothing", async () => {
    const db = twoMerchantDb();
    adminHolder.db = db.asClient();
    await expect(
      releaseStock("tok-shared", undefined as unknown as string),
    ).resolves.toBe(false);
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(8);
    expect(db.rows("stock_holds")[0]!.released_at).toBe(null);
    const { log } = await import("./observability.server");
    expect(vi.mocked(log)).toHaveBeenCalledWith(
      "warn",
      "checkout.release_unscoped",
      expect.anything(),
    );
  });

  it("empty-string merchant scope is rejected and changes nothing", async () => {
    const db = twoMerchantDb();
    adminHolder.db = db.asClient();
    await expect(releaseStock("tok-shared", "")).resolves.toBe(false);
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(8);
    expect(db.rows("stock_holds")[0]!.released_at).toBe(null);
  });

  it("bogus merchant scope matches no holds and changes nothing", async () => {
    const db = twoMerchantDb();
    adminHolder.db = db.asClient();
    await releaseStock("tok-shared", "m-bogus");
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(8);
    expect(db.rows("stock_holds")[0]!.released_at).toBe(null);
  });
});
