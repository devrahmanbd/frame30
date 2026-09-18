/**
 * Server-only risk tier persistence and abuse signal tracking.
 * Uses Supabase RPC for all DB access.
 */
import type { RiskTier } from "./risk-tier";
import { RISK_TIERS } from "./risk-tier";

async function getDb() {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    rpc: (
      fn: string,
      params?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

/**
 * Get the stored risk tier for a merchant.
 * Returns 'low' if merchant not found (safe default).
 */
export async function getMerchantRiskTier(
  merchantId: string,
): Promise<RiskTier> {
  const supabaseAdmin = await getDb();
  const { data, error } = await supabaseAdmin.rpc("get_merchant_risk_tier", {
    p_merchant_id: merchantId,
  });
  if (error) {
    console.error("[risk-tier] getMerchantRiskTier failed:", error.message);
    return "low";
  }
  return (data as RiskTier) ?? "low";
}

/**
 * Set the risk tier for a merchant (admin action).
 * Records an audit log entry.
 */
export async function setMerchantRiskTier(
  merchantId: string,
  tier: RiskTier,
  reason: string,
  actor: string = "admin",
): Promise<void> {
  if (!RISK_TIERS.includes(tier)) {
    throw new Error(`invalid risk tier: ${tier}`);
  }
  const supabaseAdmin = await getDb();
  const { error } = await supabaseAdmin.rpc("set_merchant_risk_tier", {
    p_merchant_id: merchantId,
    p_tier: tier,
    p_reason: reason,
    p_actor: actor,
  });
  if (error) {
    console.error("[risk-tier] setMerchantRiskTier failed:", error.message);
    throw new Error(`failed to set risk tier: ${error.message}`);
  }
}

/**
 * Record an abuse signal for a merchant.
 * May auto-escalate the tier if thresholds are crossed.
 */
export async function recordAbuseSignal(
  merchantId: string,
  signalType: string,
  signalData: Record<string, unknown> = {},
): Promise<void> {
  const supabaseAdmin = await getDb();
  const { error } = await supabaseAdmin.rpc("record_abuse_signal", {
    p_merchant_id: merchantId,
    p_signal_type: signalType,
    p_signal_data: signalData,
  });
  if (error) {
    console.error("[risk-tier] recordAbuseSignal failed:", error.message);
  }
}

/**
 * Aggregated risk context for a merchant — fetched once per request
 * and fed into resolveTierFromSignals() for tier assignment.
 */
export type MerchantRiskContext = {
  storedTier: RiskTier;
  themeSource?: "marketplace" | "custom";
  pluginSources?: ("marketplace" | "custom")[];
  abuseScore: number;
};

/**
 * Get the full risk context for a merchant.
 * Aggregates stored tier, theme/plugin provenance, and abuse signals
 * into a single object consumed by resolveTierFromSignals().
 *
 * Returns safe defaults on any failure (fail-open to low tier).
 */
export async function getMerchantRiskContext(
  merchantId: string,
): Promise<MerchantRiskContext> {
  const supabaseAdmin = await getDb();

  // Fetch stored tier — reuse existing RPC
  const { data: tierData, error: tierError } = await supabaseAdmin.rpc(
    "get_merchant_risk_tier",
    { p_merchant_id: merchantId },
  );

  if (tierError) {
    console.error(
      "[risk-tier] getMerchantRiskContext tier fetch failed:",
      tierError.message,
    );
    return { storedTier: "low", abuseScore: 0 };
  }

  const storedTier = (tierData as RiskTier) ?? "low";

  // Fetch abuse score from merchant record
  // The abuse_score column is maintained by recordAbuseSignal RPC
  const { data: merchantData, error: merchantError } = await supabaseAdmin.rpc(
    "get_merchant_risk_signals",
    {
      p_merchant_id: merchantId,
    },
  );

  if (merchantError) {
    // Non-fatal: proceed with stored tier and zero abuse score
    console.error(
      "[risk-tier] getMerchantRiskContext signals fetch failed:",
      merchantError.message,
    );
    return { storedTier, abuseScore: 0 };
  }

  const signals = merchantData as {
    abuse_score?: number;
    theme_source?: "marketplace" | "custom";
    plugin_sources?: ("marketplace" | "custom")[];
  } | null;

  return {
    storedTier,
    abuseScore: signals?.abuse_score ?? 0,
    themeSource: signals?.theme_source,
    pluginSources: signals?.plugin_sources,
  };
}
