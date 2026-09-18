import { describe, it, expect } from "vitest";
import { z } from "zod";
import { RISK_TIERS } from "@/lib/risk-tier";

const GetSchema = z.object({ merchantId: z.string().uuid() });
const SetSchema = z.object({
  merchantId: z.string().uuid(),
  tier: z.enum(RISK_TIERS),
  reason: z.string().min(1).max(500),
});

describe("admin risk-tier API schema validation", () => {
  it("GetSchema rejects invalid uuid", () => {
    expect(() => GetSchema.parse({ merchantId: "not-a-uuid" })).toThrow();
  });

  it("GetSchema accepts valid uuid", () => {
    expect(
      GetSchema.parse({ merchantId: "00000000-0000-0000-0000-000000000001" }),
    ).toEqual({ merchantId: "00000000-0000-0000-0000-000000000001" });
  });

  it("SetSchema rejects invalid tier", () => {
    expect(() =>
      SetSchema.parse({
        merchantId: "00000000-0000-0000-0000-000000000001",
        tier: "bogus",
        reason: "test",
      }),
    ).toThrow();
  });

  it("SetSchema rejects empty reason", () => {
    expect(() =>
      SetSchema.parse({
        merchantId: "00000000-0000-0000-0000-000000000001",
        tier: "low",
        reason: "",
      }),
    ).toThrow();
  });

  it("SetSchema rejects reason over 500 chars", () => {
    expect(() =>
      SetSchema.parse({
        merchantId: "00000000-0000-0000-0000-000000000001",
        tier: "low",
        reason: "x".repeat(501),
      }),
    ).toThrow();
  });

  it("SetSchema accepts valid input", () => {
    expect(
      SetSchema.parse({
        merchantId: "00000000-0000-0000-0000-000000000001",
        tier: "high",
        reason: "Fraud detected",
      }),
    ).toEqual({
      merchantId: "00000000-0000-0000-0000-000000000001",
      tier: "high",
      reason: "Fraud detected",
    });
  });

  it("SetSchema accepts all four valid tiers", () => {
    for (const tier of RISK_TIERS) {
      expect(
        SetSchema.parse({
          merchantId: "00000000-0000-0000-0000-000000000001",
          tier,
          reason: "test",
        }),
      ).toMatchObject({ tier });
    }
  });

  it("SetSchema rejects tier not in RISK_TIERS", () => {
    expect(() =>
      SetSchema.parse({
        merchantId: "00000000-0000-0000-0000-000000000001",
        tier: "critical",
        reason: "test",
      }),
    ).toThrow();
  });
});
