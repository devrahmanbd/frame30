/**
 * fb-pixel unit tests — hermetic.
 *
 * Pure string building + pattern checks only: no fetch, no Supabase, no
 * clock. The pixel ID 979224697785271 is fixture data, never transmitted.
 */
import { describe, expect, it } from "vitest";
import { ANALYTICS_SPEC, validateAnalytics } from "./search-console";
import { parseSiteSeo } from "./seo/site-seo";
import {
  FB_PIXEL_PATTERN,
  META_LOADER_HOST,
  isValidFacebookPixelId,
  metaPixelNoscriptUrl,
  metaPixelScriptBody,
  renderMetaPixelSnippet,
} from "./fb-pixel";

// Fixture data only — asserted as strings, never transmitted.
const PIXEL = "979224697785271";

describe("fb-pixel validator", () => {
  it("mirrors the Site Kit Meta spec pattern (no drift)", () => {
    expect(FB_PIXEL_PATTERN).toBe(ANALYTICS_SPEC.meta.pattern);
    expect(ANALYTICS_SPEC.meta.pattern.source).toBe("^\\d{8,20}$");
  });

  it("accepts well-formed IDs (8–20 digits, surrounding whitespace trimmed)", () => {
    for (const good of [
      PIXEL,
      "12345678", // min length
      "12345678901234567890", // max length
      `  ${PIXEL}  `,
    ]) {
      expect(isValidFacebookPixelId(good)).toBe(true);
    }
  });

  it("rejects malformed / hostile IDs", () => {
    for (const bad of [
      "",
      "   ",
      "abc",
      "1234567", // too short
      "123456789012345678901", // too long
      "1234 5678 9012",
      "97922469778527a",
      "<script>alert(1)</script>",
      `${PIXEL}"><script>alert(1)</script>`,
      `12345"><img src=x onerror=alert(1)>`,
      `" onload="alert(1)`,
      "javascript:alert(1)",
      null,
      undefined,
      12345678,
      {},
    ]) {
      expect(isValidFacebookPixelId(bad)).toBe(false);
    }
  });

  it("agrees with validateAnalytics on accept/reject", () => {
    const ok = validateAnalytics({ enabled: { meta: PIXEL } });
    expect(ok.value.enabled["meta"]).toBe(PIXEL);
    expect(isValidFacebookPixelId(ok.value.enabled["meta"])).toBe(true);

    const bad = validateAnalytics({
      enabled: { meta: `12345"><img src=x onerror=alert(1)>` },
    });
    expect(bad.value.enabled["meta"]).toBeUndefined();
  });
});

describe("fb-pixel snippet", () => {
  it("emits fbq init + PageView from the allowlisted loader host only", () => {
    const rendered = renderMetaPixelSnippet(PIXEL);
    expect(rendered.skipped).toBe(false);
    if (rendered.skipped) return;
    expect(rendered.pixelId).toBe(PIXEL);
    expect(rendered.script).toContain(`fbq('init','${PIXEL}')`);
    expect(rendered.script).toContain(`fbq('track','PageView')`);
    expect(rendered.script).toContain(
      `https://${META_LOADER_HOST}/en_US/fbevents.js`,
    );
    const hosts = [
      ...rendered.script.matchAll(/https:\/\/([A-Za-z0-9.-]+)/g),
    ].map((m) => m[1]);
    expect(hosts).toEqual([META_LOADER_HOST]);
  });

  it("keeps the noscript fallback in parity with the fbq init ID", () => {
    const rendered = renderMetaPixelSnippet(PIXEL);
    expect(rendered.skipped).toBe(false);
    if (rendered.skipped) return;
    const scriptId = /fbq\('init','([^']+)'\)/.exec(rendered.script)?.[1];
    const noscriptId = /tr\?id=([^&"]+)/.exec(rendered.noscript)?.[1];
    expect(scriptId).toBe(PIXEL);
    expect(noscriptId).toBe(PIXEL);
  });

  it("skips with a reason for missing vs malformed IDs", () => {
    for (const missing of [undefined, null, "", "   "]) {
      expect(renderMetaPixelSnippet(missing)).toEqual({
        skipped: true,
        reason: "pixel_not_configured",
      });
    }
    for (const malformed of ["abc", "1234567", "<script>alert(1)</script>"]) {
      expect(renderMetaPixelSnippet(malformed)).toEqual({
        skipped: true,
        reason: "pixel_id_invalid",
      });
    }
  });

  it("composes the full tags from the shared body/url builders (no drift)", () => {
    const rendered = renderMetaPixelSnippet(PIXEL);
    expect(rendered.skipped).toBe(false);
    if (rendered.skipped) return;
    expect(rendered.script).toBe(
      `<script>${metaPixelScriptBody(PIXEL)}</script>`,
    );
    expect(rendered.noscript).toContain(
      metaPixelNoscriptUrl(PIXEL).replace(/&/g, "&amp;"),
    );
    // Attacker metacharacters cannot appear in any rendered snippet.
    const html = `${rendered.script}\n${rendered.noscript}`;
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("onerror=");
    expect(html).not.toContain("javascript:");
  });
});

describe("fb-pixel seo sanitiser", () => {
  it("keeps a valid pixel from either key shape", () => {
    expect(
      parseSiteSeo({ analytics: { facebookPixelId: PIXEL } }).analytics
        .facebookPixelId,
    ).toBe(PIXEL);
    expect(
      parseSiteSeo({ facebook_pixel_id: PIXEL }).analytics.facebookPixelId,
    ).toBe(PIXEL);
  });

  it("drops malformed stored IDs to empty (never reach markup)", () => {
    for (const bad of [
      "<script>alert(1)</script>",
      `${PIXEL}"><script>alert(1)</script>`,
      "1234567",
      "123456789012345678901",
      "97922469778527a",
      "abc",
    ]) {
      expect(
        parseSiteSeo({ analytics: { facebookPixelId: bad } }).analytics
          .facebookPixelId,
      ).toBe("");
      expect(
        parseSiteSeo({ facebook_pixel_id: bad }).analytics.facebookPixelId,
      ).toBe("");
    }
  });

  it("leaves the CAPI token and other analytics knobs untouched", () => {
    const settings = parseSiteSeo({
      analytics: {
        facebookPixelId: "<script>alert(1)</script>",
        facebookCapiToken: "CAPI_FIXTURE_TOKEN",
      },
    });
    expect(settings.analytics.facebookPixelId).toBe("");
    expect(settings.analytics.facebookCapiToken).toBe("CAPI_FIXTURE_TOKEN");
  });
});
