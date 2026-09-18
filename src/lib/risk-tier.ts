/**
 * 4-tier risk sandboxing system.
 *
 * Tier assignment is per-merchant and resolved from:
 *   1. Admin override (manual set)
 *   2. Theme source (official marketplace = low, custom = lower_medium)
 *   3. Plugin source (official = low, custom = lower_medium)
 *   4. Behavior signals (fraud engine, bot score, abuse reports)
 *
 * The tier drives CSP policy, iframe sandbox attributes, rate limit
 * multipliers, upload scanning strictness, and feature gates.
 */

export const RISK_TIERS = ["low", "lower_medium", "medium", "high"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const RESOLUTION_REASONS = [
  "official_theme",
  "official_plugin",
  "custom_theme",
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
  themeSource?: "marketplace" | "custom";
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

  // Custom theme → lower_medium
  if (input.themeSource === "custom") {
    reasons.push("custom_theme");
    return { tier: "lower_medium", reasons };
  }

  // Official everything → low
  if (input.themeSource === "marketplace") {
    reasons.push("official_theme");
  }
  if (input.pluginSources?.every((s) => s === "marketplace")) {
    reasons.push("official_plugin");
  }

  // Fallback to stored tier or low
  return { tier: input.storedTier ?? "low", reasons };
}
