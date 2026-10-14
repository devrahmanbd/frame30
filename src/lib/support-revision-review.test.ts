/**
 * V1 — Revision review store + apply pipeline.
 *
 * Covers: store CRUD + RLS-intent (tenant isolation at the query level),
 * approve rescreening (screenOutbound + redactPii), the isStyleOnly
 * comparator, missing-table degradation (never throws), list display
 * redaction, and applyApproved routing (KB published vs DPO pair).
 *
 * The store degrades to an in-memory fallback when Supabase is unconfigured
 * (this environment), mirroring support-callbacks / ai-training-data. The
 * recording-fake test proves the DB path scopes every list query by
 * merchant_id even when the database is present.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  REVIEW_RUBRIC_VERSION,
  applyApproved,
  approveRevision,
  clearInMemoryReviews,
  getInMemoryReviews,
  isMissingReviewTableError,
  isStoreUnavailableError,
  isStyleOnly,
  listRevisionReviews,
  persistRevisionReview,
  rejectRevision,
  ReviewError,
  type RevisionReviewRow,
} from "./support-revision-review.server";
import type { RevisionScore } from "./support-revision.server";

const MERCHANT_A = "11111111-1111-4111-8111-111111111111";
const MERCHANT_B = "22222222-2222-4222-8222-222222222222";

function score(over: Partial<RevisionScore> = {}): RevisionScore {
  return {
    groundedness: 0.2,
    tone: 0.8,
    policy: 0.9,
    properness: null,
    isHallucination: false,
    revisedAnswer: "Kindly allow 2 days for delivery.",
    unanswered: false,
    severity: "low",
    rationale: "test",
    ...over,
  };
}

/** Fake whose every query fails as if the migration never applied. */
function missingTableDb() {
  const err = new Error(
    'relation "public.support_revision_reviews" does not exist',
  ) as Error & { code: string };
  err.code = "42P01";
  return {
    from: () => {
      throw err;
    },
  };
}

/** Recording fake for the list path: proves merchant_id scoping. */
function recordingListDb(rows: Array<Record<string, unknown>>) {
  const seenEq: Array<[string, unknown]> = [];
  const db = {
    seenEq,
    from: (_table: string) => {
      const filters: Array<[string, unknown]> = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          seenEq.push([k, v]);
          return q;
        },
        order: () => q,
        limit: () => q,
        then: (resolve: (v: unknown) => void) =>
          resolve({
            data: rows.filter((r) => filters.every(([k, v]) => r[k] === v)),
            error: null,
          }),
      };
      return q;
    },
  };
  return db;
}

beforeEach(() => {
  clearInMemoryReviews();
});

describe("persist + list — CRUD and tenant isolation", () => {
  it("persists a poor revision as pending and lists it back", async () => {
    const res = await persistRevisionReview({
      merchantId: MERCHANT_A,
      conversationId: "conv-1",
      turnRef: "turn-1",
      originalReply: "I don't know.",
      revisedReply: "Kindly allow 2 days for delivery.",
      score: score(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.duplicate).toBe(false);
      expect(res.persisted).toBe("memory");
    }
    const listed = await listRevisionReviews(MERCHANT_A);
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe("pending");
    expect(listed[0].turn_ref).toBe("turn-1");
    expect(listed[0].rubric_version).toBe(REVIEW_RUBRIC_VERSION);
  });

  it("dedupes repeat persists of the same turn while pending", async () => {
    const input = {
      merchantId: MERCHANT_A,
      conversationId: "conv-1",
      turnRef: "turn-dupe",
      originalReply: "I don't know.",
      revisedReply: "Kindly allow 2 days for delivery.",
      score: score(),
    };
    const first = await persistRevisionReview(input);
    const second = await persistRevisionReview(input);
    expect(first.ok && (first as { id: string }).id).toBeTruthy();
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.duplicate).toBe(true);
    expect(getInMemoryReviews(MERCHANT_A)).toHaveLength(1);
  });

  it("isolates tenants at the query level (memory fallback)", async () => {
    await persistRevisionReview({
      merchantId: MERCHANT_A,
      turnRef: "a-1",
      originalReply: "a",
      revisedReply: "a revised",
      score: score(),
    });
    await persistRevisionReview({
      merchantId: MERCHANT_B,
      turnRef: "b-1",
      originalReply: "b",
      revisedReply: "b revised",
      score: score(),
    });
    const a = await listRevisionReviews(MERCHANT_A);
    const b = await listRevisionReviews(MERCHANT_B);
    expect(a.map((r) => r.turn_ref)).toEqual(["a-1"]);
    expect(b.map((r) => r.turn_ref)).toEqual(["b-1"]);
  });

  it("scopes the DB list query by merchant_id + status (RLS-intent)", async () => {
    const rows: Array<Record<string, unknown>> = [
      { id: "r1", merchant_id: MERCHANT_A, status: "pending", turn_ref: "a-p" },
      {
        id: "r2",
        merchant_id: MERCHANT_A,
        status: "approved",
        turn_ref: "a-a",
      },
      { id: "r3", merchant_id: MERCHANT_B, status: "pending", turn_ref: "b-p" },
    ];
    const db = recordingListDb(rows);
    const out = await listRevisionReviews(MERCHANT_A, "pending", db as never);
    expect(out.map((r) => (r as RevisionReviewRow).turn_ref)).toEqual(["a-p"]);
    expect(db.seenEq).toContainEqual(["merchant_id", MERCHANT_A]);
    expect(db.seenEq).toContainEqual(["status", "pending"]);
  });

  it("redacts PII in the display shape", async () => {
    await persistRevisionReview({
      merchantId: MERCHANT_A,
      turnRef: "pii-1",
      originalReply: "My email is customer@gmail.com sorry",
      revisedReply: "We will reply to customer@gmail.com shortly",
      score: score(),
    });
    const [row] = await listRevisionReviews(MERCHANT_A);
    expect(row.original_reply).not.toContain("customer@gmail.com");
    expect(row.original_reply).toContain("[email redacted]");
    expect(row.revised_reply).not.toContain("customer@gmail.com");
  });

  it("skips without a merchant instead of throwing", async () => {
    const res = await persistRevisionReview({
      merchantId: null,
      turnRef: "no-merchant",
      originalReply: "a",
      revisedReply: "b",
      score: score(),
    });
    expect(res.ok).toBe(false);
  });
});

describe("approve / reject lane", () => {
  async function queued(
    over: Partial<Parameters<typeof persistRevisionReview>[0]> = {},
  ) {
    const res = await persistRevisionReview({
      merchantId: MERCHANT_A,
      turnRef: `t-${Math.random().toString(36).slice(2, 8)}`,
      originalReply: "Delivery takes 2 days.",
      revisedReply: "Delivery takes 2 days, thank you for your patience.",
      score: score(),
      ...over,
    });
    if (!res.ok) throw new Error("setup persist failed");
    return res.id;
  }

  it("approves a pending row and records the reviewer", async () => {
    const id = await queued();
    const out = await approveRevision(id, "reviewer-1", null, {
      merchantId: MERCHANT_A,
    });
    expect(out.ok).toBe(true);
    const [row] = await listRevisionReviews(MERCHANT_A);
    expect(row.status).toBe("approved");
    expect(row.reviewer).toBe("reviewer-1");
  });

  it("redacts PII from an edited approval reply", async () => {
    const id = await queued();
    await approveRevision(id, "reviewer-1", "We will call 01712345678 soon", {
      merchantId: MERCHANT_A,
    });
    const [row] = await listRevisionReviews(MERCHANT_A);
    expect(row.revised_reply).not.toContain("01712345678");
    expect(row.revised_reply).toContain("[phone redacted]");
  });

  it("refuses a rescreen-blocked edit and leaves the row pending", async () => {
    const id = await queued();
    await expect(
      approveRevision(
        id,
        "reviewer-1",
        "Your refund of ৳9,999 has been initiated, I have processed it.",
        { merchantId: MERCHANT_A },
      ),
    ).rejects.toMatchObject({ code: "review_rescreen_blocked" });
    const [row] = await listRevisionReviews(MERCHANT_A);
    expect(row.status).toBe("pending");
  });

  it("refuses double approval and cross-tenant approval", async () => {
    const id = await queued();
    await approveRevision(id, "reviewer-1", null, { merchantId: MERCHANT_A });
    await expect(
      approveRevision(id, "reviewer-2", null, { merchantId: MERCHANT_A }),
    ).rejects.toMatchObject({ code: "review_not_pending" });
    await expect(
      approveRevision(id, "reviewer-2", null, { merchantId: MERCHANT_B }),
    ).rejects.toMatchObject({ code: "review_not_found" });
  });

  it("rejects with the reason recorded in applied_action", async () => {
    const id = await queued();
    await rejectRevision(id, "reviewer-9", "still overclaims", {
      merchantId: MERCHANT_A,
    });
    const [row] = await listRevisionReviews(MERCHANT_A);
    expect(row.status).toBe("rejected");
    expect(row.applied_action).toContain("still overclaims");
  });
});

describe("isStyleOnly comparator", () => {
  it("accepts identical and tone-only rephrases", () => {
    expect(
      isStyleOnly(
        "Hello. Delivery takes 2 days.",
        "Hello. Delivery takes 2 days.",
      ),
    ).toBe(true);
    expect(
      isStyleOnly(
        "Delivery takes 2 days. Track it in your account.",
        "Thank you for your patience! Delivery takes 2 days — you can track it in your account.",
      ),
    ).toBe(true);
  });

  it("rejects changed numbers, new authority claims and URLs", () => {
    expect(
      isStyleOnly("Delivery takes 2 days.", "Delivery takes 5 days."),
    ).toBe(false);
    expect(
      isStyleOnly(
        "Delivery takes 2 days.",
        "Delivery takes 2 days and costs ৳60.",
      ),
    ).toBe(false);
    expect(
      isStyleOnly(
        "Thanks for your patience.",
        "I have initiated your refund of ৳500.",
      ),
    ).toBe(false);
    expect(
      isStyleOnly("See our help page.", "See https://example.com/refund now."),
    ).toBe(false);
  });

  it("rejects empties and wholesale rewrites", () => {
    expect(isStyleOnly("", "Something polite.")).toBe(false);
    expect(isStyleOnly("Hi.", "Hi.")).toBe(true);
    expect(
      isStyleOnly(
        "Short note.",
        "This is a completely different and far longer explanation about shipping logistics, warehouse handling, courier partners, customs clearance and last-mile routing across all districts with many extra details appended.",
      ),
    ).toBe(false);
  });
});

describe("applyApproved routing", () => {
  async function approvedPair(original: string, revised: string) {
    const p = await persistRevisionReview({
      merchantId: MERCHANT_A,
      turnRef: `t-${Math.random().toString(36).slice(2, 8)}`,
      originalReply: original,
      revisedReply: revised,
      score: score({ revisedAnswer: revised }),
    });
    if (!p.ok) throw new Error("setup persist failed");
    await approveRevision(p.id, "reviewer-1", null, {
      merchantId: MERCHANT_A,
    });
    return p.id;
  }

  it("routes style-only revisions to a DPO training row", async () => {
    const id = await approvedPair(
      "Delivery takes 2 days. Track it in your account.",
      "Thank you for your patience! Delivery takes 2 days — you can track it in your account.",
    );
    const captured: Array<{
      merchantId: string;
      conversationId: string | null;
      userMessage: string;
      agentReply: string;
    }> = [];
    const out = await applyApproved(id, {
      merchantId: MERCHANT_A,
      fetchQuestion: async () => "How long is delivery?",
      captureTraining: async (a) => {
        captured.push({ ...a });
        return { id: "train-1" };
      },
    });
    expect(out.action).toBe("dpo_pair");
    expect(out.ref).toBe("train-1");
    expect(captured[0].agentReply).toContain("Thank you for your patience");
    expect(captured[0].userMessage).toBe("How long is delivery?");
    const [row] = await listRevisionReviews(MERCHANT_A);
    expect(row.status).toBe("applied");
    expect(row.applied_action).toContain("dpo_pair:train-1");
  });

  it("routes factual revisions to a published KB doc", async () => {
    const id = await approvedPair(
      "Delivery takes 2 days.",
      "Delivery takes 5 days across all districts.",
    );
    const saved: Array<{ merchantId: string; title: string; body: string }> =
      [];
    const out = await applyApproved(id, {
      merchantId: MERCHANT_A,
      saveKbDoc: async (a) => {
        saved.push({ ...a });
        return { id: "doc-1" };
      },
    });
    expect(out.action).toBe("kb_published");
    expect(out.ref).toBe("doc-1");
    expect(saved[0].body).toContain("Delivery takes 5 days");
    const [row] = await listRevisionReviews(MERCHANT_A);
    expect(row.status).toBe("applied");
    expect(row.applied_action).toContain("kb_published:doc-1");
  });

  it("refuses to apply non-approved rows", async () => {
    const p = await persistRevisionReview({
      merchantId: MERCHANT_A,
      turnRef: "not-approved",
      originalReply: "a",
      revisedReply: "b",
      score: score(),
    });
    if (!p.ok) throw new Error("setup persist failed");
    await expect(
      applyApproved(p.id, { merchantId: MERCHANT_A }),
    ).rejects.toMatchObject({
      code: "review_not_approved",
    });
  });
});

describe("missing-table degradation", () => {
  it("classifies missing-table failures and not real ones", () => {
    const missing = new Error(
      'relation "public.support_revision_reviews" does not exist',
    ) as Error & { code: string };
    missing.code = "42P01";
    expect(isMissingReviewTableError(missing)).toBe(true);
    expect(isStoreUnavailableError(missing)).toBe(true);
    expect(isMissingReviewTableError(new Error("kb_save_failed"))).toBe(false);
    expect(isStoreUnavailableError(new Error("kb_save_failed"))).toBe(false);
    const wrapped = { error: missing };
    expect(isMissingReviewTableError(wrapped)).toBe(true);
  });

  it("lists [] and persists to memory without throwing", async () => {
    const db = missingTableDb();
    await expect(
      listRevisionReviews(MERCHANT_A, null, db as never),
    ).resolves.toEqual([]);
    const res = await persistRevisionReview(
      {
        merchantId: MERCHANT_A,
        turnRef: "degraded-1",
        originalReply: "a",
        revisedReply: "b",
        score: score(),
      },
      db as never,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.persisted).toBe("memory");
  });

  it("approves via the memory fallback when the table is missing", async () => {
    const db = missingTableDb();
    const p = await persistRevisionReview(
      {
        merchantId: MERCHANT_A,
        turnRef: "degraded-2",
        originalReply: "a",
        revisedReply: "b",
        score: score(),
      },
      db as never,
    );
    if (!p.ok) throw new Error("setup persist failed");
    const out = await approveRevision(p.id, "reviewer-1", null, {
      merchantId: MERCHANT_A,
      db: db as never,
    });
    expect(out.ok).toBe(true);
    expect(out.persisted).toBe("memory");
  });

  it("surfaces ReviewError (not a throw-through) for unknown rows", async () => {
    await expect(
      approveRevision("nope", "reviewer-1", null, { merchantId: MERCHANT_A }),
    ).rejects.toBeInstanceOf(ReviewError);
  });
});
