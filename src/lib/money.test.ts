import { describe, expect, it } from "vitest";
import {
  MoneyError,
  add,
  allocate,
  applyBasisPoints,
  fmtMinor,
  money,
  sub,
} from "./money";
import { refundVatComponent, splitVatAcrossLines, vatExclusive, vatInclusive } from "./vat";
import { convertWithSnapshot } from "./fx.server";

const rate = {
  countryCode: "BD",
  category: "standard",
  rateBasisPoints: 1500,
  effectiveYear: 2025,
  resolved: true,
};

describe("money core", () => {
  it("refuses non-integer and cross-currency arithmetic", () => {
    expect(() => money(10.5)).toThrow(MoneyError);
    expect(() => add(money(100, "BDT"), money(100, "USD"))).toThrow(MoneyError);
  });

  it("rounds rate application half-up", () => {
    expect(applyBasisPoints(money(101), 1500).minor).toBe(15); // 15.15 -> 15
    expect(applyBasisPoints(money(10), 500).minor).toBe(1); // 0.5 -> 1
  });

  it("allocates without losing or inventing paisa", () => {
    const parts = allocate(money(1000), [1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([334, 333, 333]);
    expect(add(...parts).minor).toBe(1000);
  });

  it("formats BDT with two minor digits", () => {
    expect(fmtMinor(485000)).toBe("৳ 4,850.00");
  });
});

describe("vat", () => {
  it("adds exclusive VAT on top", () => {
    const b = vatExclusive(money(10000), rate);
    expect(b.vat.minor).toBe(1500);
    expect(b.gross.minor).toBe(11500);
  });

  it("extracts inclusive VAT so net + vat === gross", () => {
    const b = vatInclusive(money(11500), rate);
    expect(b.vat.minor).toBe(1500);
    expect(add(b.net, b.vat).minor).toBe(b.gross.minor);
  });

  it("reconciles per-line VAT to the invoice VAT", () => {
    const b = vatExclusive(money(999), rate);
    const lines = [money(333), money(333), money(333)];
    const split = splitVatAcrossLines(b, lines);
    expect(add(...split).minor).toBe(b.vat.minor);
  });

  it("returns proportional VAT on a partial refund and all of it on a full one", () => {
    const b = vatExclusive(money(10000), rate);
    expect(refundVatComponent(b, b.gross).minor).toBe(b.vat.minor);
    const half = refundVatComponent(b, money(5750));
    expect(half.minor).toBe(750);
  });
});

describe("fx", () => {
  const snapshot = {
    id: "s1",
    base: "BDT" as const,
    quote: "USD" as const,
    ratePpm: 8300,
    source: "manual",
    effectiveAt: "2026-01-01T00:00:00Z",
  };

  it("converts with integer ppm maths", () => {
    expect(convertWithSnapshot(money(100000, "BDT"), snapshot).minor).toBe(830);
  });

  it("refuses a snapshot for the wrong base currency", () => {
    expect(() => convertWithSnapshot(money(100, "USD"), snapshot)).toThrow();
  });
});

describe("ledger arithmetic", () => {
  it("keeps seller + platform equal to gross", () => {
    const gross = money(9999);
    const platform = applyBasisPoints(gross, 1000);
    expect(add(sub(gross, platform), platform).minor).toBe(gross.minor);
  });
});
