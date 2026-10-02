/**
 * TODO-7 — PII-redacted mail.
 *
 * `sendSupportNotifications` used to email raw `userMessage` / `agentReply`
 * bodies, letting unredacted PII leave the boundary. Bodies now run through
 * `redactPii` + `screenOutbound`; these tests capture the captured mailer
 * payloads and prove the redaction.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MailMessage } from "./mailer.server";
import {
  sanitiseMailBody,
  sendSupportNotifications,
} from "./support-mail.server";

const sent = vi.hoisted(() => ({ mails: [] as MailMessage[] }));

vi.mock("./mailer.server", () => ({
  sendMail: vi.fn(async (msg: MailMessage) => {
    sent.mails.push(msg);
    return { ok: true, provider: "log", messageId: "test-1", simulated: true };
  }),
}));

beforeEach(() => {
  sent.mails.length = 0;
  vi.clearAllMocks();
});

const BASE = {
  merchantId: "demo-merchant",
  merchantName: "Moda Fashion",
  slug: "platform",
  conversationId: "conv-pii-1",
  customerName: "Ayesha Rahman",
  customerEmail: "ayesha@example.com",
};

describe("sanitiseMailBody — unit gate", () => {
  it("redacts email / phone / NID with stable placeholders", () => {
    const out = sanitiseMailBody(
      "Hi, reach me at ayesha@example.com or 01712345678. NID 1234567890 for the form.",
    );
    expect(out.text).not.toContain("ayesha@example.com");
    expect(out.text).not.toContain("01712345678");
    expect(out.text).not.toContain("1234567890");
    expect(out.text).toContain("[email redacted]");
    expect(out.text).toContain("[phone redacted]");
    expect(out.text).toContain("[nid redacted]");
    expect(out.piiHits).toEqual(
      expect.arrayContaining(["email", "phone", "nid"]),
    );
    expect(out.withheldRule).toBeNull();
  });

  it("passes clean commerce copy through untouched", () => {
    const raw = "Yes, you can exchange sizes within 7 days of delivery.";
    const out = sanitiseMailBody(raw);
    expect(out.text).toBe(raw);
    expect(out.piiHits).toEqual([]);
  });

  it("withholds bodies that fail the outbound screen (secret leak)", () => {
    const out = sanitiseMailBody(
      'Track it with api_key = "supersecretkey12345" on our dashboard.',
    );
    expect(out.text).toContain("Withheld by outbound safety filter");
    expect(out.text).toContain("secret_assignment");
    expect(out.text).not.toContain("supersecretkey12345");
    expect(out.withheldRule).toBe("secret_assignment");
  });
});

describe("sendSupportNotifications — redacted dispatch", () => {
  it("scrubs PII from admin + customer bodies (text and HTML)", async () => {
    const res = await sendSupportNotifications({
      ...BASE,
      phone: "01712345678",
      orderNumber: "ORD-9821",
      userMessage:
        "My email is ayesha@example.com and phone 01712345678. Where is order ORD-9821?",
      agentReply: "Checking now — I will call 01712345678 once confirmed.",
    });

    expect(res.ok).toBe(true);
    expect(sent.mails).toHaveLength(2);
    expect(res.piiRedacted).toEqual(expect.arrayContaining(["email", "phone"]));
    expect(res.withheldRules).toEqual([]);

    const admin = sent.mails.find((m) => m.to !== "ayesha@example.com")!;
    const customer = sent.mails.find((m) => m.to === "ayesha@example.com")!;
    // Structured contact headers stay for the desk; free-text echoes go.
    expect(admin.text).toContain("Customer Email: ayesha@example.com");
    expect(admin.text).toContain("My email is [email redacted]");
    expect(admin.text).not.toContain("My email is ayesha@example.com");
    expect(admin.text).not.toContain("I will call 01712345678");
    expect(admin.text).toContain("[phone redacted]");
    expect(admin.html ?? "").not.toContain("My email is ayesha@example.com");
    expect(admin.html ?? "").toContain("[email redacted]");

    expect(customer.text).not.toContain("ayesha@example.com");
    expect(customer.text).toContain("My email is [email redacted]");
    expect(customer.html ?? "").not.toContain("ayesha@example.com");
  });

  it("withholds secret-leaking replies instead of emailing them", async () => {
    const res = await sendSupportNotifications({
      ...BASE,
      userMessage: "Where is my order?",
      agentReply: 'Use api_key = "supersecretkey12345" to track it.',
    });

    expect(res.ok).toBe(true);
    expect(res.withheldRules).toEqual(["secret_assignment"]);
    for (const mail of sent.mails) {
      expect(mail.text).not.toContain("supersecretkey12345");
      expect(mail.text).toContain("Withheld by outbound safety filter");
    }
  });

  it("keeps the clean-path contract (no redactions, no withholds)", async () => {
    const res = await sendSupportNotifications({
      ...BASE,
      userMessage: "Can I exchange the medium size for a large?",
      agentReply: "Yes, you can exchange sizes within 7 days of delivery.",
      ticketRef: "#TKT-EXCH88",
      priority: "normal",
      locale: "en",
    });

    expect(res.ok).toBe(true);
    expect(res.piiRedacted).toEqual([]);
    expect(res.withheldRules).toEqual([]);
    const admin = sent.mails.find((m) => m.to !== "ayesha@example.com");
    expect(admin?.text).toContain(
      "Can I exchange the medium size for a large?",
    );
  });

  it("still skips dispatch on invalid customer email", async () => {
    const res = await sendSupportNotifications({
      ...BASE,
      customerEmail: "not-an-email",
      userMessage: "Hello?",
      agentReply: "Hi!",
    });
    expect(res.ok).toBe(false);
    expect(sent.mails).toHaveLength(0);
  });
});
