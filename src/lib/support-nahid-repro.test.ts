/**
 * Nahid repro — AI support widget failing conversation.
 * RED-first regression tests (must fail before fix, pass after).
 *
 * 1. Greeting "Hi" returns greeting (normal + degraded), never refusal.
 * 2. Low-relevance retrieval (ERP vs logistics) never presents wrong-topic answer.
 * 3. Fallback is tiered/compact: clarify → suggest → single handoff (not 4-option wall).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { resetRateLimitCircuitBreaker } from "./rate-limit.server";
import {
  runSupportAgentTurn,
  EPISTEMIC_ADMISSION_EN,
  isGreetingMessage,
  buildGreetingReply,
  buildTieredFallbackReply,
} from "./support-agent.server";
import {
  searchKbHybrid,
  queryCoverage,
  MIN_QUERY_COVERAGE,
} from "./support-kb.server";
import { preflightStreamGate } from "./support-grounding.server";

beforeEach(() => {
  resetRateLimitCircuitBreaker();
});

describe("Nahid repro — greeting first", () => {
  it("bare 'Hi' is classified as greeting", () => {
    expect(isGreetingMessage("Hi")).toBe(true);
    expect(isGreetingMessage("hi")).toBe(true);
    expect(isGreetingMessage("Hello Nahid")).toBe(true);
    expect(isGreetingMessage("salam")).toBe(true);
  });

  it("greeting builder suggests pricing / store setup / bKash & couriers", () => {
    const reply = buildGreetingReply("Framique", "en");
    expect(reply).toMatch(/welcome/i);
    expect(reply).toMatch(/pricing/i);
    expect(reply).toMatch(/store setup|online store/i);
    expect(reply).toMatch(/bKash/i);
  });

  it("askSupport('Hi') greets in normal mode — no refusal, no degraded banner", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "Hi",
      locale: "en",
    });
    expect(res.reply).toMatch(/welcome/i);
    expect(res.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
    expect(res.reply).not.toMatch(/degraded|extractive/i);
    expect(res.epistemicTriggered).toBeFalsy();
    expect(res.needsAgent).toBe(false);
  });

  it("askSupport('Hi') greets in degraded mode too — never refuse a greeting", async () => {
    const prev = process.env["OPENROUTER_API_KEY"];
    process.env["OPENROUTER_API_KEY"] = "sk-or-v1-REDACTED";
    try {
      const res = await runSupportAgentTurn({
        slug: "demo",
        message: "Hi",
        locale: "en",
      });
      expect(res.reply).toMatch(/welcome/i);
      expect(res.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
      expect(res.reply).not.toMatch(/degraded|extractive/i);
      expect(res.needsAgent).toBe(false);
    } finally {
      if (prev === undefined) delete process.env["OPENROUTER_API_KEY"];
      else process.env["OPENROUTER_API_KEY"] = prev;
    }
  });

  it("stream preflight path treats greeting as greetable (not empty-context refusal)", async () => {
    // The SSE lane calls preflightStreamGate(contextLength=0) for "Hi".
    // After the fix the lane must bypass preflight for greetings.
    // This test pins the helper contract: greeting detected BEFORE preflight.
    expect(isGreetingMessage("Hi")).toBe(true);
    const greeting = buildGreetingReply("Framique", "en");
    expect(greeting).toMatch(/welcome/i);
    // Preflight itself still refuses empty context for NON-greetings:
    const blocked = preflightStreamGate({
      contextLength: 0,
      locale: "en",
      degraded: true,
    });
    expect(blocked.ok).toBe(false);
  });
});

describe("Nahid repro — relevance floor (ERP vs logistics)", () => {
  it("raw retrieval top-1 for ERP is the logistics article (the mismatch source)", async () => {
    const hits = await searchKbHybrid(
      "merchant-demo-123",
      "How to integrate ERP?",
      5,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].doc_id).toBe("kb-doc-pathao-redx-logistics");
    // Coverage must reject it — the relevance floor:
    expect(
      queryCoverage("How to integrate ERP?", hits[0].title, hits[0].body),
    ).toBeLessThan(MIN_QUERY_COVERAGE);
  });

  it("askSupport never presents the wrong-topic logistics answer for ERP", async () => {
    // CONTRACT CHANGE (helpful-first policy, Sept 2026): ERP no longer refuses
    // with EPISTEMIC_ADMISSION_EN. It returns labeled general guidance that
    // names the gap honestly WITHOUT presenting logistics as ERP. Relevance
    // floor kept (no pathao/redx/manifest), refusal replaced by help.
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "How to integrate ERP?",
      locale: "en",
    });
    expect(res.confidence).toBe("unsure");
    expect(res.epistemicTriggered).toBeFalsy();
    expect(res.needsAgent).toBe(false);
    expect(res.sources ?? []).toHaveLength(0);
    expect(res.reply).toMatch(/General guidance \(not from our help docs\)/i);
    expect(res.reply).toMatch(/ERP/i);
    expect(res.reply).not.toMatch(/pathao|redx/i);
    expect(res.reply).not.toMatch(
      /manifest|dispatch|parcel booking|tracking console|consignment|AWB/i,
    );
  });
});

describe("Nahid repro — tiered compact fallback", () => {
  it("tiered fallback builder: clarify → suggest → single handoff, compact", () => {
    const reply = buildTieredFallbackReply("en", undefined, {
      query: "can i add my own pos?",
    });
    // Honest refusal kept:
    expect(reply).toContain(EPISTEMIC_ADMISSION_EN);
    // Suggests the three greeting topics:
    expect(reply).toMatch(/pricing/i);
    expect(reply).toMatch(/store setup|online store/i);
    expect(reply).toMatch(/bKash/i);
    // Single compact step — not the old 4-option wall:
    expect(reply).not.toContain("Transfer to Human Agent");
    expect(reply).not.toContain("Open Support Ticket");
    expect(reply.length).toBeLessThan(600);
  });

  it("POS gap refusal is tiered/compact with suggestions", async () => {
    // CONTRACT CHANGE (helpful-first policy, Sept 2026): POS no longer refuses.
    // Returns labeled general guidance (POS concepts + verify note) with human
    // OPTION, never a refusal wall. Builder test above still pins the tiered
    // fallback for true unknowns (Martian, weather, etc).
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "can i add my own pos?",
      locale: "en",
    });
    expect(res.reply).toMatch(/General guidance \(not from our help docs\)/i);
    expect(res.reply).toMatch(/pos|point.of.sale/i);
    expect(res.reply).toMatch(/verify|talk to human|specialist/i);
    expect(res.reply).not.toContain("Transfer to Human Agent");
    expect(res.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
    expect(res.needsAgent).toBe(false);
    expect(res.reply.length).toBeLessThan(1200);
  });
});
