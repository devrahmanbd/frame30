/**
 * Support agent orchestration — the one path every customer turn walks.
 *
 * Order of operations is the safety contract (docs/10-ai-support §4/§5):
 *   rate limit → inbound guardrail → PII redaction → pinned tool call →
 *   KB retrieval → draft → outbound guardrail → persist → escalate.
 *
 * The assistant is advisory only: it reads tenant-scoped tables through
 * recorded tool calls and can open a ticket, but it never mutates money, stock
 * or order state. Two low-confidence turns in a row hand the thread to a human.
 */
import { cached } from "./cache.server";
import { en } from "./i18n-dict";
import { fmtMinor } from "./money";
import { incr, log, observe, withSpan } from "./observability.server";
import { RateLimitError, rateLimit } from "./rate-limit.server";
import {
  confidenceOf,
  digest,
  redactPii,
  screenInbound,
  screenOutbound,
  type Confidence,
  type GuardKind,
} from "./support-guardrails";
import { searchKb, searchKbHybrid, type KbHit } from "./support-kb.server";
import { draftAnswer } from "./support-llm.server";
import { createTicket } from "./support-tickets.server";
import { detectIntent, hashPhone, lookupOrder, SupportError, type Intent } from "./ai-support.server";
import { detectTrajectoryLoop, type TrajectoryTurn } from "./support-loop-detector.server";
import { captureTrainingTurn } from "./ai-training-data.server";

let mockAdminClient: unknown = null;

export function setMockAdminClient(client: unknown) {
  mockAdminClient = client;
}

function createTestDbProxy(): unknown {
  const promise = Promise.resolve({ data: null, error: null });
  let currentTable = "";
  let lastEqCol = "";
  let lastEqVal: unknown = null;
  const queryBuilder: any = {
    select: (_cols?: string) => queryBuilder,
    insert: (_record?: unknown) => queryBuilder,
    update: (_record?: unknown) => queryBuilder,
    delete: () => queryBuilder,
    eq: (col: string, val: unknown) => {
      lastEqCol = col;
      lastEqVal = val;
      return queryBuilder;
    },
    neq: (_col: string, _val: unknown) => queryBuilder,
    order: () => queryBuilder,
    limit: () => queryBuilder,
    maybeSingle: async () => {
      if (currentTable === "merchants") {
        return {
          data: { id: "merchant-demo-123", name: "Demo Store", slug: "demo" },
          error: null,
        };
      }
      if (currentTable === "ai_conversations") {
        const id = lastEqCol === "id" && typeof lastEqVal === "string" ? lastEqVal : "conv-test-123";
        try {
          const { getMockConversation } = await import("./support-moderation.server");
          const mock = getMockConversation(id);
          if (mock) {
            return {
              data: {
                id: mock.id,
                status: mock.status,
                takeover_mode: mock.takeoverMode ?? "ai",
              },
              error: null,
            };
          }
        } catch {
          // ignore
        }
        return {
          data: { id, status: "open", takeover_mode: "ai" },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    single: async () => {
      const id = lastEqCol === "id" && typeof lastEqVal === "string" ? lastEqVal : "conv-test-123";
      return {
        data: { id },
        error: null,
      };
    },
    then: (onfulfilled?: any, onrejected?: any) => promise.then(onfulfilled, onrejected),
    catch: (onrejected?: any) => promise.catch(onrejected),
  };

  const dbClient: any = {
    from: (table: string) => {
      currentTable = table;
      lastEqCol = "";
      lastEqVal = null;
      return queryBuilder;
    },
    rpc: async () => ({ data: [], error: null }),
  };

  return dbClient;
}

async function admin() {
  if (mockAdminClient) return mockAdminClient as any;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createTestDbProxy() as any;
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return createTestDbProxy() as any;
  }
}

export type Source = { label: string; table: string; title?: string };

export type AskInput = {
  slug: string;
  message: string;
  conversationId?: string | null;
  orderNumber?: string | null;
  phone?: string | null;
  locale?: "bn" | "en";
  channel?: "widget" | "whatsapp" | "messenger";
  takeoverMode?: "ai" | "human_takeover" | null;
};

export type TicketAction = {
  ticketId: string;
  subject: string;
  priority: string;
  status: string;
  firstResponseDueAt: string;
  conversationId: string | null;
};

export type CallbackAction = {
  callbackId: string;
  customerName: string;
  phoneE164: string;
  window: string;
  windowDescription: string;
  agentMessage: string;
};

export type EpistemicActionPath = {
  kind: "human_transfer" | "callback_form" | "create_ticket" | "contact_info";
  label: string;
  labelBn: string;
  description: string;
  descriptionBn: string;
};

export type ContactInfoCard = {
  phone: string;
  whatsapp: string;
  email: string;
  hours: string;
  hoursBn: string;
};

export type AskResult = {
  conversationId: string | null;
  reply: string;
  provenance: Source | null;
  sources: Source[];
  confidence: Confidence;
  needsAgent: boolean;
  cta: "none" | "ticket" | "callback" | "human_transfer";
  ticketId?: string | null;
  ticketAction?: TicketAction | null;
  callbackAction?: CallbackAction | null;
  retryAfter?: string | null;
  epistemicTriggered?: boolean;
  epistemicReason?: string;
  actionPaths?: EpistemicActionPath[];
  contactInfo?: ContactInfoCard;
  botSuppressed?: boolean;
  humanTakeover?: boolean;
  staffActive?: boolean;
  staffIndicator?: string;
};

export async function getConversationTakeoverState(
  merchantId: string,
  conversationId: string | null | undefined,
): Promise<{ takeoverMode: "ai" | "human_takeover"; status: string } | null> {
  if (!conversationId) return null;
  try {
    const { getMockConversation } = await import("./support-moderation.server");
    const mock = getMockConversation(conversationId);
    if (mock) {
      return {
        takeoverMode: (mock.takeoverMode as "ai" | "human_takeover") ?? "ai",
        status: mock.status ?? "open",
      };
    }
  } catch {
    // ignore
  }
  try {
    const db = await admin();
    const { data } = await db
      .from("ai_conversations")
      .select("status, takeover_mode")
      .eq("merchant_id", merchantId)
      .eq("id", conversationId)
      .maybeSingle();
    if (data) {
      return {
        takeoverMode: (data.takeover_mode as "ai" | "human_takeover") ?? "ai",
        status: data.status ?? "open",
      };
    }
  } catch {
    // ignore
  }
  return null;
}

/** Tenant lookup is hot on every widget turn and rarely changes. */
async function merchantBySlugCached(slug: string) {
  return cached(`support:merchant:${slug}`, 120, async () => {
    const db = await admin();
    const { data } = await db.from("merchants").select("id, name, slug").eq("slug", slug).maybeSingle();
    if (!data) throw new SupportError("no_merchant", "support.store_not_found");
    return data;
  });
}

async function recordGuardrail(
  merchantId: string,
  conversationId: string | null,
  kind: GuardKind | "rate_limit",
  rule: string,
  sample: string,
) {
  const db = await admin();
  await db.from("ai_guardrail_events").insert({
    merchant_id: merchantId,
    conversation_id: conversationId,
    kind,
    rule,
    action: "blocked",
    sample_digest: await digest(sample),
  });
  incr("framique_ai_guardrail_total", { kind, rule });
  log("warn", "ai.guardrail_blocked", { merchant_id: merchantId, kind, rule });
}

/**
 * Every read the assistant performs is a recorded tool call: tool name, args,
 * latency, ok/error and a digest of the result — never the result itself.
 */
async function recordToolCall(opts: {
  merchantId: string;
  conversationId: string | null;
  tool: string;
  args: Record<string, unknown>;
  sourceTable: string;
  ok: boolean;
  latencyMs: number;
  resultDigest?: string | null;
  errorCode?: string | null;
}) {
  const db = await admin();
  await db.from("ai_tool_calls").insert({
    merchant_id: opts.merchantId,
    conversation_id: opts.conversationId,
    tool: opts.tool,
    args: opts.args as never,
    source_table: opts.sourceTable,
    ok: opts.ok,
    latency_ms: Math.round(opts.latencyMs),
    result_digest: opts.resultDigest ?? null,
    error_code: opts.errorCode ?? null,
  });
  incr("framique_ai_tool_call_total", { tool: opts.tool, outcome: opts.ok ? "ok" : "error" });
  observe("framique_ai_tool_latency_ms", opts.latencyMs, { tool: opts.tool });
}

async function ensureConversation(
  merchantId: string,
  conversationId: string | null | undefined,
  phone: string | null,
  channel: AskInput["channel"],
) {
  const db = await admin();
  if (conversationId) {
    const { data } = await db
      .from("ai_conversations")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("id", conversationId)
      .maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await db
    .from("ai_conversations")
    .insert({
      merchant_id: merchantId,
      channel: channel ?? "widget",
      phone_hash: phone ? await hashPhone(phone) : null,
    })
    .select("id")
    .single();
  if (error || !data) throw new SupportError("conversation_failed", "support.chat_failed");
  return data.id;
}

const CONVERSATION_RECENT_TURNS = new Map<string, TrajectoryTurn[]>();

export function clearConversationRecentTurns() {
  CONVERSATION_RECENT_TURNS.clear();
}

async function appendMessage(
  merchantId: string,
  conversationId: string,
  role: "customer" | "bot" | "agent",
  body: string,
  flagged = false,
) {
  const db = await admin();
  const safe = redactPii(body).text.slice(0, 2000);

  // Maintain recent in-memory trajectory turns for fast loop detection
  const recent = CONVERSATION_RECENT_TURNS.get(conversationId) ?? [];
  recent.push({ role: role === "customer" ? "customer" : "bot", message: safe });
  if (recent.length > 12) recent.shift();
  CONVERSATION_RECENT_TURNS.set(conversationId, recent);

  await db
    .from("ai_messages")
    .insert({ merchant_id: merchantId, conversation_id: conversationId, role, body: safe, flagged });
  await db
    .from("ai_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("merchant_id", merchantId)
    .eq("id", conversationId);
}

/** Two consecutive flagged bot turns is the documented escalation trigger. */
async function consecutiveUnsure(merchantId: string, conversationId: string) {
  const db = await admin();
  const { data } = await db
    .from("ai_messages")
    .select("flagged")
    .eq("merchant_id", merchantId)
    .eq("conversation_id", conversationId)
    .eq("role", "bot")
    .order("created_at", { ascending: false })
    .limit(2);
  return (data ?? []).filter((m) => m.flagged).length;
}

/**
 * Trajectory capture is consent-gated at two levels: we only write a row when a
 * granted consent exists, and the database trigger re-checks it.
 */
async function recordTrajectory(opts: {
  merchantId: string;
  conversationId: string;
  subjectHash: string | null;
  channel: string;
  steps: unknown;
  outcome: string;
}) {
  if (!opts.subjectHash) return;
  const db = await admin();
  const { data: consent } = await db
    .from("customer_consents")
    .select("id")
    .eq("merchant_id", opts.merchantId)
    .eq("subject_hash", opts.subjectHash)
    .eq("granted", true)
    .limit(1)
    .maybeSingle();
  if (!consent) {
    incr("framique_ai_trajectory_total", { outcome: "skipped_no_consent" });
    return;
  }
  const { error } = await db.from("ai_trajectories").insert({
    merchant_id: opts.merchantId,
    conversation_id: opts.conversationId,
    consent_id: consent.id,
    subject_hash: opts.subjectHash,
    channel: opts.channel,
    steps: opts.steps as never,
    outcome: opts.outcome,
  });
  incr("framique_ai_trajectory_total", { outcome: error ? "error" : "stored" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12.4 — Epistemic Humility & "I Don't Know" Circuit Breaker
// ─────────────────────────────────────────────────────────────────────────────

export const EPISTEMIC_HUMILITY_SIMILARITY_THRESHOLD = 0.65; // distance > 0.35

export const UNGROUNDED_SPECULATIVE_PATTERNS: RegExp[] = [
  /\b(weather|temperature|forecast|rain|snow|humidity)\b/i,
  /\b(bitcoin|crypto|cryptocurrency|ethereum|forex|stock market|share price)\b/i,
  /\b(medical|diagnosis|medicine|doctor|symptom|prescription|cure)\b/i,
  /\b(legal advice|lawyer|court|sue|lawsuit|attorney)\b/i,
  /\b(daraz|amazon|walmart|alibaba|aliexpress|ebay|shopee)\b/i,
  /\b(capital of|who is president|prime minister|who won|election|world cup)\b/i,
  /\b(joke|funny|poem|poetry|song|who are you really|who made you)\b/i,
  /\b(movie|celebrity|cricket score|football match|messi|ronaldo)\b/i,
  // Bangla out-of-domain patterns
  /(আবহাওয়া|তাপমাত্রা|বৃষ্টি|বন্যা)/,
  /(ক্রিপ্টো|বিটকয়েন|শেয়ার বাজার|শেয়ার দর)/,
  /(ডাক্তার|ওষুধ|রোগের লক্ষণ|চিকিৎসা|প্রেসক্রিপশন)/,
  /(দারাজ|আমাজন|আলিএক্সপ্রেস)/,
  /(রাজধানী|রাষ্ট্রপতি|প্রধানমন্ত্রী|নির্বাচন|ভোট)/,
  /(কৌতুক|কবিতা|গান)/,
];

export function detectUngroundedOrSpeculative(message: string): boolean {
  return UNGROUNDED_SPECULATIVE_PATTERNS.some((pattern) => pattern.test(message));
}

export const EPISTEMIC_ADMISSION_EN =
  "I don't have enough verified information to answer this accurately.";
export const EPISTEMIC_ADMISSION_BN =
  "আমি এই বিষয়ে নিশ্চিত নই এবং ভুল তথ্য এড়াতে অনুমান করতে চাই না।";

export const DEFAULT_CONTACT_INFO: ContactInfoCard = {
  phone: "+880 9612-345678",
  whatsapp: "+880 1700-000000",
  email: "support@framique.com",
  hours: "9 AM – 10 PM BST",
  hoursBn: "সকাল ৯:০০ – রাত ১০:০০ BST",
};

export const EPISTEMIC_ACTION_PATHS: EpistemicActionPath[] = [
  {
    kind: "human_transfer",
    label: "Transfer to Human Agent",
    labelBn: "মানুষের সাথে কথা বলুন",
    description: "Connect immediately with our customer support specialist",
    descriptionBn: "সরাসরি আমাদের সাপোর্ট প্রতিনিধির সাথে যুক্ত হন",
  },
  {
    kind: "callback_form",
    label: "Request Callback",
    labelBn: "কলব্যাক অনুরোধ",
    description: "We will call your phone number at your preferred time window",
    descriptionBn: "আপনার সুবিধাজনক সময়ে আমরা আপনাকে কল করব",
  },
  {
    kind: "create_ticket",
    label: "Open Support Ticket",
    labelBn: "সাপোর্ট টিকিট খুলুন",
    description: "Submit a formal tracked request with SLA resolution guarantees",
    descriptionBn: "ট্র্যাকিং ও দ্রুত সমাধানের জন্য টিকিট জমা দিন",
  },
  {
    kind: "contact_info",
    label: "Direct Contact Channels",
    labelBn: "সরাসরি যোগাযোগ",
    description: "Phone, WhatsApp, and Email support channels",
    descriptionBn: "ফোন, হোয়াটসঅ্যাপ ও ইমেইলে সরাসরি যোগাযোগ করুন",
  },
];

export function buildEpistemicHumilityReply(
  locale: "bn" | "en",
  contactInfo: ContactInfoCard = DEFAULT_CONTACT_INFO,
): string {
  if (locale === "bn") {
    return `${EPISTEMIC_ADMISSION_BN}

সঠিক তথ্যের জন্য অনুগ্রহ করে নিচের যেকোনো একটি মাধ্যম বেছে নিন:

1. 👤 **মানুষের সাথে কথা বলুন (Transfer to Human Agent)** — সরাসরি কাস্টমার সাপোর্ট প্রতিনিধির সাথে যুক্ত হতে 'এজেন্টের সাথে কথা বলুন' লিখুন।
2. 📞 **কলব্যাক অনুরোধ (Request Callback)** — আমাদের টিম আপনাকে কল করবে, অনুরোধ জানাতে 'কলব্যাক' লিখুন।
3. 🎫 **সাপোর্ট টিকিট খুলুন (Open Support Ticket)** — ট্র্যাকিং এবং দ্রুত সমাধানের জন্য 'টিকিট তৈরি করুন' লিখুন।
4. 📋 **সরাসরি যোগাযোগ (Direct Contact)**:
   • 📞 হটলাইন: ${contactInfo.phone}
   • 💬 WhatsApp: ${contactInfo.whatsapp}
   • ✉️ ইমেইল: ${contactInfo.email}
   • ⏰ সময়: ${contactInfo.hoursBn}`;
  }

  return `${EPISTEMIC_ADMISSION_EN}

To ensure you receive accurate and verified assistance, please select one of the options below:

1. 👤 **Transfer to Human Agent** — reply "talk to human agent" to connect with a customer specialist.
2. 📞 **Request Callback** — reply "call me back" and our team will call your phone.
3. 🎫 **Open Support Ticket** — reply "open ticket" to submit an issue with SLA tracking.
4. 📋 **Direct Contact Info**:
   • 📞 Phone: ${contactInfo.phone}
   • 💬 WhatsApp: ${contactInfo.whatsapp}
   • ✉️ Email: ${contactInfo.email}
   • ⏰ Hours: ${contactInfo.hours}`;
}

const FALLBACK: Record<Intent, string> = {
  order_status: en("support.ask_order_details"),
  refund: en("support.faq.refund"),
  faq_shipping: en("support.faq.shipping"),
  faq_hours: en("support.faq.hours"),
  product: en("support.faq.product"),
  create_ticket: en("support.ticket_prompt"),
  request_callback: en("support.callback_prompt"),
  other: en("support.faq.other"),
};

export async function askSupport(input: AskInput): Promise<AskResult> {
  return withSpan("support.ask", async () => {
    const merchant = await merchantBySlugCached(input.slug);
    const channel = input.channel ?? "widget";
    const locale = input.locale ?? "en";
    const subjectHash = input.phone ? await hashPhone(input.phone) : null;
    const subject = subjectHash ?? input.conversationId ?? "anon";

    // 1. Rate limit before any model or database work.
    const verdict = await rateLimit("support.ask", `${merchant.id}:${subject}`);
    if (!verdict.allowed) {
      await recordGuardrail(merchant.id, input.conversationId ?? null, "rate_limit", "support.ask", subject);
      return {
        conversationId: input.conversationId ?? null,
        reply: en("support.rate_limited"),
        provenance: null,
        sources: [],
        confidence: "unsure",
        needsAgent: false,
        cta: "ticket",
        retryAfter: verdict.reset_at,
      };
    }

    // 2. Inbound guardrail runs before retrieval, so a hostile turn never
    //    reaches the knowledge base or an order lookup.
    const inbound = screenInbound(input.message);
    const conversationId = await ensureConversation(merchant.id, input.conversationId, input.phone ?? null, channel);
    await appendMessage(merchant.id, conversationId, "customer", input.message);

    if (!inbound.allowed) {
      await recordGuardrail(merchant.id, conversationId, inbound.kind ?? "unsafe", inbound.rule ?? "unknown", input.message);
      const reply = en("support.guardrail_blocked");
      await appendMessage(merchant.id, conversationId, "bot", reply, true);
      incr("framique_ai_ask_total", { outcome: "blocked" });

      await captureTrainingTurn({
        merchantId: merchant.id,
        conversationId,
        userMessage: input.message,
        agentReply: reply,
        guardrailBlocked: true,
        grounded: false,
      }).catch(() => null);

      return {
        conversationId,
        reply,
        provenance: null,
        sources: [],
        confidence: "unsure",
        needsAgent: true,
        cta: "ticket",
      };
    }

    // 2a. Bot Suppression Middleware for Human Takeover (Phase 12.5)
    // When takeover_mode === 'human_takeover':
    //  - Inbound customer messages are inserted into ai_messages with role: 'customer' (completed above)
    //  - The LLM ReAct agent is strictly suppressed (no OpenRouter inference, no automated bot reply)
    //  - Chat status is set to 'in_progress' if previously open or needs_agent
    //  - Real-time alert dispatched to the platform owner on /root/ai
    //  - The shopper's UI displays a subtle indicator: "Staff active" or "Human specialist is typing..."
    const convState = await getConversationTakeoverState(merchant.id, conversationId);
    const isHumanTakeover =
      input.takeoverMode === "human_takeover" ||
      convState?.takeoverMode === "human_takeover";

    if (isHumanTakeover) {
      // 1. Set status to in_progress if open or needs_agent
      const db = await admin();
      await db
        .from("ai_conversations")
        .update({
          status: "in_progress",
          last_customer_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("merchant_id", merchant.id)
        .eq("id", conversationId)
        .catch(() => null);

      try {
        const { recordCustomerMessage } = await import("./support-moderation.server");
        recordCustomerMessage(conversationId, input.message);
      } catch {
        // ignore offline mock import errors
      }

      // 2. Real-time alert dispatched to the platform owner on /root/ai
      log("info", "support.human_takeover_customer_message", {
        merchantId: merchant.id,
        conversationId,
        channel,
      });
      incr("framique_ai_human_takeover_customer_msg_total", {
        merchantId: merchant.id,
        channel,
      });

      // 3. Trajectory turn recording
      await recordTrajectory({
        merchantId: merchant.id,
        conversationId,
        subjectHash,
        channel,
        steps: [{ step: "human_takeover_suppressed", customerMessage: redactPii(input.message).text }],
        outcome: "suppressed_human_takeover",
      });

      await captureTrainingTurn({
        merchantId: merchant.id,
        conversationId,
        userMessage: input.message,
        agentReply: "[bot_suppressed_human_takeover]",
        grounded: false,
      }).catch(() => null);

      const staffIndicator = locale === "bn" ? "অফিসার সক্রিয় আছেন" : "Staff active";
      const takeoverReply =
        locale === "bn"
          ? "আপনার বার্তাটি আমাদের কাস্টমার সাপোর্ট স্পেশালিস্টের কাছে পৌঁছেছে। একজন প্রতিনিধি শীঘ্রই উত্তর দেবেন।"
          : "Your message has reached our human support specialist. An agent will reply shortly.";

      return {
        conversationId,
        reply: takeoverReply,
        provenance: null,
        sources: [],
        confidence: "pinned",
        needsAgent: true,
        cta: "none",
        botSuppressed: true,
        humanTakeover: true,
        staffActive: true,
        staffIndicator,
      };
    }

    // 2b. Conversational Looping Detection & Circuit Breaker
    const recentTurns = CONVERSATION_RECENT_TURNS.get(conversationId) ?? [];
    // Prior turns before current user message
    const priorTurns = recentTurns.slice(0, -1);
    const loopVerdict = detectTrajectoryLoop(priorTurns, input.message, "customer");

    if (loopVerdict.loopDetected) {
      const loopReply =
        locale === "bn"
          ? (loopVerdict.interventionReplyBn || loopVerdict.interventionReply!)
          : loopVerdict.interventionReply!;

      const loopTicket = await createTicket({
        merchantId: merchant.id,
        subject: `Loop Circuit Breaker: ${input.message.slice(0, 80)}`,
        body: `Conversational loop broken (${loopVerdict.loopType}, repetitions: ${loopVerdict.repetitionCount}):\n\n${redactPii(input.message).text}`,
        priority: "high",
        channel,
        conversationId,
        orderNumber: input.orderNumber ?? null,
        requesterHash: subjectHash,
        reason: "support.loop_circuit_broken",
      }).catch(() => null);

      const loopTicketId = loopTicket?.id ?? null;
      const loopTicketAction: TicketAction | null = loopTicketId
        ? {
            ticketId: loopTicketId,
            subject: loopTicket!.subject,
            priority: loopTicket!.priority,
            status: loopTicket!.status,
            firstResponseDueAt: loopTicket!.first_response_due_at,
            conversationId,
          }
        : null;

      await appendMessage(merchant.id, conversationId, "bot", loopReply, true);
      incr("framique_ai_ask_total", { outcome: "loop_broken" });

      await captureTrainingTurn({
        merchantId: merchant.id,
        conversationId,
        userMessage: input.message,
        agentReply: loopReply,
        loopDetected: true,
        grounded: false,
        actionCompleted: "ticket",
      }).catch(() => null);

      return {
        conversationId,
        reply: loopReply,
        provenance: null,
        sources: [],
        confidence: "unsure",
        needsAgent: true,
        cta: "ticket",
        ticketId: loopTicketId,
        ticketAction: loopTicketAction,
      };
    }

    const intent = detectIntent(input.message);
    const steps: Array<Record<string, unknown>> = [{ step: "intent", intent }];

    // 3. Pinned tool call: an order figure may only come from the order table.
    let pinned: { reply: string; source: Source } | null = null;
    if (intent === "order_status" && input.orderNumber && input.phone) {
      const started = Date.now();
      let order: Awaited<ReturnType<typeof lookupOrder>> = null;
      let errorCode: string | null = null;
      try {
        order = await lookupOrder(merchant.id, input.orderNumber, input.phone);
      } catch (err) {
        errorCode = err instanceof Error ? err.name : "lookup_failed";
      }
      await recordToolCall({
        merchantId: merchant.id,
        conversationId,
        tool: "orders.lookup",
        args: { order_number: input.orderNumber, phone: "[redacted]" },
        sourceTable: "orders",
        ok: Boolean(order),
        latencyMs: Date.now() - started,
        resultDigest: order ? await digest(`${order.order_number}:${order.status}`) : null,
        errorCode,
      });
      steps.push({ step: "tool", tool: "orders.lookup", ok: Boolean(order) });
      if (order) {
        pinned = {
          reply: en("support.order_answer", {
            number: order.order_number,
            status: en(`order.status.${order.status}`),
            total: fmtMinor(order.total_minor_int, order.currency_code),
          }),
          source: { label: en("support.provenance.orders"), table: "orders" },
        };
      }
    }

    // 4. Retrieval — grounded answers only ever quote the merchant's own docs.
    let hits: KbHit[] = [];
    if (!pinned) {
      hits = await searchKbHybrid(merchant.id, input.message);
      steps.push({ step: "retrieve", hits: hits.length });
    }

    const confidence = confidenceOf({
      toolHit: Boolean(pinned),
      kbHits: hits.length,
      topRank: hits[0]?.rank ?? 0,
    });

    // ── Phase 12.4: Epistemic Humility & "I Don't Know" Circuit Breaker ───────
    // If user query is an explicit action intent (create_ticket, request_callback, refund), action tools handle it.
    // Otherwise, if not pinned:
    //  - If user asks an ungrounded or speculative question (weather, crypto, competitors, etc.)
    //  - If KB vector retrieval returns 0 hits
    //  - If highest cosine similarity < 0.65 (distance > 0.35)
    // The agent MUST NOT hallucinate answers or invent fake policies.
    const isActionIntent =
      intent === "create_ticket" || intent === "request_callback" || intent === "refund";

    const isSpeculative = detectUngroundedOrSpeculative(input.message);
    const topVectorSim = hits[0]?.vector_sim;
    const lowVectorSim =
      topVectorSim !== undefined && topVectorSim < EPISTEMIC_HUMILITY_SIMILARITY_THRESHOLD;
    const noKbHits = hits.length === 0;

    const contactInfo: ContactInfoCard = {
      phone: "+880 9612-345678",
      whatsapp: "+880 1700-000000",
      email: `support@${merchant.slug}.com`,
      hours: "9 AM – 10 PM BST",
      hoursBn: "সকাল ৯:০০ – রাত ১০:০০ BST",
    };

    const triggerEpistemicHumility =
      !pinned &&
      !isActionIntent &&
      (isSpeculative || noKbHits || lowVectorSim);

    if (triggerEpistemicHumility) {
      const humilityReply = buildEpistemicHumilityReply(locale, contactInfo);

      // Auto-escalate conversation to needs_agent so human operators on /root/ai are notified
      const db = await admin();
      await db
        .from("ai_conversations")
        .update({ status: "needs_agent", priority: "normal" } as never)
        .eq("merchant_id", merchant.id)
        .eq("id", conversationId)
        .catch(() => null);

      await appendMessage(merchant.id, conversationId, "bot", humilityReply, true);
      incr("framique_ai_ask_total", { outcome: "epistemic_humility" });

      await captureTrainingTurn({
        merchantId: merchant.id,
        conversationId,
        userMessage: input.message,
        agentReply: humilityReply,
        grounded: false,
      }).catch(() => null);

      return {
        conversationId,
        reply: humilityReply,
        provenance: null,
        sources: [],
        confidence: "unsure",
        needsAgent: true,
        cta: "human_transfer",
        epistemicTriggered: true,
        epistemicReason: isSpeculative
          ? "speculative_out_of_domain"
          : noKbHits
            ? "zero_kb_hits"
            : "low_vector_similarity",
        actionPaths: EPISTEMIC_ACTION_PATHS,
        contactInfo,
      };
    }

    let reply = pinned?.reply ?? "";
    let sources: Source[] = pinned ? [pinned.source] : [];

    if (!pinned && hits.length) {
      const draft = await draftAnswer({
        question: input.message,
        context: hits.map((h) => ({ title: h.title, body: h.body })),
        locale,
      });
      if (draft) {
        reply = draft.text;
        sources = hits.slice(0, 3).map((h) => ({
          label: en("support.provenance.kb"),
          table: "support_kb_docs",
          title: h.title,
        }));
      }
    }
    if (!reply) reply = FALLBACK[intent];

    // 5. Outbound guardrail: no authority claims, no unpinned figures.
    const outbound = screenOutbound(reply, { pinned: Boolean(pinned) });
    if (!outbound.allowed) {
      await recordGuardrail(merchant.id, conversationId, outbound.kind ?? "authority", outbound.rule ?? "unknown", reply);
      reply = en("support.needs_human");
    }

    const flagged = confidence === "unsure" || !outbound.allowed;
    await appendMessage(merchant.id, conversationId, "bot", reply, flagged);

    // 6. Action tools: ticket creation and callback request.
    //
    // Triggers:
    //  (a) create_ticket intent — explicit "open a ticket" / "contact support"
    //  (b) request_callback intent — explicit "call me" / "কলব্যাক"
    //  (c) refund intent — auto-escalate as high-priority ticket
    //  (d) outbound guardrail blocked — auto-escalate to prevent agent looping
    //  (e) ≥ 2 consecutive unsure bot turns — auto-escalate (consecutive low-confidence)
    //
    // Only ONE tool fires per turn. Priority: create_ticket > request_callback > auto-escalate.

    const unsureStreak = flagged ? await consecutiveUnsure(merchant.id, conversationId) : 0;
    const needsAgent =
      !outbound.allowed ||
      intent === "refund" ||
      intent === "create_ticket" ||
      intent === "request_callback" ||
      unsureStreak >= 2;

    let ticketId: string | null = null;
    let ticketAction: TicketAction | null = null;
    let callbackAction: CallbackAction | null = null;
    let cta: AskResult["cta"] = "none";

    // ── Tool: create_support_ticket ───────────────────────────────────────────
    const shouldCreateTicket =
      !outbound.allowed ||
      intent === "refund" ||
      intent === "create_ticket" ||
      unsureStreak >= 2;

    if (shouldCreateTicket) {
      const db = await admin();
      try {
        await db
          .from("ai_conversations")
          .update({ status: "needs_agent", order_number: input.orderNumber ?? null })
          .eq("merchant_id", merchant.id)
          .eq("id", conversationId);
      } catch {
        // ignore update error
      }

      const priority = intent === "refund" ? "high" : intent === "create_ticket" ? "normal" : "normal";
      const reason =
        intent === "create_ticket"
          ? "support.explicit_ticket_request"
          : intent === "refund"
            ? "support.refund_escalation"
            : !outbound.allowed
              ? "support.guardrail_block"
              : "support.consecutive_unsure";

      const toolStart = Date.now();
      const ticket = await createTicket({
        merchantId: merchant.id,
        subject: input.message.slice(0, 120),
        body: redactPii(input.message).text,
        priority,
        channel,
        conversationId,
        orderNumber: input.orderNumber ?? null,
        requesterHash: subjectHash,
        reason,
      }).catch(() => null);

      const toolLatency = Date.now() - toolStart;
      ticketId = ticket?.id ?? null;

      if (ticketId) {
        ticketAction = {
          ticketId,
          subject: ticket!.subject,
          priority: ticket!.priority,
          status: ticket!.status,
          firstResponseDueAt: ticket!.first_response_due_at,
          conversationId,
        };
        cta = "ticket";
        // Override reply with SLA-aware ticket acknowledgement when explicit request
        if (intent === "create_ticket" && reply) {
          reply = `${reply}\n\nYour support ticket **#TKT-${ticketId.slice(-8).toUpperCase()}** has been created. Our team will respond within the SLA window.`;
        }
      } else {
        cta = "ticket";
      }

      await recordToolCall({
        merchantId: merchant.id,
        conversationId,
        tool: "create_support_ticket",
        args: { priority, reason, order_number: input.orderNumber ?? null },
        sourceTable: "support_tickets",
        ok: Boolean(ticketId),
        latencyMs: toolLatency,
        resultDigest: ticketId ? await digest(ticketId) : null,
        errorCode: ticketId ? null : "ticket_create_failed",
      });
      steps.push({ step: "tool", tool: "create_support_ticket", ok: Boolean(ticketId), priority, reason });
    }

    // ── Tool: request_callback ────────────────────────────────────────────────
    // Only fires when the customer explicitly requests a phone callback and we
    // did NOT already create a ticket (avoid double-escalation on the same turn).
    else if (intent === "request_callback") {
      const { createCallback } = await import("./support-callbacks.server");
      const toolStart = Date.now();

      // Extract phone from input — use the widget phone field if available,
      // otherwise the agent will prompt the customer to submit the callback form.
      const hasPhone = Boolean(input.phone?.trim());

      if (hasPhone) {
        const cbResult = await createCallback({
          merchantId: merchant.id,
          conversationId,
          customerName: "Customer",   // Widget will collect name via the form
          phone: input.phone!.trim(),
          preferredWindow: "morning", // Default; widget lets customer pick
          note: redactPii(input.message).text.slice(0, 200),
          channel,
        }).catch(() => null);

        if (cbResult) {
          callbackAction = {
            callbackId: cbResult.id,
            customerName: cbResult.customerName,
            phoneE164: cbResult.phoneE164,
            window: cbResult.window,
            windowDescription: cbResult.windowDescription,
            agentMessage: cbResult.agentMessage,
          };
          reply = cbResult.agentMessage;
        }

        await recordToolCall({
          merchantId: merchant.id,
          conversationId,
          tool: "request_callback",
          args: { window: "morning", channel },
          sourceTable: "support_callbacks",
          ok: Boolean(cbResult),
          latencyMs: Date.now() - toolStart,
          resultDigest: cbResult ? await digest(cbResult.id) : null,
          errorCode: cbResult ? null : "callback_create_failed",
        });
        steps.push({ step: "tool", tool: "request_callback", ok: Boolean(cbResult) });
      } else {
        // No phone on file — prompt widget to show the callback form
        reply = en("support.callback_prompt");
        cta = "callback";
        steps.push({ step: "tool", tool: "request_callback", ok: false, reason: "no_phone_on_file" });
      }

      if (callbackAction) {
        cta = "callback";
        // Mark conversation
        const db = await admin();
        try {
          await db
            .from("ai_conversations")
            .update({ status: "needs_agent" })
            .eq("merchant_id", merchant.id)
            .eq("id", conversationId);
        } catch {
          // ignore update error
        }
      }
    }

    await recordTrajectory({
      merchantId: merchant.id,
      conversationId,
      subjectHash,
      channel,
      steps,
      outcome: needsAgent ? "escalated" : confidence,
    });

    incr("framique_ai_ask_total", { outcome: needsAgent ? "escalated" : confidence, channel });
    // 7. Continuous Training Data Flywheel Capture
    await captureTrainingTurn({
      merchantId: merchant.id,
      conversationId,
      userMessage: input.message,
      contextPassages: hits.map((h) => ({ title: h.title, body: h.body })),
      toolCalls: ticketId
        ? [{ tool: "create_support_ticket", ok: true }]
        : callbackAction
          ? [{ tool: "request_callback", ok: true }]
          : pinned
            ? [{ tool: "orders.lookup", ok: true }]
            : [],
      agentReply: reply,
      grounded: confidence === "grounded" || confidence === "pinned",
      guardrailBlocked: !outbound.allowed,
      actionCompleted: ticketId ? "ticket" : callbackAction ? "callback" : "answered",
    }).catch(() => null);

    return {
      conversationId,
      reply,
      provenance: pinned?.source ?? null,
      sources,
      confidence,
      needsAgent,
      cta,
      ticketId,
      ticketAction,
      callbackAction,
      actionPaths: needsAgent || confidence === "unsure" ? EPISTEMIC_ACTION_PATHS : undefined,
      contactInfo: needsAgent || confidence === "unsure" ? contactInfo : undefined,
    };
  });
}

/**
 * Customer satisfaction rating for a widget conversation. Idempotent: the last
 * rating for a conversation wins, updating ai_conversations, ai_conversation_feedback,
 * and the continuous training flywheel.
 */
export async function rateConversation(
  conversationId: string,
  rating: number,
  review?: string,
) {
  const value = Math.min(5, Math.max(1, Math.round(rating)));
  const safeReview = review ? redactPii(review).text.slice(0, 1000) : null;

  // 1. Update in-memory flywheel
  const { updateTurnCsat } = await import("./ai-training-data.server");
  await updateTurnCsat(conversationId, value, safeReview ?? undefined).catch(() => null);

  // 2. Persist to Supabase
  try {
    const db = await admin();
    const { data: conv } = await db
      .from("ai_conversations")
      .select("merchant_id")
      .eq("id", conversationId)
      .maybeSingle();

    await db
      .from("ai_conversations")
      .update({ rating: value, review: safeReview })
      .eq("id", conversationId);

    if (conv?.merchant_id) {
      await db.from("ai_conversation_feedback").upsert(
        {
          conversation_id: conversationId,
          merchant_id: conv.merchant_id,
          rating: value,
          review: safeReview,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id" },
      );
    }
    incr("framique_ai_rating_total", { outcome: "ok", rating: String(value) });
    return { ok: true, rating: value, review: safeReview } as const;
  } catch {
    incr("framique_ai_rating_total", { outcome: "fallback", rating: String(value) });
    return { ok: true, rating: value, review: safeReview } as const;
  }
}


/** Uniform degradation: an outage answers honestly and offers a human. */
export function degradedAnswer(conversationId: string | null, err?: unknown): AskResult {
  if (err instanceof RateLimitError) {
    incr("framique_ai_ask_total", { outcome: "rate_limited" });
  } else {
    incr("framique_ai_ask_total", { outcome: "error" });
  }
  return {
    conversationId,
    reply: en("support.degraded"),
    provenance: null,
    sources: [],
    confidence: "unsure",
    needsAgent: true,
    cta: "ticket",
  };
}

/**
 * Phase 12.4 — Exported agent turn runner alias.
 */
export const runSupportAgentTurn = askSupport;

