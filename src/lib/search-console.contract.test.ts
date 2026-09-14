/**
 * §5 exit gate for Site Kit / Search Console.
 *
 * These are the invariants that keep the integration safe to operate; each one
 * is a defect we would otherwise only discover in production quota logs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aggregate,
  classifyResponse,
  comparePeriods,
  dateRange,
  latestUsableDay,
  normaliseRows,
  parseRetryAfter,
  resolveProperty,
  shouldSubmitSitemap,
  tagPlan,
  validateSiteKit,
  verificationTags,
} from "./search-console";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SERVER = read("src/lib/search-console.server.ts");
const FUNCTIONS = read("src/lib/search-console.functions.ts");
const CRON = read("src/routes/api/public/cron/search-console.ts");

describe("domain policy", () => {
  it("drops invalid analytics ids instead of persisting them", () => {
    const { value, issues } = validateSiteKit({ analytics: { enabled: { ga4: "nope" } } });
    expect(value.analytics.enabled["ga4"]).toBeUndefined();
    expect(issues).not.toHaveLength(0);
  });

  it("defaults consent gating on", () => {
    expect(validateSiteKit({}).value.analytics.consentRequired).toBe(true);
  });

  it("never emits duplicate verification meta names", () => {
    const tags = verificationTags({
      tokens: { google: "a".repeat(30) },
      custom: [{ name: "google-site-verification", content: "b".repeat(30) }],
    });
    expect(tags).toHaveLength(1);
  });

  it("asks the merchant to choose when several properties match", () => {
    const resolution = resolveProperty(
      [
        { siteUrl: "sc-domain:shop.test", permissionLevel: "siteOwner" },
        { siteUrl: "https://shop.test/", permissionLevel: "siteOwner" },
      ],
      "shop.test",
    );
    expect(resolution.status).toBe("selection_required");
  });

  it("stops on 403 and retries on 429/5xx", () => {
    const headers = { get: () => null };
    expect(classifyResponse(403, headers, 1).action).toBe("stop");
    expect(classifyResponse(429, headers, 1).action).toBe("retry");
    expect(classifyResponse(503, headers, 1).action).toBe("retry");
    expect(classifyResponse(503, headers, 9).action).toBe("stop");
  });

  it("honours Retry-After", () => {
    expect(parseRetryAfter("30")).toBe(30);
  });

  it("weights ctr and position by impressions", () => {
    const rows = normaliseRows(
      [
        { keys: ["2026-01-01", "shoes"], clicks: 1, impressions: 10, ctr: 0.1, position: 10 },
        { keys: ["2026-01-02", "shoes"], clicks: 9, impressions: 90, ctr: 0.1, position: 1 },
      ],
      "query",
    );
    const [agg] = aggregate(rows);
    expect(agg?.impressions).toBe(100);
    expect(agg?.position).toBeCloseTo(1.9, 2);
  });

  it("reports position improvements as positive change", () => {
    const current = normaliseRows([{ keys: ["2026-02-01", "x"], impressions: 10, position: 4 }], "query");
    const previous = normaliseRows([{ keys: ["2026-01-01", "x"], impressions: 10, position: 9 }], "query");
    expect(comparePeriods(current, previous)[0]?.positionChange).toBe(5);
  });

  it("never reads days Google has not finalised", () => {
    const day = latestUsableDay(new Date("2026-03-10T00:00:00Z"));
    expect(day).toBe("2026-03-07");
    expect(dateRange(day, 28).start).toBe("2026-02-08");
  });

  it("submits a sitemap only when its content changed", () => {
    const base = { sitemapUrl: "https://s.test/sitemap.xml", lastSubmittedUrl: "https://s.test/sitemap.xml" };
    expect(shouldSubmitSitemap({ ...base, lastSubmittedAt: null, changed: false }).submit).toBe(false);
    expect(
      shouldSubmitSitemap({ ...base, lastSubmittedAt: new Date().toISOString(), changed: true }).submit,
    ).toBe(false);
  });

  it("loads the heaviest tag last", () => {
    const plan = tagPlan({ enabled: { gtm: "GTM-ABCDE", ga4: "G-ABCDEF" }, consentRequired: true });
    expect(plan.at(-1)?.vendor).toBe("gtm");
  });
});

describe("runtime wiring", () => {
  it("reads provider credentials inside handlers, never at module scope", () => {
    const head = SERVER.slice(0, SERVER.indexOf("function credentials"));
    expect(head).not.toContain("process.env[");
  });

  it("keeps Google calls behind rate-limit buckets", () => {
    for (const bucket of ["gsc.properties", "gsc.refresh", "gsc.inspect", "gsc.sitemap", "gsc.sweep"]) {
      expect(read("src/lib/rate-limit.server.ts")).toContain(`"${bucket}"`);
    }
  });

  it("logs the provider body but never rethrows it", () => {
    expect(SERVER).toContain('log("error", "gsc.request_failed"');
    expect(SERVER).not.toContain("throw new Error(body");
  });

  it("writes a job row for both success and failure", () => {
    expect(SERVER).toContain('status: "success"');
    expect(SERVER).toContain('status: "failed"');
  });

  it("authorises every RPC with a literal permission", () => {
    const declarations = FUNCTIONS.match(/createServerFn\(/g) ?? [];
    const guards = FUNCTIONS.match(/requirePermission\("/g) ?? [];
    expect(guards.length).toBe(declarations.length);
  });

  it("keeps the cron route bearer-gated and bounded", () => {
    // The bearer gate moved into the shared `cronPost` wrapper; the route is
    // only allowed to reach the sweep through it.
    expect(CRON).toContain("cronPost(");
    expect(read("src/lib/cron-endpoint.server.ts")).toContain("authorizeCron");
    expect(CRON).toContain("runSearchConsoleSweep");
    // Bounded on both axes, with caps the caller cannot raise.
    expect(CRON).toMatch(/ctx\.num\("limit",\s*\d+,\s*\d+\)/);
    expect(CRON).toMatch(/ctx\.num\("days",\s*\d+,\s*\d+\)/);
  });

  it("never mounts analytics on an admin route", () => {
    const admin = read("src/routes/_authenticated/admin/marketing/seo.tsx");
    expect(admin).not.toContain("SiteKitSurface");
  });
});
