/**
 * Support SLA maths (pure). Deadlines are derived once at ticket creation from
 * the merchant's policy so a later policy edit never silently re-dates history.
 *
 * Extended in Phase 12.6 to provide live chat moderation SLA metrics, Time To
 * First Response (TTFR), resolution tracking, and structured audit trails.
 */

export type Priority = "low" | "normal" | "high" | "urgent";

export type SlaPolicy = {
  priority: Priority;
  first_response_minutes: number;
  resolution_minutes: number;
};

export const DEFAULT_SLA: Record<Priority, { first: number; resolution: number }> = {
  urgent: { first: 15, resolution: 240 },
  high: { first: 30, resolution: 480 },
  normal: { first: 60, resolution: 1440 },
  low: { first: 240, resolution: 4320 },
};

export function policyFor(priority: Priority, rows: SlaPolicy[]): { first: number; resolution: number } {
  const row = rows.find((r) => r.priority === priority);
  if (!row) return DEFAULT_SLA[priority];
  return { first: row.first_response_minutes, resolution: row.resolution_minutes };
}

export function dueDates(priority: Priority, rows: SlaPolicy[], from = new Date()) {
  const { first, resolution } = policyFor(priority, rows);
  return {
    firstResponseDueAt: new Date(from.getTime() + first * 60_000).toISOString(),
    resolutionDueAt: new Date(from.getTime() + resolution * 60_000).toISOString(),
  };
}

export type TicketLike = {
  status: string;
  priority: Priority;
  first_response_at: string | null;
  resolved_at: string | null;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  created_at: string;
};

export type SlaState = "met" | "at_risk" | "breached" | "closed";

/** At risk = inside the final 20% of the window with no response yet. */
export function slaState(t: TicketLike, now = Date.now()): SlaState {
  if (t.status === "resolved" || t.status === "closed") return "closed";
  const deadline = t.first_response_at ? t.resolution_due_at : t.first_response_due_at;
  const done = t.first_response_at ? t.resolved_at : t.first_response_at;
  if (done) return "met";
  if (!deadline) return "met";
  const due = new Date(deadline).getTime();
  if (now > due) return "breached";
  const started = new Date(t.created_at).getTime();
  const window = Math.max(due - started, 1);
  return (due - now) / window <= 0.2 ? "at_risk" : "met";
}

export type SlaSummary = {
  open: number;
  breached: number;
  atRisk: number;
  firstResponseP50Minutes: number | null;
  resolutionP50Minutes: number | null;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : (((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

export function summarise(tickets: TicketLike[], now = Date.now()): SlaSummary {
  const minutes = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
  return {
    open: tickets.filter((t) => t.status === "open" || t.status === "pending").length,
    breached: tickets.filter((t) => slaState(t, now) === "breached").length,
    atRisk: tickets.filter((t) => slaState(t, now) === "at_risk").length,
    firstResponseP50Minutes: median(
      tickets.filter((t) => t.first_response_at).map((t) => minutes(t.created_at, t.first_response_at as string)),
    ),
    resolutionP50Minutes: median(
      tickets.filter((t) => t.resolved_at).map((t) => minutes(t.created_at, t.resolved_at as string)),
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12.6 — Live Moderation Chat SLA & Audit Engine
// ─────────────────────────────────────────────────────────────────────────────

export type SlaThresholds = {
  firstResponseMaxMinutes: number;
  resolutionMaxHours: number;
};

export const SLA_TIERS: Record<string, SlaThresholds> = {
  urgent: { firstResponseMaxMinutes: 15, resolutionMaxHours: 2 },
  high: { firstResponseMaxMinutes: 30, resolutionMaxHours: 4 },
  normal: { firstResponseMaxMinutes: 60, resolutionMaxHours: 24 },
  low: { firstResponseMaxMinutes: 120, resolutionMaxHours: 48 },
};

export type SlaStatus = "met" | "at_risk" | "breached" | "pending";

export type SlaMetrics = {
  priority: string;
  firstResponseMs: number | null;
  firstResponseMinutes: number | null;
  firstResponseBreached: boolean;
  resolutionMs: number | null;
  resolutionHours: number | null;
  resolutionBreached: boolean;
  slaStatus: SlaStatus;
  formattedTtfr: string;
  formattedResolutionTime: string;
};

export type AuditEvent = {
  id: string;
  type:
    | "created"
    | "customer_message"
    | "ai_reply"
    | "human_takeover_started"
    | "human_takeover_released"
    | "operator_message"
    | "internal_note"
    | "priority_changed"
    | "status_changed"
    | "resolved"
    | "closed";
  actor: "customer" | "bot" | "operator" | "system";
  actorId?: string | null;
  description: string;
  descriptionBn: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

/**
 * Format milliseconds into human-readable compact duration (e.g. "4m", "1h 15m", "2d").
 */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * Compute SLA metrics for a live support conversation.
 */
export function computeSlaMetrics(input: {
  priority?: string | null;
  createdAt: string;
  lastCustomerMessageAt?: string | null;
  lastOperatorMessageAt?: string | null;
  resolvedAt?: string | null;
  status?: string | null;
  now?: number; // Optional for deterministic tests
}): SlaMetrics {
  const priority = input.priority ?? "normal";
  const thresholds = SLA_TIERS[priority] ?? SLA_TIERS.normal;
  const now = input.now ?? Date.now();

  const createdTime = new Date(input.createdAt).getTime();
  const operatorTime = input.lastOperatorMessageAt
    ? new Date(input.lastOperatorMessageAt).getTime()
    : null;
  const resolvedTime = input.resolvedAt
    ? new Date(input.resolvedAt).getTime()
    : null;

  // First response calculation
  let firstResponseMs: number | null = null;
  let firstResponseMinutes: number | null = null;
  let firstResponseBreached = false;

  if (operatorTime && operatorTime >= createdTime) {
    firstResponseMs = operatorTime - createdTime;
    firstResponseMinutes = Math.round(firstResponseMs / 60000);
    firstResponseBreached = firstResponseMinutes > thresholds.firstResponseMaxMinutes;
  } else if (!operatorTime) {
    const elapsedMinutes = (now - createdTime) / 60000;
    firstResponseBreached = elapsedMinutes > thresholds.firstResponseMaxMinutes;
  }

  // Resolution time calculation
  let resolutionMs: number | null = null;
  let resolutionHours: number | null = null;
  let resolutionBreached = false;

  if (resolvedTime && resolvedTime >= createdTime) {
    resolutionMs = resolvedTime - createdTime;
    resolutionHours = Number((resolutionMs / 3600000).toFixed(1));
    resolutionBreached = resolutionHours > thresholds.resolutionMaxHours;
  } else if (input.status !== "resolved" && input.status !== "closed") {
    const elapsedHours = (now - createdTime) / 3600000;
    resolutionBreached = elapsedHours > thresholds.resolutionMaxHours;
  }

  // Determine overall SLA status
  let slaStatus: SlaStatus = "met";
  if (firstResponseBreached || resolutionBreached) {
    slaStatus = "breached";
  } else if (!operatorTime) {
    // Waiting for initial response
    const elapsedMinutes = (now - createdTime) / 60000;
    if (elapsedMinutes > thresholds.firstResponseMaxMinutes * 0.7) {
      slaStatus = "at_risk";
    } else {
      slaStatus = "pending";
    }
  } else if (!resolvedTime && input.status !== "resolved" && input.status !== "closed") {
    // Operator responded within target; check if resolution is at risk
    const elapsedHours = (now - createdTime) / 3600000;
    if (elapsedHours > thresholds.resolutionMaxHours * 0.75) {
      slaStatus = "at_risk";
    } else {
      slaStatus = "met";
    }
  } else {
    slaStatus = "met";
  }

  return {
    priority,
    firstResponseMs,
    firstResponseMinutes,
    firstResponseBreached,
    resolutionMs,
    resolutionHours,
    resolutionBreached,
    slaStatus,
    formattedTtfr: formatDuration(firstResponseMs),
    formattedResolutionTime: formatDuration(resolutionMs),
  };
}

/**
 * Generate a sorted audit trail for a conversation from raw conversation data & messages.
 */
export function buildAuditTrail(
  conversation: {
    id: string;
    createdAt?: string;
    created_at?: string;
    resolvedAt?: string | null;
    resolved_at?: string | null;
    status: string;
    takeoverMode?: string | null;
    takeover_mode?: string | null;
    priority?: string | null;
    assignedOperatorId?: string | null;
  },
  messages: Array<{
    id: string;
    role: string;
    body: string;
    createdAt?: string;
    created_at?: string;
    isInternalNote?: boolean;
    is_internal_note?: boolean;
    sentByOperatorId?: string | null;
    sent_by_operator_id?: string | null;
  }> = [],
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const convCreatedAt = conversation.createdAt ?? conversation.created_at ?? new Date().toISOString();
  const convResolvedAt = conversation.resolvedAt ?? conversation.resolved_at;

  // 1. Creation event
  events.push({
    id: `audit_created_${conversation.id}`,
    type: "created",
    actor: "system",
    description: "Conversation opened by customer",
    descriptionBn: "গ্রাহক দ্বারা চ্যাট সেশন শুরু হয়েছে",
    timestamp: convCreatedAt,
  });

  // 2. Message events
  for (const m of messages) {
    const msgCreatedAt = m.createdAt ?? m.created_at ?? new Date().toISOString();
    const isInternal = Boolean(m.isInternalNote ?? m.is_internal_note);
    const opId = m.sentByOperatorId ?? m.sent_by_operator_id ?? null;

    if (isInternal) {
      events.push({
        id: `audit_note_${m.id}`,
        type: "internal_note",
        actor: "operator",
        actorId: opId,
        description: `Internal staff note added (${m.body.slice(0, 40)}...)`,
        descriptionBn: `অভ্যন্তরীণ নোট যুক্ত করা হয়েছে (${m.body.slice(0, 40)}...)`,
        timestamp: msgCreatedAt,
      });
    } else if (m.role === "agent") {
      events.push({
        id: `audit_op_${m.id}`,
        type: "operator_message",
        actor: "operator",
        actorId: opId,
        description: "Human operator sent reply",
        descriptionBn: "অপারেটর বার্তা পাঠিয়েছেন",
        timestamp: msgCreatedAt,
      });
    } else if (m.role === "bot") {
      events.push({
        id: `audit_bot_${m.id}`,
        type: "ai_reply",
        actor: "bot",
        description: "AI assistant drafted reply",
        descriptionBn: "এআই সহকারী উত্তর প্রদান করেছে",
        timestamp: msgCreatedAt,
      });
    } else {
      events.push({
        id: `audit_cust_${m.id}`,
        type: "customer_message",
        actor: "customer",
        description: "Customer sent message",
        descriptionBn: "গ্রাহক বার্তা পাঠিয়েছেন",
        timestamp: msgCreatedAt,
      });
    }
  }

  // 3. Resolution event
  if (convResolvedAt) {
    events.push({
      id: `audit_resolved_${conversation.id}`,
      type: "resolved",
      actor: "operator",
      actorId: conversation.assignedOperatorId ?? null,
      description: "Conversation resolved and closed",
      descriptionBn: "চ্যাটটি সফলভাবে সম্পন্ন ও বন্ধ করা হয়েছে",
      timestamp: convResolvedAt,
    });
  }

  return events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}
