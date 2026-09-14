/**
 * Gift cards — [A2] transaction integrity failure suite.
 *
 * A gift card is bearer money: the balance must move once, exactly once, and
 * every attempt must leave a countable trace. Per the standing rule this file
 * carries a deny case, a replay case and an audit assertion.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { metricRecorder, allowAllRateLimits } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));

const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { redeemGiftCard, issueGiftCard, generateCode, loadGiftCards } = await import("./gift-cards.server");
const { CommerceError } = await import("./inventory.server");

const MERCHANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => recorder.reset());

describe("gift card code generation", () => {
  it("excludes ambiguous glyphs so a card can be read aloud", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCode();
      expect(code).toMatch(/^GC(-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){3}$/);
      expect(code).not.toMatch(/[O0I1]/);
    }
  });

  it("does not repeat within a large sample", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(seen.size).toBe(500);
  });
});

describe("issueGiftCard", () => {
  it("rejects a non-positive amount before touching the database (deny)", async () => {
    const db = fakeDb();
    await expect(
      issueGiftCard(db.asClient(), MERCHANT, "staff-1", { amountMinorInt: 0 }),
    ).rejects.toMatchObject({ code: "invalid_amount" });
    expect(db.rpcCalls()).toHaveLength(0);
    expect(recorder.of("framique_gift_card_issued_total")).toHaveLength(0);
  });

  it("rejects a fractional amount rather than silently rounding money", async () => {
    const db = fakeDb();
    await expect(
      issueGiftCard(db.asClient(), MERCHANT, "staff-1", { amountMinorInt: 0.4 }),
    ).rejects.toBeInstanceOf(CommerceError);
  });

  it("normalises the code and floors to integer minor units (audit)", async () => {
    const db = fakeDb({ rpc: () => ({ data: { id: "gc-1" }, error: null }) });
    await issueGiftCard(db.asClient(), MERCHANT, "staff-1", {
      amountMinorInt: 500_49.9,
      code: "  gc-abcd-efgh  ",
    });
    const call = db.rpcCalls("gift_card_issue")[0]!;
    expect(call.args["_code"]).toBe("GC-ABCD-EFGH");
    expect(call.args["_amount_minor"]).toBe(50049);
    expect(Number.isInteger(call.args["_amount_minor"])).toBe(true);
    expect(call.args["_merchant_id"]).toBe(MERCHANT);
    expect(recorder.of("framique_gift_card_issued_total")).toHaveLength(1);
  });
});

describe("redeemGiftCard", () => {
  const base = {
    code: "GC-AAAA-BBBB",
    amountMinorInt: 25_00,
    idempotencyKey: "key-1",
    subject: "session-1",
  };

  it("applies once and counts the application", async () => {
    const db = fakeDb({
      rpc: () => ({
        data: { replayed: false, applied_minor_int: 2500, balance_minor_int: 7500, currency_code: "BDT" },
        error: null,
      }),
    });
    const result = await redeemGiftCard(db.asClient(), MERCHANT, base);
    expect(result.replayed).toBe(false);
    expect(result.applied_minor_int).toBe(2500);
    expect(recorder.of("framique_gift_card_redeem_total", ["outcome", "applied"])).toHaveLength(1);
  });

  it("replays the original verdict without deducting twice (replay)", async () => {
    // The database keeps the ledger; the replay verdict is what the caller must
    // honour. A replay must never report a second deduction.
    let seen = 0;
    const db = fakeDb({
      rpc: () => {
        seen += 1;
        return {
          data: {
            replayed: seen > 1,
            applied_minor_int: 2500,
            balance_minor_int: 7500,
            currency_code: "BDT",
          },
          error: null,
        };
      },
    });
    const first = await redeemGiftCard(db.asClient(), MERCHANT, base);
    const second = await redeemGiftCard(db.asClient(), MERCHANT, base);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.applied_minor_int).toBe(first.applied_minor_int);
    expect(second.balance_minor_int).toBe(first.balance_minor_int);
    expect(recorder.of("framique_gift_card_redeem_total", ["outcome", "replayed"])).toHaveLength(1);
    // Both attempts carried the same idempotency key to the ledger.
    const keys = db.rpcCalls("gift_card_redeem").map((c) => c.args["_idempotency_key"]);
    expect(keys).toEqual(["key-1", "key-1"]);
  });

  it("denies redemption of an inactive card and counts the error (deny + audit)", async () => {
    const db = fakeDb({
      rpc: () => ({ data: null, error: { message: "gift_card_inactive: card was voided" } }),
    });
    await expect(redeemGiftCard(db.asClient(), MERCHANT, base)).rejects.toMatchObject({
      code: "gift_card_inactive",
    });
    expect(recorder.of("framique_gift_card_redeem_total", ["outcome", "error"])).toHaveLength(1);
  });

  it("denies an expired card", async () => {
    const db = fakeDb({ rpc: () => ({ data: null, error: { message: "gift_card_expired" } }) });
    await expect(redeemGiftCard(db.asClient(), MERCHANT, base)).rejects.toMatchObject({
      code: "gift_card_expired",
    });
  });

  it("never leaks a raw database message to the caller", async () => {
    const db = fakeDb({
      rpc: () => ({
        data: null,
        error: { message: 'relation "gift_card_entries" violates constraint pg_xyz at 10.0.0.4' },
      }),
    });
    const err = await redeemGiftCard(db.asClient(), MERCHANT, base).catch((e) => e);
    expect(err).toBeInstanceOf(CommerceError);
    expect(err.code).toBe("giftcard_unavailable");
    expect(err.message).not.toMatch(/relation|10\.0\.0\.4/);
  });

  it("floors the requested amount so no float reaches the ledger", async () => {
    const db = fakeDb({
      rpc: () => ({
        data: { replayed: false, applied_minor_int: 1, balance_minor_int: 0, currency_code: "BDT" },
        error: null,
      }),
    });
    await redeemGiftCard(db.asClient(), MERCHANT, { ...base, amountMinorInt: 10.99 });
    expect(db.rpcCalls("gift_card_redeem")[0]!.args["_amount_minor"]).toBe(10);
  });
});

describe("tenant scoping", () => {
  it("reads gift cards only for the calling merchant", async () => {
    const db = fakeDb({
      tables: {
        gift_cards: [
          { id: "a", merchant_id: MERCHANT, code: "GC-1" },
          { id: "b", merchant_id: "22222222-2222-2222-2222-222222222222", code: "GC-2" },
        ],
      },
    });
    const rows = await loadGiftCards(db.asClient(), MERCHANT);
    expect(rows.map((r: any) => r.id)).toEqual(["a"]);
  });
});
