/**
 * USD pilot gate — service layer.
 *
 * The gate is evaluated live on every read: a store that drifts out of
 * compliance (plan downgrade, stale FX feed, KYC re-opened) loses USD without
 * anyone having to remember to switch it off. The stored `mode` is the intent;
 * `evaluateCurrencyGate` is the authority.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { incr, log } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import {
  DRIFT_ALERT_BPS,
  auditSnapshots,
  currencyModeCanTransition,
  evaluateCurrencyGate,
  fxAgeSeconds,
  type CurrencyMode,
  type GateVerdict,
} from "./currency-gate";

type Client = SupabaseClient<Database>;

export class CurrencyGateError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "CurrencyGateError";
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertMerchantAdmin(db: Client, merchantId: string) {
  const { data, error } = await db.rpc("is_merchant_admin", { _merchant_id: merchantId });
  if (error || data !== true) throw new CurrencyGateError("currency.forbidden", 403);
}

async function loadSettings(merchantId: string) {
  const service = await admin();
  const { data } = await service
    .from("store_currency_settings")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await service
    .from("store_currency_settings")
    .insert({ merchant_id: merchantId })
    .select("*")
    .single();
  if (error || !created) throw new CurrencyGateError("currency.init_failed", 500);
  return created;
}

export type CurrencyState = {
  mode: CurrencyMode;
  effectiveMode: CurrencyMode;
  presentationCode: string;
  settlementCode: string;
  consentAt: string | null;
  verdict: GateVerdict;
  fx: { rate: number | null; ageSeconds: number | null; source: string | null; driftAlert: boolean };
  lastGateAt: string | null;
};

/** Evaluates the gate now; returns both the stored intent and the enforced mode. */
export async function currencyState(db: Client, merchantId: string, userId: string): Promise<CurrencyState> {
  await enforceRateLimit("currency.read", `${merchantId}:${userId}`);
  const service = await admin();
  const settings = await loadSettings(merchantId);
  const now = new Date();

  const [sub, kyc, fx] = await Promise.all([
    service.from("subscriptions").select("plan, status").eq("merchant_id", merchantId).maybeSingle(),
    service.from("merchant_kyc").select("state").eq("merchant_id", merchantId).maybeSingle(),
    service
      .from("fx_rates")
      .select("rate_ppm, effective_at, source")
      .eq("base_currency", "USD")
      .eq("quote_currency", "BDT")
      .order("effective_at", { ascending: false })
      .limit(30),
  ]);

  const rates = (fx.data ?? []) as { rate_ppm: number; effective_at: string; source: string }[];
  const newest = rates[0] ?? null;
  const subscription = sub.data as { plan: string; status: string } | null;
  const verdict = evaluateCurrencyGate({
    planTier: subscription?.plan ?? null,
    subscriptionStatus: subscription?.status ?? null,
    entitled: subscription?.plan === "business" || subscription?.plan === "enterprise",
    consentAt: settings.consent_at,
    fxSnapshotAt: newest?.effective_at ?? null,
    kycState: (kyc.data as { state: string } | null)?.state ?? null,
    now,
  });

  const audit = auditSnapshots(
    rates.map((r, idx) => ({
      snapshotId: `${r.effective_at}:${idx}`,
      base: "USD",
      quote: "BDT",
      ratePpm: r.rate_ppm,
      source: r.source,
      effectiveAt: r.effective_at,
    })),
  );
  const maxDriftBps = audit.reduce((max, row) => Math.max(max, Math.abs(row.driftBps)), 0);
  const storedMode = settings.mode as CurrencyMode;
  const effectiveMode: CurrencyMode = verdict.allowed ? storedMode : storedMode === "usd_enabled" ? "bdt_locked" : storedMode;

  if (storedMode === "usd_enabled" && !verdict.allowed) {
    // Fail closed and record why — a silent downgrade would be unauditable.
    await service
      .from("store_currency_settings")
      .update({
        mode: "bdt_locked",
        last_gate_at: now.toISOString(),
        last_gate_result: verdict as unknown as Json,
        updated_at: now.toISOString(),
      })
      .eq("merchant_id", merchantId);
    incr("framique_currency_gate_total", { outcome: "auto_locked" });
    log("warn", "currency.auto_locked", { merchantId, denied: verdict.deniedFor });
  }

  return {
    mode: storedMode,
    effectiveMode,
    presentationCode: settings.presentation_code,
    settlementCode: settings.settlement_code,
    consentAt: settings.consent_at,
    verdict,
    fx: {
      rate: newest ? newest.rate_ppm / 1_000_000 : null,
      ageSeconds: fxAgeSeconds(newest?.effective_at ?? null, now),
      source: newest?.source ?? null,
      driftAlert: maxDriftBps >= DRIFT_ALERT_BPS,
    },
    lastGateAt: settings.last_gate_at,
  };
}

export async function recordConsent(db: Client, merchantId: string, userId: string) {
  await assertMerchantAdmin(db, merchantId);
  await enforceRateLimit("currency.write", `${merchantId}:${userId}`);
  const service = await admin();
  await loadSettings(merchantId);
  await service
    .from("store_currency_settings")
    .update({ consent_at: new Date().toISOString(), consent_by: userId, updated_at: new Date().toISOString() })
    .eq("merchant_id", merchantId);
  incr("framique_currency_gate_total", { outcome: "consent" });
  return currencyState(db, merchantId, userId);
}

export async function setCurrencyMode(
  db: Client,
  merchantId: string,
  userId: string,
  mode: CurrencyMode,
) {
  await assertMerchantAdmin(db, merchantId);
  await enforceRateLimit("currency.write", `${merchantId}:${userId}`);
  const state = await currencyState(db, merchantId, userId);
  if (!currencyModeCanTransition(state.mode, mode)) {
    throw new CurrencyGateError(`currency.illegal_transition:${state.mode}->${mode}`, 409);
  }
  if (mode !== "bdt_locked" && !state.verdict.allowed) {
    incr("framique_currency_gate_total", { outcome: "denied" });
    throw new CurrencyGateError("currency.gate_denied", 409);
  }
  const service = await admin();
  const now = new Date().toISOString();
  await service
    .from("store_currency_settings")
    .update({
      mode,
      presentation_code: mode === "usd_enabled" ? "USD" : "BDT",
      last_gate_at: now,
      last_gate_result: state.verdict as unknown as Json,
      updated_at: now,
    })
    .eq("merchant_id", merchantId);
  incr("framique_currency_gate_total", { outcome: `mode_${mode}` });
  log("info", "currency.mode_changed", { merchantId, mode });
  return currencyState(db, merchantId, userId);
}
