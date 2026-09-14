/**
 * Phase 7.2 — Tenant-Level Canary Cohorts (Dogfooding & Pilot Rollouts).
 *
 * Directs releases by customer cohort rings instead of purely random percentages:
 * 1. Cohort 0 (Internal): Platform staff and internal dogfooding merchant stores.
 * 2. Cohort 1 (10 Beta Stores): Trusted partner merchants who opted into early releases.
 * 3. Cohort 2 (100 Early-Adopter Stores): Representative cross-section of high-volume stores.
 * 4. Cohort 3 (1,000 Stores): Scaled production deployment.
 * 5. Cohort 4 (Global): All remaining merchants.
 *
 * Edge header inspection middleware matches `X-Merchant-Id`, `X-Store-Slug`, or URL
 * path against cohort rings in Redis / in-memory cache, routing targeted traffic to GREEN.
 */
import { incr, log } from "./observability.server";
import { redisCommand, redisConfigured, redisKey } from "./redis.server";
import { type TopologySlot } from "./blue-green-router.server";

export type CohortTier = 0 | 1 | 2 | 3 | 4;

export type CohortDefinition = {
  tier: CohortTier;
  key: string;
  name: string;
  description: string;
  maxStores: number;
};

export const COHORT_DEFINITIONS: Record<CohortTier, CohortDefinition> = {
  0: {
    tier: 0,
    key: "internal",
    name: "Cohort 0 (Internal / Dogfood)",
    description: "Platform staff, internal test shops, and corporate dogfood stores",
    maxStores: 25,
  },
  1: {
    tier: 1,
    key: "beta",
    name: "Cohort 1 (10 Beta Stores)",
    description: "Trusted partner merchants who explicitly opted into early access releases",
    maxStores: 10,
  },
  2: {
    tier: 2,
    key: "early_adopter",
    name: "Cohort 2 (100 Early-Adopter Stores)",
    description: "Representative cross-section of high-volume merchant stores",
    maxStores: 100,
  },
  3: {
    tier: 3,
    key: "scaled_production",
    name: "Cohort 3 (1,000 Stores)",
    description: "Scaled production deployment tier for broad validation",
    maxStores: 1000,
  },
  4: {
    tier: 4,
    key: "global",
    name: "Cohort 4 (Global)",
    description: "All remaining production merchants across the entire platform",
    maxStores: Number.POSITIVE_INFINITY,
  },
};

const COHORT_STORE_KEY = "tenant:cohorts";
const ACTIVE_ROLLOUT_TIER_KEY = "canary:active_cohort_tier";

// Seeded defaults for local development and offline resilience
const SEEDED_COHORTS: Record<string, CohortTier> = {
  "framique-hq": 0,
  "dogfood-store": 0,
  "internal-test": 0,
  "staff-atelier": 0,
  "beta-partner-1": 1,
  "beta-partner-2": 1,
  "beta-partner-3": 1,
  "beta-partner-4": 1,
  "beta-partner-5": 1,
  "pilot-store-alpha": 1,
  "early-adopter-shop-1": 2,
  "early-adopter-shop-2": 2,
};

// In-memory L1 cache with fast local mutation
const memoryCohortCache = new Map<string, CohortTier>(Object.entries(SEEDED_COHORTS));
let memoryActiveRolloutTier: CohortTier | -1 = 0; // default: dogfood routes to green

/**
 * Deterministic FNV-1a hash bucketing.
 * Distributes unassigned stores into stable tiers:
 * - 0 - 9   (10%) -> Cohort 2 (Early Adopters)
 * - 10 - 39 (30%) -> Cohort 3 (Scaled Production)
 * - 40 - 99 (60%) -> Cohort 4 (Global)
 */
export function hashTenantCohort(identifier: string): CohortTier {
  let hash = 2166136261;
  for (let i = 0; i < identifier.length; i++) {
    hash ^= identifier.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bucket = Math.abs(hash % 100);
  if (bucket < 10) return 2;
  if (bucket < 40) return 3;
  return 4;
}

/**
 * Extract tenant identifier (merchant id or store slug) from incoming request.
 */
export async function extractTenantIdentifier(request: Request): Promise<{
  identifier: string | null;
  source: "header_merchant" | "header_slug" | "header_tenant" | "path" | "query" | "cookie" | "host" | "none";
}> {
  const headers = request.headers;

  // 1. Explicit Edge Headers
  const headerMerchant = headers.get("x-merchant-id")?.trim();
  if (headerMerchant) return { identifier: headerMerchant, source: "header_merchant" };

  const headerSlug = headers.get("x-store-slug")?.trim();
  if (headerSlug) return { identifier: headerSlug, source: "header_slug" };

  const headerTenant = headers.get("x-tenant-id")?.trim();
  if (headerTenant) return { identifier: headerTenant, source: "header_tenant" };

  try {
    const url = new URL(request.url);

    // 2. URL Path Matching: `/store/:slug` or `/api/store/:slug`
    const pathMatch = url.pathname.match(/^\/(?:api\/)?store\/([a-zA-Z0-9-_]+)/);
    if (pathMatch && pathMatch[1]) {
      return { identifier: pathMatch[1].toLowerCase(), source: "path" };
    }

    // 3. Query Param (e.g. preview links)
    const queryMerchant = url.searchParams.get("merchant_id") || url.searchParams.get("store_slug");
    if (queryMerchant?.trim()) {
      return { identifier: queryMerchant.trim().toLowerCase(), source: "query" };
    }

    // 4. Host Header (Custom Domain Edge Resolution)
    const host = headers.get("host")?.split(":")[0]?.trim().toLowerCase();
    // Ignore internal or platform domains
    if (host && !host.endsWith("framique.app") && !host.includes("localhost") && !host.endsWith("framique.dev")) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("merchant_domains")
        .select("merchant_id")
        .eq("hostname", host)
        .eq("status", "active")
        .maybeSingle();
      if (data?.merchant_id) {
        return { identifier: data.merchant_id, source: "host" };
      }
    }

    // 5. Cookie inspection
    const cookieHeader = headers.get("cookie") || "";
    const cookieMatch = cookieHeader.match(/(?:framique_tenant_id|framique_store_slug)=([^;]+)/);
    if (cookieMatch && cookieMatch[1]) {
      return { identifier: decodeURIComponent(cookieMatch[1]).trim().toLowerCase(), source: "cookie" };
    }
  } catch {
    // Malformed URL safety
  }

  return { identifier: null, source: "none" };
}

/**
 * Fetch cohort tier for a given tenant identifier.
 */
export async function getTenantCohort(identifier: string): Promise<CohortTier> {
  const normalized = identifier.toLowerCase().trim();

  // Check L1 memory cache
  const cached = memoryCohortCache.get(normalized);
  if (cached !== undefined) return cached;

  // Check Redis hash if configured
  if (redisConfigured()) {
    try {
      const res = await redisCommand([
        "HGET",
        redisKey("platform", COHORT_STORE_KEY),
        normalized,
      ]);
      if (res.ok && typeof res.value === "string") {
        const tier = parseInt(res.value, 10) as CohortTier;
        if (tier >= 0 && tier <= 4) {
          memoryCohortCache.set(normalized, tier);
          return tier;
        }
      }
    } catch {
      // Fallback
    }
  }

  // Fallback to deterministic consistent hashing
  const fallbackTier = hashTenantCohort(normalized);
  memoryCohortCache.set(normalized, fallbackTier);
  return fallbackTier;
}

/**
 * Assign a specific store to a cohort tier.
 */
export async function setTenantCohort(identifier: string, tier: CohortTier): Promise<boolean> {
  const normalized = identifier.toLowerCase().trim();
  memoryCohortCache.set(normalized, tier);

  if (redisConfigured()) {
    try {
      const res = await redisCommand([
        "HSET",
        redisKey("platform", COHORT_STORE_KEY),
        normalized,
        String(tier),
      ]);
      return res.ok;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Get the currently active maximum cohort rollout tier.
 * Returns -1 if no cohort rollout is active (all traffic to primary).
 */
export async function getActiveCohortRolloutTier(): Promise<CohortTier | -1> {
  if (redisConfigured()) {
    try {
      const res = await redisCommand(["GET", redisKey("platform", ACTIVE_ROLLOUT_TIER_KEY)]);
      if (res.ok && typeof res.value === "string") {
        const val = parseInt(res.value, 10);
        if (val >= -1 && val <= 4) {
          memoryActiveRolloutTier = val as CohortTier | -1;
          return memoryActiveRolloutTier;
        }
      }
    } catch {
      // Fallback
    }
  }
  return memoryActiveRolloutTier;
}

/**
 * Set the maximum cohort tier eligible to receive candidate releases.
 */
export async function setActiveCohortRolloutTier(tier: CohortTier | -1): Promise<boolean> {
  memoryActiveRolloutTier = tier;

  if (redisConfigured()) {
    try {
      const res = await redisCommand([
        "SET",
        redisKey("platform", ACTIVE_ROLLOUT_TIER_KEY),
        String(tier),
      ]);
      return res.ok;
    } catch {
      return false;
    }
  }
  return true;
}

export type TenantCanaryDecision = {
  targetSlot: TopologySlot;
  cohortTier: CohortTier;
  tenantId: string | null;
  reason: string;
  headersToInject: Record<string, string>;
};

/**
 * Edge Header Inspection & Routing Resolver.
 *
 * Examines incoming request, checks merchant cohort tier against active canary
 * ring, and produces deterministic target slot (`green` or `blue`).
 */
export async function resolveTenantCanaryRoute(
  request: Request,
  options: {
    activeRolloutTier?: CohortTier | -1;
    candidateSlot?: TopologySlot;
    primarySlot?: TopologySlot;
  } = {},
): Promise<TenantCanaryDecision> {
  const candidateSlot = options.candidateSlot || "green";
  const primarySlot = options.primarySlot || "blue";

  // 1. Check for manual developer / staff override header or cookie
  const slotOverride = request.headers.get("x-framique-slot-override")?.toLowerCase().trim();
  if (slotOverride === "green" || slotOverride === "blue") {
    return {
      targetSlot: slotOverride as TopologySlot,
      cohortTier: 0,
      tenantId: "manual-override",
      reason: `Manual slot override header (X-Framique-Slot-Override: ${slotOverride})`,
      headersToInject: {
        "x-framique-target-slot": slotOverride,
        "x-framique-cohort-tier": "0",
      },
    };
  }

  // 2. Resolve Tenant Identifier
  const { identifier } = await extractTenantIdentifier(request);

  if (!identifier) {
    // Unscoped traffic (e.g. global landing page or static asset without tenant context)
    return {
      targetSlot: primarySlot,
      cohortTier: 4,
      tenantId: null,
      reason: "No tenant scope identified; routed to primary slot",
      headersToInject: {
        "x-framique-target-slot": primarySlot,
        "x-framique-cohort-tier": "4",
      },
    };
  }

  // 3. Resolve Cohort Tier for Tenant
  const cohortTier = await getTenantCohort(identifier);
  const activeRolloutTier =
    options.activeRolloutTier !== undefined
      ? options.activeRolloutTier
      : await getActiveCohortRolloutTier();

  // 4. Evaluate Cohort Routing Gate
  let targetSlot: TopologySlot = primarySlot;
  let reason = "";

  if (activeRolloutTier >= 0 && cohortTier <= activeRolloutTier) {
    // Eligible for Candidate Slot!
    targetSlot = candidateSlot;
    reason = `Tenant '${identifier}' belongs to ${COHORT_DEFINITIONS[cohortTier].name} <= Active Rollout Tier ${activeRolloutTier} -> Routed to ${candidateSlot.toUpperCase()}`;
  } else {
    // Ineligible -> Baseline Primary Slot
    targetSlot = primarySlot;
    reason = `Tenant '${identifier}' belongs to ${COHORT_DEFINITIONS[cohortTier].name} > Active Rollout Tier ${activeRolloutTier} -> Routed to ${primarySlot.toUpperCase()}`;
  }

  incr("framique_tenant_canary_route_total", {
    targetSlot,
    cohortTier: String(cohortTier),
  });

  log("debug", "tenant_canary.routed", {
    identifier,
    cohortTier,
    activeRolloutTier,
    targetSlot,
  });

  return {
    targetSlot,
    cohortTier,
    tenantId: identifier,
    reason,
    headersToInject: {
      "x-framique-target-slot": targetSlot,
      "x-framique-cohort-tier": String(cohortTier),
      "x-framique-tenant-id": identifier,
    },
  };
}
