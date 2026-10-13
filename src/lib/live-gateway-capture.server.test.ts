/**
 * bKash provider-capture durability (crash between execute and settlement).
 *
 * Defect under test: bKash `execute` CAPTURES at the provider, but nothing
 * durable records it before `settleLiveCallback → applySignedReturn` — a crash
 * in between leaves money captured at bKash with no payments row and no
 * reconciler able to find it.
 *
 * Money-path rule (§A): every guard gets a deny case, a replay case and an
 * audit assertion — a happy path alone never ticks the gate.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./__fixtures__/fake-db";
import { metricRecorder } from "./__fixtures__/test-doubles";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);

const { validateWithProvider, recordProviderCapture, sweepStuckCaptures } =
  await import("./live-gateway.server");
import type { LiveAccount } from "./live-gateway.server";
import type { CallbackVerdict } from "./live-gateway";

type Client = SupabaseClient<Database>;
const asClient = (db: FakeDb) => db.asClient<Client>();

const INTENT = "11111111-2222-3333-4444-555555555555";
const MERCHANT = "aaaaaaaa-0000-0000-0000-000000000001";
const ORDER = "bbbbbbbb-0000-0000-0000-000000000001";

const bkashAccount: LiveAccount = {
  provider: "bkash",
  mode: "sandbox",
  baseUrl: "https://tokenized.sandbox.bka.sh",
  credentials: {
    storeId: "key",
    storePassword: "secret",
    username: "u",
    password: "p",
  },
  webhookSecret: "whsec",
};

function paidVerdict(): CallbackVerdict {
  return {
    intentId: INTENT,
    status: "paid",
    providerReference: "pay-real",
    amountMinorInt: 125_000,
  };
}

/** Stub global fetch with a URL-routed responder. */
function stubFetch(respond: (url: string, init: RequestInit) => unknown) {
  const fn = vi.fn(async (url: unknown, init: unknown) => ({
    text: async () =>
      JSON.stringify(respond(String(url), (init ?? {}) as RequestInit)),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function completedExecute() {
  return stubFetch((url) =>
    url.includes("/token/grant")
      ? { id_token: "tok" }
      : {
          transactionStatus: "Completed",
          amount: "1250.00",
          trxID: "trx9",
        },
  );
}

function intentDb(extraIntents: Record<string, unknown>[] = []) {
  return fakeDb({
    tables: {
      charge_intents: [
        {
          id: INTENT,
          merchant_id: MERCHANT,
          order_id: ORDER,
          method: "bkash",
          amount_minor_int: 125_000,
          currency_code: "BDT",
          status: "initiated",
          provider_reference: null,
          idempotency_key: "idem-1",
          return_nonce: "n1",
          attempt: 1,
          created_at: new Date(Date.now() - 60_000).toISOString(),
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          ...{},
        },
        ...extraIntents,
      ],
      charge_intent_events: [],
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  recorder.reset();
});

describe("bKash capture receipt — crash-between-execute-and-settle", () => {
  it("records a durable receipt on execute success even when settlement never runs (crash proof)", async () => {
    const db = intentDb();
    completedExecute();
    const verdict = await validateWithProvider(bkashAccount, paidVerdict(), {
      capture: { db: asClient(db), merchantId: MERCHANT },
    });
    expect(verdict.status).toBe("paid");

    // --- simulated crash: the process dies here, applySignedReturn never runs.
    // The receipt must already be durable: intent carries the provider
    // reference and an audit event pins the capture facts.
    const intent = db.rows("charge_intents").find((r) => r.id === INTENT)!;
    expect(intent.provider_reference).toBe("trx9");
    const events = db
      .rows("charge_intent_events")
      .filter((r) => r.intent_id === INTENT);
    expect(events).toHaveLength(1);
    expect(events[0]!.merchant_id).toBe(MERCHANT);
    expect(events[0]!.to_status).toBe("pending");
    expect(events[0]!.detail).toMatchObject({
      capture_receipt: true,
      provider: "bkash",
      provider_reference: "trx9",
      amount_minor_int: 125_000,
    });
    // No settlement ran: no payments row, yet recovery is possible.
    expect(db.rows("payments")).toHaveLength(0);
    // Audit: the receipt emission is counted.
    expect(
      recorder.of("framique_live_capture_receipt_total", [
        "outcome",
        "recorded",
      ]).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("replays a provider redelivery without duplicating the receipt (replay case)", async () => {
    const db = intentDb();
    completedExecute();
    const capture = { db: asClient(db), merchantId: MERCHANT };
    await validateWithProvider(bkashAccount, paidVerdict(), { capture });
    const second = await validateWithProvider(bkashAccount, paidVerdict(), {
      capture,
    });
    expect(second.status).toBe("paid");
    expect(
      db.rows("charge_intent_events").filter((r) => r.intent_id === INTENT),
    ).toHaveLength(1);
    expect(
      recorder.of("framique_live_capture_receipt_total", [
        "outcome",
        "replayed",
      ]).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("a receipt write failure never blocks the paid verdict but is logged (deny case)", async () => {
    const db = intentDb();
    const innerFrom = db.from.bind(db);
    (db as unknown as { from: FakeDb["from"] }).from = ((table: string) => {
      const q = innerFrom(table) as unknown as {
        insert(rows: unknown): {
          then(onF?: unknown, onR?: unknown): Promise<unknown>;
        } & Record<string, unknown>;
      };
      if (table === "charge_intent_events") {
        const origInsert = q.insert.bind(q);
        q.insert = ((rows: unknown) => {
          const qb = origInsert(rows) as unknown as Record<string, unknown>;
          qb["then"] = (
            onF?: (v: { data: null; error: { message: string } }) => unknown,
          ) =>
            Promise.resolve({
              data: null,
              error: { message: "receipt_boom" },
            }).then(onF);
          return qb;
        }) as typeof q.insert;
      }
      return q;
    }) as unknown as FakeDb["from"];
    completedExecute();
    const verdict = await validateWithProvider(bkashAccount, paidVerdict(), {
      capture: { db: asClient(db), merchantId: MERCHANT },
    });
    // Settlement stays authoritative when the receipt leg fails.
    expect(verdict.status).toBe("paid");
    expect(
      recorder.logs.some((l) => l.event === "live_gateway.capture_failed"),
    ).toBe(true);
  });

  it("recordProviderCapture refuses a conflicting provider reference", async () => {
    const db = intentDb();
    db.rows("charge_intents")[0]!.provider_reference = "trx-other";
    await expect(
      recordProviderCapture(asClient(db), {
        intentId: INTENT,
        merchantId: MERCHANT,
        provider: "bkash",
        providerReference: "trx9",
        amountMinorInt: 125_000,
      }),
    ).rejects.toThrow(/capture_conflict/);
  });
});

describe("sweepStuckCaptures — captured but never settled, past intent TTL", () => {
  const PAST = new Date(Date.now() - 3_600_000).toISOString();
  const FUTURE = new Date(Date.now() + 3_600_000).toISOString();
  function stuckDb() {
    return fakeDb({
      tables: {
        charge_intents: [
          {
            id: "stuck-1",
            merchant_id: MERCHANT,
            order_id: ORDER,
            method: "bkash",
            amount_minor_int: 1000,
            status: "initiated",
            provider_reference: "trx-stuck",
            expires_at: PAST,
          },
          {
            id: "fresh-1",
            merchant_id: MERCHANT,
            order_id: ORDER,
            method: "bkash",
            amount_minor_int: 1000,
            status: "initiated",
            provider_reference: "trx-fresh",
            expires_at: FUTURE,
          },
          {
            id: "settled-1",
            merchant_id: MERCHANT,
            order_id: ORDER,
            method: "bkash",
            amount_minor_int: 1000,
            status: "paid",
            provider_reference: "trx-done",
            expires_at: PAST,
          },
          {
            id: "uncaptured-1",
            merchant_id: MERCHANT,
            order_id: ORDER,
            method: "bkash",
            amount_minor_int: 1000,
            status: "initiated",
            provider_reference: null,
            expires_at: PAST,
          },
        ],
        charge_intent_events: [],
      },
    });
  }

  it("surfaces only captured-but-unsettled intents past expiry", async () => {
    const db = stuckDb();
    const found = await sweepStuckCaptures(asClient(db));
    expect(found.map((r) => r.id)).toEqual(["stuck-1"]);
    expect(
      recorder.logs.some((l) => l.event === "live_gateway.stuck_capture"),
    ).toBe(true);
    expect(
      recorder.of("framique_live_stuck_capture_total").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("returns empty when nothing is stuck", async () => {
    const db = stuckDb();
    db.tables["charge_intents"] = db
      .rows("charge_intents")
      .filter((r) => r.id !== "stuck-1");
    await expect(sweepStuckCaptures(asClient(db))).resolves.toEqual([]);
  });

  it("a stuck receipt from the crash test is recoverable through the sweep", async () => {
    // End-to-end of the defect: capture recorded, settlement crashed, intent
    // TTL lapses — the sweep must surface exactly that intent for
    // completion/voiding.
    const db = intentDb();
    completedExecute();
    await validateWithProvider(bkashAccount, paidVerdict(), {
      capture: { db: asClient(db), merchantId: MERCHANT },
    });
    db.rows("charge_intents")[0]!.expires_at = PAST;
    const found = await sweepStuckCaptures(asClient(db));
    expect(found.map((r) => r.id)).toEqual([INTENT]);
    expect(found[0]!.provider_reference).toBe("trx9");
  });
});
