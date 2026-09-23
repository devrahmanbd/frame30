/**
 * Tests for Support Chat Session Persistence.
 *
 * Validates:
 *  1. Multi-tier persistence (sessionStorage primary + localStorage fallback + in-memory).
 *  2. Multi-tenant isolation by store slug and mode.
 *  3. TTL expiration (>24h).
 *  4. Corrupt JSON resilience.
 *  5. Max message history truncation.
 *  6. Clear session functionality.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  loadSupportChatSession,
  saveSupportChatSession,
  clearSupportChatSession,
  isChatSessionActive,
  clearInMemoryChatSessions,
  getStorageKey,
  SESSION_MAX_AGE_MS,
  MAX_SAVED_MESSAGES,
  type ChatMessage,
} from "./support-session";

// Mock Web Storage for NodeJS test environment
class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("Support Chat Session Persistence (support-session)", () => {
  let mockSessionStorage: MockStorage;
  let mockLocalStorage: MockStorage;

  beforeEach(() => {
    mockSessionStorage = new MockStorage();
    mockLocalStorage = new MockStorage();

    vi.stubGlobal("window", {
      sessionStorage: mockSessionStorage,
      localStorage: mockLocalStorage,
    });

    clearInMemoryChatSessions();
  });

  it("builds consistent, isolated storage keys", () => {
    expect(getStorageKey("Demo-Store", "store")).toBe(
      "fq_support_chat_v1_store_demo-store",
    );
    expect(getStorageKey("framique", "platform")).toBe(
      "fq_support_chat_v1_platform_framique",
    );
    expect(getStorageKey("MY-STORE", "dashboard")).toBe(
      "fq_support_chat_v1_dashboard_my-store",
    );
  });

  it("saves and loads chat session from sessionStorage", () => {
    const msgs: ChatMessage[] = [
      { id: "msg-1", role: "bot", body: "Hello! How can I help?" },
      { id: "msg-2", role: "customer", body: "What are your shipping rates?" },
      {
        id: "msg-3",
        role: "bot",
        body: "Delivery is 60 BDT inside Dhaka and 120 BDT nationwide.",
        confidence: "grounded",
      },
    ];

    saveSupportChatSession({
      slug: "demo",
      mode: "store",
      conversationId: "conv-12345",
      open: true,
      phone: "01712345678",
      orderNumber: "ORD-999",
      staffActive: false,
      msgs,
    });

    const loaded = loadSupportChatSession("demo", "store");
    expect(loaded).not.toBeNull();
    expect(loaded?.slug).toBe("demo");
    expect(loaded?.conversationId).toBe("conv-12345");
    expect(loaded?.open).toBe(true);
    expect(loaded?.phone).toBe("01712345678");
    expect(loaded?.orderNumber).toBe("ORD-999");
    expect(loaded?.msgs).toHaveLength(3);
    expect(loaded?.msgs[2].body).toBe(
      "Delivery is 60 BDT inside Dhaka and 120 BDT nationwide.",
    );
  });

  it("falls back to localStorage if sessionStorage is empty (cross-site / new tab recovery)", () => {
    const msgs: ChatMessage[] = [
      { id: "msg-1", role: "customer", body: "Is cash on delivery available?" },
      {
        id: "msg-2",
        role: "bot",
        body: "Yes, COD is available across all 64 districts.",
      },
    ];

    // Save initial session
    saveSupportChatSession({
      slug: "brand-store",
      mode: "store",
      conversationId: "conv-brand-456",
      open: false,
      phone: "",
      orderNumber: "",
      staffActive: false,
      msgs,
    });

    // Simulate opening in a new tab or clearing sessionStorage
    mockSessionStorage.clear();
    expect(mockSessionStorage.length).toBe(0);
    expect(mockLocalStorage.length).toBeGreaterThan(0);

    // Should seamlessly recover from localStorage
    const recovered = loadSupportChatSession("brand-store", "store");
    expect(recovered).not.toBeNull();
    expect(recovered?.conversationId).toBe("conv-brand-456");
    expect(recovered?.msgs).toHaveLength(2);

    // Should also re-sync sessionStorage
    expect(mockSessionStorage.length).toBeGreaterThan(0);
  });

  it("ignores expired sessions exceeding 24 hours TTL", () => {
    const staleTime = Date.now() - (SESSION_MAX_AGE_MS + 1000);
    const stalePayload = JSON.stringify({
      version: 1,
      slug: "demo",
      mode: "store",
      conversationId: "conv-old",
      open: false,
      phone: "",
      orderNumber: "",
      staffActive: false,
      msgs: [{ id: "m1", role: "customer", body: "Old question" }],
      updatedAt: staleTime,
    });

    mockSessionStorage.setItem(getStorageKey("demo", "store"), stalePayload);
    mockLocalStorage.setItem(getStorageKey("demo", "store"), stalePayload);

    const result = loadSupportChatSession("demo", "store");
    expect(result).toBeNull();
  });

  it("handles corrupt JSON gracefully without throwing", () => {
    mockSessionStorage.setItem(
      getStorageKey("demo", "store"),
      "not-valid-json{{{",
    );
    mockLocalStorage.setItem(getStorageKey("demo", "store"), "corrupt-data");

    expect(() => loadSupportChatSession("demo", "store")).not.toThrow();
    expect(loadSupportChatSession("demo", "store")).toBeNull();
  });

  it("clears session across all tiers", () => {
    saveSupportChatSession({
      slug: "demo",
      mode: "store",
      conversationId: "conv-to-clear",
      open: true,
      phone: "01711111111",
      orderNumber: "",
      staffActive: false,
      msgs: [{ id: "1", role: "customer", body: "Bye" }],
    });

    expect(loadSupportChatSession("demo", "store")).not.toBeNull();

    clearSupportChatSession("demo", "store");

    expect(loadSupportChatSession("demo", "store")).toBeNull();
    expect(
      mockSessionStorage.getItem(getStorageKey("demo", "store")),
    ).toBeNull();
    expect(mockLocalStorage.getItem(getStorageKey("demo", "store"))).toBeNull();
  });

  it("correctly identifies whether an active chat session exists", () => {
    expect(isChatSessionActive("demo", "store")).toBe(false);

    // Initial greeting only is not considered an active customer session
    saveSupportChatSession({
      slug: "demo",
      mode: "store",
      conversationId: null,
      open: false,
      phone: "",
      orderNumber: "",
      staffActive: false,
      msgs: [{ id: "init", role: "bot", body: "Welcome" }],
    });
    expect(isChatSessionActive("demo", "store")).toBe(false);

    // When customer chats, session becomes active
    saveSupportChatSession({
      slug: "demo",
      mode: "store",
      conversationId: "conv-active",
      open: true,
      phone: "",
      orderNumber: "",
      staffActive: false,
      msgs: [
        { id: "init", role: "bot", body: "Welcome" },
        { id: "c1", role: "customer", body: "Hi" },
      ],
    });
    expect(isChatSessionActive("demo", "store")).toBe(true);
  });

  it("truncates message history to MAX_SAVED_MESSAGES", () => {
    const manyMsgs: ChatMessage[] = Array.from({ length: 75 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? "customer" : "bot",
      body: `Message index ${i}`,
    }));

    saveSupportChatSession({
      slug: "demo",
      mode: "store",
      conversationId: "conv-long",
      open: true,
      phone: "",
      orderNumber: "",
      staffActive: false,
      msgs: manyMsgs,
    });

    const loaded = loadSupportChatSession("demo", "store");
    expect(loaded?.msgs).toHaveLength(MAX_SAVED_MESSAGES);
    // Should preserve the latest messages
    expect(loaded?.msgs[loaded.msgs.length - 1].id).toBe("msg-74");
  });

  it("isolates sessions between different merchant slugs", () => {
    saveSupportChatSession({
      slug: "store-alpha",
      mode: "store",
      conversationId: "conv-alpha",
      open: true,
      phone: "",
      orderNumber: "",
      staffActive: false,
      msgs: [{ id: "a1", role: "customer", body: "Alpha question" }],
    });

    saveSupportChatSession({
      slug: "store-beta",
      mode: "store",
      conversationId: "conv-beta",
      open: false,
      phone: "",
      orderNumber: "",
      staffActive: false,
      msgs: [{ id: "b1", role: "customer", body: "Beta question" }],
    });

    const alpha = loadSupportChatSession("store-alpha", "store");
    const beta = loadSupportChatSession("store-beta", "store");

    expect(alpha?.conversationId).toBe("conv-alpha");
    expect(beta?.conversationId).toBe("conv-beta");
    expect(alpha?.open).toBe(true);
    expect(beta?.open).toBe(false);
  });

  it("persists and restores customerName and customerEmail across reloads", () => {
    saveSupportChatSession({
      slug: "store-gamma",
      mode: "store",
      conversationId: "conv-gamma",
      customerName: "Ayesha Rahman",
      customerEmail: "ayesha@example.com",
      open: true,
      phone: "01712345678",
      orderNumber: "ORD-555",
      staffActive: false,
      msgs: [{ id: "g1", role: "customer", body: "Hello" }],
    });

    const loaded = loadSupportChatSession("store-gamma", "store");
    expect(loaded).not.toBeNull();
    expect(loaded?.customerName).toBe("Ayesha Rahman");
    expect(loaded?.customerEmail).toBe("ayesha@example.com");
    expect(loaded?.phone).toBe("01712345678");
    expect(loaded?.orderNumber).toBe("ORD-555");
  });
});
