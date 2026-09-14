/**
 * Commerce depth guards: VAT display parity and invoice-line reconciliation.
 *
 * The one rule these tests protect: whatever the shopper saw in the price list
 * is what they pay. In inclusive mode VAT is carved out of the listed price,
 * in exclusive mode it is added on top, and in both modes per-line VAT must sum
 * exactly to the invoice VAT so the printed document reconciles to the paisa.
 */
import { describe, expect, it } from "vitest";
import { money } from "./money";
import { type VatRate, splitVatAcrossLines, vatBreakdown } from "./vat";

const rate: VatRate = {
  countryCode: "BD",
  category: "standard",
  rateBasisPoints: 1500,
  effectiveYear: 2025,
  resolved: true,
};

describe("VAT display parity", () => {
  it("adds VAT on top in exclusive mode", () => {
    const b = vatBreakdown(money(10_000, "BDT"), rate, "exclusive");
    expect(b.net.minor).toBe(10_000);
    expect(b.vat.minor).toBe(1_500);
    expect(b.gross.minor).toBe(11_500);
  });

  it("extracts VAT from the listed price in inclusive mode", () => {
    const b = vatBreakdown(money(10_000, "BDT"), rate, "inclusive");
    // Shopper pays exactly the listed amount — this is the parity guarantee.
    expect(b.gross.minor).toBe(10_000);
    expect(b.net.minor + b.vat.minor).toBe(10_000);
  });

  it("never charges VAT when no legal rate resolved", () => {
    const unresolved: VatRate = { ...rate, rateBasisPoints: 0, resolved: false };
    const b = vatBreakdown(money(9_999, "BDT"), unresolved, "exclusive");
    expect(b.vat.minor).toBe(0);
    expect(b.gross.minor).toBe(9_999);
  });
});

describe("invoice line reconciliation", () => {
  it("per-line VAT sums exactly to invoice VAT in both modes", () => {
    const lines = [money(3_333, "BDT"), money(3_333, "BDT"), money(3_334, "BDT")];
    for (const mode of ["exclusive", "inclusive"] as const) {
      const b = vatBreakdown(money(10_000, "BDT"), rate, mode);
      const split = splitVatAcrossLines(b, lines);
      expect(split.reduce((s, m) => s + m.minor, 0)).toBe(b.vat.minor);
    }
  });

  it("handles a single line without losing paisa", () => {
    const b = vatBreakdown(money(1, "BDT"), rate, "inclusive");
    const split = splitVatAcrossLines(b, [money(1, "BDT")]);
    expect(split[0]?.minor).toBe(b.vat.minor);
  });
});
