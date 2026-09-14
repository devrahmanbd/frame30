import { describe, it, expect, beforeEach } from "vitest";
import {
  setTakeoverMode,
  setConversationPriority,
  saveOperatorNotes,
  sendOperatorMessage,
  closeModeratedConversation,
  getModerationQueue,
  seedMockConversation,
  clearMockModerationData,
  getMockMessages,
  getMockConversations,
  type ModerationConversation,
} from "./support-moderation.server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConv(overrides: Partial<ModerationConversation> = {}): ModerationConversation {
  const now = new Date().toISOString();
  return {
    id: `conv_${Math.random().toString(36).slice(2, 10)}`,
    merchantId: "merchant_test_01",
    merchantName: "Test Store",
    merchantEmail: "owner@teststore.com",
    status: "open",
    takeoverMode: "ai",
    priority: "normal",
    operatorNotes: null,
    assignedOperatorId: null,
    lastOperatorMessageAt: null,
    lastCustomerMessageAt: now,
    resolvedAt: null,
    channel: "widget",
    phoneHash: null,
    orderId: null,
    orderNumber: null,
    createdAt: now,
    updatedAt: now,
    needsHumanAgent: false,
    minutesSinceLastCustomerMsg: 5,
    priorityRank: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Phase 12.1 — Support Chat Moderation, Human Takeover & Operator Collaboration", () => {
  beforeEach(() => {
    clearMockModerationData();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // A. Migration SQL Structural Validation
  // ─────────────────────────────────────────────────────────────────────────

  describe("Migration SQL Structural Validation", () => {
    const migrationPath = join(
      process.cwd(),
      "supabase/migrations/20260910040000_phase12_support_moderation_and_takeover.sql",
    );

    it("migration file exists at the correct path", () => {
      expect(existsSync(migrationPath)).toBe(true);
    });

    it("migration adds all required ai_conversations columns with correct types and constraints", () => {
      const sql = readFileSync(migrationPath, "utf-8").toLowerCase();

      expect(sql).toContain("takeover_mode");
      expect(sql).toContain("takeover_mode in ('ai', 'human_takeover')");
      expect(sql).toContain("priority");
      expect(sql).toContain("priority in ('low', 'normal', 'high', 'urgent')");
      expect(sql).toContain("operator_notes");
      expect(sql).toContain("assigned_operator_id");
      expect(sql).toContain("last_operator_message_at");
      expect(sql).toContain("last_customer_message_at");
      expect(sql).toContain("resolved_at");
    });

    it("migration adds sent_by_operator_id and is_internal_note to ai_messages", () => {
      const sql = readFileSync(migrationPath, "utf-8").toLowerCase();
      expect(sql).toContain("sent_by_operator_id");
      expect(sql).toContain("is_internal_note");
    });

    it("migration creates all required composite indexes for the moderation queue", () => {
      const sql = readFileSync(migrationPath, "utf-8").toLowerCase();
      expect(sql).toContain("idx_ai_conversations_moderation_queue");
      expect(sql).toContain("idx_ai_conversations_takeover_mode");
      expect(sql).toContain("idx_ai_conversations_assigned_operator");
      expect(sql).toContain("idx_ai_messages_operator");
      expect(sql).toContain("idx_ai_messages_internal_notes");
    });

    it("migration defines all required security-definer RPC helper functions", () => {
      const sql = readFileSync(migrationPath, "utf-8").toLowerCase();
      expect(sql).toContain("set_conversation_takeover");
      expect(sql).toContain("set_conversation_priority");
      expect(sql).toContain("save_operator_notes");
      expect(sql).toContain("close_moderated_conversation");
    });

    it("migration enforces RLS: operator_notes restricted to platform_admins", () => {
      const sql = readFileSync(migrationPath, "utf-8").toLowerCase();
      // RLS policies using is_platform_admin
      expect(sql).toContain("is_platform_admin");
      // Security definer RPCs enforce atomic admin-only access
      expect(sql).toContain("security definer");
      // RLS policies are created (drop/create pattern)
      expect(sql).toContain("create policy");
      // The insufficient_privileges guard is in the security-definer RPCs
      expect(sql).toContain("insufficient_privileges");
    });

    it("migration enables Supabase Realtime replication for ai_conversations and ai_messages", () => {
      const sql = readFileSync(migrationPath, "utf-8").toLowerCase();
      expect(sql).toContain("supabase_realtime");
      expect(sql).toContain("alter publication supabase_realtime add table public.ai_conversations");
      expect(sql).toContain("alter publication supabase_realtime add table public.ai_messages");
    });

    it("migration creates the moderation_queue view with priority_rank and needs_human_agent", () => {
      const sql = readFileSync(migrationPath, "utf-8").toLowerCase();
      expect(sql).toContain("moderation_queue");
      expect(sql).toContain("priority_rank");
      expect(sql).toContain("needs_human_agent");
      expect(sql).toContain("minutes_since_last_customer_msg");
    });

    it("migration revokes direct operator_notes mutation from non-admin merchant members", () => {
      const sql = readFileSync(migrationPath, "utf-8").toLowerCase();
      // The write policy must check operator_notes is null OR is_platform_admin
      expect(sql).toContain("operator_notes is null");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // B. Human Takeover Mode Management
  // ─────────────────────────────────────────────────────────────────────────

  describe("Human Takeover Mode Management", () => {
    it("switches conversation from AI mode to human_takeover and assigns operator", async () => {
      const conv = makeConv({ id: "conv_takeover_01", takeoverMode: "ai" });
      seedMockConversation(conv);

      const result = await setTakeoverMode("conv_takeover_01", "human_takeover", "operator_alice");

      expect(result.success).toBe(true);
      expect(result.previousMode).toBe("ai");
      expect(result.newMode).toBe("human_takeover");
      expect(result.assignedOperatorId).toBe("operator_alice");

      const updated = getMockConversations().find((c) => c.id === "conv_takeover_01");
      expect(updated?.takeoverMode).toBe("human_takeover");
      expect(updated?.assignedOperatorId).toBe("operator_alice");
      expect(updated?.lastOperatorMessageAt).not.toBeNull();
    });

    it("hands conversation back to AI and clears assigned operator", async () => {
      const conv = makeConv({
        id: "conv_takeover_02",
        takeoverMode: "human_takeover",
        assignedOperatorId: "operator_bob",
      });
      seedMockConversation(conv);

      const result = await setTakeoverMode("conv_takeover_02", "ai");

      expect(result.success).toBe(true);
      expect(result.previousMode).toBe("human_takeover");
      expect(result.newMode).toBe("ai");
      expect(result.assignedOperatorId).toBeNull();

      const updated = getMockConversations().find((c) => c.id === "conv_takeover_02");
      expect(updated?.takeoverMode).toBe("ai");
      expect(updated?.assignedOperatorId).toBeNull();
    });

    it("sets last_operator_message_at when entering human_takeover mode", async () => {
      const before = Date.now();
      const conv = makeConv({ id: "conv_takeover_03" });
      seedMockConversation(conv);

      await setTakeoverMode("conv_takeover_03", "human_takeover", "op_01");

      const updated = getMockConversations().find((c) => c.id === "conv_takeover_03");
      expect(updated?.lastOperatorMessageAt).not.toBeNull();
      const ts = new Date(updated!.lastOperatorMessageAt!).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // C. Priority Triage Queue Management
  // ─────────────────────────────────────────────────────────────────────────

  describe("Priority Triage Queue Management", () => {
    it("escalates a conversation from normal to urgent and updates priorityRank to 4", async () => {
      const conv = makeConv({ id: "conv_prio_01", priority: "normal", priorityRank: 2 });
      seedMockConversation(conv);

      const result = await setConversationPriority("conv_prio_01", "urgent");

      expect(result.success).toBe(true);
      expect(result.previousPriority).toBe("normal");
      expect(result.newPriority).toBe("urgent");

      const updated = getMockConversations().find((c) => c.id === "conv_prio_01");
      expect(updated?.priority).toBe("urgent");
      expect(updated?.priorityRank).toBe(4);
    });

    it("de-escalates a conversation from high to low and updates priorityRank to 1", async () => {
      const conv = makeConv({ id: "conv_prio_02", priority: "high", priorityRank: 3 });
      seedMockConversation(conv);

      const result = await setConversationPriority("conv_prio_02", "low");

      expect(result.success).toBe(true);
      expect(result.newPriority).toBe("low");

      const updated = getMockConversations().find((c) => c.id === "conv_prio_02");
      expect(updated?.priorityRank).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D. Operator Notes (Private Scratchpad)
  // ─────────────────────────────────────────────────────────────────────────

  describe("Private Operator Notes", () => {
    it("saves operator notes for a conversation", async () => {
      const conv = makeConv({ id: "conv_notes_01", operatorNotes: null });
      seedMockConversation(conv);

      const result = await saveOperatorNotes(
        "conv_notes_01",
        "Customer threatening chargeback — escalate to billing team.",
      );

      expect(result.success).toBe(true);

      const updated = getMockConversations().find((c) => c.id === "conv_notes_01");
      expect(updated?.operatorNotes).toBe(
        "Customer threatening chargeback — escalate to billing team.",
      );
    });

    it("overwrites existing operator notes", async () => {
      const conv = makeConv({ id: "conv_notes_02", operatorNotes: "Old note." });
      seedMockConversation(conv);

      await saveOperatorNotes("conv_notes_02", "Updated: issue resolved by billing team.");

      const updated = getMockConversations().find((c) => c.id === "conv_notes_02");
      expect(updated?.operatorNotes).toBe("Updated: issue resolved by billing team.");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // E. Operator Message Injection
  // ─────────────────────────────────────────────────────────────────────────

  describe("Operator Message Injection", () => {
    it("injects a human operator message into the conversation stream", async () => {
      const conv = makeConv({
        id: "conv_msg_01",
        merchantId: "merch_01",
        takeoverMode: "human_takeover",
        needsHumanAgent: true,
      });
      seedMockConversation(conv);

      const msg = await sendOperatorMessage({
        conversationId: "conv_msg_01",
        merchantId: "merch_01",
        body: "Hi, I'm from the support team. I'm looking into your order now.",
        operatorId: "operator_alice",
      });

      expect(msg.role).toBe("agent");
      expect(msg.sentByOperatorId).toBe("operator_alice");
      expect(msg.isInternalNote).toBe(false);
      expect(msg.body).toContain("support team");

      const messages = getMockMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].conversationId).toBe("conv_msg_01");

      // Conversation's last_operator_message_at should be updated, needsHumanAgent cleared
      const updated = getMockConversations().find((c) => c.id === "conv_msg_01");
      expect(updated?.lastOperatorMessageAt).not.toBeNull();
      expect(updated?.needsHumanAgent).toBe(false);
    });

    it("marks a message as an internal note — not visible to merchant or customer", async () => {
      const conv = makeConv({ id: "conv_msg_02", merchantId: "merch_02" });
      seedMockConversation(conv);

      const msg = await sendOperatorMessage({
        conversationId: "conv_msg_02",
        merchantId: "merch_02",
        body: "Flagging this customer for fraud team review before responding.",
        operatorId: "operator_carol",
        isInternalNote: true,
      });

      expect(msg.isInternalNote).toBe(true);
      expect(msg.sentByOperatorId).toBe("operator_carol");

      const messages = getMockMessages();
      expect(messages.some((m) => m.isInternalNote)).toBe(true);
    });

    it("multiple operator messages accumulate in the message store", async () => {
      const conv = makeConv({ id: "conv_msg_03", merchantId: "merch_03" });
      seedMockConversation(conv);

      await sendOperatorMessage({
        conversationId: "conv_msg_03",
        merchantId: "merch_03",
        body: "Checking your order now…",
        operatorId: "operator_alice",
      });
      await sendOperatorMessage({
        conversationId: "conv_msg_03",
        merchantId: "merch_03",
        body: "Your order is being processed. Expected delivery: 3-5 business days.",
        operatorId: "operator_alice",
      });

      const messages = getMockMessages().filter((m) => m.conversationId === "conv_msg_03");
      expect(messages).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // F. Conversation Lifecycle Closure
  // ─────────────────────────────────────────────────────────────────────────

  describe("Conversation Lifecycle Closure", () => {
    it("closes a moderated conversation, clears takeover and sets resolved_at", async () => {
      const conv = makeConv({
        id: "conv_close_01",
        status: "open",
        takeoverMode: "human_takeover",
        assignedOperatorId: "operator_alice",
      });
      seedMockConversation(conv);

      const result = await closeModeratedConversation(
        "conv_close_01",
        "Issue resolved. Customer confirmed delivery.",
      );

      expect(result.success).toBe(true);
      expect(result.conversationId).toBe("conv_close_01");
      expect(result.resolvedAt).toBeTruthy();
      expect(new Date(result.resolvedAt).getTime()).toBeLessThanOrEqual(Date.now());

      const updated = getMockConversations().find((c) => c.id === "conv_close_01");
      expect(updated?.status).toBe("closed");
      expect(updated?.takeoverMode).toBe("ai");
      expect(updated?.assignedOperatorId).toBeNull();
      expect(updated?.operatorNotes).toContain("resolved");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // G. Moderation Queue — Sorting, Filtering, and Badging
  // ─────────────────────────────────────────────────────────────────────────

  describe("Moderation Queue — Sorting, Filtering & Badge Counts", () => {
    it("returns conversations sorted by urgency first, then by last customer message", async () => {
      const older = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const newer = new Date().toISOString();

      seedMockConversation(makeConv({ id: "q_low",    priority: "low",    priorityRank: 1, lastCustomerMessageAt: newer }));
      seedMockConversation(makeConv({ id: "q_urgent", priority: "urgent", priorityRank: 4, lastCustomerMessageAt: older }));
      seedMockConversation(makeConv({ id: "q_high",   priority: "high",   priorityRank: 3, lastCustomerMessageAt: newer }));

      const queue = await getModerationQueue();

      const ids = queue.conversations.map((c) => c.id);
      // Urgent first, then high, then low regardless of timestamp
      expect(ids.indexOf("q_urgent")).toBeLessThan(ids.indexOf("q_high"));
      expect(ids.indexOf("q_high")).toBeLessThan(ids.indexOf("q_low"));
    });

    it("filters by takeoverMode=human_takeover", async () => {
      seedMockConversation(makeConv({ id: "q_ai",    takeoverMode: "ai" }));
      seedMockConversation(makeConv({ id: "q_human", takeoverMode: "human_takeover" }));

      const queue = await getModerationQueue({ takeoverMode: "human_takeover" });

      expect(queue.conversations).toHaveLength(1);
      expect(queue.conversations[0].id).toBe("q_human");
    });

    it("filters by needsAgentOnly=true — returns only conversations awaiting human", async () => {
      seedMockConversation(makeConv({ id: "q_no_need",    needsHumanAgent: false }));
      seedMockConversation(makeConv({ id: "q_needs_agent", needsHumanAgent: true }));

      const queue = await getModerationQueue({ needsAgentOnly: true });

      expect(queue.conversations).toHaveLength(1);
      expect(queue.conversations[0].id).toBe("q_needs_agent");
    });

    it("returns correct badge counts: needsAgentCount and humanTakeoverCount", async () => {
      seedMockConversation(makeConv({ id: "q_1", needsHumanAgent: true,  takeoverMode: "ai" }));
      seedMockConversation(makeConv({ id: "q_2", needsHumanAgent: true,  takeoverMode: "human_takeover" }));
      seedMockConversation(makeConv({ id: "q_3", needsHumanAgent: false, takeoverMode: "human_takeover" }));
      seedMockConversation(makeConv({ id: "q_4", needsHumanAgent: false, takeoverMode: "ai" }));

      const queue = await getModerationQueue();

      expect(queue.needsAgentCount).toBe(2);
      expect(queue.humanTakeoverCount).toBe(2);
      expect(queue.totalCount).toBe(4);
    });

    it("filters by merchantId for per-merchant scope", async () => {
      seedMockConversation(makeConv({ id: "q_merch_a", merchantId: "merchant_alpha" }));
      seedMockConversation(makeConv({ id: "q_merch_b", merchantId: "merchant_beta" }));

      const queue = await getModerationQueue({ merchantId: "merchant_alpha" });

      expect(queue.conversations).toHaveLength(1);
      expect(queue.conversations[0].merchantId).toBe("merchant_alpha");
    });

    it("paginates correctly with limit and offset", async () => {
      for (let i = 0; i < 10; i++) {
        seedMockConversation(makeConv({ id: `q_paged_${i}` }));
      }

      const page1 = await getModerationQueue({ limit: 4, offset: 0 });
      const page2 = await getModerationQueue({ limit: 4, offset: 4 });
      const page3 = await getModerationQueue({ limit: 4, offset: 8 });

      expect(page1.conversations).toHaveLength(4);
      expect(page2.conversations).toHaveLength(4);
      expect(page3.conversations).toHaveLength(2);
      expect(page1.totalCount).toBe(10);

      // No overlap between pages
      const allIds = [
        ...page1.conversations.map((c) => c.id),
        ...page2.conversations.map((c) => c.id),
        ...page3.conversations.map((c) => c.id),
      ];
      expect(new Set(allIds).size).toBe(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // H. End-to-End Escalation Scenario
  // ─────────────────────────────────────────────────────────────────────────

  describe("End-to-End Escalation Scenario", () => {
    it("executes a complete triage lifecycle: arrive → escalate → takeover → respond → close", async () => {
      // 1. New conversation arrives in AI mode
      const conv = makeConv({
        id: "conv_e2e",
        merchantId: "merchant_dhaka_boutique",
        takeoverMode: "ai",
        priority: "normal",
        needsHumanAgent: false,
        status: "open",
      });
      seedMockConversation(conv);

      // 2. Customer has been waiting 45min — mark needs agent
      const withNeed = getMockConversations().find((c) => c.id === "conv_e2e")!;
      withNeed.needsHumanAgent = true;
      seedMockConversation(withNeed);

      const urgentQueue = await getModerationQueue({ needsAgentOnly: true });
      expect(urgentQueue.conversations.some((c) => c.id === "conv_e2e")).toBe(true);

      // 3. Operator escalates priority to urgent
      await setConversationPriority("conv_e2e", "urgent");
      const afterPrio = getMockConversations().find((c) => c.id === "conv_e2e");
      expect(afterPrio?.priority).toBe("urgent");
      expect(afterPrio?.priorityRank).toBe(4);

      // 4. Operator takes over the conversation
      await setTakeoverMode("conv_e2e", "human_takeover", "operator_zara");
      const afterTakeover = getMockConversations().find((c) => c.id === "conv_e2e");
      expect(afterTakeover?.takeoverMode).toBe("human_takeover");
      expect(afterTakeover?.assignedOperatorId).toBe("operator_zara");

      // 5. Operator writes private internal note
      await saveOperatorNotes("conv_e2e", "Customer escalated due to SteadFast delay. Opened ticket with courier.");
      const afterNote = getMockConversations().find((c) => c.id === "conv_e2e");
      expect(afterNote?.operatorNotes).toContain("SteadFast delay");

      // 6. Operator sends a public reassurance message
      const msg = await sendOperatorMessage({
        conversationId: "conv_e2e",
        merchantId: "merchant_dhaka_boutique",
        body: "আপনার অর্ডারের বিষয়ে আমরা কুরিয়ারের সাথে যোগাযোগ করেছি। দুঃখিত দেরির জন্য।",
        operatorId: "operator_zara",
      });
      expect(msg.isInternalNote).toBe(false);
      expect(msg.body).toContain("কুরিয়ার");

      // 7. Close conversation
      const closeResult = await closeModeratedConversation(
        "conv_e2e",
        "Resolved. Courier confirmed delivery attempt tomorrow.",
      );
      expect(closeResult.success).toBe(true);

      const finalState = getMockConversations().find((c) => c.id === "conv_e2e");
      expect(finalState?.status).toBe("closed");
      expect(finalState?.takeoverMode).toBe("ai");
      expect(finalState?.resolvedAt).not.toBeNull();
      expect(finalState?.assignedOperatorId).toBeNull();
    });
  });
});
