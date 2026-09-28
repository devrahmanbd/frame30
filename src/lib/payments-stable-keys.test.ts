/**
 * T5 stable retry keys — server side (RED first).
 *
 * Double-clicking "Pay now" currently mints two distinct
 * `retry-<orderId>-<Date.now()>` keys, so `openCharge` opens two parallel
 * settable intents. After the fix both collapse onto one canonical key and
 * only one intent is opened; a retry after a terminal intent advances the
 * attempt server-side.
 *
 * NOTE: concurrent dynamic `import()` of a vi-mocked module races back to
 * the real module under vitest, so the double-click overlap is staged with
 * an RPC gate instead: the first call parks inside the `charge_intent_open`
 * stub (past all imports, before any insert — exactly the DB window a real
 * double-click shares) and the second call starts while it is parked.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb, type FakeDb, type Row } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type ObservabilityDouble = ReturnType<typeof metricRecorder>;

const rec = vi.hoisted(() => ({
  holder: null as ObservabilityDouble | null,
}));
const recorder = metricRecorder();
rec.holder = recorder;

const shared = vi.hoisted(() => ({ db: null as FakeDb | null }));

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("./owner-ops.server", () => ({
  assertPaymentsNotFrozen: vi.fn(async () => undefined),
}));
vi.mock("./live-gateway.server", () => ({
  loadLiveAccount: vi.fn(async () => null),
  openLiveSession: vi.fn(async () => {
    throw new Error("must_not_open_live_session_in_test");
  }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return shared.db;
  },
}));

const { openCharge, resolveRetryKey } = await import("./payments.server");
const { buildRetryKey } = await import("./payment-keys");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const ORDER = "33333333-3333-3333-3333-333333333333";
const SLUG = "demo";
const ORIGIN = "https://shop.test";

type Gate = {
  armed: boolean;
  arrivals: number;
  gate: Promise<void>;
  release: () => void;
};

function seed() {
  const holder: { db?: FakeDb } = {};
  const seen = new Map<string, Row>();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const state: Gate = { armed: false, arrivals: 0, gate, release };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const db = holder.db!;
    if (fn === "charge_intent_open") {
      // Emulates key-idempotent open: same key replays, new key inserts.
      state.arrivals += 1;
      if (state.armed) {
        if (state.arrivals >= 2) state.release();
        await state.gate;
      }
      const key = String(args._idempotency_key);
      const hit = seen.get(key);
      if (hit) return { data: hit, error: null };
      const attempt = db.rows("charge_intents").length + 1;
      const intent: Row = {
        id: `intent-${attempt}`,
        merchant_id: MERCHANT,
        order_id: args._order_id,
        method: "bkash",
        attempt,
        amount_minor_int: 125_000,
        currency_code: "BDT",
        return_nonce: `n-${attempt}`,
        idempotency_key: key,
        status: "initiated",
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
      };
      db.rows("charge_intents").push(intent);
      seen.set(key, intent);
      return { data: intent, error: null };
    }
    if (fn === "charge_intent_advance") {
      const row = db
        .rows("charge_intents")
        .find((r) => r.id === String(args._intent_id));
      if (row) row.status = String(args._to);
      return { data: row ?? null, error: null };
    }
    return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
  };
  holder.db = fakeDb({
    tables: {
      merchants: [{ id: MERCHANT, slug: SLUG }],
      orders: [{ id: ORDER, merchant_id: MERCHANT }],
      gateway_accounts: [
        {
          merchant_id: MERCHANT,
          provider: "bkash",
          webhook_secret: "shhh",
          active: true,
        },
      ],
      charge_intents: [],
    },
    rpc,
  });
  shared.db = holder.db;
  return { db: holder.db!, state };
}

function openKeys(db: ReturnType<typeof fakeDb>) {
  return db
    .rpcCalls("charge_intent_open")
    .map((c) => (c.args as Record<string, unknown>)._idempotency_key);
}

beforeEach(() => {
  rec.holder!.reset();
});

describe("openCharge retry canonicalisation", () => {
  it("a double-click with legacy timestamped keys opens ONE intent", async () => {
    const { db, state } = seed();
    state.armed = true;
    // What the retry buttons mint today: fresh Date.now() per click.
    const click1 = `retry-${ORDER}-${Date.now()}`;
    const click2 = `retry-${ORDER}-${Date.now() + 1}`;
    expect(click1).not.toBe(click2);

    const p1 = openCharge(SLUG, ORDER, click1, ORIGIN, SLUG);
    // Park the first call inside the open RPC (past imports, pre-insert),
    // then start the second — the DB window a real double-click shares.
    await vi.waitFor(() => expect(state.arrivals).toBe(1));
    const p2 = openCharge(SLUG, ORDER, click2, ORIGIN, SLUG);
    const [a, b] = await Promise.all([p1, p2]);

    expect(a.intentId).toBe(b.intentId);
    expect(db.rows("charge_intents")).toHaveLength(1);
    // Both arrivals collapsed onto one canonical key.
    const keys = openKeys(db);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toBe(buildRetryKey(ORDER, 1));
  });

  it("a slow second click while the attempt is live replays the same intent", async () => {
    const { db } = seed();
    const first = await openCharge(
      SLUG,
      ORDER,
      `retry-${ORDER}-${Date.now()}`,
      ORIGIN,
      SLUG,
    );
    const second = await openCharge(
      SLUG,
      ORDER,
      `retry-${ORDER}-${Date.now() + 5}`,
      ORIGIN,
      SLUG,
    );
    expect(second.intentId).toBe(first.intentId);
    expect(db.rows("charge_intents")).toHaveLength(1);
  });

  it("a retry after a terminal intent advances the attempt server-side", async () => {
    const { db } = seed();
    const first = await openCharge(
      SLUG,
      ORDER,
      `retry-${ORDER}-${Date.now()}`,
      ORIGIN,
      SLUG,
    );
    // First intent settles terminally (failed at the rail).
    db.rows("charge_intents")[0]!.status = "failed";

    const second = await openCharge(
      SLUG,
      ORDER,
      `retry-${ORDER}-${Date.now() + 5}`,
      ORIGIN,
      SLUG,
    );
    expect(second.intentId).not.toBe(first.intentId);
    expect(db.rows("charge_intents")).toHaveLength(2);
    expect(openKeys(db)[1]).toBe(buildRetryKey(ORDER, 2));
  });

  it("leaves non-retry (initial checkout) keys untouched", async () => {
    const { db } = seed();
    await openCharge(SLUG, ORDER, "chg-abc123", ORIGIN, SLUG);
    expect(openKeys(db)).toEqual(["chg-abc123"]);
  });
});

describe("resolveRetryKey", () => {
  it("derives the same canonical key for concurrent legacy keys", async () => {
    const { db } = seed();
    const [k1, k2] = await Promise.all([
      resolveRetryKey(db as never, ORDER, `retry-${ORDER}-${Date.now()}`),
      resolveRetryKey(db as never, ORDER, `retry-${ORDER}-${Date.now() + 7}`),
    ]);
    expect(k1).toBe(k2);
    expect(k1).toBe(buildRetryKey(ORDER, 1));
  });
});
