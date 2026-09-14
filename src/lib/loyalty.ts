/**
 * Loyalty, referral and affiliate engine (§4.3).
 *
 * Pure and deterministic on purpose: money-adjacent rules must be testable
 * without a database, reproducible in a dispute, and identical on the server
 * and in any preview UI. Everything is computed in integer minor units and
 * whole points — no floats reach a balance.
 *
 * The three programmes share one spine:
 *   earn  -> a rule turns an order into points or commission
 *   hold  -> the credit is pending until the return window closes
 *   settle-> it becomes spendable, or is clawed back on refund
 * Because the hold step is explicit, a refunded order can never leave the
 * merchant paying out on revenue they gave back.
 */

export type Tier = "bronze" | "silver" | "gold" | "platinum";

export const TIERS: Tier[] = ["bronze", "silver", "gold", "platinum"];

/** Lifetime *net* spend (minor units) required to hold a tier, plus its perks. */
export const TIER_LADDER: Record<
  Tier,
  { minLifetimeMinor: number; earnMultiplier: number; label: { en: string; bn: string } }
> = {
  bronze: { minLifetimeMinor: 0, earnMultiplier: 1, label: { en: "Bronze", bn: "ব্রোঞ্জ" } },
  silver: { minLifetimeMinor: 500_00, earnMultiplier: 1.25, label: { en: "Silver", bn: "সিলভার" } },
  gold: { minLifetimeMinor: 2_500_00, earnMultiplier: 1.5, label: { en: "Gold", bn: "গোল্ড" } },
  platinum: {
    minLifetimeMinor: 10_000_00,
    earnMultiplier: 2,
    label: { en: "Platinum", bn: "প্ল্যাটিনাম" },
  },
};

export type LoyaltyProgram = {
  /** Points granted per whole major unit of qualifying spend, before tier multiplier. */
  pointsPerMajorUnit: number;
  /** Minor units a single point is worth when redeemed. */
  pointValueMinor: number;
  /** Hard ceiling on the share of an order that points may pay for, 0-100. */
  maxRedeemPercent: number;
  /** Points below this cannot be redeemed at all — stops dust redemptions. */
  minRedeemPoints: number;
  /** Days a granted point survives before expiring. 0 disables expiry. */
  expiryDays: number;
  /** Days after delivery before pending points settle. */
  holdDays: number;
  /** Shipping and tax rarely earn; both default to excluded. */
  earnOnShipping: boolean;
  earnOnTax: boolean;
};

export const DEFAULT_PROGRAM: LoyaltyProgram = {
  pointsPerMajorUnit: 1,
  pointValueMinor: 10,
  maxRedeemPercent: 30,
  minRedeemPoints: 100,
  expiryDays: 365,
  holdDays: 7,
  earnOnShipping: false,
  earnOnTax: false,
};

export function normalizeProgram(input: Partial<LoyaltyProgram> | null | undefined): LoyaltyProgram {
  const p = { ...DEFAULT_PROGRAM, ...(input ?? {}) };
  return {
    pointsPerMajorUnit: clampInt(p.pointsPerMajorUnit, 0, 1000),
    pointValueMinor: clampInt(p.pointValueMinor, 1, 100_00),
    maxRedeemPercent: clampInt(p.maxRedeemPercent, 0, 100),
    minRedeemPoints: clampInt(p.minRedeemPoints, 0, 1_000_000),
    expiryDays: clampInt(p.expiryDays, 0, 3650),
    holdDays: clampInt(p.holdDays, 0, 180),
    earnOnShipping: Boolean(p.earnOnShipping),
    earnOnTax: Boolean(p.earnOnTax),
  };
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function tierFor(lifetimeNetMinor: number): Tier {
  const spend = Math.max(0, Math.trunc(lifetimeNetMinor));
  let current: Tier = "bronze";
  for (const tier of TIERS) {
    if (spend >= TIER_LADDER[tier].minLifetimeMinor) current = tier;
  }
  return current;
}

/** How much more the customer must spend to reach the next tier (0 at the top). */
export function tierProgress(lifetimeNetMinor: number) {
  const tier = tierFor(lifetimeNetMinor);
  const next = TIERS[TIERS.indexOf(tier) + 1];
  if (!next) return { tier, next: null, remainingMinor: 0, percent: 100 };
  const floor = TIER_LADDER[tier].minLifetimeMinor;
  const ceiling = TIER_LADDER[next].minLifetimeMinor;
  const span = Math.max(1, ceiling - floor);
  const done = Math.max(0, Math.min(span, Math.trunc(lifetimeNetMinor) - floor));
  return {
    tier,
    next,
    remainingMinor: ceiling - Math.trunc(lifetimeNetMinor),
    percent: Math.round((done / span) * 100),
  };
}

export type EarnInput = {
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  discountMinor: number;
  /** Portion of the order already paid with points — never earns again. */
  pointsPaidMinor: number;
  lifetimeNetMinor: number;
  /** Minor units per major unit, 100 for BDT/USD. */
  minorPerMajor?: number;
};

/**
 * Points a completed order should grant. Discounts and point-funded amounts are
 * removed first so a customer cannot bootstrap an infinite loop by redeeming
 * points to earn points.
 */
export function earnPoints(program: LoyaltyProgram, input: EarnInput) {
  const minorPerMajor = input.minorPerMajor && input.minorPerMajor > 0 ? input.minorPerMajor : 100;
  const base =
    Math.max(0, Math.trunc(input.subtotalMinor)) +
    (program.earnOnShipping ? Math.max(0, Math.trunc(input.shippingMinor)) : 0) +
    (program.earnOnTax ? Math.max(0, Math.trunc(input.taxMinor)) : 0);
  const qualifying = Math.max(
    0,
    base - Math.max(0, Math.trunc(input.discountMinor)) - Math.max(0, Math.trunc(input.pointsPaidMinor)),
  );
  const tier = tierFor(input.lifetimeNetMinor);
  const multiplier = TIER_LADDER[tier].earnMultiplier;
  const points = Math.floor(
    (qualifying / minorPerMajor) * program.pointsPerMajorUnit * multiplier,
  );
  return { tier, multiplier, qualifyingMinor: qualifying, points: Math.max(0, points) };
}

/**
 * Largest redemption allowed against an order: bounded by the balance, the
 * merchant's percentage cap, and the order total itself. Returns whole points
 * and the exact discount they buy, so the UI never shows a value the ledger
 * would round away.
 */
export function quoteRedemption(
  program: LoyaltyProgram,
  args: { balancePoints: number; orderTotalMinor: number; requestedPoints?: number },
) {
  const balance = Math.max(0, Math.trunc(args.balancePoints));
  const total = Math.max(0, Math.trunc(args.orderTotalMinor));
  const capMinor = Math.floor((total * program.maxRedeemPercent) / 100);
  const capPoints = Math.floor(capMinor / program.pointValueMinor);
  const wanted =
    args.requestedPoints === undefined ? capPoints : Math.max(0, Math.trunc(args.requestedPoints));
  const points = Math.min(balance, capPoints, wanted);

  if (points < program.minRedeemPoints || points <= 0) {
    return {
      points: 0,
      discountMinor: 0,
      maxPoints: Math.min(balance, capPoints),
      reason:
        capPoints === 0
          ? ("order_too_small" as const)
          : balance < program.minRedeemPoints
            ? ("below_minimum" as const)
            : ("below_minimum" as const),
    };
  }
  return {
    points,
    discountMinor: points * program.pointValueMinor,
    maxPoints: Math.min(balance, capPoints),
    reason: null,
  };
}

export type LedgerEntry = {
  points: number;
  state: "pending" | "available" | "spent" | "expired" | "revoked";
  expiresAt: string | null;
};

/** Balance split by state, plus what expires within the warning horizon. */
export function summarizeLedger(entries: LedgerEntry[], now = new Date(), warnDays = 30) {
  const horizon = new Date(now.getTime() + warnDays * 86_400_000).toISOString();
  let pending = 0;
  let available = 0;
  let spent = 0;
  let expired = 0;
  let expiringSoon = 0;
  for (const e of entries) {
    const points = Math.trunc(e.points);
    if (e.state === "pending") pending += points;
    else if (e.state === "available") {
      available += points;
      if (e.expiresAt && e.expiresAt <= horizon) expiringSoon += points;
    } else if (e.state === "spent") spent += Math.abs(points);
    else if (e.state === "expired") expired += points;
  }
  return { pending, available, spent, expired, expiringSoon, lifetime: available + spent + expired };
}

/** Points expire oldest-first so a customer's soonest-to-die points are used up first. */
export function planSpend(entries: (LedgerEntry & { id: string })[], points: number) {
  let remaining = Math.max(0, Math.trunc(points));
  const draws: { id: string; points: number }[] = [];
  const usable = entries
    .filter((e) => e.state === "available" && e.points > 0)
    .sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
  for (const entry of usable) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, entry.points);
    draws.push({ id: entry.id, points: take });
    remaining -= take;
  }
  return { draws, shortfall: remaining };
}

/* ------------------------------------------------------------------ referral */

export type ReferralPolicy = {
  refereeDiscountMinor: number;
  referrerPoints: number;
  /** Referee must spend at least this much for the reward to qualify. */
  minOrderMinor: number;
  /** Rewards a single referrer can earn per rolling window. */
  maxRewardsPerWindow: number;
  windowDays: number;
};

export const DEFAULT_REFERRAL: ReferralPolicy = {
  refereeDiscountMinor: 100_00,
  referrerPoints: 500,
  minOrderMinor: 500_00,
  maxRewardsPerWindow: 10,
  windowDays: 30,
};

export type ReferralCheck = {
  referrerId: string;
  refereeId: string;
  refereeOrderTotalMinor: number;
  refereeIsFirstOrder: boolean;
  rewardsInWindow: number;
  sharedDeviceHash: boolean;
  sharedPaymentFingerprint: boolean;
  refereeAccountAgeMinutes: number;
};

export type ReferralVerdict = {
  qualified: boolean;
  reason:
    | null
    | "self_referral"
    | "not_first_order"
    | "order_below_minimum"
    | "window_cap_reached"
    | "same_household_signals"
    | "account_too_new";
  referrerPoints: number;
  refereeDiscountMinor: number;
  reviewRequired: boolean;
};

/**
 * Referral abuse is the default, not the exception: the same person ordering
 * to themselves through a second account is the single most common attack, so
 * identity, device and payment overlap all block payout rather than merely
 * flagging it.
 */
export function evaluateReferral(policy: ReferralPolicy, check: ReferralCheck): ReferralVerdict {
  const deny = (reason: NonNullable<ReferralVerdict["reason"]>, reviewRequired = false) => ({
    qualified: false,
    reason,
    referrerPoints: 0,
    refereeDiscountMinor: 0,
    reviewRequired,
  });

  if (check.referrerId === check.refereeId) return deny("self_referral");
  if (check.sharedDeviceHash || check.sharedPaymentFingerprint) {
    return deny("same_household_signals", true);
  }
  if (!check.refereeIsFirstOrder) return deny("not_first_order");
  if (check.refereeAccountAgeMinutes < 5) return deny("account_too_new", true);
  if (check.refereeOrderTotalMinor < policy.minOrderMinor) return deny("order_below_minimum");
  if (check.rewardsInWindow >= policy.maxRewardsPerWindow) return deny("window_cap_reached", true);

  return {
    qualified: true,
    reason: null,
    referrerPoints: Math.max(0, Math.trunc(policy.referrerPoints)),
    refereeDiscountMinor: Math.max(0, Math.trunc(policy.refereeDiscountMinor)),
    reviewRequired: false,
  };
}

/* ----------------------------------------------------------------- affiliate */

export type AffiliateTerms = {
  /** Basis points of qualifying revenue, e.g. 750 = 7.5%. */
  commissionBps: number;
  /** Optional flat amount per converted order, added to the percentage. */
  flatMinor: number;
  /** Days a click stays attributable. */
  cookieDays: number;
  /** Days a commission stays on hold before it can be paid out. */
  holdDays: number;
  minPayoutMinor: number;
  /** Commission on shipping is unusual; excluded by default. */
  payOnShipping: boolean;
};

export const DEFAULT_AFFILIATE: AffiliateTerms = {
  commissionBps: 500,
  flatMinor: 0,
  cookieDays: 30,
  holdDays: 15,
  minPayoutMinor: 1_000_00,
  payOnShipping: false,
};

export function commissionFor(
  terms: AffiliateTerms,
  order: { subtotalMinor: number; shippingMinor: number; discountMinor: number; refundedMinor: number },
) {
  const gross =
    Math.max(0, Math.trunc(order.subtotalMinor)) +
    (terms.payOnShipping ? Math.max(0, Math.trunc(order.shippingMinor)) : 0);
  const net = Math.max(
    0,
    gross - Math.max(0, Math.trunc(order.discountMinor)) - Math.max(0, Math.trunc(order.refundedMinor)),
  );
  if (net === 0) return { qualifyingMinor: 0, commissionMinor: 0 };
  const percentPart = Math.floor((net * Math.max(0, Math.trunc(terms.commissionBps))) / 10_000);
  return {
    qualifyingMinor: net,
    commissionMinor: percentPart + Math.max(0, Math.trunc(terms.flatMinor)),
  };
}

/**
 * Last non-direct click inside the cookie window wins — the model merchants
 * expect and the one that matches the ad networks they compare us against.
 * Self-clicks and clicks after the order are discarded outright.
 */
export function attributeOrder(
  terms: AffiliateTerms,
  args: {
    orderAt: string;
    customerId: string | null;
    clicks: { affiliateId: string; affiliateOwnerId: string | null; clickedAt: string }[];
  },
) {
  const orderTime = Date.parse(args.orderAt);
  const windowMs = terms.cookieDays * 86_400_000;
  const eligible = args.clicks
    .filter((c) => {
      const t = Date.parse(c.clickedAt);
      if (!Number.isFinite(t) || t > orderTime) return false;
      if (orderTime - t > windowMs) return false;
      if (args.customerId && c.affiliateOwnerId === args.customerId) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.clickedAt) - Date.parse(a.clickedAt));
  const winner = eligible[0];
  return winner
    ? { affiliateId: winner.affiliateId, clickedAt: winner.clickedAt, contenders: eligible.length }
    : null;
}

export function payoutReadiness(
  terms: AffiliateTerms,
  commissions: { state: string; amountMinor: number; matureAt: string }[],
  now = new Date(),
) {
  const nowIso = now.toISOString();
  let pending = 0;
  let payable = 0;
  let paid = 0;
  let reversed = 0;
  for (const c of commissions) {
    const amount = Math.max(0, Math.trunc(c.amountMinor));
    if (c.state === "paid") paid += amount;
    else if (c.state === "reversed") reversed += amount;
    else if (c.state === "approved" && c.matureAt <= nowIso) payable += amount;
    else pending += amount;
  }
  return {
    pending,
    payable,
    paid,
    reversed,
    canPayout: payable >= terms.minPayoutMinor,
    shortfallMinor: Math.max(0, terms.minPayoutMinor - payable),
  };
}

/** Human explanation for every automated decision, in both supported languages. */
export const REASON_TEXT: Record<string, { en: string; bn: string }> = {
  self_referral: {
    en: "The referrer and the buyer are the same account.",
    bn: "রেফারার আর ক্রেতা একই অ্যাকাউন্ট।",
  },
  not_first_order: {
    en: "Referral rewards only apply to the friend's first order.",
    bn: "রেফারেল পুরস্কার শুধু বন্ধুর প্রথম অর্ডারে প্রযোজ্য।",
  },
  order_below_minimum: {
    en: "The order was below the minimum required for a reward.",
    bn: "পুরস্কারের জন্য প্রয়োজনীয় সর্বনিম্ন অর্ডারের চেয়ে কম।",
  },
  window_cap_reached: {
    en: "This referrer already hit the reward cap for the period.",
    bn: "এই রেফারার এই সময়ের পুরস্কার সীমা ছুঁয়ে ফেলেছেন।",
  },
  same_household_signals: {
    en: "The same device or payment method was used by both accounts.",
    bn: "দুই অ্যাকাউন্টে একই ডিভাইস বা পেমেন্ট মাধ্যম ব্যবহার হয়েছে।",
  },
  account_too_new: {
    en: "The friend's account was created moments before ordering.",
    bn: "অর্ডারের ঠিক আগে বন্ধুর অ্যাকাউন্ট খোলা হয়েছে।",
  },
  below_minimum: {
    en: "Not enough points to redeem yet.",
    bn: "রিডিম করার মতো যথেষ্ট পয়েন্ট নেই।",
  },
  order_too_small: {
    en: "This order is too small to pay for with points.",
    bn: "এই অর্ডারে পয়েন্ট ব্যবহার করার মতো যথেষ্ট পরিমাণ নেই।",
  },
};

export function explainReason(reason: string | null, lang: "en" | "bn" = "en") {
  if (!reason) return null;
  return REASON_TEXT[reason]?.[lang] ?? reason;
}
