/**
 * Revision review store + apply pipeline (V1).
 *
 * The daily job `runRevisionJob` (support-revision.server.ts) scores turns
 * with Inkling. Poor / severe turns used to live only in the job-result log —
 * nothing persisted, nothing improved. This module is the persistence +
 * human-approval lane:
 *
 *   persist (job, best-effort) → pending → approve / reject (operator)
 *   → applyApproved routes to exactly one of:
 *     (a) KB doc update via `saveDoc` with status `published`, when the
 *         revision carries merchant-policy facts (NOT style-only), or
 *     (b) a training-pair export row for DPO (`captureTrainingTurn`,
 *         preferred answer = revised) for tone/clarity-only revisions.
 *
 * Apply-pipeline decisions (explicit, strict):
 *   - `applyApproved` only runs on rows with status `approved`. Anything else
 *     throws `ReviewError("review_not_approved")` — the ticket queue owns
 *     severe turns, the KB owns drafts; this lane never auto-applies.
 *   - `isStyleOnly` is deliberately strict: any changed number / money
 *     figure, URL, authority signal (refund, guarantee, promise, initiated…),
 *     length ratio outside [0.4, 2.0], or token Jaccard < 0.45 routes to the
 *     KB path, never to DPO. DPO pairs must be pure style preferences.
 *   - The DPO row is recorded with `csatRating: 5` + a
 *     `revision-approved:<id>` provenance review: reviewer approval IS the
 *     human-preference signal the DPO chosen-pool selects on. The original
 *     reply stays the implicit rejected side via the low-reward pool.
 *   - `approveRevision` re-screens the (optionally edited) candidate through
 *     `screenOutbound` + `redactPii` before storing. A blocked candidate
 *     throws `ReviewError("review_rescreen_blocked")` and the row is untouched.
 *   - Rejection reasons travel in `applied_action` (`reject:<reason>`) — the
 *     table carries no separate reason column by design (migration keeps the
 *     exact column list in the task spec).
 *
 * Availability contract: every exported function runs with the table missing
 * (migration in supabase/pending/support_revision_reviews.sql is UNAPPLIED).
 * Missing-table / unreachable-store failures log
 * `support.revision_review_store_unavailable` and fall back to the in-memory
 * store — they never throw. Real validation faults (not found, wrong status,
 * rescreen-blocked) throw `ReviewError`. The `persisted: "db" | "memory"`
 * field on results tells callers which path served the call.
 *
 * Tenant isolation is enforced at the query level: every DB read/write carries
 * `.eq("merchant_id", merchantId)` (mirroring listTickets / updateTicket in
 * support-tickets.server.ts), and the in-memory fallback filters on the same
 * key. RLS in the migration mirrors the sibling support tables
 * (viewer read / editor write via `has_merchant_role`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log } from "./observability.server";
import { redactPii, screenOutbound } from "./support-guardrails";
import {
  REVISION_RUBRIC_VERSION,
  type RevisionScore,
  type RevisionSeverity,
} from "./support-revision.server";

type Client = SupabaseClient<Database>;
/** Minimal query-builder surface so tests can inject fakes. */
type LooseDb = {
  from: (table: string) => any;
};

export const REVISION_REVIEWS_TABLE = "support_revision_reviews";
/** Re-exported rubric pin: rows stamped with this must match the scorer. */
export const REVIEW_RUBRIC_VERSION = REVISION_RUBRIC_VERSION;

export type ReviewStatus = "pending" | "approved" | "rejected" | "applied";

export type RevisionReviewRow = {
  id: string;
  merchant_id: string;
  conversation_id: string | null;
  turn_ref: string;
  original_reply: string;
  revised_reply: string;
  score_json: RevisionScore & Record<string, unknown>;
  severity: RevisionSeverity;
  rubric_version: string;
  status: ReviewStatus;
  reviewer: string | null;
  reviewed_at: string | null;
  applied_action: string | null;
  created_at: string;
};

/** PII-redacted display shape for the operator UI lane. */
export type DisplayReview = Omit<
  RevisionReviewRow,
  "original_reply" | "revised_reply"
> & {
  original_reply: string;
  revised_reply: string;
};

export class ReviewError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ReviewError";
  }
}

/** True when the failure is "the review table does not exist yet". */
export function isMissingReviewTableError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^(42P01|PGRST201|PGRST205)$/i.test(code)) {
    return true;
  }
  const inner = (err as { error?: unknown } | null)?.error;
  if (inner && inner !== err && isMissingReviewTableError(inner)) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (
    /support_revision_reviews/i.test(msg) &&
    /does not exist|schema cache|could not find/i.test(msg)
  ) {
    return true;
  }
  return false;
}

/**
 * True when the store cannot serve this call at all: table missing (pending
 * migration), Supabase unreachable / unconfigured (offline tests, local dev),
 * or a transport failure. Genuine DB faults (constraint, RLS denial) return
 * false so they surface as `ReviewError` instead of silently degrading.
 */
export function isStoreUnavailableError(err: unknown): boolean {
  if (isMissingReviewTableError(err)) return true;
  const inner = (err as { error?: unknown } | null)?.error;
  if (inner && inner !== err && isStoreUnavailableError(inner)) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /missing supabase environment|failed to fetch|fetch failed|network|econnrefused|enotfound|timeout|abort/i.test(
    msg,
  );
}

function storeUnavailable(reason: string, fields: Record<string, unknown>) {
  log("warn", "support.revision_review_store_unavailable", {
    reason,
    ...fields,
  });
}

/** In-memory store for offline tests / local dev (mirrors support-callbacks). */
const IN_MEMORY_REVIEWS: RevisionReviewRow[] = [];

export function clearInMemoryReviews() {
  IN_MEMORY_REVIEWS.length = 0;
}

export function getInMemoryReviews(merchantId: string): RevisionReviewRow[] {
  return IN_MEMORY_REVIEWS.filter((r) => r.merchant_id === merchantId);
}

async function serviceDb(db?: LooseDb | Client | null): Promise<LooseDb> {
  if (db) return db as LooseDb;
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseDb;
}

function toRow(raw: Record<string, unknown>): RevisionReviewRow {
  return {
    id: String(raw["id"] ?? ""),
    merchant_id: String(raw["merchant_id"] ?? ""),
    conversation_id:
      typeof raw["conversation_id"] === "string"
        ? (raw["conversation_id"] as string)
        : null,
    turn_ref: String(raw["turn_ref"] ?? ""),
    original_reply: String(raw["original_reply"] ?? ""),
    revised_reply: String(raw["revised_reply"] ?? ""),
    score_json: (raw["score_json"] ?? {}) as RevisionReviewRow["score_json"],
    severity:
      raw["severity"] === "severe"
        ? "severe"
        : raw["severity"] === "low"
          ? "low"
          : "none",
    rubric_version: String(raw["rubric_version"] ?? REVIEW_RUBRIC_VERSION),
    status: (raw["status"] ?? "pending") as ReviewStatus,
    reviewer: typeof raw["reviewer"] === "string" ? raw["reviewer"] : null,
    reviewed_at:
      typeof raw["reviewed_at"] === "string" ? raw["reviewed_at"] : null,
    applied_action:
      typeof raw["applied_action"] === "string" ? raw["applied_action"] : null,
    created_at: String(raw["created_at"] ?? new Date().toISOString()),
  };
}

function toDisplay(row: RevisionReviewRow): DisplayReview {
  return {
    ...row,
    original_reply: redactPii(row.original_reply).text,
    revised_reply: redactPii(row.revised_reply).text,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// isStyleOnly — strict tone/clarity-only comparator
// ─────────────────────────────────────────────────────────────────────────────

const FACT_AUTHORITY_RE =
  /refund|reimburse|guarantee|promise|initiated|processed|issued|completed|dispatched|will cancel|cancelled|price|discount|delivery date|in stock|stock|৳|\bBDT\b|\bTk\.?/i;
const NUMBER_RE = /[৳$]?\d[\d,]*\.?\d*/g;
const URL_RE = /https?:\/\/\S+|\b[\w-]+\.(com|bd|net|org|io|co)\S*/gi;

function numberSet(text: string): string[] {
  return (text.match(NUMBER_RE) ?? [])
    .map((n) => n.replace(/[৳$,\s]/g, ""))
    .filter(Boolean)
    .sort();
}

function urlSet(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((u) => u.toLowerCase()).sort();
}

function tokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
  return new Set(words);
}

/**
 * True ONLY when the edit is tone/clarity with no factual claim changed.
 * Any changed number/money figure, URL, authority signal, a length ratio
 * outside [0.4, 2.0], or token Jaccard < 0.45 returns false (KB path).
 */
export function isStyleOnly(original: string, revised: string): boolean {
  const a = (original ?? "").trim();
  const b = (revised ?? "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const ratio = b.length / a.length;
  if (ratio > 2 || ratio < 0.4) return false;
  const na = numberSet(a);
  const nb = numberSet(b);
  if (na.join("|") !== nb.join("|")) return false;
  if (urlSet(a).join("|") !== urlSet(b).join("|")) return false;
  if (FACT_AUTHORITY_RE.test(a) !== FACT_AUTHORITY_RE.test(b)) return false;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const jaccard = inter / (ta.size + tb.size - inter);
  return jaccard >= 0.45;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persist (daily-job path, best-effort)
// ─────────────────────────────────────────────────────────────────────────────

export type PersistReviewInput = {
  merchantId: string | null;
  conversationId?: string | null;
  turnRef: string;
  originalReply: string;
  revisedReply: string;
  score: RevisionScore;
};

export type PersistReviewResult =
  | { ok: true; id: string; duplicate: boolean; persisted: "db" | "memory" }
  | { ok: false; reason: string; persisted: "memory" };

/**
 * Queue a poor/severe revision for human review. Idempotent per
 * merchant + turn_ref while a row is still pending. Best-effort: any store
 * outage logs and resolves `{ ok: false }` — never throws into the job.
 */
export async function persistRevisionReview(
  input: PersistReviewInput,
  db?: LooseDb | Client | null,
): Promise<PersistReviewResult> {
  const merchantId = input.merchantId;
  if (!merchantId) {
    return { ok: false, reason: "missing_merchant", persisted: "memory" };
  }
  const revised = (input.revisedReply ?? "").trim();
  if (!revised) {
    return { ok: false, reason: "empty_revision", persisted: "memory" };
  }
  const scoreJson = { ...input.score } as RevisionReviewRow["score_json"];
  const severity = input.score.severity;

  // Memory dedupe first (covers offline + already-queued turns).
  const memDupe = IN_MEMORY_REVIEWS.find(
    (r) =>
      r.merchant_id === merchantId &&
      r.turn_ref === input.turnRef &&
      r.status === "pending",
  );
  if (memDupe) {
    return { ok: true, id: memDupe.id, duplicate: true, persisted: "memory" };
  }

  try {
    const client = await serviceDb(db);
    const { data: existing } = await client
      .from(REVISION_REVIEWS_TABLE)
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("turn_ref", input.turnRef)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        id: String((existing as { id: unknown }).id),
        duplicate: true,
        persisted: "db",
      };
    }
    const { data, error } = await client
      .from(REVISION_REVIEWS_TABLE)
      .insert({
        merchant_id: merchantId,
        conversation_id: input.conversationId ?? null,
        turn_ref: input.turnRef,
        original_reply: redactPii(input.originalReply).text.slice(0, 4000),
        revised_reply: redactPii(revised).text.slice(0, 4000),
        score_json: scoreJson as never,
        severity,
        rubric_version: REVIEW_RUBRIC_VERSION,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new ReviewError("review_persist_failed");
    incr("framique_support_revision_review_total", { action: "queued" });
    return {
      ok: true,
      id: String((data as { id: unknown }).id),
      duplicate: false,
      persisted: "db",
    };
  } catch (err) {
    if (!isStoreUnavailableError(err)) {
      log("warn", "support.revision_review_persist_failed", {
        merchant_id: merchantId,
        turn_ref: input.turnRef,
        message: err instanceof Error ? err.message : "unknown",
      });
    } else {
      storeUnavailable("persist", {
        merchant_id: merchantId,
        turn_ref: input.turnRef,
      });
    }
    const row: RevisionReviewRow = {
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      merchant_id: merchantId,
      conversation_id: input.conversationId ?? null,
      turn_ref: input.turnRef,
      original_reply: redactPii(input.originalReply).text.slice(0, 4000),
      revised_reply: redactPii(revised).text.slice(0, 4000),
      score_json: scoreJson,
      severity,
      rubric_version: REVIEW_RUBRIC_VERSION,
      status: "pending",
      reviewer: null,
      reviewed_at: null,
      applied_action: null,
      created_at: new Date().toISOString(),
    };
    IN_MEMORY_REVIEWS.push(row);
    return { ok: true, id: row.id, duplicate: false, persisted: "memory" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator lane: list / approve / reject
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List reviews for one merchant (tenant-isolated at the query level),
 * optionally filtered by status. Replies are PII-redacted for display.
 * Never throws on store outage — returns `[]` after logging.
 */
export async function listRevisionReviews(
  merchantId: string,
  status?: ReviewStatus | "all" | null,
  db?: LooseDb | Client | null,
): Promise<DisplayReview[]> {
  try {
    const client = await serviceDb(db);
    let q = client
      .from(REVISION_REVIEWS_TABLE)
      .select(
        "id, merchant_id, conversation_id, turn_ref, original_reply, revised_reply, score_json, severity, rubric_version, status, reviewer, reviewed_at, applied_action, created_at",
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status && status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) =>
      toDisplay(toRow(r)),
    );
  } catch (err) {
    if (!isStoreUnavailableError(err)) {
      log("warn", "support.revision_review_list_failed", {
        merchant_id: merchantId,
        message: err instanceof Error ? err.message : "unknown",
      });
    } else {
      storeUnavailable("list", { merchant_id: merchantId });
    }
    return getInMemoryReviews(merchantId)
      .filter((r) => !status || status === "all" || r.status === status)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 200)
      .map(toDisplay);
  }
}

async function findReview(
  client: LooseDb,
  merchantId: string | null | undefined,
  id: string,
): Promise<RevisionReviewRow | null> {
  let q = client
    .from(REVISION_REVIEWS_TABLE)
    .select(
      "id, merchant_id, conversation_id, turn_ref, original_reply, revised_reply, score_json, severity, rubric_version, status, reviewer, reviewed_at, applied_action, created_at",
    )
    .eq("id", id);
  if (merchantId) q = q.eq("merchant_id", merchantId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toRow(data as Record<string, unknown>);
}

function findMemoryReview(
  merchantId: string | null | undefined,
  id: string,
): RevisionReviewRow | null {
  return (
    IN_MEMORY_REVIEWS.find(
      (r) => r.id === id && (!merchantId || r.merchant_id === merchantId),
    ) ?? null
  );
}

export type ReviewActorOpts = {
  merchantId?: string | null;
  db?: LooseDb | Client | null;
};

/**
 * Approve a pending revision. The (optionally edited) candidate is re-screened
 * via `screenOutbound` + `redactPii` before storing; a blocked candidate
 * throws and leaves the row untouched. Only `pending` rows can be approved.
 */
export async function approveRevision(
  id: string,
  reviewer: string,
  editedReply?: string | null,
  opts: ReviewActorOpts = {},
): Promise<{ ok: true; id: string; persisted: "db" | "memory" }> {
  const candidate = (editedReply ?? "").trim();
  // Screen BEFORE touching the store so a blocked edit never persists.
  if (candidate) {
    const verdict = screenOutbound(candidate, { pinned: false });
    if (!verdict.allowed) {
      throw new ReviewError("review_rescreen_blocked");
    }
  }
  const now = new Date().toISOString();
  const applyPatch = (row: RevisionReviewRow) => {
    if (row.status !== "pending") throw new ReviewError("review_not_pending");
    row.status = "approved";
    row.reviewer = reviewer.slice(0, 120);
    row.reviewed_at = now;
    if (candidate) row.revised_reply = redactPii(candidate).text.slice(0, 4000);
  };

  try {
    const client = await serviceDb(opts.db);
    const row = await findReview(client, opts.merchantId, id);
    if (!row) throw new ReviewError("review_not_found");
    applyPatch(row);
    const patch: Record<string, unknown> = {
      status: "approved",
      reviewer: row.reviewer,
      reviewed_at: now,
    };
    if (candidate) patch["revised_reply"] = row.revised_reply;
    let q = client.from(REVISION_REVIEWS_TABLE).update(patch).eq("id", id);
    if (opts.merchantId) q = q.eq("merchant_id", opts.merchantId);
    const { error } = await q;
    if (error) throw error;
    incr("framique_support_revision_review_total", { action: "approved" });
    log("info", "support.revision_review_approved", {
      merchant_id: row.merchant_id,
      review_id: id,
    });
    return { ok: true, id, persisted: "db" };
  } catch (err) {
    if (err instanceof ReviewError) throw err;
    if (!isStoreUnavailableError(err))
      throw new ReviewError("review_approve_failed");
    storeUnavailable("approve", { review_id: id });
    const mem = findMemoryReview(opts.merchantId, id);
    if (!mem) throw new ReviewError("review_not_found");
    applyPatch(mem);
    return { ok: true, id, persisted: "memory" };
  }
}

/**
 * Reject a pending revision. The reason is recorded in `applied_action` as
 * `reject:<reason>` (the table carries no separate reason column).
 */
export async function rejectRevision(
  id: string,
  reviewer: string,
  reason?: string | null,
  opts: ReviewActorOpts = {},
): Promise<{ ok: true; id: string; persisted: "db" | "memory" }> {
  const now = new Date().toISOString();
  const appliedAction = `reject:${(reason ?? "no_reason").slice(0, 300)}`;
  const applyPatch = (row: RevisionReviewRow) => {
    if (row.status !== "pending") throw new ReviewError("review_not_pending");
    row.status = "rejected";
    row.reviewer = reviewer.slice(0, 120);
    row.reviewed_at = now;
    row.applied_action = appliedAction;
  };

  try {
    const client = await serviceDb(opts.db);
    const row = await findReview(client, opts.merchantId, id);
    if (!row) throw new ReviewError("review_not_found");
    applyPatch(row);
    let q = client
      .from(REVISION_REVIEWS_TABLE)
      .update({
        status: "rejected",
        reviewer: row.reviewer,
        reviewed_at: now,
        applied_action: appliedAction,
      })
      .eq("id", id);
    if (opts.merchantId) q = q.eq("merchant_id", opts.merchantId);
    const { error } = await q;
    if (error) throw error;
    incr("framique_support_revision_review_total", { action: "rejected" });
    log("info", "support.revision_review_rejected", {
      merchant_id: row.merchant_id,
      review_id: id,
    });
    return { ok: true, id, persisted: "db" };
  } catch (err) {
    if (err instanceof ReviewError) throw err;
    if (!isStoreUnavailableError(err))
      throw new ReviewError("review_reject_failed");
    storeUnavailable("reject", { review_id: id });
    const mem = findMemoryReview(opts.merchantId, id);
    if (!mem) throw new ReviewError("review_not_found");
    applyPatch(mem);
    return { ok: true, id, persisted: "memory" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply lane: approved → KB published doc OR DPO training row
// ─────────────────────────────────────────────────────────────────────────────

export type ApplyApprovedOpts = ReviewActorOpts & {
  /** Override for tests / offline (defaults to saveDoc published). */
  saveKbDoc?: (args: {
    merchantId: string;
    title: string;
    body: string;
  }) => Promise<{ id: string }>;
  /** Override for tests / offline (defaults to captureTrainingTurn). */
  captureTraining?: (args: {
    merchantId: string;
    conversationId: string | null;
    userMessage: string;
    agentReply: string;
  }) => Promise<{ id: string }>;
  /** Override for tests (defaults to ai_training_conversations lookup). */
  fetchQuestion?: (
    turnRef: string,
    conversationId: string | null,
  ) => Promise<string | null>;
};

export type ApplyApprovedResult = {
  ok: true;
  id: string;
  action: "kb_published" | "dpo_pair";
  ref: string;
  persisted: "db" | "memory";
};

async function defaultFetchQuestion(
  turnRef: string,
  merchantId: string,
): Promise<string | null> {
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as unknown as LooseDb)
      .from("ai_training_conversations")
      .select("user_turn")
      .eq("merchant_id", merchantId)
      .eq("id", turnRef)
      .maybeSingle();
    const q = (data as { user_turn?: unknown } | null)?.user_turn;
    return typeof q === "string" && q.trim() ? q : null;
  } catch {
    return null;
  }
}

async function defaultSaveKbDoc(args: {
  merchantId: string;
  title: string;
  body: string;
  actor: string;
}): Promise<{ id: string }> {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const { saveDoc } = await import("./support-kb.server");
  const out = await saveDoc(
    supabaseAdmin as never,
    args.merchantId,
    args.actor,
    {
      title: args.title.slice(0, 200),
      body: args.body.slice(0, 20_000),
      locale: "en",
      status: "published",
      tags: ["revision-applied"],
      sourceUrl: null,
    },
  );
  return { id: String(out.id) };
}

async function defaultCaptureTraining(args: {
  merchantId: string;
  conversationId: string | null;
  userMessage: string;
  agentReply: string;
  provenance: string;
}): Promise<{ id: string }> {
  const { captureTrainingTurn } = await import("./ai-training-data.server");
  const rec = await captureTrainingTurn({
    merchantId: args.merchantId,
    conversationId: args.conversationId,
    userMessage: args.userMessage,
    agentReply: args.agentReply,
    grounded: true,
    actionCompleted: "answered",
    csatRating: 5,
    csatReview: args.provenance,
  });
  return { id: rec.id };
}

/**
 * Apply an approved revision. Routes to exactly one lane:
 *   (a) factual/policy-fact change (!isStyleOnly) → KB `published` doc;
 *   (b) style-only → DPO training row (preferred answer = revised).
 * Records `applied_action` and flips status to `applied`. Only `approved`
 * rows apply; the candidate is re-screened before either lane fires.
 */
export async function applyApproved(
  id: string,
  opts: ApplyApprovedOpts = {},
): Promise<ApplyApprovedResult> {
  let row: RevisionReviewRow | null = null;
  let persisted: "db" | "memory" = "memory";
  try {
    const client = await serviceDb(opts.db);
    row = await findReview(client, opts.merchantId, id);
    persisted = "db";
    if (!row) throw new ReviewError("review_not_found");
  } catch (err) {
    if (err instanceof ReviewError) throw err;
    if (!isStoreUnavailableError(err))
      throw new ReviewError("review_apply_failed");
    storeUnavailable("apply_load", { review_id: id });
    row = findMemoryReview(opts.merchantId, id);
    if (!row) throw new ReviewError("review_not_found");
  }
  const target = row as RevisionReviewRow;
  if (target.status !== "approved") {
    throw new ReviewError("review_not_approved");
  }

  const candidate = target.revised_reply;
  const verdict = screenOutbound(candidate, { pinned: false });
  if (!verdict.allowed) throw new ReviewError("review_rescreen_blocked");
  const clean = redactPii(candidate).text.slice(0, 4000);
  const styleOnly = isStyleOnly(target.original_reply, clean);

  let action: ApplyApprovedResult["action"];
  let ref: string;
  if (!styleOnly) {
    const save =
      opts.saveKbDoc ??
      ((a) =>
        defaultSaveKbDoc({
          ...a,
          actor: target.reviewer ?? "system:support-revision",
        }));
    const doc = await save({
      merchantId: target.merchant_id,
      title: `Approved revision: ${target.turn_ref.slice(0, 80)}`,
      body: [
        `Approved revision of turn ${target.turn_ref} (rubric ${target.rubric_version}, severity ${target.severity}).`,
        "",
        `Original: ${redactPii(target.original_reply).text.slice(0, 1500)}`,
        "",
        `Approved answer: ${clean}`,
      ].join("\n"),
    });
    action = "kb_published";
    ref = doc.id;
  } else {
    const question =
      (await (opts.fetchQuestion
        ? opts.fetchQuestion(target.turn_ref, target.conversation_id)
        : defaultFetchQuestion(target.turn_ref, target.merchant_id))) ??
      `Revision ${target.turn_ref}`;
    const capture =
      opts.captureTraining ??
      ((a) =>
        defaultCaptureTraining({
          ...a,
          provenance: `revision-approved:${target.id} by ${target.reviewer ?? "unknown"}`,
        }));
    const rec = await capture({
      merchantId: target.merchant_id,
      conversationId: target.conversation_id,
      userMessage: question,
      agentReply: clean,
    });
    action = "dpo_pair";
    ref = rec.id;
  }

  const appliedAction = `${action}:${ref}`.slice(0, 300);
  const markApplied = (r: RevisionReviewRow) => {
    r.status = "applied";
    r.applied_action = appliedAction;
  };

  if (persisted === "db") {
    try {
      const client = await serviceDb(opts.db);
      let q = client
        .from(REVISION_REVIEWS_TABLE)
        .update({ status: "applied", applied_action: appliedAction })
        .eq("id", id);
      if (opts.merchantId) q = q.eq("merchant_id", opts.merchantId);
      const { error } = await q;
      if (error) throw error;
    } catch (err) {
      if (!isStoreUnavailableError(err))
        throw new ReviewError("review_apply_failed");
      storeUnavailable("apply_mark", { review_id: id });
      persisted = "memory";
    }
  }
  markApplied(target);
  incr("framique_support_revision_review_total", { action });
  log("info", "support.revision_review_applied", {
    merchant_id: target.merchant_id,
    review_id: id,
    action,
  });
  return { ok: true, id, action, ref, persisted };
}
