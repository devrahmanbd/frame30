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
      expect(RESOLUTION_REASONS).toContain("official_theme");
      expect(RESOLUTION_REASONS).toContain("custom_theme");
      expect(RESOLUTION_REASONS).toContain("custom_plugin");
      expect(RESOLUTION_REASONS).toContain("behavior_signal");
      expect(RESOLUTION_REASONS).toContain("admin_override");
      expect(RESOLUTION_REASONS).toContain("fraud_engine");
    });
  });
});
