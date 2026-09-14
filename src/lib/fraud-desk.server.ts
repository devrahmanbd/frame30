import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { RULE_CATALOG, ensureRules, maskPhone, writeAudit } from "./fraud.server";
import { enforceRateLimit } from "./rate-limit.server";
import { incr, withSpan } from "./observability.server";

type Client = SupabaseClient<Database>;

export type Decision = "approved" | "rejected" | "evidence_requested";

export async function loadDesk(db: Client, merchantId: string) {
  return withSpan("fraud.desk_load", async () => {
    await enforceRateLimit("fraud.read", merchantId);
    const [rules, cases, blacklist, audit, failedPayments, assessments] = await Promise.all([
      ensureRules(db, merchantId),
      db
        .from("fraud_cases")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("fraud_blacklist")
        .select("id, kind, value, reason, active, created_at")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("fraud_audit")
        .select("id, action, payload, created_at, case_id")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchantId)
        .eq("payment_status", "failed"),
      db
        .from("fraud_assessments")
        .select("id, order_id, score, action, decisive_code, signals, created_at")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const caseRows = (cases.data ?? []).map((c) => ({
      ...c,
      customer_phone_masked: maskPhone(c.customer_phone),
      customer_phone: undefined as unknown as string,
    }));
    const blacklistRows = blacklist.data ?? [];
    const assessmentRows = assessments.data ?? [];

    return {
      catalog: RULE_CATALOG,
      rules,
      cases: caseRows,
      blacklist: blacklistRows,
      audit: audit.data ?? [],
      assessments: assessmentRows,
      counts: {
        pending: caseRows.filter((c) => c.status === "open").length,
        flagged: caseRows.length,
        evidence: caseRows.filter((c) => c.status === "evidence_requested").length,
        failedPayments: failedPayments.count ?? 0,
        blacklisted: blacklistRows.filter((b) => b.active).length,
        blocked: assessmentRows.filter((a) => a.action === "block").length,
        reviewed: assessmentRows.filter((a) => a.action === "review").length,
      },
    };
  });
}


export async function listAudit(db: Client, merchantId: string) {
  const { data } = await db
    .from("fraud_audit")
    .select("id, action, actor, payload, case_id, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(300);
  return data ?? [];
}

export async function decideCase(
  db: Client,
  merchantId: string,
  actor: string,
  caseId: string,
  decision: Decision,
  note: string | null,
) {
  await enforceRateLimit("fraud.decide", `${merchantId}:${actor}`);
  const { data: existing } = await db
    .from("fraud_cases")
    .select("id, status, order_number, risk_score")
    .eq("merchant_id", merchantId)
    .eq("id", caseId)
    .maybeSingle();
  if (!existing) throw new Error("fraud_case_not_found");
  if (existing.status === "approved" || existing.status === "rejected")
    throw new Error("fraud_case_already_decided");

  const { error } = await db
    .from("fraud_cases")
    .update({
      status: decision,
      decision_by: actor,
      decision_at: new Date().toISOString(),
      decision_note: note,
    })
    .eq("merchant_id", merchantId)
    .eq("id", caseId);
  if (error) throw new Error("fraud_decision_failed");

  const action =
    decision === "approved"
      ? "fraud_review.passed"
      : decision === "rejected"
        ? "fraud_review.rejected"
        : "fraud_review.evidence_requested";
  incr("framique_fraud_decision_total", { decision });
  await writeAudit(
    db,
    merchantId,
    actor,
    action,
    { order_number: existing.order_number, risk_score: existing.risk_score, note },
    caseId,
  );
  return { ok: true, status: decision, refundHint: decision === "rejected" };
}

export async function setRule(
  db: Client,
  merchantId: string,
  actor: string,
  code: string,
  enabled: boolean,
  params: Record<string, number>,
  ruleAction?: "allow" | "review" | "block",
) {
  const catalog = RULE_CATALOG.find((r) => r.code === code);
  if (!catalog) throw new Error("fraud_rule_unknown");
  const { error } = await db.from("fraud_rules").upsert(
    {
      merchant_id: merchantId,
      code,
      enabled,
      params: params as never,
      precedence: catalog.precedence,
      action: ruleAction ?? catalog.action,
    },
    { onConflict: "merchant_id,code" },
  );
  if (error) throw new Error("fraud_rule_update_failed");
  await writeAudit(db, merchantId, actor, "fraud.rule_changed", {
    code,
    enabled,
    params,
    action: ruleAction ?? catalog.action,
  });
  return { ok: true };
}


export async function addBlacklist(
  db: Client,
  merchantId: string,
  actor: string,
  kind: "phone" | "email",
  value: string,
  reason: string | null,
) {
  const normalized = kind === "email" ? value.toLowerCase() : value.replace(/\s/g, "");
  const { error } = await db.from("fraud_blacklist").upsert(
    {
      merchant_id: merchantId,
      kind,
      value: normalized,
      reason,
      created_by: actor,
      active: true,
    },
    { onConflict: "merchant_id,kind,value" },
  );
  if (error) throw new Error("fraud_blacklist_failed");
  await writeAudit(db, merchantId, actor, "fraud.blacklist_added", { kind, reason });
  return { ok: true };
}

export async function setBlacklistActive(
  db: Client,
  merchantId: string,
  actor: string,
  id: string,
  active: boolean,
) {
  const { error } = await db
    .from("fraud_blacklist")
    .update({ active })
    .eq("merchant_id", merchantId)
    .eq("id", id);
  if (error) throw new Error("fraud_blacklist_failed");
  await writeAudit(db, merchantId, actor, "fraud.blacklist_updated", { id, active });
  return { ok: true };
}

export async function isBlacklisted(
  db: Client,
  merchantId: string,
  phone: string | null,
  email: string | null,
) {
  const { data } = await db
    .from("fraud_blacklist")
    .select("kind, value")
    .eq("merchant_id", merchantId)
    .eq("active", true);
  return (data ?? []).some(
    (row) =>
      (row.kind === "phone" && phone && row.value === phone.replace(/\s/g, "")) ||
      (row.kind === "email" && email && row.value === email.toLowerCase()),
  );
}
