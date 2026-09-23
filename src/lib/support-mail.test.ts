import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveAdminEmail,
  sendSupportNotifications,
  type SupportNotificationInput,
} from "./support-mail.server";
import { ORG_NAP } from "./nap";

describe("Support Mail Notifications (support-mail.server)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves default admin email for platform mode", async () => {
    const adminEmail = await resolveAdminEmail(
      "00000000-0000-4000-8000-000000000001",
      "platform",
    );
    expect(adminEmail).toBe(ORG_NAP.supportEmail);
  });

  it("safely skips dispatch if customer email is invalid", async () => {
    const res = await sendSupportNotifications({
      merchantId: "demo-merchant",
      merchantName: "Test Merchant",
      slug: "test-store",
      conversationId: "conv-123",
      customerName: "John Doe",
      customerEmail: "invalid-email-format",
      userMessage: "Where is my product?",
      agentReply: "It is being delivered tomorrow.",
    });

    expect(res.ok).toBe(false);
    expect(res.adminResult).toBeNull();
    expect(res.customerResult).toBeNull();
  });

  it("successfully dispatches admin notification and customer reply in English", async () => {
    const input: SupportNotificationInput = {
      merchantId: "demo-merchant",
      merchantName: "Moda Fashion",
      slug: "moda",
      conversationId: "conv-456",
      customerName: "Ayesha Rahman",
      customerEmail: "ayesha@example.com",
      phone: "01712345678",
      orderNumber: "ORD-9821",
      userMessage: "Can I exchange the medium size for a large?",
      agentReply: "Yes, you can exchange sizes within 7 days of delivery.",
      ticketRef: "#TKT-EXCH88",
      priority: "normal",
      locale: "en",
    };

    const res = await sendSupportNotifications(input);

    expect(res.ok).toBe(true);
    expect(res.customerRecipient).toBe("ayesha@example.com");
    expect(res.adminRecipient).toBeDefined();
    expect(res.adminResult).toBeDefined();
    expect(res.adminResult?.ok).toBe(true);
    expect(res.customerResult).toBeDefined();
    expect(res.customerResult?.ok).toBe(true);
  });

  it("formats Bengali customer email correctly when locale is bn", async () => {
    const input: SupportNotificationInput = {
      merchantId: "demo-merchant",
      merchantName: "ঢাকা মার্ট",
      slug: "dhaka-mart",
      conversationId: "conv-789",
      customerName: "রাকিবুল হাসান",
      customerEmail: "rakib@example.com",
      userMessage: "আমার অর্ডারটি কি পাঠানো হয়েছে?",
      agentReply:
        "আপনার অর্ডারটি প্যাকেজিং সম্পন্ন হয়েছে এবং কুরিয়ারে হস্তান্তর করা হয়েছে।",
      locale: "bn",
    };

    const res = await sendSupportNotifications(input);

    expect(res.ok).toBe(true);
    expect(res.customerRecipient).toBe("rakib@example.com");
    expect(res.customerResult?.ok).toBe(true);
  });
});
