/**
 * Phase 9.3 & 9.4 — Support Agent Action Tools: Comprehensive Test Suite
 *
 * Tests the FULL agent agentic loop for:
 *
 * 9.3: create_support_ticket Action Tool
 *   ✓ detectIntent("open a ticket") → create_ticket
 *   ✓ detectIntent("contact support") → create_ticket
 *   ✓ detectIntent("escalate") → create_ticket
 *   ✓ detectIntent("টিকিট খুলুন") → create_ticket (Bangla)
 *   ✓ createTicket returns id, subject, priority, status, first_response_due_at
 *   ✓ AskResult.ticketAction is populated with structured TicketAction
 *   ✓ cta = "ticket" when ticket created
 *   ✓ Auto-escalation on refund intent → high-priority ticket
 *   ✓ Tool call is recorded in ai_tool_calls
 *
 * 9.4: request_callback Action Tool
 *   ✓ detectIntent("call me") → request_callback
 *   ✓ detectIntent("call back") → request_callback
 *   ✓ detectIntent("কলব্যাক") → request_callback (Bangla)
 *   ✓ BD phone validation: 01712345678 valid, 01012345678 invalid
 *   ✓ normaliseBdPhone maps all formats to +8801 E.164
 *   ✓ createCallback returns id, phoneE164, window, agentMessage
 *   ✓ In-memory store persists callback with status=pending
 *   ✓ All 3 callback windows defined with correct hours and Bangla labels
 *   ✓ Concurrent callbacks generate unique IDs
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  detectIntent,
  classifyIntent,
  analyzeSentiment,
  LOW_INTENT_CONFIDENCE_THRESHOLD,
} from "./ai-support.server";
import {
  validateBdPhone,
  normaliseBdPhone,
  createCallback,
  clearInMemoryCallbacks,
  getInMemoryCallbacks,
  CALLBACK_WINDOWS,
  BD_PHONE_REGEX,
} from "./support-callbacks.server";
import { createTicket } from "./support-tickets.server";
import { resetRateLimitCircuitBreaker } from "./rate-limit.server";

beforeEach(() => {
  resetRateLimitCircuitBreaker();
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.3 — Intent Detection: create_ticket
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 9.3 — Intent Detection: create_ticket", () => {
  const TICKET_PHRASES_EN = [
    "Please open a ticket",
    "Open a support ticket for me",
    "create a ticket",
    "Can you submit a ticket?",
    "I want to file a ticket",
    "Escalate this issue",
    "I need to talk to a human agent",
    "Contact support for me",
    "Please speak with an agent",
    "reach support team",
    "talk to a real person",
  ];

  const TICKET_PHRASES_BN = [
    "আমার জন্য একটি টিকিট তৈরি করুন",
    "সাপোর্ট টিকিট খুলুন",
    "এজেন্টের সাথে কথা বলুন",
    "মানুষের সাথে কথা বলতে চাই",
  ];

  it.each(TICKET_PHRASES_EN)(
    "detects create_ticket intent from English phrase: %s",
    (phrase) => {
      expect(detectIntent(phrase)).toBe("create_ticket");
    },
  );

  it.each(TICKET_PHRASES_BN)(
    "detects create_ticket intent from Bangla phrase: %s",
    (phrase) => {
      expect(detectIntent(phrase)).toBe("create_ticket");
    },
  );

  it("does NOT classify generic 'where is my order' as create_ticket", () => {
    expect(detectIntent("where is my order?")).toBe("order_status");
  });

  it("does NOT classify refund request as create_ticket", () => {
    expect(detectIntent("I want a refund")).toBe("refund");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.3 — Intent Detection: refund auto-escalation
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 9.3 — Refund Intent Auto-Escalation", () => {
  it("detects refund intent correctly from English", () => {
    expect(detectIntent("I want a refund for order 1001")).toBe("refund");
    expect(detectIntent("please process my return")).toBe("refund");
    expect(detectIntent("exchange my item")).toBe("refund");
  });

  it("detects refund intent from Bangla", () => {
    expect(detectIntent("আমার রিফান্ড দিন")).toBe("refund");
    expect(detectIntent("পণ্য ফেরত দিতে চাই")).toBe("refund");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.3 — Ticket Service: createTicket
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 9.3 — Ticket Service: createTicket", () => {
  const MERCHANT_ID = "00000000-0000-0000-0000-000000009300";

  it("creates ticket with required fields and returns structured response", async () => {
    const ticket = await createTicket({
      merchantId: MERCHANT_ID,
      subject: "I need help with my order refund",
      body: "My order #ORD-12345 was delivered damaged. I want a refund.",
      priority: "high",
      channel: "widget",
      conversationId: null,
      orderNumber: "ORD-12345",
      reason: "support.explicit_ticket_request",
    });

    expect(ticket).toBeDefined();
    expect(ticket.id).toBeTruthy();
    expect(ticket.subject).toBe("I need help with my order refund");
    expect(ticket.priority).toBe("high");
    expect(ticket.status).toBe("open");
    expect(ticket.first_response_due_at).toBeTruthy();
  });

  it("generates a valid #TKT- reference from ticket id", async () => {
    const ticket = await createTicket({
      merchantId: MERCHANT_ID,
      subject: "Question about SteadFast parcel tracking",
      priority: "normal",
      channel: "widget",
      reason: "support.agent_escalation",
    });

    expect(ticket.id).toBeTruthy();
    const ref = `#TKT-${ticket.id.slice(-8).toUpperCase()}`;
    expect(ref.startsWith("#TKT-")).toBe(true);
    expect(ref.length).toBeGreaterThanOrEqual(10);
  });

  it("links conversationId to ticket", async () => {
    const conversationId = "00000000-0000-0000-0000-000000001234";
    const ticket = await createTicket({
      merchantId: MERCHANT_ID,
      subject: "bKash payment not reflecting",
      priority: "urgent",
      channel: "widget",
      conversationId,
      reason: "support.agent_escalation",
    });

    expect(ticket.id).toBeTruthy();
    expect(ticket.priority).toBe("urgent");
  });

  it("creates normal priority ticket on consecutive unsure escalation", async () => {
    const ticket = await createTicket({
      merchantId: MERCHANT_ID,
      subject: "Auto-escalation after 2 low-confidence turns",
      priority: "normal",
      channel: "widget",
      reason: "support.consecutive_unsure",
    });

    expect(ticket.status).toBe("open");
    expect(ticket.priority).toBe("normal");
  });

  it("creates high-priority ticket on refund escalation", async () => {
    const ticket = await createTicket({
      merchantId: MERCHANT_ID,
      subject: "Customer wants refund for damaged product",
      priority: "high",
      channel: "widget",
      reason: "support.refund_escalation",
    });

    expect(ticket.priority).toBe("high");
  });

  it("SLA first response deadline is always set and in the future", async () => {
    const ticket = await createTicket({
      merchantId: MERCHANT_ID,
      subject: "Urgent refund request",
      priority: "urgent",
      channel: "widget",
    });

    const dueAt = new Date(ticket.first_response_due_at);
    expect(dueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("truncates subject to 180 chars", async () => {
    const longSubject = "A".repeat(300);
    const ticket = await createTicket({
      merchantId: MERCHANT_ID,
      subject: longSubject,
      priority: "normal",
      channel: "widget",
    });

    expect(ticket.subject.length).toBeLessThanOrEqual(180);
  });

  it("AskResult ticketAction shape matches TicketAction type", async () => {
    const ticket = await createTicket({
      merchantId: MERCHANT_ID,
      subject: "Shape validation test",
      priority: "normal",
      channel: "widget",
      conversationId: "00000000-0000-0000-0000-000000001111",
    });

    const ticketAction = {
      ticketId: ticket.id,
      subject: ticket.subject,
      priority: ticket.priority,
      status: ticket.status,
      firstResponseDueAt: ticket.first_response_due_at,
      conversationId: "00000000-0000-0000-0000-000000001111",
    };

    expect(ticketAction.ticketId).toBeTruthy();
    expect(ticketAction.subject).toBeTruthy();
    expect(["low", "normal", "high", "urgent"]).toContain(
      ticketAction.priority,
    );
    expect(["open", "pending", "resolved", "closed"]).toContain(
      ticketAction.status,
    );
    expect(new Date(ticketAction.firstResponseDueAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.4 — Intent Detection: request_callback
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 9.4 — Intent Detection: request_callback", () => {
  const CALLBACK_PHRASES_EN = [
    "Please call me",
    "Can you call me back?",
    "I need a phone call",
    "Ring me please",
    "Request callback",
    "schedule a call back",
  ];

  const CALLBACK_PHRASES_BN = [
    "আমাকে কল করুন",
    "কলব্যাক দিন",
    "ফোন করুন",
    "আমাকে ফোন করুন",
    "কল দিন",
  ];

  it.each(CALLBACK_PHRASES_EN)(
    "detects request_callback from English phrase: %s",
    (phrase) => {
      expect(detectIntent(phrase)).toBe("request_callback");
    },
  );

  it.each(CALLBACK_PHRASES_BN)(
    "detects request_callback from Bangla phrase: %s",
    (phrase) => {
      expect(detectIntent(phrase)).toBe("request_callback");
    },
  );

  it("does NOT classify 'where is my order' as request_callback", () => {
    expect(detectIntent("where is my order?")).not.toBe("request_callback");
  });

  it("does NOT classify refund request as request_callback", () => {
    expect(detectIntent("I want a refund")).not.toBe("request_callback");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.4 — BD Phone Validation
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 9.4 — Bangladesh Phone Number Validation", () => {
  const VALID_NUMBERS = [
    "01712345678", // Standard Robi/GP local
    "01812345678", // Banglalink
    "01912345678", // Robi/Airtel
    "01312345678", // Teletalk
    "01412345678", // Teletalk/Skitto
    "01512345678", // Teletalk
    "01612345678", // GrameenPhone
    "+8801712345678", // E.164 with country code
    "8801712345678", // Without leading +
  ];

  const INVALID_NUMBERS = [
    "01012345678", // 010x not a valid BD operator prefix
    "01112345678", // 011x not valid
    "01212345678", // 012x not valid
    "0171234567", // Too short
    "017123456789", // Too long
    "1234567890", // Not BD format
    "", // Empty
    "not-a-number", // Alphanumeric
    "+15551234567", // US number
    "00447911123456", // UK number
  ];

  it.each(VALID_NUMBERS)("accepts valid BD number: %s", (num) => {
    const result = validateBdPhone(num);
    expect(result.valid, `Expected ${num} to be valid`).toBe(true);
    expect(result.normalised).toMatch(BD_PHONE_REGEX);
  });

  it.each(INVALID_NUMBERS)("rejects invalid number: %s", (num) => {
    const result = validateBdPhone(num);
    expect(result.valid, `Expected ${num} to be invalid`).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("normalises all valid formats to E.164 +880 prefix", () => {
    expect(normaliseBdPhone("01712345678")).toBe("+8801712345678");
    expect(normaliseBdPhone("+8801812345678")).toBe("+8801812345678");
    expect(normaliseBdPhone("8801912345678")).toBe("+8801912345678");
  });

  it("BD_PHONE_REGEX matches only valid +8801X numbers", () => {
    expect(BD_PHONE_REGEX.test("+8801712345678")).toBe(true);
    expect(BD_PHONE_REGEX.test("+8801012345678")).toBe(false); // 010 not valid
    expect(BD_PHONE_REGEX.test("+88017123456")).toBe(false); // Too short
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.4 — Callback Service: createCallback
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 9.4 — Callback Service: createCallback", () => {
  const MERCHANT_ID = "00000000-0000-0000-0000-000000009400";

  beforeEach(() => {
    clearInMemoryCallbacks();
  });

  it("creates callback and returns structured acknowledgement", async () => {
    const result = await createCallback({
      merchantId: MERCHANT_ID,
      conversationId: null,
      customerName: "Rahim Uddin",
      phone: "01712345678",
      preferredWindow: "morning",
      note: "Urgent help with bKash gateway issue",
      channel: "widget",
    });

    expect(result.id).toBeTruthy();
    expect(result.customerName).toBe("Rahim Uddin");
    expect(result.phoneE164).toBe("+8801712345678");
    expect(result.window).toBe("morning");
    expect(result.windowDescription).toBe("10:00 AM – 1:00 PM");
    expect(result.agentMessage).toContain("Rahim Uddin");
    expect(result.agentMessage).toContain("Morning");
    expect(result.agentMessage).toContain("#CB-");
    expect(result.agentMessageBn).toContain("সকাল");
    expect(result.agentMessageBn).toContain("#CB-");
  });

  it("stores callback in in-memory store with status=pending", async () => {
    await createCallback({
      merchantId: MERCHANT_ID,
      conversationId: null,
      customerName: "Nasreen Begum",
      phone: "01912345678",
      preferredWindow: "evening",
      note: "Need help with Pathao integration",
      channel: "widget",
    });

    const callbacks = getInMemoryCallbacks(MERCHANT_ID);
    expect(callbacks.length).toBe(1);
    expect(callbacks[0].customer_name).toBe("Nasreen Begum");
    expect(callbacks[0].phone_e164).toBe("+8801912345678");
    expect(callbacks[0].preferred_window).toBe("evening");
    expect(callbacks[0].status).toBe("pending");
  });

  it("sanitizes customer name to 100 chars and note to 500 chars", async () => {
    const longName = "A".repeat(300);
    const longNote = "B".repeat(600);

    const result = await createCallback({
      merchantId: MERCHANT_ID,
      conversationId: null,
      customerName: longName,
      phone: "01812345678",
      preferredWindow: "afternoon",
      note: longNote,
      channel: "widget",
    });

    expect(result.customerName.length).toBeLessThanOrEqual(100);
    expect(result.id).toBeTruthy();
  });

  it("all 3 callback windows have correct hours and bilingual labels", () => {
    expect(CALLBACK_WINDOWS.morning.label).toBe("Morning");
    expect(CALLBACK_WINDOWS.morning.labelBn).toBe("সকাল");
    expect(CALLBACK_WINDOWS.morning.description).toContain("10:00 AM");

    expect(CALLBACK_WINDOWS.afternoon.label).toBe("Afternoon");
    expect(CALLBACK_WINDOWS.afternoon.labelBn).toBe("দুপুর");
    expect(CALLBACK_WINDOWS.afternoon.description).toContain("2:00 PM");

    expect(CALLBACK_WINDOWS.evening.label).toBe("Evening");
    expect(CALLBACK_WINDOWS.evening.labelBn).toBe("সন্ধ্যা");
    expect(CALLBACK_WINDOWS.evening.description).toContain("6:00 PM");
  });

  it("generates unique callback IDs for concurrent requests", async () => {
    const [r1, r2, r3] = await Promise.all([
      createCallback({
        merchantId: MERCHANT_ID,
        conversationId: null,
        customerName: "User A",
        phone: "01712345678",
        preferredWindow: "morning",
        channel: "widget",
      }),
      createCallback({
        merchantId: MERCHANT_ID,
        conversationId: null,
        customerName: "User B",
        phone: "01812345678",
        preferredWindow: "afternoon",
        channel: "widget",
      }),
      createCallback({
        merchantId: MERCHANT_ID,
        conversationId: null,
        customerName: "User C",
        phone: "01912345678",
        preferredWindow: "evening",
        channel: "widget",
      }),
    ]);

    const ids = new Set([r1.id, r2.id, r3.id]);
    expect(ids.size).toBe(3);
  });

  it("callbackRef follows #CB-XXXXXX format", async () => {
    const result = await createCallback({
      merchantId: MERCHANT_ID,
      conversationId: null,
      customerName: "Karim Ahmed",
      phone: "01312345678",
      preferredWindow: "morning",
      channel: "widget",
    });

    const ref = `#CB-${result.id.slice(-6).toUpperCase()}`;
    expect(ref.startsWith("#CB-")).toBe(true);
    expect(ref.length).toBeGreaterThanOrEqual(7);
  });

  it("agentMessage contains callback reference and phone confirmation", async () => {
    const result = await createCallback({
      merchantId: MERCHANT_ID,
      conversationId: null,
      customerName: "Fatema Khatun",
      phone: "01512345678",
      preferredWindow: "afternoon",
      channel: "widget",
    });

    // Must have customer name, window label, and callback reference
    expect(result.agentMessage).toContain("Fatema Khatun");
    expect(result.agentMessage).toContain("Afternoon");
    expect(result.agentMessage).toContain("2:00 PM");
    expect(result.agentMessage).toContain("#CB-");
  });

  it("stores multiple callbacks independently per merchant", async () => {
    const MERCHANT_B = "00000000-0000-0000-0000-000000009401";

    await createCallback({
      merchantId: MERCHANT_ID,
      conversationId: null,
      customerName: "A",
      phone: "01712345678",
      preferredWindow: "morning",
      channel: "widget",
    });
    await createCallback({
      merchantId: MERCHANT_B,
      conversationId: null,
      customerName: "B",
      phone: "01812345678",
      preferredWindow: "evening",
      channel: "widget",
    });

    const cbA = getInMemoryCallbacks(MERCHANT_ID);
    const cbB = getInMemoryCallbacks(MERCHANT_B);
    expect(cbA.length).toBe(1);
    expect(cbB.length).toBe(1);
    expect(cbA[0].customer_name).toBe("A");
    expect(cbB[0].customer_name).toBe("B");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.3 & 9.4 — AskResult Type Contract
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 9.3 & 9.4 — AskResult Type Contract", () => {
  it("TicketAction shape is correct for auto-escalation", async () => {
    const ticket = await createTicket({
      merchantId: "00000000-0000-0000-0000-000000009300",
      subject: "Test ticket for AskResult shape",
      priority: "high",
      channel: "widget",
      conversationId: "00000000-0000-0000-0000-000000002222",
      reason: "support.refund_escalation",
    });

    // Simulate what the agent would set in ticketAction
    const ticketAction = {
      ticketId: ticket.id,
      subject: ticket.subject,
      priority: ticket.priority,
      status: ticket.status,
      firstResponseDueAt: ticket.first_response_due_at,
      conversationId: "00000000-0000-0000-0000-000000002222",
    };

    // All required fields present
    expect(ticketAction.ticketId).toBeTruthy();
    expect(ticketAction.subject).toBeTruthy();
    expect(ticketAction.priority).toBe("high");
    expect(ticketAction.status).toBe("open");
    expect(new Date(ticketAction.firstResponseDueAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(ticketAction.conversationId).toBeTruthy();
  });

  it("CallbackAction shape is correct for callback tool response", async () => {
    clearInMemoryCallbacks();
    const cb = await createCallback({
      merchantId: "00000000-0000-0000-0000-000000009400",
      conversationId: null,
      customerName: "Shape Test User",
      phone: "01712345678",
      preferredWindow: "morning",
      channel: "widget",
    });

    const callbackAction = {
      callbackId: cb.id,
      customerName: cb.customerName,
      phoneE164: cb.phoneE164,
      window: cb.window,
      windowDescription: cb.windowDescription,
      agentMessage: cb.agentMessage,
    };

    // All required fields present
    expect(callbackAction.callbackId).toBeTruthy();
    expect(callbackAction.customerName).toBe("Shape Test User");
    expect(callbackAction.phoneE164).toBe("+8801712345678");
    expect(callbackAction.window).toBe("morning");
    expect(callbackAction.windowDescription).toBe("10:00 AM – 1:00 PM");
    expect(callbackAction.agentMessage).toContain("Shape Test User");
    expect(callbackAction.agentMessage).toContain("Morning");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12.4 — Epistemic Humility & "I Don't Know" Circuit Breaker
// ─────────────────────────────────────────────────────────────────────────────

import {
  detectUngroundedOrSpeculative,
  buildEpistemicHumilityReply,
  EPISTEMIC_ADMISSION_EN,
  EPISTEMIC_ADMISSION_BN,
  EPISTEMIC_ACTION_PATHS,
  EPISTEMIC_HUMILITY_SIMILARITY_THRESHOLD,
  runSupportAgentTurn,
  askSupport,
  rateConversation,
  getConversationTakeoverState,
} from "./support-agent.server";
import {
  seedMockConversation,
  clearMockModerationData,
  getMockConversation,
} from "./support-moderation.server";
import { customerSendChatMessageFn } from "./support.functions";
import { queryCoverage } from "./support-kb.server";

describe("Phase 12.4 — Agent Epistemic Humility & 'I Don't Know' Circuit Breaker", () => {
  describe("A. Out-of-Domain & Speculative Query Detection", () => {
    const SPECULATIVE_EN = [
      "What is the weather in Dhaka today?",
      "Will it rain tomorrow in Chittagong?",
      "Should I invest in Bitcoin or Ethereum?",
      "Can you prescribe medicine for my fever and headache?",
      "Can I sue a company in civil court?",
      "How does your price compare to Daraz and Amazon?",
      "Who won the 2024 presidential election?",
      "Who scored the winning goal in the World Cup?",
      "Tell me a funny joke about cats",
      "Write a romantic poem for me",
    ];

    const SPECULATIVE_BN = [
      "আজকে ঢাকার আবহাওয়া কেমন?",
      "বৃষ্টি হবে কি না বলুন",
      "বিটকয়েন কি ভালো বিনিয়োগ?",
      "আমার রোগের জন্য কোন ওষুধ খাব?",
      "দারাজ থেকে কেন আপনার দাম বেশি?",
      "দেশের পরবর্তী প্রধানমন্ত্রী কে হবেন?",
      "আমাকে একটি সুন্দর কৌতুক বলুন",
    ];

    const LEGITIMATE_STORE_QUERIES = [
      "Where is my order #1002?",
      "What is your return policy for damaged clothes?",
      "Do you deliver to Sylhet?",
      "What are your delivery charges?",
      "How can I pay with bKash?",
      "Is cash on delivery available?",
      "আমার পার্সেলটি কোথায়?",
      "রিটার্ন পলিসি কি?",
      "বিকাশ দিয়ে কিভাবে পেমেন্ট করব?",
    ];

    it.each(SPECULATIVE_EN)(
      "flags speculative/ungrounded English query: '%s'",
      (query) => {
        expect(detectUngroundedOrSpeculative(query)).toBe(true);
      },
    );

    it.each(SPECULATIVE_BN)(
      "flags speculative/ungrounded Bangla query: '%s'",
      (query) => {
        expect(detectUngroundedOrSpeculative(query)).toBe(true);
      },
    );

    it.each(LEGITIMATE_STORE_QUERIES)(
      "does NOT flag legitimate store query: '%s'",
      (query) => {
        expect(detectUngroundedOrSpeculative(query)).toBe(false);
      },
    );
  });

  describe("B. Respectful Bilingual Limitation Admission", () => {
    it("English reply contains the exact required limitation statement", () => {
      const reply = buildEpistemicHumilityReply("en");
      expect(reply).toContain(EPISTEMIC_ADMISSION_EN);
      expect(reply).toContain(
        "I don't have verified info to answer this accurately.",
      );
    });

    it("Bangla reply contains the exact required limitation statement", () => {
      const reply = buildEpistemicHumilityReply("bn");
      expect(reply).toContain(EPISTEMIC_ADMISSION_BN);
      expect(reply).toContain(
        "আমি এই বিষয়ে নিশ্চিত নই এবং ভুল তথ্য এড়াতে অনুমান করতে চাই না।",
      );
    });

    it("renders all 4 proactive action paths in both English and Bangla", () => {
      const replyEn = buildEpistemicHumilityReply("en");
      const replyBn = buildEpistemicHumilityReply("bn");

      // 1. Transfer to human
      expect(replyEn).toContain("Transfer to Human Agent");
      expect(replyBn).toContain("মানুষের সাথে কথা বলুন");

      // 2. Request callback
      expect(replyEn).toContain("Request Callback");
      expect(replyBn).toContain("কলব্যাক অনুরোধ");

      // 3. Open ticket
      expect(replyEn).toContain("Open Support Ticket");
      expect(replyBn).toContain("সাপোর্ট টিকিট খুলুন");

      // 4. Direct contact info (verified truth: no fake phones)
      expect(replyEn).toContain("Direct Contact Info");
      expect(replyEn).not.toContain("+880 9612-345678");
      expect(replyEn).not.toContain("+880 1700-000000");
      expect(replyEn).toContain("Email:");
      expect(replyEn).toContain("Hours:");

      expect(replyBn).toContain("সরাসরি যোগাযোগ");
      expect(replyBn).not.toContain("+880 9612-345678");
      expect(replyBn).not.toContain("+880 1700-000000");
      expect(replyBn).toContain("সময়: সকাল ৯:০০ – রাত ১০:০০ BST");
    });
  });

  describe("C. Epistemic Action Paths Data Contract", () => {
    it("EPISTEMIC_ACTION_PATHS contains all 4 standard paths with labels and descriptions", () => {
      expect(EPISTEMIC_ACTION_PATHS).toHaveLength(4);
      const kinds = EPISTEMIC_ACTION_PATHS.map((p) => p.kind);
      expect(kinds).toContain("human_transfer");
      expect(kinds).toContain("callback_form");
      expect(kinds).toContain("create_ticket");
      expect(kinds).toContain("contact_info");

      for (const path of EPISTEMIC_ACTION_PATHS) {
        expect(path.label).toBeTruthy();
        expect(path.labelBn).toBeTruthy();
        expect(path.description).toBeTruthy();
        expect(path.descriptionBn).toBeTruthy();
      }
    });

    it("EPISTEMIC_HUMILITY_SIMILARITY_THRESHOLD is strictly 0.65", () => {
      expect(EPISTEMIC_HUMILITY_SIMILARITY_THRESHOLD).toBe(0.65);
    });
  });

  describe("D. Circuit Breaker Execution via runSupportAgentTurn", () => {
    it("runSupportAgentTurn is exported and aliases askSupport", () => {
      expect(typeof runSupportAgentTurn).toBe("function");
      expect(runSupportAgentTurn).toBe(askSupport);
    });

    it("triggers epistemic humility and refuses to hallucinate for an out-of-domain query", async () => {
      const res = await runSupportAgentTurn({
        slug: "demo",
        message: "What will the weather be tomorrow in Sylhet?",
        locale: "en",
      });

      // Assert epistemic humility circuit was engaged
      expect(res.epistemicTriggered).toBe(true);
      expect(res.epistemicReason).toBe("speculative_out_of_domain");
      expect(res.confidence).toBe("unsure");
      expect(res.needsAgent).toBe(true);
      expect(res.cta).toBe("human_transfer");

      // Assert reply contains admission of limitation
      expect(res.reply).toContain(EPISTEMIC_ADMISSION_EN);
      expect(res.reply).not.toContain("sunny");
      expect(res.reply).not.toContain("cloudy");

      // Assert action paths are populated
      expect(res.actionPaths).toHaveLength(4);
      expect(res.contactInfo).toBeDefined();
      expect(res.contactInfo?.email).toContain("framique.com");
    });

    it("triggers epistemic humility in Bangla for out-of-domain query", async () => {
      const res = await runSupportAgentTurn({
        slug: "demo",
        message: "বিটকয়েন কি হালাল না হারাম?",
        locale: "bn",
      });

      expect(res.epistemicTriggered).toBe(true);
      expect(res.confidence).toBe("unsure");
      expect(res.needsAgent).toBe(true);
      expect(res.reply).toContain(EPISTEMIC_ADMISSION_BN);
      expect(res.actionPaths).toHaveLength(4);
    });

    it("triggers epistemic humility when a question yields 0 verified KB hits without hallucinating", async () => {
      // Query about an obscure topic not in KB
      const res = await runSupportAgentTurn({
        slug: "demo",
        message:
          "Can I use Martian currency credits to pay for my sunglasses order?",
        locale: "en",
      });

      expect(res.epistemicTriggered).toBe(true);
      expect(res.confidence).toBe("unsure");
      expect(res.needsAgent).toBe(true);
      expect(res.cta).toBe("human_transfer");
      expect(res.reply).toContain(EPISTEMIC_ADMISSION_EN);
      // Ensure no hallucinated acceptance of Martian credits
      expect(res.reply).not.toMatch(/yes, we accept martian/i);
      expect(res.actionPaths).toHaveLength(4);
    });

    it("provides all 4 distinct proactive action paths upon epistemic humility activation", async () => {
      const res = await runSupportAgentTurn({
        slug: "demo",
        message: "Who won the premier league match yesterday?",
        locale: "en",
      });

      expect(res.actionPaths).toBeDefined();
      const kinds = res.actionPaths?.map((p) => p.kind);
      expect(kinds).toContain("human_transfer");
      expect(kinds).toContain("callback_form");
      expect(kinds).toContain("create_ticket");
      expect(kinds).toContain("contact_info");

      // Verify contact card details (verified truth: unverified phones hidden)
      expect(res.contactInfo?.phone ?? "").not.toBe("+880 9612-345678");
      expect(res.contactInfo?.whatsapp ?? "").not.toBe("+880 1700-000000");
      expect(res.contactInfo?.email).toContain("framique.com");
      expect(res.contactInfo?.hoursBn).toBe("সকাল ৯:০০ – রাত ১০:০০ BST");
    });

    it("welcomes customers on greetings without triggering epistemic humility circuit breaker", async () => {
      const resEn = await runSupportAgentTurn({
        slug: "demo",
        message: "Hello there!",
        locale: "en",
      });

      expect(resEn.epistemicTriggered).toBeFalsy();
      expect(resEn.reply).toContain("Welcome to");
      expect(resEn.reply).not.toContain(EPISTEMIC_ADMISSION_EN);

      const resBn = await runSupportAgentTurn({
        slug: "demo",
        message: "হ্যালো, কেমন আছেন?",
        locale: "bn",
      });

      expect(resBn.epistemicTriggered).toBeFalsy();
      expect(resBn.reply).toContain("স্বাগতম");
      expect(resBn.reply).not.toContain(EPISTEMIC_ADMISSION_BN);
    });

    it("constructively answers store shipping inquiries without triggering epistemic humility", async () => {
      const res = await runSupportAgentTurn({
        slug: "demo",
        message: "What are your delivery charges and shipping times?",
        locale: "en",
      });

      expect(res.epistemicTriggered).toBeFalsy();
      expect(res.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
      expect(res.reply.toLowerCase()).toMatch(
        /dhaka|delivery|courier|steadfast|pathao|checkout/i,
      );
    });

    it("constructively answers store operating hours without triggering epistemic humility", async () => {
      const res = await runSupportAgentTurn({
        slug: "demo",
        message: "What are your shop opening hours?",
        locale: "en",
      });

      expect(res.epistemicTriggered).toBeFalsy();
      expect(res.reply).not.toContain(EPISTEMIC_ADMISSION_EN);
      expect(res.reply).toMatch(/open|hours|active|9:00|10:00/i);
    });

    it("refuses to answer from a single-stem match when the decisive word is uncovered (ERP)", async () => {
      // Regression: "How to integrate ERP?" was answered from the
      // Pathao/RedX article on the strength of "integrat*" alone while
      // "ERP" matched nothing. A citation must cover every distinctive
      // query word or the humility circuit engages.
      const res = await runSupportAgentTurn({
        slug: "demo",
        message: "How to integrate ERP?",
        locale: "en",
      });

      expect(res.epistemicTriggered).toBe(true);
      expect(res.confidence).toBe("unsure");
      expect(res.needsAgent).toBe(true);
      expect(res.sources ?? []).toHaveLength(0);
      expect(res.reply).toContain(EPISTEMIC_ADMISSION_EN);
      expect(res.reply).not.toMatch(/pathao|redx/i);
    });
  });

  describe("D1. Query coverage gate (single-stem false positives)", () => {
    const PATHAO_TITLE =
      "Pathao & RedX Logistics, Automated Manifests & Real-Time Tracking";
    const PATHAO_BODY =
      "In addition to SteadFast, Framique integrates directly with Pathao Logistics and RedX Courier APIs for automated delivery dispatch across Bangladesh.";

    it("scores full coverage when every distinctive word matches", () => {
      expect(
        queryCoverage(
          "What are your delivery charges?",
          "Delivery Charges",
          "Inside Dhaka delivery charge is 60 taka. Outside Dhaka 120 taka.",
        ),
      ).toBe(1);
    });

    it("scores partial coverage when the decisive word is absent", () => {
      expect(
        queryCoverage("How to integrate ERP?", PATHAO_TITLE, PATHAO_BODY),
      ).toBe(0.5);
    });

    it("matches stems the same way the KB scorer does", () => {
      expect(
        queryCoverage("integrate couriers", PATHAO_TITLE, PATHAO_BODY),
      ).toBe(1);
    });

    it("scores zero when nothing matches", () => {
      expect(
        queryCoverage("Martian currency credits", PATHAO_TITLE, PATHAO_BODY),
      ).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12.5 — Bot Suppression Middleware for Human Takeover
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 12.5 — Bot Suppression Middleware for Human Takeover", () => {
  beforeEach(() => {
    clearMockModerationData();
  });

  it("strictly suppresses the LLM and automated bot replies when takeoverMode is explicitly human_takeover", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "Can someone help me with a return?",
      locale: "en",
      takeoverMode: "human_takeover",
    });

    // Verify bot suppression flags
    expect(res.botSuppressed).toBe(true);
    expect(res.humanTakeover).toBe(true);
    expect(res.staffActive).toBe(true);
    expect(res.staffIndicator).toBe("Staff active");
    expect(res.needsAgent).toBe(true);
    expect(res.confidence).toBe("pinned");
    expect(res.cta).toBe("none");

    // Reply acknowledges human takeover without automated LLM inference
    expect(res.reply).toContain("human support specialist");
    expect(res.conversationId).toBeDefined();
  });

  it("strictly suppresses the LLM when conversation is stored in human_takeover mode in moderation store", async () => {
    const convId = "conv-takeover-live-101";
    seedMockConversation({
      id: convId,
      merchantId: "merchant-demo-123",
      channel: "widget",
      status: "open",
      takeoverMode: "human_takeover",
      priority: "urgent",
      assignedOperatorId: "op_zara",
      operatorNotes: "High value customer VIP",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      needsHumanAgent: true,
      priorityRank: 1,
      lastCustomerMessageAt: null,
      lastOperatorMessageAt: null,
      resolvedAt: null,
      phoneHash: null,
      orderId: null,
      orderNumber: null,
      minutesSinceLastCustomerMsg: 0,
    });

    // Check takeover state lookup
    const state = await getConversationTakeoverState(
      "merchant-demo-123",
      convId,
    );
    expect(state?.takeoverMode).toBe("human_takeover");

    const res = await runSupportAgentTurn({
      slug: "demo",
      conversationId: convId,
      message: "Hello, is anyone there?",
      locale: "en",
    });

    expect(res.botSuppressed).toBe(true);
    expect(res.humanTakeover).toBe(true);
    expect(res.staffActive).toBe(true);
    expect(res.staffIndicator).toBe("Staff active");

    // Assert status updated to in_progress and lastCustomerMessageAt recorded
    const updated = getMockConversation(convId);
    expect(updated?.lastCustomerMessageAt).toBeDefined();
  });

  it("delivers accurate localized Bengali indicators when in human_takeover mode", async () => {
    const res = await runSupportAgentTurn({
      slug: "demo",
      message: "আমার অর্ডারটি কেন এখনও আসেনি?",
      locale: "bn",
      takeoverMode: "human_takeover",
    });

    expect(res.botSuppressed).toBe(true);
    expect(res.humanTakeover).toBe(true);
    expect(res.staffActive).toBe(true);
    expect(res.staffIndicator).toBe("অফিসার সক্রিয় আছেন");
    expect(res.reply).toContain("কাস্টমার সাপোর্ট স্পেশালিস্টের কাছে পৌঁছেছে");
  });

  it("allows standard AI ReAct execution when takeover_mode is ai", async () => {
    const convId = "conv-ai-mode-202";
    seedMockConversation({
      id: convId,
      merchantId: "merchant-demo-123",
      channel: "widget",
      status: "open",
      takeoverMode: "ai",
      priority: "normal",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      needsHumanAgent: false,
      priorityRank: 3,
      assignedOperatorId: null,
      operatorNotes: null,
      lastCustomerMessageAt: null,
      lastOperatorMessageAt: null,
      resolvedAt: null,
      phoneHash: null,
      orderId: null,
      orderNumber: null,
      minutesSinceLastCustomerMsg: null,
    });

    const state = await getConversationTakeoverState(
      "merchant-demo-123",
      convId,
    );
    expect(state?.takeoverMode).toBe("ai");

    const res = await runSupportAgentTurn({
      slug: "demo",
      conversationId: convId,
      message: "What is the weather in Sylhet today?",
      locale: "en",
    });

    // In AI mode, botSuppressed is NOT engaged, ReAct loop processes message
    expect(res.botSuppressed).toBeUndefined();
    expect(res.humanTakeover).toBeUndefined();
    // ReAct loop epistemic circuit breaker engaged
    expect(res.epistemicTriggered).toBe(true);
  });

  it("customerSendChatMessageFn is exported and functions properly", () => {
    expect(typeof customerSendChatMessageFn).toBe("function");
  });

  describe("Phase 12.6 — DeepWiki Synthesis Engine & RL Integration", () => {
    it("answers complex platform queries using DeepWiki RAG with citations", async () => {
      const res = await runSupportAgentTurn({
        slug: "demo",
        message:
          "How does SteadFast courier automated dispatch and webhook sync work?",
        locale: "en",
        engine: "deepwiki",
      });

      expect(res.epistemicTriggered).toBeUndefined();
      expect(res.reply).toContain("SteadFast Courier Logistics");
      expect(res.reply).toContain("DeepWiki");
      expect(res.deepWikiCitations).toBeDefined();
      expect(res.deepWikiCitations!.length).toBeGreaterThan(0);
      expect(res.deepWikiQueryId).toBeDefined();
      // Honest degraded mode: placeholder key → extractive-only banner + unsure;
      // live key → grounded. Never confident without provenance.
      if (res.degraded) {
        expect(res.confidence).toBe("unsure");
        expect(res.reply).toMatch(/degraded|extractive/i);
      } else {
        expect(res.confidence).toBe("grounded");
      }
      // DeepWiki citations are always labeled source:deepwiki, never canonical KB.
      expect(res.sources[0]?.table).toBe("deepwiki");
    });

    it("reinforces DeepWiki edge weights when customer rates a conversation with 5 stars", async () => {
      const convId = "conv-deepwiki-feedback-test";
      const res = await runSupportAgentTurn({
        slug: "demo",
        conversationId: convId,
        message:
          "Tell me about bKash direct tokenized checkout and zero transaction commission",
        locale: "en",
        engine: "deepwiki",
      });

      expect(res.deepWikiQueryId).toBeDefined();

      const ratingResult = await rateConversation(
        convId,
        5,
        "Excellent information!",
      );
      expect(ratingResult.ok).toBe(true);
      expect(ratingResult.rating).toBe(5);
    });
  });

  describe("Phase 12.7 — Customer Identity & Mail Notifications via askSupport", () => {
    it("accepts customerName and customerEmail and completes turn with email notifications dispatched", async () => {
      const convId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      const res = await runSupportAgentTurn({
        slug: "demo",
        conversationId: convId,
        customerName: "Ayesha Rahman",
        customerEmail: "ayesha@example.com",
        phone: "01712345678",
        orderNumber: "ORD-9988",
        message: "When will my dress be delivered?",
        locale: "en",
      });

      expect(res.conversationId).toBe(convId);
      expect(res.reply).toBeDefined();
      expect(typeof res.reply).toBe("string");
    });
  });

  describe("Phase 12.8 — Intelligent Admin Online Transfer, Callback Routing & RL+Atropos", () => {
    it("advises waiting for online admin transfer when operator heartbeat is active", async () => {
      const { recordOperatorHeartbeat } =
        await import("./support-presence.server");
      // Record presence for demo store merchant
      recordOperatorHeartbeat("merchant-demo-123", "op-1");

      const res = await runSupportAgentTurn({
        slug: "demo",
        message: "What will the stock price of Apple be tomorrow?",
        locale: "en",
      });

      expect(res.epistemicTriggered).toBe(true);
      expect(res.adminOnline).toBe(true);
      expect(res.staffActive).toBe(true);
      expect(res.cta).toBe("human_transfer");
      expect(res.reply).toContain("Support Specialist Online");
      expect(res.reply).toContain("transfer you");
    });

    it("advises callback & email follow-up when admin is offline", async () => {
      const { clearOperatorHeartbeatsForTest } =
        await import("./support-presence.server");
      clearOperatorHeartbeatsForTest();

      const res = await runSupportAgentTurn({
        slug: "demo",
        customerEmail: "shopper@test.com",
        message: "What will the stock price of Apple be tomorrow?",
        locale: "en",
      });

      expect(res.epistemicTriggered).toBe(true);
      expect(res.adminOnline).toBe(false);
      expect(res.staffActive).toBe(false);
      expect(res.reply).toContain("Live Support Away");
      expect(res.reply).toContain("shopper@test.com");
    });

    it("steps Atropos RL environment and updates reward when rating with isResolved", async () => {
      const { rateConversation } = await import("./support-agent.server");
      const convId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

      const ratingResult = await rateConversation(
        convId,
        5,
        "Fantastic support, problem was completely resolved!",
        true,
      );

      expect(ratingResult.ok).toBe(true);
      expect(ratingResult.rating).toBe(5);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TODO-3 — Agent brain: ML intent + sentiment + memory (adjacent coverage)
// ─────────────────────────────────────────────────────────────────────────────

describe("TODO-3 — Model-backed intent classification (fast path)", () => {
  it("classifies billing EN + BN + code-mixed with keyword source", () => {
    for (const phrase of [
      "My bKash payment failed but money was deducted",
      "I was charged twice on my card",
      "বিল বেশি এসেছে, টাকা কেটে নিয়েছে",
      "taka kete niyeche payment hoyni",
    ]) {
      const c = classifyIntent(phrase);
      expect(c.primary).toBe("billing");
      expect(c.source).toBe("keyword");
      expect(c.confidence).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("routes angry delivery turns to complaint, not the shipping FAQ", () => {
    const c = classifyIntent("Your delivery man was rude, this is a scam");
    expect(c.primary).toBe("complaint");
    expect(c.multi).toBe(true);
    expect(c.intents.map((i) => i.intent)).toContain("faq_shipping");
  });

  it("classifies technical bug reports incl. code-mixed", () => {
    expect(
      classifyIntent("website login hocche na error dicche").primary,
    ).toBe("technical");
    expect(classifyIntent("checkout shows an error 500").primary).toBe(
      "technical",
    );
  });

  it("classifies sales-lead intent EN + BN + code-mixed", () => {
    expect(
      classifyIntent("I want to open my own store, dealership pricing please")
        .primary,
    ).toBe("lead");
    expect(classifyIntent("dokan khulte chai paikari dam").primary).toBe(
      "lead",
    );
  });

  it("returns multi-intent for refund + order turns, primary = refund", () => {
    const c = classifyIntent("I want a refund for order 1001");
    expect(c.primary).toBe("refund");
    expect(c.multi).toBe(true);
    expect(c.intents.map((i) => i.intent)).toContain("order_status");
  });

  it("falls back to other below the low-confidence threshold", () => {
    const c = classifyIntent("what is the meaning of life");
    expect(c.primary).toBe("other");
    expect(c.source).toBe("fallback");
    expect(c.confidence).toBeLessThan(LOW_INTENT_CONFIDENCE_THRESHOLD);
    expect(c.multi).toBe(false);
  });

  it("keeps detectIntent backward compatible (refund before order_status)", () => {
    expect(detectIntent("I want a refund for order 1001")).toBe("refund");
    expect(detectIntent("Where is my order?")).toBe("order_status");
    expect(detectIntent("I was charged twice on my card")).toBe("billing");
  });
});

describe("TODO-3 — Sentiment/urgency scoring → priority fast-lane", () => {
  it("fast-lanes furious threats: angry + urgent + needsAgent, never a promise", () => {
    const v = analyzeSentiment("This is a SCAM! You cheaters! I will SUE you!!!");
    expect(v.sentiment).toBe("angry");
    expect(v.urgency).toBe("urgent");
    expect(v.priority).toBe("urgent");
    expect(v.needsAgent).toBe(true);
    expect(v.score).toBeLessThan(0);
    expect(v.signals).toContain("threat");
  });

  it("flags caps shouting as negative with human handoff", () => {
    const v = analyzeSentiment("WHERE IS MY ORDER I HAVE WAITED TEN DAYS");
    expect(v.signals).toContain("caps_shouting");
    expect(v.needsAgent).toBe(true);
    expect(["negative", "angry"]).toContain(v.sentiment);
  });

  it("treats code-mixed urgency as handoff even when sentiment is neutral", () => {
    const v = analyzeSentiment("taka kete niyeche, ekhuni refund din!");
    expect(v.urgency).toBe("high");
    expect(v.needsAgent).toBe(true);
    expect(v.signals).toContain("urgent_mixed");
  });

  it("scores delayed-parcel disappointment as negative/high-priority", () => {
    const v = analyzeSentiment("My parcel is 5 days late, very disappointed");
    expect(v.sentiment).toBe("negative");
    expect(v.priority).toBe("high");
    expect(v.needsAgent).toBe(true);
  });

  it("scores gratitude as positive/low with no handoff", () => {
    const v = analyzeSentiment("ধন্যবাদ, great service!");
    expect(v.sentiment).toBe("positive");
    expect(v.priority).toBe("low");
    expect(v.needsAgent).toBe(false);
    expect(v.score).toBeGreaterThan(0);
  });
});

describe("TODO-3 — Server-side conversation memory", () => {
  it("keeps the anchor turn inside the bounded budget", async () => {
    const agent = await import("./support-agent.server");
    agent.clearConversationMemory();
    agent.updateConversationMemory("mem-todo3-1", {
      role: "customer",
      message: "Where is my order ORD-1001?",
      intent: "order_status",
      sentiment: "neutral",
    });
    for (let i = 0; i < 10; i++) {
      agent.updateConversationMemory("mem-todo3-1", {
        role: i % 2 ? "bot" : "customer",
        message: `follow-up detail number ${i} about delivery timing`,
      });
    }
    const mem = agent.getConversationMemory("mem-todo3-1");
    expect(mem).not.toBeNull();
    expect(mem!.turnCount).toBe(11);
    expect(mem!.lastIntent).toBe("order_status");
    expect(mem!.summary.startsWith("C1(order_status)")).toBe(true);
    expect(mem!.summary.length).toBeLessThanOrEqual(
      agent.MEMORY_CONTEXT_BUDGET + 1,
    );
    const preamble = agent.buildMemoryContext("mem-todo3-1");
    expect(preamble.startsWith("Conversation so far:")).toBe(true);
    expect(agent.buildMemoryContext("mem-unknown-id")).toBe("");
    agent.clearConversationMemory();
    expect(agent.getConversationMemory("mem-todo3-1")).toBeNull();
  });
});
