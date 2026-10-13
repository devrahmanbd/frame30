/**
 * FB Pixel per-tenant isolation — hermetic TDD contract tests.
 *
 * Scope: the browser Meta Pixel snippet (fbq + noscript img fallback) rendered
 * on a tenant's storefront from that tenant's own `facebook_pixel_id`.
 *
 * Hermetic: pure string rendering + the existing pure validators in
 * `search-console.ts`. No fetch, no Supabase, no clock. The provided pixel ID
 * 979224697785271 is fixture data only — it is never sent anywhere.
 *
 * Verified context:
 * - per-tenant `facebook_pixel_id` lives in seo_settings
 *   (tenant-vault.server.ts:285-286,350-351; seo/site-seo.ts:143);
 * - the canonical ID shape is ANALYTICS_SPEC.meta.pattern = /^\d{8,20}$/
 *   (search-console.ts:246-252);
 * - `connect.facebook.net` is the allowlisted loader host
 *   (package-review.ts:328-331);
 * - GAP (reported, not fixed): no storefront module currently emits an fbq
 *   snippet — SiteKitTags.tsx:119-135 skips vendors with src:null, and
 *   tagPlan() returns src:null for meta (search-console.ts:346-354). The
 *   `renderMetaPixelSnippet` helper below pins the contract the storefront
 *   MUST satisfy once wired.
 */
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_SPEC,
  tagPlan,
  validateAnalytics,
  validateSiteKit,
} from "./search-console";

/* ------------------------------------------------------------------ *
 * Contract helper under test (hermetic — pure string building only).
 * ------------------------------------------------------------------ */

const META_PATTERN = ANALYTICS_SPEC.meta.pattern;

/** Allowlisted Meta loader host (package-review.ts:328-331). */
const META_LOADER_HOST = "connect.facebook.net";

type PixelRender =
  | { skipped: false; pixelId: string; script: string; noscript: string }
  | { skipped: true; reason: "pixel_not_configured" | "pixel_id_invalid" };

/**
 * Build the browser pixel snippet for one tenant's storefront.
 * Returns `{ skipped: true, reason }` instead of throwing so callers can
 * degrade silently (missing/invalid config must never break rendering).
 */
function renderMetaPixelSnippet(raw: unknown): PixelRender {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { skipped: true, reason: "pixel_not_configured" };
  // Digits-only by construction: anything that could break out of markup
  // (< > " ' & ` / letters) fails the pattern and is never interpolated.
  if (!META_PATTERN.test(text))
    return { skipped: true, reason: "pixel_id_invalid" };
  const id = encodeURIComponent(text);
  const script =
    `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){` +
    `n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};` +
    `if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];` +
    `t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];` +
    `s.parentNode.insertBefore(t,s)}(window,document,'script',` +
    `'https://${META_LOADER_HOST}/en_US/fbevents.js');` +
    `fbq('init','${id}');fbq('track','PageView');</script>`;
  const noscript =
    `<noscript><img height="1" width="1" style="display:none" ` +
    `src="https://www.facebook.com/tr?id=${id}&amp;ev=PageView&amp;noscript=1" /></noscript>`;
  return { skipped: false, pixelId: text, script, noscript };
}

/* ------------------------------------------------------------------ *
 * Fixtures: two tenants, disjoint pixel IDs.
 * ------------------------------------------------------------------ */

const TENANT_A = "merchant_alpha";
const TENANT_B = "merchant_beta";
// Fixture data only — never transmitted (no fetch in this file).
const PIXEL_A = "979224697785271";
const PIXEL_B = "123456789012345";

function storefrontMarkup(pixelId: unknown): string {
  const rendered = renderMetaPixelSnippet(pixelId);
  if (rendered.skipped) return "";
  return `${rendered.script}\n${rendered.noscript}`;
}

describe("fb pixel per-tenant isolation", () => {
  it("renders tenant A's pixel ID on A's storefront", () => {
    const html = storefrontMarkup(PIXEL_A);
    expect(html).toContain(`fbq('init','${PIXEL_A}')`);
    expect(html).toContain(`tr?id=${PIXEL_A}`);
  });

  it("NEVER renders tenant B's pixel on A's storefront (and vice versa)", () => {
    const htmlA = storefrontMarkup(PIXEL_A);
    expect(htmlA).toContain(PIXEL_A);
    expect(htmlA).not.toContain(PIXEL_B);

    const htmlB = storefrontMarkup(PIXEL_B);
    expect(htmlB).toContain(PIXEL_B);
    expect(htmlB).not.toContain(PIXEL_A);

    expect(TENANT_A).not.toBe(TENANT_B);
    expect(PIXEL_A).not.toBe(PIXEL_B);
  });

  it("keeps noscript img fallback in parity with the fbq init ID", () => {
    for (const pixel of [PIXEL_A, PIXEL_B]) {
      const rendered = renderMetaPixelSnippet(pixel);
      expect(rendered.skipped).toBe(false);
      if (rendered.skipped) continue;
      const scriptId = /fbq\('init','([^']+)'\)/.exec(rendered.script)?.[1];
      const noscriptId = /tr\?id=([^&"]+)/.exec(rendered.noscript)?.[1];
      expect(scriptId).toBe(pixel);
      expect(noscriptId).toBe(pixel);
      expect(scriptId).toBe(noscriptId);
    }
  });

  it("loads the pixel from the allowlisted host only", () => {
    const rendered = renderMetaPixelSnippet(PIXEL_A);
    expect(rendered.skipped).toBe(false);
    if (rendered.skipped) return;
    expect(rendered.script).toContain(
      `https://${META_LOADER_HOST}/en_US/fbevents.js`,
    );
    // No other remote host may appear in the snippet.
    const hosts = [
      ...rendered.script.matchAll(/https:\/\/([A-Za-z0-9.-]+)/g),
    ].map((m) => m[1]);
    expect(hosts).toEqual([META_LOADER_HOST]);
  });

  it("renders nothing (no errors) when a tenant has no pixel configured", () => {
    for (const missing of [undefined, null, "", "   "]) {
      const rendered = renderMetaPixelSnippet(missing);
      expect(rendered).toEqual({
        skipped: true,
        reason: "pixel_not_configured",
      });
      expect(storefrontMarkup(missing)).toBe("");
    }
  });

  it("rejects/ignores malformed pixel IDs — XSS-shaped input never reaches markup", () => {
    const hostile = [
      "<script>alert(1)</script>",
      `${PIXEL_A}"><script>alert(1)</script>`,
      `12345"><img src=x onerror=alert(1)>`,
      `" onload="alert(1)`,
      "javascript:alert(1)",
      "abc",
      "1234567", // too short (< 8 digits)
      "123456789012345678901", // too long (> 20 digits)
      "1234 5678 9012",
      "97922469778527a",
    ];
    for (const input of hostile) {
      const rendered = renderMetaPixelSnippet(input);
      expect(rendered).toEqual({ skipped: true, reason: "pixel_id_invalid" });
    }
    // And the only markup we ever emit carries a validated digits-only ID:
    // attacker metacharacters cannot appear in any rendered snippet.
    const rendered = renderMetaPixelSnippet(PIXEL_A);
    expect(rendered.skipped).toBe(false);
    if (rendered.skipped) return;
    const html = `${rendered.script}\n${rendered.noscript}`;
    expect(html).toContain(PIXEL_A);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("onerror=");
    expect(html).not.toContain("onload=");
    expect(html).not.toContain("javascript:");
  });

  it("agrees with the existing validators (validateAnalytics / validateSiteKit)", () => {
    const ok = validateAnalytics({ enabled: { meta: PIXEL_A } });
    expect(ok.issues).toEqual([]);
    expect(ok.value.enabled["meta"]).toBe(PIXEL_A);

    const bad = validateAnalytics({
      enabled: { meta: `12345"><img src=x onerror=alert(1)>` },
    });
    expect(bad.value.enabled["meta"]).toBeUndefined();
    expect(bad.issues.map((i) => i.field)).toContain("analytics.meta");

    // An attacker ID smuggled through the Site Kit envelope is dropped before
    // it can ever reach tagPlan / the storefront.
    const kit = validateSiteKit({
      verification: { tokens: {}, custom: [] },
      analytics: {
        enabled: { meta: "<script>alert(1)</script>" },
        consentRequired: true,
      },
      searchConsoleSiteUrl: null,
      botProtection: false,
    });
    expect(kit.value.analytics.enabled["meta"]).toBeUndefined();
    expect(tagPlan(kit.value.analytics)).toEqual([]);
  });
});
