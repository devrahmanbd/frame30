/**
 * Stream cold-path helpful-first policy — RED-first regression.
 *
 * The SSE lane (`src/routes/api/public/support/stream.ts`) refuses on empty
 * context via `preflightStreamGate`. After the fix it must mirror
 * `askSupport`'s helpful-first policy (support-agent.server.ts, 1bb8c3b):
 *   1. greeting-first (no KB/LLM needed),
 *   2. general-guidance tier (POS/ERP → labeled guidance, no wall),
 *   3. warm single-step high-stakes redirect (exact fees → short redirect).
 *
 * These tests pin the stream-path resolver contract. The resolver is the
 * single source the SSE lane calls for cold (empty-context) replies, so the
 * widget lane can never drift from askSupport again.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveStreamColdReply,
  EPISTEMIC_ADMISSION_EN,
} from "./support-agent.server";

describe("stream cold path — greeting via stream (no KB/LLM)", () => {
  it("Hi resolves to a greeting, never a refusal", () => {
    const res = resolveStreamColdReply({
      message: "Hi",
      locale: "en",
      merchantName: "Framique",
      contextLength: 0,
    });
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("greeting");
    expect(res!.reply).toMatch(/welcome/i);
    expect(res!.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
    expect(res!.needsAgent).toBe(false);
    expect(res!.cta).toBe("none");
  });
});

describe("stream cold path — POS/ERP general guidance (not a wall)", () => {
  it("POS via stream path → labeled general guidance", () => {
    const res = resolveStreamColdReply({
      message: "can i add my own pos?",
      locale: "en",
      merchantName: "Framique",
      contextLength: 0,
    });
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("general_guidance");
    expect(res!.reply).toMatch(/General guidance \(not from our help docs\)/i);
    expect(res!.reply).toMatch(/pos|point.of.sale/i);
    expect(res!.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
    expect(res!.reply).not.toContain("Transfer to Human Agent");
    expect(res!.needsAgent).toBe(false);
    expect(res!.cta).toBe("none");
  });

  it("ERP via stream path → general guidance, never logistics", () => {
    const res = resolveStreamColdReply({
      message: "How to integrate ERP?",
      locale: "en",
      merchantName: "Framique",
      contextLength: 0,
    });
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("general_guidance");
    expect(res!.reply).toMatch(/General guidance \(not from our help docs\)/i);
    expect(res!.reply).toMatch(/ERP/i);
    expect(res!.reply).not.toMatch(/pathao|redx/i);
    expect(res!.reply).not.toMatch(
      /manifest|dispatch|parcel booking|tracking console|consignment|AWB/i,
    );
    expect(res!.needsAgent).toBe(false);
  });
});

describe("stream cold path — high-stakes warm single step", () => {
  it("exact fees via stream path → warm single-step redirect", () => {
    const res = resolveStreamColdReply({
      message: "what are your exact transaction fees for Amex in USD?",
      locale: "en",
      merchantName: "Framique",
      contextLength: 0,
    });
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("high_stakes");
    expect(res!.reply).not.toContain("Transfer to Human Agent");
    expect(res!.reply).not.toContain("Open Support Ticket");
    expect(res!.reply).toMatch(
      /talk to human|specialist|support@framique\.com/i,
    );
    expect(res!.reply.length).toBeLessThan(500);
    expect(res!.reply).not.toMatch(/(BDT|৳|Tk\.?)\s?[\d,]+/i);
    expect(res!.needsAgent).toBe(true);
    expect(res!.cta).toBe("human_transfer");
  });
});

describe("stream cold path — warm context proceeds to LLM", () => {
  it("non-empty context returns null (no cold reply)", () => {
    expect(
      resolveStreamColdReply({
        message: "can i add my own pos?",
        locale: "en",
        merchantName: "Framique",
        contextLength: 2,
      }),
    ).toBeNull();
    expect(
      resolveStreamColdReply({
        message: "what are your exact transaction fees for Amex in USD?",
        locale: "en",
        merchantName: "Framique",
        contextLength: 3,
      }),
    ).toBeNull();
  });

  it("greeting still wins even with warm context (mirrors early bypass)", () => {
    const res = resolveStreamColdReply({
      message: "Hi",
      locale: "en",
      merchantName: "Framique",
      contextLength: 2,
    });
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("greeting");
  });
});

describe("stream cold path — SSE lane wiring", () => {
  it("stream.ts calls the cold-path resolver before preflight refusal", () => {
    const src = readFileSync(
      join(__dirname, "..", "routes", "api", "public", "support", "stream.ts"),
      "utf8",
    );
    expect(src).toContain("resolveStreamColdReply");
  });
});
