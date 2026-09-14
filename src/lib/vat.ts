/**
 * VAT compute service (pure). Rates only ever arrive from the legal-year table
 * — this module never carries a rate constant.
 *
 * Two modes, because BD merchants advertise both ways:
 *   exclusive — the listed price is net, VAT is added on top.
 *   inclusive — the listed price already contains VAT, which must be extracted.
 *
 * Rounding is half-up on the minor unit (see `applyBasisPoints`), and per-line
 * VAT is allocated with the largest-remainder method so line VAT sums exactly
 * to the invoice VAT.
 */
import {
  type Money,
  allocateByLines,
  applyBasisPoints,
  money,
  sub,
  zero,
} from "./money";

export type VatRate = {
  countryCode: string;
  category: string;
  rateBasisPoints: number;
  effectiveYear: number;
  /** false = no row covered this year; treated as 0% and surfaced to the desk. */
  resolved: boolean;
};

export type VatMode = "exclusive" | "inclusive";

export type VatBreakdown = {
  mode: VatMode;
  rate: VatRate;
  net: Money;
  vat: Money;
  gross: Money;
};

/** VAT on top of a net amount. */
export function vatExclusive(net: Money, rate: VatRate): VatBreakdown {
  const vat = applyBasisPoints(net, rate.rateBasisPoints);
  return {
    mode: "exclusive",
    rate,
    net,
    vat,
    gross: money(net.minor + vat.minor, net.currency),
  };
}

/**
 * VAT extracted from a gross amount: vat = gross * bp / (10000 + bp), half-up.
 * Deriving net by subtraction keeps net + vat === gross exactly.
 */
export function vatInclusive(gross: Money, rate: VatRate): VatBreakdown {
  const bp = rate.rateBasisPoints;
  const vatMinor = bp === 0 ? 0 : Math.floor((gross.minor * bp) / (10000 + bp) + 0.5);
  const vat = money(vatMinor, gross.currency);
  return { mode: "inclusive", rate, net: sub(gross, vat), vat, gross };
}

export function vatBreakdown(amount: Money, rate: VatRate, mode: VatMode): VatBreakdown {
  return mode === "inclusive" ? vatInclusive(amount, rate) : vatExclusive(amount, rate);
}

/** Per-line VAT split that reconciles to the invoice total, paisa for paisa. */
export function splitVatAcrossLines(breakdown: VatBreakdown, lineTotals: Money[]): Money[] {
  if (lineTotals.length === 0) return [];
  if (breakdown.vat.minor === 0) return lineTotals.map(() => zero(breakdown.vat.currency));
  return allocateByLines(breakdown.vat, lineTotals);
}

/**
 * Refund VAT component. A partial refund carries its proportional VAT share so
 * the credit note is legally correct; full refunds return the whole VAT.
 */
export function refundVatComponent(breakdown: VatBreakdown, refund: Money): Money {
  if (breakdown.gross.minor === 0 || refund.minor <= 0) return zero(refund.currency);
  if (refund.minor >= breakdown.gross.minor) return breakdown.vat;
  const [share] = allocateByLines(breakdown.vat, [
    refund,
    money(breakdown.gross.minor - refund.minor, refund.currency),
  ]);
  return share as Money;
}

/** Invoice display line: "including VAT" is never implied, always stated. */
export function vatLabel(rate: VatRate, lang: "en" | "bn") {
  const pct = (rate.rateBasisPoints / 100).toFixed(rate.rateBasisPoints % 100 === 0 ? 0 : 2);
  return lang === "bn" ? `ভ্যাট ${pct}%` : `VAT ${pct}%`;
}
