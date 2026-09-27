/**
 * Support chat session persistence — TDD: save/load/clear round-trip.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSupportChatSession,
  consumeSupportStream,
  getInitialGreeting,
  getSupportStreamAvailability,
  loadSupportChatSession,
  parseSupportSseData,
  saveSupportChatSession,
  setSupportStreamAvailability,
  SUPPORT_STREAM_ENDPOINT,
} from "./SupportWidget";
import { getLegacyStorageKey, getStorageKey } from "@/lib/support-session";

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
}

describe("support chat session", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>)["sessionStorage"] = fakeStorage();
    (globalThis as Record<string, unknown>)["localStorage"] = fakeStorage();
  });

  it("round-trips save -> load -> clear", () => {
    expect(loadSupportChatSession("shop", "store")).toBeNull();
    saveSupportChatSession({
      slug: "shop",
      mode: "store",
      conversationId: "c1",
      customerName: "A",
      customerEmail: "a@b.cd",
      open: true,
      phone: "",
      orderNumber: "",
      staffActive: false,
      msgs: [{ id: "m1", role: "bot", body: "hi" }],
    });
    const loaded = loadSupportChatSession("shop", "store");
    expect(loaded?.conversationId).toBe("c1");
    expect(loaded?.msgs).toHaveLength(1);
    clearSupportChatSession("shop", "store");
    expect(loadSupportChatSession("shop", "store")).toBeNull();
  });

  it("scopes keys per shop and mode", () => {
    saveSupportChatSession({
      slug: "a",
      mode: "store",
      conversationId: "c1",
      customerName: "",
      customerEmail: "",
      open: false,
      phone: "",
      orderNumber: "",
      staffActive: false,
      msgs: [],
    });
    expect(loadSupportChatSession("b", "store")).toBeNull();
    expect(loadSupportChatSession("a", "platform")).toBeNull();
  });
});

describe("getInitialGreeting", () => {
  const t = (en: string) => en;
  it("varies by mode", () => {
    expect(getInitialGreeting(t, "store")).toContain("order status");
    expect(getInitialGreeting(t, "platform")).toContain("Welcome to Framique");
    expect(getInitialGreeting(t, "dashboard")).toContain("Copilot");
  });
});

describe("TODO-6 streaming consumption", () => {
  beforeEach(() => {
    setSupportStreamAvailability(null);
  });

  it("parses delta frames in all accepted shapes", () => {
    expect(parseSupportSseData('data: {"delta": "hel"}')).toEqual({
      kind: "delta",
      text: "hel",
    });
    expect(parseSupportSseData('data: {"content": "lo"}')).toEqual({
      kind: "delta",
      text: "lo",
    });
    expect(parseSupportSseData('data: {"text": "hi"}')).toEqual({
      kind: "delta",
      text: "hi",
    });
    // prefix is optional
    expect(parseSupportSseData('{"delta": "x"}')).toEqual({
      kind: "delta",
      text: "x",
    });
  });

  it("parses control frames and ignores noise", () => {
    expect(parseSupportSseData("data: [DONE]")).toEqual({ kind: "done" });
    expect(parseSupportSseData('data: {"final": {"reply": "hi"}}')).toEqual({
      kind: "final",
      payload: { reply: "hi" },
    });
    expect(parseSupportSseData('data: {"error": "boom"}')).toEqual({
      kind: "error",
      message: "boom",
    });
    expect(parseSupportSseData(": ping")).toEqual({ kind: "ignore" });
    expect(parseSupportSseData("")).toEqual({ kind: "ignore" });
    expect(parseSupportSseData("data: not-json{{{")).toEqual({
      kind: "ignore",
    });
    expect(parseSupportSseData('data: {"usage": {}}')).toEqual({
      kind: "ignore",
    });
  });

  it("exposes the conventional stream endpoint and probe cache", () => {
    expect(SUPPORT_STREAM_ENDPOINT).toBe("/api/public/support/stream");
    expect(getSupportStreamAvailability()).toBeNull();
    setSupportStreamAvailability(false);
    expect(getSupportStreamAvailability()).toBe(false);
    setSupportStreamAvailability(true);
    expect(getSupportStreamAvailability()).toBe(true);
  });

  it("reports unavailable when the endpoint does not exist", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("not found", {
        status: 404,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    try {
      const outcome = await consumeSupportStream({ body: { message: "hi" } });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe("unavailable");
        expect(outcome.partial).toBe("");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("streams deltas progressively and honors the final frame", async () => {
    const originalFetch = globalThis.fetch;
    const sse = [
      'data: {"delta": "Hel"}\n\n',
      'data: {"content": "lo"}\n\n',
      'data: {"final": {"reply": "Hello", "confidence": "grounded"}}\n\n',
      "data: [DONE]\n\n",
    ].join("");
    const seen: string[] = [];
    globalThis.fetch = (async () =>
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })) as typeof fetch;
    try {
      const outcome = await consumeSupportStream({
        body: { message: "hi" },
        onDelta: (partial) => void seen.push(partial),
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.partial).toBe("Hello");
        expect(outcome.final).toEqual({
          reply: "Hello",
          confidence: "grounded",
        });
      }
      expect(seen).toEqual(["Hel", "Hello"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the partial when the stream breaks mid-flight", async () => {
    const originalFetch = globalThis.fetch;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(
            new TextEncoder().encode('data: {"delta": "part"}\n\n'),
          );
        } else {
          controller.error(new Error("connection reset"));
        }
      },
    });
    globalThis.fetch = (async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })) as typeof fetch;
    try {
      const outcome = await consumeSupportStream({ body: { message: "hi" } });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe("failed");
        expect(outcome.partial).toBe("part");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("TODO-6 versioned session carryover", () => {
  it("migrates a pre-versioned widget snapshot into the versioned store", () => {
    const session = (globalThis as Record<string, unknown>).sessionStorage as {
      getItem(k: string): string | null;
      setItem(k: string, v: string): void;
    };
    const legacyKey = getLegacyStorageKey("shop", "store");
    session.setItem(
      legacyKey,
      JSON.stringify({
        msgs: [
          { id: "m1", role: "customer", body: "Where is my order?" },
          { id: "m2", role: "bot", body: "On the way." },
        ],
        conversationId: "legacy-conv",
        customerName: "A",
        customerEmail: "a@b.cd",
        open: true,
        phone: "",
        orderNumber: "",
        staffActive: false,
      }),
    );

    const loaded = loadSupportChatSession("shop", "store");
    expect(loaded?.conversationId).toBe("legacy-conv");
    expect(loaded?.msgs).toHaveLength(2);
    expect((loaded as unknown as { version?: number }).version).toBe(1);

    // Legacy key is removed; versioned key now holds the promoted snapshot.
    expect(session.getItem(legacyKey)).toBeNull();
    const versioned = session.getItem(getStorageKey("shop", "store"));
    expect(versioned).not.toBeNull();
    expect(JSON.parse(versioned!).version).toBe(1);

    // Second load comes from the versioned store (idempotent migration).
    expect(loadSupportChatSession("shop", "store")?.conversationId).toBe(
      "legacy-conv",
    );
  });

  it("ignores corrupt legacy snapshots", () => {
    const session = (globalThis as Record<string, unknown>).sessionStorage as {
      setItem(k: string, v: string): void;
    };
    session.setItem(getLegacyStorageKey("ghost", "store"), "not-json{{{");
    expect(loadSupportChatSession("ghost", "store")).toBeNull();
  });
});
