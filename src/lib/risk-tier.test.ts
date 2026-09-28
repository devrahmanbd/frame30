import { describe, it, expect } from "vitest";
import {
  type RiskTier,
  resolvePolicy,
  resolveTierFromSignals,
  RESOLUTION_REASONS,
  type SandboxPolicy,
} from "./risk-tier";
import { applyTierMultiplier } from "./rate-limit.server";
import { buildCsp } from "./custom-code";

describe("risk-tier", () => {
  describe("resolvePolicy", () => {
    it("returns full access for low tier", () => {
      const p = resolvePolicy("low");
      expect(p.csp.scriptSrc).toContain("'strict-dynamic'");
      expect(p.iframe.sandbox).toBe("allow-scripts allow-forms allow-popups");
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
  });

  describe("resolveTierFromSignals", () => {
    it("returns low for official theme+plugin", () => {
      const result = resolveTierFromSignals({
        themeSource: "marketplace",
        pluginSources: ["marketplace", "marketplace"],
      });
      expect(result.tier).toBe("low");
      expect(result.reasons).toContain("official_theme");
    });

    it("returns lower_medium for custom theme", () => {
      const result = resolveTierFromSignals({
        themeSource: "custom",
        pluginSources: ["marketplace"],
      });
      expect(result.tier).toBe("lower_medium");
      expect(result.reasons).toContain("custom_theme");
    });

    it("returns lower_medium for custom plugin", () => {
      const result = resolveTierFromSignals({
        themeSource: "marketplace",
        pluginSources: ["marketplace", "custom"],
      });
      expect(result.tier).toBe("lower_medium");
      expect(result.reasons).toContain("custom_plugin");
    });

    it("returns medium for high bot score", () => {
      const result = resolveTierFromSignals({
        themeSource: "marketplace",
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

    it("falls back to stored tier when no signals present", () => {
      const result = resolveTierFromSignals({
        storedTier: "medium",
      });
      expect(result.tier).toBe("medium");
    });

    it("falls back to medium (restrictive) when no signals and no stored tier", () => {
      // Rule 5: an unestablished tier must not grant low-tier privileges.
      const result = resolveTierFromSignals({});
      expect(result.tier).toBe("medium");
    });
  });

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
      expect(p.upload.allowedMimeTypes.every((m) => !m.includes("*"))).toBe(
        true,
      );
    });

    it("high: forensic scanning, 0 bytes (blocked)", () => {
      const p = resolvePolicy("high");
      expect(p.upload.scanningStrictness).toBe("forensic");
      expect(p.upload.maxFileSizeBytes).toBe(0);
      expect(p.upload.allowedMimeTypes).toHaveLength(0);
    });
  });

  it("returns all resolution reasons", () => {
    expect(RESOLUTION_REASONS).toContain("official_theme");
    expect(RESOLUTION_REASONS).toContain("custom_theme");
    expect(RESOLUTION_REASONS).toContain("custom_plugin");
    expect(RESOLUTION_REASONS).toContain("behavior_signal");
    expect(RESOLUTION_REASONS).toContain("admin_override");
    expect(RESOLUTION_REASONS).toContain("fraud_engine");
  });
});

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

describe("buildCsp with risk tiers", () => {
  it("includes strict-dynamic for low tier", () => {
    const csp = buildCsp("test-nonce", {}, "low");
    expect(csp).toContain("'nonce-test-nonce'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain(
      "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
    );
  });

  it("keeps nonce + strict-dynamic on medium tier when a nonce is supplied (live 2026-09-28)", () => {
    // Documents always carry TanStack bootstrap inline scripts; a bare
    // `script-src 'self'` can never hydrate (3× CSP blocks → missing
    // window.$_TSR). Nonce + strict-dynamic is scoped, never unsafe-inline;
    // tier still restricts frame-src/features.
    const csp = buildCsp("test-nonce", {}, "medium");
    expect(csp).toContain("'nonce-test-nonce'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("removes all frame-src for high tier", () => {
    const csp = buildCsp("test-nonce", {}, "high");
    expect(csp).toContain("frame-src");
    expect(csp).not.toContain("youtube");
    expect(csp).not.toContain("vimeo");
  });
});
