import { describe, expect, it } from "vitest";
import {
  CONSENT_TEXT,
  CONSENT_VERSION,
  NEWSLETTER_LIMITS,
  backoffDelayMs,
  canResend,
  generateToken,
  isDisposableDomain,
  normaliseSource,
  outboxIsDead,
  renderEmail,
  scoreSubmission,
  statusAfterBounce,
  validateEmail,
  verifyExpiry,
} from "./newsletter";

describe("validateEmail", () => {
  it("accepts a normal address and lowercases it", () => {
    const v = validateEmail("  Rifat.Ahmed@Example.COM ");
    expect(v).toMatchObject({ ok: true, email: "rifat.ahmed@example.com", domain: "example.com" });
  });

  it.each([
    ["", "email_required"],
    ["not-an-address", "email_invalid"],
    ["a@b", "email_invalid"],
    ["a@[10.0.0.1]", "email_invalid"],
    ["a b@example.com", "email_invalid"],
    ["a@example.c1", "email_invalid"],
    ["a@-bad.com", "email_invalid"],
    ["a@example..com", "email_invalid"],
  ])("rejects %s", (input, reason) => {
    expect(validateEmail(input)).toEqual({ ok: false, reason });
  });

  it("rejects an address longer than the RFC path limit", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(validateEmail(long)).toEqual({ ok: false, reason: "email_too_long" });
  });

  it("rejects throwaway mailboxes, including sub-domained services", () => {
    expect(validateEmail("x@mailinator.com")).toEqual({ ok: false, reason: "email_disposable" });
    expect(isDisposableDomain("private.1secmail.com")).toBe(true);
    expect(isDisposableDomain("example.com")).toBe(false);
  });

  it("rejects shared role mailboxes that cannot give personal consent", () => {
    expect(validateEmail("info@example.com")).toEqual({ ok: false, reason: "email_role_address" });
    expect(validateEmail("Support@Example.com")).toEqual({ ok: false, reason: "email_role_address" });
  });
});

describe("scoreSubmission", () => {
  const base = { submittedAt: 10_000_000, consent: true };

  it("rejects a filled honeypot before anything else", () => {
    expect(scoreSubmission({ ...base, honeypot: "Acme Ltd", consent: false })).toEqual({
      ok: false,
      reason: "bot_honeypot",
    });
  });

  it("requires consent", () => {
    expect(scoreSubmission({ ...base, consent: false })).toEqual({ ok: false, reason: "consent_required" });
  });

  it("rejects a submission faster than a human can type", () => {
    expect(scoreSubmission({ ...base, renderedAt: base.submittedAt - 200 })).toEqual({
      ok: false,
      reason: "bot_timing",
    });
  });

  it("rejects a stale form", () => {
    expect(
      scoreSubmission({ ...base, renderedAt: base.submittedAt - NEWSLETTER_LIMITS.maxFormAgeMs - 1 }),
    ).toEqual({ ok: false, reason: "form_expired" });
  });

  it("treats a forged future timestamp as no signal rather than as evidence", () => {
    expect(scoreSubmission({ ...base, renderedAt: base.submittedAt + 60_000 })).toEqual({ ok: true, fillMs: null });
  });

  it("accepts a plausible human fill", () => {
    expect(scoreSubmission({ ...base, renderedAt: base.submittedAt - 5_000 })).toEqual({ ok: true, fillMs: 5_000 });
  });
});

describe("resend policy", () => {
  const now = new Date("2026-08-15T12:00:00Z");

  it("refuses when the row is not pending", () => {
    expect(canResend({ status: "active", resendCount: 0, lastResendAt: null }, now)).toMatchObject({
      ok: false,
      reason: "not_pending",
    });
  });

  it("enforces the cooldown and reports the wait", () => {
    const verdict = canResend(
      { status: "pending", resendCount: 1, lastResendAt: new Date(now.getTime() - 60_000).toISOString() },
      now,
    );
    expect(verdict).toMatchObject({ ok: false, reason: "cooldown" });
    if (!verdict.ok) expect(verdict.retryAfterSeconds).toBe(NEWSLETTER_LIMITS.resendCooldownSeconds - 60);
  });

  it("caps total resends however long the caller waits", () => {
    expect(
      canResend(
        { status: "pending", resendCount: NEWSLETTER_LIMITS.maxResends, lastResendAt: null },
        new Date(now.getTime() + 86_400_000),
      ),
    ).toMatchObject({ ok: false, reason: "resend_limit" });
  });

  it("allows a resend once the cooldown has passed", () => {
    expect(
      canResend(
        { status: "pending", resendCount: 1, lastResendAt: new Date(now.getTime() - 3_600_000).toISOString() },
        now,
      ),
    ).toEqual({ ok: true });
  });
});

describe("delivery retry schedule", () => {
  it("grows exponentially and stops at the cap", () => {
    expect(backoffDelayMs(1)).toBe(30_000);
    expect(backoffDelayMs(2)).toBe(60_000);
    expect(backoffDelayMs(3)).toBe(120_000);
    expect(backoffDelayMs(20)).toBe(30 * 60_000);
  });

  it("adds bounded jitter so retries never synchronise", () => {
    expect(backoffDelayMs(1, 1)).toBe(37_500);
    expect(backoffDelayMs(1, 0)).toBeLessThan(backoffDelayMs(1, 0.5));
  });

  it("dead-letters at the attempt ceiling", () => {
    expect(outboxIsDead(NEWSLETTER_LIMITS.outboxMaxAttempts - 1)).toBe(false);
    expect(outboxIsDead(NEWSLETTER_LIMITS.outboxMaxAttempts)).toBe(true);
  });
});

describe("suppression", () => {
  it("suppresses immediately on a hard bounce", () => {
    expect(statusAfterBounce("active", 0, "hard")).toEqual({ status: "bounced", suppressed: true });
  });

  it("tolerates one soft bounce, then suppresses", () => {
    expect(statusAfterBounce("active", 0, "soft")).toEqual({ status: "active", suppressed: false });
    expect(statusAfterBounce("active", 1, "soft")).toEqual({ status: "bounced", suppressed: true });
  });

  it("never revives an address that already opted out", () => {
    expect(statusAfterBounce("unsubscribed", 0, "soft")).toEqual({ status: "unsubscribed", suppressed: true });
    expect(statusAfterBounce("complained", 0, "soft")).toEqual({ status: "complained", suppressed: true });
  });
});

describe("tokens and expiry", () => {
  it("mints unguessable, unique, hex tokens", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[a-f0-9]{48}$/);
  });

  it("expires a confirmation link after the declared window", () => {
    const now = new Date("2026-08-15T00:00:00Z");
    expect(verifyExpiry(now).toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });
});

describe("email rendering", () => {
  const ctx = {
    verifyUrl: "https://framique.com/newsletter/verify?token=abc",
    unsubscribeUrl: "https://framique.com/unsubscribe?token=def",
    origin: "https://framique.com",
  };

  it("puts the verify and unsubscribe links in the plain-text part", () => {
    const mail = renderEmail("double_opt_in", { ...ctx, locale: "en" });
    expect(mail.text).toContain(ctx.verifyUrl);
    expect(mail.text).toContain(ctx.unsubscribeUrl);
    expect(mail.html).toContain('href="https://framique.com/newsletter/verify?token=abc"');
  });

  it("renders Bangla copy that is not the English copy", () => {
    const en = renderEmail("welcome", { ...ctx, locale: "en" });
    const bn = renderEmail("welcome", { ...ctx, locale: "bn" });
    expect(bn.subject).not.toBe(en.subject);
    expect(bn.text).toMatch(/[\u0980-\u09FF]/);
  });

  it("carries an unsubscribe link in every kind, including the receipt", () => {
    for (const kind of ["double_opt_in", "welcome", "unsubscribe_receipt"] as const) {
      expect(renderEmail(kind, { ...ctx, locale: "en" }).text).toContain(ctx.unsubscribeUrl);
    }
  });

  it("escapes interpolated values so a token cannot inject markup", () => {
    const mail = renderEmail("double_opt_in", {
      ...ctx,
      locale: "en",
      verifyUrl: 'https://x/?t="><script>alert(1)</script>',
    });
    expect(mail.html).not.toContain("<script>");
  });
});

describe("consent record", () => {
  it("versions the stored sentence in both locales", () => {
    expect(CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-v\d+$/);
    expect(CONSENT_TEXT.en).toContain("unsubscribe");
    expect(CONSENT_TEXT.bn).toMatch(/[\u0980-\u09FF]/);
  });

  it("closes the source list so reporting cannot drift", () => {
    expect(normaliseSource("blog_end")).toBe("blog_end");
    expect(normaliseSource("BLOG_END")).toBe("blog_end");
    expect(normaliseSource("../../etc/passwd")).toBe("unknown");
    expect(normaliseSource(undefined)).toBe("unknown");
  });
});