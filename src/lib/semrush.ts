/**
 * Phase 5 — Semrush API domain logic & client contracts.
 *
 * Provides typed definitions, URL builders, response parsers, and default
 * benchmarks for Semrush API integrations.
 *
 * Configured API Key:
 * semrtkn-pat-HS2Xf0KFSqmTFHX54b57ZQ-XN9oQNgl5SPraldanWrPdNz1P-qKFlYd
 *
 * Capabilities:
 *  - Domain search analytics & ranking (domain_ranks)
 *  - Live organic keyword positions & search volume tracking (domain_organic)
 *  - Competitive position mapping & relevance scoring (domain_organic_organic)
 *  - Automated technical crawl audit & site health scoring
 *  - Backlinks profile & referring domain monitoring
 */

export const SEMRUSH_DEFAULT_API_KEY =
  "semrtkn-pat-HS2Xf0KFSqmTFHX54b57ZQ-XN9oQNgl5SPraldanWrPdNz1P-qKFlYd";

export const SEMRUSH_API_BASE = "https://api.semrush.com";

export type SemrushDatabase = "bd" | "us" | "in" | "global";

export interface SemrushDomainRank {
  domain: string;
  database: SemrushDatabase;
  rank: number;
  organicKeywords: number;
  organicTraffic: number;
  organicCost: number;
  adwordsKeywords: number;
  adwordsTraffic: number;
  adwordsCost: number;
}

export interface SemrushKeywordPosition {
  keyword: string;
  position: number;
  previousPosition: number;
  searchVolume: number;
  cpc: number;
  competition: number;
  url: string;
  trafficPercentage: number;
  database: SemrushDatabase;
}

export interface SemrushCompetitor {
  domain: string;
  competitorRelevance: number;
  commonKeywords: number;
  organicKeywords: number;
  organicTraffic: number;
  organicCost: number;
}

export interface SemrushCrawlIssue {
  code: string;
  severity: "error" | "warning" | "notice";
  count: number;
  description: string;
}

export interface SemrushCrawlAudit {
  domain: string;
  totalPagesCrawled: number;
  healthyPages: number;
  brokenPages: number;
  issuesCount: number;
  warningsCount: number;
  noticesCount: number;
  healthScore: number;
  topIssues: SemrushCrawlIssue[];
  crawledAt: string;
}

export interface SemrushBacklinks {
  domain: string;
  totalBacklinks: number;
  referringDomains: number;
  authorityScore: number;
  followCount: number;
  nofollowCount: number;
}

export interface SemrushOverview {
  apiKeyMask: string;
  isConnected: boolean;
  domainRank: SemrushDomainRank;
  keywords: SemrushKeywordPosition[];
  competitors: SemrushCompetitor[];
  crawlAudit: SemrushCrawlAudit;
  backlinks: SemrushBacklinks;
  database: SemrushDatabase;
}

/** Validates Semrush PAT (Personal Access Token) or API Key shape. */
export function validateSemrushApiKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  const trimmed = key.trim();
  // Validates semrtkn-pat-* format or standard 32-hex character keys
  return (
    (trimmed.startsWith("semrtkn-") && trimmed.length >= 40) ||
    /^[0-9a-fA-F]{32}$/.test(trimmed)
  );
}

/** Masks the secret Semrush token for safe UI display and logging. */
export function maskSemrushKey(key: string): string {
  if (!key) return "Unconfigured";
  const trimmed = key.trim();
  if (trimmed.length <= 16) return "••••••••";
  return `${trimmed.slice(0, 15)}••••••••${trimmed.slice(-6)}`;
}

/** Builds an outbound request URL to Semrush v3 API endpoints. */
export function buildSemrushUrl(params: {
  type: string;
  key?: string;
  domain?: string;
  phrase?: string;
  database?: SemrushDatabase;
  limit?: number;
  offset?: number;
  export_columns?: string;
}): string {
  const url = new URL(SEMRUSH_API_BASE);
  url.searchParams.set("type", params.type);
  url.searchParams.set("key", params.key || SEMRUSH_DEFAULT_API_KEY);

  if (params.domain) url.searchParams.set("domain", params.domain);
  if (params.phrase) url.searchParams.set("phrase", params.phrase);
  if (params.database) url.searchParams.set("database", params.database);
  if (params.limit !== undefined) url.searchParams.set("display_limit", String(params.limit));
  if (params.offset !== undefined) url.searchParams.set("display_offset", String(params.offset));
  if (params.export_columns) url.searchParams.set("export_columns", params.export_columns);

  return url.toString();
}

/** Parses raw Semrush CSV/TSV table text into rows of records. */
export function parseSemrushTable(rawText: string): Record<string, string>[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .trim()
    .split(/\r?\n/)
    .filter((line) => Boolean(line.trim()));

  if (lines.length <= 1) return [];

  const delimiter = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim());

  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map((v) => v.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    records.push(row);
  }

  return records;
}

/** Default mock telemetry for Bangladesh e-commerce software market benchmarks. */
export const DEFAULT_SEMRUSH_DOMAIN_RANK: SemrushDomainRank = {
  domain: "framique.com",
  database: "bd",
  rank: 1420,
  organicKeywords: 840,
  organicTraffic: 14250,
  organicCost: 3240,
  adwordsKeywords: 42,
  adwordsTraffic: 1200,
  adwordsCost: 480,
};

export const DEFAULT_SEMRUSH_KEYWORDS: SemrushKeywordPosition[] = [
  {
    keyword: "ecommerce website bangladesh",
    position: 2,
    previousPosition: 4,
    searchVolume: 4400,
    cpc: 0.65,
    competition: 0.72,
    url: "https://framique.com/",
    trafficPercentage: 18.5,
    database: "bd",
  },
  {
    keyword: "bkash payment gateway integration",
    position: 1,
    previousPosition: 1,
    searchVolume: 2900,
    cpc: 0.85,
    competition: 0.64,
    url: "https://framique.com/payments",
    trafficPercentage: 14.2,
    database: "bd",
  },
  {
    keyword: "best ecommerce cms bangladesh",
    position: 1,
    previousPosition: 2,
    searchVolume: 1900,
    cpc: 0.55,
    competition: 0.58,
    url: "https://framique.com/features",
    trafficPercentage: 11.4,
    database: "bd",
  },
  {
    keyword: "online shop website maker dhaka",
    position: 3,
    previousPosition: 5,
    searchVolume: 1600,
    cpc: 0.45,
    competition: 0.51,
    url: "https://framique.com/builder",
    trafficPercentage: 8.7,
    database: "bd",
  },
  {
    keyword: "steadfast courier api tracking",
    position: 2,
    previousPosition: 3,
    searchVolume: 2400,
    cpc: 0.35,
    competition: 0.44,
    url: "https://framique.com/fulfilment",
    trafficPercentage: 7.9,
    database: "bd",
  },
  {
    keyword: "nagad merchant checkout api",
    position: 1,
    previousPosition: 2,
    searchVolume: 1400,
    cpc: 0.75,
    competition: 0.61,
    url: "https://framique.com/payments",
    trafficPercentage: 6.8,
    database: "bd",
  },
  {
    keyword: "bilingual ecommerce bangla english",
    position: 1,
    previousPosition: 1,
    searchVolume: 880,
    cpc: 0.40,
    competition: 0.38,
    url: "https://framique.com/features",
    trafficPercentage: 5.2,
    database: "bd",
  },
];

export const DEFAULT_SEMRUSH_COMPETITORS: SemrushCompetitor[] = [
  {
    domain: "shopify.com",
    competitorRelevance: 0.74,
    commonKeywords: 320,
    organicKeywords: 18500,
    organicTraffic: 84000,
    organicCost: 19200,
  },
  {
    domain: "woocommerce.com",
    competitorRelevance: 0.68,
    commonKeywords: 285,
    organicKeywords: 14200,
    organicTraffic: 62000,
    organicCost: 14500,
  },
  {
    domain: "shurjopay.com.bd",
    competitorRelevance: 0.52,
    commonKeywords: 110,
    organicKeywords: 2400,
    organicTraffic: 8900,
    organicCost: 2100,
  },
  {
    domain: "sslcommerz.com",
    competitorRelevance: 0.49,
    commonKeywords: 95,
    organicKeywords: 3100,
    organicTraffic: 11400,
    organicCost: 2900,
  },
];

export const DEFAULT_SEMRUSH_AUDIT: SemrushCrawlAudit = {
  domain: "framique.com",
  totalPagesCrawled: 124,
  healthyPages: 124,
  brokenPages: 0,
  issuesCount: 0,
  warningsCount: 0,
  noticesCount: 2,
  healthScore: 98,
  topIssues: [
    {
      code: "notice:blocked_by_robots",
      severity: "notice",
      count: 1,
      description: "Utility path /status marked noindex,follow",
    },
    {
      code: "notice:redirect_chain_clean",
      severity: "notice",
      count: 1,
      description: "Zero redirect loops detected across sitemap",
    },
  ],
  crawledAt: "2026-09-11T22:00:00.000Z",
};

export const DEFAULT_SEMRUSH_BACKLINKS: SemrushBacklinks = {
  domain: "framique.com",
  totalBacklinks: 4820,
  referringDomains: 340,
  authorityScore: 68,
  followCount: 4120,
  nofollowCount: 700,
};
