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
import { en, DICT, interpolate, type Entry } from "./i18n-dict";
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
import { queryCoverage, MIN_QUERY_COVERAGE } from "./support-kb.server";
import { draftAnswer } from "./support-llm.server";
import { createTicket, needsApprovalReview } from "./support-tickets.server";
import {
  analyzeSentiment,
  classifyIntent,
  hashPhone,
  lookupOrder,
  SupportError,
  LOW_INTENT_CONFIDENCE_THRESHOLD,
  type Intent,
  type SentimentVerdict,
} from "./ai-support.server";
import {
  detectTrajectoryLoop,
  type TrajectoryTurn,
} from "./support-loop-detector.server";
import { captureTrainingTurn } from "./ai-training-data.server";
import {
  queryDeepWiki,
  type DeepWikiCitation,
  type DeepWikiQueryResult,
} from "./deepwiki-engine.server";
import { getVerifiedContact } from "./support-contact.server";
import {
  buildHandoffPayload,
  degradedBanner,
  isDegradedEnvironment,
} from "./support-grounding.server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

let mockAdminClient: unknown = null;

export function setMockAdminClient(client: unknown) {
  mockAdminClient = client;
}

function createTestDbProxy(): unknown {
  const promise = Promise.resolve({ data: null, error: null });
  let currentTable = "";
  let lastEqCol = "";
  let lastEqVal: unknown = null;
  const queryBuilder: Record<string, unknown> = {
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
        const id =
          lastEqCol === "id" && typeof lastEqVal === "string"
            ? lastEqVal
            : "conv-test-123";
        try {
          const { getMockConversation } =
            await import("./support-moderation.server");
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
      const id =
        lastEqCol === "id" && typeof lastEqVal === "string"
          ? lastEqVal
          : "conv-test-123";
      return {
        data: { id },
        error: null,
      };
    },
    then: (
      onfulfilled?: (value: unknown) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => promise.then(onfulfilled, onrejected),
    catch: (onrejected?: (reason: unknown) => unknown) =>
      promise.catch(onrejected),
  };

  const dbClient: Record<string, unknown> = {
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

async function admin(): Promise<Client> {
  if (mockAdminClient) return mockAdminClient as Client;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createTestDbProxy() as unknown as Client;
  }
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as Client;
  } catch {
    return createTestDbProxy() as unknown as Client;
  }
}

export type Source = { label: string; table: string; title?: string };

export type AskInput = {
  slug: string;
  message: string;
  customerName?: string | null;
  customerEmail?: string | null;
  conversationId?: string | null;
  orderNumber?: string | null;
  phone?: string | null;
  locale?: "bn" | "en";
  channel?: "widget" | "whatsapp" | "messenger";
  takeoverMode?: "ai" | "human_takeover" | null;
  engine?: "kb" | "deepwiki" | "auto";
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
  phone: string | null;
  whatsapp: string | null;
  email: string;
  hours: string;
  hoursBn: string;
  source?: "org_nap" | "merchant_verified";
};

export type HandoffPayload = {
  conversationId: string | null;
  transcript: Array<{ role: "customer" | "bot" | "agent"; body: string }>;
  confidence: Confidence;
  provenance: Source | null;
  attemptedSources: string[];
  reason: string;
  statusFrom: "pending";
  statusTo: "open";
  prefilledTicketSubject: string;
  prefilledTicketBody: string;
  createdAt: string;
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
  adminOnline?: boolean;
  deepWikiQueryId?: string;
  deepWikiCitations?: DeepWikiCitation[];
  handoffPayload?: HandoffPayload | null;
  degraded?: boolean;
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
    const querySlug = slug === "platform" ? "framique" : slug;
    const { data } = await db
      .from("merchants")
      .select("id, name, slug")
      .eq("slug", querySlug)
      .maybeSingle();
    if (!data) {
      if (slug === "framique" || slug === "platform") {
        return {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Framique",
          slug: "framique",
        };
      }
      throw new SupportError("no_merchant", "support.store_not_found");
    }
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
  incr("framique_ai_tool_call_total", {
    tool: opts.tool,
    outcome: opts.ok ? "ok" : "error",
  });
  observe("framique_ai_tool_latency_ms", opts.latencyMs, { tool: opts.tool });
}

async function ensureConversation(
  merchantId: string,
  conversationId: string | null | undefined,
  phone: string | null,
  channel: AskInput["channel"],
) {
  if (conversationId) {
    try {
      const { getMockConversation } =
        await import("./support-moderation.server");
      const mock = getMockConversation(conversationId);
      if (mock) return mock.id;
    } catch {
      // ignore
    }
    const db = await admin();
    const { data } = await db
      .from("ai_conversations")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("id", conversationId)
      .maybeSingle();
    if (data) return data.id;
  }
  const db = await admin();
  const { data, error } = await db
    .from("ai_conversations")
    .insert({
      merchant_id: merchantId,
      channel: channel ?? "widget",
      phone_hash: phone ? await hashPhone(phone) : null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new SupportError("conversation_failed", "support.chat_failed");
  return data.id;
}

const CONVERSATION_RECENT_TURNS = new Map<string, TrajectoryTurn[]>();

export function clearConversationRecentTurns() {
  CONVERSATION_RECENT_TURNS.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// TODO-3 — Server-side conversation memory: rolling summary + ticket history.
//
// Design:
// - Source of record is the DB (ai_messages / support_tickets); the Maps below
//   are a hot cache only. On a cache miss we rebuild from ai_messages, so a
//   restarted server or a second replica still recovers recent context.
// - The rolling summary is extractive + bounded (never sent wholesale to the
//   model): anchor (first customer turn) + last few turns, each truncated.
// - Ticket-history injection is bounded (≤3 tickets, truncated) and is used
//   for escalation context only — never as KB provenance.
// - Cross-session linkage (same phone_hash, other conversations) happens ONLY
//   when an explicit consented identifier exists (granted row in
//   customer_consents). Otherwise memory is strictly per-conversation.
// ─────────────────────────────────────────────────────────────────────────────

/** Max chars of rolling summary injected into the draft question. */
export const MEMORY_CONTEXT_BUDGET = 600;
/** Max chars of ticket-history context attached to escalation. */
export const TICKET_HISTORY_BUDGET = 500;

export type ConversationMemory = {
  summary: string;
  turnCount: number;
  lastIntent: Intent | null;
  lastSentiment: SentimentVerdict["sentiment"] | null;
  updatedAt: string;
};

const CONVERSATION_MEMORIES = new Map<string, ConversationMemory>();

export function clearConversationMemory() {
  CONVERSATION_MEMORIES.clear();
}

export function getConversationMemory(
  conversationId: string,
): ConversationMemory | null {
  return CONVERSATION_MEMORIES.get(conversationId) ?? null;
}

function truncateSnippet(text: string, max = 140): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/**
 * Extractive rolling-summary update. Keeps the conversation anchor plus the
 * most recent turns inside MEMORY_CONTEXT_BUDGET. Deterministic (no model
 * call) so offline/CI behaviour is stable; the reasoning model still sees the
 * summary via the draft question preamble.
 */
export function updateConversationMemory(
  conversationId: string,
  turn: {
    role: "customer" | "bot";
    message: string;
    intent?: Intent | null;
    sentiment?: SentimentVerdict["sentiment"] | null;
  },
): ConversationMemory {
  const prev = CONVERSATION_MEMORIES.get(conversationId);
  const safe = redactPii(turn.message).text;
  const snippet = truncateSnippet(safe);
  const label =
    turn.role === "customer"
      ? `C${(prev?.turnCount ?? 0) + 1}${turn.intent ? `(${turn.intent})` : ""}: ${snippet}`
      : `A: ${snippet}`;
  const anchor = prev?.summary.split(" ‖ ")[0] ?? null;
  const turns = prev ? prev.summary.split(" ‖ ").slice(1) : [];
  // First customer turn becomes the anchor and is never evicted.
  const base = anchor ?? (turn.role === "customer" ? label : null);
  const rest = anchor
    ? [...turns, label]
    : turn.role === "customer"
      ? []
      : [label];
  let summary = [base, ...rest].filter(Boolean).join(" ‖ ");
  // Evict oldest non-anchor turns until inside budget.
  while (summary.length > MEMORY_CONTEXT_BUDGET && rest.length > 1) {
    rest.shift();
    summary = [base, ...rest].filter(Boolean).join(" ‖ ");
  }
  if (summary.length > MEMORY_CONTEXT_BUDGET) {
    summary = `${summary.slice(0, MEMORY_CONTEXT_BUDGET)}…`;
  }
  const next: ConversationMemory = {
    summary,
    turnCount: (prev?.turnCount ?? 0) + 1,
    lastIntent: turn.intent ?? prev?.lastIntent ?? null,
    lastSentiment: turn.sentiment ?? prev?.lastSentiment ?? null,
    updatedAt: new Date().toISOString(),
  };
  CONVERSATION_MEMORIES.set(conversationId, next);
  return next;
}

/** Bounded memory preamble for the draft question (KB sources untouched). */
export function buildMemoryContext(conversationId: string): string {
  const mem = CONVERSATION_MEMORIES.get(conversationId);
  if (!mem?.summary) return "";
  const trimmed =
    mem.summary.length > MEMORY_CONTEXT_BUDGET
      ? `${mem.summary.slice(0, MEMORY_CONTEXT_BUDGET)}…`
      : mem.summary;
  return `Conversation so far: ${trimmed}`;
}

/**
 * Rebuild hot-cache memory from the server-side message store (best-effort).
 * Called on cache miss so memory survives process restarts.
 */
export async function hydrateMemoryFromHistory(
  merchantId: string,
  conversationId: string,
): Promise<ConversationMemory | null> {
  if (CONVERSATION_MEMORIES.has(conversationId)) {
    return CONVERSATION_MEMORIES.get(conversationId)!;
  }
  try {
    const db = await admin();
    const { data } = await db
      .from("ai_messages")
      .select("role, body")
      .eq("merchant_id", merchantId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(8);
    const rows = (data ?? []) as Array<{ role: string; body: string }>;
    if (!rows.length) return null;
    for (const row of rows.reverse()) {
      updateConversationMemory(conversationId, {
        role: row.role === "customer" ? "customer" : "bot",
        message: String(row.body ?? "").slice(0, 500),
      });
    }
    return CONVERSATION_MEMORIES.get(conversationId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Explicit consented identifier for cross-session memory: a granted consent
 * row for this subject hash. Absent/refused → per-conversation memory only.
 */
export async function hasConsentedCrossSession(
  merchantId: string,
  subjectHash: string | null,
): Promise<boolean> {
  if (!subjectHash) return false;
  try {
    const db = await admin();
    const { data } = await db
      .from("customer_consents")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("subject_hash", subjectHash)
      .eq("granted", true)
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * Bounded ticket-history context for escalation (same conversation always;
 * same requester across sessions ONLY when consented). Truncated bodies,
 * newest first, never used as answer provenance.
 */
export async function getTicketHistoryContext(
  merchantId: string,
  opts: {
    conversationId: string;
    requesterHash?: string | null;
    consented?: boolean;
    limit?: number;
  },
): Promise<string> {
  try {
    const db = await admin();
    const limit = Math.min(opts.limit ?? 3, 3);
    const { data } = await db
      .from("support_tickets")
      .select("subject, status, priority")
      .eq("merchant_id", merchantId)
      .eq("conversation_id", opts.conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    const lines: string[] = (
      (data ?? []) as Array<{
        subject: string;
        status: string;
        priority: string;
      }>
    ).map(
      (t) =>
        `• [${t.status}/${t.priority}] ${truncateSnippet(String(t.subject ?? ""), 80)}`,
    );
    // Cross-session: same requester's other tickets only with consent.
    if (opts.consented && opts.requesterHash) {
      const { data: cross } = await db
        .from("support_tickets")
        .select("subject, status, priority")
        .eq("merchant_id", merchantId)
        .eq("requester_hash", opts.requesterHash)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const t of (
        (cross ?? []) as Array<{
          subject: string;
          status: string;
          priority: string;
        }>
      ).slice(0, limit)) {
        const line = `• [${t.status}/${t.priority}] ${truncateSnippet(String(t.subject ?? ""), 80)} (prior session)`;
        if (!lines.includes(line)) lines.push(line);
        if (lines.length >= limit) break;
      }
    }
    if (!lines.length) return "";
    const joined = `Prior tickets:\n${lines.join("\n")}`;
    return joined.length > TICKET_HISTORY_BUDGET
      ? `${joined.slice(0, TICKET_HISTORY_BUDGET)}…`
      : joined;
  } catch {
    return "";
  }
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
  recent.push({
    role: role === "customer" ? "customer" : "bot",
    message: safe,
  });
  if (recent.length > 12) recent.shift();
  CONVERSATION_RECENT_TURNS.set(conversationId, recent);

  await db.from("ai_messages").insert({
    merchant_id: merchantId,
    conversation_id: conversationId,
    role,
    body: safe,
    flagged,
  });
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
  return UNGROUNDED_SPECULATIVE_PATTERNS.some((pattern) =>
    pattern.test(message),
  );
}

export const EPISTEMIC_ADMISSION_EN =
  "I don't have verified info to answer this accurately.";
export const EPISTEMIC_ADMISSION_BN =
  "আমি এই বিষয়ে নিশ্চিত নই এবং ভুল তথ্য এড়াতে অনুমান করতে চাই না।";

export const DEFAULT_CONTACT_INFO: ContactInfoCard = {
  phone: null,
  whatsapp: null,
  email: "support@framique.com",
  hours: "Sunday–Thursday, 10:00–18:00 (BST)",
  hoursBn: "সকাল ৯:০০ – রাত ১০:০০ BST",
  source: "org_nap",
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
    description:
      "Submit a formal tracked request with SLA resolution guarantees",
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

/**
 * Greeting / small-talk intent — checked FIRST in the pipeline, before any
 * confidence gating or KB retrieval, and honoured in degraded mode too.
 * A greeting is never a refusal.
 */
export function isGreetingMessage(message: string): boolean {
  const text = message.trim();
  return (
    /^(hi|hello|hey|salam|assalamu\s*alaikum|greetings|help|howdy|good\s*(morning|afternoon|evening))\b/i.test(
      text,
    ) ||
    /^(নমস্কার|সালাম|আসসালামু\s*আলাইকুম|হ্যালো|হাই|কেমন আছেন|সাহায্য)/i.test(
      text,
    )
  );
}

/**
 * Short greeting + topic suggestions. Deterministic (no KB/LLM), so it is
 * safe in degraded mode and never carries the degraded banner.
 */
export function buildGreetingReply(
  merchantName: string,
  locale: "bn" | "en" = "en",
): string {
  if (locale === "bn") {
    return (
      `${merchantName}-এ স্বাগতম! আমি কীভাবে সাহায্য করতে পারি?\n` +
      `দাম (pricing), অনলাইন স্টোর সেটআপ, অথবা বিকাশ ও কুরিয়ার সম্পর্কে জিজ্ঞাসা করুন।`
    );
  }
  return (
    `Welcome to ${merchantName}! How can I help you today?\n` +
    `Ask me about pricing, online store setup, or bKash & couriers.`
  );
}

export type TieredFallbackOptions = {
  query?: string | null;
  /** Top raw hit title before the coverage gate filtered it (naming the gap). */
  detectedTopic?: string | null;
  adminOnline?: boolean;
  customerEmail?: string;
};

/**
 * Generic detected-category for the clarify step. Names the gap
 * ("courier & shipping" found, ERP asked) without quoting a wrong-topic
 * article verbatim — quoting the title would re-present the mismatch
 * (brands, "Manifests") inside the refusal.
 */
export function detectedCategoryForClarify(
  hit: { title: string; body: string } | null | undefined,
): string | null {
  if (!hit) return null;
  const text = `${hit.title} ${hit.body}`;
  if (
    /courier|shipping|logistics|pathao|redx|steadfast|delivery|parcel/i.test(
      text,
    )
  )
    return "courier & shipping";
  if (/bkash|nagad|payment|sslcommerz|shurjopay|\bcod\b/i.test(text))
    return "payments";
  if (/builder|theme|\bast\b|template|custom css/i.test(text))
    return "storefront builder & themes";
  if (/tenant|rbac|domain|isolation/i.test(text))
    return "store settings & domains";
  if (/pricing|plan|trial/i.test(text)) return "pricing & plans";
  return hit.title.slice(0, 60) || null;
}

/**
 * Tiered compact fallback: clarify → suggest → single handoff.
 * One compact step, not a four-option wall. Honest refusal is kept
 * (EPISTEMIC_ADMISSION_*), suggestions mirror the greeting topics
 * (pricing / store setup / bKash & couriers).
 */
export function buildTieredFallbackReply(
  locale: "bn" | "en",
  contactInfo: ContactInfoCard = DEFAULT_CONTACT_INFO,
  options?: TieredFallbackOptions,
): string {
  const querySnippet = (options?.query ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const detected = (options?.detectedTopic ?? "").trim().slice(0, 80);
  if (locale === "bn") {
    const clarify =
      querySnippet && detected
        ? `আমি "${detected}"-এর তথ্য পেয়েছি, কিন্তু "${querySnippet}" নিয়ে যাচাইকৃত তথ্য নেই। আরেকটু বিস্তারিত বলবেন?`
        : querySnippet
          ? `"${querySnippet}" নিয়ে যাচাইকৃত তথ্য নেই। আরেকটু বিস্তারিত বলবেন?`
          : `আরেকটু বিস্তারিত বলবেন?`;
    // Compact presence signal (single sentence, not a wall).
    const presence =
      options?.adminOnline === true
        ? ` 🟢 সাপোর্ট স্পেশালিস্ট অনলাইন আছেন — "এজেন্টের সাথে কথা বলুন" লিখলে আমি আপনাকে ট্রান্সফার করে দেব।`
        : options?.adminOnline === false
          ? ` ⚪ লাইভ সাপোর্ট অফলাইন — আমাদের টিম আপনার ইমেইলে${options?.customerEmail ? ` (${options.customerEmail})` : ""} উত্তর জানিয়ে দেবে।`
          : ``;
    return (
      `${EPISTEMIC_ADMISSION_BN} ${clarify}${presence}\n` +
      `দাম, অনলাইন স্টোর সেটআপ, অথবা বিকাশ ও কুরিয়ার সম্পর্কে জিজ্ঞাসা করতে পারেন।\n` +
      `মানুষের সাহায্য চাইলে "এজেন্টের সাথে কথা বলুন" লিখুন। ✉️ ${contactInfo.email} · ⏰ ${contactInfo.hoursBn}`
    );
  }
  const clarify =
    querySnippet && detected
      ? `I found help on "${detected}" but nothing verified on "${querySnippet}" — could you tell me a bit more about what you need?`
      : querySnippet
        ? `On "${querySnippet}" — could you tell me a bit more about what you need?`
        : `Could you tell me a bit more about what you need?`;
  // Compact presence signal (single sentence, not a wall).
  const presence =
    options?.adminOnline === true
      ? ` 🟢 Support Specialist Online — reply "talk to human" and I'll transfer you to a specialist.`
      : options?.adminOnline === false
        ? ` ⚪ Live Support Away — our team will follow up via email${options?.customerEmail ? ` at ${options.customerEmail}` : ""}.`
        : ``;
  return (
    `${EPISTEMIC_ADMISSION_EN} ${clarify}${presence}\n` +
    `Meanwhile you can ask about pricing, online store setup, or bKash & couriers.\n` +
    `If you'd like a human to follow up, reply "talk to human". ✉️ ${contactInfo.email} · ⏰ ${contactInfo.hours}`
  );
}

export function buildEpistemicHumilityReply(
  locale: "bn" | "en",
  contactInfo: ContactInfoCard = DEFAULT_CONTACT_INFO,
  options?: { adminOnline?: boolean; customerEmail?: string },
): string {
  // Tiered compact fallback (clarify → suggest → single handoff).
  // The old 4-option wall is retired; widget action buttons
  // (EPISTEMIC_ACTION_PATHS) still offer the four paths as UI.
  return buildTieredFallbackReply(locale, contactInfo, {
    adminOnline: options?.adminOnline,
    customerEmail: options?.customerEmail,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpful-first answer policy (owner directive, Sept 2026).
//
// Tiers:
//  1. KB-grounded (highest trust) — unchanged, cited from help articles.
//  2. LLM general answer — when KB lacks it, still try from general
//     e-commerce/SaaS knowledge, labeled honestly + one follow-up OPTION.
//  3. Refusal rare, warm, last resort ONLY for high-stakes unknowns.
//  4. Never present wrong-topic KB article (relevance floor kept).
//
// SAFETY LINES THAT STAY (only refusal-worthy, warm single-step):
//  - no invented prices/fees/rates/SLAs/API shapes (must come from KB or be
//    marked verify-with-human);
//  - no account-specific data leakage across tenants;
//  - no credential/legal advice.
// ─────────────────────────────────────────────────────────────────────────────

export const GENERAL_GUIDANCE_LABEL_EN =
  "General guidance (not from our help docs):";
export const GENERAL_GUIDANCE_LABEL_BN =
  "সাধারণ নির্দেশনা (আমাদের সহায়তা নথি থেকে নয়):";

/**
 * High-stakes unknowns — the ONLY refusal-worthy categories, and even they
 * get a warm single-step redirect (never a wall).
 * - exact money/fees (prices, commissions, rates),
 * - account-specific data (my store/account exact figures),
 * - legal/compliance, security credentials disclosure.
 */
export function isHighStakesQuery(message: string): boolean {
  if (
    /\bexact\b[^.]{0,50}\b(fee|fees|commission|charge|rates?|pricing|price)/i.test(
      message,
    )
  )
    return true;
  if (/\btransaction\s*fee/i.test(message) && /\bexact\b/i.test(message))
    return true;
  if (
    /\bcommission\s*rate/i.test(message) &&
    /\b(exact|my|last month)\b/i.test(message)
  )
    return true;
  if (/\bmy\s+(store|account|balance).*exact\b/i.test(message)) return true;
  if (/\baccount.specific\b/i.test(message)) return true;
  if (
    /\blegal advice\b|\btax law\b|\bcompliance\b[^.]{0,30}\b(tax|law|certification)\b/i.test(
      message,
    )
  )
    return true;
  if (
    /\b(give me|show me|reveal|disclose)\b[^.]{0,40}\b(api key|service role|secret|password|otp|credential)/i.test(
      message,
    )
  )
    return true;
  return false;
}

export type HighStakesOptions = {
  query?: string | null;
  adminOnline?: boolean;
  customerEmail?: string;
};

/**
 * Warm single-step redirect for high-stakes unknowns.
 * One short paragraph + single next step, never a wall of options.
 * No invented prices/fees/rates/SLAs/API shapes (safety line).
 */
export function buildHighStakesReply(
  locale: "bn" | "en",
  contactInfo: ContactInfoCard = DEFAULT_CONTACT_INFO,
  _options?: HighStakesOptions,
): string {
  if (locale === "bn") {
    return (
      `যাচাইকৃত তথ্য ছাড়া সঠিক ফি/হার বলতে চাই না — "এজেন্টের সাথে কথা বলুন" লিখুন, ` +
      `একজন স্পেশালিস্ট আপনার স্টোরের জন্য বর্তমান হার নিশ্চিত করে দেবেন। ✉️ ${contactInfo.email}`
    );
  }
  return (
    `I don't have verified figures for exact fees in our help docs — reply "talk to human" ` +
    `and a specialist will confirm the current rate for your store. ✉️ ${contactInfo.email}`
  );
}

export function isPosQuery(message: string): boolean {
  return /\bpos\b|\bpoint.of.sale\b|\bpoint of sale\b/i.test(message);
}

export function isErpQuery(message: string): boolean {
  return /\berp\b|\benterprise resource planning\b/i.test(message);
}

export type GeneralGuidanceKind = "pos" | "erp" | "generic";

/** Recognized commerce-integration topics that deserve general guidance. */
export function generalGuidanceKind(
  message: string,
): GeneralGuidanceKind | null {
  if (isPosQuery(message)) return "pos";
  if (isErpQuery(message)) return "erp";
  if (
    /\bintegrat|\bconnect\b|\badd my own\b|\bcustom\b/i.test(message) &&
    /\b(store|inventory|accounting|crm|payment|checkout|stock|order)\b/i.test(
      message,
    )
  )
    return "generic";
  return null;
}

export type GeneralGuidanceOptions = {
  adminOnline?: boolean;
  customerEmail?: string;
};

/**
 * Structured general guidance (deterministic, works without a live LLM).
 * Topic explainer + what Framique typically supports + verify-pointer,
 * labeled honestly + one follow-up OPTION (never a wall).
 * No invented prices/fees/rates/SLAs/API shapes; no account leakage;
 * no credential/legal advice (safety lines — verify-with-human instead).
 */
export function buildGeneralGuidanceReply(
  kind: GeneralGuidanceKind,
  locale: "bn" | "en",
  contactInfo: ContactInfoCard = DEFAULT_CONTACT_INFO,
  _options?: GeneralGuidanceOptions,
): string {
  const email = contactInfo.email;
  if (locale === "bn") {
    if (kind === "pos") {
      return (
        `${GENERAL_GUIDANCE_LABEL_BN} POS (পয়েন্ট অব সেল) সাধারণত দোকানের ` +
        `চেকআউট হার্ডওয়্যার + সফটওয়্যার বোঝায় যা বিক্রি ও স্টকের সাথে সিঙ্ক করে। ` +
        `Framique সাধারণত অনলাইন চেকআউট ও পেমেন্ট সাপোর্ট করে — নিজের POS হার্ডওয়্যারের ` +
        `জন্য সামঞ্জস্য ও স্টক সিঙ্ক যাচাই করে নিন। "এজেন্টের সাথে কথা বলুন" লিখলে ` +
        `একজন স্পেশালিস্ট আপনার স্টোরের জন্য POS অপশন নিশ্চিত করে দেবেন। ✉️ ${email}`
      );
    }
    return (
      `${GENERAL_GUIDANCE_LABEL_BN} ERP ইন্টিগ্রেশন সাধারণত স্টক, অর্ডার ও হিসাব ` +
      `আপনার স্টোর ও ERP-এর মধ্যে যুক্ত করে। SKU ও অর্ডার ফ্লো তৈরি রাখুন, फिर ` +
      `সঠিক Framique অপশন ডক বা স্পেশালিস্টের সাথে যাচাই করুন। "এজেন্টের সাথে কথা বলুন" ` +
      `লিখলে একজন স্পেশালিস্ট আপনার ERP ফ্লো ম্যাপ করে দেবেন। ✉️ ${email}`
    );
  }
  if (kind === "pos") {
    return (
      `${GENERAL_GUIDANCE_LABEL_EN} A POS (point of sale) usually means in-store ` +
      `checkout hardware + software that syncs sales, inventory and receipts with your online store. ` +
      `Framique typically supports online checkout and payments — for your own POS hardware, ` +
      `check compatibility, offline mode and inventory sync, then verify the exact setup with our docs or a specialist. ` +
      `Reply "talk to human" if you'd like a specialist to confirm POS options for your store. ✉️ ${email}`
    );
  }
  if (kind === "erp") {
    return (
      `${GENERAL_GUIDANCE_LABEL_EN} ERP integration usually means connecting inventory, orders and accounting ` +
      `between your store and an ERP (stock sync, order export or webhooks/CSV). ` +
      `To prepare, list your SKUs, warehouses and order flow, then verify the exact Framique import option ` +
      `with our docs or a specialist — I don't have verified ERP steps in our help docs. ` +
      `Reply "talk to human" if you'd like a specialist to map your ERP flow. ✉️ ${email}`
    );
  }
  return (
    `${GENERAL_GUIDANCE_LABEL_EN} For custom integrations, list what should sync (products, stock, orders, customers), ` +
    `then verify the exact Framique option with our docs or a specialist — I don't have verified steps for this in our help docs. ` +
    `Reply "talk to human" if you'd like a specialist to map your flow. ✉️ ${email}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream cold-path resolver (SSE lane single source of truth).
//
// `src/routes/api/public/support/stream.ts` refuses on empty KB context via
// `preflightStreamGate`. That refusal must mirror askSupport's helpful-first
// policy (1bb8c3b): greeting-first (no KB/LLM), then high-stakes warm
// single-step redirect, then general-guidance tier — never a wall, never a
// wrong-topic article. Returns null when the lane should proceed (warm
// context → LLM stream; cold unknown → preflight refusal).
// ─────────────────────────────────────────────────────────────────────────────

export type StreamColdKind = "greeting" | "general_guidance" | "high_stakes";

export type StreamColdReply = {
  kind: StreamColdKind;
  reply: string;
  needsAgent: boolean;
  cta: "none" | "ticket" | "callback" | "human_transfer";
  guidanceKind: GeneralGuidanceKind | null;
};

export type StreamColdInput = {
  message: string;
  locale: "bn" | "en";
  merchantName: string;
  contextLength: number;
  contactInfo?: ContactInfoCard;
};

/**
 * Resolve the SSE lane's cold (empty-context) reply, mirroring askSupport.
 * Greeting wins regardless of context (early bypass); high-stakes beats
 * general guidance (exact-fee safety before helpful concepts); anything else
 * cold returns null so the caller falls through to `preflightStreamGate`.
 */
export function resolveStreamColdReply(
  input: StreamColdInput,
): StreamColdReply | null {
  const locale = input.locale ?? "en";
  let contact = input.contactInfo;
  if (!contact) {
    try {
      contact = getVerifiedContact();
    } catch {
      contact = DEFAULT_CONTACT_INFO;
    }
  }
  if (isGreetingMessage(input.message)) {
    return {
      kind: "greeting",
      reply: buildGreetingReply(input.merchantName, locale),
      needsAgent: false,
      cta: "none",
      guidanceKind: null,
    };
  }
  if (input.contextLength > 0) return null;
  if (isHighStakesQuery(input.message)) {
    return {
      kind: "high_stakes",
      reply: buildHighStakesReply(locale, contact),
      needsAgent: true,
      cta: "human_transfer",
      guidanceKind: null,
    };
  }
  const guidanceKind = generalGuidanceKind(input.message);
  if (guidanceKind) {
    return {
      kind: "general_guidance",
      reply: buildGeneralGuidanceReply(guidanceKind, locale, contact),
      needsAgent: false,
      cta: "none",
      guidanceKind,
    };
  }
  return null;
}

export function translate(
  locale: "bn" | "en",
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = (DICT as Record<string, Entry>)[key];
  if (!entry) return key;
  return interpolate(locale === "bn" ? entry.bn : entry.en, vars);
}

export function getFallbackReply(
  intent: Intent,
  locale: "bn" | "en" = "en",
): string {
  const keyMap: Record<Intent, string> = {
    order_status: "support.ask_order_details",
    refund: "support.faq.refund",
    billing: "support.faq.refund",
    technical: "support.faq.other",
    complaint: "support.ticket_prompt",
    lead: "support.faq.product",
    faq_shipping: "support.faq.shipping",
    faq_hours: "support.faq.hours",
    product: "support.faq.product",
    create_ticket: "support.ticket_prompt",
    request_callback: "support.callback_prompt",
    other: "support.faq.other",
  };
  const key = keyMap[intent] || "support.faq.other";
  return translate(locale, key);
}

const FALLBACK: Record<Intent, string> = {
  order_status: en("support.ask_order_details"),
  refund: en("support.faq.refund"),
  billing: en("support.faq.refund"),
  technical: en("support.faq.other"),
  complaint: en("support.ticket_prompt"),
  lead: en("support.faq.product"),
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
      await recordGuardrail(
        merchant.id,
        input.conversationId ?? null,
        "rate_limit",
        "support.ask",
        subject,
      );
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
    const conversationId = await ensureConversation(
      merchant.id,
      input.conversationId,
      input.phone ?? null,
      channel,
    );
    await appendMessage(merchant.id, conversationId, "customer", input.message);

    if (!inbound.allowed) {
      await recordGuardrail(
        merchant.id,
        conversationId,
        inbound.kind ?? "unsafe",
        inbound.rule ?? "unknown",
        input.message,
      );
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
    const convState = await getConversationTakeoverState(
      merchant.id,
      conversationId,
    );
    const isHumanTakeover =
      input.takeoverMode === "human_takeover" ||
      convState?.takeoverMode === "human_takeover";

    if (isHumanTakeover) {
      try {
        const db = await admin();
        await db
          .from("ai_conversations")
          .update({
            status: "in_progress",
            last_customer_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never)
          .eq("merchant_id", merchant.id)
          .eq("id", conversationId);
      } catch {
        // ignore update failure in offline or restricted environments
      }

      try {
        const { recordCustomerMessage } =
          await import("./support-moderation.server");
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
        steps: [
          {
            step: "human_takeover_suppressed",
            customerMessage: redactPii(input.message).text,
          },
        ],
        outcome: "suppressed_human_takeover",
      });

      await captureTrainingTurn({
        merchantId: merchant.id,
        conversationId,
        userMessage: input.message,
        agentReply: "[bot_suppressed_human_takeover]",
        grounded: false,
      }).catch(() => null);

      const staffIndicator =
        locale === "bn" ? "অফিসার সক্রিয় আছেন" : "Staff active";
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

    // 2a2. Greeting / small-talk FIRST — before retrieval, confidence
    // gating, or degraded handling. Deterministic, never refused, never
    // bannered, never escalated (works in degraded mode too).
    if (isGreetingMessage(input.message)) {
      const greeting = buildGreetingReply(merchant.name, locale);
      await appendMessage(merchant.id, conversationId, "bot", greeting, false);
      updateConversationMemory(conversationId, {
        role: "bot",
        message: greeting,
      });
      incr("framique_ai_ask_total", { outcome: "greeting", channel });
      await captureTrainingTurn({
        merchantId: merchant.id,
        conversationId,
        userMessage: input.message,
        agentReply: greeting,
        grounded: true,
        actionCompleted: "answered",
      }).catch(() => null);
      return {
        conversationId,
        reply: greeting,
        provenance: null,
        sources: [],
        confidence: "grounded",
        needsAgent: false,
        cta: "none",
        degraded: false,
      };
    }

    // 2b. Conversational Looping Detection & Circuit Breaker
    const recentTurns = CONVERSATION_RECENT_TURNS.get(conversationId) ?? [];
    // Prior turns before current user message
    const priorTurns = recentTurns.slice(0, -1);
    const loopVerdict = detectTrajectoryLoop(
      priorTurns,
      input.message,
      "customer",
    );

    if (loopVerdict.loopDetected) {
      const loopReply =
        locale === "bn"
          ? loopVerdict.interventionReplyBn || loopVerdict.interventionReply!
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
        actionPaths: EPISTEMIC_ACTION_PATHS,
        contactInfo: getVerifiedContact(),
        handoffPayload: buildHandoffPayload({
          conversationId,
          transcript: [
            {
              role: "customer",
              body: redactPii(input.message).text.slice(0, 2000),
            },
            { role: "bot", body: loopReply.slice(0, 2000) },
          ],
          confidence: "unsure",
          provenance: null,
          attemptedSources: ["kb", "deepwiki"],
          reason: "loop_circuit_broken",
        }),
        degraded: (() => {
          try {
            return isDegradedEnvironment();
          } catch {
            return false;
          }
        })(),
      };
    }

    // TODO-3 — Agent brain: confidence-scored intent + sentiment/urgency.
    // Keyword fast path (sync) keeps every turn cheap; the async embedding
    // fallback only fires for unsure turns inside classifyIntentModel — the
    // orchestrator stays on the sync path here to preserve turn latency, and
    // low confidence itself becomes an escalation signal below.
    const classified = classifyIntent(input.message);
    const intent = classified.primary;
    const sentiment = analyzeSentiment(input.message);
    const steps: Array<Record<string, unknown>> = [
      {
        step: "intent",
        intent,
        confidence: classified.confidence,
        source: classified.source,
        intents: classified.intents,
        multi: classified.multi,
      },
      {
        step: "sentiment",
        sentiment: sentiment.sentiment,
        urgency: sentiment.urgency,
        score: sentiment.score,
        signals: sentiment.signals,
        priority: sentiment.priority,
      },
    ];

    // Server-side memory: hydrate the rolling summary from the message store
    // on cache miss, then refresh the preamble for this turn.
    await hydrateMemoryFromHistory(merchant.id, conversationId).catch(
      () => null,
    );
    updateConversationMemory(conversationId, {
      role: "customer",
      message: input.message,
      intent,
      sentiment: sentiment.sentiment,
    });
    const memoryPreamble = buildMemoryContext(conversationId);
    const consented = await hasConsentedCrossSession(
      merchant.id,
      subjectHash,
    ).catch(() => false);
    const ticketHistoryContext = await getTicketHistoryContext(merchant.id, {
      conversationId,
      requesterHash: subjectHash,
      consented,
    }).catch(() => "");
    if (memoryPreamble || ticketHistoryContext) {
      steps.push({
        step: "memory",
        summaryChars: memoryPreamble.length,
        ticketHistoryChars: ticketHistoryContext.length,
        crossSession: consented,
      });
    }

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
        resultDigest: order
          ? await digest(`${order.order_number}:${order.status}`)
          : null,
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
    // Raw top hit (pre-coverage) names the detected-vs-asked gap in the
    // tiered clarify step — e.g. ERP asked, logistics detected.
    let rawTopHit: KbHit | null = null;
    if (!pinned) {
      const raw = await searchKbHybrid(merchant.id, input.message);
      rawTopHit = raw[0] ?? null;
      steps.push({ step: "retrieve", hits: raw.length });
      // Coverage gate: a hit is citable only when it accounts for EVERY
      // distinctive query word. Single-stem matches ("integrat*" without
      // "ERP") are disqualified here so the humility circuit below sees
      // zero usable hits instead of a confident-looking false positive.
      const qualified = raw.filter(
        (h) =>
          queryCoverage(input.message, h.title, h.body) >= MIN_QUERY_COVERAGE,
      );
      steps.push({ step: "coverage", kept: qualified.length, of: raw.length });
      hits = qualified;
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
      intent === "create_ticket" ||
      intent === "request_callback" ||
      intent === "refund";

    const isCommerceIntent =
      intent === "faq_shipping" ||
      intent === "faq_hours" ||
      intent === "product" ||
      intent === "order_status" ||
      intent === "billing" ||
      intent === "technical" ||
      intent === "lead";

    // Greeting was already answered early (2a2); kept here so the
    // humility / kernel guards below can never re-trigger on small-talk.
    const isGreeting = isGreetingMessage(input.message);

    const isSpeculative = detectUngroundedOrSpeculative(input.message);
    const topHit = hits[0];
    const hasStrongTextMatch =
      (topHit?.text_rank ?? 0) >= 0.5 || (topHit?.combined_score ?? 0) >= 0.05;
    const topVectorSim = topHit?.vector_sim;
    const lowVectorSim =
      topVectorSim !== undefined &&
      topVectorSim < EPISTEMIC_HUMILITY_SIMILARITY_THRESHOLD &&
      !hasStrongTextMatch;
    const noKbHits = hits.length === 0;

    const contactInfo: ContactInfoCard = getVerifiedContact();

    // Honest degraded mode: placeholder key or mock LLM → extractive-only banner.
    let degraded = false;
    try {
      degraded = isDegradedEnvironment();
    } catch {
      degraded = false;
    }

    // ── Helpful-first policy: high-stakes → warm redirect; POS/ERP →
    // labeled general guidance. BEFORE DeepWiki + humility so a generic
    // payments/logistics answer can never masquerade as an exact-fee or ERP
    // answer. Safety lines (no invented prices/fees/SLAs/API shapes; no
    // cross-tenant leakage; no credential/legal advice) cited above.
    const highStakesNoCoverage =
      !pinned &&
      !isActionIntent &&
      !isGreeting &&
      hits.length === 0 &&
      isHighStakesQuery(input.message);
    if (highStakesNoCoverage) {
      const hsReply = buildHighStakesReply(locale, contactInfo);
      await appendMessage(merchant.id, conversationId, "bot", hsReply, true);
      updateConversationMemory(conversationId, {
        role: "bot",
        message: hsReply,
      });
      incr("framique_ai_ask_total", {
        outcome: "high_stakes_redirect",
        channel,
      });
      await captureTrainingTurn({
        merchantId: merchant.id,
        conversationId,
        userMessage: input.message,
        agentReply: hsReply,
        grounded: false,
        actionCompleted: "answered",
      }).catch(() => null);
      await recordTrajectory({
        merchantId: merchant.id,
        conversationId,
        subjectHash,
        channel,
        steps: [...steps, { step: "high_stakes_redirect" }],
        outcome: "escalated",
      });
      return {
        conversationId,
        reply: hsReply,
        provenance: null,
        sources: [],
        confidence: "unsure",
        needsAgent: true,
        cta: "human_transfer",
        epistemicTriggered: true,
        epistemicReason: "high_stakes_needs_human",
        actionPaths: EPISTEMIC_ACTION_PATHS,
        contactInfo,
        handoffPayload: buildHandoffPayload({
          conversationId,
          transcript: [
            {
              role: "customer",
              body: redactPii(input.message).text.slice(0, 2000),
            },
            { role: "bot", body: hsReply.slice(0, 2000) },
          ],
          confidence: "unsure",
          provenance: null,
          attemptedSources: ["kb"],
          reason: "high_stakes_needs_human",
        }),
        degraded: false,
      };
    }

    const guidanceKind =
      !pinned && !isActionIntent && !isGreeting && hits.length === 0
        ? generalGuidanceKind(input.message)
        : null;
    if (guidanceKind) {
      const gReply = buildGeneralGuidanceReply(
        guidanceKind,
        locale,
        contactInfo,
      );
      await appendMessage(merchant.id, conversationId, "bot", gReply, false);
      updateConversationMemory(conversationId, {
        role: "bot",
        message: gReply,
      });
      incr("framique_ai_ask_total", {
        outcome: "general_guidance",
        channel,
      });
      await captureTrainingTurn({
        merchantId: merchant.id,
        conversationId,
        userMessage: input.message,
        agentReply: gReply,
        grounded: false,
        actionCompleted: "answered",
      }).catch(() => null);
      await recordTrajectory({
        merchantId: merchant.id,
        conversationId,
        subjectHash,
        channel,
        steps: [...steps, { step: "general_guidance", kind: guidanceKind }],
        outcome: "answered",
      });
      return {
        conversationId,
        reply: gReply,
        provenance: null,
        sources: [],
        confidence: "unsure",
        needsAgent: false,
        cta: "none",
        epistemicTriggered: false,
        contactInfo: undefined,
        degraded: false,
      };
    }

    // 4.1 DeepWiki Synthesis Engine (Multi-Hop RAG + RL + Atropos fallback)
    const forceDeepWiki = input.engine === "deepwiki";
    let deepWikiResult: DeepWikiQueryResult | null = null;
    if (
      !pinned &&
      !isActionIntent &&
      !isGreeting &&
      !isSpeculative &&
      (forceDeepWiki || noKbHits || lowVectorSim)
    ) {
      try {
        const dw = await queryDeepWiki({
          merchantId: merchant.id,
          query: input.message,
          locale,
          conversationId,
        });
        if (dw && dw.citations.length > 0) {
          deepWikiResult = dw;
        }
      } catch (err) {
        log("warn", "deepwiki.query_failed", { error: String(err) });
      }
    }

    const { isOperatorOnline } = await import("./support-presence.server");
    const presence = await isOperatorOnline(merchant.id, conversationId);
    const adminOnline = presence.isOnline;

    const triggerEpistemicHumility =
      !pinned &&
      !isActionIntent &&
      !isGreeting &&
      !deepWikiResult &&
      (isSpeculative || noKbHits || lowVectorSim);

    if (triggerEpistemicHumility) {
      // Tiered compact fallback names the detected-vs-asked gap when the
      // coverage gate filtered a near-miss (ERP asked, logistics detected).
      const humilityReply = buildTieredFallbackReply(locale, contactInfo, {
        query: input.message,
        detectedTopic: detectedCategoryForClarify(rawTopHit),
        adminOnline,
        customerEmail: input.customerEmail ?? undefined,
      });

      // Auto-escalate conversation to needs_agent so human operators on /root/ai are notified
      try {
        const db = await admin();
        await db
          .from("ai_conversations")
          .update({
            status: "needs_agent",
            priority: adminOnline ? "high" : "normal",
          } as never)
          .eq("merchant_id", merchant.id)
          .eq("id", conversationId);
      } catch {
        // ignore update failure in offline or restricted environments
      }

      await appendMessage(
        merchant.id,
        conversationId,
        "bot",
        humilityReply,
        true,
      );
      incr("framique_ai_ask_total", { outcome: "epistemic_humility" });

      await captureTrainingTurn({
        merchantId: merchant.id,
        conversationId,
        userMessage: input.message,
        agentReply: humilityReply,
        grounded: false,
      }).catch(() => null);

      const humilityReason = isSpeculative
        ? "speculative_out_of_domain"
        : noKbHits
          ? "zero_kb_hits"
          : "low_vector_similarity";
      const humilityHandoff = buildHandoffPayload({
        conversationId,
        transcript: [
          {
            role: "customer",
            body: redactPii(input.message).text.slice(0, 2000),
          },
          { role: "bot", body: humilityReply.slice(0, 2000) },
        ],
        confidence: "unsure",
        provenance: null,
        attemptedSources: ["kb", "deepwiki"],
        reason: humilityReason,
      });

      return {
        conversationId,
        reply: humilityReply,
        provenance: null,
        sources: [],
        confidence: "unsure",
        needsAgent: true,
        cta: "human_transfer",
        adminOnline,
        staffActive: adminOnline,
        epistemicTriggered: true,
        epistemicReason: humilityReason,
        actionPaths: EPISTEMIC_ACTION_PATHS,
        contactInfo,
        handoffPayload: humilityHandoff,
        degraded,
      };
    }

    let reply = pinned?.reply ?? "";
    let sources: Source[] = pinned ? [pinned.source] : [];

    if (deepWikiResult) {
      reply = deepWikiResult.answer;
      sources = deepWikiResult.citations.map((c) => ({
        label: c.citationTag,
        table: "deepwiki",
        title: c.title,
      }));
      // Honest degraded mode applies to DeepWiki synthesis too: secondary
      // source, never presented as confident when extractive-only.
      if (degraded && !pinned) {
        reply = `${degradedBanner(locale)}\n${reply}`;
      }
    } else if (!pinned && hits.length) {
      // Memory injection is conversational context only: it rides in the
      // question preamble (bounded) while provenance stays strictly KB, so
      // the grounded-answer kernel below is unaffected.
      const draftQuestion =
        memoryPreamble &&
        `${memoryPreamble}\nCurrent question: ${input.message}`.length < 1200
          ? `${memoryPreamble}\nCurrent question: ${input.message}`
          : input.message;
      const draft = await draftAnswer({
        question: draftQuestion,
        context: hits.map((h) => ({ title: h.title, body: h.body })),
        locale,
      });
      if (draft) {
        reply = draft.text;
        sources = hits.slice(0, 3).map((h) => ({
          label: translate(locale, "support.provenance.kb"),
          table: "support_kb_docs",
          title: h.title,
        }));
      }
    }

    if (!reply && isGreeting) {
      reply = buildGreetingReply(merchant.name, locale);
    }

    // Grounded-answer kernel: no provenance → no factual claims.
    // Null-context falls back to explicit unsure+handoff, never a bare FAQ.
    if (!reply && !isGreeting) {
      reply = buildTieredFallbackReply(locale, contactInfo, {
        query: input.message,
        detectedTopic: detectedCategoryForClarify(rawTopHit),
        adminOnline,
        customerEmail: input.customerEmail ?? undefined,
      });
      sources = [];
    } else if (!reply) {
      reply = getFallbackReply(intent, locale);
    }

    // Honest degraded mode: extractive-only banner + lowered confidence.
    // Pinned order rows stay pinned (DB truth); KB-grounded never presents as confident.
    let effectiveConfidence = confidence;
    if (degraded && !pinned && effectiveConfidence === "grounded") {
      reply = `${degradedBanner(locale)}\n${reply}`;
      effectiveConfidence = "unsure";
    } else if (degraded && !pinned && reply && sources.length > 0) {
      reply = `${degradedBanner(locale)}\n${reply}`;
      if (effectiveConfidence !== "unsure") effectiveConfidence = "unsure";
    }

    // Final kernel guard: grounded confidence without provenance is impossible.
    if (
      !pinned &&
      sources.length === 0 &&
      !deepWikiResult &&
      !isGreeting &&
      effectiveConfidence !== "unsure"
    ) {
      reply = buildTieredFallbackReply(locale, contactInfo, {
        query: input.message,
        detectedTopic: detectedCategoryForClarify(rawTopHit),
        adminOnline,
        customerEmail: input.customerEmail ?? undefined,
      });
      effectiveConfidence = "unsure";
    }

    // 5. Outbound guardrail: no authority claims, no unpinned figures.
    // Safety lines stay: blocked replies become a warm single-step redirect
    // (one paragraph + single next step, never a wall), not a cold wall.
    const outbound = screenOutbound(reply, { pinned: Boolean(pinned) });
    if (!outbound.allowed) {
      await recordGuardrail(
        merchant.id,
        conversationId,
        outbound.kind ?? "authority",
        outbound.rule ?? "unknown",
        reply,
      );
      reply = buildHighStakesReply(locale, contactInfo);
    }

    const flagged =
      (!isGreeting &&
        !pinned &&
        effectiveConfidence === "unsure" &&
        !hits.length) ||
      !outbound.allowed;
    await appendMessage(merchant.id, conversationId, "bot", reply, flagged);
    updateConversationMemory(conversationId, { role: "bot", message: reply });

    // 6. Action tools: ticket creation and callback request.
    //
    // Triggers:
    //  (a) create_ticket intent — explicit "open a ticket" / "contact support"
    //  (b) request_callback intent — explicit "call me" / "কলব্যাক"
    //  (c) refund intent — auto-escalate as high-priority ticket
    //  (d) outbound guardrail blocked — auto-escalate to prevent agent looping
    //  (e) ≥ 2 consecutive unsure bot turns — auto-escalate (consecutive low-confidence)
    //  (f) TODO-3 angry fast-lane — angry sentiment auto-tickets high priority
    //  (g) TODO-3 complaint + urgency — urgent complaints are tracked
    //
    // Only ONE tool fires per turn. Priority: create_ticket > request_callback > auto-escalate.

    const unsureStreak = flagged
      ? await consecutiveUnsure(merchant.id, conversationId)
      : 0;
    // TODO-3 brain escalation: low-confidence intent, negative/angry
    // sentiment, high urgency, or an explicit complaint all hand to a human.
    // Angry turns are fast-laned (high priority) but never auto-promised —
    // the outbound authority guard above already stripped any promise copy.
    const lowConfidenceIntent =
      classified.confidence < LOW_INTENT_CONFIDENCE_THRESHOLD;
    const negativeSentiment =
      sentiment.sentiment === "negative" || sentiment.sentiment === "angry";
    const urgentTurn =
      sentiment.urgency === "high" || sentiment.urgency === "urgent";
    const needsAgent =
      !outbound.allowed ||
      effectiveConfidence === "unsure" ||
      intent === "refund" ||
      intent === "create_ticket" ||
      intent === "request_callback" ||
      intent === "complaint" ||
      lowConfidenceIntent ||
      negativeSentiment ||
      urgentTurn ||
      unsureStreak >= 2;

    let ticketId: string | null = null;
    let ticketAction: TicketAction | null = null;
    let callbackAction: CallbackAction | null = null;
    let cta: AskResult["cta"] = "none";

    // ── Tool: create_support_ticket ───────────────────────────────────────────
    const angryFastLane = sentiment.sentiment === "angry";
    const urgentComplaint = intent === "complaint" && urgentTurn;
    const shouldCreateTicket =
      !outbound.allowed ||
      intent === "refund" ||
      intent === "create_ticket" ||
      angryFastLane ||
      urgentComplaint ||
      unsureStreak >= 2;

    if (shouldCreateTicket) {
      const rank = (p: string) =>
        p === "urgent" ? 3 : p === "high" ? 2 : p === "normal" ? 1 : 0;
      const db = await admin();
      try {
        await db
          .from("ai_conversations")
          .update({
            status: "needs_agent",
            order_number: input.orderNumber ?? null,
            // Angry fast-lane buys queue position (priority only, never a promise).
            ...((angryFastLane || urgentComplaint) &&
            rank(sentiment.priority) > rank("normal")
              ? { priority: sentiment.priority }
              : {}),
          } as never)
          .eq("merchant_id", merchant.id)
          .eq("id", conversationId);
      } catch {
        // ignore update error
      }

      const basePriority =
        intent === "refund" || intent === "complaint"
          ? "high"
          : intent === "create_ticket"
            ? "normal"
            : "normal";
      // Angry fast-lane never lowers priority, only raises it.
      const elevated =
        angryFastLane || urgentComplaint ? sentiment.priority : basePriority;
      const priority =
        rank(elevated) > rank(basePriority) ? elevated : basePriority;
      const reason =
        intent === "create_ticket"
          ? "support.explicit_ticket_request"
          : intent === "refund"
            ? "support.refund_escalation"
            : angryFastLane
              ? "support.angry_customer_fastlane"
              : urgentComplaint
                ? "support.complaint_escalation"
                : !outbound.allowed
                  ? "support.guardrail_block"
                  : "support.consecutive_unsure";

      const toolStart = Date.now();
      // Chatwoot parity: ticket prefilled from full transcript, not just the last turn.
      const recentForTicket =
        CONVERSATION_RECENT_TURNS.get(conversationId) ?? [];
      const transcriptText = recentForTicket
        .map((t) => `${t.role}: ${t.message}`)
        .join("\n")
        .slice(0, 3500);
      // Pending-approval screen: refunds / sensitive-PII bodies must not fire
      // autonomously — they land in `pending_approval` for an operator.
      const ticketSubject = input.message.slice(0, 120) || "Support request";
      const approvalScreen = needsApprovalReview({
        subject: ticketSubject,
        body: transcriptText || redactPii(input.message).text,
      });
      const ticket = await createTicket({
        merchantId: merchant.id,
        subject: ticketSubject,
        body: transcriptText || redactPii(input.message).text,
        priority,
        channel,
        conversationId,
        orderNumber: input.orderNumber ?? null,
        requesterHash: subjectHash,
        reason,
        requiresApproval: approvalScreen.required,
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
        // Pending-approval lane: the request is held for operator review —
        // advisory copy only, never a completion or refund promise.
        if (ticket!.status === "pending_approval" && reply) {
          const pendingNote =
            locale === "bn"
              ? `\n\nআপনার অনুরোধটি গৃহীত হয়েছে (রেফারেন্স **#TKT-${ticketId.slice(-8).toUpperCase()}**) এবং বর্তমানে পর্যালোচনাধীন রয়েছে। পর্যালোচনা শেষ হলেই আমরা জানিয়ে দেব — এখনো কোনো রিফান্ড ইস্যু করা হয়নি।`
              : `\n\nYour request has been received (reference **#TKT-${ticketId.slice(-8).toUpperCase()}**) and is under operator review. We will update you as soon as the review is complete — no refund has been issued yet.`;
          if (!reply.includes(ticketId.slice(-8).toUpperCase())) {
            reply = `${reply}${pendingNote}`;
          }
        }
        // Angry fast-lane: acknowledge the frustration + human handoff without
        // promising any outcome.
        if (angryFastLane && reply && !/specialist|human|review/i.test(reply)) {
          reply =
            locale === "bn"
              ? `${reply}\n\nআপনার অসুবিধার জন্য আমরা দুঃখিত। একজন সাপোর্ট স্পেশালিস্ট শীঘ্রই আপনার সাথে যোগাযোগ করবেন।`
              : `${reply}\n\nWe're sorry for the trouble — a support specialist will follow up with you shortly.`;
        }
      } else {
        cta = "ticket";
      }

      await recordToolCall({
        merchantId: merchant.id,
        conversationId,
        tool: "create_support_ticket",
        args: {
          priority,
          reason,
          order_number: input.orderNumber ?? null,
          requires_approval: approvalScreen.required,
          signals: approvalScreen.signals,
          sentiment: sentiment.sentiment,
          urgency: sentiment.urgency,
        },
        sourceTable: "support_tickets",
        ok: Boolean(ticketId),
        latencyMs: toolLatency,
        resultDigest: ticketId ? await digest(ticketId) : null,
        errorCode: ticketId ? null : "ticket_create_failed",
      });
      steps.push({
        step: "tool",
        tool: "create_support_ticket",
        ok: Boolean(ticketId),
        priority,
        reason,
        requiresApproval: approvalScreen.required,
      });
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
          customerName: "Customer", // Widget will collect name via the form
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
        steps.push({
          step: "tool",
          tool: "request_callback",
          ok: Boolean(cbResult),
        });
      } else {
        // No phone on file — prompt widget to show the callback form
        reply = en("support.callback_prompt");
        cta = "callback";
        steps.push({
          step: "tool",
          tool: "request_callback",
          ok: false,
          reason: "no_phone_on_file",
        });
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
      outcome: needsAgent ? "escalated" : effectiveConfidence,
    });

    incr("framique_ai_ask_total", {
      outcome: needsAgent ? "escalated" : effectiveConfidence,
      channel,
    });
    // 8. Continuous Training Data Flywheel Capture
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
      grounded:
        effectiveConfidence === "grounded" || effectiveConfidence === "pinned",
      guardrailBlocked: !outbound.allowed,
      actionCompleted: ticketId
        ? "ticket"
        : callbackAction
          ? "callback"
          : "answered",
    }).catch(() => null);

    // 9. Dispatch Mail Notifications to Admin and Customer (Phase 12.7)
    if (input.customerEmail?.trim()) {
      const { sendSupportNotifications } =
        await import("./support-mail.server");
      sendSupportNotifications({
        merchantId: merchant.id,
        merchantName: merchant.name,
        slug: input.slug,
        conversationId,
        customerName: input.customerName || "Customer",
        customerEmail: input.customerEmail.trim(),
        phone: input.phone ?? null,
        orderNumber: input.orderNumber ?? null,
        userMessage: input.message,
        agentReply: reply,
        ticketId,
        ticketRef: ticketId ? `#TKT-${ticketId.slice(-8).toUpperCase()}` : null,
        priority: ticketAction?.priority ?? null,
        callbackId: callbackAction?.callbackId ?? null,
        locale,
        trigger: isHumanTakeover
          ? "human_takeover"
          : ticketId
            ? "ticket_created"
            : callbackAction
              ? "callback_requested"
              : "chat_turn",
      }).catch((err) => {
        log("warn", "support.notifications_dispatch_failed", {
          error: String((err as Error)?.message ?? err),
          conversationId,
        });
      });
    }

    const finalConfidence: Confidence = degraded
      ? pinned
        ? "pinned"
        : "unsure"
      : deepWikiResult
        ? deepWikiResult.confidence === "high"
          ? "grounded"
          : "unsure"
        : effectiveConfidence;

    // Chatwoot-grade handoff: full transcript + confidence + provenance + sources.
    // Status flip pending→open is recorded in the payload; DB keeps needs_agent
    // for the existing triage queue while humans take over via human_takeover.
    let handoffPayload: HandoffPayload | null = null;
    if (needsAgent || finalConfidence === "unsure") {
      const recent = CONVERSATION_RECENT_TURNS.get(conversationId) ?? [];
      const transcript = recent.map((t) => ({
        role: t.role === "customer" ? ("customer" as const) : ("bot" as const),
        body: t.message.slice(0, 2000),
      }));
      if (transcript.length === 0) {
        transcript.push({
          role: "customer",
          body: redactPii(input.message).text.slice(0, 2000),
        });
      }
      handoffPayload = buildHandoffPayload({
        conversationId,
        transcript,
        confidence: finalConfidence,
        provenance: deepWikiResult
          ? (sources[0] ?? null)
          : (pinned?.source ?? null),
        attemptedSources: [
          ...(pinned ? ["orders"] : []),
          ...(hits.length ? ["kb"] : []),
          ...(deepWikiResult ? ["deepwiki"] : []),
          ...(!pinned && !hits.length && !deepWikiResult ? ["kb"] : []),
        ],
        reason:
          !pinned && !hits.length && !deepWikiResult && !isGreeting
            ? "zero_kb_hits"
            : needsAgent
              ? "escalated"
              : "answered",
      });
      // Flip triage → human queue (pending→open parity): keep needs_agent for
      // the existing queue but record open intent via payload; best-effort DB
      // update to open when explicitly handed off and no ticket already set it.
      if (!ticketId && !callbackAction) {
        try {
          const db = await admin();
          await db
            .from("ai_conversations")
            .update({ status: "open" } as never)
            .eq("merchant_id", merchant.id)
            .eq("id", conversationId);
        } catch {
          // ignore offline
        }
      }
    }

    return {
      conversationId,
      reply,
      provenance: deepWikiResult
        ? (sources[0] ?? null)
        : (pinned?.source ?? null),
      sources,
      confidence: finalConfidence,
      needsAgent,
      cta,
      adminOnline,
      ticketId,
      ticketAction,
      callbackAction,
      actionPaths:
        needsAgent || finalConfidence === "unsure"
          ? EPISTEMIC_ACTION_PATHS
          : undefined,
      contactInfo:
        needsAgent || finalConfidence === "unsure" ? contactInfo : undefined,
      deepWikiQueryId: deepWikiResult?.queryId,
      deepWikiCitations: deepWikiResult?.citations,
      handoffPayload,
      degraded,
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
  isResolved?: boolean,
) {
  const value = Math.min(5, Math.max(1, Math.round(rating)));
  const safeReview = review ? redactPii(review).text.slice(0, 1000) : null;
  const resolved = isResolved !== undefined ? isResolved : value >= 4;

  // 1. Update in-memory flywheel
  const { updateTurnCsat } = await import("./ai-training-data.server");
  await updateTurnCsat(conversationId, value, safeReview ?? undefined).catch(
    () => null,
  );

  // 1.1 Update DeepWiki RL Edge Weights via Atropos feedback
  let dwFeedbackApplied = false;
  try {
    const { getLatestDeepWikiQueryForConversation, applyAtroposFeedback } =
      await import("./deepwiki-engine.server");
    const dwRecord = getLatestDeepWikiQueryForConversation(conversationId);
    if (dwRecord) {
      await applyAtroposFeedback({
        queryId: dwRecord.queryId,
        rating: value,
        feedbackText: safeReview ?? undefined,
        isResolved: resolved,
      });
      dwFeedbackApplied = true;
    }
  } catch {
    // Non-blocking RL feedback
  }

  // 1.2 Step Atropos RL Environment if no prior DeepWiki query record
  if (!dwFeedbackApplied) {
    try {
      const { computeTrajectoryReward, stepAtroposEnv } =
        await import("./support-rl-reward.server");
      const stepObs = {
        userMessage: safeReview || "Customer feedback",
        grounded: resolved,
        csatRating: value,
        actionCompleted: (resolved ? "answered" : undefined) as
          "answered" | undefined,
      };
      const stepReward = computeTrajectoryReward({
        ...stepObs,
        agentReply: "Feedback recorded",
      });

      stepAtroposEnv(
        { conversationId, turnIndex: 1, history: [], isDone: true },
        { intent: "feedback", replyText: "Feedback recorded" },
        stepObs,
      );

      if (stepReward.label === "high_quality") {
        const { captureTrainingTurn } =
          await import("./ai-training-data.server");
        await captureTrainingTurn({
          merchantId: "00000000-0000-4000-8000-000000000001",
          conversationId,
          userMessage: safeReview || "Customer feedback",
          agentReply: "Feedback recorded",
          csatRating: value,
          csatReview: safeReview,
          grounded: resolved,
          actionCompleted: "answered",
        }).catch(() => null);
      }
    } catch {
      // Non-blocking
    }
  }

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
    incr("framique_ai_rating_total", {
      outcome: "fallback",
      rating: String(value),
    });
    return { ok: true, rating: value, review: safeReview } as const;
  }
}

/** Uniform degradation: an outage answers honestly and offers a human. */
export function degradedAnswer(
  conversationId: string | null,
  err?: unknown,
): AskResult {
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
    actionPaths: EPISTEMIC_ACTION_PATHS,
    contactInfo: { ...DEFAULT_CONTACT_INFO },
    handoffPayload: buildHandoffPayload({
      conversationId,
      transcript: [{ role: "bot", body: en("support.degraded") }],
      confidence: "unsure",
      provenance: null,
      attemptedSources: ["kb", "deepwiki", "orders"],
      reason: "outage_degraded",
    }),
    degraded: true,
  };
}

/**
 * Phase 12.4 — Exported agent turn runner alias.
 */
export const runSupportAgentTurn = askSupport;
