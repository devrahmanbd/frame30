/**
 * R1 — Daily revision loop with Inkling.
 *
 * Covers: scoring-parser bounds, KB-candidate gating (never auto-publish),
 * severe-case ticket escalation, no-key degradation, registry entry validity.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KB_CANDIDATE_STATUS,
  PROPERNESS_THRESHOLD,
  RECURRING_UNANSWERED_THRESHOLD,
  REVISION_MODEL,
  REVISION_RUBRIC_VERSION,
  buildRevisionPrompt,
  needsRevision,
  normalizeQuestion,
  parseRevisionScore,
  runRevisionJob,
  shouldEscalateTicket,
  shouldPromoteToKb,
  type QaTurn,
  type RevisionScore,
} from "./support-revision.server";
import {
  cadenceSeconds,
  cronJob,
  parseCron,
} from "./cron-registry";

const SAVED_KEY = process.env["OPENROUTER_API_KEY"];

beforeEach(() => {
  delete process.env["OPENROUTER_API_KEY"];
});

afterEach(() => {
  if (SAVED_KEY === undefined) delete process.env["OPENROUTER_API_KEY"];
  else process.env["OPENROUTER_API_KEY"] = SAVED_KEY;
  vi.restoreAllMocks();
});

function turn(over: Partial<QaTurn> = {}): QaTurn {
  return {
    id: "turn-1",
    merchantId: "merchant-1",
    conversationId: "conv-1",
    turnIndex: 0,
    question: "How do I configure SteadFast webhook?",
    answer: "Go to settings and paste the URL.",
    csatRating: null,
    grounded: true,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

function score(over: Partial<RevisionScore> = {}): RevisionScore {
  return {
    groundedness: 0.9,
    tone: 0.9,
    policy: 0.9,
    properness: null,
    isHallucination: false,
    revisedAnswer: null,
    unanswered: false,
    severity: "none",
    rationale: "ok",
    ...over,
  };
}

describe("parseRevisionScore — bounded JSON", () => {
  it("parses a valid score object", () => {
    const s = parseRevisionScore({
      groundedness: 0.8,
      tone: 0.7,
      policy: 0.9,
      is_hallucination: false,
      revised_answer: null,
      unanswered: false,
      severity: "low",
      rationale: "minor tone issue",
    });
    expect(s).toMatchObject({
      groundedness: 0.8,
      tone: 0.7,
      policy: 0.9,
      severity: "low",
    });
  });

  it("parses fenced JSON strings from the model", () => {
    const s = parseRevisionScore(
      '```json\n{"groundedness":0.2,"tone":0.9,"policy":0.9,"is_hallucination":true,"revised_answer":"fixed","unanswered":false,"severity":"severe","rationale":"fabricated price"}\n```',
    );
    expect(s).toMatchObject({
      groundedness: 0.2,
      isHallucination: true,
      revisedAnswer: "fixed",
      severity: "severe",
    });
  });

  it("clamps out-of-range scores into [0,1]", () => {
    const s = parseRevisionScore({
      groundedness: 4.5,
      tone: -2,
      policy: "not-a-number",
    });
    expect(s!.groundedness).toBe(1);
    expect(s!.tone).toBe(0);
    expect(s!.policy).toBe(0.5);
  });

  it("falls back to none for unknown severities", () => {
    const s = parseRevisionScore({
      groundedness: 0.5,
      severity: "CRITICAL!!",
    });
    expect(s!.severity).toBe("none");
  });

  it("returns null for garbage, non-objects and scoreless objects", () => {
    expect(parseRevisionScore("not json at all")).toBeNull();
    expect(parseRevisionScore("```\nno braces here\n```")).toBeNull();
    expect(parseRevisionScore(null)).toBeNull();
    expect(parseRevisionScore(42)).toBeNull();
    expect(parseRevisionScore({ rationale: "no scores" })).toBeNull();
    expect(parseRevisionScore({})).toBeNull();
  });

  it("caps revised_answer and rationale lengths", () => {
    const s = parseRevisionScore({
      groundedness: 0.1,
      revised_answer: "x".repeat(9000),
      rationale: "y".repeat(9000),
    });
    expect(s!.revisedAnswer!.length).toBeLessThanOrEqual(4000);
    expect(s!.rationale.length).toBeLessThanOrEqual(500);
  });
});

describe("needsRevision / shouldEscalateTicket — routing gates", () => {
  it("flags poor groundedness or tone for revision", () => {
    expect(needsRevision(score({ groundedness: 0.2 }))).toBe(true);
    expect(needsRevision(score({ tone: 0.1 }))).toBe(true);
    expect(needsRevision(score())).toBe(false);
  });

  it("escalates hallucinations, severe verdicts and policy floor breaches", () => {
    expect(shouldEscalateTicket(score({ isHallucination: true }))).toBe(true);
    expect(shouldEscalateTicket(score({ severity: "severe" }))).toBe(true);
    expect(shouldEscalateTicket(score({ policy: 0.1 }))).toBe(true);
    expect(shouldEscalateTicket(score({ severity: "low" }))).toBe(false);
    expect(shouldEscalateTicket(score())).toBe(false);
  });
});

describe("shouldPromoteToKb — never auto-publish", () => {
  it("promotes recurring unanswered poor answers only", () => {
    const poor = score({ unanswered: true, groundedness: 0.2 });
    expect(
      shouldPromoteToKb(poor, RECURRING_UNANSWERED_THRESHOLD),
    ).toBe(true);
    expect(shouldPromoteToKb(poor, RECURRING_UNANSWERED_THRESHOLD - 1)).toBe(
      false,
    );
    expect(
      shouldPromoteToKb(score({ unanswered: false, groundedness: 0.2 }), 5),
    ).toBe(false);
    expect(
      shouldPromoteToKb(score({ unanswered: true, groundedness: 0.9 }), 5),
    ).toBe(false);
  });

  it("never promotes severe turns (ticket queue owns them)", () => {
    const severe = score({
      unanswered: true,
      groundedness: 0.1,
      isHallucination: true,
    });
    expect(shouldPromoteToKb(severe, 99)).toBe(false);
  });

  it("the candidate status constant is draft, never published", () => {
    expect(KB_CANDIDATE_STATUS).toBe("draft");
    expect(KB_CANDIDATE_STATUS).not.toBe("published");
  });
});

describe("normalizeQuestion — recurrence key", () => {
  it("folds case, punctuation and whitespace", () => {
    expect(normalizeQuestion("  How do I pay?? ")).toBe(
      normalizeQuestion("how DO i pay"),
    );
  });
});

describe("buildRevisionPrompt — key hygiene", () => {
  it("uses the Inkling model id without embedding any secret", () => {
    expect(REVISION_MODEL).toBe("thinkingmachines/inkling-small:free");
    expect(buildRevisionPrompt("q?", "a.")).toContain("groundedness");
    expect(buildRevisionPrompt("q?", "a.")).not.toMatch(/sk-or-v1-/);
  });
});

describe("runRevisionJob — severe escalation path", () => {
  it("records a guardrail event and opens a pending_approval ticket on severe", async () => {
    const guardrails: Array<{ turn: QaTurn; score: RevisionScore }> = [];
    const tickets: Array<{ turn: QaTurn; score: RevisionScore }> = [];
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [
        turn({ id: "t-severe", answer: "Refund of ৳9,999 initiated." }),
      ],
      scorer: async () =>
        score({
          groundedness: 0.1,
          policy: 0.1,
          isHallucination: true,
          severity: "severe",
          rationale: "fabricated refund",
        }),
      recordGuardrailFn: async (t, s) => {
        guardrails.push({ turn: t, score: s });
      },
      createTicketFn: async (t, s) => {
        tickets.push({ turn: t, score: s });
      },
    });
    expect(res.ok).toBe(true);
    expect(res.skipped).toBe(false);
    expect(res.reviewed).toBe(1);
    expect(res.hallucinations).toBe(1);
    expect(res.escalatedTickets).toBe(1);
    expect(guardrails).toHaveLength(1);
    expect(tickets).toHaveLength(1);
  });

  it("does NOT escalate clean turns", async () => {
    let tickets = 0;
    let guardrails = 0;
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [turn({ id: "t-clean" })],
      scorer: async () => score(),
      recordGuardrailFn: async () => {
        guardrails += 1;
      },
      createTicketFn: async () => {
        tickets += 1;
      },
    });
    expect(res.reviewed).toBe(1);
    expect(res.escalatedTickets).toBe(0);
    expect(tickets).toBe(0);
    expect(guardrails).toBe(0);
  });

  it("counts scorer failures as errors and continues", async () => {
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [turn({ id: "t-a" }), turn({ id: "t-b" })],
      scorer: async () => null,
    });
    expect(res.reviewed).toBe(0);
    expect(res.errors).toBe(2);
  });
});

describe("runRevisionJob — KB candidate gating", () => {
  it("saves recurring unanswered questions as drafts, never published", async () => {
    const saved: Array<{ status: string }> = [];
    const q = "Do you support EMI on Nagad payments?";
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [
        turn({ id: "u-1", question: q, answer: "I don't know." }),
        turn({ id: "u-2", question: `${q} `, answer: "Not sure." }),
      ],
      scorer: async () =>
        score({ groundedness: 0.2, tone: 0.8, unanswered: true }),
      saveKbDoc: async () => {
        // The job contract: candidates go through saveDoc as drafts.
        saved.push({ status: KB_CANDIDATE_STATUS });
      },
    });
    expect(res.kbCandidates).toBe(2);
    expect(saved.length).toBe(2);
    for (const s of saved) expect(s.status).toBe("draft");
  });
});

describe("runRevisionJob — CSAT-linked training rows", () => {
  it("touches training rows for rated turns only", async () => {
    const touched: string[] = [];
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [
        turn({ id: "c-1", csatRating: 2 }),
        turn({ id: "c-2", csatRating: null }),
      ],
      scorer: async () => score(),
      touchCsatFn: async (t) => {
        touched.push(t.id);
      },
    });
    expect(res.csatTouched).toBe(1);
    expect(touched).toEqual(["c-1"]);
  });
});

describe("runRevisionJob — no-key degradation", () => {
  it("logs + skips without calling the scorer and never throws", async () => {
    let scorerCalls = 0;
    const res = await runRevisionJob("2026-09-27", {
      apiKey: null,
      fetchTurns: async () => [turn()],
      scorer: async () => {
        scorerCalls += 1;
        return score();
      },
    });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("no_api_key");
    expect(res.reviewed).toBe(0);
    expect(scorerCalls).toBe(0);
  });

  it("also skips when the env key is absent entirely", async () => {
    const res = await runRevisionJob("2026-09-27", {
      fetchTurns: async () => {
        throw new Error("must not be called without a key");
      },
    });
    expect(res.skipped).toBe(true);
  });
});

describe("support-revision registry entry", () => {
  it("is registered with a daily schedule and sibling alerting policy", () => {
    const job = cronJob("support-revision");
    expect(job).not.toBeNull();
    expect(() => parseCron(job!.schedule)).not.toThrow();
    expect(job!.schedule).toBe("30 3 * * *");
    expect(job!.timeoutMs).toBeLessThanOrEqual(60_000);
    expect(job!.slaMaxDurationMs).toBeLessThanOrEqual(job!.timeoutMs);
    expect(job!.alertAfterFailures).toBeGreaterThanOrEqual(1);
    expect(job!.maxOverdueSeconds).toBeGreaterThanOrEqual(
      cadenceSeconds(job!.schedule) / 8,
    );
    expect(job!.severity).toBe("info");
    expect(job!.components).toContain("support");
    // It calls OpenRouter, so third-party honesty matters for status pages.
    expect(job!.touchesThirdParty).toBe(true);
  });

  it("has a route file wired through the shared wrapper", () => {
    const src = readFileSync(
      "src/routes/api/public/cron/support-revision.ts",
      "utf8",
    );
    expect(src).toContain("cronPost");
    expect(src).toContain("cronGet");
    expect(src.includes("authorizeCron")).toBe(false);
  });
});

describe("parseRevisionScore — properness rubric (proper-v1)", () => {
  it("parses the nested properness object", () => {
    const s = parseRevisionScore({
      groundedness: 0.8,
      tone: 0.8,
      policy: 0.9,
      properness: {
        clarity: 0.7,
        courtesy: 0.6,
        bn_fluency: 0.9,
        humility: 0.5,
        no_overclaim: 1,
      },
      severity: "none",
    });
    expect(s!.properness).toMatchObject({
      clarity: 0.7,
      courtesy: 0.6,
      bnFluency: 0.9,
      humility: 0.5,
      noOverclaim: 1,
    });
  });

  it("parses flat properness keys and clamps them", () => {
    const s = parseRevisionScore({
      groundedness: 0.8,
      clarity: 4,
      courtesy: -1,
      bn_fluency: "x",
    });
    expect(s!.properness).toMatchObject({
      clarity: 1,
      courtesy: 0,
      bnFluency: 0.5,
      humility: 0.5,
      noOverclaim: 0.5,
    });
  });

  it("leaves properness null for the legacy shape", () => {
    const s = parseRevisionScore({ groundedness: 0.8, tone: 0.7 });
    expect(s!.properness).toBeNull();
  });

  it("parses properness from fenced model JSON", () => {
    const s = parseRevisionScore(
      '```json\n{"groundedness":0.9,"tone":0.9,"policy":0.9,"properness":{"clarity":0.3,"courtesy":0.9,"bn_fluency":0.9,"humility":0.9,"no_overclaim":0.9},"is_hallucination":false,"revised_answer":"clearer","unanswered":false,"severity":"low","rationale":"unclear phrasing"}\n```',
    );
    expect(s!.properness!.clarity).toBe(0.3);
    expect(s!.revisedAnswer).toBe("clearer");
  });
});

describe("needsRevision — properness gating", () => {
  it("flags low properness dimensions even when the big three pass", () => {
    expect(PROPERNESS_THRESHOLD).toBe(0.5);
    expect(
      needsRevision(
        score({ properness: { clarity: 0.2, courtesy: 0.9, bnFluency: 0.9, humility: 0.9, noOverclaim: 0.9 } }),
      ),
    ).toBe(true);
    expect(
      needsRevision(
        score({ properness: { clarity: 0.9, courtesy: 0.9, bnFluency: 0.9, humility: 0.9, noOverclaim: 0.1 } }),
      ),
    ).toBe(true);
  });

  it("passes clean properness and keeps the legacy null path quiet", () => {
    expect(
      needsRevision(
        score({ properness: { clarity: 0.9, courtesy: 0.9, bnFluency: 0.9, humility: 0.9, noOverclaim: 0.9 } }),
      ),
    ).toBe(false);
    expect(needsRevision(score())).toBe(false);
  });
});

describe("buildRevisionPrompt — properness rubric", () => {
  it("asks for all five properness dimensions with the rubric pin", () => {
    const prompt = buildRevisionPrompt("q?", "a.");
    for (const axis of ["clarity", "courtesy", "bn_fluency", "humility", "no_overclaim"]) {
      expect(prompt).toContain(axis);
    }
    expect(prompt).toContain(REVISION_RUBRIC_VERSION);
    expect(REVISION_RUBRIC_VERSION).toBe("proper-v1");
  });
});

describe("runRevisionJob — review-store persist path", () => {
  it("queues poor revisions via the injected persist fn", async () => {
    const queued: Array<{ turn: QaTurn; score: RevisionScore }> = [];
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [turn({ id: "t-poor" })],
      scorer: async () =>
        score({ groundedness: 0.2, revisedAnswer: "fixed draft" }),
      persistReviewFn: async (t, s) => {
        queued.push({ turn: t, score: s });
      },
    });
    expect(res.revised).toBe(1);
    expect(queued).toHaveLength(1);
    expect(queued[0].turn.id).toBe("t-poor");
    expect(res.persistedReviews).toBe(1);
  });

  it("queues severe turns even without a revised draft", async () => {
    let calls = 0;
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [turn({ id: "t-severe" })],
      scorer: async () =>
        score({ severity: "severe", isHallucination: true, revisedAnswer: null }),
      persistReviewFn: async () => {
        calls += 1;
      },
    });
    expect(res.escalatedTickets).toBe(1);
    expect(calls).toBe(1);
    expect(res.persistedReviews).toBe(1);
  });

  it("skips the store for clean turns", async () => {
    let calls = 0;
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [turn({ id: "t-clean" })],
      scorer: async () => score(),
      persistReviewFn: async () => {
        calls += 1;
      },
    });
    expect(calls).toBe(0);
    expect(res.persistedReviews).toBe(0);
  });

  it("keeps job-result behaviour when the persist fn throws", async () => {
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [turn({ id: "t-poor" })],
      scorer: async () =>
        score({ groundedness: 0.1, revisedAnswer: "fixed draft" }),
      persistReviewFn: async () => {
        throw new Error("store down");
      },
    });
    expect(res.ok).toBe(true);
    expect(res.revised).toBe(1);
    expect(res.errors).toBe(0);
    expect(res.persistedReviews).toBe(0);
  });

  it("persists to the review store by default (memory fallback offline)", async () => {
    const { clearInMemoryReviews, listRevisionReviews } = await import(
      "./support-revision-review.server"
    );
    clearInMemoryReviews();
    const res = await runRevisionJob("2026-09-27", {
      apiKey: "test-key",
      fetchTurns: async () => [
        turn({ id: "t-default", merchantId: "merchant-1" }),
      ],
      scorer: async () =>
        score({ groundedness: 0.1, revisedAnswer: "fixed draft" }),
    });
    expect(res.persistedReviews).toBe(1);
    const rows = await listRevisionReviews("merchant-1");
    expect(rows.map((r) => r.turn_ref)).toContain("t-default");
    clearInMemoryReviews();
  });
});
