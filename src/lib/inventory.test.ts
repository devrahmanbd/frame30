/**
 * Inventory, transfers and fulfilment — [A2] failure suite.
 *
 * Stock is the physical twin of money: a transfer that lands twice invents
 * units, and a fulfilment against nothing loses them.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { metricRecorder, allowAllRateLimits } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const inventory = await import("./inventory.server");
const { createTransfer, receiveTransfer, mapRpcError, CommerceError, loadLevels } = inventory;

const MERCHANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

beforeEach(() => recorder.reset());

describe("createTransfer", () => {
  const items = [{ variantId: "v-1", quantity: 3 }];

  it("denies a transfer to the same location (deny)", async () => {
    const db = fakeDb();
    await expect(
      createTransfer(db.asClient(), MERCHANT, "staff-1", {
        fromLocationId: "loc-1",
        toLocationId: "loc-1",
        items,
      }),
    ).rejects.toMatchObject({ code: "same_location" });
    expect(db.callsOf("insert")).toHaveLength(0);
  });

  it("denies an empty or fractional-only line set", async () => {
    const db = fakeDb();
    await expect(
      createTransfer(db.asClient(), MERCHANT, "staff-1", {
        fromLocationId: "loc-1",
        toLocationId: "loc-2",
        items: [{ variantId: "v-1", quantity: 0.4 }],
      }),
    ).rejects.toMatchObject({ code: "no_items" });
  });

  it("writes the transfer scoped to the merchant with integer quantities (audit)", async () => {
    const db = fakeDb();
    const transfer = await createTransfer(db.asClient(), MERCHANT, "staff-1", {
      fromLocationId: "loc-1",
      toLocationId: "loc-2",
      items: [{ variantId: "v-1", quantity: 3.9 }],
    });
    expect(transfer.merchant_id).toBe(MERCHANT);
    expect(transfer.status).toBe("in_transit");
    expect(transfer.reference).toMatch(/^TRF-/);
    const lines = db.rows("inventory_transfer_items");
    expect(lines).toHaveLength(1);
    expect(lines[0]!["quantity"]).toBe(3);
    expect(lines[0]!["merchant_id"]).toBe(MERCHANT);
    expect(recorder.of("framique_inventory_transfer_total", ["outcome", "created"])).toHaveLength(1);
  });
});

describe("receiveTransfer", () => {
  it("is idempotent: a second receive returns the same verdict, not new stock (replay)", async () => {
    let calls = 0;
    const db = fakeDb({
      rpc: () => {
        calls += 1;
        // The RPC holds the lock and reports the terminal state on replay.
        return { data: { ok: true, status: "received", replayed: calls > 1 }, error: null };
      },
    });
    const first: any = await receiveTransfer(db.asClient(), MERCHANT, "staff-1", "trf-1");
    const second: any = await receiveTransfer(db.asClient(), MERCHANT, "staff-1", "trf-1");
    expect(first.status).toBe("received");
    expect(second.status).toBe("received");
    expect(second.replayed).toBe(true);
    expect(db.rpcCalls("inventory_transfer_receive")).toHaveLength(2);
  });

  it("denies receiving a transfer the database rejects (deny)", async () => {
    const db = fakeDb({ rpc: () => ({ data: null, error: { message: "transfer_not_found" } }) });
    await expect(
      receiveTransfer(db.asClient(), MERCHANT, "staff-1", "nope"),
    ).rejects.toBeInstanceOf(CommerceError);
    expect(recorder.of("framique_inventory_transfer_total", ["outcome", "received"])).toHaveLength(0);
  });
});

describe("mapRpcError", () => {
  it("translates known codes and hides unknown database detail", () => {
    const known = mapRpcError("transfer_not_found: trf-9");
    expect(known).toBeInstanceOf(CommerceError);
    expect(known.code).toBe("transfer_not_found");

    const unknown = mapRpcError('duplicate key value violates unique constraint "idx_secret"');
    expect(unknown.message).not.toMatch(/idx_secret/);
  });
});

describe("tenant scoping", () => {
  it("reads stock levels only for the calling merchant", async () => {
    const db = fakeDb({
      tables: {
        inventory_levels: [
          { id: "l1", merchant_id: MERCHANT, on_hand: 5 },
          { id: "l2", merchant_id: OTHER, on_hand: 99 },
        ],
      },
    });
    const rows = await loadLevels(db.asClient(), MERCHANT);
    expect(rows.map((r: any) => r.id)).toEqual(["l1"]);
  });
});
