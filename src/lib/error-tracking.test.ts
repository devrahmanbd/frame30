/**
 * Phase 12 gate — self-hosted error tracking (GlitchTip + Sentry).
 *
 * `scripts/error-tracking-verify.mjs` proves the path works on a live host.
 * This test proves the repo can never drift into a state where that script
 * would have nothing to verify: both backends in the ops stack behind their
 * own profile, one reporter with a DSN per target, PII scrubbed out of event
 * bodies, sampling and quotas bounded, alerts routed into Alertmanager, and a
 * silent, buffer-free fallback.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FORBIDDEN_EVENT_FIELDS,
  baseTags,
  errorEnvironment,
  errorQuota,
  errorSampleRate,
  errorTargets,
  errorTrackingEnabled,
  sanitizeEventFields,
  shouldSample,
} from "./error-tracking";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const compose = read("ops/docker-compose.errors.yml");
const reporter = read("src/lib/observability.server.ts");
const client = read("src/lib/client-error-reporter.ts");
const ingest = read("src/routes/api/public/errors.ts");
const bridge = read("src/routes/api/public/error-alert.ts");
const doc = read("docs/14-operations/error-tracking.md");
const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

const GLITCHTIP_DSN = "https://pub1@glitchtip.internal/1";
const SENTRY_DSN = "https://pub2@sentry.internal/2";

describe("ops stack", () => {
  it("ships GlitchTip and Sentry, each behind its own profile", () => {
    for (const service of [
      "glitchtip-web:",
      "glitchtip-worker:",
      "glitchtip-pg:",
      "sentry-web:",
      "sentry-worker:",
      "sentry-pg:",
    ]) {
      expect(compose).toContain(service);
    }
    expect(compose).toContain("profiles: [glitchtip]");
    expect(compose).toContain("profiles: [sentry]");
  });

  it("pins every image and never publishes a backend beyond loopback", () => {
    const images = [...compose.matchAll(/image:\s*(\S+)/g)].map((m) => m[1]!);
    expect(images.length).toBeGreaterThan(4);
    for (const image of images) {
      expect(image).not.toMatch(/:latest$/);
      expect(image).toMatch(/:[\w.-]+$/);
    }
    for (const port of compose.matchAll(/ports:\s*\[([^\]]+)\]/g)) {
      expect(port[1]).toContain("127.0.0.1:");
    }
  });

  it("caps event retention so a bad deploy cannot fill the disk", () => {
    expect(compose).toContain("ERROR_RETENTION_DAYS");
    expect(compose).toContain("GLITCHTIP_MAX_EVENT_LIFE_DAYS");
    expect(compose).toContain("SENTRY_EVENT_RETENTION_DAYS");
  });
});

describe("one reporter, a DSN per target", () => {
  it("collects every configured backend in send order", () => {
    expect(errorTargets({})).toEqual([]);
    expect(errorTargets({ GLITCHTIP_DSN }).map((t) => t.name)).toEqual(["glitchtip"]);
    expect(errorTargets({ SENTRY_DSN }).map((t) => t.name)).toEqual(["sentry"]);
    expect(errorTargets({ GLITCHTIP_DSN, SENTRY_DSN }).map((t) => t.name)).toEqual([
      "glitchtip",
      "sentry",
    ]);
  });

  it("ignores a malformed DSN instead of throwing", () => {
    expect(errorTargets({ GLITCHTIP_DSN: "not-a-dsn" })).toEqual([]);
    expect(errorTrackingEnabled({ GLITCHTIP_DSN: "not-a-dsn" })).toBe(false);
  });

  it("fans one envelope out to every target with that target's own DSN header", () => {
    expect(reporter).toContain("errorTargets(process.env)");
    expect(reporter).toContain("build(target.dsnString)");
    expect(reporter).toContain("dsn: dsnString");
  });

  it("tags every event with environment, release and commit", () => {
    const tags = baseTags({ SENTRY_ENVIRONMENT: "production", SENTRY_RELEASE: "v9", COMMIT_SHA: "abc123" });
    expect(tags).toMatchObject({ environment: "production", release: "v9", commit: "abc123" });
    expect(errorEnvironment({})).toBe("preview");
  });

  it("covers browser errors, unhandled rejections and server exceptions", () => {
    expect(client).toContain('window.addEventListener("error"');
    expect(client).toContain('window.addEventListener("unhandledrejection"');
    expect(reporter).toContain("export async function captureBrowserError");
    expect(read("src/lib/client-error-reporting.ts")).toContain("react_error_boundary");
  });
});

describe("PII scrubbing", () => {
  it("drops whole PII and money-payload fields from an event body", () => {
    const out = sanitizeEventFields({
      email: "shopper@example.com",
      phone: "01712345678",
      customer_name: "Rahim",
      address: "12 Road 5, Dhaka",
      order: { total: 5000 },
      line_items: [{ sku: "x" }],
      authorization: "Bearer abc",
      route: "/checkout",
      merchant_bucket: "t42",
    });
    expect(out).toEqual({ route: "/checkout", merchant_bucket: "t42" });
    for (const key of ["email", "phone", "customer_name", "address", "order", "line_items", "authorization"]) {
      expect(FORBIDDEN_EVENT_FIELDS.test(key)).toBe(true);
    }
  });

  it("caps depth and breadth so a hostile payload cannot blow up an event", () => {
    const deep = { a: { b: { c: { d: { e: "too deep" } } } } };
    expect(JSON.stringify(sanitizeEventFields(deep))).not.toContain("too deep");
    const wide = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeEventFields(wide)).length).toBeLessThanOrEqual(40);
  });

  it("passes context through the text scrubber before the field filter", () => {
    expect(reporter).toContain("sanitizeEventFields(scrubPayload(context)");
    expect(reporter).toContain("scrubText(err.stack)");
  });

  it("keeps tenant identity to an opaque tag", () => {
    expect(reporter).toContain("tenantLabel");
    expect(doc).toContain("opaque bucket");
  });
});

describe("sampling and quotas", () => {
  it("keeps everything in production and samples preview", () => {
    expect(errorSampleRate({ SENTRY_ENVIRONMENT: "production" })).toBe(1);
    expect(errorSampleRate({ SENTRY_ENVIRONMENT: "preview" })).toBe(0.25);
    expect(errorSampleRate({ ERROR_SAMPLE_RATE: "0.5" })).toBe(0.5);
    expect(errorSampleRate({ ERROR_SAMPLE_RATE: "12" })).toBe(1);
    expect(errorSampleRate({ ERROR_SAMPLE_RATE: "-1" })).toBe(0);
  });

  it("decides per fingerprint, and decides the same way every time", () => {
    const key = "checkout|Payment failed";
    const first = shouldSample(key, 0.25);
    for (let i = 0; i < 20; i += 1) expect(shouldSample(key, 0.25)).toBe(first);
    expect(shouldSample(key, 1)).toBe(true);
    expect(shouldSample(key, 0)).toBe(false);
    const kept = Array.from({ length: 400 }, (_, i) => shouldSample(`k${i}`, 0.25)).filter(Boolean);
    expect(kept.length).toBeGreaterThan(60);
    expect(kept.length).toBeLessThan(160);
  });

  it("bounds sends per fingerprint per environment", () => {
    expect(errorQuota({ SENTRY_ENVIRONMENT: "production" })).toEqual({ limit: 60, windowMs: 60_000 });
    expect(errorQuota({ SENTRY_ENVIRONMENT: "preview" })).toEqual({ limit: 20, windowMs: 60_000 });
    expect(errorQuota({ ERROR_QUOTA_PER_MINUTE: "5" }).limit).toBe(5);
    expect(reporter).toContain("errorBudget().allow(key)");
    expect(reporter).toContain('outcome: "sampled_out"');
  });

  it("caps the browser side too", () => {
    expect(client).toContain("MAX_REPORTS_PER_PAGE");
    expect(ingest).toContain('rateLimit("errors.ingest_ip"');
    expect(read("src/lib/rate-limit.server.ts")).toContain('"errors.ingest_ip"');
  });
});

describe("alert routing", () => {
  it("bridges backend webhooks into the Phase 11 Alertmanager path", () => {
    expect(bridge).toContain("/api/v2/alerts");
    expect(bridge).toContain("ErrorTrackerIssue");
    expect(bridge).toContain("severity");
    expect(bridge).toContain("issue_url");
    expect(bridge).toContain("runbook");
  });

  it("authenticates the webhook caller in constant time and 404s when unconfigured", () => {
    expect(bridge).toContain("ERROR_ALERT_SECRET");
    expect(bridge).toContain("safeEqual");
    expect(bridge).toContain('status: 404');
  });

  it("documents the runbook entry the bridge links to", () => {
    expect(read("docs/14-operations/runbooks.md")).toContain("ErrorTrackerIssue");
  });
});

describe("fallback behaviour", () => {
  it("swallows transport failures and buffers nothing", () => {
    expect(reporter).toContain('outcome: "transport_error"');
    expect(client).toContain("keepalive: true");
    expect(client).toContain("catch {");
    expect(client).not.toContain("localStorage");
    expect(client).not.toContain("sessionStorage");
    expect(ingest).toContain("status: 202");
  });
});

describe("tooling", () => {
  it("exposes the verifier as an npm script", () => {
    expect(pkg.scripts["err:verify"]).toContain("error-tracking-verify.mjs");
    expect(pkg.scripts["err:verify:send"]).toContain("--send");
  });

  it("documents sampling, quotas, retention and acceptance", () => {
    for (const needle of ["ERROR_SAMPLE_RATE", "ERROR_QUOTA_PER_MINUTE", "ERROR_RETENTION_DAYS", "err:verify"]) {
      expect(doc).toContain(needle);
    }
  });
});
