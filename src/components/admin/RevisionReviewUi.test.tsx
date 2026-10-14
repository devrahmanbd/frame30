/**
 * V2 — Revision review desk UI.
 *
 * Covers the pure helpers (ReviewError → friendly copy, applied-action
 * parsing, status filter, score formatting) and the presentational queue
 * via renderToStaticMarkup: side-by-side replies, scores incl. properness
 * dimensions, severity, per-status actions, and empty/loading/error states.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  filterReviewsByStatus,
  formatScore,
  friendlyReviewError,
  parseAppliedAction,
  REVIEW_ERROR_COPY,
  REVISION_FILTERS,
  reviewErrorCode,
  RevisionReviewUi,
  type RevisionReviewUiProps,
} from "./RevisionReviewUi";
import type { DisplayReview } from "@/lib/support-revision-review.server";

function review(over: Partial<DisplayReview> = {}): DisplayReview {
  return {
    id: "rev-1",
    merchant_id: "m-1",
    conversation_id: "conv-1",
    turn_ref: "turn-1",
    original_reply: "I dunno, maybe refund.",
    revised_reply: "Kindly allow 2 days for delivery.",
    score_json: {
      groundedness: 0.2,
      tone: 0.4,
      policy: 0.9,
      properness: {
        clarity: 0.3,
        courtesy: 0.4,
        bnFluency: 0.6,
        humility: 0.7,
        noOverclaim: 0.8,
      },
      isHallucination: false,
      revisedAnswer: "Kindly allow 2 days for delivery.",
      unanswered: false,
      severity: "low",
      rationale: "vague and ungrounded",
    },
    severity: "low",
    rubric_version: "proper-v1",
    status: "pending",
    reviewer: null,
    reviewed_at: null,
    applied_action: null,
    created_at: new Date("2026-09-01T10:00:00Z").toISOString(),
    ...over,
  };
}

function props(
  over: Partial<RevisionReviewUiProps> = {},
): RevisionReviewUiProps {
  return {
    reviews: [],
    status: "pending",
    onStatusChange: vi.fn(),
    isPending: false,
    isError: false,
    onRetry: vi.fn(),
    applyResult: null,
    onApprove: vi.fn(async () => undefined),
    onReject: vi.fn(async () => undefined),
    onApply: vi.fn(async () => undefined),
    ...over,
  };
}

function html(p: RevisionReviewUiProps): string {
  return renderToStaticMarkup(createElement(RevisionReviewUi, p));
}

describe("reviewErrorCode", () => {
  it("extracts the code from a wrapped server error", () => {
    expect(reviewErrorCode(new Error("review_not_pending"))).toBe(
      "review_not_pending",
    );
    expect(
      reviewErrorCode(new Error("Server error: review_rescreen_blocked boom")),
    ).toBe("review_rescreen_blocked");
    expect(reviewErrorCode(new Error("boom"))).toBeNull();
    expect(reviewErrorCode(null)).toBeNull();
  });
});

describe("friendlyReviewError", () => {
  it("maps every documented ReviewError code to non-code copy (en + bn)", () => {
    for (const code of [
      "review_not_found",
      "review_not_pending",
      "review_not_approved",
      "review_rescreen_blocked",
    ]) {
      expect(REVIEW_ERROR_COPY[code]).toBeDefined();
      const en = friendlyReviewError(new Error(code), "en");
      const bn = friendlyReviewError(new Error(code), "bn");
      expect(en).not.toContain(code);
      expect(bn).not.toContain(code);
      expect(en.length).toBeGreaterThan(10);
      expect(bn.length).toBeGreaterThan(10);
    }
  });

  it("falls back to generic copy for unknown failures", () => {
    expect(friendlyReviewError(new Error("boom"))).not.toContain("boom");
    expect(friendlyReviewError(null)).toContain("Something went wrong");
  });
});

describe("parseAppliedAction", () => {
  it("parses kb / dpo / reject / null shapes", () => {
    expect(parseAppliedAction("kb_published:doc-1")).toEqual({
      kind: "kb",
      ref: "doc-1",
    });
    expect(parseAppliedAction("dpo_pair:row-2")).toEqual({
      kind: "dpo",
      ref: "row-2",
    });
    expect(parseAppliedAction("reject:too_harsh")).toEqual({
      kind: "reject",
      reason: "too_harsh",
    });
    expect(parseAppliedAction(null)).toBeNull();
  });
});

describe("filterReviewsByStatus + formatScore", () => {
  it("filters by status, passes all through", () => {
    const rows = [
      review({ id: "a", status: "pending" }),
      review({ id: "b", status: "approved" }),
    ];
    expect(filterReviewsByStatus(rows, "pending").map((r) => r.id)).toEqual([
      "a",
    ]);
    expect(filterReviewsByStatus(rows, "all")).toHaveLength(2);
  });

  it("formats finite numbers to 2dp, dashes the rest", () => {
    expect(formatScore(0.2)).toBe("0.20");
    expect(formatScore("x")).toBe("—");
  });
});

describe("RevisionReviewUi states", () => {
  it("renders loading, error+retry, and empty states", () => {
    expect(html(props({ isPending: true }))).toContain("Loading revisions");
    const err = html(props({ isError: true }));
    expect(err).toContain("could not be loaded");
    expect(err).toContain("Retry");
    expect(html(props({ reviews: [] }))).toContain("No revisions");
  });

  it("exposes exactly the pending/approved/rejected/applied filters", () => {
    expect(REVISION_FILTERS).toEqual([
      "pending",
      "approved",
      "rejected",
      "applied",
    ]);
    const out = html(props({ reviews: [] }));
    for (const s of REVISION_FILTERS) expect(out).toContain(s);
  });
});

describe("RevisionReviewUi queue", () => {
  it("shows original vs revised side-by-side with scores, properness and severity", () => {
    const out = html(props({ reviews: [review()] }));
    expect(out).toContain("I dunno, maybe refund.");
    expect(out).toContain("Kindly allow 2 days for delivery.");
    expect(out).toContain("Original reply");
    expect(out).toContain("Revised reply");
    expect(out).toContain("0.20");
    expect(out).toContain("Clarity");
    expect(out).toContain("Courtesy");
    expect(out).toContain("BN fluency");
    expect(out).toContain("Humility");
    expect(out).toContain("No overclaim");
    expect(out).toContain("low");
    expect(out).toContain("Approve");
    expect(out).toContain("Reject");
  });

  it("shows the apply action for approved rows", () => {
    const out = html(
      props({ status: "approved", reviews: [review({ status: "approved" })] }),
    );
    expect(out).toContain("Apply");
    expect(out).not.toContain("Rejection reason");
  });

  it("shows the kb_published result on applied rows and the reason on rejected rows", () => {
    const applied = html(
      props({
        status: "applied",
        reviews: [
          review({ status: "applied", applied_action: "kb_published:doc-9" }),
        ],
      }),
    );
    expect(applied).toContain("kb_published");
    expect(applied).toContain("doc-9");

    const rejected = html(
      props({
        status: "rejected",
        reviews: [
          review({ status: "rejected", applied_action: "reject:too_harsh" }),
        ],
      }),
    );
    expect(rejected).toContain("too_harsh");
  });

  it("announces the latest apply result banner", () => {
    const out = html(
      props({
        reviews: [review({ status: "approved" })],
        status: "approved",
        applyResult: { id: "rev-1", action: "dpo_pair", ref: "row-7" },
      }),
    );
    expect(out).toContain("training pair");
    expect(out).toContain("row-7");
  });
});
