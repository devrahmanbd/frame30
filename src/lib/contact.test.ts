import { describe, expect, it } from "vitest";
import {
  CONTACT_LIMITS,
  CONTACT_ROUTES,
  contactReference,
  normaliseContact,
  renderContactAcknowledgement,
  responseDueAt,
  retryAt,
  scoreContact,
} from "./contact";

describe("contact validation", () => {
  it("normalises accepted visitor details", () => {
    expect(normaliseContact({
      name: "  Rifat   Ahmed ",
      email: "RIFAT@EXAMPLE.COM ",
      phone: "+880 1700 000000",
      message: " I need help migrating my existing product catalogue. ",
    })).toEqual({ ok: true, value: {
      name: "Rifat Ahmed",
      email: "rifat@example.com",
      phone: "+880 1700 000000",
      message: "I need help migrating my existing product catalogue.",
    } });
  });

  it.each([
    [{ name: "x", email: "a@b.com", message: "A useful message with enough detail." }, "name_invalid"],
    [{ name: "Rifat", email: "invalid", message: "A useful message with enough detail." }, "email_invalid"],
    [{ name: "Rifat", email: "a@b.com", phone: "12", message: "A useful message with enough detail." }, "phone_invalid"],
    [{ name: "Rifat", email: "a@b.com", message: "too short" }, "message_too_short"],
  ])("rejects malformed input", (input, reason) => {
    expect(normaliseContact(input)).toEqual({ ok: false, reason });
  });

  it("caps the message at the persisted field budget", () => {
    expect(normaliseContact({ name: "Rifat", email: "a@b.com", message: "x".repeat(CONTACT_LIMITS.maxMessageChars + 1) }))
      .toEqual({ ok: false, reason: "message_too_long" });
  });
});

describe("contact anti-abuse policy", () => {
  const submittedAt = 10_000_000;

  it("hard-blocks a filled honeypot", () => {
    expect(scoreContact({ honeypot: "https://spam.test", submittedAt })).toMatchObject({
      score: 100,
      reasons: ["bot_honeypot"],
      blocked: true,
    });
  });

  it("blocks an impossibly fast form", () => {
    expect(scoreContact({ renderedAt: submittedAt - 50, submittedAt })).toMatchObject({
      score: 70,
      reasons: ["bot_timing"],
      blocked: true,
    });
  });

  it("flags an expired form without discarding a plausible visitor", () => {
    expect(scoreContact({ renderedAt: submittedAt - CONTACT_LIMITS.maxFormAgeMs - 1, submittedAt }))
      .toMatchObject({ score: 30, reasons: ["form_expired"], blocked: false });
  });

  it("does not treat clock skew as proof of automation", () => {
    expect(scoreContact({ renderedAt: submittedAt + 60_000, submittedAt }))
      .toEqual({ score: 0, reasons: [], blocked: false });
  });
});

describe("routing and receipts", () => {
  const now = new Date("2026-08-15T10:00:00.000Z");

  it("publishes explicit, topic-specific response targets", () => {
    expect(CONTACT_ROUTES.support.responseHours).toBeLessThan(CONTACT_ROUTES.sales.responseHours);
    expect(CONTACT_ROUTES.migration.responseHours).toBeGreaterThan(CONTACT_ROUTES.sales.responseHours);
    expect(responseDueAt("support", now).toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });

  it("creates stable references without exposing an email or database id", () => {
    expect(contactReference(now, new Uint8Array([1, 2, 3, 4, 5])))
      .toBe("FQ-20260815-0102030405");
  });

  it("renders bilingual acknowledgement with the reference and SLA", () => {
    const en = renderContactAcknowledgement({ name: "Rifat", reference: "FQ-1", topic: "sales", locale: "en" });
    const bn = renderContactAcknowledgement({ name: "রিফাত", reference: "FQ-1", topic: "sales", locale: "bn" });
    expect(en.text).toContain("4 business hours");
    expect(bn.text).toContain("৪ কর্মঘণ্টার");
    expect(bn.subject).toMatch(/[\u0980-\u09FF]/);
  });

  it("escapes names before placing them in HTML", () => {
    const mail = renderContactAcknowledgement({ name: "<script>x</script>", reference: "FQ-1", topic: "support", locale: "en" });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("backs delivery off exponentially with a ceiling", () => {
    expect(retryAt(1, now).getTime() - now.getTime()).toBe(30_000);
    expect(retryAt(2, now).getTime() - now.getTime()).toBe(60_000);
    expect(retryAt(20, now).getTime() - now.getTime()).toBe(1_800_000);
  });
});