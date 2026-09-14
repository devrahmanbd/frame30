/**
 * Merchant payouts executor — [A1]/[A2]/[A6] failure suite.
 *
 * `payouts.ts` (pure rules) is covered by `payments-gate.test.ts`. This file
 * covers the surface that actually moves money: `payouts.server.ts`. Per the
 * §A standing rule every guard here gets a deny case, a replay case and an
 * audit assertion — a happy path alone may not tick §4.1.
 *
 * Exposures under test:
 *  - A2 double-settle: a paid instruction must never be disbursed twice, and a
 *    retried request must not create a second payout,
 *  - A6 four-eyes: the requester can never approve their own money, and a
 *    non-admin can never reach the module at all,
 *  - A1 money: amounts stay integer minor units, balance is derived from the
 *    ledger and reserved by in-flight instructions.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb, type FakeDb } from "./__fixtures__/fake-db";
import { metricRecorder, allowAllRateLimits } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

const shared = vi.hoisted(() => ({ db: null as any, live: ["bkash"] as string[], ledger: [] as any[] }));

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return shared.db;
  },
}));
vi.mock("./identity.server", () => ({ requireStepUp: vi.fn(async () => true) }));
vi.mock("./provider-gate.server", () => ({ liveProviders: async () => shared.live }));
vi.mock("./ledger.server", () => ({
  postLedgerEntry: async (_c: unknown, entry: any) => {
    if (shared.ledger.some((e) => e.idempotencyKey === entry.idempotencyKey)) {
      throw new Error("ledger.duplicate_idempotency_key");
    }
    shared.ledger.push(entry);
    return { id: `ledger-${shared.ledger.length}` };
  },
}));

const { requestPayout, decidePayout, processPayoutQueue, merchantBalance, PayoutError } = await import(
  "./payouts.server"
);
const { requireStepUp } = await import("./identity.server");

const MERCHANT = "11111111-1111-1111-1111-111111111111";
const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const FINANCE = "aaaaaaaa-0000-0000-0000-000000000002";
const ACCOUNT = "acct-1";

type Opts = {
  admin?: boolean;
  creditMinor?: number;
  accountState?: string;
  payouts?: any[];
  holds?: any[];
  approvals?: any[];
};

function db(opts: Opts = {}): FakeDb {
  const store = fakeDb({
    tables: {
      wallet_ledger_entries: [
        { merchant_id: MERCHANT, direction: "credit", seller_minor_int: opts.creditMinor ?? 1_000_000 },
      ],
      payout_accounts: [
        {
          id: ACCOUNT,
          merchant_id: MERCHANT,
          method: "bkash",
          state: opts.accountState ?? "verified",
          destination: "01711111111",
        },
      ],
      payouts: opts.payouts ?? [],
      payout_approvals: opts.approvals ?? [],
      payout_holds: opts.holds ?? [],
      payout_events: [],
    },
    rpc: (fn) =>
      fn === "is_merchant_admin"
        ? { data: opts.admin !== false, error: null }
        : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
  });
  shared.db = store;
  return store;
}

const request = {
  accountId: ACCOUNT,
  amountMinor: 200_000,
  idempotencyKey: "idem-request-0001",
};

function approvedPayout(over: Record<string, unknown> = {}) {
  return {
    id: "payout-1",
    merchant_id: MERCHANT,
    account_id: ACCOUNT,
    state: "approved",
    amount_minor_int: 200_000,
    fee_minor_int: 0,
    net_minor_int: 200_000,
    currency_code: "BDT",
    method: "bkash",
    approvals_required: 1,
    attempts: 0,
    next_attempt_at: "2020-01-01T00:00:00.000Z",
    requested_at: "2020-01-01T00:00:00.000Z",
    requested_by: OWNER,
    paid_at: null,
    failure_code: null,
    failure_detail: null,
    provider_ref: null,
    note: null,
    idempotency_key: "idem-request-0001",
    ...over,
  };
}

const events = (store: FakeDb, event?: string) =>
  store.rows("payout_events").filter((r) => !event || r["event"] === event);

const counters = (name: string) => recorder.metrics.filter((m) => m.name === name);

beforeEach(() => {
  recorder.reset();
  shared.live = ["bkash"];
  shared.ledger = [];
  vi.mocked(requireStepUp).mockClear();
});

/* ------------------------------ A6 authorization --------------------------- */

describe("authorization (deny)", () => {
  it("refuses a caller who is not a merchant admin", async () => {
    const store = db({ admin: false });
    await expect(requestPayout(store.asClient(), MERCHANT, OWNER, request)).rejects.toMatchObject({
      code: "payout.forbidden",
      status: 403,
    });
    expect(store.rows("payouts")).toHaveLength(0);
    expect(events(store)).toHaveLength(0);
  });

  it("requires a step-up grant before money can be requested", async () => {
    const store = db();
    vi.mocked(requireStepUp).mockRejectedValueOnce(new Error("identity.step_up_required"));
    await expect(requestPayout(store.asClient(), MERCHANT, OWNER, request)).rejects.toThrow(
      "identity.step_up_required",
    );
    expect(store.rows("payouts")).toHaveLength(0);
  });

  it("refuses self-approval by the requester (four-eyes deny)", async () => {
    const store = db({ payouts: [approvedPayout({ state: "requested", approvals_required: 2 })] });
    await expect(
      decidePayout(store.asClient(), MERCHANT, OWNER, { payoutId: "payout-1", decision: "approve" }),
    ).rejects.toMatchObject({ code: "payout.self_approval", status: 403 });
    expect(store.rows("payout_approvals")).toHaveLength(0);
    expect(store.rows("payouts")[0]!["state"]).toBe("requested");
  });

  it("refuses to decide a payout belonging to another merchant (tenant deny)", async () => {
    const store = db({ payouts: [approvedPayout({ merchant_id: "other-merchant", state: "requested" })] });
    await expect(
      decidePayout(store.asClient(), MERCHANT, FINANCE, { payoutId: "payout-1", decision: "approve" }),
    ).rejects.toMatchObject({ code: "payout.not_found", status: 404 });
  });

  it("holds a large instruction at partial approval until the second approver signs", async () => {
    // BDT 30,000 is above the dual-approval threshold.
    const store = db({
      creditMinor: 10_000_000,
      payouts: [approvedPayout({ state: "requested", amount_minor_int: 3_000_000, approvals_required: 2 })],
    });
    const view = await decidePayout(store.asClient(), MERCHANT, FINANCE, {
      payoutId: "payout-1",
      decision: "approve",
    });
    expect(view.state).toBe("requested");
    expect(counters("framique_payout_decision_total")[0]!.labels["decision"]).toBe("approve_partial");
    // audit: the partial approval is still recorded, with no state change.
    expect(events(store, "payout.approval_recorded")).toHaveLength(1);
  });
});

/* -------------------------------- A1 money --------------------------------- */

describe("amount and balance guards (deny)", () => {
  it("refuses an amount above the available balance", async () => {
    const store = db({ creditMinor: 100_000 });
    await expect(
      requestPayout(store.asClient(), MERCHANT, OWNER, { ...request, amountMinor: 900_000 }),
    ).rejects.toBeInstanceOf(PayoutError);
    expect(store.rows("payouts")).toHaveLength(0);
    expect(counters("framique_payout_request_total").every((m) => m.labels["outcome"] !== "ok")).toBe(true);
  });

  it("refuses a request without a usable idempotency key", async () => {
    const store = db();
    await expect(
      requestPayout(store.asClient(), MERCHANT, OWNER, { ...request, idempotencyKey: "short" }),
    ).rejects.toMatchObject({ code: "payout.missing_idempotency_key" });
    expect(store.rows("payouts")).toHaveLength(0);
  });

  it("refuses an unverified destination account", async () => {
    const store = db({ accountState: "pending" });
    await expect(requestPayout(store.asClient(), MERCHANT, OWNER, request)).rejects.toMatchObject({
      code: "payout.account_not_verified",
      status: 409,
    });
  });

  it("reserves in-flight instructions and honours holds when deriving balance", async () => {
    db({
      creditMinor: 1_000_000,
      payouts: [approvedPayout({ state: "processing", amount_minor_int: 400_000 })],
      holds: [{ merchant_id: MERCHANT, amount_minor_int: 100_000, released_at: null }],
    });
    const balance = await merchantBalance(MERCHANT);
    expect(balance).toEqual({
      grossMinor: 1_000_000,
      reservedMinor: 400_000,
      holdMinor: 100_000,
      availableMinor: 500_000,
    });
    // A1: every field is an integer minor unit, never a float.
    for (const v of Object.values(balance)) expect(Number.isInteger(v)).toBe(true);
  });
});

/* ------------------------------- A2 replay --------------------------------- */

describe("request replay", () => {
  it("returns the original instruction for a repeated idempotency key", async () => {
    const store = db();
    const first = await requestPayout(store.asClient(), MERCHANT, OWNER, request);
    const second = await requestPayout(store.asClient(), MERCHANT, OWNER, request);
    expect(second.id).toBe(first.id);
    expect(store.rows("payouts")).toHaveLength(1);
    // audit: exactly one requested event, one request counter.
    expect(events(store, "payout.requested")).toHaveLength(1);
    expect(counters("framique_payout_request_total").filter((m) => m.labels["outcome"] === "ok")).toHaveLength(
      1,
    );
  });

  it("keeps money in integer minor units on the stored instruction", async () => {
    const store = db();
    await requestPayout(store.asClient(), MERCHANT, OWNER, request);
    const row = store.rows("payouts")[0]!;
    for (const key of ["amount_minor_int", "fee_minor_int", "net_minor_int"]) {
      expect(Number.isInteger(Number(row[key]))).toBe(true);
    }
    expect(row["currency_code"]).toBe("BDT");
  });
});

/* ---------------------------- A2 double-settle ----------------------------- */

describe("disbursement worker", () => {
  it("pays an approved instruction exactly once and never re-settles it (replay deny)", async () => {
    const store = db({ payouts: [approvedPayout()] });

    const first = await processPayoutQueue();
    expect(first).toMatchObject({ scanned: 1, paid: 1, failed: 0 });
    expect(store.rows("payouts")[0]!["state"]).toBe("paid");

    // Replay: the worker runs again on the same data.
    const second = await processPayoutQueue();
    expect(second).toMatchObject({ scanned: 0, paid: 0 });

    // One ledger debit, keyed by payout id — a second post would have thrown.
    expect(shared.ledger).toHaveLength(1);
    expect(shared.ledger[0]).toMatchObject({ idempotencyKey: "payout:payout-1", direction: "debit" });
    // audit: exactly one paid transition recorded and counted.
    expect(events(store, "payout.paid")).toHaveLength(1);
    expect(counters("framique_payout_worker_total").filter((m) => m.labels["outcome"] === "paid")).toHaveLength(
      1,
    );
  });

  it("rejects an illegal transition out of a paid instruction (FSM deny)", async () => {
    const store = db({ payouts: [approvedPayout({ state: "paid", paid_at: "2020-01-02T00:00:00.000Z" })] });
    await expect(
      decidePayout(store.asClient(), MERCHANT, FINANCE, { payoutId: "payout-1", decision: "approve" }),
    ).rejects.toMatchObject({ code: "payout.not_pending", status: 409 });
    expect(shared.ledger).toHaveLength(0);
  });

  it("parks the instruction instead of paying when no live rail is approved (provider gate)", async () => {
    shared.live = [];
    const store = db({ payouts: [approvedPayout()] });
    const out = await processPayoutQueue();
    expect(out).toMatchObject({ paid: 0, failed: 0, retried: 1 });
    expect(shared.ledger).toHaveLength(0);
    const row = store.rows("payouts")[0]!;
    expect(row["state"]).toBe("processing");
    expect(row["failure_code"]).toBe("payout.no_live_rail");
    // audit: deferral is recorded and counted, money is neither lost nor sent.
    expect(events(store, "payout.deferred")).toHaveLength(1);
    expect(counters("framique_payout_worker_total")[0]!.labels["outcome"]).toBe("deferred");
  });

  it("records every state change as an audit row with from/to and a counter", async () => {
    const store = db({ payouts: [approvedPayout()] });
    await processPayoutQueue();
    const trail = events(store).map((e) => [e["from_state"], e["to_state"], e["event"]]);
    expect(trail).toEqual([
      [null, "processing", "payout.processing"],
      ["processing", "paid", "payout.paid"],
    ].map(([f, t, e]) => [f === null ? "approved" : f, t, e]));
    expect(counters("framique_payout_transition_total").every((m) => m.labels["outcome"] === "ok")).toBe(true);
  });
});
