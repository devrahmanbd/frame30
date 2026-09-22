/**
 * Phase 2 R2-5 — suspend/resume machine.
 * One mechanism: suspend writes `suspended=true` on `plugin_state`; the read
 * path (`listInstalledPlugins`) already folds it into `enabled`, which gates
 * hooks, widgets AND sidecar workers — no second kill switch.
 *
 * "Replay" on resume: queued `plugins` job rows were never cancelled, so
 * resume re-enqueues nothing — deliveries drain naturally (idempotency keys
 * prevent doubles). The resume audit row records the event.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { auditAction } from "./hardening.server";

// NOTE: `Database` is the repo's loose permissive surface (`types.loose.ts`,
// `Database = any`): `SupabaseClient<never>` from the brief collapses every
// row to `never` under `tsc --noEmit`. Logic, names, and error strings below
// are verbatim per the brief.
type Client = SupabaseClient<Database>;

export type SuspendReason =
  | "scope_revoked"
  | "envelope_breach"
  | "review_regression"
  | "kill_switch"
  | "operator";

const ALLOWED: Record<string, string[]> = {
  suspend: ["active", "suspended"],
  resume: ["suspended"],
};

export function assertTransition(
  currentlySuspended: boolean,
  op: "suspend" | "resume",
) {
  const from = currentlySuspended ? "suspended" : "active";
  if (!ALLOWED[op]!.includes(from))
    throw new Error(`plugin_invalid_transition:${from}->${op}`);
}

export async function suspendPlugin(
  db: Client,
  merchantId: string,
  pluginId: string,
  reason: SuspendReason,
  actorId: string | null,
) {
  const { data: row } = await db
    .from("plugin_state")
    .select("id, suspended")
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId)
    .maybeSingle();
  if (!row) throw new Error("plugin_not_installed");
  assertTransition(row.suspended === true, "suspend");
  const now = new Date().toISOString();
  const { error } = await db
    .from("plugin_state")
    .update({
      suspended: true,
      suspended_reason: reason,
      suspended_at: now,
      updated_at: now,
    })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_suspend_failed");
  try {
    const { stopSidecar } = await import("./plugin-sidecar.server");
    stopSidecar(merchantId, pluginId);
  } catch {
    /* sidecar seam optional in tests */
  }
  await auditAction(
    db,
    merchantId,
    actorId,
    "plugin.suspended",
    "plugin",
    {
      plugin: pluginId,
      reason,
    },
    null,
  );
  return { ok: true, suspended: true, reason };
}

export async function resumePlugin(
  db: Client,
  merchantId: string,
  pluginId: string,
  actorId: string | null,
) {
  const { data: row } = await db
    .from("plugin_state")
    .select("id, suspended")
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId)
    .maybeSingle();
  if (!row) throw new Error("plugin_not_installed");
  assertTransition(row.suspended === true, "resume");
  const now = new Date().toISOString();
  const { error } = await db
    .from("plugin_state")
    .update({
      suspended: false,
      suspended_reason: null,
      suspended_at: null,
      updated_at: now,
    })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_resume_failed");
  await auditAction(
    db,
    merchantId,
    actorId,
    "plugin.resumed",
    "plugin",
    {
      plugin: pluginId,
    },
    null,
  );
  try {
    const { syncSidecars } = await import("./plugin-sidecar.server");
    await syncSidecars(db, merchantId);
  } catch {
    /* best-effort restart */
  }
  return { ok: true, suspended: false };
}
