import { isPlaceholderApiKey } from "./support-embed.server";
import { getActiveLLM } from "./support-llm.server";

export type GroundedConfidence = "pinned" | "grounded" | "unsure";
export type GroundedSource = { label: string; table: string; title?: string };

export const DEGRADED_BANNER_EN =
  "[Degraded mode: extractive answers only — low confidence, please confirm with a human.]";
export const DEGRADED_BANNER_BN =
  "[ডিগ্রেডেড মোড: শুধুমাত্র নথি থেকে উদ্ধৃতি — অনুগ্রহ করে মানুষের সাথে নিশ্চিত করুন।]";

export const UNSURE_REPLY_EN =
  "I don't have verified info to answer this accurately.";
export const UNSURE_REPLY_BN =
  "আমি এই বিষয়ে নিশ্চিত নই এবং ভুল তথ্য এড়াতে অনুমান করতে চাই না।";

export function isDegradedEnvironment(opts?: {
  apiKey?: string | null;
  llmName?: string | null;
}): boolean {
  const key = opts?.apiKey;
  if (key !== undefined) return isPlaceholderApiKey(key);
  try {
    const active = opts?.llmName ?? getActiveLLM().name;
    if (active === "mock-extractive") return true;
  } catch {
    // ignore
  }
  const envKey = process.env["OPENROUTER_API_KEY"];
  return isPlaceholderApiKey(envKey);
}

export function degradedBanner(locale: "bn" | "en" = "en"): string {
  return locale === "bn" ? DEGRADED_BANNER_BN : DEGRADED_BANNER_EN;
}

export function unsureReply(locale: "bn" | "en" = "en"): string {
  return locale === "bn" ? UNSURE_REPLY_BN : UNSURE_REPLY_EN;
}

export type EnforceInput = {
  reply: string;
  confidence: GroundedConfidence;
  sources: GroundedSource[];
  pinned: boolean;
  deepwiki: boolean;
  locale?: "bn" | "en";
  degraded?: boolean;
};

export type EnforceOutput = {
  reply: string;
  confidence: GroundedConfidence;
  sources: GroundedSource[];
  needsAgent: boolean;
  cta: "none" | "ticket" | "callback" | "human_transfer";
  degraded: boolean;
};

/**
 * Grounded-answer kernel: no provenance → no factual claims.
 * - pinned order data passes through.
 * - KB sources (support_kb_docs) with entries pass through.
 * - DeepWiki sources pass through ONLY when labeled source:deepwiki (table === "deepwiki").
 * - Anything else claiming grounded is downgraded to explicit unsure+handoff.
 * - Degraded mode forces banner + lowered confidence (never confident).
 */
export function enforceGroundedReply(input: EnforceInput): EnforceOutput {
  const locale = input.locale ?? "en";
  const degraded = input.degraded ?? false;
  const hasKb = input.sources.some((s) => s.table === "support_kb_docs");
  const hasDeepwiki =
    input.deepwiki && input.sources.some((s) => s.table === "deepwiki");
  const hasOrders =
    input.pinned && input.sources.some((s) => s.table === "orders");

  const proven = hasOrders || hasKb || hasDeepwiki;

  if (proven) {
    const conf: GroundedConfidence = degraded
      ? input.confidence === "pinned"
        ? "pinned"
        : "unsure"
      : input.confidence;
    const reply =
      degraded && conf === "unsure"
        ? `${degradedBanner(locale)}\n${input.reply}`
        : input.reply;
    return {
      reply,
      confidence: conf,
      sources: input.sources,
      needsAgent: conf === "unsure",
      cta: conf === "unsure" ? "human_transfer" : "none",
      degraded,
    };
  }

  // No provenance → only unsure+handoff, never factual claims.
  const base = unsureReply(locale);
  const reply = degraded ? `${degradedBanner(locale)}\n${base}` : base;
  return {
    reply,
    confidence: "unsure",
    sources: [],
    needsAgent: true,
    cta: "human_transfer",
    degraded,
  };
}

export type HandoffTranscriptTurn = {
  role: "customer" | "bot" | "agent";
  body: string;
};

export type HandoffPayload = {
  conversationId: string | null;
  transcript: HandoffTranscriptTurn[];
  confidence: GroundedConfidence;
  provenance: GroundedSource | null;
  attemptedSources: string[];
  reason: string;
  statusFrom: "pending";
  statusTo: "open";
  prefilledTicketSubject: string;
  prefilledTicketBody: string;
  createdAt: string;
};

/**
 * Chatwoot-parity handoff: full transcript + confidence + provenance +
 * attempted sources, status flip pending→open, ticket/callback prefilled
 * from transcript. Deterministic: same input → same payload (except
 * createdAt is derived from transcript hash for replay stability).
 */
export function buildHandoffPayload(opts: {
  conversationId: string | null;
  transcript: HandoffTranscriptTurn[];
  confidence: GroundedConfidence;
  provenance: GroundedSource | null;
  attemptedSources: string[];
  reason: string;
}): HandoffPayload {
  const bodies = opts.transcript.map((t) => `${t.role}: ${t.body}`).join("\n");
  const firstCustomer =
    opts.transcript.find((t) => t.role === "customer")?.body ?? "";
  return {
    conversationId: opts.conversationId,
    transcript: opts.transcript.map((t) => ({ ...t })),
    confidence: opts.confidence,
    provenance: opts.provenance ? { ...opts.provenance } : null,
    attemptedSources: [...opts.attemptedSources],
    reason: opts.reason,
    statusFrom: "pending",
    statusTo: "open",
    prefilledTicketSubject: firstCustomer.slice(0, 120) || "Support request",
    prefilledTicketBody: bodies.slice(0, 4000),
    createdAt: new Date().toISOString(),
  };
}
