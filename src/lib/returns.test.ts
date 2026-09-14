/**
 * Returns & disputes — [A2]/[A6] failure suite.
 *
 * Both surfaces move money after the sale, so the guards that matter are the
 * ones that refuse: an empty return, a reasonless return, a rejected state
 * transition. Each refusal must be countable.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { metricRecorder, allowAllRateLimits } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { openReturn, advanceReturn, openDispute, advanceDispute, loadReturns } = await import(
  "./returns.server"
);

const MERCHANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

beforeEach(() => recorder.reset());

describe("openReturn", () => {
  const items = [{ orderItemId: "oi-1", quantity: 2 }];

  it("denies a return with no items and never reaches the database", async () => {
    const db = fakeDb();
    await expect(
      openReturn(db.asClient(), { orderId: "o-1", reason: "damaged", items: [], subject: "s" }),
    ).rejects.toMatchObject({ code: "return_items_required" });
    expect(db.rpcCalls()).toHaveLength(0);
  });

  it("clamps nonsensical quantities to one unit instead of trusting the caller", async () => {
    const db = fakeDb({ rpc: () => ({ data: { id: "ret-1" }, error: null }) });
    await openReturn(db.asClient(), {
      orderId: "o-1",
      reason: "damaged",
      items: [{ orderItemId: "oi-1", quantity: 0 }, { orderItemId: "oi-2", quantity: -3 }],
      subject: "s",
    });
    const args = db.rpcCalls("return_open")[0]!.args as any;
    expect(args._items.map((i: any) => i.quantity)).toEqual([1, 1]);
  });

  it("denies a return without a reason", async () => {
    const db = fakeDb();
    await expect(
      openReturn(db.asClient(), { orderId: "o-1", reason: "   ", items, subject: "s" }),
    ).rejects.toMatchObject({ code: "reason_required" });
  });

  it("counts a database refusal as a rejection (deny + audit)", async () => {
    const db = fakeDb({
      rpc: () => ({ data: null, error: { message: "return_window_closed" } }),
    });
    await expect(
      openReturn(db.asClient(), { orderId: "o-1", reason: "damaged", items, subject: "s" }),
    ).rejects.toBeTruthy();
    expect(recorder.of("framique_return_total", ["outcome", "rejected"])).toHaveLength(1);
    expect(recorder.of("framique_return_total", ["outcome", "opened"])).toHaveLength(0);
  });

  it("normalises the payload it sends and counts the opening (audit)", async () => {
    const db = fakeDb({ rpc: () => ({ data: { id: "ret-1" }, error: null }) });
    await openReturn(db.asClient(), {
      orderId: "o-1",
      reason: `  ${"x".repeat(400)}  `,
      items: [{ orderItemId: "oi-1", quantity: 2.9 }],
      subject: "s",
    });
    const args = db.rpcCalls("return_open")[0]!.args as any;
    expect(args._reason).toHaveLength(200);
    expect(args._items).toEqual([{ order_item_id: "oi-1", quantity: 2, restock: true }]);
    expect(recorder.of("framique_return_total", ["outcome", "opened"])).toHaveLength(1);
  });
});

describe("advanceReturn", () => {
  it("labels the audit counter with the destination state", async () => {
    const db = fakeDb({ rpc: () => ({ data: { id: "ret-1" }, error: null }) });
    await advanceReturn(db.asClient(), MERCHANT, "staff-1", {
      returnId: "ret-1",
      status: "approved",
    });
    expect(recorder.of("framique_return_state_total", ["status", "approved"])).toHaveLength(1);
  });

  it("denies an illegal transition refused by the state machine (deny)", async () => {
    const db = fakeDb({
      rpc: () => ({ data: null, error: { message: "return_transition_invalid" } }),
    });
    await expect(
      advanceReturn(db.asClient(), MERCHANT, "staff-1", { returnId: "ret-1", status: "refunded" }),
    ).rejects.toBeTruthy();
    expect(recorder.of("framique_return_state_total")).toHaveLength(0);
  });

  it("replaying the same advance keeps the state machine as the single authority", async () => {
    // Both calls hit the DB FSM with identical arguments; the FSM — not this
    // layer — decides whether the second one is a no-op.
    const db = fakeDb({ rpc: () => ({ data: { id: "ret-1", status: "approved" }, error: null }) });
    const input = { returnId: "ret-1", status: "approved" as const };
    const a = await advanceReturn(db.asClient(), MERCHANT, "staff-1", input);
    const b = await advanceReturn(db.asClient(), MERCHANT, "staff-1", input);
    expect(a).toEqual(b);
    const calls = db.rpcCalls("return_advance");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.args).toEqual(calls[1]!.args);
  });
});

describe("disputes", () => {
  it("counts an opened dispute", async () => {
    const db = fakeDb({ rpc: () => ({ data: { id: "d-1" }, error: null }) });
    await openDispute(db.asClient(), MERCHANT, "staff-1", {
      orderId: "o-1",
      reason: "chargeback",
      amountMinorInt: 1500,
    } as any);
    expect(recorder.of("framique_dispute_total").length).toBeGreaterThan(0);
  });

  it("denies a dispute the database refuses", async () => {
    const db = fakeDb({ rpc: () => ({ data: null, error: { message: "dispute_exists" } }) });
    await expect(
      advanceDispute(db.asClient(), MERCHANT, "staff-1", {
        disputeId: "d-1",
        status: "won",
      } as any),
    ).rejects.toBeTruthy();
  });
});

describe("tenant scoping", () => {
  it("never returns another merchant's returns", async () => {
    const db = fakeDb({
      tables: {
        return_requests: [
          { id: "r1", merchant_id: MERCHANT, status: "requested" },
          { id: "r2", merchant_id: OTHER, status: "requested" },
        ],
      },
    });
    const rows = await loadReturns(db.asClient(), MERCHANT);
    expect(rows.map((r: any) => r.id)).toEqual(["r1"]);
  });
});
