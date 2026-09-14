/**
 * Pure platform revenue maths. Isomorphic and dependency-free so the numbers
 * on the owner console can be unit tested without a database.
 *
 * Money stays in integer minor units end to end (BDT paisa by default); the
 * only float allowed is a ratio (churn / ARPA percentages), never an amount.
 */

export type SubscriptionRow = {
  merchantId: string;
  plan: string;
  status: "trial" | "active" | "past_due" | "paused" | "cancelled" | string;
  currencyCode: string;
  cancelledAt: string | null;
  createdAt: string | null;
};

export type PlanPrice = {
  plan: string;
  currencyCode: string;
  priceMinorInt: number | null;
};

/** Statuses that bill this period. `past_due` still counts: the contract lives. */
export const BILLING_STATUSES = new Set(["active", "past_due"]);

export type RevenueSnapshot = {
  currencyCode: string;
  mrrMinorInt: number;
  arrMinorInt: number;
  arpaMinorInt: number;
  paying: number;
  trialing: number;
  pastDue: number;
  paused: number;
  cancelled: number;
  perPlan: { plan: string; paying: number; mrrMinorInt: number }[];
  /** Currencies present on subscriptions that do not match the reporting one. */
  mixedCurrencies: string[];
};

export function revenueSnapshot(
  subs: SubscriptionRow[],
  plans: PlanPrice[],
  reportingCurrency = "BDT",
): RevenueSnapshot {
  const price = new Map(
    plans.map((p) => [`${p.plan}:${p.currencyCode}`, p.priceMinorInt ?? 0] as const),
  );
  const perPlan = new Map<string, { paying: number; mrrMinorInt: number }>();
  const mixed = new Set<string>();

  let mrr = 0;
  let paying = 0;
  let trialing = 0;
  let pastDue = 0;
  let paused = 0;
  let cancelled = 0;

  for (const s of subs) {
    if (s.status === "trial") trialing += 1;
    if (s.status === "paused") paused += 1;
    if (s.status === "cancelled") cancelled += 1;
    if (s.status === "past_due") pastDue += 1;
    if (!BILLING_STATUSES.has(s.status)) continue;

    // Never convert across currencies here: conversion is a payments-side,
    // snapshot-backed operation. Foreign rows are reported, not folded in.
    if (s.currencyCode !== reportingCurrency) {
      mixed.add(s.currencyCode);
      continue;
    }
    const amount = price.get(`${s.plan}:${s.currencyCode}`) ?? 0;
    mrr += amount;
    paying += 1;
    const cur = perPlan.get(s.plan) ?? { paying: 0, mrrMinorInt: 0 };
    cur.paying += 1;
    cur.mrrMinorInt += amount;
    perPlan.set(s.plan, cur);
  }

  return {
    currencyCode: reportingCurrency,
    mrrMinorInt: mrr,
    arrMinorInt: mrr * 12,
    arpaMinorInt: paying ? Math.round(mrr / paying) : 0,
    paying,
    trialing,
    pastDue,
    paused,
    cancelled,
    perPlan: [...perPlan]
      .map(([plan, v]) => ({ plan, ...v }))
      .sort((a, b) => b.mrrMinorInt - a.mrrMinorInt),
    mixedCurrencies: [...mixed].sort(),
  };
}

export type ChurnWindow = {
  windowDays: number;
  cancelled: number;
  atRiskStart: number;
  /** Ratio in [0,1]; `null` when there was nothing to churn from. */
  rate: number | null;
};

/**
 * Logo churn over a trailing window: cancellations in the window divided by the
 * population that could have churned (payers at the window start).
 */
export function churnWindow(
  subs: SubscriptionRow[],
  windowDays: number,
  now = new Date(),
): ChurnWindow {
  const start = now.getTime() - windowDays * 86_400_000;
  let cancelledInWindow = 0;
  let atRiskStart = 0;

  for (const s of subs) {
    const cancelled = s.cancelledAt ? Date.parse(s.cancelledAt) : null;
    const created = s.createdAt ? Date.parse(s.createdAt) : null;
    if (cancelled !== null && cancelled >= start && cancelled <= now.getTime()) {
      cancelledInWindow += 1;
    }
    // Existed before the window opened and had not already churned by then.
    const existed = created !== null && created < start;
    const liveAtStart = cancelled === null || cancelled >= start;
    if (existed && liveAtStart) atRiskStart += 1;
  }

  return {
    windowDays,
    cancelled: cancelledInWindow,
    atRiskStart,
    rate: atRiskStart ? cancelledInWindow / atRiskStart : null,
  };
}

export function formatMinor(amountMinorInt: number, currencyCode: string) {
  const major = amountMinorInt / 100;
  return `${currencyCode} ${major.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
