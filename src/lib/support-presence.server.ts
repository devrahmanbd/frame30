/**
 * Support Presence & Operator Online Tracking Service.
 *
 * Tracks live operator/admin availability for tenant stores to enable
 * intelligent hand-off routing, wait vs. callback recommendations, and SLA forecasting.
 *
 * Availability Signals:
 *  1. Active desk heartbeat: Operator pinged /root/ai or admin desk within 5 minutes.
 *  2. Active takeover mode: Conversation is explicitly in 'human_takeover' mode.
 *  3. Recent operator reply: Operator sent a message within the last 15 minutes.
 */

import { log } from "./observability.server";
import { getConversationTakeoverState } from "./support-agent.server";

async function admin() {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** 5-minute sliding window for operator heartbeats */
export const OPERATOR_HEARTBEAT_TTL_MS = 5 * 60 * 1000;

/** 15-minute sliding window for recent operator message activity */
export const OPERATOR_RECENT_MSG_WINDOW_MS = 15 * 60 * 1000;

export type OperatorPresenceRecord = {
  merchantId: string;
  operatorId?: string;
  lastSeenAt: number;
};

// In-memory heartbeat cache for sub-millisecond lookups
const OPERATOR_HEARTBEATS = new Map<string, OperatorPresenceRecord>();

/**
 * Record an operator heartbeat for a merchant store.
 * Call this when an admin/operator loads or interacts with the AI / Support Desk.
 */
export function recordOperatorHeartbeat(
  merchantId: string,
  operatorId?: string,
): { ok: boolean; timestamp: string } {
  const now = Date.now();
  OPERATOR_HEARTBEATS.set(merchantId, {
    merchantId,
    operatorId,
    lastSeenAt: now,
  });

  log("info", "support.operator_heartbeat_recorded", {
    merchantId,
    operatorId: operatorId ?? "unknown",
    timestamp: new Date(now).toISOString(),
  });

  return { ok: true, timestamp: new Date(now).toISOString() };
}

/**
 * Check whether an operator / admin is currently online for a given merchant.
 */
export async function isOperatorOnline(
  merchantId: string,
  conversationId?: string | null,
): Promise<{
  isOnline: boolean;
  reason: "heartbeat" | "active_takeover" | "recent_operator_reply" | "offline";
  lastSeenAt: string | null;
}> {
  const now = Date.now();

  // 1. Check in-memory heartbeat
  const hb = OPERATOR_HEARTBEATS.get(merchantId);
  if (hb && now - hb.lastSeenAt <= OPERATOR_HEARTBEAT_TTL_MS) {
    return {
      isOnline: true,
      reason: "heartbeat",
      lastSeenAt: new Date(hb.lastSeenAt).toISOString(),
    };
  }

  // 2. Check conversation takeover state if conversationId is provided
  if (conversationId) {
    try {
      const state = await getConversationTakeoverState(
        merchantId,
        conversationId,
      );
      if (state?.takeoverMode === "human_takeover") {
        return {
          isOnline: true,
          reason: "active_takeover",
          lastSeenAt: new Date().toISOString(),
        };
      }
    } catch {
      // Non-blocking
    }

    // 3. Check recent operator message in Supabase or mock
    try {
      const db = await admin();
      const { data } = await db
        .from("ai_conversations")
        .select("last_operator_message_at")
        .eq("id", conversationId)
        .maybeSingle();

      if (data?.last_operator_message_at) {
        const lastOpMs = new Date(data.last_operator_message_at).getTime();
        if (now - lastOpMs <= OPERATOR_RECENT_MSG_WINDOW_MS) {
          return {
            isOnline: true,
            reason: "recent_operator_reply",
            lastSeenAt: data.last_operator_message_at,
          };
        }
      }
    } catch {
      // Offline fallback
    }
  }

  return {
    isOnline: false,
    reason: "offline",
    lastSeenAt: hb ? new Date(hb.lastSeenAt).toISOString() : null,
  };
}

/**
 * Retrieve operator availability summary for client storefront widgets.
 */
export async function getMerchantSupportAvailability(
  merchantId: string,
  conversationId?: string | null,
): Promise<{
  isOnline: boolean;
  channel: "live_chat" | "callback_or_email";
  statusTextEn: string;
  statusTextBn: string;
}> {
  const presence = await isOperatorOnline(merchantId, conversationId);

  if (presence.isOnline) {
    return {
      isOnline: true,
      channel: "live_chat",
      statusTextEn: "Support specialist is online • Live transfer available",
      statusTextBn: "সাপোর্ট স্পেশালিস্ট অনলাইনে আছেন • সরাসরি চ্যাট উপলব্ধ",
    };
  }

  return {
    isOnline: false,
    channel: "callback_or_email",
    statusTextEn: "Live support is away • Request a callback or email reply",
    statusTextBn:
      "সাপোর্ট প্রতিনিধি এই মুহূর্তে অফলাইনে • কলব্যাক বা ইমেইল উত্তরের অনুরোধ করুন",
  };
}

/**
 * Clear in-memory heartbeats (test utility).
 */
export function clearOperatorHeartbeatsForTest(): void {
  OPERATOR_HEARTBEATS.clear();
}

// ---------------------------------------------------------------------------
// TODO-5 — Presence-gated routing hints for the HITL approval queue.
//
// The human desk asks where a `pending_approval` ticket should go next:
// an online operator confirms it live in the desk queue; otherwise the
// ticket is held as an async task and the customer is offered a callback.
// This is a read-only hint over `isOperatorOnline` — it never changes
// heartbeat, takeover, or availability behavior.
// ---------------------------------------------------------------------------

export type ApprovalRoutingChannel = "live_queue" | "async_task";

export type ApprovalRoutingHint = {
  isOnline: boolean;
  reason: "heartbeat" | "active_takeover" | "recent_operator_reply" | "offline";
  channel: ApprovalRoutingChannel;
  lastSeenAt: string | null;
  hintEn: string;
  hintBn: string;
};

export async function getApprovalRoutingHint(
  merchantId: string,
  conversationId?: string | null,
): Promise<ApprovalRoutingHint> {
  const presence = await isOperatorOnline(merchantId, conversationId);
  if (presence.isOnline) {
    return {
      isOnline: true,
      reason: presence.reason,
      channel: "live_queue",
      lastSeenAt: presence.lastSeenAt,
      hintEn:
        "Operator online — route pending approvals to the live desk queue for immediate confirm.",
      hintBn:
        "অপারেটর অনলাইনে — মুলতুবি অনুমোদনগুলো দ্রুত নিশ্চিত করতে লাইভ ডেস্ক সারিতে পাঠান।",
    };
  }
  return {
    isOnline: false,
    reason: presence.reason,
    channel: "async_task",
    lastSeenAt: presence.lastSeenAt,
    hintEn:
      "No operator online — hold approvals as async tasks and offer the customer a callback.",
    hintBn:
      "কোনো অপারেটর অনলাইনে নেই — অনুমোদনগুলো অ্যাসিঙ্ক টাস্ক হিসেবে রাখুন এবং গ্রাহককে কলব্যাক দিন।",
  };
}
