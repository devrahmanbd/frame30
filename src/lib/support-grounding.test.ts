import { describe, expect, it } from "vitest";
import {
  buildHandoffPayload,
  enforceGroundedReply,
  isDegradedEnvironment,
  DEGRADED_BANNER_EN,
} from "./support-grounding.server";
import { FRAMIQUE_SYSTEM_PROMPT } from "./support-llm.server";

describe("grounded-answer kernel", () => {
  it("deny: grounded confidence without provenance is downgraded to unsure+handoff", () => {
    const out = enforceGroundedReply({
      reply: "Pathao delivers in 2 days",
      confidence: "grounded",
      sources: [],
      pinned: false,
      deepwiki: false,
    });
    expect(out.confidence).toBe("unsure");
    expect(out.needsAgent).toBe(true);
    expect(out.cta).not.toBe("none");
    expect(out.reply).toMatch(/verified info/i);
  });

  it("deny: null-context reply must be handoff, never FAQ", () => {
    const out = enforceGroundedReply({
      reply: "Our refund policy is 7 days",
      confidence: "grounded",
      sources: [],
      pinned: false,
      deepwiki: false,
    });
    expect(out.reply).not.toMatch(/refund policy is/i);
    expect(out.needsAgent).toBe(true);
  });

  it("allows pinned order data and KB-grounded replies", () => {
    const pinned = enforceGroundedReply({
      reply: "Order #1001 is delivered",
      confidence: "pinned",
      sources: [{ label: "orders", table: "orders" }],
      pinned: true,
      deepwiki: false,
    });
    expect(pinned.confidence).toBe("pinned");
    expect(pinned.needsAgent).toBe(false);

    const kb = enforceGroundedReply({
      reply: "From our help article",
      confidence: "grounded",
      sources: [{ label: "kb", table: "support_kb_docs", title: "Shipping" }],
      pinned: false,
      deepwiki: false,
    });
    expect(kb.confidence).toBe("grounded");
  });

  it("deepwiki citations are labeled source:deepwiki, never canonical KB", () => {
    const out = enforceGroundedReply({
      reply: "DeepWiki answer [DeepWiki: X]",
      confidence: "grounded",
      sources: [{ label: "[DeepWiki: X]", table: "deepwiki", title: "X" }],
      pinned: false,
      deepwiki: true,
    });
    expect(out.confidence).toBe("grounded");
    expect(out.sources[0]?.table).toBe("deepwiki");
    expect(out.sources[0]?.table).not.toBe("support_kb_docs");
  });

  it("system prompt invites no off-docs slogans", () => {
    expect(FRAMIQUE_SYSTEM_PROMPT).not.toMatch(/CREATIVE COMMERCE ASSISTANCE/i);
    expect(FRAMIQUE_SYSTEM_PROMPT).not.toMatch(/inspiring.*suggestions/i);
  });

  it("degraded env is detected via placeholder key or mock llm", () => {
    expect(isDegradedEnvironment({ apiKey: "sk-or-v1-REDACTED" })).toBe(true);
    expect(isDegradedEnvironment({ apiKey: "sk-or-v1-real1234567890" })).toBe(
      false,
    );
    expect(DEGRADED_BANNER_EN).toMatch(/extractive/i);
  });
});

describe("handoff completeness (Chatwoot parity)", () => {
  const transcript = [
    { role: "customer" as const, body: "Where is my order?" },
    { role: "bot" as const, body: "I don't have verified info" },
  ];
  it("payload includes full transcript + confidence + provenance + attempted sources", () => {
    const p1 = buildHandoffPayload({
      conversationId: "conv-1",
      transcript,
      confidence: "unsure",
      provenance: null,
      attemptedSources: ["kb", "deepwiki"],
      reason: "zero_kb_hits",
    });
    expect(p1.transcript).toEqual(transcript);
    expect(p1.confidence).toBe("unsure");
    expect(p1.attemptedSources).toContain("deepwiki");
    expect(p1.statusFrom).toBe("pending");
    expect(p1.statusTo).toBe("open");
    expect(p1.reason).toBe("zero_kb_hits");
  });

  it("replay: same transcript yields same handoff payload", () => {
    const a = buildHandoffPayload({
      conversationId: "conv-1",
      transcript,
      confidence: "unsure",
      provenance: null,
      attemptedSources: ["kb"],
      reason: "zero_kb_hits",
    });
    const b = buildHandoffPayload({
      conversationId: "conv-1",
      transcript,
      confidence: "unsure",
      provenance: null,
      attemptedSources: ["kb"],
      reason: "zero_kb_hits",
    });
    expect(a).toEqual(b);
  });
});
