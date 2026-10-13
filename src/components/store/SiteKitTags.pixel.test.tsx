/**
 * MetaPixelTags SSR tests — hermetic.
 *
 * `renderToStaticMarkup` (vitest env node): asserts the no-JS `<noscript>`
 * fallback and the gating policy (tenant pixel only, custom-domain gate,
 * consent gate, malformed never renders). The fbq `<script>` half mounts via
 * an idle-time effect, which never runs in SSR — the script body it appends
 * is pinned by `src/lib/fb-pixel.test.ts` instead.
 *
 * Fixture pixel IDs are data only, never transmitted.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnalyticsSettings } from "@/lib/search-console";
import {
  MetaPixelTags,
  SiteKitSurface,
  type StorefrontSiteKit,
} from "./SiteKitTags";

// Fixture data only — asserted as strings, never transmitted.
const PIXEL_A = "979224697785271";
const PIXEL_B = "123456789012345";

function analyticsFor(
  meta: string | undefined,
  consentRequired: boolean,
): AnalyticsSettings {
  return {
    enabled: meta === undefined ? {} : { meta },
    consentRequired,
  };
}

function renderPixel(
  meta: string | undefined,
  opts: { consentRequired?: boolean; hasCustomDomain?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <MetaPixelTags
      analytics={analyticsFor(meta, opts.consentRequired ?? false)}
      consented={false}
      hasCustomDomain={opts.hasCustomDomain ?? true}
    />,
  );
}

describe("MetaPixelTags SSR", () => {
  it("renders the noscript fallback with the tenant's own pixel when ungated", () => {
    const html = renderPixel(PIXEL_A);
    expect(html).toContain("<noscript>");
    expect(html).toContain(`tr?id=${PIXEL_A}`);
    expect(html).not.toContain(PIXEL_B);
  });

  it("isolates tenants: A's markup never carries B's pixel", () => {
    expect(renderPixel(PIXEL_A)).not.toContain(PIXEL_B);
    expect(renderPixel(PIXEL_B)).not.toContain(PIXEL_A);
  });

  it("renders nothing when the tenant has no pixel configured", () => {
    expect(renderPixel(undefined)).toBe("");
    expect(renderPixel("")).toBe("");
  });

  it("renders nothing for malformed stored IDs", () => {
    for (const bad of [
      "<script>alert(1)</script>",
      `${PIXEL_A}"><script>alert(1)</script>`,
      "1234567",
      "abc",
    ]) {
      const html = renderPixel(bad);
      expect(html).toBe("");
      expect(html).not.toContain("alert");
    }
  });

  it("renders nothing on slug storefronts (custom-domain gate)", () => {
    expect(renderPixel(PIXEL_A, { hasCustomDomain: false })).toBe("");
  });

  it("withholds the SSR noscript when consent gating is on (effect is the sole emitter)", () => {
    expect(renderPixel(PIXEL_A, { consentRequired: true })).toBe("");
  });

  it("mounts through SiteKitSurface for the current tenant only", () => {
    const siteKit: StorefrontSiteKit = {
      verification: { tokens: {}, custom: [] },
      analytics: analyticsFor(PIXEL_A, false),
      hasCustomDomain: true,
      botProtection: false,
    };
    const html = renderToStaticMarkup(<SiteKitSurface siteKit={siteKit} />);
    expect(html).toContain(`tr?id=${PIXEL_A}`);
    expect(html).not.toContain(PIXEL_B);
    expect(renderToStaticMarkup(<SiteKitSurface siteKit={null} />)).toBe("");
  });
});
