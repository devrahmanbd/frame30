# 4-Tier Risk Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 4-level risk-based sandboxing system that dynamically adjusts CSP, iframe isolation, rate limits, upload scanning, and feature access based on merchant trust tier and visitor behavior.

**Architecture:** A `risk_tier` enum on the `merchants` table drives all sandbox decisions. Four tiers — `low` (official design+plugin), `lower_medium` (custom design/plugin), `medium` (flagged visitor), `high` (malicious merchant) — each compose stricter restrictions. The tier is resolved per-request via a `resolveRiskTier()` function that considers merchant config, design source, plugin source, and behavior signals. CSP headers, iframe sandbox attributes, rate limit buckets, and upload scanning policies all read from this tier.

**Tech Stack:** PostgreSQL enum + RPC, TypeScript (isomorphic risk resolution), TanStack Router middleware, existing rate-limit.server.ts, existing custom-code.ts CSP builder.

## Global Constraints

- Bun runtime, ESM, `"type": "module"`
- No `server-only` import — use `*.server.ts` naming
- Integer minor units for money (not relevant here but project-wide)
- RLS on every public table
- Tests required (`passWithNoTests: false`)
- Verification order: `typecheck` → `test` → `test:contracts`

---

## File Structure

| File                                               | Purpose                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/risk-tier.ts`                             | **NEW** — `RiskTier` type, `resolveRiskTier()`, tier→policy mapping            |
| `src/lib/risk-tier.test.ts`                        | **NEW** — unit tests for tier resolution and policy mapping                    |
| `src/lib/risk-tier.server.ts`                      | **NEW** — DB-backed tier persistence, admin override, behavior signal tracking |
| `src/lib/risk-tier.server.test.ts`                 | **NEW** — server-side tests                                                    |
| `src/lib/custom-code.ts`                           | **MODIFY** — `buildCsp()` reads tier to adjust nonce/script-src policy         |
| `src/components/builder/HtmlSandbox.tsx`           | **MODIFY** — accept `riskTier` prop, adjust `sandbox` attribute                |
| `src/components/marketplace/WidgetSandbox.tsx`     | **MODIFY** — accept `riskTier` prop, adjust sandbox restrictions               |
| `src/server.ts`                                    | **MODIFY** — `resolveRiskTier()` in request pipeline, pass to CSP              |
| `src/lib/rate-limit.server.ts`                     | **MODIFY** — tier-aware rate limit buckets                                     |
| `src/lib/media/library.ts`                         | **MODIFY** — tier-aware upload scanning strictness                             |
| `src/routes/api/admin/merchant.$id/risk-tier.ts`   | **NEW** — admin API to view/set merchant risk tier                             |
| `supabase/migrations/YYYYMMDDHHMMSS_risk_tier.sql` | **NEW** — DB schema for risk tiers                                             |

---

## Task 1: Risk Tier Type & Policy Map

**Files:**

- Create: `src/lib/risk-tier.ts`
- Create: `src/lib/risk-tier.test.ts`

**Interfaces:**

- Consumes: nothing (foundation)
- Produces: `RiskTier`, `SandboxPolicy`, `resolvePolicy(tier)`, `RESOLUTION_REASONS`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/risk-tier.test.ts
import { describe, it, expect } from "vitest";
import {
  RiskTier,
  resolvePolicy,
  RESOLUTION_REASONS,
  type SandboxPolicy,
} from "./risk-tier";

describe("risk-tier", () => {
  describe("resolvePolicy", () => {
    it("returns full access for low tier", () => {
      const p = resolvePolicy("low");
      expect(p.csp.scriptSrc).toContain("'strict-dynamic'");
      expect(p.iframe.sandbox).toBe("allow-forms allow-popups");
      expect(p.iframe.allowSameOrigin).toBe(false);
      expect(p.upload.scanningStrictness).toBe("standard");
      expect(p.rateLimitMultiplier).toBe(1.0);
      expect(p.features.customCode).toBe(true);
      expect(p.features.customJs).toBe(true);
      expect(p.features.pluginBundles).toBe(true);
      expect(p.features.uploads).toBe(true);
    });

    it("restricts custom JS for lower_medium tier", () => {
      const p = resolvePolicy("lower_medium");
      expect(p.csp.scriptSrc).toContain("'strict-dynamic'");
      expect(p.iframe.sandbox).toBe("allow-forms");
      expect(p.iframe.allowSameOrigin).toBe(false);
      expect(p.upload.scanningStrictness).toBe("enhanced");
      expect(p.rateLimitMultiplier).toBe(0.7);
      expect(p.features.customCode).toBe(true);
      expect(p.features.customJs).toBe(true);
      expect(p.features.pluginBundles).toBe(true);
    });

    it("disables custom code for medium tier (flagged visitor context)", () => {
      const p = resolvePolicy("medium");
      expect(p.csp.scriptSrc).toBe("'self'");
      expect(p.iframe.sandbox).toBe("");
      expect(p.iframe.allowSameOrigin).toBe(false);
      expect(p.upload.scanningStrictness).toBe("strict");
      expect(p.rateLimitMultiplier).toBe(0.4);
      expect(p.features.customCode).toBe(false);
      expect(p.features.customJs).toBe(false);
      expect(p.features.pluginBundles).toBe(false);
      expect(p.features.uploads).toBe(false);
    });

    it("locks down everything for high tier (malicious merchant)", () => {
      const p = resolvePolicy("high");
      expect(p.csp.scriptSrc).toBe("'self'");
      expect(p.csp.nonce).toBe(false);
      expect(p.iframe.sandbox).toBe("");
      expect(p.iframe.allowSameOrigin).toBe(false);
      expect(p.upload.scanningStrictness).toBe("forensic");
      expect(p.rateLimitMultiplier).toBe(0.1);
      expect(p.features.customCode).toBe(false);
      expect(p.features.customJs).toBe(false);
      expect(p.features.pluginBundles).toBe(false);
      expect(p.features.uploads).toBe(false);
      expect(p.features.checkout).toBe(false);
      expect(p.features.apiWrite).toBe(false);
      expect(p.features.builder).toBe(false);
    });

    it("returns all resolution reasons", () => {
      expect(RESOLUTION_REASONS).toContain("official_design");
      expect(RESOLUTION_REASONS).toContain("custom_design");
      expect(RESOLUTION_REASONS).toContain("custom_plugin");
      expect(RESOLUTION_REASONS).toContain("behavior_signal");
      expect(RESOLUTION_REASONS).toContain("admin_override");
      expect(RESOLUTION_REASONS).toContain("fraud_engine");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/risk-tier.test.ts 2>&1 | head -20`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/risk-tier.ts
/**
 * 4-tier risk sandboxing system.
 *
 * Tier assignment is per-merchant and resolved from:
 *   1. Admin override (manual set)
 *   2. Design source (official marketplace = low, custom = lower_medium)
 *   3. Plugin source (official = low, custom = lower_medium)
 *   4. Behavior signals (fraud engine, bot score, abuse reports)
 *
 * The tier drives CSP policy, iframe sandbox attributes, rate limit
 * multipliers, upload scanning strictness, and feature gates.
 */

export const RISK_TIERS = ["low", "lower_medium", "medium", "high"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const RESOLUTION_REASONS = [
  "official_design",
  "official_plugin",
  "custom_design",
  "custom_plugin",
  "behavior_signal",
  "fraud_engine",
  "admin_override",
  "visitor_flagged",
] as const;
export type ResolutionReason = (typeof RESOLUTION_REASONS)[number];

export type CspPolicy = {
  scriptSrc: string;
  nonce: boolean;
  strictDynamic: boolean;
  unsafeInline: boolean;
  connectSrc: string[];
  frameSrc: string[];
};

export type IframePolicy = {
  sandbox: string;
  allowSameOrigin: boolean;
  referrerPolicy: string;
  maxHeight: number;
};

export type UploadPolicy = {
  scanningStrictness: "standard" | "enhanced" | "strict" | "forensic";
  magicBytesCheck: boolean;
  svgSanitization: boolean;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
};

export type FeatureGates = {
  customCode: boolean;
  customJs: boolean;
  customCss: boolean;
  pluginBundles: boolean;
  uploads: boolean;
  checkout: boolean;
  apiWrite: boolean;
  builder: boolean;
  marketplaceInstall: boolean;
  analytics: boolean;
};

export type SandboxPolicy = {
  tier: RiskTier;
  csp: CspPolicy;
  iframe: IframePolicy;
  upload: UploadPolicy;
  rateLimitMultiplier: number;
  features: FeatureGates;
  reasons: ResolutionReason[];
};

const TIER_POLICIES: Record<
  RiskTier,
  Omit<SandboxPolicy, "tier" | "reasons">
> = {
  low: {
    csp: {
      scriptSrc: "'self' 'nonce-{nonce}' 'strict-dynamic'",
      nonce: true,
      strictDynamic: true,
      unsafeInline: false,
      connectSrc: ["'self'"],
      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://player.vimeo.com",
      ],
    },
    iframe: {
      sandbox: "allow-forms allow-popups",
      allowSameOrigin: false,
      referrerPolicy: "no-referrer",
      maxHeight: 4000,
    },
    upload: {
      scanningStrictness: "standard",
      magicBytesCheck: true,
      svgSanitization: true,
      maxFileSizeBytes: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/*", "video/*", "audio/*", "application/pdf"],
    },
    rateLimitMultiplier: 1.0,
    features: {
      customCode: true,
      customJs: true,
      customCss: true,
      pluginBundles: true,
      uploads: true,
      checkout: true,
      apiWrite: true,
      builder: true,
      marketplaceInstall: true,
      analytics: true,
    },
  },
  lower_medium: {
    csp: {
      scriptSrc: "'self' 'nonce-{nonce}' 'strict-dynamic'",
      nonce: true,
      strictDynamic: true,
      unsafeInline: false,
      connectSrc: ["'self'"],
      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://player.vimeo.com",
      ],
    },
    iframe: {
      sandbox: "allow-forms",
      allowSameOrigin: false,
      referrerPolicy: "no-referrer",
      maxHeight: 2000,
    },
    upload: {
      scanningStrictness: "enhanced",
      magicBytesCheck: true,
      svgSanitization: true,
      maxFileSizeBytes: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/*", "video/*", "audio/*", "application/pdf"],
    },
    rateLimitMultiplier: 0.7,
    features: {
      customCode: true,
      customJs: true,
      customCss: true,
      pluginBundles: true,
      uploads: true,
      checkout: true,
      apiWrite: true,
      builder: true,
      marketplaceInstall: true,
      analytics: true,
    },
  },
  medium: {
    csp: {
      scriptSrc: "'self'",
      nonce: false,
      strictDynamic: false,
      unsafeInline: false,
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
    },
    iframe: {
      sandbox: "",
      allowSameOrigin: false,
      referrerPolicy: "no-referrer",
      maxHeight: 1000,
    },
    upload: {
      scanningStrictness: "strict",
      magicBytesCheck: true,
      svgSanitization: true,
      maxFileSizeBytes: 2 * 1024 * 1024,
      allowedMimeTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
      ],
    },
    rateLimitMultiplier: 0.4,
    features: {
      customCode: false,
      customJs: false,
      customCss: false,
      pluginBundles: false,
      uploads: false,
      checkout: true,
      apiWrite: false,
      builder: false,
      marketplaceInstall: false,
      analytics: true,
    },
  },
  high: {
    csp: {
      scriptSrc: "'self'",
      nonce: false,
      strictDynamic: false,
      unsafeInline: false,
      connectSrc: ["'self'"],
      frameSrc: [],
    },
    iframe: {
      sandbox: "",
      allowSameOrigin: false,
      referrerPolicy: "no-referrer",
      maxHeight: 0,
    },
    upload: {
      scanningStrictness: "forensic",
      magicBytesCheck: true,
      svgSanitization: true,
      maxFileSizeBytes: 0,
      allowedMimeTypes: [],
    },
    rateLimitMultiplier: 0.1,
    features: {
      customCode: false,
      customJs: false,
      customCss: false,
      pluginBundles: false,
      uploads: false,
      checkout: false,
      apiWrite: false,
      builder: false,
      marketplaceInstall: false,
      analytics: false,
    },
  },
};

/**
 * Resolve the sandbox policy for a given risk tier.
 * This is the pure, isomorphic function — no I/O.
 */
export function resolvePolicy(
  tier: RiskTier,
  reasons: ResolutionReason[] = [],
): SandboxPolicy {
  const base = TIER_POLICIES[tier];
  return { ...base, tier, reasons };
}

/**
 * Resolve risk tier from component signals (isomorphic, no DB).
 * Server-side code calls this with richer context; client-side
 * can call with just the merchant's stored tier.
 */
export function resolveTierFromSignals(input: {
  storedTier?: RiskTier;
  designSource?: "marketplace" | "custom";
  pluginSources?: ("marketplace" | "custom")[];
  fraudScore?: number;
  botScore?: number;
  abuseFlags?: number;
}): { tier: RiskTier; reasons: ResolutionReason[] } {
  const reasons: ResolutionReason[] = [];

  // Fraud engine override → highest
  if (input.fraudScore !== undefined && input.fraudScore >= 80) {
    reasons.push("fraud_engine");
    return { tier: "high", reasons };
  }

  // Abuse flags → highest
  if (input.abuseFlags !== undefined && input.abuseFlags >= 3) {
    reasons.push("behavior_signal");
    return { tier: "high", reasons };
  }

  // Behavior signals → medium
  if (input.botScore !== undefined && input.botScore >= 60) {
    reasons.push("visitor_flagged");
    return { tier: "medium", reasons };
  }
  if (input.abuseFlags !== undefined && input.abuseFlags >= 1) {
    reasons.push("behavior_signal");
    return { tier: "medium", reasons };
  }

  // Custom plugins → lower_medium
  if (input.pluginSources?.some((s) => s === "custom")) {
    reasons.push("custom_plugin");
    return { tier: "lower_medium", reasons };
  }

  // Custom design → lower_medium
  if (input.designSource === "custom") {
    reasons.push("custom_design");
    return { tier: "lower_medium", reasons };
  }

  // Official everything → low
  if (input.designSource === "marketplace") {
    reasons.push("official_design");
  }
  if (input.pluginSources?.every((s) => s === "marketplace")) {
    reasons.push("official_plugin");
  }

  // Fallback to stored tier or low
  return { tier: input.storedTier ?? "low", reasons };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/risk-tier.test.ts 2>&1`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/risk-tier.ts src/lib/risk-tier.test.ts
git commit -m "feat(sandbox): add 4-tier risk policy map and tier resolution logic"
```

---

## Task 2: DB Schema for Risk Tiers

**Files:**

- Create: `supabase/migrations/20260919010000_risk_tier.sql`
- Create: `src/lib/risk-tier.server.ts`
- Create: `src/lib/risk-tier.server.test.ts`

**Interfaces:**

- Consumes: `RiskTier` from `risk-tier.ts`
- Produces: `getMerchantRiskTier()`, `setMerchantRiskTier()`, `recordAbuseSignal()`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/risk-tier.server.test.ts
import { describe, it, expect } from "vitest";
import { getMerchantRiskTier, setMerchantRiskTier } from "./risk-tier.server";

describe("risk-tier.server", () => {
  it("getMerchantRiskTier returns low by default for new merchants", async () => {
    // Uses test DB — new merchant starts at low
    const tier = await getMerchantRiskTier(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(tier).toBe("low");
  });

  it("setMerchantRiskTier persists the tier", async () => {
    await setMerchantRiskTier(
      "00000000-0000-0000-0000-000000000001",
      "high",
      "admin_override",
      "Testing lockdown",
    );
    const tier = await getMerchantRiskTier(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(tier).toBe("high");
  });

  it("setMerchantRiskTier rejects invalid tier", async () => {
    await expect(
      setMerchantRiskTier(
        "00000000-0000-0000-0000-000000000001",
        "invalid" as any,
        "admin_override",
        "test",
      ),
    ).rejects.toThrow("invalid risk tier");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/risk-tier.server.test.ts 2>&1 | head -20`
Expected: FAIL — module not found

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260919010000_risk_tier.sql
-- Add risk_tier enum and columns for 4-tier sandboxing.

do $$ begin
  create type public.risk_tier as enum ('low', 'lower_medium', 'medium', 'high');
exception when duplicate_object then null;
end $$;

-- Add risk_tier to merchants table
alter table public.merchants
  add column if not exists risk_tier public.risk_tier default 'low' not null;

-- Add risk tracking columns
alter table public.merchants
  add column if not exists risk_tier_updated_at timestamptz default now() not null,
  add column if not exists risk_tier_reason text default '' not null,
  add column if not exists abuse_score int default 0 not null,
  add column if not exists abuse_flags jsonb default '[]'::jsonb not null;

-- Index for fast tier lookups
create index if not exists idx_merchants_risk_tier on public.merchants (risk_tier);

-- Abuse signal log (append-only)
create table if not exists public.risk_audit_log (
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  old_tier public.risk_tier,
  new_tier public.risk_tier not null,
  reason text not null,
  signal_data jsonb default '{}'::jsonb not null,
  actor text default 'system' not null,
  created_at timestamptz default now() not null,
  primary key (id)
);

create index if not exists idx_risk_audit_log_merchant on public.risk_audit_log (merchant_id, created_at desc);

-- RPC: get merchant risk tier
create or replace function public.get_merchant_risk_tier(p_merchant_id uuid)
returns public.risk_tier
language sql
security definer
stable
as $$
  select coalesce(risk_tier, 'low'::public.risk_tier)
  from public.merchants
  where id = p_merchant_id;
$$;

-- RPC: set merchant risk tier (admin only)
create or replace function public.set_merchant_risk_tier(
  p_merchant_id uuid,
  p_tier public.risk_tier,
  p_reason text,
  p_actor text default 'admin'
)
returns void
language plpgsql
security definer
as $$
declare
  v_old_tier public.risk_tier;
begin
  select risk_tier into v_old_tier
  from public.merchants
  where id = p_merchant_id;

  update public.merchants
  set risk_tier = p_tier,
      risk_tier_updated_at = now(),
      risk_tier_reason = p_reason
  where id = p_merchant_id;

  insert into public.risk_audit_log (merchant_id, old_tier, new_tier, reason, actor)
  values (p_merchant_id, v_old_tier, p_tier, p_reason, p_actor);
end;
$$;

-- RPC: record abuse signal
create or replace function public.record_abuse_signal(
  p_merchant_id uuid,
  p_signal_type text,
  p_signal_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  v Abuse_score int;
  v_new_tier public.risk_tier;
begin
  -- Increment abuse score
  update public.merchants
  set abuse_score = abuse_score + 1,
      abuse_flags = abuse_flags || jsonb_build_array(
        jsonb_build_object('type', p_signal_type, 'at', now(), 'data', p_signal_data)
      )
  where id = p_merchant_id
  returning abuse_score into v_abuse_score;

  -- Auto-escalate tier based on score
  v_new_tier := case
    when v_abuse_score >= 10 then 'high'::public.risk_tier
    when v_abuse_score >= 5 then 'medium'::public.risk_tier
    else null::public.risk_tier
  end;

  if v_new_tier is not null then
    perform public.set_merchant_risk_tier(p_merchant_id, v_new_tier, 'auto:' || p_signal_type, 'system');
  end if;
end;
$$;

-- RLS: only admins can read/write risk_audit_log
alter table public.risk_audit_log enable row level security;

create policy "risk_audit_log_admin_all" on public.risk_audit_log
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "risk_audit_log_service_role" on public.risk_audit_log
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- RLS: merchants can only read their own risk_tier
create policy "merchants_read_own_risk_tier" on public.merchants
  for select
  using (
    id in (
      select merchant_id from public.memberships
      where user_id = auth.uid()
    )
  );

-- Grant execute on RPCs
grant execute on function public.get_merchant_risk_tier(uuid) to authenticated;
grant execute on function public.set_merchant_risk_tier(uuid, public.risk_tier, text, text) to service_role;
grant execute on function public.record_abuse_signal(uuid, text, jsonb) to service_role;
```

- [ ] **Step 4: Write the server module**

```typescript
// src/lib/risk-tier.server.ts
/**
 * Server-only risk tier persistence and abuse signal tracking.
 * Uses Supabase RPC for all DB access.
 */
import { supabaseAdmin } from "./supabase.server";
import type { RiskTier, ResolutionReason } from "./risk-tier";
import { RISK_TIERS } from "./risk-tier";

/**
 * Get the stored risk tier for a merchant.
 * Returns 'low' if merchant not found (safe default).
 */
export async function getMerchantRiskTier(
  merchantId: string,
): Promise<RiskTier> {
  const { data, error } = await supabaseAdmin.rpc("get_merchant_risk_tier", {
    p_merchant_id: merchantId,
  });
  if (error) {
    console.error("[risk-tier] getMerchantRiskTier failed:", error.message);
    return "low";
  }
  return (data as RiskTier) ?? "low";
}

/**
 * Set the risk tier for a merchant (admin action).
 * Records an audit log entry.
 */
export async function setMerchantRiskTier(
  merchantId: string,
  tier: RiskTier,
  reason: string,
  actor: string = "admin",
): Promise<void> {
  if (!RISK_TIERS.includes(tier)) {
    throw new Error(`invalid risk tier: ${tier}`);
  }
  const { error } = await supabaseAdmin.rpc("set_merchant_risk_tier", {
    p_merchant_id: merchantId,
    p_tier: tier,
    p_reason: reason,
    p_actor: actor,
  });
  if (error) {
    console.error("[risk-tier] setMerchantRiskTier failed:", error.message);
    throw new Error(`failed to set risk tier: ${error.message}`);
  }
}

/**
 * Record an abuse signal for a merchant.
 * May auto-escalate the tier if thresholds are crossed.
 */
export async function recordAbuseSignal(
  merchantId: string,
  signalType: string,
  signalData: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("record_abuse_signal", {
    p_merchant_id: merchantId,
    p_signal_type: signalType,
    p_signal_data: signalData,
  });
  if (error) {
    console.error("[risk-tier] recordAbuseSignal failed:", error.message);
  }
}

/**
 * Get full merchant risk context for tier resolution.
 */
export async function getMerchantRiskContext(merchantId: string): Promise<{
  storedTier: RiskTier;
  designSource: "marketplace" | "custom";
  pluginSources: ("marketplace" | "custom")[];
  abuseScore: number;
}> {
  const [tierResult, designResult, pluginsResult, merchantResult] =
    await Promise.all([
      supabaseAdmin.rpc("get_merchant_risk_tier", {
        p_merchant_id: merchantId,
      }),
      supabaseAdmin
        .from("store_designs")
        .select("source_listing_id")
        .eq("merchant_id", merchantId)
        .eq("is_active", true)
        .maybeSingle(),
      supabaseAdmin
        .from("store_plugins")
        .select("source_listing_id")
        .eq("merchant_id", merchantId)
        .eq("enabled", true),
      supabaseAdmin
        .from("merchants")
        .select("abuse_score")
        .eq("id", merchantId)
        .maybeSingle(),
    ]);

  const storedTier = (tierResult.data as RiskTier) ?? "low";
  const designSource = designResult.data?.source_listing_id
    ? "marketplace"
    : "custom";
  const pluginSources = (pluginsResult.data ?? []).map(
    (p: { source_listing_id: string | null }) =>
      p.source_listing_id ? "marketplace" : "custom",
  ) as ("marketplace" | "custom")[];
  const abuseScore = merchantResult.data?.abuse_score ?? 0;

  return { storedTier, designSource, pluginSources, abuseScore };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/lib/risk-tier.server.test.ts 2>&1`
Expected: All 3 tests PASS (requires test DB)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260919010000_risk_tier.sql src/lib/risk-tier.server.ts src/lib/risk-tier.server.test.ts
git commit -m "feat(sandbox): add risk_tier DB schema, RPCs, and server persistence layer"
```

---

## Task 3: CSP Tier Integration

**Files:**

- Modify: `src/lib/custom-code.ts:729-772` — `buildCsp()` accepts tier
- Modify: `src/server.ts:78-90` — `withSecurityHeaders()` emits tier-aware CSP

**Interfaces:**

- Consumes: `RiskTier`, `resolvePolicy` from `risk-tier.ts`
- Produces: `buildCsp(nonce, opts, tier?)` — returns tier-adjusted CSP string

- [ ] **Step 1: Write the failing test**

Add to `src/lib/risk-tier.test.ts`:

```typescript
import { buildCsp } from "./custom-code";

describe("buildCsp with risk tiers", () => {
  it("includes strict-dynamic for low tier", () => {
    const csp = buildCsp("test-nonce", {}, "low");
    expect(csp).toContain("'nonce-test-nonce'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain(
      "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
    );
  });

  it("removes nonce and strict-dynamic for medium tier", () => {
    const csp = buildCsp("test-nonce", {}, "medium");
    expect(csp).not.toContain("test-nonce");
    expect(csp).not.toContain("'strict-dynamic'");
    expect(csp).toContain("script-src 'self'");
  });

  it("removes all frame-src for high tier", () => {
    const csp = buildCsp("test-nonce", {}, "high");
    expect(csp).toContain("frame-src");
    expect(csp).not.toContain("youtube");
    expect(csp).not.toContain("vimeo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/risk-tier.test.ts 2>&1 | tail -20`
Expected: FAIL — `buildCsp` doesn't accept tier arg yet

- [ ] **Step 3: Modify `buildCsp` to accept tier**

In `src/lib/custom-code.ts`, update the `buildCsp` function signature and body:

```typescript
// Line ~744: Update signature
export function buildCsp(
  nonce: string,
  opts: { connect?: string[]; frame?: string[] } = {},
  tier: RiskTier = "low",
): string {
  const policy = resolvePolicy(tier);

  // For high tier, strip everything to self-only
  const connect = policy.features.apiWrite
    ? ["'self'", ...(opts.connect ?? [])].join(" ")
    : "'self'";

  const frame =
    policy.csp.frameSrc.length > 0 ? policy.csp.frameSrc.join(" ") : "'none'";

  const scriptSrc = policy.csp.nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https: data: blob:",
    `connect-src ${connect}`,
    `frame-src ${frame}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
```

Add the import at top of `custom-code.ts`:

```typescript
import { type RiskTier, resolvePolicy } from "./risk-tier";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/risk-tier.test.ts 2>&1`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/custom-code.ts src/lib/risk-tier.test.ts
git commit -m "feat(sandbox): make buildCsp tier-aware with adjustable nonce/script-src/frame-src"
```

---

## Task 4: Iframe Sandbox Tier Integration

**Files:**

- Modify: `src/components/builder/HtmlSandbox.tsx` — accept `riskTier` prop
- Modify: `src/components/marketplace/WidgetSandbox.tsx` — accept `riskTier` prop
- Modify: `src/components/builder/widgets.tsx:815` — embed widget sandbox

**Interfaces:**

- Consumes: `RiskTier`, `resolvePolicy` from `risk-tier.ts`
- Produces: Tier-adjusted `sandbox` attribute on all iframes

- [ ] **Step 1: Write the failing test**

Create `src/lib/risk-tier-iframe.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolvePolicy } from "./risk-tier";

describe("iframe sandbox by tier", () => {
  it("low: allow-forms allow-popups", () => {
    expect(resolvePolicy("low").iframe.sandbox).toBe(
      "allow-forms allow-popups",
    );
  });

  it("lower_medium: allow-forms only", () => {
    expect(resolvePolicy("lower_medium").iframe.sandbox).toBe("allow-forms");
  });

  it("medium: empty (full lockdown)", () => {
    expect(resolvePolicy("medium").iframe.sandbox).toBe("");
  });

  it("high: empty (full lockdown)", () => {
    expect(resolvePolicy("high").iframe.sandbox).toBe("");
  });

  it("low: maxHeight 4000", () => {
    expect(resolvePolicy("low").iframe.maxHeight).toBe(4000);
  });

  it("medium: maxHeight 1000", () => {
    expect(resolvePolicy("medium").iframe.maxHeight).toBe(1000);
  });

  it("high: maxHeight 0 (disabled)", () => {
    expect(resolvePolicy("high").iframe.maxHeight).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/risk-tier-iframe.test.ts 2>&1 | head -10`
Expected: FAIL — should pass since resolvePolicy already handles this, but verify

- [ ] **Step 3: Update HtmlSandbox to accept riskTier prop**

```typescript
// src/components/builder/HtmlSandbox.tsx
import { type RiskTier, resolvePolicy } from "~/lib/risk-tier";

type Props = {
  html: string;
  className?: string;
  riskTier?: RiskTier;
};

export default function HtmlSandbox({ html, className, riskTier = "low" }: Props) {
  const policy = resolvePolicy(riskTier);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ref = useRef(html);

  useEffect(() => { ref.current = html; }, [html]);

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    const handler = (e: MessageEvent) => {
      if (e.source !== el.contentWindow) return;
      if (e.data?.type !== "fq:html-height") return;
      const h = Math.min(Math.max(Number(e.data.height) || 0, 40), policy.iframe.maxHeight || 4000);
      el.style.height = `${h}px`;
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [policy.iframe.maxHeight]);

  if (policy.iframe.maxHeight === 0) {
    return <div className={className} />;
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={sandboxSrcDoc(ref.current)}
      sandbox={policy.iframe.sandbox}
      referrerPolicy={policy.iframe.referrerPolicy}
      className={className}
      title="Custom HTML"
      loading="lazy"
    />
  );
}
```

- [ ] **Step 4: Update WidgetSandbox to accept riskTier prop**

```typescript
// src/components/marketplace/WidgetSandbox.tsx
import { type RiskTier, resolvePolicy } from "~/lib/risk-tier";

// In the component, add riskTier prop and use it:
type Props = {
  bundleJs: string;
  entry: string;
  scopes: string[];
  merchantId: string;
  riskTier?: RiskTier;
};

// In the iframe element:
const policy = resolvePolicy(riskTier ?? "low");
<iframe
  sandbox={policy.iframe.sandbox}
  referrerPolicy={policy.iframe.referrerPolicy}
  ...
/>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/lib/risk-tier-iframe.test.ts 2>&1`
Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/builder/HtmlSandbox.tsx src/components/marketplace/WidgetSandbox.tsx src/lib/risk-tier-iframe.test.ts
git commit -m "feat(sandbox): HtmlSandbox and WidgetSandbox accept riskTier prop for tier-aware isolation"
```

---

## Task 5: Rate Limit Tier Integration

**Files:**

- Modify: `src/lib/rate-limit.server.ts` — tier-aware limit calculation

**Interfaces:**

- Consumes: `RiskTier`, `resolvePolicy` from `risk-tier.ts`
- Produces: `rateLimitWithTier(bucket, key, tier)` — applies tier multiplier

- [ ] **Step 1: Write the failing test**

Add to `src/lib/risk-tier.test.ts`:

```typescript
import { applyTierMultiplier } from "./rate-limit.server";

describe("rate limit tier integration", () => {
  it("low tier does not reduce limits", () => {
    const result = applyTierMultiplier(
      { limit: 100, windowSeconds: 60 },
      "low",
    );
    expect(result.limit).toBe(100);
  });

  it("lower_medium reduces to 70%", () => {
    const result = applyTierMultiplier(
      { limit: 100, windowSeconds: 60 },
      "lower_medium",
    );
    expect(result.limit).toBe(70);
  });

  it("medium reduces to 40%", () => {
    const result = applyTierMultiplier(
      { limit: 100, windowSeconds: 60 },
      "medium",
    );
    expect(result.limit).toBe(40);
  });

  it("high reduces to 10%", () => {
    const result = applyTierMultiplier(
      { limit: 100, windowSeconds: 60 },
      "high",
    );
    expect(result.limit).toBe(10);
  });

  it("rounds up to minimum 1", () => {
    const result = applyTierMultiplier({ limit: 2, windowSeconds: 60 }, "high");
    expect(result.limit).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/risk-tier.test.ts 2>&1 | tail -10`
Expected: FAIL — `applyTierMultiplier` doesn't exist

- [ ] **Step 3: Add `applyTierMultiplier` to rate-limit.server.ts**

```typescript
// At the end of src/lib/rate-limit.server.ts, add:
import { type RiskTier, resolvePolicy } from "./risk-tier";

/**
 * Apply risk tier multiplier to a rate limit bucket definition.
 * Returns a new bucket with the adjusted limit (minimum 1).
 */
export function applyTierMultiplier(
  bucket: { limit: number; windowSeconds: number },
  tier: RiskTier,
): { limit: number; windowSeconds: number } {
  const policy = resolvePolicy(tier);
  return {
    limit: Math.max(1, Math.ceil(bucket.limit * policy.rateLimitMultiplier)),
    windowSeconds: bucket.windowSeconds,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/risk-tier.test.ts 2>&1`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.server.ts src/lib/risk-tier.test.ts
git commit -m "feat(sandbox): add tier-aware rate limit multiplier to rate-limit.server"
```

---

## Task 6: Upload Scanning Tier Integration

**Files:**

- Modify: `src/lib/media/library.ts` — `validateMagicBytes()` accepts strictness level
- Modify: `src/lib/media/library.server.ts` — pass tier to upload validation

**Interfaces:**

- Consumes: `RiskTier`, `resolvePolicy` from `risk-tier.ts`
- Produces: Tier-aware upload validation (strictness, file size, mime whitelist)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/risk-tier.test.ts`:

```typescript
import { resolvePolicy } from "./risk-tier";

describe("upload policy by tier", () => {
  it("low: standard scanning, 10MB", () => {
    const p = resolvePolicy("low");
    expect(p.upload.scanningStrictness).toBe("standard");
    expect(p.upload.maxFileSizeBytes).toBe(10 * 1024 * 1024);
    expect(p.upload.allowedMimeTypes).toContain("image/*");
  });

  it("lower_medium: enhanced scanning, 5MB", () => {
    const p = resolvePolicy("lower_medium");
    expect(p.upload.scanningStrictness).toBe("enhanced");
    expect(p.upload.maxFileSizeBytes).toBe(5 * 1024 * 1024);
  });

  it("medium: strict scanning, 2MB, no wildcards", () => {
    const p = resolvePolicy("medium");
    expect(p.upload.scanningStrictness).toBe("strict");
    expect(p.upload.maxFileSizeBytes).toBe(2 * 1024 * 1024);
    expect(p.upload.allowedMimeTypes.every((m) => !m.includes("*"))).toBe(true);
  });

  it("high: forensic scanning, 0 bytes (blocked)", () => {
    const p = resolvePolicy("high");
    expect(p.upload.scanningStrictness).toBe("forensic");
    expect(p.upload.maxFileSizeBytes).toBe(0);
    expect(p.upload.allowedMimeTypes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Modify upload validation to use tier**

In `src/lib/media/library.ts`, update `validateMagicBytes` to accept strictness:

```typescript
export type ScanningStrictness =
  "standard" | "enhanced" | "strict" | "forensic";

export function validateMagicBytes(
  buffer: ArrayBuffer,
  declaredMime: string,
  strictness: ScanningStrictness = "standard",
): { valid: boolean; reason?: string } {
  // forensic = block everything
  if (strictness === "forensic") {
    return { valid: false, reason: "uploads_disabled" };
  }

  // ... existing magic byte checks ...

  // enhanced+: also validate file size header hints
  // strict: reject any mime not in the explicit allowlist
  // (existing logic enhanced with strictness parameter)
}
```

- [ ] **Step 3: Wire tier into upload paths**

In `src/lib/media/library.server.ts` `uploadAttachment()`:

```typescript
import { type RiskTier } from "~/lib/risk-tier";

// Add riskTier parameter to uploadAttachment
export async function uploadAttachment(
  merchantId: string,
  file: File,
  riskTier: RiskTier = "low",
): Promise<AttachmentResult> {
  const policy = resolvePolicy(riskTier);

  // Check upload feature gate
  if (!policy.features.uploads) {
    return { error: "uploads_disabled_by_risk_policy" };
  }

  // Check file size against tier limit
  if (file.size > policy.upload.maxFileSizeBytes) {
    return { error: "file_too_large_for_tier" };
  }

  // Check mime type against tier allowlist
  if (!isAllowedMimeType(file.type, policy.upload.allowedMimeTypes)) {
    return { error: "mime_type_not_allowed_for_tier" };
  }

  // Run magic bytes check with tier strictness
  const buffer = await file.arrayBuffer();
  const validation = validateMagicBytes(
    buffer,
    file.type,
    policy.upload.scanningStrictness,
  );
  if (!validation.valid) {
    return { error: validation.reason ?? "invalid_file_content" };
  }

  // ... rest of upload logic
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/risk-tier.test.ts 2>&1`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/library.ts src/lib/media/library.server.ts src/lib/risk-tier.test.ts
git commit -m "feat(sandbox): tier-aware upload scanning with strictness levels and mime whitelists"
```

---

## Task 7: Request Pipeline Integration

**Files:**

- Modify: `src/server.ts` — resolve tier per-request, attach to context

**Interfaces:**

- Consumes: `getMerchantRiskContext`, `resolveTierFromSignals` from `risk-tier.server.ts`
- Produces: `riskTier` on request context, passed to CSP and downstream

- [ ] **Step 1: Modify server.ts to resolve tier**

In `src/server.ts`, add tier resolution to the request pipeline:

```typescript
import { resolveTierFromSignals, type RiskTier } from "./risk-tier";
import { getMerchantRiskContext } from "./risk-tier.server";

// Add to the request context type:
type RequestContext = {
  clientIp: string;
  merchantId?: string;
  riskTier: RiskTier;
  riskReasons: string[];
};

// In the request handler, after identifying the merchant:
async function resolveRequestTier(
  merchantId?: string,
): Promise<{ tier: RiskTier; reasons: string[] }> {
  if (!merchantId) return { tier: "low", reasons: [] };

  try {
    const ctx = await getMerchantRiskContext(merchantId);
    const { tier, reasons } = resolveTierFromSignals({
      storedTier: ctx.storedTier,
      designSource: ctx.designSource,
      pluginSources: ctx.pluginSources,
      fraudScore: ctx.abuseScore,
    });
    return { tier, reasons };
  } catch {
    return { tier: "low", reasons: [] };
  }
}

// In withSecurityHeaders, use the tier:
function withSecurityHeaders(
  request: Request,
  response: Response,
  riskTier: RiskTier = "low",
): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");

  // Emit tier-aware CSP header
  const nonce = resolvePolicy(riskTier).csp.nonce ? newNonce() : "";
  if (resolvePolicy(riskTier).csp.nonce) {
    headers.set("content-security-policy", buildCsp(nonce, {}, riskTier));
  }

  if (isEditorPreviewHost(request)) {
    headers.delete("x-frame-options");
  } else {
    headers.set("x-frame-options", "SAMEORIGIN");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
```

- [ ] **Step 2: Write test for tier resolution in request context**

Add to `src/lib/risk-tier.test.ts`:

```typescript
describe("resolveTierFromSignals", () => {
  it("returns low for official design+plugin", () => {
    const result = resolveTierFromSignals({
      designSource: "marketplace",
      pluginSources: ["marketplace", "marketplace"],
    });
    expect(result.tier).toBe("low");
    expect(result.reasons).toContain("official_design");
  });

  it("returns lower_medium for custom design", () => {
    const result = resolveTierFromSignals({
      designSource: "custom",
      pluginSources: ["marketplace"],
    });
    expect(result.tier).toBe("lower_medium");
    expect(result.reasons).toContain("custom_design");
  });

  it("returns lower_medium for custom plugin", () => {
    const result = resolveTierFromSignals({
      designSource: "marketplace",
      pluginSources: ["marketplace", "custom"],
    });
    expect(result.tier).toBe("lower_medium");
    expect(result.reasons).toContain("custom_plugin");
  });

  it("returns medium for high bot score", () => {
    const result = resolveTierFromSignals({
      designSource: "marketplace",
      botScore: 70,
    });
    expect(result.tier).toBe("medium");
    expect(result.reasons).toContain("visitor_flagged");
  });

  it("returns high for fraud score >= 80", () => {
    const result = resolveTierFromSignals({
      fraudScore: 85,
    });
    expect(result.tier).toBe("high");
    expect(result.reasons).toContain("fraud_engine");
  });

  it("returns high for abuse flags >= 3", () => {
    const result = resolveTierFromSignals({
      abuseFlags: 5,
    });
    expect(result.tier).toBe("high");
    expect(result.reasons).toContain("behavior_signal");
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun run test src/lib/risk-tier.test.ts 2>&1`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/server.ts src/lib/risk-tier.test.ts
git commit -m "feat(sandbox): wire risk tier resolution into request pipeline with CSP header emission"
```

---

## Task 8: Admin API for Risk Tier Management

**Files:**

- Create: `src/routes/api/admin/merchant.$id/risk-tier.ts`

**Interfaces:**

- Consumes: `getMerchantRiskTier`, `setMerchantRiskTier` from `risk-tier.server.ts`
- Produces: GET/POST API for admin tier management

- [ ] **Step 1: Create the admin API route**

```typescript
// src/routes/api/admin/merchant.$id/risk-tier.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getMerchantRiskTier,
  setMerchantRiskTier,
} from "~/lib/risk-tier.server";
import { RISK_TIERS, type RiskTier } from "~/lib/risk-tier";

const GetSchema = z.object({ merchantId: z.string().uuid() });
const SetSchema = z.object({
  merchantId: z.string().uuid(),
  tier: z.enum(RISK_TIERS),
  reason: z.string().min(1).max(500),
});

export const getMerchantRiskTierFn = createServerFn({ method: "GET" })
  .validator(GetSchema)
  .handler(async ({ data }) => {
    const tier = await getMerchantRiskTier(data.merchantId);
    return { tier };
  });

export const setMerchantRiskTierFn = createServerFn({ method: "POST" })
  .validator(SetSchema)
  .handler(async ({ data }) => {
    await setMerchantRiskTier(data.merchantId, data.tier, data.reason, "admin");
    return { ok: true };
  });
```

- [ ] **Step 2: Write test for admin API**

Create `src/routes/api/admin/merchant.$id/risk-tier.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getMerchantRiskTierFn, setMerchantRiskTierFn } from "./risk-tier";

describe("admin risk-tier API", () => {
  it("get returns default low for unknown merchant", async () => {
    const result = await getMerchantRiskTierFn({
      data: { merchantId: "00000000-0000-0000-0000-000000000099" },
    });
    expect(result.tier).toBe("low");
  });

  it("set and get round-trips", async () => {
    await setMerchantRiskTierFn({
      data: {
        merchantId: "00000000-0000-0000-0000-000000000001",
        tier: "medium",
        reason: "Test escalation",
      },
    });
    const result = await getMerchantRiskTierFn({
      data: { merchantId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(result.tier).toBe("medium");
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun run test src/routes/api/admin/merchant.\$id/risk-tier.test.ts 2>&1`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/admin/merchant.\$id/risk-tier.ts src/routes/api/admin/merchant.\$id/risk-tier.test.ts
git commit -m "feat(sandbox): admin API for viewing and setting merchant risk tiers"
```

---

## Task 9: Feature Gate Checks

**Files:**

- Create: `src/lib/feature-gate.ts` — helper to check feature gates
- Create: `src/lib/feature-gate.test.ts`

**Interfaces:**

- Consumes: `RiskTier`, `resolvePolicy` from `risk-tier.ts`
- Produces: `hasFeature(tier, feature)`, `requireFeature(tier, feature)`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/feature-gate.test.ts
import { describe, it, expect } from "vitest";
import { hasFeature, requireFeature } from "./feature-gate";

describe("feature-gate", () => {
  it("low tier has all features", () => {
    expect(hasFeature("low", "customCode")).toBe(true);
    expect(hasFeature("low", "builder")).toBe(true);
    expect(hasFeature("low", "checkout")).toBe(true);
  });

  it("medium tier lacks customCode", () => {
    expect(hasFeature("medium", "customCode")).toBe(false);
    expect(hasFeature("medium", "builder")).toBe(false);
    expect(hasFeature("medium", "checkout")).toBe(true);
  });

  it("high tier lacks everything", () => {
    expect(hasFeature("high", "customCode")).toBe(false);
    expect(hasFeature("high", "checkout")).toBe(false);
    expect(hasFeature("high", "analytics")).toBe(false);
  });

  it("requireFeature throws for disabled feature", () => {
    expect(() => requireFeature("high", "builder")).toThrow(
      "feature_disabled_by_risk_policy",
    );
  });

  it("requireFeature does not throw for enabled feature", () => {
    expect(() => requireFeature("low", "builder")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/feature-gate.test.ts 2>&1 | head -10`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/feature-gate.ts
import { type RiskTier, resolvePolicy, type FeatureGates } from "./risk-tier";

export type FeatureKey = keyof FeatureGates;

/**
 * Check if a feature is enabled for a given risk tier.
 */
export function hasFeature(tier: RiskTier, feature: FeatureKey): boolean {
  return resolvePolicy(tier).features[feature];
}

/**
 * Throw if a feature is disabled for a given risk tier.
 * Use in server handlers to gate features.
 */
export function requireFeature(tier: RiskTier, feature: FeatureKey): void {
  if (!hasFeature(tier, feature)) {
    throw new FeatureDisabledError(feature, tier);
  }
}

export class FeatureDisabledError extends Error {
  constructor(
    readonly feature: FeatureKey,
    readonly tier: RiskTier,
  ) {
    super(`feature_disabled_by_risk_policy:${feature}`);
    this.name = "FeatureDisabledError";
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/feature-gate.test.ts 2>&1`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/feature-gate.ts src/lib/feature-gate.test.ts
git commit -m "feat(sandbox): feature gate helpers for tier-based feature access control"
```

---

## Task 10: Integration Tests & Full Run

**Files:**

- Modify: all test files — ensure no regressions

**Interfaces:**

- Consumes: all previous tasks
- Produces: full test suite passes

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck 2>&1 | tail -20`
Expected: No type errors

- [ ] **Step 2: Run all tests**

Run: `bun run test 2>&1 | tail -30`
Expected: All tests PASS, including new risk-tier tests

- [ ] **Step 3: Run contract tests**

Run: `bun run test:contracts 2>&1 | tail -10`
Expected: All contracts PASS

- [ ] **Step 4: Run lint**

Run: `bun run lint 2>&1 | tail -10`
Expected: No lint errors

- [ ] **Step 5: Final commit with all changes**

```bash
git add -A
git commit -m "feat(sandbox): complete 4-tier risk sandboxing system

- RiskTier type and policy map (low/lower_medium/medium/high)
- DB schema with risk_tier enum, abuse_score, abuse_flags, audit log
- RPCs: get_merchant_risk_tier, set_merchant_risk_tier, record_abuse_signal
- CSP integration: buildCsp accepts tier, adjusts nonce/script-src/frame-src
- Iframe sandbox: HtmlSandbox and WidgetSandbox accept riskTier prop
- Rate limits: tier multiplier (1.0/0.7/0.4/0.1)
- Upload scanning: tier-aware strictness, file size, mime whitelist
- Feature gates: hasFeature(), requireFeature() helpers
- Admin API: GET/POST merchant risk tier
- Request pipeline: tier resolution in server.ts"
```

---

## Verification Checklist

After all tasks, verify:

1. **Typecheck passes** — `bun run typecheck`
2. **All tests pass** — `bun run test` (existing + new)
3. **Contract tests pass** — `bun run test:contracts`
4. **Lint passes** — `bun run lint`
5. **No regressions** — existing sandbox behavior unchanged for `low` tier
6. **Manual verification** — login as admin, check merchant risk tier panel

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-19-risk-sandbox-4tier.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
