import { describe, expect, it, beforeEach } from "vitest";
import {
  runSupportAgentTurn,
  clearConversationRecentTurns,
} from "./support-agent.server";
import { resetRateLimitCircuitBreaker } from "./rate-limit.server";

beforeEach(() => {
  resetRateLimitCircuitBreaker();
  clearConversationRecentTurns();
});

describe("grounded super-agent", () => {
  it("deny: null-context → handoff not FAQ", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "What is the Martian credit refund policy for Olympus Mons?",
      locale: "en",
    });
    expect(res.confidence).toBe("unsure");
    expect(res.needsAgent).toBe(true);
    expect(res.provenance).toBeNull();
    expect(res.sources ?? []).toHaveLength(0);
    expect(res.reply).toMatch(/verified info/i);
  });

  it("deny: unverified contact never exposes fake phones", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "Who won the premier league match yesterday?",
      locale: "en",
    });
    // Scattered fakes must never appear in user-visible contact card
    expect(res.contactInfo?.phone ?? "").not.toBe("+880 9612-345678");
    expect(res.contactInfo?.whatsapp ?? "").not.toBe("+880 1700-000000");
    // Verified contact hides unverified phone (null) but keeps email
    expect(res.contactInfo?.email).toContain("framique.com");
  });

  it("honest degraded mode: placeholder key banners with lowered confidence", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "What are your delivery charges and shipping times?",
      locale: "en",
    });
    // In CI without real OPENROUTER key, env is placeholder → degraded
    // Pinned order data stays pinned; KB-grounded must be bannered+unsure
    if (res.confidence === "grounded") {
      expect(res.reply).toMatch(/degraded|extractive/i);
    } else {
      expect(["unsure", "pinned"]).toContain(res.confidence);
    }
  });

  it("handoff payload is complete (transcript + provenance + sources)", async () => {
    // CONTRACT CHANGE (helpful-first policy, Sept 2026): ERP now returns
    // labeled general guidance with needsAgent=false (OPTION handoff, no
    // auto-escalation). Handoff coverage moves to a true unknown (Martian)
    // which still triggers humility + needsAgent + payload.
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "What is the Martian credit refund policy for Olympus Mons?",
      locale: "en",
    });
    expect(res.needsAgent).toBe(true);
    const payload = (res as unknown as { handoffPayload?: unknown })
      .handoffPayload as
      | {
          transcript: Array<{ role: string; body: string }>;
          confidence: string;
          attemptedSources: string[];
          statusFrom: string;
          statusTo: string;
          prefilledTicketSubject: string;
        }
      | undefined;
    expect(payload).toBeDefined();
    expect(payload?.transcript.length).toBeGreaterThan(0);
    expect(payload?.statusFrom).toBe("pending");
    expect(payload?.statusTo).toBe("open");
    expect(payload?.attemptedSources).toContain("kb");
    expect(payload?.prefilledTicketSubject.length).toBeGreaterThan(0);
  });

  it("replay: same transcript → same handoff prefill", async () => {
    // CONTRACT CHANGE (helpful-first): replay uses Martian unknown (still
    // handoff) instead of ERP (now general guidance, no handoff).
    const msg = "What is the Martian credit refund policy for Olympus Mons?";
    const a = await runSupportAgentTurn({
      slug: "demo",
      message: msg,
      phone: "01712345678",
    });
    resetRateLimitCircuitBreaker();
    clearConversationRecentTurns();
    const b = await runSupportAgentTurn({
      slug: "demo",
      message: msg,
      phone: "01812345678",
    });
    const pa = (
      a as unknown as { handoffPayload?: { prefilledTicketSubject: string } }
    ).handoffPayload;
    const pb = (
      b as unknown as { handoffPayload?: { prefilledTicketSubject: string } }
    ).handoffPayload;
    expect(pa?.prefilledTicketSubject).toBe(pb?.prefilledTicketSubject);
  });
});
