import { describe, it, expect } from "vitest";
import { getMerchantRiskTier, setMerchantRiskTier } from "./risk-tier.server";

describe("risk-tier.server", () => {
  it("getMerchantRiskTier returns low by default for new merchants", async () => {
    const tier = await getMerchantRiskTier(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(tier).toBe("low");
  });

  it("setMerchantRiskTier persists the tier", async () => {
    await setMerchantRiskTier(
      "00000000-0000-0000-0000-000000000001",
      "high",
      "admin_override",
      "Testing lockdown",
    );
    const tier = await getMerchantRiskTier(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(tier).toBe("high");
  });

  it("setMerchantRiskTier rejects invalid tier", async () => {
    await expect(
      setMerchantRiskTier(
        "00000000-0000-0000-0000-000000000001",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid tier rejection
        "invalid" as any,
        "admin_override",
        "test",
      ),
    ).rejects.toThrow("invalid risk tier");
  });
});
