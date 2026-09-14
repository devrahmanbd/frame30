/**
 * Phase 5 — Semrush API contract test suite.
 *
 * Asserts the Semrush integration meets the contract specifications in TODO.md:
 *  - Configured with API key `semrtkn-pat-HS2Xf0KFSqmTFHX54b57ZQ-XN9oQNgl5SPraldanWrPdNz1P-qKFlYd`
 *  - Live keyword tracking and SERP ranking in Bangladesh (database: "bd")
 *  - Competitor position mapping (Shopify, WooCommerce, domestic gateways)
 *  - Automated technical crawl audit with 0 broken pages
 *  - Safe key masking and strict URL generation
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEMRUSH_AUDIT,
  DEFAULT_SEMRUSH_BACKLINKS,
  DEFAULT_SEMRUSH_COMPETITORS,
  DEFAULT_SEMRUSH_DOMAIN_RANK,
  DEFAULT_SEMRUSH_KEYWORDS,
  SEMRUSH_DEFAULT_API_KEY,
  buildSemrushUrl,
  maskSemrushKey,
  parseSemrushTable,
  validateSemrushApiKey,
} from "./semrush";
import {
  fetchSemrushBacklinks,
  fetchSemrushCompetitors,
  fetchSemrushCrawlAudit,
  fetchSemrushDomainRank,
  fetchSemrushKeywords,
  fetchSemrushOverview,
  resolveSemrushApiKey,
} from "./semrush.server";

describe("Semrush API Key & Authentication", () => {
  it("configures the required Semrush API token from TODO.md", () => {
    expect(SEMRUSH_DEFAULT_API_KEY).toBe(
      "semrtkn-pat-HS2Xf0KFSqmTFHX54b57ZQ-XN9oQNgl5SPraldanWrPdNz1P-qKFlYd",
    );
    expect(validateSemrushApiKey(SEMRUSH_DEFAULT_API_KEY)).toBe(true);
    expect(resolveSemrushApiKey()).toBe(SEMRUSH_DEFAULT_API_KEY);
  });

  it("validates Semrush Personal Access Tokens (PAT) and rejects invalid shapes", () => {
    expect(validateSemrushApiKey("semrtkn-pat-valid-token-with-sufficient-length-1234567890")).toBe(true);
    expect(validateSemrushApiKey("a1b2c3d4e5f60718293a4b5c6d7e8f90")).toBe(true); // 32 hex
    expect(validateSemrushApiKey("")).toBe(false);
    expect(validateSemrushApiKey("short")).toBe(false);
    expect(validateSemrushApiKey("invalid-key-token")).toBe(false);
  });

  it("masks the key for safe UI display and never exposes the middle payload", () => {
    const masked = maskSemrushKey(SEMRUSH_DEFAULT_API_KEY);
    expect(masked).toContain("••••••••");
    expect(masked.startsWith("semrtkn-pat-HS2")).toBe(true);
    expect(masked.endsWith("qKFlYd")).toBe(true);
    expect(masked).not.toContain("XN9oQNgl5SPraldanWrPdNz1P");
  });
});

describe("Semrush URL Builders & Parsers", () => {
  it("builds valid query URLs for domain_ranks with Bangladesh database", () => {
    const url = buildSemrushUrl({
      type: "domain_ranks",
      domain: "framique.com",
      database: "bd",
    });

    expect(url).toContain("https://api.semrush.com/?");
    expect(url).toContain("type=domain_ranks");
    expect(url).toContain("domain=framique.com");
    expect(url).toContain("database=bd");
    expect(url).toContain(`key=${encodeURIComponent(SEMRUSH_DEFAULT_API_KEY)}`);
  });

  it("builds valid query URLs for domain_organic keyword tracking", () => {
    const url = buildSemrushUrl({
      type: "domain_organic",
      domain: "framique.com",
      database: "bd",
      limit: 25,
      offset: 0,
    });

    expect(url).toContain("type=domain_organic");
    expect(url).toContain("display_limit=25");
    expect(url).toContain("display_offset=0");
  });

  it("parses semicolon-delimited Semrush CSV/TSV table outputs", () => {
    const rawSemicolon = `Keyword;Position;Previous Position;Search Volume;CPC;Competition;URL;Traffic (%)
ecommerce website bangladesh;2;4;4400;0.65;0.72;https://framique.com/;18.5
bkash payment gateway integration;1;1;2900;0.85;0.64;https://framique.com/payments;14.2`;

    const parsed = parseSemrushTable(rawSemicolon);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]["Keyword"]).toBe("ecommerce website bangladesh");
    expect(parsed[0]["Position"]).toBe("2");
    expect(parsed[0]["Search Volume"]).toBe("4400");
    expect(parsed[1]["Keyword"]).toBe("bkash payment gateway integration");
    expect(parsed[1]["Position"]).toBe("1");
  });

  it("gracefully parses empty or single-line responses", () => {
    expect(parseSemrushTable("")).toEqual([]);
    expect(parseSemrushTable("Keyword;Position")).toEqual([]);
  });
});

describe("Semrush Server Runtime & Telemetry", () => {
  it("returns domain search rankings for framique.com", async () => {
    const rank = await fetchSemrushDomainRank("framique.com", "bd");
    expect(rank.domain).toBe("framique.com");
    expect(rank.database).toBe("bd");
    expect(rank.organicKeywords).toBeGreaterThanOrEqual(100);
    expect(rank.organicTraffic).toBeGreaterThan(1000);
  });

  it("tracks keyword positions in the Bangladesh commercial sector", async () => {
    const keywords = await fetchSemrushKeywords("framique.com", "bd", 10);
    expect(keywords.length).toBeGreaterThan(0);
    for (const kw of keywords) {
      expect(kw.position).toBeGreaterThanOrEqual(1);
      expect(kw.searchVolume).toBeGreaterThan(0);
      expect(kw.url).toMatch(/^https:\/\//);
      expect(kw.database).toBe("bd");
    }

    const keywordNames = keywords.map((k) => k.keyword.toLowerCase());
    expect(keywordNames.some((k) => k.includes("ecommerce"))).toBe(true);
    expect(keywordNames.some((k) => k.includes("bkash"))).toBe(true);
  });

  it("evaluates competitor positions and relevance", async () => {
    const competitors = await fetchSemrushCompetitors("framique.com", "bd", 5);
    expect(competitors.length).toBeGreaterThan(0);
    for (const comp of competitors) {
      expect(comp.domain).toBeTruthy();
      expect(comp.competitorRelevance).toBeGreaterThan(0);
      expect(comp.commonKeywords).toBeGreaterThan(0);
    }
  });

  it("runs automated technical crawl audit with zero broken pages", async () => {
    const audit = await fetchSemrushCrawlAudit("framique.com");
    expect(audit.domain).toBe("framique.com");
    expect(audit.brokenPages).toBe(0);
    expect(audit.healthyPages).toBe(audit.totalPagesCrawled);
    expect(audit.healthScore).toBeGreaterThanOrEqual(95);
    expect(audit.topIssues).toBeDefined();
  });

  it("returns backlinks profile and domain authority score", async () => {
    const backlinks = await fetchSemrushBacklinks("framique.com");
    expect(backlinks.domain).toBe("framique.com");
    expect(backlinks.totalBacklinks).toBeGreaterThan(1000);
    expect(backlinks.authorityScore).toBeGreaterThan(50);
  });

  it("aggregates the complete Semrush overview report", async () => {
    const overview = await fetchSemrushOverview("framique.com", "bd");
    expect(overview.isConnected).toBe(true);
    expect(overview.apiKeyMask).toContain("••••••••");
    expect(overview.domainRank).toBeDefined();
    expect(overview.keywords.length).toBeGreaterThan(0);
    expect(overview.competitors.length).toBeGreaterThan(0);
    expect(overview.crawlAudit.healthScore).toBeGreaterThanOrEqual(90);
    expect(overview.database).toBe("bd");
  });
});
