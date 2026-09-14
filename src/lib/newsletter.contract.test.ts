/**
 * Phase 10.4 contract: the guarantees the newsletter surface must keep even
 * when someone refactors it in a hurry. These are source-level and policy
 * assertions — the behavioural unit tests live in `newsletter.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUCKETS } from "./rate-limit.server";
import { CONSENT_TEXT, NEWSLETTER_LIMITS } from "./newsletter";
import { DICT } from "./i18n-dict";
import { MAIL_BREAKER, MAIL_TIMEOUT_MS } from "./mailer.server";

const read = (path: string) => readFileSync(path, "utf8");

describe("rate limiting", () => {
  it("buckets subscribe by IP and by address, and keeps both tight", () => {
    expect(BUCKETS["newsletter.subscribe_ip"].limit).toBeLessThanOrEqual(10);
    expect(BUCKETS["newsletter.subscribe_email"].limit).toBeLessThanOrEqual(5);
    expect(BUCKETS["newsletter.subscribe_email"].windowSeconds).toBeGreaterThanOrEqual(3600);
    expect(BUCKETS["newsletter.verify"]).toBeTruthy();
    expect(BUCKETS["newsletter.unsubscribe"]).toBeTruthy();
  });

  it("charges both buckets in subscribeNewsletter", () => {
    const src = read("src/lib/newsletter.server.ts");
    expect(src).toContain('enforceRateLimit("newsletter.subscribe_ip"');
    expect(src).toContain('enforceRateLimit("newsletter.subscribe_email"');
  });
});

describe("privacy and enumeration", () => {
  it("never stores a raw IP or user agent", () => {
    const src = read("src/lib/newsletter.server.ts");
    expect(src).toContain("ip_hash: ipHash");
    expect(src).toContain("ua_hash: uaHash");
    expect(src).not.toMatch(/ip_hash:\s*ip[,\s}]/);
  });

  it("answers check_inbox for new, pending, active and suppressed addresses alike", () => {
    const src = read("src/lib/newsletter.server.ts");
    const branches = src.match(/outcome: "check_inbox"/g) ?? [];
    expect(branches.length).toBeGreaterThanOrEqual(4);
    expect(src).not.toContain('outcome: "already_subscribed"');
  });

  it("hashes the address before it reaches the event ledger", () => {
    const src = read("src/lib/newsletter.server.ts");
    expect(src).toContain("emailHash");
    expect(src).not.toMatch(/email_hash:\s*email[,\s}]/);
  });
});

describe("consent", () => {
  it("stores the sentence and its version on every write path", () => {
    const src = read("src/lib/newsletter.server.ts");
    const stored = src.match(/consent_text: CONSENT_TEXT\[locale\]/g) ?? [];
    expect(stored.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("consent_version: CONSENT_VERSION");
  });

  it("renders exactly the sentence it stores", () => {
    expect(DICT["news.consent"].en).toBe(CONSENT_TEXT.en);
    expect(DICT["news.consent"].bn).toBe(CONSENT_TEXT.bn);
  });

  it("keeps double opt-in: a new row is pending, never active", () => {
    const src = read("src/lib/newsletter.server.ts");
    expect(src).toContain('status: "pending" satisfies NewsletterStatus');
    expect(src).not.toMatch(/insert\(\{[\s\S]{0,400}status: "active"/);
  });

  it("confirms only on POST, so a mail scanner's GET cannot opt someone in", () => {
    const route = read("src/routes/newsletter.verify.tsx");
    expect(route).toContain("verifyNewsletterFn");
    expect(route.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/^\s*loader:/m);
    expect(route).toContain("noindex");
  });
});

describe("unsubscribe", () => {
  it("is one click, unauthenticated and idempotent", () => {
    const src = read("src/lib/newsletter.server.ts");
    expect(src).toContain('return { status: "already"');
    expect(src).not.toContain("requireSupabaseAuth");
  });

  it("suppresses anything still queued for that address", () => {
    const src = read("src/lib/newsletter.server.ts");
    expect(src).toMatch(/newsletter_outbox[\s\S]{0,200}status: "suppressed"/);
  });

  it("ships a List-Unsubscribe header on outbound mail", () => {
    expect(read("src/lib/mailer.server.ts")).toContain("List-Unsubscribe-Post");
  });
});

describe("delivery", () => {
  it("queues before it sends, so an outage delays rather than loses a confirmation", () => {
    const src = read("src/lib/newsletter.server.ts");
    const queueAt = src.indexOf('.from("newsletter_outbox")');
    const sendAt = src.indexOf("attemptDelivery(queued.id");
    expect(queueAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(queueAt);
  });

  it("bounds every provider call with a timeout and a circuit breaker", () => {
    expect(MAIL_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    expect(MAIL_BREAKER.threshold).toBeGreaterThan(0);
    expect(read("src/lib/mailer.server.ts")).toContain("controller.abort()");
  });

  it("retries only retriable failures and dead-letters the rest", () => {
    const src = read("src/lib/mailer.server.ts");
    expect(src).toContain("res.status === 429 || res.status >= 500");
    expect(read("src/lib/newsletter.server.ts")).toContain("outboxIsDead(attempts)");
  });

  it("never claims delivery when no provider is configured", () => {
    const src = read("src/lib/mailer.server.ts");
    expect(src).toContain("simulated: true");
    expect(src).toContain("mail.no_provider");
    expect(read("src/lib/newsletter.server.ts")).toContain("no_provider_configured");
  });

  it("keeps the opportunistic flush too small to become a job", () => {
    expect(NEWSLETTER_LIMITS.outboxFlushBatch).toBeLessThanOrEqual(10);
    expect(read("src/lib/newsletter.server.ts")).toContain("Math.min(NEWSLETTER_LIMITS.outboxFlushBatch");
  });
});

describe("webhook", () => {
  it("refuses to process feedback without a configured secret", () => {
    const src = read("src/routes/api/public/newsletter/feedback.ts");
    expect(src).toContain("NEWSLETTER_WEBHOOK_SECRET");
    expect(src).toContain("status: 503");
  });

  it("verifies an HMAC over the raw body in constant time, with replay bounds", () => {
    const src = read("src/routes/api/public/newsletter/feedback.ts");
    expect(src).toContain("timingSafeEqual(signature, expected)");
    expect(src).toContain("MAX_SKEW_SECONDS");
    expect(src).toContain("MAX_BODY_BYTES");
  });
});

describe("form", () => {
  it("keeps the honeypot out of the accessibility tree and the tab order", () => {
    const src = read("src/components/public/NewsletterForm.tsx");
    expect(src).toContain('aria-hidden="true"');
    expect(src).toContain("tabIndex={-1}");
    // Off-screen, not `display:none`: hidden inputs are skipped by some bots.
    expect(src).toContain("left-[-9999px]");
    expect(src.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/display:\s*none|type="hidden"/);
  });

  it("requires an untouched consent checkbox rather than implying consent", () => {
    const src = read("src/components/public/NewsletterForm.tsx");
    expect(src).toContain("useState(false)");
    expect(src).toContain('tk("news.err.consent_required")');
    expect(src).not.toContain("defaultChecked");
  });

  it("announces status politely and keeps controls at a 44px tap target", () => {
    const src = read("src/components/public/NewsletterForm.tsx");
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain("h-11");
  });

  it("shows the exit-intent prompt at most once a month, never on first paint", () => {
    const src = read("src/components/public/ExitIntentNewsletter.tsx");
    expect(src).toContain("EXIT_INTENT_COOLDOWN_DAYS = 30");
    expect(src).toContain("EXIT_INTENT_MIN_DWELL_MS");
    expect(src).toContain('event.key === "Escape"');
    expect(src).toContain("(pointer: fine)");
  });
});

describe("server function boundary", () => {
  it("keeps newsletter.functions.ts a thin wrapper", () => {
    const src = read("src/lib/newsletter.functions.ts");
    expect(src).not.toContain("supabaseAdmin");
    expect(src).toContain('await import("./newsletter.server")');
    // No runtime siblings beyond imports and the exported declarations.
    expect(src).not.toMatch(/^const (?!.*createServerFn)/m);
  });
});