/**
 * Ticket + SLA desk (service side).
 *
 * Tickets are the human end of the assistant: every escalation lands here with
 * its order id already attached. Deadlines are frozen at creation from the
 * merchant's SLA policy, and every state change writes an append-only event row
 * (actor, before, after, reason) that the database refuses to mutate.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import {
  ADVISORY_REFUND_TEMPLATE_BN,
  ADVISORY_REFUND_TEMPLATE_EN,
  redactPii,
} from "./support-guardrails";
import {
  dueDates,
  summarise,
  type Priority,
  type SlaPolicy,
} from "./support-sla";

type Client = SupabaseClient<Database>;

export class TicketError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "TicketError";
  }
}

async function admin() {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function slaPolicies(
  db: Client | Awaited<ReturnType<typeof admin>>,
  merchantId: string,
) {
  const { data } = await db
    .from("support_sla_policies")
    .select("priority, first_response_minutes, resolution_minutes")
    .eq("merchant_id", merchantId);
  return (data ?? []) as SlaPolicy[];
}

export type TicketStatus =
  "open" | "pending" | "pending_approval" | "resolved" | "closed";

export type CreateTicketInput = {
  merchantId: string;
  subject: string;
  body?: string;
  priority?: Priority;
  channel?: "widget" | "admin" | "whatsapp" | "messenger";
  conversationId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  requesterHash?: string | null;
  actorId?: string | null;
  reason?: string;
  /**
   * Sensitive side-effects (refunds, PII disclosure) must not fire
   * autonomously: the ticket lands in `pending_approval` and waits for an
   * operator decision via `confirmPendingTicket`. Defaults to false so the
   * existing auto-ticket flow keeps opening tickets directly.
   */
  requiresApproval?: boolean;
};

/**
 * Sensitive-side-effect screen for ticket bodies. Flags refund/dispute intent
 * and high-sensitivity PII (NID, passport, card, PIN/OTP). Plain contact info
 * (email/phone alone) is normal ticket content and does NOT require approval,
 * so the existing auto-ticket flow keeps working.
 */
export function needsApprovalReview(input: {
  subject?: string | null;
  body?: string | null;
}): { required: boolean; signals: string[] } {
  const text = `${input.subject ?? ""}\n${input.body ?? ""}`;
  const signals: string[] = [];
  if (
    /\brefund\b|\bchargeback\b|\bdispute\b|\breimburse\b|রিফান্ড/i.test(text)
  ) {
    signals.push("refund_intent");
  }
  const { hits } = redactPii(text);
  if (
    hits.some(
      (h) => h === "nid" || h === "passport" || h === "card" || h === "pin_otp",
    ) &&
    !signals.includes("sensitive_pii")
  ) {
    signals.push("sensitive_pii");
  }
  return { required: signals.length > 0, signals };
}

/**
 * Advisory-only refund reply for the operator confirm path. Uses the shared
 * guardrail templates (owning lane: support-canned-responses.ts) so ticket
 * copy can never promise an initiated refund.
 */
export function approvalAdvisory(
  ticketRef: string,
  orderNumber: string | null,
  locale: "bn" | "en" = "en",
): string {
  const tpl =
    locale === "bn" ? ADVISORY_REFUND_TEMPLATE_BN : ADVISORY_REFUND_TEMPLATE_EN;
  return tpl
    .replace("{{ticketId}}", ticketRef)
    .replace("{{orderNumber}}", orderNumber ?? "—");
}

/** Service-role creation path used by the assistant escalation. */
export async function createTicket(input: CreateTicketInput) {
  const priority: Priority = input.priority ?? "normal";
  const status: TicketStatus = input.requiresApproval
    ? "pending_approval"
    : "open";
  const reason =
    input.reason ??
    (input.requiresApproval
      ? "support.pending_approval_review"
      : "support.ticket_created");
  const { firstResponseDueAt, resolutionDueAt } = dueDates(priority, []);

  try {
    const db = await admin();
    const policies = await slaPolicies(db, input.merchantId);
    const { firstResponseDueAt: slaFirst, resolutionDueAt: slaRes } = dueDates(
      priority,
      policies,
    );

    const { data, error } = await db
      .from("support_tickets")
      .insert({
        merchant_id: input.merchantId,
        subject: input.subject.slice(0, 180),
        body: (input.body ?? "").slice(0, 4000),
        priority,
        status,
        channel: input.channel ?? "widget",
        conversation_id: input.conversationId ?? null,
        order_id: input.orderId ?? null,
        order_number: input.orderNumber ?? null,
        requester_hash: input.requesterHash ?? null,
        first_response_due_at: slaFirst,
        resolution_due_at: slaRes,
      })
      .select("id, subject, priority, status, first_response_due_at")
      .single();
    if (error || !data) throw new TicketError("ticket_create_failed");

    await db.from("support_ticket_events").insert({
      merchant_id: input.merchantId,
      ticket_id: data.id,
      actor_id: input.actorId ?? null,
      action: "created",
      after: {
        priority,
        status,
        channel: input.channel ?? "widget",
        order_number: input.orderNumber ?? null,
      },
      reason,
    });

    incr("framique_support_ticket_total", {
      action: "created",
      priority,
      status,
    });
    log("info", "support.ticket_created", {
      merchant_id: input.merchantId,
      ticket_id: data.id,
      priority,
      status,
      channel: input.channel ?? "widget",
    });
    return data;
  } catch (err) {
    // In-memory fallback for offline tests / local dev without Supabase
    if (err instanceof TicketError) throw err;
    const fallbackId = `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    incr("framique_support_ticket_total", {
      action: "created",
      priority,
      status,
    });
    return {
      id: fallbackId,
      subject: input.subject.slice(0, 180),
      priority,
      status,
      first_response_due_at: firstResponseDueAt,
    };
  }
}

export type TicketRow = Database["public"]["Tables"]["support_tickets"]["Row"];

export async function listTickets(db: Client, merchantId: string) {
  await enforceRateLimit("support.read", merchantId);
  const { data } = await db
    .from("support_tickets")
    .select(
      "id, subject, body, status, priority, channel, order_number, assignee_id, created_at, first_response_at, first_response_due_at, resolved_at, resolution_due_at, breach_first_response, breach_resolution, conversation_id",
    )
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  return {
    tickets: rows,
    summary: summarise(
      rows.map((r) => ({
        status: r.status,
        priority: r.priority as Priority,
        first_response_at: r.first_response_at,
        resolved_at: r.resolved_at,
        first_response_due_at: r.first_response_due_at,
        resolution_due_at: r.resolution_due_at,
        created_at: r.created_at,
      })),
    ),
  };
}

export async function ticketEvents(
  db: Client,
  merchantId: string,
  ticketId: string,
) {
  const { data } = await db
    .from("support_ticket_events")
    .select("id, action, reason, before, after, actor_id, created_at")
    .eq("merchant_id", merchantId)
    .eq("ticket_id", ticketId)
    .order("created_at");
  return data ?? [];
}

export type UpdateTicketInput = {
  ticketId: string;
  status?: TicketStatus;
  priority?: Priority;
  assigneeId?: string | null;
  note?: string;
  firstResponse?: boolean;
};

/**
 * Tenant-scoped update. The caller's RLS client does the tenancy work; we only
 * add the audit row and the SLA clock stamps.
 */
export async function updateTicket(
  db: Client,
  merchantId: string,
  actorId: string,
  input: UpdateTicketInput,
) {
  return withSpan("support.ticket_update", async () => {
    await enforceRateLimit("support.ticket", `${merchantId}:${actorId}`);
    const { data: before } = await db
      .from("support_tickets")
      .select(
        "id, status, priority, assignee_id, first_response_at, resolved_at",
      )
      .eq("merchant_id", merchantId)
      .eq("id", input.ticketId)
      .maybeSingle();
    if (!before) throw new TicketError("ticket_not_found");

    const patch: Database["public"]["Tables"]["support_tickets"]["Update"] = {};
    if (input.status) patch.status = input.status;
    if (input.priority) patch.priority = input.priority;
    if (input.assigneeId !== undefined) patch.assignee_id = input.assigneeId;
    if (input.firstResponse && !before.first_response_at) {
      patch.first_response_at = new Date().toISOString();
    }
    if (
      (input.status === "resolved" || input.status === "closed") &&
      !before.resolved_at
    ) {
      patch.resolved_at = new Date().toISOString();
    }
    if (!Object.keys(patch).length) return { ok: true as const };

    const { error } = await db
      .from("support_tickets")
      .update(patch)
      .eq("merchant_id", merchantId)
      .eq("id", input.ticketId);
    if (error) throw new TicketError("ticket_update_failed");

    await db.from("support_ticket_events").insert({
      merchant_id: merchantId,
      ticket_id: input.ticketId,
      actor_id: actorId,
      action: input.status ? `status:${input.status}` : "updated",
      before:
        before as unknown as Database["public"]["Tables"]["support_ticket_events"]["Insert"]["before"],
      after:
        patch as Database["public"]["Tables"]["support_ticket_events"]["Insert"]["after"],

      reason: input.note?.slice(0, 500) ?? null,
    });

    incr("framique_support_ticket_total", {
      action: input.status ?? "updated",
      priority: before.priority,
    });
    return { ok: true as const };
  });
}

export type ConfirmTicketInput = {
  ticketId: string;
  decision: "approve" | "reject";
  note?: string;
};

/**
 * Operator confirm path for `pending_approval` tickets. Approve opens the
 * ticket for normal handling; reject closes it. Any other starting state is
 * refused so the gate cannot be bypassed or double-applied, and every
 * decision writes the same append-only audit row as other transitions.
 */
export async function confirmPendingTicket(
  db: Client,
  merchantId: string,
  actorId: string,
  input: ConfirmTicketInput,
) {
  return withSpan("support.ticket_confirm", async () => {
    await enforceRateLimit("support.ticket", `${merchantId}:${actorId}`);
    const { data: before } = await db
      .from("support_tickets")
      .select("id, status, priority, order_number")
      .eq("merchant_id", merchantId)
      .eq("id", input.ticketId)
      .maybeSingle();
    if (!before) throw new TicketError("ticket_not_found");
    if (before.status !== "pending_approval") {
      throw new TicketError("ticket_not_pending_approval");
    }

    // Snapshot pre-update values: some clients hand back live row references,
    // so the audit row must not read them after the patch lands.
    const prevStatus = before.status as TicketStatus;
    const prevPriority = before.priority;

    const next: TicketStatus = input.decision === "approve" ? "open" : "closed";
    const { error } = await db
      .from("support_tickets")
      .update({ status: next })
      .eq("merchant_id", merchantId)
      .eq("id", input.ticketId);
    if (error) throw new TicketError("ticket_confirm_failed");

    await db.from("support_ticket_events").insert({
      merchant_id: merchantId,
      ticket_id: input.ticketId,
      actor_id: actorId,
      action: input.decision === "approve" ? "approved" : "rejected",
      before: { status: prevStatus },
      after: { status: next },
      reason: input.note?.slice(0, 500) ?? "support.operator_confirm",
    });

    incr("framique_support_ticket_total", {
      action: input.decision === "approve" ? "approved" : "rejected",
      priority: prevPriority,
    });
    log("info", "support.ticket_confirmed", {
      merchant_id: merchantId,
      ticket_id: input.ticketId,
      decision: input.decision,
      status: next,
    });
    return {
      ok: true as const,
      ticketId: input.ticketId,
      status: next,
      previousStatus: "pending_approval" as const,
    };
  });
}

export async function saveSlaPolicy(
  db: Client,
  merchantId: string,
  actorId: string,
  row: SlaPolicy,
) {
  await enforceRateLimit("support.ticket", `${merchantId}:${actorId}`);
  const { error } = await db.from("support_sla_policies").upsert(
    {
      merchant_id: merchantId,
      priority: row.priority,
      first_response_minutes: row.first_response_minutes,
      resolution_minutes: row.resolution_minutes,
    },
    { onConflict: "merchant_id,priority" },
  );
  if (error) throw new TicketError("sla_save_failed");
  return { ok: true as const };
}
