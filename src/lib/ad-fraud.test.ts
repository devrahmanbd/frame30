import { describe, expect, it } from "vitest";
import {
  campaignIntegrity,
  explainSignals,
  integrityAdvice,
  isAdNetwork,
  scoreClick,
  scoreVisitor,
  summarizeIntegrity,
  SUSPICIOUS_THRESHOLD,
  type ClickInput,
} from "./ad-fraud";

function click(overrides: Partial<ClickInput> = {}): ClickInput {
  return {
    network: "facebook",
    javascriptRan: true,
    automationHints: 0,
    userAgent: "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
    dwellMs: 18_000,
    interactions: 6,
    clickId: "fbclid-abc",
    clickIdSeenBefore: false,
    referrerHost: "l.facebook.com",
    ipClass: "residential",
    clicksLastHour: 1,
    distinctVisitorsPerIp: 2,
    visitorCountry: "BD",
    targetCountry: "BD",
    timezoneOffsetMinutes: 360,
    minutesSinceDistantHop: null,
    blocklisted: false,
    networkReports: 0,
    ...overrides,
  };
}

describe("scoreClick", () => {
  it("passes a normal Bangladeshi mobile shopper", () => {
    const result = scoreClick(click());
    expect(result.verdict).toBe("valid");
    expect(result.score).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it("blocks outright when the source is on the merchant blocklist", () => {
    const result = scoreClick(click({ blocklisted: true }));
    expect(result.verdict).toBe("invalid");
    expect(result.decisiveCode).toBe("BLOCKLISTED");
  });

  it("flags a datacenter click farm hammering one campaign", () => {
    const result = scoreClick(
      click({ ipClass: "datacenter", clicksLastHour: 40, distinctVisitorsPerIp: 60, dwellMs: 300, interactions: 0 }),
    );
    expect(result.verdict).toBe("invalid");
    expect(result.signals.map((s) => s.code)).toEqual(
      expect.arrayContaining(["DATACENTER_IP", "CLICK_FLOOD", "IP_FANOUT", "DWELL_TOO_SHORT", "NO_INTERACTION"]),
    );
  });

  it("caps the score at 100 so one click cannot outweigh the scale", () => {
    const result = scoreClick(
      click({
        blocklisted: true,
        ipClass: "datacenter",
        userAgent: "python-requests/2.31",
        javascriptRan: false,
        clicksLastHour: 99,
      }),
    );
    expect(result.score).toBe(100);
  });

  it("quarantines rather than refuses a merely odd visit", () => {
    const result = scoreClick(click({ dwellMs: 900, interactions: 0, referrerHost: null }));
    expect(result.score).toBeGreaterThanOrEqual(SUSPICIOUS_THRESHOLD);
    expect(result.verdict).toBe("suspicious");
  });

  it("detects a spoofed country via the device clock", () => {
    const result = scoreClick(click({ visitorCountry: "BD", timezoneOffsetMinutes: -300 }));
    expect(result.signals.map((s) => s.code)).toContain("TIMEZONE_MISMATCH");
  });

  it("does not punish a missing referrer when there is no ad click id", () => {
    const result = scoreClick(click({ clickId: null, referrerHost: null }));
    expect(result.signals.map((s) => s.code)).not.toContain("MISSING_REFERRER");
  });

  it("does not fire dwell/interaction signals when JavaScript never ran", () => {
    const codes = scoreClick(click({ javascriptRan: false, dwellMs: 0, interactions: 0 })).signals.map(
      (s) => s.code,
    );
    expect(codes).toContain("NO_JAVASCRIPT");
    expect(codes).not.toContain("DWELL_TOO_SHORT");
  });
});

describe("scoreVisitor", () => {
  it("treats a buyer as genuine even after a noisy start", () => {
    const result = scoreVisitor({
      clicks: 4,
      invalidClicks: 2,
      suspiciousClicks: 1,
      productViews: 5,
      cartAdds: 1,
      orders: 1,
      medianDwellMs: 20_000,
      distinctCampaigns: 2,
    });
    expect(result.verdict).toBe("valid");
    expect(result.intentScore).toBeGreaterThan(70);
  });

  it("marks a clicker who never browses as fake", () => {
    const result = scoreVisitor({
      clicks: 12,
      invalidClicks: 10,
      suspiciousClicks: 2,
      productViews: 0,
      cartAdds: 0,
      orders: 0,
      medianDwellMs: 400,
      distinctCampaigns: 5,
    });
    expect(result.verdict).toBe("invalid");
    expect(result.reasons).toContain("CLICKS_WITHOUT_BROWSING");
    expect(result.intentScore).toBe(0);
  });
});

describe("campaignIntegrity", () => {
  const base = {
    network: "google" as const,
    campaign: "eid-sale",
    day: "2026-08-10",
    conversions: 10,
    poisonedConversions: 4,
    currencyCode: "BDT",
  };

  it("splits spend between genuine and refused clicks in minor units", () => {
    const row = campaignIntegrity({
      ...base,
      clicks: 1000,
      invalidClicks: 250,
      suspiciousClicks: 100,
      spendMinorInt: 5_000_00,
    });
    expect(row.invalidRate).toBe(25);
    expect(row.wastedSpendMinorInt).toBe(1_250_00);
    expect(Number.isInteger(row.wastedSpendMinorInt)).toBe(true);
    expect(row.reportedCpcMinorInt).toBe(500);
    expect(row.trueCpcMinorInt).toBe(500);
    expect(row.grade).toBe("C");
  });

  it("never reports negative or above-total counters", () => {
    const row = campaignIntegrity({
      ...base,
      clicks: 10,
      invalidClicks: 99,
      suspiciousClicks: -5,
      spendMinorInt: -100,
    });
    expect(row.invalidClicks).toBe(10);
    expect(row.suspiciousClicks).toBe(0);
    expect(row.spendMinorInt).toBe(0);
    expect(row.wastedSpendMinorInt).toBe(0);
  });

  it("gives a clean campaign an A grade", () => {
    const row = campaignIntegrity({
      ...base,
      poisonedConversions: 0,
      clicks: 500,
      invalidClicks: 3,
      suspiciousClicks: 4,
      spendMinorInt: 1_000_00,
    });
    expect(row.grade).toBe("A");
  });
});

describe("summarizeIntegrity", () => {
  it("names the campaign that burned the most money", () => {
    const rows = [
      campaignIntegrity({
        network: "facebook",
        campaign: "retarget",
        day: "2026-08-10",
        clicks: 100,
        invalidClicks: 10,
        suspiciousClicks: 0,
        conversions: 2,
        poisonedConversions: 0,
        spendMinorInt: 1_000_00,
        currencyCode: "BDT",
      }),
      campaignIntegrity({
        network: "google",
        campaign: "search-brand",
        day: "2026-08-10",
        clicks: 100,
        invalidClicks: 60,
        suspiciousClicks: 0,
        conversions: 2,
        poisonedConversions: 2,
        spendMinorInt: 2_000_00,
        currencyCode: "BDT",
      }),
    ];
    const summary = summarizeIntegrity(rows);
    expect(summary.worstCampaign?.campaign).toBe("search-brand");
    expect(summary.wastedSpendMinorInt).toBe(100_00 + 1_200_00);
    expect(summary.invalidRate).toBe(35);
  });

  it("stays at a perfect score with no traffic at all", () => {
    const summary = summarizeIntegrity([]);
    expect(summary.integrityScore).toBe(100);
    expect(integrityAdvice(summary, "en")).toContain("No ad clicks yet");
  });
});

describe("explainers", () => {
  it("returns Bangla guidance ordered by cost", () => {
    const scored = scoreClick(click({ ipClass: "datacenter", clicksLastHour: 9 }));
    const explained = explainSignals(scored.signals, "bn");
    expect(explained[0]?.weight).toBeGreaterThanOrEqual(explained[1]?.weight ?? 0);
    expect(explained[0]?.title).toMatch(/[\u0980-\u09FF]/);
  });

  it("only accepts known ad networks", () => {
    expect(isAdNetwork("facebook")).toBe(true);
    expect(isAdNetwork("myspace")).toBe(false);
  });
});
