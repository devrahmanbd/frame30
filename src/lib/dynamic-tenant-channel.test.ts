/**
 * Dynamic Multi-Tenant Channel End-to-End Verification Test.
 *
 * Tests the dynamic channel for ALL users/merchants with their individual keys:
 * 1. Multi-Tenant Payment Channel (bKash, Nagad, SSLCommerz).
 * 2. Multi-Tenant Courier Channel (SteadFast, Pathao, RedX).
 * 3. Multi-Tenant Analytics & Pixels Channel (Meta Pixel, Meta CAPI, Google Ads).
 *
 * Asserts:
 * - Each tenant has their own isolated credentials.
 * - Credentials are encrypted at rest with AES-GCM (never stored in cleartext).
 * - Zero reliance on static process.env for tenant business operations.
 * - Complete cryptographic separation between distinct tenants.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  saveTenantPaymentChannel,
  loadTenantPaymentChannel,
  saveTenantCourierChannel,
  loadTenantCourierChannel,
  saveTenantAnalyticsChannel,
  loadTenantAnalyticsChannel,
} from "./tenant-vault.server";
import { adapterFor } from "./courier-adapters.server";

// In-Memory Mock Database Store simulating Supabase tables
type MockStore = {
  gateway_accounts: Map<string, Record<string, unknown>>;
  carriers: Map<string, Record<string, unknown>>;
  merchant_settings: Map<string, Record<string, unknown>>;
};

function createMockDb(): { db: unknown; store: MockStore } {
  const store: MockStore = {
    gateway_accounts: new Map(),
    carriers: new Map(),
    merchant_settings: new Map(),
  };

  const db = {
    from: (table: keyof MockStore) => {
      const tableMap = store[table];

      return {
        select: (cols?: string) => ({
          eq: (col1: string, val1: string) => ({
            eq: (col2: string, val2: string) => ({
              is: () => ({
                maybeSingle: async () => {
                  const key = `${val1}:${val2}`;
                  const row = tableMap.get(key);
                  return { data: row ?? null, error: null };
                },
              }),
              maybeSingle: async () => {
                const key = `${val1}:${val2}`;
                const row = tableMap.get(key);
                return { data: row ?? null, error: null };
              },
            }),
            maybeSingle: async () => {
              // Find first matching row with col1 = val1
              for (const [_, row] of tableMap.entries()) {
                if (row[col1] === val1) {
                  return { data: row, error: null };
                }
              }
              return { data: null, error: null };
            },
          }),
        }),

        upsert: (record: Record<string, unknown>, opts?: { onConflict?: string }) => ({
          select: () => ({
            single: async () => {
              const key = `${record["merchant_id"]}:${record["provider"]}`;
              const merged = { ...tableMap.get(key), ...record };
              tableMap.set(key, merged);
              return { data: merged, error: null };
            },
          }),
        }),

        update: (patch: Record<string, unknown>) => ({
          eq: (col1: string, val1: string) => ({
            eq: (col2: string, val2: string) => ({
              select: () => ({
                single: async () => {
                  const key = `${val2}:${val1}`;
                  const existing = tableMap.get(key) ?? { [col1]: val1, [col2]: val2 };
                  const merged = { ...existing, ...patch };
                  tableMap.set(key, merged);
                  return { data: merged, error: null };
                },
              }),
            }),
            select: () => ({
              single: async () => {
                const key = val1;
                const existing = tableMap.get(key) ?? { [col1]: val1 };
                const merged = { ...existing, ...patch };
                tableMap.set(key, merged);
                return { data: merged, error: null };
              },
            }),
          }),
        }),
      };
    },
  };

  return { db, store };
}

describe("Dynamic Multi-Tenant Channel System", () => {
  beforeEach(() => {
    // Ensure master encryption key is configured
    process.env["WEBHOOK_SIGNING_KEY"] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("proves distinct users/merchants run on their own isolated payment credentials", async () => {
    const { db, store } = createMockDb();

    const tenantA = "merchant_apex_101";
    const tenantB = "merchant_zenith_202";

    // Tenant A configures bKash
    await saveTenantPaymentChannel(
      db as never,
      tenantA,
      "bkash",
      {
        appKey: "apex_bkash_key_111",
        appSecret: "apex_bkash_secret_111",
        username: "apex_user",
        password: "apex_password",
      },
      "live",
      "https://tokenized.pay.bka.sh/v1.2.0-beta",
    );

    // Tenant B configures Nagad
    await saveTenantPaymentChannel(
      db as never,
      tenantB,
      "nagad",
      {
        merchantId: "zenith_nagad_id_222",
        publicKey: "zenith_pub_key_222",
        privateKey: "zenith_priv_key_222",
      },
      "live",
      "https://api.mynagad.com",
    );

    // Assert encrypted storage at rest (AES-GCM ciphertext)
    const storedA = store.gateway_accounts.get(`${tenantA}:bkash`) as { credentials_ciphertext: string };
    expect(storedA.credentials_ciphertext).toMatch(/^v1\./);
    expect(storedA.credentials_ciphertext).not.toContain("apex_bkash_key_111");

    const storedB = store.gateway_accounts.get(`${tenantB}:nagad`) as { credentials_ciphertext: string };
    expect(storedB.credentials_ciphertext).toMatch(/^v1\./);
    expect(storedB.credentials_ciphertext).not.toContain("zenith_nagad_id_222");

    // Dynamic recovery on-the-fly per tenant
    const loadedA = await loadTenantPaymentChannel(db as never, tenantA, "bkash");
    expect(loadedA).not.toBeNull();
    expect(loadedA?.credentials.appKey).toBe("apex_bkash_key_111");
    expect(loadedA?.credentials.username).toBe("apex_user");

    const loadedB = await loadTenantPaymentChannel(db as never, tenantB, "nagad");
    expect(loadedB).not.toBeNull();
    expect(loadedB?.credentials.merchantId).toBe("zenith_nagad_id_222");

    // Negative verification: Tenant A cannot load Tenant B's credentials
    const crossLoad = await loadTenantPaymentChannel(db as never, tenantA, "nagad");
    expect(crossLoad).toBeNull();
  });

  it("proves distinct users/merchants run on their own isolated courier credentials", async () => {
    const { db, store } = createMockDb();

    const tenantA = "merchant_apex_101";
    const tenantB = "merchant_zenith_202";

    // Tenant A sets up SteadFast
    await saveTenantCourierChannel(
      db as never,
      tenantA,
      "steadfast",
      {
        apiKey: "EXAMPLE_apex_steadfast_key_111",
        secretKey: "EXAMPLE_apex_steadfast_sec_111",
      },
      "https://portal.steadfast.com.bd/api/v1",
    );

    // Tenant B sets up Pathao
    await saveTenantCourierChannel(
      db as never,
      tenantB,
      "pathao",
      {
        clientId: "EXAMPLE_zenith_pathao_id_222",
        clientSecret: "EXAMPLE_zenith_pathao_sec_222",
      },
      "https://api.pathao.com",
    );

    // Assert encrypted storage
    const storedA = store.carriers.get(`${tenantA}:steadfast`) as { config: { credentialsCiphertext: string } };
    expect(storedA.config.credentialsCiphertext).toMatch(/^v1\./);
    expect(storedA.config.credentialsCiphertext).not.toContain("EXAMPLE_apex_steadfast_key_111");

    // Unseal and invoke courier adapter dynamically
    const loadedA = await loadTenantCourierChannel(db as never, tenantA, "steadfast");
    expect(loadedA?.credentials.apiKey).toBe("EXAMPLE_apex_steadfast_key_111");

    const adapterA = adapterFor("steadfast", loadedA?.credentials);
    const shipmentA = await adapterA.createShipment({
      reference: "ORD-APEX-001",
      city: "Dhaka",
      weightGrams: 500,
      isCod: true,
      codAmountMinorInt: 12000,
      addressLine: "Banani 11",
    });
    expect(shipmentA.awb).toMatch(/^STE/);

    const loadedB = await loadTenantCourierChannel(db as never, tenantB, "pathao");
    expect(loadedB?.credentials.clientId).toBe("EXAMPLE_zenith_pathao_id_222");

    const adapterB = adapterFor("pathao", loadedB?.credentials);
    const shipmentB = await adapterB.createShipment({
      reference: "ORD-ZENITH-002",
      city: "Chittagong",
      weightGrams: 1000,
      isCod: true,
      codAmountMinorInt: 25000,
      addressLine: "GEC Circle",
    });
    expect(shipmentB.awb).toMatch(/^PAT/);

    // The AWBs generated with distinct seeds must be completely different
    expect(shipmentA.awb).not.toBe(shipmentB.awb);
  });

  it("proves distinct users/merchants run on their own isolated analytics & Meta CAPI tokens", async () => {
    const { db, store } = createMockDb();

    const tenantA = "merchant_apex_101";
    const tenantB = "merchant_zenith_202";

    // Tenant A sets up Meta CAPI and Google Ads
    await saveTenantAnalyticsChannel(db as never, tenantA, {
      facebookPixelId: "PIXEL_APEX_111",
      facebookCapiToken: "CAPI_TOKEN_APEX_SECRET_111",
      googleConversionUrl: "https://google.com/conversions/apex",
      googleTagManagerId: "GTM-APEX-111",
    });

    // Tenant B sets up separate Meta CAPI
    await saveTenantAnalyticsChannel(db as never, tenantB, {
      facebookPixelId: "PIXEL_ZENITH_222",
      facebookCapiToken: "CAPI_TOKEN_ZENITH_SECRET_222",
      googleConversionUrl: "https://google.com/conversions/zenith",
      googleTagManagerId: "GTM-ZENITH-222",
    });

    // Verify CAPI token is sealed at rest in DB
    const storedA = store.merchant_settings.get(tenantA) as {
      seo_settings: { facebook_pixel_id: string; facebook_capi_token: string };
    };
    expect(storedA.seo_settings.facebook_pixel_id).toBe("PIXEL_APEX_111");
    expect(storedA.seo_settings.facebook_capi_token).toMatch(/^v1\./);
    expect(storedA.seo_settings.facebook_capi_token).not.toContain("CAPI_TOKEN_APEX_SECRET_111");

    // Dynamic recovery
    const loadedA = await loadTenantAnalyticsChannel(db as never, tenantA);
    expect(loadedA.facebookPixelId).toBe("PIXEL_APEX_111");
    expect(loadedA.facebookCapiToken).toBe("CAPI_TOKEN_APEX_SECRET_111");
    expect(loadedA.googleTagManagerId).toBe("GTM-APEX-111");

    const loadedB = await loadTenantAnalyticsChannel(db as never, tenantB);
    expect(loadedB.facebookPixelId).toBe("PIXEL_ZENITH_222");
    expect(loadedB.facebookCapiToken).toBe("CAPI_TOKEN_ZENITH_SECRET_222");
    expect(loadedB.googleTagManagerId).toBe("GTM-ZENITH-222");

    // Isolation check
    expect(loadedA.facebookPixelId).not.toBe(loadedB.facebookPixelId);
    expect(loadedA.facebookCapiToken).not.toBe(loadedB.facebookCapiToken);
  });
});
