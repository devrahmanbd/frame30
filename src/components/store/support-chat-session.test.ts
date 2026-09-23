/**
 * Support chat session persistence — TDD: save/load/clear round-trip.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSupportChatSession,
  getInitialGreeting,
  loadSupportChatSession,
  saveSupportChatSession,
} from "./SupportWidget";

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
    (globalThis as Record<string, unknown>)["sessionStorage"] =
      fakeStorage();
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
