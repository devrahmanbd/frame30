import { en } from "./i18n-dict";
import { fmtMinor } from "./money";

export type Provenance = { label: string; table: string } | null;
export type AskResult = {
  conversationId: string;
  reply: string;
  provenance: Provenance;
  needsAgent: boolean;
  cta: "none" | "ticket";
};

export class SupportError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function hashPhone(phone: string) {
  const bytes = new TextEncoder().encode(`framique:${phone.replace(/\D/g, "")}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••••${digits.slice(-4)}`;
}

export type Intent =
  | "order_status"
  | "refund"
  | "faq_shipping"
  | "faq_hours"
  | "product"
  | "create_ticket"
  | "request_callback"
  | "other";

/**
 * Keyword-intent patterns (in order of specificity — first match wins).
 *
 * create_ticket & request_callback are checked BEFORE generic patterns so that
 * explicit escalation requests are never reclassified as refunds or faq_shipping.
 */
const PATTERNS: Array<[Intent, RegExp]> = [
  // Explicit ticket / escalation intent (English + Bangla)
  // Checked FIRST — most specific, prevents reclassification as other intents
  [
    "create_ticket",
    /open.*ticket|create.*ticket|submit.*ticket|file.*ticket|ticket.*open|start.*ticket|escalate|টিকিট.*খুলুন|টিকিট.*তৈরি|সাপোর্ট.*টিকিট|contact.*support|reach.*support|speak.*(?:to|with)?.*agent|talk.*(?:to|with)?.*agent|talk.*to.*(?:real|human)|human.*support|speak.*human|মানুষের.*সাথে|এজেন্টের.*সাথে|এজেন্ট|real.*person|talk.*person/i,
  ],
  // Explicit callback / phone call intent (English + Bangla)
  [
    "request_callback",
    /call.*me|call.*back|phone.*call|ring.*me|কল.*করুন|কলব্যাক|ফোন.*করুন|আমাকে.*ফোন|কল.*দিন|callback|call back/i,
  ],
  // Refund BEFORE order_status: "I want a refund for order 1001" must hit refund,
  // not order_status.
  ["refund", /(refund|রিফান্ড|return|ফেরত|exchange|বদল)/i],
  ["order_status", /(order|অর্ডার|status|অবস্থা|track|ট্র্যাক|কোথায়)/i],
  ["faq_shipping", /(ship|ডেলিভারি|delivery|কুরিয়ার|charge|চার্জ)/i],
  ["faq_hours", /(hour|সময়|খোলা|location|ঠিকানা|address|ফোন|contact|যোগাযোগ)/i],
  ["product", /(size|সাইজ|stock|স্টক|available|আছে কি|দাম|price)/i],
];

export function detectIntent(text: string): Intent {
  for (const [intent, re] of PATTERNS) if (re.test(text)) return intent;
  return "other";
}

export async function merchantBySlug(slug: string) {
  const db = await admin();
  const { data } = await db
    .from("merchants")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) throw new SupportError("no_merchant", "support.store_not_found");
  return { id: data.id, name: data.name, slug: data.slug };
}

export async function lookupOrder(merchantId: string, orderNumber: string, phone: string) {
  const db = await admin();
  const digits = phone.replace(/\D/g, "").slice(-9);
  const { data } = await db
    .from("orders")
    .select(
      "id, order_number, status, payment_method, currency_code, total_minor_int, customer_phone, created_at",
    )
    .eq("merchant_id", merchantId)
    .eq("order_number", orderNumber.trim().toUpperCase())
    .maybeSingle();
  if (!data) return null;
  if (!data.customer_phone.replace(/\D/g, "").endsWith(digits)) return null;
  return data;
}

const statusLabel = (status: string) => en(`order.status.${status}`);

export function orderAnswer(order: {
  order_number: string;
  status: string;
  total_minor_int: number;
  currency_code: string;
}) {
  const status = statusLabel(order.status);
  const total = fmtMinor(order.total_minor_int, order.currency_code);
  return en("support.order_answer", { number: order.order_number, status, total });
}

export const FAQ: Record<Exclude<Intent, "order_status" | "create_ticket" | "request_callback">, string> = {
  refund: en("support.faq.refund"),
  faq_shipping: en("support.faq.shipping"),
  faq_hours: en("support.faq.hours"),
  product: en("support.faq.product"),
  other: en("support.faq.other"),
};

export async function startConversation(merchantId: string, phone: string | null) {
  const db = await admin();
  const { data, error } = await db
    .from("ai_conversations")
    .insert({ merchant_id: merchantId, channel: "widget", phone_hash: phone ? await hashPhone(phone) : null })
    .select("id")
    .single();
  if (error) throw new SupportError("conversation_failed", "support.chat_failed");
  return data.id;
}

export async function appendMessage(
  merchantId: string,
  conversationId: string,
  role: "customer" | "bot" | "agent",
  body: string,
) {
  const db = await admin();
  await db
    .from("ai_messages")
    .insert({ merchant_id: merchantId, conversation_id: conversationId, role, body });
  await db
    .from("ai_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("merchant_id", merchantId);
}

export async function escalate(merchantId: string, conversationId: string, orderNumber?: string) {
  const db = await admin();
  await db
    .from("ai_conversations")
    .update({ status: "needs_agent", order_number: orderNumber ?? null })
    .eq("id", conversationId)
    .eq("merchant_id", merchantId);
  return { ok: true } as const;
}

type AskInput = {
  slug: string;
  message: string;
  conversationId?: string | null;
  orderNumber?: string | null;
  phone?: string | null;
};

export async function handleAsk(input: AskInput): Promise<AskResult> {
  const merchant = await merchantBySlug(input.slug);
  const conversationId =
    input.conversationId ?? (await startConversation(merchant.id, input.phone ?? null));
  await appendMessage(merchant.id, conversationId, "customer", input.message.slice(0, 500));

  const intent = detectIntent(input.message);
  const result = await resolveIntent(merchant.id, intent, input);
  await appendMessage(merchant.id, conversationId, "bot", result.reply);
  if (result.needsAgent) await escalate(merchant.id, conversationId, input.orderNumber ?? undefined);
  return { ...result, conversationId };
}

async function resolveIntent(
  merchantId: string,
  intent: Intent,
  input: AskInput,
): Promise<Omit<AskResult, "conversationId">> {
  if (intent !== "order_status") {
    const reply = FAQ[intent];
    const needsAgent = intent === "other" || intent === "refund";
    return { reply, provenance: null, needsAgent, cta: needsAgent ? "ticket" : "none" };
  }
  if (!input.orderNumber || !input.phone)
    return {
      reply: en("support.ask_order_details"),
      provenance: null,
      needsAgent: false,
      cta: "none",
    };
  const order = await lookupOrder(merchantId, input.orderNumber, input.phone);
  if (!order)
    return {
      reply: en("support.order_not_found"),
      provenance: null,
      needsAgent: true,
      cta: "ticket",
    };
  return {
    reply: orderAnswer(order),
    provenance: { label: en("support.provenance.orders"), table: "orders" },
    needsAgent: false,
    cta: "none",
  };
}
