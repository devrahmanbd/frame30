/**
 * Dynamic Tenant Multi-Credential Vault & Dynamic Channels Engine.
 *
 * Provides a unified, encrypted dynamic channel for EVERY merchant / tenant / customer
 * to manage and execute their own isolated API keys and integrations:
 *
 * 1. Payment Channel:
 *    - bKash, Nagad, SSLCommerz, Shurjopay, aamarPay.
 *    - Sealed at rest via AES-GCM under masterKey() in `gateway_accounts`.
 *    - Unsealed on-the-fly per order checkout.
 *
 * 2. Logistics & Courier Channel:
 *    - SteadFast, Pathao, RedX, Paperfly.
 *    - Sealed at rest via AES-GCM in `carriers.config`.
 *    - Unsealed on-the-fly per parcel dispatch.
 *
 * 3. Analytics & Marketing Channel:
 *    - Meta Pixel ID, Meta CAPI Access Token, Google Ads, GTM.
 *    - Stored in `merchant_settings.seo_settings` with CAPI token sealed at rest.
 *    - Unsealed dynamically during conversion dispatch.
 *
 * Guarantees:
 * - ZERO dependence on process.env for tenant/customer business credentials.
 * - Complete cryptographic and tenant boundary isolation between merchants.
 * - Runtime updates take effect immediately without process reboots.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { sealSecret, unsealSecret } from "./webhook-secret.server";
import { incr, log } from "./observability.server";

type Client = SupabaseClient<Database>;

export type TenantPaymentCredentials = {
  appKey?: string;
  appSecret?: string;
  username?: string;
  password?: string;
  merchantId?: string;
  publicKey?: string;
  privateKey?: string;
  storeId?: string;
  storePassword?: string;
  prefix?: string;
  [key: string]: unknown;
};

export type TenantCourierCredentials = {
  apiKey?: string;
  secretKey?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  apiToken?: string;
  key?: string;
  [key: string]: unknown;
};

export type TenantAnalyticsConfig = {
  facebookPixelId?: string;
  facebookCapiToken?: string;
  googleConversionUrl?: string;
  googleTagManagerId?: string;
};

/* -------------------------------------------------------------------------- */
/* 1. PAYMENT DYNAMIC CHANNEL                                                 */
/* -------------------------------------------------------------------------- */

export async function saveTenantPaymentChannel(
  db: Client,
  merchantId: string,
  provider: string,
  credentials: TenantPaymentCredentials,
  mode: "sandbox" | "live" = "live",
  baseUrl?: string | null,
) {
  const sealed = await sealSecret(JSON.stringify(credentials));

  // Generate safe hints for display
  const hints: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials)) {
    if (typeof v === "string" && v.length > 4) {
      hints[k] = `…${v.slice(-4)}`;
    }
  }

  const { data, error } = await db
    .from("gateway_accounts")
    .upsert(
      {
        merchant_id: merchantId,
        provider,
        mode,
        base_url: baseUrl ? baseUrl.replace(/\/+$/, "") : null,
        credentials_ciphertext: sealed,
        credential_hints: hints as unknown as Json,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "merchant_id,provider" },
    )
    .select("*")
    .single();

  if (error) {
    log("error", "tenant_vault.payment_save_failed", { merchantId, provider, error: error.message });
    throw error;
  }

  incr("framique_tenant_vault_update_total", { channel: "payment", provider });
  return data;
}

export async function loadTenantPaymentChannel(
  db: Client,
  merchantId: string,
  provider: string,
): Promise<{
  provider: string;
  mode: "sandbox" | "live";
  baseUrl: string | null;
  credentials: TenantPaymentCredentials;
} | null> {
  const { data } = await db
    .from("gateway_accounts")
    .select("mode, base_url, credentials_ciphertext, active")
    .eq("merchant_id", merchantId)
    .eq("provider", provider)
    .maybeSingle();

  if (!data || !data.active || !data.credentials_ciphertext) return null;

  const plain = await unsealSecret(data.credentials_ciphertext);
  if (!plain) {
    log("warn", "tenant_vault.payment_unseal_failed", { merchantId, provider });
    return null;
  }

  try {
    const creds = JSON.parse(plain) as TenantPaymentCredentials;
    return {
      provider,
      mode: (data.mode ?? "live") as "sandbox" | "live",
      baseUrl: data.base_url,
      credentials: creds,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* 2. COURIER & LOGISTICS DYNAMIC CHANNEL                                     */
/* -------------------------------------------------------------------------- */

export async function saveTenantCourierChannel(
  db: Client,
  merchantId: string,
  carrierCode: string,
  credentials: TenantCourierCredentials,
  baseUrl?: string | null,
) {
  const sealed = await sealSecret(JSON.stringify(credentials));

  const hints: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials)) {
    if (typeof v === "string" && v.length > 4) {
      hints[k] = `…${v.slice(-4)}`;
    }
  }

  const { data, error } = await db
    .from("carriers")
    .update({
      config: {
        credentialsCiphertext: sealed,
        credentialHints: hints,
        baseUrl: baseUrl ?? null,
      },
      api_mode: "live",
      enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq("code", carrierCode)
    .eq("merchant_id", merchantId)
    .select("*")
    .single();

  if (error) {
    log("error", "tenant_vault.courier_save_failed", { merchantId, carrierCode, error: error.message });
    throw error;
  }

  incr("framique_tenant_vault_update_total", { channel: "courier", carrier: carrierCode });
  return data;
}

export async function loadTenantCourierChannel(
  db: Client,
  merchantId: string,
  carrierCode: string,
): Promise<{
  carrierCode: string;
  baseUrl: string | null;
  credentials: TenantCourierCredentials;
} | null> {
  const { data } = await db
    .from("carriers")
    .select("config, enabled")
    .eq("merchant_id", merchantId)
    .eq("code", carrierCode)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data || data.enabled === false || !data.config || typeof data.config !== "object") {
    return null;
  }

  const config = data.config as Record<string, unknown>;
  const sealed = config["credentialsCiphertext"];
  if (typeof sealed !== "string" || !sealed) return null;

  const plain = await unsealSecret(sealed);
  if (!plain) return null;

  try {
    const creds = JSON.parse(plain) as TenantCourierCredentials;
    return {
      carrierCode,
      baseUrl: (config["baseUrl"] as string) ?? null,
      credentials: creds,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* 3. ANALYTICS & PIXELS DYNAMIC CHANNEL                                      */
/* -------------------------------------------------------------------------- */

export async function saveTenantAnalyticsChannel(
  db: Client,
  merchantId: string,
  config: TenantAnalyticsConfig,
) {
  let sealedCapiToken: string | null = null;
  if (config.facebookCapiToken) {
    sealedCapiToken = await sealSecret(config.facebookCapiToken);
  }

  const { data: current } = await db
    .from("merchant_settings")
    .select("seo_settings")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  const existing = (current?.seo_settings && typeof current.seo_settings === "object"
    ? current.seo_settings
    : {}) as Record<string, unknown>;

  const merged = {
    ...existing,
    facebook_pixel_id: config.facebookPixelId ?? existing["facebook_pixel_id"] ?? null,
    facebook_capi_token: sealedCapiToken ?? existing["facebook_capi_token"] ?? null,
    google_conversion_url: config.googleConversionUrl ?? existing["google_conversion_url"] ?? null,
    google_gtm_id: config.googleTagManagerId ?? existing["google_gtm_id"] ?? null,
  };

  const { data, error } = await db
    .from("merchant_settings")
    .update({
      seo_settings: merged as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId)
    .select("seo_settings")
    .single();

  if (error) {
    log("error", "tenant_vault.analytics_save_failed", { merchantId, error: error.message });
    throw error;
  }

  incr("framique_tenant_vault_update_total", { channel: "analytics" });
  return data;
}

export async function loadTenantAnalyticsChannel(
  db: Client,
  merchantId: string,
): Promise<TenantAnalyticsConfig> {
  const { data } = await db
    .from("merchant_settings")
    .select("seo_settings")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (!data?.seo_settings || typeof data.seo_settings !== "object") {
    return {};
  }

  const seo = data.seo_settings as Record<string, unknown>;
  let unsealedCapi: string | undefined;

  const rawCapi = typeof seo["facebook_capi_token"] === "string" ? seo["facebook_capi_token"].trim() : "";
  if (rawCapi) {
    if (rawCapi.startsWith("v1.")) {
      unsealedCapi = (await unsealSecret(rawCapi)) ?? undefined;
    } else {
      unsealedCapi = rawCapi;
    }
  }

  return {
    facebookPixelId: typeof seo["facebook_pixel_id"] === "string" ? seo["facebook_pixel_id"].trim() : undefined,
    facebookCapiToken: unsealedCapi,
    googleConversionUrl: typeof seo["google_conversion_url"] === "string" ? seo["google_conversion_url"].trim() : undefined,
    googleTagManagerId: typeof seo["google_gtm_id"] === "string" ? seo["google_gtm_id"].trim() : undefined,
  };
}
