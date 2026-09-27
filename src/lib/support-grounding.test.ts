import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHandoffPayload,
  enforceGroundedReply,
  groundedSourcesFromContext,
  isDegradedEnvironment,
  joinStreamChunks,
  preflightStreamGate,
  STREAMING_SAFETY_NOTE,
  DEGRADED_BANNER_EN,
} from "./support-grounding.server";
import {
  FRAMIQUE_SYSTEM_PROMPT,
  collectStreamedDraft,
  openRouterLLM,
  setLLM,
  streamDraft,
  stripReasoningTokens,
  visiblePrefixForStream,
} from "./support-llm.server";

vi.mock("./support-embed.server", async (importOriginal) => {
  const orig =
    await importOriginal<typeof import("./support-embed.server")>();
  return {
    ...orig,
    getAiGatewayConfig: async () => ({
      apiKey: "sk-or-v1-testkey1234567890abcdef",
      chatModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
      fallbackChatModel: "nvidia/nemotron-3.5-lightning:free",
      embeddingModel: "nvidia/nemotron-3-embed-1b:free",
      gatewayUrl: "https://openrouter.ai/api/v1",
    }),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    // createdAt is wall-clock by design (a handoff records when it was
    // built); freeze time so the determinism assertion isn't millisecond-
    // flaky across the two builds.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T15:03:20.000Z"));
    try {
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
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("thinking-model reasoning hygiene (TODO-2)", () => {
  it("stripReasoningTokens removes think blocks, unclosed openers, control tokens", () => {
    expect(stripReasoningTokens("<think>hidden plan</think>Clean answer.")).toBe(
      "Clean answer.",
    );
    expect(
      stripReasoningTokens("A<THINK EFFORT=\"high\">\nmulti\nline\n</think>B"),
    ).toBe("AB");
    expect(
      stripReasoningTokens("Visible <thinking>truncated tail with no closer"),
    ).toBe("Visible");
    expect(
      stripReasoningTokens("Hi <|start_of_thought|>x<|end_of_thought|>there"),
    ).toBe("Hi there");
    // Idempotent on already-clean text.
    expect(stripReasoningTokens("Clean answer.")).toBe("Clean answer.");
  });

  it("visiblePrefixForStream withholds split reasoning blocks until closer", () => {
    expect(visiblePrefixForStream("Hello <think>")).toBe("Hello ");
    expect(visiblePrefixForStream("Hello <think>hidden</think> world")).toBe(
      "Hello  world",
    );
    expect(visiblePrefixForStream("plain text")).toBe("plain text");
  });

  it("draft() sends reasoning effort, strips CoT, keeps [Doc] contract", async () => {
    setLLM(openRouterLLM);
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "<think>plan</think>Clean." } }],
            usage: {
              completion_tokens_details: { reasoning_tokens: 12 },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const out = await openRouterLLM.draft({
      question: "Delivery charge?",
      context: [{ title: "Shipping", body: "Inside Dhaka ৳60" }],
      locale: "en",
    });
    expect(out?.text).toBe("Clean.");
    expect(bodies[0]?.["reasoning"]).toEqual({
      effort: "medium",
      exclude: true,
    });
    const messages = bodies[0]?.["messages"] as Array<{ content: string }>;
    expect(messages[1]?.content).toMatch(/\[Document 1\] Shipping/);
  });

  it('draft() honors reasoningEffort "none" (no reasoning param)', async () => {
    setLLM(openRouterLLM);
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "Plain." } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const out = await openRouterLLM.draft({
      question: "Q?",
      context: [{ title: "T", body: "B" }],
      locale: "en",
      reasoningEffort: "none",
    });
    expect(out?.text).toBe("Plain.");
    expect(bodies[0]).not.toHaveProperty("reasoning");
  });

  it("draft() cascades primary → fallback → extractive mock", async () => {
    setLLM(openRouterLLM);
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("primary timeout");
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Fallback ok." } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const out = await openRouterLLM.draft({
      question: "Q?",
      context: [{ title: "T", body: "B" }],
      locale: "en",
    });
    expect(out?.text).toBe("Fallback ok.");
    expect(calls).toBe(2);

    // All remote models down → extractive mock (degraded lane content).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("all down");
      }),
    );
    const mock = await openRouterLLM.draft({
      question: "Q?",
      context: [{ title: "Ship Guide", body: "Inside Dhaka ৳60" }],
      locale: "en",
    });
    expect(mock?.text).toContain("Ship Guide");
  });
});

describe("SSE streaming draft (TODO-2)", () => {
  const sseFrame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

  function sseResponse(frames: string[]): Response {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        // Split mid-frame on purpose: parser must handle chunk boundaries.
        for (const f of frames) {
          const bytes = enc.encode(f);
          const mid = Math.max(1, Math.floor(bytes.length / 2));
          c.enqueue(bytes.slice(0, mid));
          c.enqueue(bytes.slice(mid));
        }
        c.close();
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });
  }

  it("streams cleaned deltas: reasoning channel dropped, split <think> withheld", async () => {
    setLLM(openRouterLLM);
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return sseResponse([
          sseFrame({ choices: [{ delta: { reasoning: "covert plan" } }] }),
          sseFrame({
            choices: [{ delta: { content: "From our help article <think>" } }],
          }),
          sseFrame({
            choices: [{ delta: { content: "covert analysis</think>— SteadFast." } }],
          }),
          sseFrame({
            usage: { completion_tokens_details: { reasoning_tokens: 7 } },
          }),
        ]);
      }),
    );
    const deltas: string[] = [];
    for await (const d of streamDraft({
      question: "Courier?",
      context: [{ title: "Shipping", body: "SteadFast" }],
      locale: "en",
    })) {
      deltas.push(d);
    }
    for (const d of deltas) expect(d).not.toMatch(/covert|think/i);
    expect(deltas.join("")).toBe("From our help article — SteadFast.");
    expect(bodies[0]?.["stream"]).toBe(true);
    expect(bodies[0]?.["reasoning"]).toEqual({
      effort: "medium",
      exclude: true,
    });
    // Final assembly helper is idempotent over the same chunks.
    expect(await collectStreamedDraft(deltas)).toBe(
      "From our help article — SteadFast.",
    );
  });

  it("empty context yields nothing and never calls the LLM", async () => {
    setLLM(openRouterLLM);
    const spy = vi.fn(async () => {
      throw new Error("must not be called");
    });
    vi.stubGlobal("fetch", spy);
    const deltas: string[] = [];
    for await (const d of streamDraft({
      question: "Q?",
      context: [],
      locale: "en",
    })) {
      deltas.push(d);
    }
    expect(deltas).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("all models down → chunked extractive mock keeps streaming contract", async () => {
    setLLM(openRouterLLM);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("all down");
      }),
    );
    const text = await collectStreamedDraft(
      streamDraft({
        question: "Q?",
        context: [{ title: "Ship Guide", body: "Inside Dhaka ৳60" }],
        locale: "en",
      }),
    );
    expect(text).toContain("Ship Guide");
  });
});

describe("streaming grounding preflight (TODO-2)", () => {
  it("preflight blocks empty context with unsure+handoff fallback", () => {
    const blocked = preflightStreamGate({ contextLength: 0, locale: "en" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.fallbackReply).toMatch(/verified info/i);
    }
    expect(preflightStreamGate({ contextLength: 2 }).ok).toBe(true);
  });

  it("groundedSourcesFromContext maps [Doc] hits to KB provenance", () => {
    const sources = groundedSourcesFromContext([
      { title: "A", body: "a" },
      { title: "B", body: "b" },
      { title: "C", body: "c" },
      { title: "D", body: "d" },
    ]);
    expect(sources).toHaveLength(3);
    expect(sources[0]?.table).toBe("support_kb_docs");
    // Preflight-approved sources pass the kernel (contract: preflight BEFORE
    // first byte, kernel + screenOutbound post-hoc on assembled reply).
    const out = enforceGroundedReply({
      reply: "assembled streamed reply",
      confidence: "grounded",
      sources,
      pinned: false,
      deepwiki: false,
    });
    expect(out.confidence).toBe("grounded");
  });

  it("safety note documents post-hoc screening obligation", () => {
    expect(STREAMING_SAFETY_NOTE).toMatch(/post-hoc/i);
    expect(STREAMING_SAFETY_NOTE).toMatch(/screenOutbound/);
  });

  it("joinStreamChunks assembles deltas for post-hoc screening", async () => {
    async function* gen(): AsyncGenerator<string> {
      yield "Hello ";
      yield "world";
    }
    await expect(joinStreamChunks(gen())).resolves.toBe("Hello world");
  });
});
