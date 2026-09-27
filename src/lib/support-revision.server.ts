/**
 * Daily support-answer revision loop (Inkling reviewer).
 *
 * Once a day the revision job re-reads recent support Q&A turns, asks the
 * revision model to score each answer on groundedness / tone / policy as
 * bounded JSON, and routes the verdict:
 *
 *   - poor answers (groundedness or tone below threshold) get a revised draft
 *     recorded in the job result for operator review;
 *   - hallucinations / severe policy breaches raise a guardrail event and a
 *     `pending_approval` ticket (human must confirm — never auto-applied);
 *   - recurring unanswered questions become KB *candidate* docs via `saveDoc`
 *     with status `draft` (never auto-published);
 *   - turns carrying a CSAT rating refresh their training row so the RL
 *     reward recomputes (`updateTurnCsat`).
 *
 * Revision model: `thinkingmachines/inkling-small:free` via OpenRouter. The
 * key comes from the `OPENROUTER_API_KEY` environment variable only — it is
 * never hardcoded and never read from any other slot. Without a key the job
 * logs and skips (never throws to cron).
 *
 * Source of record: `ai_training_conversations` — the materialized Q&A-turn
 * store written by `captureTrainingTurn` from the upstream `ai_messages` /
 * `ai_conversations` flow. No new tables are introduced.
 */

import { digest, redactPii } from "./support-guardrails";
import { incr, log } from "./observability.server";

/** Revision reviewer model (OpenRouter id). */
export const REVISION_MODEL = "thinkingmachines/inkling-small:free";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Per-attempt abort for the Inkling scoring call. */
export const REVISION_TIMEOUT_MS = 20_000;
export const REVISION_DEFAULT_LIMIT = 50;
export const REVISION_MAX_LIMIT = 200;

/** Answers below these scores are "poor" and earn a revised draft. */
export const POOR_GROUNDEDNESS_THRESHOLD = 0.5;
export const POOR_TONE_THRESHOLD = 0.5;
/** Policy scores below this (or hallucination / severe) escalate. */
export const SEVERE_POLICY_THRESHOLD = 0.3;
/** An unanswered question seen this many times in one batch is "recurring". */
export const RECURRING_UNANSWERED_THRESHOLD = 2;

/**
 * KB candidates are ALWAYS drafts. `support_kb_docs.status` only admits
 * `draft` / `published` (see phase-9 migration check constraint), and the
 * revision loop must never auto-publish — a human promotes the draft.
 */
export const KB_CANDIDATE_STATUS = "draft" as const;

/** Actor recorded as `updated_by` on revision-proposed KB drafts. */
export const REVISION_SYSTEM_ACTOR = "system:support-revision";

export type RevisionSeverity = "none" | "low" | "severe";

export type RevisionScore = {
  groundedness: number;
  tone: number;
  policy: number;
  isHallucination: boolean;
  revisedAnswer: string | null;
  unanswered: boolean;
  severity: RevisionSeverity;
  rationale: string;
};

export type QaTurn = {
  id: string;
  merchantId: string | null;
  conversationId: string | null;
  turnIndex: number;
  question: string;
  answer: string;
  csatRating: number | null;
  grounded: boolean;
  createdAt: string;
};

export type RevisionJobResult = {
  ok: boolean;
  skipped: boolean;
  date: string;
  reviewed: number;
  revised: number;
  hallucinations: number;
  escalatedTickets: number;
  kbCandidates: number;
  csatTouched: number;
  errors: number;
  reason?: string;
  error?: string;
};

function clamp01(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/**
 * Bounded JSON parser for the Inkling verdict. Accepts a parsed object or a
 * raw model string (markdown fences tolerated). Scores are clamped to
 * [0, 1]; unknown severities fall back to `none`. Returns null when the
 * payload is not a score at all (unparseable JSON, or an object with no
 * score fields) so callers can count-and-continue instead of trusting it.
 */
export function parseRevisionScore(raw: unknown): RevisionScore | null {
  try {
    let obj: Record<string, unknown> | null = null;
    if (typeof raw === "string") {
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/g, "")
        .trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start < 0 || end <= start) return null;
      const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
      if (!parsed || typeof parsed !== "object") return null;
      obj = parsed as Record<string, unknown>;
    } else if (raw && typeof raw === "object") {
      obj = raw as Record<string, unknown>;
    } else {
      return null;
    }
    if (
      !("groundedness" in obj) &&
      !("tone" in obj) &&
      !("policy" in obj)
    ) {
      return null;
    }
    const sevRaw = String(obj["severity"] ?? "none").toLowerCase();
    const severity: RevisionSeverity =
      sevRaw === "severe" ? "severe" : sevRaw === "low" ? "low" : "none";
    const revised = obj["revised_answer"];
    return {
      groundedness: clamp01(obj["groundedness"], 0.5),
      tone: clamp01(obj["tone"], 0.5),
      policy: clamp01(obj["policy"], 0.5),
      isHallucination: obj["is_hallucination"] === true,
      revisedAnswer:
        typeof revised === "string" && revised.trim()
          ? revised.slice(0, 4000)
          : null,
      unanswered: obj["unanswered"] === true,
      severity,
      rationale:
        typeof obj["rationale"] === "string"
          ? (obj["rationale"] as string).slice(0, 500)
          : "",
    };
  } catch {
    return null;
  }
}

/** True when the answer is poor enough to deserve a revised draft. */
export function needsRevision(score: RevisionScore): boolean {
  return (
    score.groundedness < POOR_GROUNDEDNESS_THRESHOLD ||
    score.tone < POOR_TONE_THRESHOLD
  );
}

/**
 * True only for severe cases: explicit severe verdict, a hallucination flag,
 * or a policy score below the severe floor. Severe turns raise a guardrail
 * event AND a `pending_approval` ticket.
 */
export function shouldEscalateTicket(score: RevisionScore): boolean {
  return (
    score.severity === "severe" ||
    score.isHallucination ||
    score.policy < SEVERE_POLICY_THRESHOLD
  );
}

/**
 * KB-promotion gate. Only recurring unanswered poor answers qualify, severe
 * turns never do (they belong in the ticket queue, not the KB), and the
 * emitted candidate is always `draft` — see KB_CANDIDATE_STATUS.
 */
export function shouldPromoteToKb(
  score: RevisionScore,
  recurrenceCount: number,
): boolean {
  return (
    score.unanswered &&
    score.groundedness < POOR_GROUNDEDNESS_THRESHOLD &&
    !shouldEscalateTicket(score) &&
    recurrenceCount >= RECURRING_UNANSWERED_THRESHOLD
  );
}

/** Normalised question key for recurrence counting within a batch. */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Scoring prompt: JSON-only verdict with the exact schema the parser reads. */
export function buildRevisionPrompt(question: string, answer: string): string {
  const q = redactPii(question).text.slice(0, 1500);
  const a = redactPii(answer).text.slice(0, 2000);
  return [
    "You are a support-answer reviewer for Framique, a Bangladeshi cloud commerce platform.",
    "Score the assistant answer against the customer question on three axes from 0.0 (worst) to 1.0 (best):",
    "- groundedness: is every factual claim (prices, timelines, policies, endpoints) supported and non-fabricated?",
    "- tone: is it polite, concise and in the right language?",
    "- policy: does it avoid refund promises, PII leaks, authority claims and unsafe content?",
    "Also decide: is_hallucination (fabricated fact/policy/price), unanswered (the question was dodged or met with an empty fallback), severity (none|low|severe).",
    "When the answer is poor, provide a short corrected revised_answer; otherwise null.",
    "Reply with JSON ONLY, no prose, exactly this shape:",
    '{"groundedness":0.0,"tone":0.0,"policy":0.0,"is_hallucination":false,"revised_answer":null,"unanswered":false,"severity":"none","rationale":"..."}',
    `Customer question: ${q}`,
    `Assistant answer: ${a}`,
  ].join("\n");
}

function resolveApiKey(explicit?: string): string | null {
  const raw = (explicit ?? process.env["OPENROUTER_API_KEY"] ?? "").trim();
  if (!raw) return null;
  if (/REDACTED|placeholder/i.test(raw)) return null;
  return raw;
}

/**
 * Score one turn with Inkling. Never throws: missing key, network failure,
 * non-JSON output and timeouts all resolve to null (counted as errors by the
 * job, never fatal).
 */
export async function scoreTurnWithInkling(
  question: string,
  answer: string,
  opts?: {
    apiKey?: string;
    model?: string;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<RevisionScore | null> {
  const apiKey = resolveApiKey(opts?.apiKey);
  if (!apiKey) {
    log("warn", "support.revision_no_api_key", { model: REVISION_MODEL });
    return null;
  }
  const run = opts?.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? REVISION_TIMEOUT_MS,
  );
  try {
    const res = await run(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://framique.com",
        "X-Title": "Framique Support Revision",
      },
      body: JSON.stringify({
        model: opts?.model ?? REVISION_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You review support answers. Reply with JSON ONLY in the requested schema.",
          },
          { role: "user", content: buildRevisionPrompt(question, answer) },
        ],
        temperature: 0,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      log("warn", "support.revision_score_http", {
        status: res.status,
        model: REVISION_MODEL,
      });
      return null;
    }
    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    return parseRevisionScore(content);
  } catch (err) {
    log("warn", "support.revision_score_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Recent Q&A turns from the existing `ai_training_conversations` store (the
 * materialized turn pairs captured from the `ai_messages` / `ai_conversations`
 * flow). Never throws: a database outage yields an empty batch.
 */
export async function fetchRecentQaTurns(
  limit = REVISION_DEFAULT_LIMIT,
): Promise<QaTurn[]> {
  const bounded = Math.min(
    Math.max(Math.floor(limit) || REVISION_DEFAULT_LIMIT, 1),
    REVISION_MAX_LIMIT,
  );
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_training_conversations")
      .select(
        "id, merchant_id, conversation_id, turn_index, user_turn, agent_reply, csat_rating, grounded, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(bounded);
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: String(r["id"] ?? ""),
      merchantId:
        typeof r["merchant_id"] === "string" ? (r["merchant_id"] as string) : null,
      conversationId:
        typeof r["conversation_id"] === "string"
          ? (r["conversation_id"] as string)
          : null,
      turnIndex: Number(r["turn_index"] ?? 0),
      question: String(r["user_turn"] ?? ""),
      answer: String(r["agent_reply"] ?? ""),
      csatRating:
        typeof r["csat_rating"] === "number" ? (r["csat_rating"] as number) : null,
      grounded: r["grounded"] !== false,
      createdAt: String(r["created_at"] ?? ""),
    }));
  } catch {
    return [];
  }
}

async function defaultRecordGuardrail(
  turn: QaTurn,
  score: RevisionScore,
): Promise<void> {
  if (!turn.merchantId) return;
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_guardrail_events").insert({
      merchant_id: turn.merchantId,
      conversation_id: turn.conversationId,
      kind: "unsafe",
      rule: score.isHallucination
        ? "revision_hallucination"
        : "revision_policy_breach",
      action: "blocked",
      sample_digest: await digest(redactPii(turn.answer).text.slice(0, 500)),
    } as never);
    incr("framique_ai_guardrail_total", {
      kind: "unsafe",
      rule: "support_revision",
    });
  } catch (err) {
    log("warn", "support.revision_guardrail_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}

async function defaultCreateTicket(
  turn: QaTurn,
  score: RevisionScore,
): Promise<void> {
  if (!turn.merchantId) return;
  const { createTicket } = await import("./support-tickets.server");
  await createTicket({
    merchantId: turn.merchantId,
    subject: `Revision review: suspected hallucination (${turn.id.slice(0, 8)})`,
    body: [
      `Inkling flagged a support answer for human review.`,
      `Question: ${redactPii(turn.question).text.slice(0, 500)}`,
      `Answer: ${redactPii(turn.answer).text.slice(0, 800)}`,
      `Score: groundedness=${score.groundedness} tone=${score.tone} policy=${score.policy} hallucination=${score.isHallucination}`,
      `Rationale: ${score.rationale}`,
    ].join("\n"),
    priority: "high",
    channel: "widget",
    conversationId: turn.conversationId,
    requiresApproval: true,
    reason: "support.revision_hallucination_review",
  });
}

async function defaultSaveKbCandidate(
  turn: QaTurn,
  recurrenceCount: number,
): Promise<void> {
  if (!turn.merchantId) return;
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const { saveDoc } = await import("./support-kb.server");
  await saveDoc(supabaseAdmin as never, turn.merchantId, REVISION_SYSTEM_ACTOR, {
    title: `Candidate: ${redactPii(turn.question).text.slice(0, 120)}`,
    body: [
      `Recurring unanswered question (seen ${recurrenceCount}x in revision batch).`,
      "",
      `Question: ${redactPii(turn.question).text.slice(0, 1000)}`,
      "",
      "Operator: draft the approved answer here, then publish.",
    ].join("\n"),
    locale: "en",
    status: KB_CANDIDATE_STATUS,
    tags: ["revision-candidate", "unanswered"],
    sourceUrl: null,
  });
}

async function defaultTouchCsat(turn: QaTurn): Promise<void> {
  if (!turn.conversationId || turn.csatRating == null) return;
  const { updateTurnCsat } = await import("./ai-training-data.server");
  await updateTurnCsat(turn.conversationId, turn.csatRating);
}

export type RevisionDeps = {
  limit?: number;
  /** Overrides env lookup; null/empty forces the no-key skip path (tests). */
  apiKey?: string | null;
  fetchTurns?: (limit: number) => Promise<QaTurn[]>;
  scorer?: (question: string, answer: string) => Promise<RevisionScore | null>;
  saveKbDoc?: (turn: QaTurn, recurrenceCount: number) => Promise<void>;
  createTicketFn?: (turn: QaTurn, score: RevisionScore) => Promise<void>;
  recordGuardrailFn?: (turn: QaTurn, score: RevisionScore) => Promise<void>;
  touchCsatFn?: (turn: QaTurn) => Promise<void>;
};

/**
 * Run the daily revision pass. Without an API key it logs + skips (never
 * throws to cron). Per-turn failures are counted and the pass continues;
 * only an unexpected top-level fault throws, preserving the cron wrapper's
 * fail→streak→page alerting contract for genuine bugs.
 */
export async function runRevisionJob(
  date: string = new Date().toISOString().slice(0, 10),
  deps: RevisionDeps = {},
): Promise<RevisionJobResult> {
  const apiKey =
    deps.apiKey !== undefined ? deps.apiKey : process.env["OPENROUTER_API_KEY"];
  if (!resolveApiKey(apiKey ?? undefined)) {
    log("warn", "support.revision_no_api_key", { date, model: REVISION_MODEL });
    return {
      ok: true,
      skipped: true,
      date,
      reviewed: 0,
      revised: 0,
      hallucinations: 0,
      escalatedTickets: 0,
      kbCandidates: 0,
      csatTouched: 0,
      errors: 0,
      reason: "no_api_key",
    };
  }

  const limit = deps.limit ?? REVISION_DEFAULT_LIMIT;
  const fetchTurns = deps.fetchTurns ?? fetchRecentQaTurns;
  const scorer =
    deps.scorer ??
    ((q, a) =>
      scoreTurnWithInkling(q, a, { apiKey: apiKey ?? undefined }));
  const saveKbDoc = deps.saveKbDoc ?? defaultSaveKbCandidate;
  const createTicketFn = deps.createTicketFn ?? defaultCreateTicket;
  const recordGuardrailFn = deps.recordGuardrailFn ?? defaultRecordGuardrail;
  const touchCsatFn = deps.touchCsatFn ?? defaultTouchCsat;

  try {
    const turns = await fetchTurns(limit);
    const recurrence = new Map<string, number>();
    for (const t of turns) {
      const key = normalizeQuestion(t.question);
      recurrence.set(key, (recurrence.get(key) ?? 0) + 1);
    }

    const result: RevisionJobResult = {
      ok: true,
      skipped: false,
      date,
      reviewed: 0,
      revised: 0,
      hallucinations: 0,
      escalatedTickets: 0,
      kbCandidates: 0,
      csatTouched: 0,
      errors: 0,
    };

    for (const turn of turns) {
      let score: RevisionScore | null = null;
      try {
        score = await scorer(turn.question, turn.answer);
      } catch (err) {
        log("warn", "support.revision_turn_failed", {
          turn_id: turn.id,
          message: err instanceof Error ? err.message : "unknown",
        });
      }
      if (!score) {
        result.errors += 1;
        continue;
      }
      result.reviewed += 1;

      if (needsRevision(score) && score.revisedAnswer) {
        result.revised += 1;
        log("info", "support.revision_revised", {
          turn_id: turn.id,
          conversation_id: turn.conversationId,
          groundedness: score.groundedness,
          tone: score.tone,
        });
      }

      if (score.isHallucination) result.hallucinations += 1;

      if (shouldEscalateTicket(score)) {
        try {
          await recordGuardrailFn(turn, score);
          await createTicketFn(turn, score);
          result.escalatedTickets += 1;
        } catch (err) {
          result.errors += 1;
          log("warn", "support.revision_escalation_failed", {
            turn_id: turn.id,
            message: err instanceof Error ? err.message : "unknown",
          });
        }
      }

      const recurrences = recurrence.get(normalizeQuestion(turn.question)) ?? 0;
      if (shouldPromoteToKb(score, recurrences)) {
        try {
          await saveKbDoc(turn, recurrences);
          result.kbCandidates += 1;
        } catch (err) {
          result.errors += 1;
          log("warn", "support.revision_kb_failed", {
            turn_id: turn.id,
            message: err instanceof Error ? err.message : "unknown",
          });
        }
      }

      if (turn.csatRating != null && turn.conversationId) {
        try {
          await touchCsatFn(turn);
          result.csatTouched += 1;
        } catch (err) {
          result.errors += 1;
          log("warn", "support.revision_csat_failed", {
            turn_id: turn.id,
            message: err instanceof Error ? err.message : "unknown",
          });
        }
      }
    }

    incr("framique_support_revision_total", {
      outcome: result.errors ? "partial" : "ok",
    });
    log("info", "support.revision_completed", {
      date,
      reviewed: result.reviewed,
      revised: result.revised,
      hallucinations: result.hallucinations,
      escalatedTickets: result.escalatedTickets,
      kbCandidates: result.kbCandidates,
    });
    return result;
  } catch (err) {
    // Genuine fault: throw so the cron wrapper records a failed tick and the
    // consecutive-failure streak can page. (The no-key path above skips
    // quietly instead — an unconfigured key is not a fault.)
    const message = err instanceof Error ? err.message : "unknown";
    log("error", "support.revision_failed", { date, message });
    throw err;
  }
}
