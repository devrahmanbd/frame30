/** Phase 10.6 source contracts for the public contact and canonical NAP path. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTACT_LIMITS, CONTACT_ROUTES, scoreContact } from "./contact";
import { ORG_NAP, napAddressLine, napPostalAddress } from "./nap";
import { BUCKETS } from "./rate-limit.server";

const read = (path: string) => readFileSync(path, "utf8");

describe("canonical NAP", () => {
  it("keeps one E.164 identity with postal and map fields", () => {
    expect(ORG_NAP.e164Phone).toMatch(/^\+[1-9]\d{7,14}$/);
    expect(ORG_NAP.mapUrl).toMatch(/^https:\/\//);
    expect(ORG_NAP.district).toBeTruthy();
    expect(napAddressLine()).toContain(ORG_NAP.postalCode);
    expect(napPostalAddress()).toMatchObject({
      streetAddress: ORG_NAP.street,
      addressLocality: ORG_NAP.locality,
      addressCountry: ORG_NAP.countryCode,
    });
  });

  it("feeds footer, contact and structured data from the same export", () => {
    const footer = read("src/components/public/PublicShell.tsx");
    const contact = read("src/routes/contact.tsx");
    const seo = read("src/lib/marketing-seo.ts");
    expect(footer).toContain("ORG_NAP");
    expect(contact).toContain("ORG_NAP");
    expect(seo).toContain("ORG_NAP");
    expect(seo).toContain("napPostalAddress");
    expect(seo).not.toContain("House 42");
  });
});

describe("anonymous intake security", () => {
  it("charges independent IP and email rate-limit buckets", () => {
    expect(BUCKETS["contact.submit_ip"].limit).toBeLessThanOrEqual(10);
    expect(BUCKETS["contact.submit_email"].limit).toBeLessThanOrEqual(5);
    expect(BUCKETS["contact.submit_email"].windowSeconds).toBeGreaterThanOrEqual(3600);
    const server = read("src/lib/contact.server.ts");
    expect(server).toContain('enforceRateLimit("contact.submit_ip"');
    expect(server).toContain('enforceRateLimit("contact.submit_email"');
  });

  it("stores request fingerprints only after salted hashing", () => {
    const server = read("src/lib/contact.server.ts");
    expect(server).toContain("ip_hash: ipHash");
    expect(server).toContain("user_agent_hash: uaHash");
    expect(server).not.toMatch(/ip_hash:\s*identity\.ip/);
    expect(server).not.toMatch(/user_agent_hash:\s*identity\.ua/);
  });

  it("scores automation before writing a submission", () => {
    const server = read("src/lib/contact.server.ts");
    expect(server.indexOf("scoreContact(")).toBeLessThan(server.indexOf('.from("contact_submissions")'));
    expect(scoreContact({ honeypot: "filled", submittedAt: 1 }).blocked).toBe(true);
  });

  it("returns apparent success to blocked bots instead of exposing the rule", () => {
    const server = read("src/lib/contact.server.ts");
    expect(server).toContain('return { outcome: "received", reference }');
    expect(server).toContain('eventType: "rejected"');
  });
});

describe("durable routing and failures", () => {
  it("routes all topics to declared teams with distinct SLAs", () => {
    expect(Object.keys(CONTACT_ROUTES)).toEqual(["sales", "support", "migration"]);
    expect(new Set(Object.values(CONTACT_ROUTES).map((route) => route.responseHours)).size).toBe(3);
    const server = read("src/lib/contact.server.ts");
    expect(server).toContain("ORG_NAP.salesEmail");
    expect(server).toContain("ORG_NAP.supportEmail");
    expect(server).toContain("ORG_NAP.migrationEmail");
  });

  it("persists contact_outbox before attempting delivery", () => {
    const server = read("src/lib/contact.server.ts");
    const queue = server.indexOf('.from("contact_outbox").insert');
    const send = server.indexOf("deliverContactMail(queued.id");
    expect(queue).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(queue);
  });

  it("bounds retries and the opportunistic drain", () => {
    expect(CONTACT_LIMITS.outboxMaxAttempts).toBeLessThanOrEqual(5);
    expect(CONTACT_LIMITS.outboxFlushBatch).toBeLessThanOrEqual(10);
    const server = read("src/lib/contact.server.ts");
    expect(server).toContain('status: dead ? "dead" : "retry"');
    expect(server).toContain("Math.min(CONTACT_LIMITS.outboxFlushBatch");
  });

  it("never claims a simulated provider handoff as real delivery", () => {
    const server = read("src/lib/contact.server.ts");
    expect(server).toContain("no_provider_configured");
    expect(server).toContain('result.simulated ? "stored" : "sent"');
  });
});

describe("accessible contact form", () => {
  it("keeps bot bait outside the accessibility tree and tab order", () => {
    const form = read("src/components/public/ContactForm.tsx");
    expect(form).toContain('aria-hidden="true"');
    expect(form).toContain("tabIndex={-1}");
    expect(form).toContain("left-[-9999px]");
  });

  it("announces status and uses the design-system button", () => {
    const form = read("src/components/public/ContactForm.tsx");
    expect(form).toContain('aria-live="polite"');
    expect(form).toContain("<Button");
    expect(form).not.toContain('<button type="submit"');
  });
});