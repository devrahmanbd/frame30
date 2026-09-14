/**
 * Provider sign-off gate — service layer.
 *
 * Going live on a real money rail is a two-party action: the merchant assembles
 * the evidence pack and the secrets, a *platform reviewer* decides. Nothing in
 * this module lets one party do both.
 *
 * Guarantees
 *  - every state change goes through `transition()`, which refuses illegal
 *    edges, writes a `provider_credential_events` audit row and counts the move
 *    in Prometheus,
 *  - live secrets are sealed with AES-GCM before they touch the database and
 *    are never returned to any caller — only `last4` hints leave this module,
 *  - reads and writes are rate limited on separate buckets,
 *  - a live rail is only reported chargeable when its row is in `live`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { cached, invalidate } from "./cache.server";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import {
  PROVIDER_CATALOG,
  PROVIDER_KEYS,
  canDecide,
  checklistProgress,
  credentialCanTransition,
  evaluateSubmission,
  isProviderKey,
  maskSecret,
  type Checklist,
  type ChecklistKey,
  type CredentialState,
  type ProviderKey,
} from "./provider-gate";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["provider_credentials"]["Row"];

export class ProviderGateError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "ProviderGateError";
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertMerchantAdmin(db: Client, merchantId: string) {
  const { data, error } = await db.rpc("is_merchant_admin", { _merchant_id: merchantId });
  if (error || data !== true) throw new ProviderGateError("provider.forbidden", 403);
}

/* -------------------------------- transitions ------------------------------ */

async function transition(
  row: Row,
  to: CredentialState,
  actor: string | null,
  event: string,
  detail: Record<string, unknown> = {},
) {
  const from = row.state as CredentialState;
  if (from === to) return row;
  if (!credentialCanTransition(from, to)) {
    incr("framique_provider_transition_total", { from, to, outcome: "rejected" });
    throw new ProviderGateError(`provider.illegal_transition:${from}->${to}`, 409);
  }
  const service = await admin();
  const patch: Database["public"]["Tables"]["provider_credentials"]["Update"] = {
    state: to,
    updated_at: new Date().toISOString(),
  };
  if (to === "submitted") {
    patch["submitted_at"] = new Date().toISOString();
    patch["submitted_by"] = actor;
  }
  if (to === "approved" || to === "rejected" || to === "changes_requested") {
    patch["decided_at"] = new Date().toISOString();
    patch["decided_by"] = actor;
    patch["decision_note"] = (detail["note"] as string) ?? null;
  }
  if (to === "live") patch["activated_at"] = new Date().toISOString();
  if (to === "suspended") patch["suspended_reason"] = (detail["reason"] as string) ?? null;

  const { data, error } = await service
    .from("provider_credentials")
    .update(patch)
    .eq("id", row.id)
    .eq("state", from) // optimistic lock: a concurrent decision cannot be overwritten
    .select("*")
    .maybeSingle();
  if (error || !data) throw new ProviderGateError("provider.transition_conflict", 409);

  await service.from("provider_credential_events").insert({
    credential_id: row.id,
    merchant_id: row.merchant_id,
    event,
    from_state: from,
    to_state: to,
    actor,
    detail: detail as Json,
  });
  incr("framique_provider_transition_total", { from, to, outcome: "ok" });
  log("info", "provider.transition", { credential: row.id, provider: row.provider_key, from, to, event });
  await invalidate(`provider:${row.merchant_id}`);
  return data as Row;
}

/* ----------------------------------- reads --------------------------------- */

export type CredentialView = {
  id: string;
  provider: ProviderKey;
  rail: string;
  environment: "sandbox" | "live";
  state: CredentialState;
  label: string;
  labelBn: string;
  regulatory: string;
  settlementDays: number;
  checklist: Checklist;
  requires: ChecklistKey[];
  progress: { done: number; total: number; pct: number };
  secretHints: Record<string, string>;
  secretFields: string[];
  missing: { evidence: ChecklistKey[]; secrets: string[] };
  providerRef: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  activatedAt: string | null;
  suspendedReason: string | null;
  chargeable: boolean;
};

function toView(row: Row): CredentialView {
  const provider = isProviderKey(row.provider_key) ? row.provider_key : "bkash";
  const spec = PROVIDER_CATALOG[provider];
  const checklist = (row.checklist ?? {}) as Checklist;
  const hints = (row.secret_hints ?? {}) as Record<string, string>;
  const environment = row.environment === "sandbox" ? "sandbox" : "live";
  const verdict = evaluateSubmission(provider, environment, checklist, Object.keys(hints));
  return {
    id: row.id,
    provider,
    rail: spec.rail,
    environment,
    state: row.state as CredentialState,
    label: spec.label,
    labelBn: spec.labelBn,
    regulatory: spec.regulatory,
    settlementDays: spec.settlementDays,
    checklist,
    requires: spec.requires,
    progress: checklistProgress(provider, checklist),
    secretHints: hints,
    secretFields: spec.secretFields,
    missing: { evidence: verdict.missingEvidence, secrets: verdict.missingSecrets },
    providerRef: row.provider_merchant_ref,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    activatedAt: row.activated_at,
    suspendedReason: row.suspended_reason,
    chargeable: row.state === "live",
  };
}

export async function listCredentials(db: Client, merchantId: string, userId: string) {
  await enforceRateLimit("provider.read", `${merchantId}:${userId}`);
  return withSpan("provider.list", async () => {
    const { data, error } = await db
      .from("provider_credentials")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: true });
    if (error) throw new ProviderGateError("provider.read_failed", 500);
    const rows = (data ?? []) as Row[];
    const byKey = new Map(rows.map((r) => [`${r.provider_key}:${r.environment}`, r]));
    // Present the whole catalogue so an un-started rail is discoverable rather
    // than invisible; unsaved rails render as a draft placeholder.
    const catalogue = PROVIDER_KEYS.map((key) => {
      const existing = byKey.get(`${key}:live`);
      if (existing) return toView(existing);
      const spec = PROVIDER_CATALOG[key];
      return {
        id: "",
        provider: key,
        rail: spec.rail,
        environment: "live" as const,
        state: "draft" as CredentialState,
        label: spec.label,
        labelBn: spec.labelBn,
        regulatory: spec.regulatory,
        settlementDays: spec.settlementDays,
        checklist: {},
        requires: spec.requires,
        progress: checklistProgress(key, {}),
        secretHints: {},
        secretFields: spec.secretFields,
        missing: { evidence: spec.requires, secrets: spec.secretFields },
        providerRef: null,
        submittedAt: null,
        decidedAt: null,
        decisionNote: null,
        activatedAt: null,
        suspendedReason: null,
        chargeable: false,
      } satisfies CredentialView;
    });
    return { credentials: catalogue };
  });
}

export async function credentialHistory(db: Client, merchantId: string, credentialId: string) {
  const { data } = await db
    .from("provider_credential_events")
    .select("id, event, from_state, to_state, created_at, detail")
    .eq("merchant_id", merchantId)
    .eq("credential_id", credentialId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as {
    id: string;
    event: string;
    from_state: string | null;
    to_state: string | null;
    created_at: string;
    detail: Json;
  }[];
}

/** Cheap predicate used by the checkout/payment paths. */
export async function liveProviders(merchantId: string): Promise<ProviderKey[]> {
  return cached(`provider:${merchantId}:live`, 60, async () => {
    const service = await admin();
    const { data } = await service
      .from("provider_credentials")
      .select("provider_key")
      .eq("merchant_id", merchantId)
      .eq("environment", "live")
      .eq("state", "live");
    return ((data ?? []) as { provider_key: string }[])
      .map((r) => r.provider_key)
      .filter(isProviderKey);
  });
}

/* ---------------------------------- writes --------------------------------- */

async function upsertRow(merchantId: string, provider: ProviderKey, userId: string) {
  const service = await admin();
  const { data: existing } = await service
    .from("provider_credentials")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("provider_key", provider)
    .eq("environment", "live")
    .maybeSingle();
  if (existing) return existing as Row;
  const { data, error } = await service
    .from("provider_credentials")
    .insert({
      merchant_id: merchantId,
      provider_key: provider,
      rail: PROVIDER_CATALOG[provider].rail,
      environment: "live",
      submitted_by: null,
      checklist: {} as Json,
    })
    .select("*")
    .single();
  if (error || !data) throw new ProviderGateError("provider.create_failed", 500);
  await service.from("provider_credential_events").insert({
    credential_id: data.id,
    merchant_id: merchantId,
    event: "credential.created",
    to_state: "draft",
    actor: userId,
    detail: {} as Json,
  });
  return data as Row;
}

const EDITABLE_STATES: CredentialState[] = ["draft", "changes_requested", "rejected"];

export async function saveEvidence(
  db: Client,
  merchantId: string,
  userId: string,
  input: { provider: ProviderKey; checklist: Checklist; providerRef?: string | null },
) {
  await assertMerchantAdmin(db, merchantId);
  await enforceRateLimit("provider.write", `${merchantId}:${userId}`);
  const row = await upsertRow(merchantId, input.provider, userId);
  if (!EDITABLE_STATES.includes(row.state as CredentialState)) {
    throw new ProviderGateError("provider.locked_for_review", 409);
  }
  const service = await admin();
  const merged = { ...((row.checklist ?? {}) as Checklist), ...input.checklist };
  await service
    .from("provider_credentials")
    .update({
      checklist: merged as Json,
      provider_merchant_ref: input.providerRef ?? row.provider_merchant_ref,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  await service.from("provider_credential_events").insert({
    credential_id: row.id,
    merchant_id: merchantId,
    event: "credential.evidence_saved",
    actor: userId,
    detail: { keys: Object.keys(input.checklist) } as Json,
  });
  await invalidate(`provider:${merchantId}`);
  return listCredentials(db, merchantId, userId);
}

/**
 * Stores live provider secrets. The plaintext is sealed immediately and the row
 * only keeps a masked hint per field, so neither a DB dump nor any API response
 * can reveal a credential.
 */
export async function saveSecrets(
  db: Client,
  merchantId: string,
  userId: string,
  input: { provider: ProviderKey; secrets: Record<string, string> },
) {
  await assertMerchantAdmin(db, merchantId);
  await enforceRateLimit("provider.write", `${merchantId}:${userId}`);
  const { requireStepUp } = await import("./identity.server");
  await requireStepUp(db, "api_key.rotate", merchantId);

  const spec = PROVIDER_CATALOG[input.provider];
  const clean: Record<string, string> = {};
  for (const field of spec.secretFields) {
    const value = (input.secrets[field] ?? "").trim();
    if (value) clean[field] = value;
  }
  if (Object.keys(clean).length === 0) throw new ProviderGateError("provider.no_secrets", 400);

  const row = await upsertRow(merchantId, input.provider, userId);
  if (!EDITABLE_STATES.includes(row.state as CredentialState)) {
    throw new ProviderGateError("provider.locked_for_review", 409);
  }
  const { sealSecret, unsealSecret } = await import("./webhook-secret.server");
  const previous = row.secret_ciphertext ? await unsealSecret(row.secret_ciphertext) : null;
  const merged = { ...(previous ? (JSON.parse(previous) as Record<string, string>) : {}), ...clean };
  const sealed = await sealSecret(JSON.stringify(merged));
  const hints = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, maskSecret(v)]));

  const service = await admin();
  await service
    .from("provider_credentials")
    .update({ secret_ciphertext: sealed, secret_hints: hints as Json, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  await service.from("provider_credential_events").insert({
    credential_id: row.id,
    merchant_id: merchantId,
    event: "credential.secrets_saved",
    actor: userId,
    detail: { fields: Object.keys(clean) } as Json,
  });
  incr("framique_provider_secret_writes_total", { provider: input.provider });
  await invalidate(`provider:${merchantId}`);
  return listCredentials(db, merchantId, userId);
}

export async function submitForReview(
  db: Client,
  merchantId: string,
  userId: string,
  provider: ProviderKey,
) {
  await assertMerchantAdmin(db, merchantId);
  await enforceRateLimit("provider.submit", `${merchantId}:${provider}`);
  const row = await upsertRow(merchantId, provider, userId);
  const hints = (row.secret_hints ?? {}) as Record<string, string>;
  const verdict = evaluateSubmission(provider, "live", (row.checklist ?? {}) as Checklist, Object.keys(hints));
  if (!verdict.ok) {
    incr("framique_provider_submit_total", { provider, outcome: "incomplete" });
    throw new ProviderGateError("provider.submission_incomplete", 400);
  }
  await transition(row, "submitted", userId, "credential.submitted");
  incr("framique_provider_submit_total", { provider, outcome: "ok" });
  return listCredentials(db, merchantId, userId);
}

/* -------------------------------- review side ------------------------------ */

export type ReviewDecision = "in_review" | "approved" | "changes_requested" | "rejected" | "live" | "suspended" | "revoked";

/** Platform-reviewer action. The merchant can never call this path. */
export async function decideCredential(
  db: Client,
  reviewerId: string,
  input: { credentialId: string; decision: ReviewDecision; note?: string | null },
) {
  const { requirePlatformAdmin } = await import("./platform.server");
  await requirePlatformAdmin(db, reviewerId);
  await enforceRateLimit("provider.review", reviewerId);

  const service = await admin();
  const { data } = await service
    .from("provider_credentials")
    .select("*")
    .eq("id", input.credentialId)
    .maybeSingle();
  if (!data) throw new ProviderGateError("provider.not_found", 404);
  const row = data as Row;

  const allowed = canDecide(true, reviewerId, row.submitted_by);
  if (!allowed.ok) throw new ProviderGateError(allowed.reason, 403);

  const updated = await transition(row, input.decision, reviewerId, `credential.${input.decision}`, {
    note: input.note ?? null,
    reason: input.note ?? null,
  });

  if (input.decision === "live" || input.decision === "suspended" || input.decision === "rejected") {
    await notifyMerchant(row.merchant_id, {
      kind: `provider.${input.decision}`,
      severity: input.decision === "live" ? "info" : "warning",
      titleEn:
        input.decision === "live"
          ? `${PROVIDER_CATALOG[row.provider_key as ProviderKey]?.label ?? row.provider_key} is live`
          : `${row.provider_key} ${input.decision}`,
      titleBn: input.decision === "live" ? "পেমেন্ট রেইল লাইভ হয়েছে" : "পেমেন্ট রেইল আপডেট",
      bodyEn: input.note ?? "Reviewed by the Framique payments team.",
      bodyBn: input.note ?? "ফ্রেমিক পেমেন্ট টিম রিভিউ করেছে।",
      href: "/admin/settings/providers",
    });
  }
  return toView(updated);
}

/** Review queue for the platform console. */
export async function reviewQueue(db: Client, reviewerId: string) {
  const { requirePlatformAdmin } = await import("./platform.server");
  await requirePlatformAdmin(db, reviewerId);
  const service = await admin();
  const { data } = await service
    .from("provider_credentials")
    .select("*")
    .in("state", ["submitted", "in_review", "approved"])
    .order("submitted_at", { ascending: true })
    .limit(100);
  return ((data ?? []) as Row[]).map((r) => ({ merchantId: r.merchant_id, ...toView(r) }));
}

async function notifyMerchant(
  merchantId: string,
  n: {
    kind: string;
    severity: "info" | "warning" | "critical";
    titleEn: string;
    titleBn: string;
    bodyEn: string;
    bodyBn: string;
    href: string;
  },
) {
  try {
    const service = await admin();
    await service.from("notifications").insert({
      merchant_id: merchantId,
      kind: n.kind,
      severity: n.severity,
      title_en: n.titleEn,
      title_bn: n.titleBn,
      body_en: n.bodyEn,
      body_bn: n.bodyBn,
      href: n.href,
    });
  } catch {
    // Never fail a sign-off because a notification insert failed.
  }
}
