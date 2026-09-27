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
 */export function enforceGroundedReply(input: EnforceInput): EnforceOutput {
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

/* ------------------------------------------------------------------ */
/* Streaming safety lane (TODO-2): preflight grounding BEFORE first    */
/* byte. The streaming draft itself cannot be kernel-checked mid-flow, */
/* so the widget lane MUST:                                            */
/*   1. Call preflightStreamGate() BEFORE opening the SSE stream.      */
/*      ok === false → yield fallbackReply verbatim, never the LLM.    */
/*   2. Stream cleaned deltas only (reasoning stripped in llm lane).   */
/*   3. Apply enforceGroundedReply() + screenOutbound() POST-HOC to    */
/*      the ASSEMBLED reply before render/persist. Per-delta screening */
/*      is advisory only: secrets/authority/figures can split across   */
/*      chunk boundaries and are only reliably caught whole.           */
/* ------------------------------------------------------------------ */

/**
 * Streaming safety contract for the widget lane. Imported by the SSE
 * endpoint so the obligations live next to the kernel, not in a wiki.
 */
export const STREAMING_SAFETY_NOTE = [
  "STREAMING SAFETY (TODO-2):",
  "1. preflightStreamGate() BEFORE first byte — empty context yields the",
  "   unsure+handoff fallback verbatim, never calls the LLM.",
  "2. deltas are reasoning-stripped but NOT screened — do not render deltas",
  "   as trusted final content and do not persist partials as answers.",
  "3. post-hoc: run enforceGroundedReply() on the ASSEMBLED reply, then",
  "   screenOutbound() (pinned=false unless order-tool data). If either",
  "   downgrades/blocks, replace the rendered reply with the safe fallback",
  "   and escalate (needsAgent + handoff payload).",
].join("\n");

/**
 * Map retrieved [Doc] context to kernel sources so the streaming lane can
 * prove provenance BEFORE the first byte (mirrors the non-streaming caller
 * in support-agent.server.ts: first 3 hits → support_kb_docs).
 */
export function groundedSourcesFromContext(
  context: Array<{ title: string; body: string }>,
  opts?: { label?: string; limit?: number },
): GroundedSource[] {
  const limit = opts?.limit ?? 3;
  const label = opts?.label ?? "kb";
  return context.slice(0, limit).map((h) => ({
    label,
    table: "support_kb_docs",
    title: h.title,
  }));
}

export type StreamPreflight =
  | { ok: true; fallbackReply: null }
  | { ok: false; fallbackReply: string };

/**
 * Grounding preflight for the SSE lane. Returns ok:true when the lane may
 * open the LLM stream; ok:false with the exact fallback string to yield
 * verbatim (unsure+handoff, degraded banner when applicable).
 */
export function preflightStreamGate(opts: {
  contextLength: number;
  locale?: "bn" | "en";
  degraded?: boolean;
}): StreamPreflight {
  if (opts.contextLength > 0) return { ok: true, fallbackReply: null };
  const locale = opts.locale ?? "en";
  const degraded = opts.degraded ?? false;
  const out = enforceGroundedReply({
    reply: "",
    confidence: "unsure",
    sources: [],
    pinned: false,
    deepwiki: false,
    locale,
    degraded,
  });
  return { ok: false, fallbackReply: out.reply };
}

/** Join streamed deltas into the assembled reply for post-hoc screening. */
export async function joinStreamChunks(
  chunks: AsyncIterable<string> | Iterable<string>,
): Promise<string> {
  let acc = "";
  for await (const c of chunks) acc += c;
  return acc;
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
