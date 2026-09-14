import { en } from "./i18n-dict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export async function listConversations(db: Client, merchantId: string) {
  const { data } = await db
    .from("ai_conversations")
    .select("id, status, rating, phone_hash, order_number, first_message_at, last_message_at")
    .eq("merchant_id", merchantId)
    .order("last_message_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function listMessages(db: Client, merchantId: string, conversationId: string) {
  const { data } = await db
    .from("ai_messages")
    .select("id, role, body, flagged, created_at")
    .eq("merchant_id", merchantId)
    .eq("conversation_id", conversationId)
    .order("created_at");
  return data ?? [];
}

export type SupportStats = {
  total: number;
  lastHour: number;
  needsAgent: number;
  resolved: number;
  ratingAvg: number | null;
  ratingCount: number;
};

export function computeStats(
  rows: Array<{ status: string; rating: number | null; last_message_at: string }>,
): SupportStats {
  const hourAgo = Date.now() - 3_600_000;
  const rated = rows.filter((r) => r.rating != null).map((r) => r.rating as number);
  return {
    total: rows.length,
    lastHour: rows.filter((r) => new Date(r.last_message_at).getTime() >= hourAgo).length,
    needsAgent: rows.filter((r) => r.status === "needs_agent").length,
    resolved: rows.filter((r) => r.status === "resolved" || r.status === "closed").length,
    ratingAvg: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
    ratingCount: rated.length,
  };
}

export async function agentReply(
  db: Client,
  merchantId: string,
  conversationId: string,
  body: string,
) {
  const { error } = await db
    .from("ai_messages")
    .insert({ merchant_id: merchantId, conversation_id: conversationId, role: "agent", body });
  if (error) throw new Error("reply_failed");
  await db
    .from("ai_conversations")
    .update({ status: "open", last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("merchant_id", merchantId);
  return { ok: true } as const;
}

export async function setConversationStatus(
  db: Client,
  merchantId: string,
  conversationId: string,
  status: "open" | "needs_agent" | "resolved" | "closed",
) {
  const { error } = await db
    .from("ai_conversations")
    .update({ status })
    .eq("id", conversationId)
    .eq("merchant_id", merchantId);
  if (error) throw new Error("status_failed");
  return { ok: true, status } as const;
}

export const SUGGESTIONS: Array<{ intent: string; label: string; body: string }> = [
  {
    intent: "order_status",
    label: en("support.suggestion.order_status.label"),
    body: en("support.suggestion.order_status.body"),
  },
  {
    intent: "refund",
    label: en("support.suggestion.refund.label"),
    body: en("support.suggestion.refund.body"),
  },
  {
    intent: "faq_shipping",
    label: en("support.suggestion.faq_shipping.label"),
    body: en("support.suggestion.faq_shipping.body"),
  },
  {
    intent: "other",
    label: en("support.suggestion.other.label"),
    body: en("support.suggestion.other.body"),
  },
];
