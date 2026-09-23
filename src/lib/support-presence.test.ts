import { describe, expect, it, beforeEach } from "vitest";
import {
  recordOperatorHeartbeat,
  isOperatorOnline,
  getMerchantSupportAvailability,
  clearOperatorHeartbeatsForTest,
  OPERATOR_HEARTBEAT_TTL_MS,
} from "./support-presence.server";
import { seedMockConversation } from "./support-moderation.server";

describe("Support Presence & Operator Online Tracking", () => {
  const merchantId = "00000000-0000-4000-8000-000000000001";
  const conversationId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

  beforeEach(() => {
    clearOperatorHeartbeatsForTest();
  });

  it("returns offline when no heartbeat or takeover exists", async () => {
    const presence = await isOperatorOnline(merchantId);
    expect(presence.isOnline).toBe(false);
    expect(presence.reason).toBe("offline");

    const avail = await getMerchantSupportAvailability(merchantId);
    expect(avail.isOnline).toBe(false);
    expect(avail.channel).toBe("callback_or_email");
    expect(avail.statusTextEn).toContain("away");
  });

  it("registers operator heartbeat and returns online", async () => {
    const res = recordOperatorHeartbeat(merchantId, "op-user-1");
    expect(res.ok).toBe(true);

    const presence = await isOperatorOnline(merchantId);
    expect(presence.isOnline).toBe(true);
    expect(presence.reason).toBe("heartbeat");
    expect(presence.lastSeenAt).toBeDefined();

    const avail = await getMerchantSupportAvailability(merchantId);
    expect(avail.isOnline).toBe(true);
    expect(avail.channel).toBe("live_chat");
    expect(avail.statusTextBn).toContain("সাপোর্ট স্পেশালিস্ট অনলাইনে আছেন");
  });

  it("detects human_takeover mode even if no recent heartbeat exists", async () => {
    // Register mock conversation in human_takeover mode
    seedMockConversation({
      id: conversationId,
      merchantId,
      status: "open",
      takeoverMode: "human_takeover",
      priority: "high",
      operatorNotes: null,
      assignedOperatorId: "op-specialist-9",
      lastOperatorMessageAt: null,
      lastCustomerMessageAt: new Date().toISOString(),
      resolvedAt: null,
      channel: "storefront",
      phoneHash: null,
      orderId: null,
      orderNumber: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      needsHumanAgent: true,
      minutesSinceLastCustomerMsg: 1,
      priorityRank: 2,
    });

    const presence = await isOperatorOnline(merchantId, conversationId);
    expect(presence.isOnline).toBe(true);
    expect(presence.reason).toBe("active_takeover");
  });

  it("isolates operator presence across different merchants", async () => {
    const otherMerchantId = "00000000-0000-4000-8000-000000000002";
    recordOperatorHeartbeat(merchantId, "op-1");

    const presence1 = await isOperatorOnline(merchantId);
    const presence2 = await isOperatorOnline(otherMerchantId);

    expect(presence1.isOnline).toBe(true);
    expect(presence2.isOnline).toBe(false);
  });
});
