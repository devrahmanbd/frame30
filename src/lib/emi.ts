/**
 * Phase 2.7 — EMI helpers.
 *
 * Pure, integer-only, and **server-side by contract**: the storefront widget
 * never runs any of this. It receives an already-computed per-month figure in
 * minor units and renders it through the shared money formatter.
 *
 * Rates are supplied by the caller (a bank/tenure table), never hardcoded
 * here, so a rate change is a data change.
 */

/** Tenures a Bangladeshi card EMI is normally offered on. */
export const EMI_TENURES = [3, 6, 9, 12] as const;
export type EmiTenure = (typeof EMI_TENURES)[number];

export function isEmiTenure(value: number): value is EmiTenure {
  return (EMI_TENURES as readonly number[]).includes(value);
}

export type EmiPlan = {
  bank: string;
  tenureMonths: number;
  /** Flat annual rate in basis points, as published by the bank. */
  rateBasisPoints: number;
  /** Per-month instalment in minor units, rounded half-up. */
  perMonthMinor: number;
  /** Everything the shopper pays across the tenure, in minor units. */
  totalMinor: number;
};

/**
 * Flat-rate instalment, the way BD card EMI is actually quoted: interest is
 * charged on the full principal for the tenure, then the total is divided by
 * the number of months. All arithmetic stays in integer minor units; the only
 * rounding is a single half-up at the end, and the first instalment absorbs
 * the remainder so the schedule sums exactly to the total.
 */
export function emiPlan(
  principalMinor: number,
  tenureMonths: number,
  rateBasisPoints: number,
  bank = "",
): EmiPlan | null {
  const principal = Math.trunc(principalMinor);
  if (!Number.isFinite(principal) || principal <= 0) return null;
  // Only the published tenures are quotable; anything else is a data bug.
  if (!Number.isFinite(tenureMonths) || !isEmiTenure(Math.trunc(tenureMonths))) return null;
  const bp = Number.isFinite(rateBasisPoints) ? Math.max(0, Math.trunc(rateBasisPoints)) : 0;

  const months = Math.trunc(tenureMonths);
  // Interest for the tenure = principal × annual bp × months / (10000 × 12).
  const interest = Math.floor((principal * bp * months) / (10000 * 12) + 0.5);
  const total = principal + interest;
  const perMonth = Math.floor(total / months + 0.5);
  return { bank, tenureMonths: months, rateBasisPoints: bp, perMonthMinor: perMonth, totalMinor: total };
}

/** The instalment schedule, remainder absorbed by the first month. */
export function emiSchedule(plan: EmiPlan): number[] {
  const base = Math.floor(plan.totalMinor / plan.tenureMonths);
  const remainder = plan.totalMinor - base * plan.tenureMonths;
  return Array.from({ length: plan.tenureMonths }, (_, i) => (i === 0 ? base + remainder : base));
}

/** Stable label for a plan row; locale-resolved copy lives in the widget. */
export function emiPlanKey(plan: Pick<EmiPlan, "bank" | "tenureMonths">): string {
  return `${plan.bank}:${plan.tenureMonths}`;
}
