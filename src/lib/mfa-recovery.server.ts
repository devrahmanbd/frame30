/**
 * Recovery-code lifecycle. Regeneration requires a live second factor (aal2) so
 * a hijacked aal1 session cannot mint itself a permanent bypass; consumption is
 * burned inside the database (single statement) so a replay finds nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateRecoveryCodes, hashRecoveryCode, isWellFormedRecoveryCode } from "./mfa-recovery";
import { recordAuthEvent, StepUpRequiredError } from "./identity.server";
import { incr, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;
type LooseDb = {
  from: (t: string) => { select: (c: string) => any };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

function salt() {
  return process.env["AUTH_HASH_SALT"] ?? "framique-identity";
}

/** Regenerates the full set. Returns plaintext codes exactly once. */
export async function regenerateRecoveryCodes(
  supabase: Client,
  userId: string,
  claims: Record<string, unknown>,
) {
  return withSpan("identity.recoveryCodes.regenerate", async () => {
    if (String(claims["aal"] ?? "aal1") !== "aal2") {
      await recordAuthEvent({ event: "mfa.recovery.denied", outcome: "denied", userId });
      throw new StepUpRequiredError("mfa.recovery");
    }
    await enforceRateLimit("auth.recovery", userId);
    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(codes.map((c) => hashRecoveryCode(userId, c, salt())));
    const { error } = await (supabase as unknown as LooseDb).rpc("mfa_recovery_replace", {
      _hashes: hashes,
    });
    if (error) throw new Error("mfa.recovery.persist_failed");
    incr("framique_mfa_recovery_total", { outcome: "generated" });
    await recordAuthEvent({
      event: "mfa.recovery.generated",
      outcome: "ok",
      userId,
      detail: { count: codes.length },
    });
    return { codes, generatedAt: new Date().toISOString() };
  });
}

export async function recoveryCodeStatus(supabase: Client, userId: string) {
  const { data } = await (supabase as unknown as LooseDb)
    .from("mfa_recovery_codes")
    .select("id, used_at, created_at")
    .eq("user_id", userId);
  const rows = (data ?? []) as { used_at: string | null; created_at: string }[];
  return {
    total: rows.length,
    remaining: rows.filter((r) => r.used_at === null).length,
    generatedAt: rows[0]?.created_at ?? null,
  };
}

/**
 * Verifies a typed code. Rate limited per user so the 12-character space cannot
 * be walked, and the verdict never says whether the account has codes at all.
 */
export async function consumeRecoveryCode(userId: string, code: string) {
  return withSpan("identity.recoveryCodes.consume", async () => {
    const verdict = await enforceRateLimit("auth.recovery", userId).catch((e) => {
      throw e;
    });
    void verdict;
    if (!isWellFormedRecoveryCode(code)) {
      incr("framique_mfa_recovery_total", { outcome: "rejected" });
      await recordAuthEvent({ event: "mfa.recovery.used", outcome: "denied", userId });
      return { ok: false as const };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await hashRecoveryCode(userId, code, salt());
    const { data, error } = await (supabaseAdmin as unknown as LooseDb).rpc("mfa_recovery_consume", {
      _user_id: userId,
      _hash: hash,
    });
    const ok = !error && data === true;
    incr("framique_mfa_recovery_total", { outcome: ok ? "consumed" : "rejected" });
    await recordAuthEvent({
      event: "mfa.recovery.used",
      outcome: ok ? "ok" : "denied",
      userId,
    });
    return { ok };
  });
}
