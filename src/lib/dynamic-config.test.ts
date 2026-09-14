/**
 * Automated Verification for Dynamic Red/Blue Algorithmic Configuration System
 * & Per-Merchant Dynamic Multi-Tenant Credentials Vault.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getDynamicPlatformConfig,
  stageAndPromoteConfig,
  invalidateDynamicConfigCache,
} from "./dynamic-config.server";
import { loadMerchantAnalyticsConfig } from "./analytics-warehouse.server";
import { saveCarrierCredentials, loadCarrierCredentials } from "./courier.server";
import { adapterFor } from "./courier-adapters.server";

// Mock Supabase admin client for unit testing dynamic config routines
vi.mock("@/integrations/supabase/client.server", () => {
  const store: Record<string, {
    active_slot: string;
    blue_payload: Record<string, unknown>;
    red_payload: Record<string, unknown>;
    version: number;
  }> = {
    error_tracking: {
      active_slot: "blue",
      blue_payload: { dsn: "https://blue@sentry.internal/1", sample_rate: 0.1 },
      red_payload: { dsn: "https://red@sentry.internal/1", sample_rate: 0.2 },
      version: 1,
    },
  };

  const mockAdmin = {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === "platform_dynamic_config" && store[val]) {
              return { data: store[val], error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: "test-carrier", ...patch }, error: null }),
            }),
          }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "platform_get_active_config") {
        const id = String(args["_config_id"]);
        const row = store[id];
        if (!row) return { data: null, error: null };
        return {
          data: {
            config_id: id,
            active_slot: row.active_slot,
            version: row.version,
            payload: row.active_slot === "blue" ? row.blue_payload : row.red_payload,
          },
          error: null,
        };
      }
      if (fn === "platform_stage_config_slot") {
        const id = String(args["_config_id"]);
        const targetSlot = String(args["_target_slot"]);
        const payload = (args["_payload"] ?? {}) as Record<string, unknown>;
        if (!store[id]) {
          store[id] = { active_slot: "blue", blue_payload: {}, red_payload: {}, version: 1 };
        }
        if (targetSlot === "blue") store[id].blue_payload = payload;
        else store[id].red_payload = payload;
        return { data: { ok: true }, error: null };
      }
      if (fn === "platform_promote_config_slot") {
        const id = String(args["_config_id"]);
        const targetSlot = String(args["_target_slot"]);
        const row = store[id];
        if (!row) return { data: null, error: new Error("not_found") };
        row.active_slot = targetSlot;
        row.version += 1;
        return {
          data: { ok: true, config_id: id, active_slot: targetSlot, version: row.version },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  return { supabaseAdmin: mockAdmin };
});

describe("Dynamic Platform Red/Blue Configuration System", () => {
  beforeEach(async () => {
    await invalidateDynamicConfigCache();
  });

  it("retrieves the active slot payload (blue by default)", async () => {
    const config = await getDynamicPlatformConfig<{ dsn: string; sample_rate: number }>("error_tracking");
    expect(config.dsn).toBe("https://blue@sentry.internal/1");
    expect(config.sample_rate).toBe(0.1);
  });

  it("aborts promotion and preserves active slot if health probe fails", async () => {
    const probeFailed = vi.fn().mockResolvedValue(false);

    const result = await stageAndPromoteConfig(
      "error_tracking",
      { dsn: "https://bad@sentry.internal/1", sample_rate: 0.5 },
      probeFailed,
      "test_failure_probe",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Health probe failed for candidate slot 'red'");

    // Active slot should still be 'blue'
    const active = await getDynamicPlatformConfig<{ dsn: string }>("error_tracking");
    expect(active.dsn).toBe("https://blue@sentry.internal/1");
  });

  it("algorithmically promotes standby candidate to active slot when probe succeeds", async () => {
    const probeSucceeded = vi.fn().mockResolvedValue(true);

    const result = await stageAndPromoteConfig(
      "error_tracking",
      { dsn: "https://red-new@sentry.internal/1", sample_rate: 0.8 },
      probeSucceeded,
      "test_success_probe",
    );

    expect(result.ok).toBe(true);
    expect(result.activeSlot).toBe("red");
    expect(result.version).toBe(2);

    // Active config should now reflect 'red'
    const active = await getDynamicPlatformConfig<{ dsn: string; sample_rate: number }>("error_tracking");
    expect(active.dsn).toBe("https://red-new@sentry.internal/1");
    expect(active.sample_rate).toBe(0.8);
  });
});

describe("Per-Merchant Dynamic Analytics (Meta CAPI & Google)", () => {
  it("isolates Merchant A and Merchant B analytics credentials from merchant_settings", async () => {
    const mockDb = {
      from: () => ({
        select: () => ({
          eq: (col: string, val: string) => ({
            maybeSingle: async () => {
              if (val === "merchant_alpha") {
                return {
                  data: {
                    seo_settings: {
                      facebook_pixel_id: "PIXEL_ALPHA_123",
                      facebook_capi_token: "TOKEN_ALPHA_XYZ",
                    },
                  },
                };
              }
              if (val === "merchant_beta") {
                return {
                  data: {
                    seo_settings: {
                      facebook_pixel_id: "PIXEL_BETA_456",
                      facebook_capi_token: "TOKEN_BETA_ABC",
                    },
                  },
                };
              }
              return { data: null };
            },
          }),
        }),
      }),
    };

    const configAlpha = await loadMerchantAnalyticsConfig(mockDb as never, "merchant_alpha");
    const configBeta = await loadMerchantAnalyticsConfig(mockDb as never, "merchant_beta");

    expect(configAlpha.fbPixel).toBe("PIXEL_ALPHA_123");
    expect(configAlpha.fbToken).toBe("TOKEN_ALPHA_XYZ");

    expect(configBeta.fbPixel).toBe("PIXEL_BETA_456");
    expect(configBeta.fbToken).toBe("TOKEN_BETA_ABC");

    expect(configAlpha.fbPixel).not.toBe(configBeta.fbPixel);
  });
});

describe("Per-Merchant Dynamic Courier Credentials", () => {
  it("seals carrier credentials at rest and recovers them dynamically", async () => {
    process.env["WEBHOOK_SIGNING_KEY"] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const mockDb = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { id: "c1", ...patch }, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const credentials = {
      apiKey: "EXAMPLE_steadfast_live_secret_key_999",
      secretKey: "EXAMPLE_steadfast_api_secret_888",
    };

    const updated = await saveCarrierCredentials(
      mockDb as never,
      "merchant_1",
      "carrier_steadfast",
      credentials,
    );

    const config = updated.config as { credentialsCiphertext: string; credentialHints: Record<string, string> };
    expect(config.credentialsCiphertext).toMatch(/^v1\./);
    expect(config.credentialsCiphertext).not.toContain("steadfast_live_secret_key_999");
    expect(config.credentialHints["apiKey"]).toBe("…_999");

    // Dynamic recovery
    const recovered = await loadCarrierCredentials(config);
    expect(recovered).toEqual(credentials);

    // Courier adapter creates shipment with merchant-specific seed
    const adapter = adapterFor("steadfast", recovered);
    const shipment = await adapter.createShipment({
      reference: "ORD-123",
      city: "Dhaka",
      weightGrams: 500,
      isCod: true,
      codAmountMinorInt: 15000,
      addressLine: "Gulshan-2",
    });

    expect(shipment.awb).toMatch(/^STE/);
    expect(shipment.trackingUrl).toContain(shipment.awb);
  });
});
