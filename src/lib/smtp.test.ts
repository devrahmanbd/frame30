import { describe, expect, it } from "vitest";
import { buildMimeMessage, type SmtpConfig } from "./smtp.server";
import { sealSecret, unsealSecret } from "./webhook-secret.server";

describe("SMTP Configuration & Sealing", () => {
  it("seals and unseals SMTP passwords with AES-GCM", async () => {
    const rawSecret = "super-secret-smtp-pass-12345!@#$";
    const sealed = await sealSecret(rawSecret);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain(rawSecret);

    const recovered = await unsealSecret(sealed);
    expect(recovered).toBe(rawSecret);
  });

  it("handles corrupted or tampered seals gracefully without crashing", async () => {
    const badSeal = "v1.invalidiv.invalidcipher";
    const recovered = await unsealSecret(badSeal);
    expect(recovered).toBeNull();
  });
});

describe("buildMimeMessage", () => {
  const config: SmtpConfig = {
    enabled: true,
    host: "mail.example.com",
    port: 587,
    secure: false,
    user: "merchant@example.com",
    fromName: "Acme Boutique",
    fromEmail: "orders@acme.com",
    replyTo: "support@acme.com",
  };

  it("formats text-only MIME message with RFC compliant headers", () => {
    const mime = buildMimeMessage(config, {
      to: "customer@example.com",
      subject: "Order Confirmation FQ-100",
      text: "Thank you for your order!",
    });

    expect(mime).toContain('From: "Acme Boutique" <orders@acme.com>');
    expect(mime).toContain("To: <customer@example.com>");
    expect(mime).toContain("Reply-To: <support@acme.com>");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain("MIME-Version: 1.0");
    expect(mime).toContain("Content-Type: text/plain; charset=UTF-8");
  });

  it("formats multipart/alternative MIME message with HTML and RFC 8058 unsubscribe header", () => {
    const mime = buildMimeMessage(config, {
      to: "customer@example.com",
      subject: "Newsletter Autumn 2026",
      text: "Autumn collection is live: https://acme.com",
      html: "<h1>Autumn collection</h1><p>Check it out!</p>",
      unsubscribeUrl: "https://acme.com/unsubscribe?token=xyz123",
    });

    expect(mime).toContain("Content-Type: multipart/alternative; boundary=");
    expect(mime).toContain(
      "List-Unsubscribe: <https://acme.com/unsubscribe?token=xyz123>",
    );
    expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(mime).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(mime).toContain("Content-Type: text/html; charset=UTF-8");
  });
});
