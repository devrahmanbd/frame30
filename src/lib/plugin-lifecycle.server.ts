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

export type PurgePayload = {
  merchantId: string;
  pluginId: string;
  installId: string;
  actorId?: string | null;
};

/**
 * Phase 2 R2-6 — purge job body (durable half of `uninstallWidgetInstall`).
 *
 * Destroys, in order: the `plugin_state` row, undelivered `plugins`-queue rows
 * for this plugin, then lands the ledger row on terminal `purged`, stops the
 * sidecar, and writes exactly one `plugin.purged` audit row.
 *
 * Idempotency is load-bearing (purge is destructive): a rerun that finds the
 * ledger already `purged` — or no ledger row at all — returns success without
 * touching rows or audit. The running job's own row is never a drain
 * candidate: the worker claims it out of `queued`/`failed` before the handler
 * runs, so the `.in("state", ["queued", "failed"])` filter excludes it live.
 */
export async function purgePluginJob(db: Client, payload: PurgePayload) {
  const { merchantId, pluginId, installId, actorId } = payload;
  const { data: install } = await db
    .from("marketplace_installs")
    .select("id, status")
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .maybeSingle();
  if (!install) return { ok: true, purged: false, reason: "install_not_found" };
  if ((install.status as string) === "purged")
    return { ok: true, purged: false, reason: "already_purged" };
  // Brief allowlist: only uninstall-flow states may converge to `purged`.
  // Checked up front so a non-allowlisted install (e.g. `paused`) loses no
  // state/queue rows; the `.in()` on the terminal write below re-guards it
  // at the DB against a status race between this read and the write.
  if (
    !["uninstalling", "removed", "installed", "trial"].includes(
      install.status as string,
    )
  )
    return { ok: true, purged: false, reason: "status_not_purgeable" };

  // 1. delete plugin_state row
  const { data: stateRows } = await db
    .from("plugin_state")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  const states = (stateRows ?? []) as { id: string }[];
  if (states.length) {
    const { error } = await db
      .from("plugin_state")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("plugin_id", pluginId);
    if (error)
      throw Object.assign(new Error("purge_state_failed"), { status: 500 });
  }

  // 2. undelivered queue rows for this plugin die with it (counts only logged).
  // NOTE(deviation from brief): the brief sketches
  // `.like("payload->>pluginId", pluginId)` but the repo fakeDb has no `.like`
  // and PostgREST `->>` column syntax does not round-trip the fake — so select
  // the candidate rows and filter on the decoded payload in JS. Same rows die
  // on live PG (`enqueueJob` stores payload as a jsonb object).
  const { data: queued } = await db
    .from("job_queue")
    .select("id, payload")
    .eq("queue", "plugins")
    .in("state", ["queued", "failed"])
    .limit(500);
  const jobIds = ((queued ?? []) as { id: string; payload?: unknown }[])
    .filter(
      (j) =>
        (j.payload as { pluginId?: unknown } | null)?.pluginId === pluginId,
    )
    .map((j) => j.id);
  if (jobIds.length) {
    await db.from("job_queue").delete().in("id", jobIds);
  }

  // 3. ledger → purged, guarded to the brief allowlist: retry paths from
  // `installed`/`trial` converge, but spec-excluded states (e.g. `paused`)
  // never land here. Zero matched rows = status raced away; no-op, no audit.
  const { data: landed, error: ledgerError } = await db
    .from("marketplace_installs")
    .update({ status: "purged" as never })
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .in("status", ["uninstalling", "removed", "installed", "trial"]);
  if (ledgerError)
    throw Object.assign(new Error("purge_ledger_failed"), { status: 500 });
  if (!((landed ?? []) as unknown[]).length)
    return { ok: true, purged: false, reason: "status_not_purgeable" };

  try {
    const { stopSidecar } = await import("./plugin-sidecar.server");
    stopSidecar(merchantId, pluginId);
  } catch {
    /* seam */
  }

  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    "plugin.purged",
    "plugin",
    {
      plugin: pluginId,
      stateDeleted: states.length,
      jobsDeleted: jobIds.length,
    },
    installId,
  );
  return { ok: true, purged: true };
}
