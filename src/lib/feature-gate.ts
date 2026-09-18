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
