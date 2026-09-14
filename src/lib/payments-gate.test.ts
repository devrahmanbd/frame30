import { describe, expect, it } from "vitest";
import {
  PROVIDER_CATALOG,
  checklistGaps,
  credentialCanTransition,
  emiOffers,
  evaluateSubmission,
  canDecide,
  maskSecret,
} from "./provider-gate";
import {
  computeBalance,
  evaluateApprovals,
  maskDestination,
  netPayoutMinor,
  normalizeMsisdn,
  payoutCanTransition,
  payoutFeeMinor,
  retryDelaySeconds,
  validateAccount,
  validateAmount,
} from "./payouts";
import {
  auditSnapshots,
  currencyModeCanTransition,
  driftBps,
  evaluateCurrencyGate,
} from "./currency-gate";

describe("provider sign-off gate", () => {
  it("refuses illegal credential transitions", () => {
    expect(credentialCanTransition("draft", "live")).toBe(false);
    expect(credentialCanTransition("draft", "submitted")).toBe(true);
    expect(credentialCanTransition("approved", "live")).toBe(true);
    expect(credentialCanTransition("revoked", "live")).toBe(false);
  });

  it("blocks live submission until every piece of evidence and secret exists", () => {
    const spec = PROVIDER_CATALOG.bkash;
    const partial = Object.fromEntries(spec.requires.slice(0, 2).map((k) => [k, true]));
    const bad = evaluateSubmission("bkash", "live", partial, ["app_key"]);
    expect(bad.ok).toBe(false);
    expect(bad.missingEvidence.length).toBeGreaterThan(0);
    expect(bad.missingSecrets).toContain("app_secret");

    const full = Object.fromEntries(spec.requires.map((k) => [k, true]));
    const good = evaluateSubmission("bkash", "live", full, spec.secretFields);
    expect(good.ok).toBe(true);
    expect(checklistGaps("bkash", full)).toEqual([]);
  });

  it("lets sandbox through without the live evidence pack", () => {
    expect(evaluateSubmission("nagad", "sandbox", {}, []).ok).toBe(true);
  });

  it("never lets a merchant approve its own rail", () => {
    expect(canDecide(false, "u1", "u2").ok).toBe(false);
    expect(canDecide(true, "u1", "u1").reason).toBe("provider.self_review");
    expect(canDecide(true, "reviewer", "merchant").ok).toBe(true);
  });

  it("builds EMI schedules that sum back to the total", () => {
    const offers = emiOffers("bank_emi", 3_000_000);
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      const first = (o as unknown as { firstInstalmentMinor: number }).firstInstalmentMinor;
      expect(first + o.perInstalmentMinor * (o.months - 1)).toBe(o.totalMinor);
      expect(Number.isInteger(o.perInstalmentMinor)).toBe(true);
    }
    expect(emiOffers("bank_emi", 100)).toEqual([]);
  });

  it("masks secrets", () => {
    expect(maskSecret("abcd1234")).toBe("••••1234");
    expect(maskSecret("ab")).toBe("••••");
  });
});

describe("payout rules", () => {
  it("derives available balance from the ledger and reservations", () => {
    const b = computeBalance({
      entries: [
        { direction: "credit", sellerMinor: 500_00 },
        { direction: "credit", sellerMinor: 300_00 },
        { direction: "debit", sellerMinor: 100_00 },
      ],
      reservedMinor: 200_00,
      holdMinor: 50_00,
    });
    expect(b.grossMinor).toBe(700_00);
    expect(b.availableMinor).toBe(450_00);
  });

  it("never reports a negative available balance", () => {
    expect(computeBalance({ entries: [], reservedMinor: 1000, holdMinor: 0 }).availableMinor).toBe(0);
  });

  it("enforces the amount envelope", () => {
    expect(validateAmount(10_00, 1_000_00).code).toBe("payout.below_minimum");
    expect(validateAmount(600_00, 100_00).code).toBe("payout.insufficient_balance");
    expect(validateAmount(6_000_000_00, 100_000_000_00).code).toBe("payout.above_maximum");
    expect(validateAmount(600_00, 1_000_00).ok).toBe(true);
    expect(validateAmount(1.5, 1_000_00).code).toBe("payout.not_integer");
  });

  it("charges an integer fee and caps the MFS rate", () => {
    expect(payoutFeeMinor(100_00, "mfs")).toBe(125);
    expect(payoutFeeMinor(10_000_00, "mfs")).toBe(5_000);
    expect(payoutFeeMinor(100_00, "bank")).toBe(1_500);
    expect(netPayoutMinor(100_00, "mfs")).toBe(100_00 - 125);
  });

  it("requires four eyes above the threshold and refuses self approval", () => {
    const small = evaluateApprovals({ amountMinor: 1_000_00, requesterId: "a", approvals: [{ actorId: "b", decision: "approve", at: "t" }] });
    expect(small.required).toBe(1);
    expect(small.satisfied).toBe(true);

    const selfOnly = evaluateApprovals({
      amountMinor: 10_000_00,
      requesterId: "a",
      approvals: [
        { actorId: "a", decision: "approve", at: "t" },
        { actorId: "b", decision: "approve", at: "t" },
      ],
    });
    expect(selfOnly.required).toBe(2);
    expect(selfOnly.approvals).toBe(1);
    expect(selfOnly.satisfied).toBe(false);
    expect(selfOnly.blocked).toBe("payout.self_approval");

    const dup = evaluateApprovals({
      amountMinor: 10_000_00,
      requesterId: "a",
      approvals: [
        { actorId: "b", decision: "approve", at: "t" },
        { actorId: "b", decision: "approve", at: "t" },
      ],
    });
    expect(dup.satisfied).toBe(false);
    expect(dup.blocked).toBe("payout.duplicate_approver");

    const rejected = evaluateApprovals({
      amountMinor: 1_000_00,
      requesterId: "a",
      approvals: [
        { actorId: "b", decision: "approve", at: "t" },
        { actorId: "c", decision: "reject", at: "t" },
      ],
    });
    expect(rejected.rejected).toBe(true);
    expect(rejected.satisfied).toBe(false);
  });

  it("walks the payout state machine one edge at a time", () => {
    expect(payoutCanTransition("requested", "paid")).toBe(false);
    expect(payoutCanTransition("approved", "processing")).toBe(true);
    expect(payoutCanTransition("processing", "paid")).toBe(true);
    expect(payoutCanTransition("paid", "processing")).toBe(false);
    expect(payoutCanTransition("cancelled", "requested")).toBe(false);
  });

  it("validates destinations per rail and masks them", () => {
    expect(normalizeMsisdn("+8801712345678")).toBe("01712345678");
    expect(validateAccount({ method: "mfs", holderName: "Rahim Uddin", msisdn: "8801712345678" }).ok).toBe(true);
    expect(validateAccount({ method: "mfs", holderName: "Rahim Uddin", msisdn: "0121234" }).code).toBe("payout.bad_msisdn");
    expect(
      validateAccount({ method: "bank", holderName: "Rahim Uddin", bankName: "BRAC Bank", accountNumber: "1234567890" }).ok,
    ).toBe(true);
    expect(
      validateAccount({ method: "bank", holderName: "R", bankName: "BRAC Bank", accountNumber: "1234567890" }).code,
    ).toBe("payout.bad_holder");
    expect(maskDestination({ method: "mfs", msisdn: "01712345678" })).toBe("••••5678");
  });

  it("backs off exponentially but caps at six hours", () => {
    expect(retryDelaySeconds(1)).toBe(60);
    expect(retryDelaySeconds(3)).toBe(240);
    expect(retryDelaySeconds(20)).toBe(21_600);
  });
});

describe("USD pilot gate", () => {
  const now = new Date("2026-08-10T12:00:00Z");
  const passing = {
    planTier: "business",
    subscriptionStatus: "active",
    entitled: true,
    consentAt: "2026-08-01T00:00:00Z",
    fxSnapshotAt: "2026-08-10T11:00:00Z",
    kycState: "approved",
    now,
  };

  it("passes only when all five checks hold", () => {
    expect(evaluateCurrencyGate(passing).allowed).toBe(true);
  });

  it("fails closed on a stale FX feed and names the check", () => {
    const v = evaluateCurrencyGate({ ...passing, fxSnapshotAt: "2026-08-01T00:00:00Z" });
    expect(v.allowed).toBe(false);
    expect(v.deniedFor).toContain("fx_feed");
  });

  it("denies a starter plan, a missing entitlement and suspended KYC", () => {
    expect(evaluateCurrencyGate({ ...passing, planTier: "growth" }).deniedFor).toContain("plan_tier");
    expect(evaluateCurrencyGate({ ...passing, entitled: false }).deniedFor).toContain("entitlement");
    expect(evaluateCurrencyGate({ ...passing, kycState: "suspended" }).deniedFor).toContain("kyc_standing");
    expect(evaluateCurrencyGate({ ...passing, consentAt: null }).deniedFor).toContain("owner_consent");
  });

  it("always allows rollback to BDT but never a silent jump into USD", () => {
    expect(currencyModeCanTransition("usd_enabled", "bdt_locked")).toBe(true);
    expect(currencyModeCanTransition("bdt_locked", "usd_enabled")).toBe(false);
    expect(currencyModeCanTransition("pilot_assessing", "usd_enabled")).toBe(true);
  });

  it("flags suspicious FX drift", () => {
    expect(driftBps(100_000, 101_000)).toBe(100);
    const audited = auditSnapshots([
      { snapshotId: "1", base: "USD", quote: "BDT", ratePpm: 120_000_000, source: "feed", effectiveAt: "2026-08-01T00:00:00Z" },
      { snapshotId: "2", base: "USD", quote: "BDT", ratePpm: 132_000_000, source: "feed", effectiveAt: "2026-08-02T00:00:00Z" },
    ]);
    expect(audited[1]?.suspicious).toBe(true);
    expect(audited[0]?.driftBps).toBe(0);
  });
});
