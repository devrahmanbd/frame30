import { describe, expect, it, beforeEach } from "vitest";
import {
  billableKilos,
  codFee,
  computeQuote,
  matchRule,
  matchZone,
  normalizeDistrict,
  type RateRuleLike,
  type ZoneLike,
} from "./shipping-rates";
import {
  callCarrier,
  constantTimeEqual,
  hmacHex,
  normalizeStatusWord,
  resetBreakers,
  verifySignature,
  breakerState,
  adapterFor,
} from "./courier-adapters.server";

const zones: ZoneLike[] = [
  { id: "z1", code: "dhaka_metro", districts: ["Dhaka"], isDefault: false, enabled: true, priority: 10 },
  { id: "z2", code: "outside", districts: [], isDefault: true, enabled: true, priority: 90 },
];

const rules: RateRuleLike[] = [
  {
    id: "r1",
    zoneId: "z1",
    carrierCode: null,
    minWeightGrams: 0,
    maxWeightGrams: 30000,
    baseMinorInt: 6000,
    perKgMinorInt: 2000,
    codFeeBp: 100,
    freeOverMinorInt: 200000,
    enabled: true,
    priority: 100,
  },
  {
    id: "r2",
    zoneId: "z1",
    carrierCode: "redx",
    minWeightGrams: 0,
    maxWeightGrams: 30000,
    baseMinorInt: 5000,
    perKgMinorInt: 1500,
    codFeeBp: 50,
    freeOverMinorInt: null,
    enabled: true,
    priority: 100,
  },
  {
    id: "r3",
    zoneId: "z2",
    carrierCode: null,
    minWeightGrams: 0,
    maxWeightGrams: 30000,
    baseMinorInt: 13000,
    perKgMinorInt: 3000,
    codFeeBp: 150,
    freeOverMinorInt: null,
    enabled: true,
    priority: 100,
  },
];

describe("zone matching", () => {
  it("normalizes district spelling and whitespace", () => {
    expect(normalizeDistrict("  DHAKA. ")).toBe("dhaka");
  });

  it("matches a listed district", () => {
    expect(matchZone(zones, "dhaka")?.code).toBe("dhaka_metro");
  });

  it("falls back to the default zone for unknown districts", () => {
    expect(matchZone(zones, "Rangpur")?.code).toBe("outside");
    expect(matchZone(zones, null)?.code).toBe("outside");
  });

  it("skips disabled zones", () => {
    const disabled = zones.map((z) => (z.id === "z1" ? { ...z, enabled: false } : z));
    expect(matchZone(disabled, "Dhaka")?.code).toBe("outside");
  });
});

describe("rule matching", () => {
  it("prefers a carrier-specific rule", () => {
    expect(matchRule(rules, "z1", "redx", 1000)?.id).toBe("r2");
  });

  it("uses the any-carrier rule otherwise", () => {
    expect(matchRule(rules, "z1", "pathao", 1000)?.id).toBe("r1");
  });

  it("returns null when weight is out of every band", () => {
    expect(matchRule(rules, "z1", "pathao", 40000)).toBeNull();
  });
});

describe("money maths", () => {
  it("rounds weight up to whole kilos with a 1kg floor", () => {
    expect(billableKilos(1)).toBe(1);
    expect(billableKilos(1000)).toBe(1);
    expect(billableKilos(1001)).toBe(2);
  });

  it("rounds COD fee up to the paisa and never returns a float", () => {
    const fee = codFee(150033, 150);
    expect(fee).toBe(2251);
    expect(Number.isInteger(fee)).toBe(true);
  });

  it("charges base for the first kilo and per-kg after", () => {
    const q = computeQuote(zones, rules, {
      city: "Dhaka",
      weightGrams: 2400,
      isCod: false,
      codAmountMinorInt: 0,
      orderTotalMinorInt: 50000,
      carrierCode: "pathao",
    });
    expect(q.billableKg).toBe(3);
    expect(q.shippingMinorInt).toBe(6000 + 2 * 2000);
    expect(q.codFeeMinorInt).toBe(0);
    expect(q.totalMinorInt).toBe(10000);
  });

  it("applies free shipping over the threshold but still charges COD fee", () => {
    const q = computeQuote(zones, rules, {
      city: "Dhaka",
      weightGrams: 900,
      isCod: true,
      codAmountMinorInt: 250000,
      orderTotalMinorInt: 250000,
      carrierCode: "pathao",
    });
    expect(q.freeApplied).toBe(true);
    expect(q.shippingMinorInt).toBe(0);
    expect(q.codFeeMinorInt).toBe(2500);
  });

  it("flags a fallback quote when no rule matches", () => {
    const q = computeQuote(zones, [], {
      city: "Dhaka",
      weightGrams: 500,
      isCod: false,
      codAmountMinorInt: 0,
      orderTotalMinorInt: 10000,
      carrierCode: "pathao",
    });
    expect(q.fallback).toBe(true);
    expect(q.totalMinorInt).toBeGreaterThan(0);
  });

  it("keeps every amount an integer", () => {
    const q = computeQuote(zones, rules, {
      city: "Sylhet",
      weightGrams: 3333,
      isCod: true,
      codAmountMinorInt: 99999,
      orderTotalMinorInt: 99999,
      carrierCode: "steadfast",
    });
    for (const value of [q.shippingMinorInt, q.codFeeMinorInt, q.totalMinorInt]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("courier adapters", () => {
  beforeEach(() => resetBreakers());

  it("maps carrier vocabulary to platform statuses and refuses unknown words", () => {
    expect(normalizeStatusWord("Delivery Failed")).toBe("failed_attempt");
    expect(normalizeStatusWord("RTO")).toBe("returned");
    expect(normalizeStatusWord("teleported")).toBeNull();
  });

  it("verifies HMAC signatures and rejects tampered bodies", async () => {
    const body = JSON.stringify({ event_id: "e1", awb: "A1", status: "delivered" });
    const sig = await hmacHex("s3cret", body);
    await expect(verifySignature("s3cret", body, `sha256=${sig}`)).resolves.toBe(true);
    await expect(verifySignature("s3cret", `${body} `, sig)).resolves.toBe(false);
    await expect(verifySignature("s3cret", body, null)).resolves.toBe(false);
  });

  it("compares in constant time without leaking on length", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
  });

  it("opens the circuit after repeated failures and fails fast", async () => {
    const fail = () => Promise.reject(new Error("boom"));
    await expect(callCarrier("flaky", "op", fail, { retries: 2, timeoutMs: 50 })).rejects.toThrow();
    expect(breakerState("flaky")).toBe("open");
    await expect(
      callCarrier("flaky", "op", () => Promise.resolve(1), { retries: 0 }),
    ).rejects.toThrow(/unavailable/i);
  });

  it("parses only well-formed carrier payloads", () => {
    const adapter = adapterFor("steadfast");
    expect(adapter.parseEvent({ event_id: "1", awb: "A", status: "delivered" })?.status).toBe(
      "delivered",
    );
    expect(adapter.parseEvent({ awb: "A", status: "delivered" })).toBeNull();
    expect(adapter.parseEvent("nope")).toBeNull();
  });

  it("books a deterministic AWB for the same reference", async () => {
    const adapter = adapterFor("steadfast");
    const a = await adapter.createShipment({
      reference: "order-1",
      addressLine: null,
      city: "Dhaka",
      weightGrams: 500,
      isCod: false,
      codAmountMinorInt: 0,
    });
    const b = await adapter.createShipment({
      reference: "order-1",
      addressLine: null,
      city: "Dhaka",
      weightGrams: 500,
      isCod: false,
      codAmountMinorInt: 0,
    });
    expect(a.awb).toBe(b.awb);
  });
});
