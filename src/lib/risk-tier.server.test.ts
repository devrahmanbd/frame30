import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { getMerchantRiskTier, setMerchantRiskTier } from "./risk-tier.server";

// Hermetic Supabase double: the RPCs below do not exist in this environment
// (no SUPABASE_URL / keys), so back them with an in-memory tier map via the
// repo's fakeDb harness instead of inventing production credentials.
const tiers = new Map<string, string>();

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: fakeDb({
    rpc: (fn: string, args: Record<string, unknown>) => {
      const merchantId = args["p_merchant_id"] as string;
      if (fn === "get_merchant_risk_tier") {
        return {
          data: (tiers.get(merchantId) ?? "low") as unknown,
          error: null,
        };
      }
      if (fn === "set_merchant_risk_tier") {
        tiers.set(merchantId, args["p_tier"] as string);
        return { data: null, error: null };
      }
      if (fn === "get_merchant_risk_signals") {
        return { data: null, error: null };
      }
      if (fn === "record_abuse_signal") {
        return { data: null, error: null };
      }
      return {
        data: null,
        error: { message: `rpc_not_stubbed:${fn}` },
      };
    },
  }),
}));

describe("risk-tier.server", () => {
  beforeEach(() => {
    tiers.clear();
  });

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
