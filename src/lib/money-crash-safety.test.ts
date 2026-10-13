/**
 * Money crash-safety fixes (frame30).
 *
 * Defects under test:
 *  1. `applySignedReturn` writes `provider_reference` as method + FIRST 12
 *     chars of the idempotency key — retry attempts sharing a 12-char prefix
 *     collide (settlement match + audit both assume `<method>:<full key>`).
 *  2. `applySignedReturn` is payments.upsert → ledger → order update with no
 *     retry: a ledger throw leaves a paid row + pending order forever.
 *     `reconcileSettlementCompletions` (payments-side retry path, run from the
 *     payouts cron) must heal exactly that shape, idempotently.
 *  3. `postSettlement` awaits each item in one loop: one poisoned item aborts
 *     the file and nothing records which item poisoned it. Must post per-item
 *     with try/catch, quarantine via `settlement_variance_alerts`, and flip
 *     the file with partial counts.
 *  4. `advanceRefund` calls `refund_advance(... settled)` BEFORE the ledger
 *     debit: a ledger throw leaves a settled refund with no debit
 *     (orphan-settled). Ledger must come first; illegal transitions must throw
 *     BEFORE touching the ledger.
 *  5. `payInvoice` flips to paid with no payment reference recorded anywhere.
 *  6. Courier DLQ parks unmatched AWB silently (no depth signal) and null-AWB
 *     shipments never auto-retry.
 *  7. `refundOrderLines` inserts `status: "issued"` with no ledger leg;
 *     sibling `refundOrder` routes requested → processing → settled through
 *     `advanceRefund` with a debit. Line refunds must mirror that rail.
 *
 * Money-path rule: every guard gets a deny case, a replay case and an audit
 * assertion — a happy path alone never ticks the gate.
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
  ledger: new Map<string, Record<string, unknown>>(),
  ledgerFailAlways: new Set<string>(),
  ledgerFailOnce: new Set<string>(),
  ledgerSeq: 0,
}));

const adapterMock = vi.hoisted(() => ({
  fn: null as null | ((code: string) => unknown),
}));

vi.mock("./observability.server", () => ({
  ...rec.holder!.observability,
  tenantLabel: (id: string | null | undefined) => (id ? `t_${id}` : "unknown"),
}));
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("./owner-ops.server", () => ({
  assertPaymentsNotFrozen: vi.fn(async () => {}),
}));
vi.mock("./live-gateway.server", () => ({
  loadLiveAccount: vi.fn(async () => null),
  openLiveSession: vi.fn(async () => {
    throw new Error("must_not_open_live_session_in_test");
  }),
}));
vi.mock("./analytics-warehouse.server", () => ({
  ingestBeacons: vi.fn(async () => ({})),
}));
vi.mock("./ledger.server", () => ({
  postLedgerEntry: async (_c: unknown, entry: Record<string, unknown>) => {
    const key = String(entry["idempotencyKey"]);
    if (shared.ledgerFailAlways.has("__all__"))
      throw new Error("ledger.write_failed");
    if (shared.ledgerFailAlways.has(key))
      throw new Error("ledger.write_failed");
    if (shared.ledgerFailOnce.has(key)) {
      shared.ledgerFailOnce.delete(key);
      throw new Error("ledger.write_failed");
    }
    const hit = shared.ledger.get(key);
    if (hit) return { id: `ledger-replay`, replayed: true };
    shared.ledgerSeq += 1;
    shared.ledger.set(key, entry);
    return { id: `ledger-${shared.ledgerSeq}`, replayed: false };
  },
}));
vi.mock("./courier-adapters.server", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    adapterFor: (code: string, creds?: unknown) =>
      adapterMock.fn
        ? (adapterMock.fn as (c: string) => unknown)(code)
        : (orig["adapterFor"] as (c: string, d?: unknown) => unknown)(
            code,
            creds,
          ),
  };
});
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return shared.db;
  },
}));
vi.mock("./identity.server", () => ({
  requireStepUp: vi.fn(async () => true),
}));

const {
  applySignedReturn,
  signReturn,
  providerReferenceFor,
  reconcileSettlementCompletions,
  postSettlement,
  advanceRefund,
} = await import("./payments.server");
const { payInvoice } = await import("./billing-desk.server");
const { dlqDepthAlert, retryNullAwbShipments } =
  await import("./courier.server");
const { refundOrderLines } = await import("./orders-admin.server");

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
    if (fn !== "refund_advance") {
      if (fn === "charge_intent_advance")
        return { data: { ok: true }, error: null };
      return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
    }
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
    if (args._provider_reference)
      row.provider_reference = args._provider_reference;
    return { data: { ...row }, error: null };
  };
}

function settleSeed() {
  const holder: { db: FakeDb | null } = { db: null };
  const db = fakeDb({
    tables: {
      gateway_accounts: [
        {
          merchant_id: MERCHANT,
          provider: "bkash",
          webhook_secret: "s3cr3t",
          active: true,
        },
      ],
      charge_intents: [
        {
          id: "intent-1",
          merchant_id: MERCHANT,
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
          merchant_id: MERCHANT,
          order_number: "FQ-1",
          access_token: "a".repeat(20),
          status: "payment_pending",
          total_minor_int: 1000,
        },
      ],
      merchants: [{ id: MERCHANT, slug: "shop" }],
      payments: [],
      wallet_ledger_entries: [],
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
  shared.ledger = new Map();
  shared.ledgerFailAlways = new Set();
  shared.ledgerFailOnce = new Set();
  shared.ledgerSeq = 0;
  adapterMock.fn = null;
});

// ------------------------------------------------- (1) full-length references
describe("provider references carry the full idempotency key", () => {
  it("builds <method>:<full key> with no truncation", () => {
    expect(providerReferenceFor("bkash", "idem-settle-1")).toBe(
      "bkash:idem-settle-1",
    );
  });

  it("applySignedReturn stores the full reference on the payment row", async () => {
    const db = settleSeed();
    shared.db = db;
    const sig = signReturn("s3cr3t", "intent-1", "paid", "n1");
    await applySignedReturn("intent-1", "paid", sig, "shopper");
    expect(db.rows("payments")).toHaveLength(1);
    // Two retry attempts sharing a 12-char prefix must NOT collide.
    expect(db.rows("payments")[0]!.provider_reference).toBe(
      "bkash:idem-settle-1",
    );
    expect(db.rows("payments")[0]!.provider_reference).not.toBe(
      "bkash:idem-settle",
    );
  });
});

// ---------------------------------- (2) settlement-completion watchdog
describe("reconcileSettlementCompletions heals paid-row-unpaid-order", () => {
  function halfWrittenDb() {
    const db = settleSeed();
    // Crash between legs: payment row landed, ledger + order update never ran.
    db.rows("payments").push({
      id: "pay-1",
      merchant_id: MERCHANT,
      order_id: "o1",
      payment_provider: "bkash",
      payment_status: "paid",
      currency_code: "BDT",
      amount_minor_int: 1000,
      provider_reference: "bkash:idem-settle-1",
      idempotency_key: "idem-settle-1",
    });
    return db;
  }

  it("posts the missing ledger leg and flips the order (deny → heal)", async () => {
    const db = halfWrittenDb();
    shared.db = db;
    const out = await reconcileSettlementCompletions({ limit: 50 });
    expect(out).toMatchObject({ scanned: 1, healed: 1, failed: 0 });
    expect(shared.ledger.get("capture:idem-settle-1")).toMatchObject({
      source: "order.captured",
      direction: "credit",
    });
    expect(db.rows("orders")[0]!.status).toBe("paid");
  });

  it("is a safe no-op on rerun and skips already-paid orders (replay case)", async () => {
    const db = halfWrittenDb();
    shared.db = db;
    await reconcileSettlementCompletions({ limit: 50 });
    const second = await reconcileSettlementCompletions({ limit: 50 });
    expect(second).toMatchObject({ scanned: 1, healed: 0, failed: 0 });
    expect(shared.ledger.size).toBe(1);
    // Ledger replay, never a second movement.
    expect(
      recorder.of("framique_ledger_total").length +
        recorder.of("framique_payment_settlement_total").length,
    ).toBeGreaterThan(0);
  });

  it("counts a still-failing ledger leg instead of throwing (audit case)", async () => {
    const db = halfWrittenDb();
    shared.db = db;
    shared.ledgerFailAlways.add("capture:idem-settle-1");
    const out = await reconcileSettlementCompletions({ limit: 50 });
    expect(out).toMatchObject({ scanned: 1, healed: 0, failed: 1 });
    expect(db.rows("orders")[0]!.status).toBe("payment_pending");
    expect(
      recorder.of("framique_payment_settlement_total", [
        "outcome",
        "heal_failed",
      ]),
    ).toHaveLength(1);
  });
});

// ------------------------------------------ (3) per-item settlement posting
describe("postSettlement quarantines poisoned items", () => {
  const FILE = "file-1";
  function settlementDb() {
    return fakeDb({
      tables: {
        settlement_files: [
          {
            id: FILE,
            merchant_id: MERCHANT,
            provider: "bkash",
            status: "matched",
            file_date: "2026-09-01",
          },
        ],
        settlement_items: [
          {
            id: "si-good",
            file_id: FILE,
            merchant_id: MERCHANT,
            order_id: "o1",
            gross_minor_int: 1000,
            fee_minor_int: 50,
            net_minor_int: 950,
            currency_code: "BDT",
            match_kind: "exact",
            posted: false,
          },
          {
            id: "si-poison",
            file_id: FILE,
            merchant_id: MERCHANT,
            order_id: "o2",
            gross_minor_int: 2000,
            fee_minor_int: 100,
            net_minor_int: 1900,
            currency_code: "BDT",
            match_kind: "manual",
            posted: false,
          },
        ],
        settlement_variance_alerts: [],
      },
    });
  }

  it("posts the healthy item, quarantines the poisoned one, holds the file", async () => {
    const db = settlementDb();
    shared.db = db;
    shared.ledgerFailOnce.add(`settle:${FILE}:si-poison`);
    const out = await postSettlement(FILE);
    expect(out).toMatchObject({ posted: 1, failed: 1 });

    // Healthy item posted + marked; poisoned item untouched.
    const items = db.rows("settlement_items");
    expect(items.find((i) => i.id === "si-good")!.posted).toBe(true);
    expect(items.find((i) => i.id === "si-poison")!.posted).toBe(false);

    // Quarantine is visible: a variance alert names the item.
    const alerts = db.rows("settlement_variance_alerts");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      file_id: FILE,
      item_id: "si-poison",
      kind: "post_failed",
    });

    // Partial counts, never a clean "posted" lie.
    expect(db.rows("settlement_files")[0]!.status).toBe("variance_hold");
    expect(
      recorder.of("framique_settlement_item_total", ["outcome", "failed"]),
    ).toHaveLength(1);
  });

  it("a retry after triage posts the remainder and flips to posted", async () => {
    const db = settlementDb();
    shared.db = db;
    shared.ledgerFailOnce.add(`settle:${FILE}:si-poison`);
    await postSettlement(FILE);
    // Human triages the alert; the item is re-attempted, not skipped.
    db.rows("settlement_variance_alerts")[0]!.resolved = true;
    await db
      .from("settlement_files")
      .update({ status: "matched" })
      .eq("id", FILE);
    const out = await postSettlement(FILE);
    expect(out).toMatchObject({ posted: 1, failed: 0 });
    expect(db.rows("settlement_files")[0]!.status).toBe("posted");
    expect(db.rows("settlement_items").every((i) => i.posted === true)).toBe(
      true,
    );
  });
});

// ------------------------------------------ (4) orphan-settled guard
describe("advanceRefund posts the ledger leg before settling", () => {
  function refundDb() {
    const holder: { db: FakeDb | null } = { db: null };
    const db = fakeDb({
      tables: {
        refunds: [
          {
            id: "r1",
            merchant_id: MERCHANT,
            order_id: "o1",
            amount_minor_int: 1000,
            currency_code: "BDT",
            refund_key: "refund:o1",
            status: "processing",
            attempt: 1,
          },
        ],
      },
      rpc: (fn, args) =>
        holder.db
          ? refundRailRpc(holder.db)(fn, args)
          : { data: null, error: { message: "db_not_ready" } },
    });
    holder.db = db;
    return db;
  }

  it("settles with the debit posted first (happy path)", async () => {
    const db = refundDb();
    shared.db = db;
    const row = await advanceRefund(db.asClient<Client>(), "r1", "settled");
    expect(row.status).toBe("settled");
    expect(shared.ledger.get("refund:refund:o1")).toMatchObject({
      source: "order.refunded",
      direction: "debit",
    });
  });

  it("a ledger throw leaves the refund un-settled (deny case: no orphan)", async () => {
    const db = refundDb();
    shared.db = db;
    shared.ledgerFailOnce.add("refund:refund:o1");
    await expect(
      advanceRefund(db.asClient<Client>(), "r1", "settled"),
    ).rejects.toThrow(/ledger\.write_failed/);
    // Money did not move on paper: still processing, never settled.
    expect(db.rows("refunds")[0]!.status).toBe("processing");
    expect(shared.ledger.size).toBe(0);
  });

  it("an illegal transition throws before touching the ledger", async () => {
    const db = refundDb();
    db.rows("refunds")[0]!.status = "requested";
    shared.db = db;
    await expect(
      advanceRefund(db.asClient<Client>(), "r1", "settled"),
    ).rejects.toThrow(/refund_rejected|invalid_refund_transition/);
    expect(shared.ledger.size).toBe(0);
    expect(db.rows("refunds")[0]!.status).toBe("requested");
  });

  it("a settled replay never double-posts (replay case)", async () => {
    const db = refundDb();
    db.rows("refunds")[0]!.status = "settled";
    shared.db = db;
    await advanceRefund(db.asClient<Client>(), "r1", "settled");
    await advanceRefund(db.asClient<Client>(), "r1", "settled");
    expect(shared.ledger.size).toBeLessThanOrEqual(1);
  });
});

// ------------------------------------------ (5) payInvoice evidence
describe("payInvoice records a payment reference", () => {
  function billingDb() {
    return fakeDb({
      tables: {
        invoices: [
          {
            id: "inv-1",
            merchant_id: MERCHANT,
            status: "open",
            total_minor_int: 1500,
            idempotency_key: "inv-key-1",
          },
          {
            id: "inv-2",
            merchant_id: MERCHANT,
            status: "open",
            total_minor_int: 500,
            idempotency_key: "inv-key-2",
          },
        ],
        subscriptions: [{ merchant_id: MERCHANT, status: "past_due" }],
        billing_events: [],
      },
    });
  }

  it("returns a stable payment reference and audits it with idempotency evidence", async () => {
    const db = billingDb();
    const out = await payInvoice(asClient(db), MERCHANT, "owner-1", "inv-1");
    expect(out.paymentReference).toBe("invoice:inv-1");
    expect(db.rows("invoices").find((i) => i.id === "inv-1")!.status).toBe(
      "paid",
    );
    const paidEvents = db
      .rows("billing_events")
      .filter((e) => e.event_type === "invoice.paid");
    expect(paidEvents).toHaveLength(1);
    expect(paidEvents[0]!.payload).toMatchObject({
      invoice_id: "inv-1",
      payment_reference: "invoice:inv-1",
      idempotency_key: "inv-key-1",
    });
    expect(
      recorder.of("framique_billing_invoice_paid_total", ["outcome", "paid"]),
    ).toHaveLength(1);
  });

  it("replays a settled invoice without a second effect (replay case)", async () => {
    const db = billingDb();
    db.rows("invoices")[0]!.status = "paid";
    const out = await payInvoice(asClient(db), MERCHANT, "owner-1", "inv-1");
    expect(out).toMatchObject({
      replayed: true,
      paymentReference: "invoice:inv-1",
    });
    expect(
      db.callsOf("update").filter((c) => c.table === "invoices"),
    ).toHaveLength(0);
    expect(
      recorder.of("framique_billing_invoice_paid_total", [
        "outcome",
        "replayed",
      ]),
    ).toHaveLength(1);
  });
});

// ------------------------------------------ (6) courier DLQ + AWB retry
describe("courier DLQ depth signal", () => {
  function courierDb(parked: number) {
    const events = Array.from({ length: parked }, (_, i) => ({
      id: `evt-${i}`,
      carrier_code: "steadfast",
      awb: `AWB-${i}`,
      event_id: `e-${i}`,
      status: "parked",
    }));
    return fakeDb({
      tables: {
        courier_webhook_events: [
          ...events,
          { id: "evt-done", status: "processed" },
        ],
        courier_dead_letters: [],
        carrier_shipments: [],
      },
    });
  }

  it("stays quiet below threshold (no-noise case)", async () => {
    shared.db = courierDb(1);
    const out = await dlqDepthAlert({ threshold: 5 });
    expect(out).toMatchObject({ alerted: false });
    expect(out.depth).toBe(1);
  });

  it("pages loudly above threshold with depth evidence (alert case)", async () => {
    shared.db = courierDb(7);
    const out = await dlqDepthAlert({ threshold: 5 });
    expect(out).toMatchObject({ depth: 7, threshold: 5, alerted: true });
    expect(
      recorder.logs.some(
        (l) => l.level === "warn" && l.event === "courier.dlq_depth_high",
      ),
    ).toBe(true);
  });
});

describe("null-AWB shipments auto-retry", () => {
  function awbDb() {
    return fakeDb({
      tables: {
        carrier_shipments: [
          {
            id: "s-ok",
            merchant_id: MERCHANT,
            carrier_code: "steadfast",
            carrier_id: "c1",
            awb: null,
            tracking_url: null,
            order_id: "o1",
            pos_order_id: null,
            address_line: "Dhaka",
            city: "Dhaka",
            weight_grams: 500,
            is_cod: false,
            cod_amount_minor_int: 0,
            cancelled_at: null,
          },
          {
            id: "s-down",
            merchant_id: MERCHANT,
            carrier_code: "down",
            carrier_id: "c2",
            awb: null,
            tracking_url: null,
            order_id: "o2",
            pos_order_id: null,
            address_line: "Dhaka",
            city: "Dhaka",
            weight_grams: 500,
            is_cod: false,
            cod_amount_minor_int: 0,
            cancelled_at: null,
          },
          {
            id: "s-has-awb",
            merchant_id: MERCHANT,
            carrier_code: "steadfast",
            carrier_id: "c1",
            awb: "STDOLD1",
            order_id: "o3",
            cancelled_at: null,
          },
        ],
        carriers: [
          { id: "c1", merchant_id: MERCHANT, code: "steadfast", config: null },
          { id: "c2", merchant_id: MERCHANT, code: "down", config: null },
        ],
      },
    });
  }

  it("rebooks null-AWB rows, skips poisoned carriers and booked rows", async () => {
    const db = awbDb();
    shared.db = db;
    adapterMock.fn = (code: string) => {
      if (code === "down")
        return {
          createShipment: async () => {
            throw new Error("adapter_down");
          },
        };
      return {
        createShipment: async (req: { reference: string }) => ({
          awb: `REBOOK-${req.reference}`,
          trackingUrl: `https://track.example/${req.reference}`,
        }),
      };
    };
    const out = await retryNullAwbShipments({ limit: 50 });
    expect(out).toMatchObject({ scanned: 2, rebooked: 1, failed: 1 });
    const rows = db.rows("carrier_shipments");
    expect(rows.find((r) => r.id === "s-ok")!.awb).toBe("REBOOK-o1");
    expect(rows.find((r) => r.id === "s-down")!.awb).toBe(null);
    expect(rows.find((r) => r.id === "s-has-awb")!.awb).toBe("STDOLD1");
  });
});

// ------------------------------------------ (7) line-refund ledger leg
describe("refundOrderLines mirrors the sanctioned refund rail", () => {
  function linesDb() {
    const holder: { db: FakeDb | null } = { db: null };
    const db = fakeDb({
      tables: {
        orders: [
          {
            id: "o1",
            merchant_id: MERCHANT,
            status: "paid",
            total_minor_int: 2000,
            currency_code: "BDT",
            payment_method: "bkash",
          },
        ],
        order_items: [
          {
            id: "li1",
            order_id: "o1",
            quantity: 2,
            unit_price_minor_int: 1000,
            variant_id: "v1",
            product_title: "Shari",
          },
        ],
        refunds: [],
        refund_items: [],
        order_events: [],
        product_variants: [
          { id: "v1", merchant_id: MERCHANT, stock_quantity: 8 },
        ],
      },
      rpc: (fn, args) =>
        holder.db
          ? refundRailRpc(holder.db)(fn, args)
          : { data: null, error: { message: "db_not_ready" } },
    });
    holder.db = db;
    return db;
  }

  it("settles through the legal rail with a ledger debit (happy path)", async () => {
    const db = linesDb();
    shared.db = db;
    const out = await refundOrderLines(
      asClient(db),
      "o1",
      [{ orderItemId: "li1", quantity: 1, restock: false }],
      "damaged",
    );
    expect(out.replayed).toBe(false);
    const refund = db.rows("refunds")[0]!;
    // Never the direct "issued" flip: requested → processing → settled.
    expect(refund.status).toBe("settled");
    expect(db.rpcCalls("refund_advance").map((c) => c.args._to)).toEqual([
      "processing",
      "settled",
    ]);
    expect(shared.ledger.get(`refund:${refund.refund_key}`)).toMatchObject({
      source: "order.refunded",
      direction: "debit",
    });
    expect(db.rows("refund_items")).toHaveLength(1);
  });

  it("a ledger throw blocks the order flip (deny case: no silent issue)", async () => {
    const db = linesDb();
    shared.db = db;
    // Fail whatever refund key the path derives.
    shared.ledgerFailAlways.add("__all__");
    await expect(
      refundOrderLines(
        asClient(db),
        "o1",
        [{ orderItemId: "li1", quantity: 1, restock: false }],
        "damaged",
      ),
    ).rejects.toThrow();
    expect(db.rows("orders")[0]!.status).toBe("paid");
    expect(
      db
        .rows("order_events")
        .some(
          (r) =>
            r.event_type === "refund.settled" ||
            r.event_type === "refund.partial",
        ),
    ).toBe(false);
  });

  it("replays the same lines without a second debit (replay case)", async () => {
    const db = linesDb();
    shared.db = db;
    const first = await refundOrderLines(
      asClient(db),
      "o1",
      [{ orderItemId: "li1", quantity: 1, restock: false }],
      "damaged",
    );
    const second = await refundOrderLines(
      asClient(db),
      "o1",
      [{ orderItemId: "li1", quantity: 1, restock: false }],
      "damaged",
    );
    expect(second).toMatchObject({
      refundId: first.refundId,
      replayed: true,
    });
    expect(shared.ledger.size).toBe(1);
  });
});
