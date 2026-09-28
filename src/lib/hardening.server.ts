/**
 * §5 — server-side hardening primitives shared by the three consoles.
 *
 * Two things live here because both must be impossible to forget:
 *  - `assertStepUp`   — burns a fresh grant for the action class guarding a
 *                       DANGEROUS permission. Called from `requirePermission`.
 *  - `auditAction`    — append-only merchant audit row (`activity_log`);
 *                       `unmaskAudited` and the export-reason gate use it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { isDangerous, type AnyPermission } from "./authz";
import { stepUpClassFor } from "./step-up";

type Client = SupabaseClient<Database>;

/** Never let an audit failure swallow the action's own error. */
export async function auditAction(
  db: Client,
  merchantId: string,
  actor: string | null,
  action: string,
  resourceType: string,
  changed: Record<string, unknown> = {},
  resourceId: string | null = null,
) {
  // QUBICKLE H7 (Rule 17): audit is transport best-effort — a dead audit
  // table must never fail the merchant's action — but a dropped audit must
  // never be silent either. Surface it to observability (no secrets, no
  // high-cardinality labels) so the failure is diagnosable.
  const observe = async (message: string) => {
    const { incr, log } = await import("./observability.server");
    incr("framique_audit_total", {
      outcome: "dropped",
      action,
      resource_type: resourceType,
    });
    log("error", "audit.write_failed", {
      action,
      resourceType,
      merchantId,
      message,
    });
  };
  try {
    const { data, error } = await db.from("activity_log").insert({
      merchant_id: merchantId,
      actor,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      changed: changed as unknown as Json,
    });
    if (error) await observe((error as { message?: string }).message ?? "unknown");
    return { data, error };
  } catch (e) {
    await observe(e instanceof Error ? e.message : "unknown");
    return { data: null, error: e };
  }
}

/**
 * Refuses unless the caller holds a fresh, unused step-up grant for the class
 * that guards `permission`. Throws `StepUpRequiredError`, which the consoles
 * translate into the second-factor prompt.
 */
export async function assertStepUp(
  db: Client,
  permission: AnyPermission,
  merchantId: string | null,
) {
  if (!isDangerous(permission)) return;
  const action = stepUpClassFor(permission);
  if (!action) return;
  const { requireStepUp } = await import("./identity.server");
  await requireStepUp(db, action as never, merchantId);
}

/** Releasing a full contact detail is itself an audited event. */
export async function unmaskAudited(
  db: Client,
  merchantId: string,
  actor: string | null,
  subject: { resourceType: string; resourceId: string; field: string },
) {
  await auditAction(
    db,
    merchantId,
    actor,
    "pii.unmasked",
    subject.resourceType,
    { field: subject.field },
    subject.resourceId,
  );
}
