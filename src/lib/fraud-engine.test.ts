import { describe, expect, it } from "vitest";
import {
  assess,
  botScore,
  defaultParams,
  RULE_CATALOG,
  HIGH_RISK_THRESHOLD,
  type HistoryOrder,
  type RuleState,
} from "./fraud-engine";

const NOW = "2026-02-01T12:00:00.000Z";

function rules(overrides: Partial<Record<string, Partial<RuleState>>> = {}): RuleState[] {
  const defaults = defaultParams();
  return RULE_CATALOG.map((r) => ({
    code: r.code,
    enabled: true,
    params: defaults[r.code]!,
    ...(overrides[r.code] ?? {}),
  }));
}

function order(partial: Partial<HistoryOrder> = {}): HistoryOrder {
  return {
    phone: "01711000000",
    addressLine: "12 Green Road, Dhaka",
    createdAt: NOW,
    status: "delivered",
    paymentMethod: "cod",
    totalMinorInt: 100_000,
    ...partial,
  };
}

const base = {
  amountMinorInt: 100_000,
  paymentMethod: "cod",
  createdAt: NOW,
  phone: "01711000000",
  addressLine: "12 Green Road, Dhaka",
  history: [] as HistoryOrder[],
};

describe("fraud engine", () => {
  it("allows a clean order", () => {
    const v = assess({ ...base, history: [order({ createdAt: "2026-01-01T00:00:00.000Z" })] }, rules());
    expect(v.action).toBe("allow");
    expect(v.score).toBe(0);
  });

  it("blocks a blacklisted shopper before any other rule", () => {
    const v = assess({ ...base, blacklisted: true, amountMinorInt: 9_000_000 }, rules());
    expect(v.action).toBe("block");
    expect(v.decisiveCode).toBe("BLACKLIST_MATCH");
    expect(v.signals).toHaveLength(1);
  });

  it("blocks a honeypot trip", () => {
    const v = assess({ ...base, honeypotTripped: true }, rules());
    expect(v.action).toBe("block");
    expect(v.decisiveCode).toBe("HONEYPOT_TRIP");
  });

  it("evaluates rules in precedence order", () => {
    const codes = [...RULE_CATALOG].sort((a, b) => a.precedence - b.precedence).map((r) => r.code);
    expect(codes[0]).toBe("BLACKLIST_MATCH");
    expect(codes[codes.length - 1]).toBe("COD_MAX_AMOUNT");
  });

  it("flags order velocity for review", () => {
    const history = Array.from({ length: 4 }, (_, i) =>
      order({ createdAt: new Date(Date.parse(NOW) - i * 60_000).toISOString() }),
    );
    const v = assess({ ...base, history }, rules());
    expect(v.signals.some((s) => s.code === "VELOCITY_LIMIT")).toBe(true);
    expect(v.action).toBe("review");
  });

  it("flags COD refusal history", () => {
    const history = [
      order({ status: "cancelled" }),
      order({ status: "refunded", createdAt: "2026-01-10T00:00:00.000Z" }),
    ];
    const v = assess({ ...base, history }, rules());
    const hit = v.signals.find((s) => s.code === "COD_REFUSAL_HISTORY");
    expect(hit?.observed).toBe(2);
    expect(v.action).toBe("review");
  });

  it("clusters one address across distinct phones", () => {
    const history = [
      order({ phone: "01722000000" }),
      order({ phone: "01733000000" }),
    ];
    const v = assess({ ...base, history }, rules());
    expect(v.signals.some((s) => s.code === "ADDRESS_CLUSTER")).toBe(true);
  });

  it("ignores address clustering when the address is empty", () => {
    const v = assess(
      { ...base, addressLine: null, history: [order({ addressLine: null, phone: "01799000000" })] },
      rules(),
    );
    expect(v.signals.some((s) => s.code === "ADDRESS_CLUSTER")).toBe(false);
  });

  it("respects disabled rules", () => {
    const v = assess(
      { ...base, paymentMethod: "cod", amountMinorInt: 9_000_000 },
      rules({ COD_MAX_AMOUNT: { enabled: false }, NEW_DEVICE_HIGH_VALUE: { enabled: false } }),
    );
    expect(v.signals.some((s) => s.code === "COD_MAX_AMOUNT")).toBe(false);
  });

  it("honours merchant thresholds over defaults", () => {
    const v = assess(
      { ...base, amountMinorInt: 300_000 },
      rules({ COD_MAX_AMOUNT: { params: { cod_max_minor_int: 200_000 } } }),
    );
    expect(v.signals.find((s) => s.code === "COD_MAX_AMOUNT")?.threshold).toBe(200_000);
  });

  it("is deterministic for the same input", () => {
    const ctx = { ...base, amountMinorInt: 9_000_000 };
    expect(assess(ctx, rules())).toEqual(assess(ctx, rules()));
  });

  it("caps the score at 100 and explains every signal", () => {
    const history = Array.from({ length: 6 }, (_, i) =>
      order({ status: "cancelled", createdAt: new Date(Date.parse(NOW) - i * 60_000).toISOString() }),
    );
    const v = assess({ ...base, history, amountMinorInt: 9_000_000 }, rules());
    expect(v.score).toBeLessThanOrEqual(100);
    expect(v.score).toBeGreaterThanOrEqual(HIGH_RISK_THRESHOLD);
    for (const s of v.signals) expect(s.detail.length).toBeGreaterThan(3);
  });

  it("scores headless automation as a bot", () => {
    expect(botScore({ userAgent: "HeadlessChrome/120", webdriver: true, dwellMs: 200 })).toBe(100);
    expect(
      botScore({ userAgent: "Mozilla/5.0 (iPhone)", interactions: 12, pointerMoves: 40, dwellMs: 30_000 }),
    ).toBe(0);
  });

  it("sends a high bot score to review", () => {
    const v = assess({ ...base, botScore: 95 }, rules());
    expect(v.signals.some((s) => s.code === "BOT_BEACON")).toBe(true);
    expect(v.action).toBe("review");
  });
});
