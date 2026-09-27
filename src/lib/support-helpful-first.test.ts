/**
 * Helpful-first answer policy — RED-first regression for owner directive.
 *
 * New policy (implement exactly):
 * 1. KB-grounded answer (highest trust) — unchanged.
 * 2. LLM general answer when KB lacks it — labeled honestly, warmly,
 *    with one useful follow-up (OPTION, never a wall). Covers POS + ERP.
 * 3. Refusal rare, warm, last resort ONLY for high-stakes unknowns
 *    (exact money/fees, account-specific, legal/compliance, credentials).
 * 4. Never present wrong-topic KB article (keep relevance floor).
 *
 * Safety lines that stay (only refusal-worthy, warm single-step):
 * no invented prices/fees/rates/SLAs/API shapes; no cross-tenant leakage;
 * no credential/legal advice.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { resetRateLimitCircuitBreaker } from "./rate-limit.server";
import {
  runSupportAgentTurn,
  EPISTEMIC_ADMISSION_EN,
} from "./support-agent.server";

beforeEach(() => {
  resetRateLimitCircuitBreaker();
});

describe("helpful-first — POS general answer (not a refusal wall)", () => {
  it("POS: helpful general answer with concepts + pointers + verify note", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "can i add my own pos?",
      locale: "en",
    });
    // NOT a refusal wall:
    expect(res.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
    expect(res.reply).not.toContain("Transfer to Human Agent");
    expect(res.reply).not.toContain("Open Support Ticket");
    // Honestly labeled general guidance:
    expect(res.reply).toMatch(/General guidance \(not from our help docs\)/i);
    // POS concepts + Framique pointers + verify note:
    expect(res.reply).toMatch(/pos|point.of.sale/i);
    expect(res.reply).toMatch(/verify|talk to human|specialist/i);
    // Human handoff is an OPTION, never auto-escalation wall:
    expect(res.needsAgent).toBe(false);
    expect(res.epistemicTriggered).toBeFalsy();
  });
});

describe("helpful-first — ERP general answer (gap named, no courier mixup)", () => {
  it("ERP: helpful general answer without presenting logistics as ERP", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "How to integrate ERP?",
      locale: "en",
    });
    expect(res.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
    expect(res.reply).toMatch(/General guidance \(not from our help docs\)/i);
    expect(res.reply).toMatch(/ERP/i);
    // Never answer about couriers as if it were ERP:
    expect(res.reply).not.toMatch(/pathao|redx/i);
    expect(res.reply).not.toMatch(
      /manifest|dispatch|parcel booking|tracking console|consignment|AWB/i,
    );
    expect(res.reply).toMatch(/verify|talk to human|specialist/i);
    expect(res.needsAgent).toBe(false);
    expect(res.epistemicTriggered).toBeFalsy();
  });
});

describe("helpful-first — greeting stays green", () => {
  it("Hi still greets, never refused", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "Hi",
      locale: "en",
    });
    expect(res.reply).toMatch(/welcome/i);
    expect(res.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
    expect(res.needsAgent).toBe(false);
  });
});

describe("helpful-first — high-stakes warm single-step (not a wall)", () => {
  it("exact fees with no KB coverage: warm single-step redirect", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "what are your exact transaction fees for Amex in USD?",
      locale: "en",
    });
    // Warm single-step, never a wall:
    expect(res.reply).not.toContain("Transfer to Human Agent");
    expect(res.reply).not.toContain("Open Support Ticket");
    expect(res.reply).toMatch(
      /talk to human|specialist|support@framique\.com/i,
    );
    // Single next step — compact, one paragraph + one action:
    expect(res.reply.length).toBeLessThan(500);
    // No fabricated figures in the redirect:
    expect(res.reply).not.toMatch(/(BDT|৳|Tk\.?)\s?[\d,]+/i);
    expect(res.needsAgent).toBe(true);
  });
});

describe("helpful-first — no-fabrication in general answers", () => {
  it("general answer never contains Framique-specific prices/fees", async () => {
    const pos = await runSupportAgentTurn({
      slug: "demo",
      message: "can i add my own pos?",
      locale: "en",
    });
    resetRateLimitCircuitBreaker();
    const erp = await runSupportAgentTurn({
      slug: "demo",
      message: "How to integrate ERP?",
      locale: "en",
    });
    for (const reply of [pos.reply, erp.reply]) {
      // No invented prices/fees/rates/SLAs:
      expect(reply).not.toMatch(/(BDT|৳|Tk\.?)\s?[\d,]+/i);
      expect(reply).not.toMatch(/1,500|3,500|8,000|15,000|35,000|80,000/);
      expect(reply).not.toMatch(/0%\s*(commission|transaction)/i);
      expect(reply).not.toMatch(/99\.99%\s*uptime/i);
      // No invented API shapes:
      expect(reply).not.toMatch(/https?:\/\/[^\s]*\/api\/[^\s]*/i);
    }
  });
});
