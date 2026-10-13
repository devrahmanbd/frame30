/**
 * orders-admin money fixes: refund ledger debit + hold-aware cancel.
 *
 * Defects under test:
 *  - `refundOrder` flips to refunded + inserts a refunds row with NO ledger
 *    debit. The sanctioned path is `advanceRefund(..., "settled")`
 *    (payments.server.ts) — money must not move without its ledger leg, and
 *    the order transition must fail when the ledger write fails.
 *  - `cancelOrder` restocks unconditionally without checking `stock_holds` —
 *    a double cancel (or a cancel over live holds) restores stock twice.
 *
 * Money-path rule (§A): every guard gets a deny case, a replay case and an
 * audit assertion — a happy path alone never ticks the gate.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb, type FakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

const shared = vi.hoisted(() => ({
  db: null as FakeDb | null,
  ledger: [] as Record<string, unknown>[],
  ledgerFailNext: false,
}));

const stepUpMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock("./observability.server", () => ({
  ...rec.holder!.observability,
  tenantLabel: (id: string | null | undefined) => (id ? `t_${id}` : "unknown"),
}));
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return shared.db;
  },
}));
vi.mock("./identity.server", () => ({
  requireStepUp: (...args: unknown[]) =>
    (stepUpMock as (...a: unknown[]) => Promise<boolean>)(...args),
}));
vi.mock("./ledger.server", () => ({
  postLedgerEntry: async (_c: unknown, entry: Record<string, unknown>) => {
    if (shared.ledgerFailNext) {
      shared.ledgerFailNext = false;
      throw new Error("ledger.write_failed");
    }
    shared.ledger.push(entry);
    return { id: `ledger-${shared.ledger.length}`, replayed: false };
  },
}));
vi.mock("./owner-ops.server", () => ({
  assertPaymentsNotFrozen: vi.fn(async () => {}),
}));

const { refundOrder, cancelOrder } = await import("./orders-admin.server");

type Client = SupabaseClient<Database>;
const asClient = (db: FakeDb) => db.asClient<Client>();

const MERCHANT = "m1";

/** In-test model of the `refund_advance` SQL routine's legal rail. */
function refundRailRpc(db: FakeDb) {
  const legal: Record<string, string[]> = {
    requested: ["processing", "failed", "cancelled"],
    processing: ["settled", "failed"],
    failed: ["processing", "cancelled"],
  };
  return (fn: string, args: Record<string, unknown>) => {
    if (fn !== "refund_advance")
      return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
    const row = db.rows("refunds").find((r) => r.id === args._refund_id);
    if (!row) return { data: null, error: { message: "refund_not_found" } };
    const to = String(args._to);
    if (row.status === to) return { data: { ...row }, error: null };
    if (!(legal[String(row.status)] ?? []).includes(to)) {
      return {
        data: null,
        error: { message: `invalid_refund_transition:${row.status} -> ${to}` },
      };
    }
    row.status = to;
    if (to === "settled") row.settled_at = new Date().toISOString();
    return { data: { ...row }, error: null };
  };
}

function refundDb(seed: Record<string, Record<string, unknown>[]> = {}) {
  const holder: { db: FakeDb | null } = { db: null };
  const db = fakeDb({
    tables: {
      orders: [
        {
          id: "o1",
          merchant_id: MERCHANT,
          status: "paid",
          total_minor_int: 5000,
          currency_code: "BDT",
          payment_method: "bkash",
        },
      ],
      refunds: [],
      order_events: [],
      ...seed,
    },
    rpc: (fn, args) =>
      holder.db
        ? refundRailRpc(holder.db)(fn, args)
        : { data: null, error: { message: "db_not_ready" } },
  });
  holder.db = db;
  return db;
}

beforeEach(() => {
  recorder.reset();
  shared.db = null;
  shared.ledger = [];
  shared.ledgerFailNext = false;
  stepUpMock.mockClear();
});

describe("refundOrder — ledger-backed settlement", () => {
  it("routes through the legal rail and posts the debit before flipping the order", async () => {
    const db = refundDb();
    shared.db = db;
    const out = await refundOrder(asClient(db), "o1", "damaged item");
    expect(out.status).toBe("refunded");
    expect(out.replayed).toBe(false);

    // The refund row rode requested → processing → settled through the
    // sanctioned rail, never a direct flip.
    const refund = db.rows("refunds")[0]!;
    expect(refund.status).toBe("settled");
    const rpcs = db.rpcCalls("refund_advance");
    expect(rpcs.map((c) => c.args._to)).toEqual(["processing", "settled"]);

    // The compensating ledger debit exists with the same idempotency key the
    // sanctioned path uses.
    expect(shared.ledger).toHaveLength(1);
    expect(shared.ledger[0]).toMatchObject({
      merchantId: MERCHANT,
      source: "order.refunded",
      direction: "debit",
      idempotencyKey: "refund:refund:o1",
    });

    // Only then did the order flip.
    expect(db.rows("orders")[0]!.status).toBe("refunded");
    expect(
      db
        .rows("order_events")
        .some((r) => r.order_id === "o1" && r.event_type === "refund.settled"),
    ).toBe(true);
  });

  it("fails the order transition when the ledger write fails (deny case)", async () => {
    const db = refundDb();
    shared.db = db;
    shared.ledgerFailNext = true;
    await expect(
      refundOrder(asClient(db), "o1", "damaged item"),
    ).rejects.toThrow(/ledger\.write_failed/);
    // Money did not move on paper: the order is NOT refunded and no settled
    // audit row claims otherwise.
    expect(db.rows("orders")[0]!.status).toBe("paid");
    expect(
      db
        .rows("order_events")
        .some((r) => r.order_id === "o1" && r.event_type === "refund.settled"),
    ).toBe(false);
    expect(shared.ledger).toHaveLength(0);
  });

  it("replays an existing refund without touching the rail or ledger (replay case)", async () => {
    const db = refundDb({
      refunds: [
        {
          id: "r9",
          order_id: "o1",
          merchant_id: MERCHANT,
          amount_minor_int: 5000,
          refund_key: "refund:o1",
          status: "settled",
        },
      ],
    });
    shared.db = db;
    const out = await refundOrder(asClient(db), "o1", "again");
    expect(out).toMatchObject({ refundId: "r9", replayed: true });
    expect(db.rpcCalls("refund_advance")).toHaveLength(0);
    expect(shared.ledger).toHaveLength(0);
  });

  it("refuses orders outside the refundable set before writing anything", async () => {
    const db = refundDb();
    db.rows("orders")[0]!.status = "cancelled";
    shared.db = db;
    await expect(refundOrder(asClient(db), "o1", "too late")).rejects.toThrow(
      /Only paid, delivered or refund-requested/,
    );
    expect(db.rows("refunds")).toHaveLength(0);
    expect(shared.ledger).toHaveLength(0);
  });
});

describe("cancelOrder — hold-aware single restore path", () => {
  function cancelDb(
    opts: {
      holds?: Record<string, unknown>[];
      stock?: number;
    } = {},
  ) {
    return fakeDb({
      tables: {
        orders: [
          {
            id: "o2",
            merchant_id: MERCHANT,
            status: "confirmed",
            total_minor_int: 2000,
          },
        ],
        order_items: [
          { id: "li1", order_id: "o2", variant_id: "v1", quantity: 2 },
        ],
        order_events: [],
        product_variants: [
          { id: "v1", merchant_id: MERCHANT, stock_quantity: opts.stock ?? 8 },
        ],
        stock_holds: opts.holds ?? [],
      },
    });
  }

  const liveHold = {
    id: "h1",
    checkout_token: "tok-1",
    merchant_id: MERCHANT,
    variant_id: "v1",
    quantity: 2,
    order_id: "o2",
    consumed_at: null,
    released_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };

  it("releases live holds instead of restocking lines (no double restore)", async () => {
    const db = cancelDb({ holds: [{ ...liveHold }] });
    shared.db = db;
    await cancelOrder(asClient(db), "o2", "customer asked");
    expect(db.rows("orders")[0]!.status).toBe("cancelled");
    // One restore only: 8 (post-reserve) + 2 (hold release) = 10, NOT 12.
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(10);
    expect(db.rows("stock_holds")[0]!.released_at).not.toBe(null);
  });

  it("restocks from lines when holds were already consumed", async () => {
    const db = cancelDb({
      holds: [{ ...liveHold, consumed_at: new Date().toISOString() }],
    });
    shared.db = db;
    await cancelOrder(asClient(db), "o2");
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(10);
    // Consumed holds are history: untouched by the cancel path.
    expect(db.rows("stock_holds")[0]!.released_at).toBe(null);
    expect(db.rows("stock_holds")[0]!.consumed_at).not.toBe(null);
  });

  it("restocks from lines when no holds exist (legacy path preserved)", async () => {
    const db = cancelDb();
    shared.db = db;
    await cancelOrder(asClient(db), "o2");
    expect(db.rows("orders")[0]!.status).toBe("cancelled");
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(10);
  });

  it("a second cancel throws and restores nothing twice (double-cancel case)", async () => {
    const db = cancelDb();
    shared.db = db;
    await cancelOrder(asClient(db), "o2");
    await expect(cancelOrder(asClient(db), "o2")).rejects.toThrow(
      /cannot be cancelled/,
    );
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(10);
  });

  it("refuses shipped orders without touching stock", async () => {
    const db = cancelDb();
    db.rows("orders")[0]!.status = "shipped";
    shared.db = db;
    await expect(cancelOrder(asClient(db), "o2")).rejects.toThrow(
      /once it has shipped/,
    );
    expect(Number(db.rows("product_variants")[0]!.stock_quantity)).toBe(8);
  });

  it("the status predicate guards the write (audit case)", async () => {
    const db = cancelDb();
    shared.db = db;
    await cancelOrder(asClient(db), "o2");
    const orderUpdates = db
      .callsOf("update")
      .filter((c) => c.table === "orders");
    expect(orderUpdates).toHaveLength(1);
    expect(orderUpdates[0]!.filters).toContainEqual({
      op: "eq",
      column: "status",
      value: "confirmed",
    });
  });
});
