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
