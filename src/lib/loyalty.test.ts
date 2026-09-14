import { describe, expect, it } from "vitest";
import {
  attributeOrder,
  commissionFor,
  DEFAULT_AFFILIATE,
  DEFAULT_PROGRAM,
  DEFAULT_REFERRAL,
  earnPoints,
  evaluateReferral,
  explainReason,
  normalizeProgram,
  payoutReadiness,
  planSpend,
  quoteRedemption,
  summarizeLedger,
  tierFor,
  tierProgress,
  type ReferralCheck,
} from "./loyalty";

describe("tiers", () => {
  it("places spend on the right rung", () => {
    expect(tierFor(0)).toBe("bronze");
    expect(tierFor(499_99)).toBe("bronze");
    expect(tierFor(500_00)).toBe("silver");
    expect(tierFor(50_000_00)).toBe("platinum");
  });

  it("reports the gap to the next tier and tops out at platinum", () => {
    const silver = tierProgress(1_000_00);
    expect(silver.next).toBe("gold");
    expect(silver.remainingMinor).toBe(1_500_00);
    expect(tierProgress(20_000_00)).toMatchObject({ next: null, percent: 100, remainingMinor: 0 });
  });
});

describe("earnPoints", () => {
  it("excludes shipping, tax, discounts and point-funded amounts", () => {
    const result = earnPoints(DEFAULT_PROGRAM, {
      subtotalMinor: 2_000_00,
      shippingMinor: 100_00,
      taxMinor: 50_00,
      discountMinor: 200_00,
      pointsPaidMinor: 300_00,
      lifetimeNetMinor: 0,
    });
    expect(result.qualifyingMinor).toBe(1_500_00);
    expect(result.points).toBe(1500);
    expect(result.tier).toBe("bronze");
  });

  it("applies the tier multiplier and never returns a fraction", () => {
    const gold = earnPoints(DEFAULT_PROGRAM, {
      subtotalMinor: 1_001_50,
      shippingMinor: 0,
      taxMinor: 0,
      discountMinor: 0,
      pointsPaidMinor: 0,
      lifetimeNetMinor: 3_000_00,
    });
    expect(gold.tier).toBe("gold");
    expect(gold.multiplier).toBe(1.5);
    expect(Number.isInteger(gold.points)).toBe(true);
    expect(gold.points).toBe(1502);
  });

  it("cannot go negative when discounts exceed the subtotal", () => {
    const result = earnPoints(DEFAULT_PROGRAM, {
      subtotalMinor: 100_00,
      shippingMinor: 0,
      taxMinor: 0,
      discountMinor: 900_00,
      pointsPaidMinor: 0,
      lifetimeNetMinor: 0,
    });
    expect(result.points).toBe(0);
    expect(result.qualifyingMinor).toBe(0);
  });

  it("honours a merchant who does pay points on shipping", () => {
    const program = normalizeProgram({ earnOnShipping: true });
    const result = earnPoints(program, {
      subtotalMinor: 500_00,
      shippingMinor: 60_00,
      taxMinor: 0,
      discountMinor: 0,
      pointsPaidMinor: 0,
      lifetimeNetMinor: 0,
    });
    expect(result.qualifyingMinor).toBe(560_00);
  });
});

describe("normalizeProgram", () => {
  it("clamps hostile configuration instead of trusting it", () => {
    const p = normalizeProgram({
      pointsPerMajorUnit: -5,
      maxRedeemPercent: 900,
      pointValueMinor: 0,
      expiryDays: 99_999,
      minRedeemPoints: 12.7,
    });
    expect(p.pointsPerMajorUnit).toBe(0);
    expect(p.maxRedeemPercent).toBe(100);
    expect(p.pointValueMinor).toBe(1);
    expect(p.expiryDays).toBe(3650);
    expect(p.minRedeemPoints).toBe(12);
  });
});

describe("quoteRedemption", () => {
  it("caps redemption at the merchant's percentage of the order", () => {
    const quote = quoteRedemption(DEFAULT_PROGRAM, {
      balancePoints: 10_000,
      orderTotalMinor: 1_000_00,
    });
    expect(quote.discountMinor).toBe(300_00);
    expect(quote.points).toBe(3000);
  });

  it("never spends more than the balance", () => {
    const quote = quoteRedemption(DEFAULT_PROGRAM, {
      balancePoints: 450,
      orderTotalMinor: 1_000_00,
      requestedPoints: 5000,
    });
    expect(quote.points).toBe(450);
    expect(quote.discountMinor).toBe(45_00);
  });

  it("refuses dust redemptions with a reason the shopper can read", () => {
    const quote = quoteRedemption(DEFAULT_PROGRAM, { balancePoints: 40, orderTotalMinor: 1_000_00 });
    expect(quote.points).toBe(0);
    expect(explainReason(quote.reason, "bn")).toMatch(/[\u0980-\u09FF]/);
  });

  it("refuses when the order is too small to absorb the minimum", () => {
    const quote = quoteRedemption(DEFAULT_PROGRAM, { balancePoints: 10_000, orderTotalMinor: 10_00 });
    expect(quote.points).toBe(0);
    expect(quote.reason).toBe("below_minimum");
  });
});

describe("ledger", () => {
  const entries = [
    { id: "a", points: 100, state: "available" as const, expiresAt: "2026-09-01T00:00:00.000Z" },
    { id: "b", points: 300, state: "available" as const, expiresAt: "2027-01-01T00:00:00.000Z" },
    { id: "c", points: 50, state: "pending" as const, expiresAt: null },
    { id: "d", points: 25, state: "expired" as const, expiresAt: "2026-01-01T00:00:00.000Z" },
  ];

  it("splits the balance by state and warns about near expiry", () => {
    const summary = summarizeLedger(entries, new Date("2026-08-10T00:00:00.000Z"));
    expect(summary.available).toBe(400);
    expect(summary.pending).toBe(50);
    expect(summary.expiringSoon).toBe(100);
  });

  it("draws from the soonest-expiring points first", () => {
    const plan = planSpend(entries, 250);
    expect(plan.draws).toEqual([
      { id: "a", points: 100 },
      { id: "b", points: 150 },
    ]);
    expect(plan.shortfall).toBe(0);
  });

  it("reports a shortfall rather than overdrawing", () => {
    const plan = planSpend(entries, 900);
    expect(plan.shortfall).toBe(500);
    expect(plan.draws.reduce((n, d) => n + d.points, 0)).toBe(400);
  });
});

describe("evaluateReferral", () => {
  const base: ReferralCheck = {
    referrerId: "r1",
    refereeId: "r2",
    refereeOrderTotalMinor: 800_00,
    refereeIsFirstOrder: true,
    rewardsInWindow: 0,
    sharedDeviceHash: false,
    sharedPaymentFingerprint: false,
    refereeAccountAgeMinutes: 240,
  };

  it("pays a clean referral", () => {
    const verdict = evaluateReferral(DEFAULT_REFERRAL, base);
    expect(verdict).toMatchObject({ qualified: true, referrerPoints: 500, refereeDiscountMinor: 100_00 });
  });

  it("blocks self-referral", () => {
    expect(evaluateReferral(DEFAULT_REFERRAL, { ...base, refereeId: "r1" }).reason).toBe("self_referral");
  });

  it("holds same-household signals for review instead of paying", () => {
    const verdict = evaluateReferral(DEFAULT_REFERRAL, { ...base, sharedPaymentFingerprint: true });
    expect(verdict.qualified).toBe(false);
    expect(verdict.reviewRequired).toBe(true);
    expect(verdict.referrerPoints).toBe(0);
  });

  it("rejects repeat orders, small orders and farmed accounts", () => {
    expect(evaluateReferral(DEFAULT_REFERRAL, { ...base, refereeIsFirstOrder: false }).reason).toBe(
      "not_first_order",
    );
    expect(evaluateReferral(DEFAULT_REFERRAL, { ...base, refereeOrderTotalMinor: 100_00 }).reason).toBe(
      "order_below_minimum",
    );
    expect(evaluateReferral(DEFAULT_REFERRAL, { ...base, refereeAccountAgeMinutes: 1 }).reason).toBe(
      "account_too_new",
    );
    expect(evaluateReferral(DEFAULT_REFERRAL, { ...base, rewardsInWindow: 10 }).reason).toBe(
      "window_cap_reached",
    );
  });
});

describe("affiliate commission", () => {
  it("pays basis points on net revenue only", () => {
    const result = commissionFor(DEFAULT_AFFILIATE, {
      subtotalMinor: 2_000_00,
      shippingMinor: 100_00,
      discountMinor: 200_00,
      refundedMinor: 300_00,
    });
    expect(result.qualifyingMinor).toBe(1_500_00);
    expect(result.commissionMinor).toBe(75_00);
  });

  it("pays nothing once the order is fully refunded", () => {
    const result = commissionFor(DEFAULT_AFFILIATE, {
      subtotalMinor: 500_00,
      shippingMinor: 0,
      discountMinor: 0,
      refundedMinor: 900_00,
    });
    expect(result.commissionMinor).toBe(0);
  });

  it("adds the flat bonus on top of the percentage", () => {
    const result = commissionFor(
      { ...DEFAULT_AFFILIATE, flatMinor: 50_00 },
      { subtotalMinor: 1_000_00, shippingMinor: 0, discountMinor: 0, refundedMinor: 0 },
    );
    expect(result.commissionMinor).toBe(50_00 + 50_00);
  });
});

describe("attributeOrder", () => {
  const orderAt = "2026-08-10T12:00:00.000Z";

  it("gives credit to the last click inside the cookie window", () => {
    const winner = attributeOrder(DEFAULT_AFFILIATE, {
      orderAt,
      customerId: "cust-1",
      clicks: [
        { affiliateId: "aff-old", affiliateOwnerId: null, clickedAt: "2026-08-01T09:00:00.000Z" },
        { affiliateId: "aff-new", affiliateOwnerId: null, clickedAt: "2026-08-09T09:00:00.000Z" },
      ],
    });
    expect(winner?.affiliateId).toBe("aff-new");
    expect(winner?.contenders).toBe(2);
  });

  it("ignores clicks outside the window and clicks after the order", () => {
    const winner = attributeOrder(DEFAULT_AFFILIATE, {
      orderAt,
      customerId: null,
      clicks: [
        { affiliateId: "stale", affiliateOwnerId: null, clickedAt: "2026-01-01T00:00:00.000Z" },
        { affiliateId: "future", affiliateOwnerId: null, clickedAt: "2026-08-11T00:00:00.000Z" },
      ],
    });
    expect(winner).toBeNull();
  });

  it("refuses to pay an affiliate for buying through their own link", () => {
    const winner = attributeOrder(DEFAULT_AFFILIATE, {
      orderAt,
      customerId: "cust-1",
      clicks: [{ affiliateId: "aff-self", affiliateOwnerId: "cust-1", clickedAt: "2026-08-09T09:00:00.000Z" }],
    });
    expect(winner).toBeNull();
  });
});

describe("payoutReadiness", () => {
  it("only counts matured approved commissions as payable", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const state = payoutReadiness(
      DEFAULT_AFFILIATE,
      [
        { state: "approved", amountMinor: 600_00, matureAt: "2026-08-01T00:00:00.000Z" },
        { state: "approved", amountMinor: 900_00, matureAt: "2026-09-01T00:00:00.000Z" },
        { state: "pending", amountMinor: 200_00, matureAt: "2026-08-01T00:00:00.000Z" },
        { state: "reversed", amountMinor: 100_00, matureAt: "2026-08-01T00:00:00.000Z" },
        { state: "paid", amountMinor: 400_00, matureAt: "2026-07-01T00:00:00.000Z" },
      ],
      now,
    );
    expect(state.payable).toBe(600_00);
    expect(state.pending).toBe(1_100_00);
    expect(state.paid).toBe(400_00);
    expect(state.reversed).toBe(100_00);
    expect(state.canPayout).toBe(false);
    expect(state.shortfallMinor).toBe(400_00);
  });
});
