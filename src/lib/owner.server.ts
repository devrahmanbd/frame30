import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requirePlatformAdmin } from "./platform.server";
import { ownerGate } from "./owner-ops.server";

type Client = SupabaseClient<Database>;

export const FLAG_KEYS = [
  "ai_support_enabled",
  "fraud_engine_enabled",
  "consent_email_enabled",
  "consent_sms_enabled",
  "consent_push_enabled",
  "retention_raw_days",
  "retention_audit_days",
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];

export async function loadFlags(db: Client) {
  const { data } = await db.from("platform_flags").select("key, value, updated_at, updated_by");
  const map: Record<string, Json> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return { flags: map, flagRows: data ?? [] };
}

export async function setFlag(db: Client, userId: string, key: string, value: Json) {
  await requirePlatformAdmin(db, userId);
  const { error } = await db.rpc("platform_set_flag", { _key: key, _value: value });
  if (error) throw new Error(error.message);
  return { ok: true };
}

const nameOf = (rows: { id: string; name: string }[] | null) =>
  new Map((rows ?? []).map((r) => [r.id, r.name]));

/** Trial desk: trial length comes from plan_definitions, never a constant. */
export async function loadTrials(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const [subs, merchants, plans] = await Promise.all([
    db
      .from("subscriptions")
      .select("merchant_id, plan, status, trial_ends_at, next_billing_at, past_due_since")
      .order("trial_ends_at", { ascending: true }),
    db.from("merchants").select("id, name"),
    db.from("plan_definitions").select("plan, trial_days, title_en"),
  ]);
  const names = nameOf(merchants.data);
  const trialDays = new Map((plans.data ?? []).map((p) => [p.plan, p.trial_days]));
  const rows = (subs.data ?? []).map((s) => ({
    merchantId: s.merchant_id,
    merchantName: names.get(s.merchant_id) ?? null,
    plan: s.plan,
    status: s.status,
    trialEndsAt: s.trial_ends_at,
    nextBillingAt: s.next_billing_at,
    pastDueSince: s.past_due_since,
    trialDays: trialDays.get(s.plan) ?? null,
  }));
  return {
    rows,
    counts: {
      trial: rows.filter((r) => r.status === "trial").length,
      active: rows.filter((r) => r.status === "active").length,
      pastDue: rows.filter((r) => r.status === "past_due").length,
    },
  };
}

/** Platform coupon oversight: read-only; abuse caps are owned by docs/07. */
export async function loadCoupons(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const [coupons, merchants, redemptions] = await Promise.all([
    db
      .from("coupons")
      .select(
        "id, merchant_id, code, type, status, currency_code, amount_minor_int, percent_off, usage_limit, per_customer_limit, redeemed_count, expires_at",
      )
      .order("redeemed_count", { ascending: false })
      .limit(100),
    db.from("merchants").select("id, name"),
    db.from("coupon_redemptions").select("coupon_id"),
  ]);
  const names = nameOf(merchants.data);
  const redeemed = new Map<string, number>();
  for (const r of redemptions.data ?? [])
    redeemed.set(r.coupon_id, (redeemed.get(r.coupon_id) ?? 0) + 1);
  const rows = (coupons.data ?? []).map((c) => ({
    ...c,
    merchantName: names.get(c.merchant_id) ?? null,
    ledgerRedemptions: redeemed.get(c.id) ?? 0,
    overCap:
      c.usage_limit !== null && (redeemed.get(c.id) ?? c.redeemed_count) > c.usage_limit,
  }));
  return { rows, overCap: rows.filter((r) => r.overCap).length };
}

/** Consent desk: channel switches plus the opt-out ledger they must honour. */
export async function loadMarketing(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const [{ flags }, subscribers, consents] = await Promise.all([
    loadFlags(db),
    db.from("subscribers").select("status, email_consent, sms_consent, unsubscribed_at"),
    db.from("customer_consents").select("channel, granted"),
  ]);
  const subs = subscribers.data ?? [];
  const grants = new Map<string, { granted: number; withdrawn: number }>();
  for (const c of consents.data ?? []) {
    const cur = grants.get(c.channel) ?? { granted: 0, withdrawn: 0 };
    if (c.granted) cur.granted += 1;
    else cur.withdrawn += 1;
    grants.set(c.channel, cur);
  }
  return {
    flags,
    subscribers: {
      total: subs.length,
      unsubscribed: subs.filter((s) => s.unsubscribed_at !== null).length,
      emailConsent: subs.filter((s) => s.email_consent).length,
      smsConsent: subs.filter((s) => s.sms_consent).length,
    },
    consent: Object.fromEntries(grants),
  };
}

/** Fraud desk. The engine switch fails open to `review`, never to auto-approve. */
export async function loadFraud(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const [{ flags }, cases, blacklist, merchants] = await Promise.all([
    loadFlags(db),
    db
      .from("fraud_cases")
      .select(
        "id, merchant_id, order_number, status, risk_score, amount_minor_int, currency_code, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("fraud_blacklist").select("kind, active"),
    db.from("merchants").select("id, name"),
  ]);
  const names = nameOf(merchants.data);
  const rows = (cases.data ?? []).map((c) => ({
    ...c,
    merchantName: names.get(c.merchant_id) ?? null,
  }));
  return {
    engineEnabled: flags["fraud_engine_enabled"] !== false,
    rows,
    counts: {
      open: rows.filter((r) => r.status === "open").length,
      evidence: rows.filter((r) => r.status === "evidence_requested").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
    },
    blacklist: {
      active: (blacklist.data ?? []).filter((b) => b.active).length,
      total: (blacklist.data ?? []).length,
    },
  };
}

/** AI desk: moderation queue, kill switch, and operator takeover support. */
export async function loadAi(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const [{ flags }, convos, merchants] = await Promise.all([
    loadFlags(db),
    db
      .from("ai_conversations")
      .select(
        "id, merchant_id, channel, status, order_number, order_id, phone_hash, rating, last_message_at, takeover_mode, priority, operator_notes, assigned_operator_id, last_operator_message_at, last_customer_message_at, resolved_at, created_at, updated_at",
      )
      .order("last_message_at", { ascending: false })
      .limit(200),
    db.from("merchants").select("id, name, email"),
  ]);
  const names = new Map((merchants.data ?? []).map((m) => [m.id, { name: m.name, email: m.email }]));
  const rows = (convos.data ?? []).map((c) => ({
    ...c,
    merchantName: names.get(c.merchant_id)?.name ?? null,
    merchantEmail: names.get(c.merchant_id)?.email ?? null,
    // Computed: needs_agent when customer message arrived after last operator message (or operator never replied)
    needsHumanAgent:
      c.status === "open" &&
      (c.takeover_mode ?? "ai") === "ai" &&
      c.last_customer_message_at !== null &&
      (c.last_operator_message_at === null ||
        new Date(c.last_customer_message_at) > new Date(c.last_operator_message_at)),
    priorityRank:
      (c.priority ?? "normal") === "urgent"
        ? 4
        : (c.priority ?? "normal") === "high"
          ? 3
          : (c.priority ?? "normal") === "normal"
            ? 2
            : 1,
  }));
  return {
    aiEnabled: flags["ai_support_enabled"] !== false,
    rows,
    counts: {
      open: rows.filter((r) => r.status === "open").length,
      needsAgent: rows.filter((r) => r.needsHumanAgent).length,
      humanTakeover: rows.filter((r) => (r.takeover_mode ?? "ai") === "human_takeover").length,
      inProgress: rows.filter((r) => r.status === "in_progress").length,
      resolved: rows.filter((r) => r.status === "resolved" || r.status === "closed").length,
    },
  };
}

/** Load all messages for a single conversation (platform admin read). */
export async function loadAiConversationMessages(
  db: Client,
  userId: string,
  conversationId: string,
) {
  await requirePlatformAdmin(db, userId);
  const [convResult, msgsResult] = await Promise.all([
    db
      .from("ai_conversations")
      .select(
        "id, merchant_id, channel, status, takeover_mode, priority, operator_notes, assigned_operator_id, last_operator_message_at, last_customer_message_at, order_number, phone_hash, created_at",
      )
      .eq("id", conversationId)
      .single(),
    db
      .from("ai_messages")
      .select("id, role, body, flagged, created_at, sent_by_operator_id, is_internal_note")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  if (convResult.error) throw new Error(convResult.error.message);
  return {
    conversation: convResult.data,
    messages: msgsResult.data ?? [],
  };
}

/** Platform operator sends a reply or internal note into a conversation. */
export async function ownerSendAgentMessage(
  db: Client,
  userId: string,
  conversationId: string,
  merchantId: string,
  body: string,
  isInternalNote: boolean,
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ai.send_agent_message",
      entity: "ai_messages",
      entityId: conversationId,
      bucket: "owner.read",
      kind: "write",
      meta: { merchantId, isInternalNote },
    },
    async () => {
      const { error: msgErr } = await db.from("ai_messages").insert({
        conversation_id: conversationId,
        merchant_id: merchantId,
        body,
        role: "agent",
        flagged: false,
        sent_by_operator_id: userId,
        is_internal_note: isInternalNote,
      } as never);
      if (msgErr) throw new Error(msgErr.message);

      if (!isInternalNote) {
        await db
          .from("ai_conversations")
          .update({
            last_operator_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", conversationId);
      }
      return { ok: true };
    },
  );
}

/** Toggle human takeover mode on a conversation. */
export async function ownerSetTakeoverMode(
  db: Client,
  userId: string,
  conversationId: string,
  mode: "ai" | "human_takeover",
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ai.set_takeover_mode",
      entity: "ai_conversations",
      entityId: conversationId,
      bucket: "owner.read",
      kind: "write",
      meta: { mode },
    },
    async () => {
      const { error } = await db
        .from("ai_conversations")
        .update({
          takeover_mode: mode,
          assigned_operator_id: mode === "human_takeover" ? userId : null,
          last_operator_message_at:
            mode === "human_takeover" ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", conversationId);
      if (error) throw new Error(error.message);
      return { ok: true, mode };
    },
  );
}

/** Update conversation triage status. */
export async function ownerUpdateConversationStatus(
  db: Client,
  userId: string,
  conversationId: string,
  status: "open" | "in_progress" | "resolved" | "closed",
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ai.update_status",
      entity: "ai_conversations",
      entityId: conversationId,
      bucket: "owner.read",
      kind: "write",
      meta: { status },
    },
    async () => {
      const { error } = await db
        .from("ai_conversations")
        .update({
          status,
          resolved_at: status === "resolved" || status === "closed" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", conversationId);
      if (error) throw new Error(error.message);
      return { ok: true, status };
    },
  );
}

/** Update conversation priority. */
export async function ownerSetConversationPriority(
  db: Client,
  userId: string,
  conversationId: string,
  priority: "low" | "normal" | "high" | "urgent",
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ai.set_priority",
      entity: "ai_conversations",
      entityId: conversationId,
      bucket: "owner.read",
      kind: "write",
      meta: { priority },
    },
    async () => {
      const { error } = await db
        .from("ai_conversations")
        .update({ priority, updated_at: new Date().toISOString() } as never)
        .eq("id", conversationId);
      if (error) throw new Error(error.message);
      return { ok: true, priority };
    },
  );
}

/** Save private operator notes on a conversation. */
export async function ownerSaveOperatorNotes(
  db: Client,
  userId: string,
  conversationId: string,
  notes: string,
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ai.save_notes",
      entity: "ai_conversations",
      entityId: conversationId,
      bucket: "owner.read",
      kind: "write",
      meta: { length: notes.length },
    },
    async () => {
      const { error } = await db
        .from("ai_conversations")
        .update({ operator_notes: notes, updated_at: new Date().toISOString() } as never)
        .eq("id", conversationId);
      if (error) throw new Error(error.message);
      return { ok: true };
    },
  );
}

/** Export conversation transcript in markdown, jsonl, or csv. */
export async function ownerExportConversationTranscript(
  db: Client,
  userId: string,
  conversationId: string,
  format: "markdown" | "jsonl" | "csv",
  options?: { redactPii?: boolean; includeInternalNotes?: boolean },
) {
  return ownerGate(
    db,
    userId,
    {
      action: "ai.export_transcript",
      entity: "ai_conversations",
      entityId: conversationId,
      bucket: "owner.read",
      kind: "read",
      meta: { format, options },
    },
    async () => {
      const [convResult, msgsResult] = await Promise.all([
        db
          .from("ai_conversations")
          .select(
            "id, merchant_id, channel, status, takeover_mode, priority, operator_notes, assigned_operator_id, last_operator_message_at, last_customer_message_at, order_number, phone_hash, created_at, resolved_at",
          )
          .eq("id", conversationId)
          .single(),
        db
          .from("ai_messages")
          .select("id, role, body, flagged, created_at, sent_by_operator_id, is_internal_note")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(1000),
      ]);
      if (convResult.error) throw new Error(convResult.error.message);
      const { exportConversationTranscript } = await import("./support-export");
      const exportResult = exportConversationTranscript(
        convResult.data as never,
        (msgsResult.data ?? []) as never,
        format,
        options,
      );
      return { ok: true, ...exportResult };
    },
  );
}


/** Owner roster. PII-minimal by design: ids only, no profile join. */
export async function loadOwners(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const { data } = await db
    .from("platform_admins")
    .select("user_id, created_at")
    .order("created_at", { ascending: true });
  return {
    owners: (data ?? []).map((o) => ({ ...o, isYou: o.user_id === userId })),
  };
}

/** Compliance + retention. Dead-letter depth links to the gateway surface. */
export async function loadOwnerSettings(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const [{ flags }, events, approvals] = await Promise.all([
    loadFlags(db),
    db.from("webhook_events").select("status"),
    db.from("approval_requests").select("status"),
  ]);
  const rows = events.data ?? [];
  return {
    flags,
    gateway: {
      total: rows.length,
      deadLetter: rows.filter((e) => e.status === "dead_letter").length,
      processed: rows.filter((e) => e.status === "processed").length,
    },
    approvals: {
      pending: (approvals.data ?? []).filter((a) => a.status === "pending").length,
    },
  };
}
