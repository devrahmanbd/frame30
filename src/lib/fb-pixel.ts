/**
 * Meta (Facebook) Pixel — client-safe pure helpers.
 *
 * Single source of truth for the browser pixel snippet (fbq stub + init +
 * PageView) and the `^\d{8,20}$` pixel-ID shape. Everything here is
 * deterministic and dependency-free (apart from the Site Kit ID pattern it
 * mirrors), so the storefront component, the SEO sanitiser and the CAPI
 * queue wrapper all share one validator and one snippet template instead of
 * three drifting copies.
 *
 * Hermetic: pure string building + pattern tests only. No fetch, no Supabase,
 * no clock. Pixel IDs appearing in tests are fixture data, never transmitted.
 */

import { ANALYTICS_SPEC } from "./search-console";

/** Canonical Meta pixel-ID shape — mirrors `ANALYTICS_SPEC.meta`. */
export const FB_PIXEL_PATTERN = ANALYTICS_SPEC.meta.pattern;

/** Allowlisted Meta loader host (package-review.ts:328-331). */
export const META_LOADER_HOST = "connect.facebook.net";

/** Meta CAPI host — the only host the server transport may address. */
export const META_CAPI_HOST = "graph.facebook.com";

export type MetaPixelSkipReason = "pixel_not_configured" | "pixel_id_invalid";

export type MetaPixelRender =
  | { skipped: false; pixelId: string; script: string; noscript: string }
  | { skipped: true; reason: MetaPixelSkipReason };

/**
 * Digits-only pixel check shared by render, SEO sanitising and CAPI gating.
 * Trims first so `" 123… "` and empty/blank values resolve the same way at
 * every call site. Anything that could break out of markup
 * (`< > " ' & ` /` letters, spaces) fails and is never interpolated.
 */
export function isValidFacebookPixelId(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  return FB_PIXEL_PATTERN.test(raw.trim());
}

/**
 * Inline fbq stub + init + PageView body. Call ONLY with a validated
 * digits-only ID — the caller (`renderMetaPixelSnippet` / the storefront
 * component) validates first; this builder does not re-check.
 */
export function metaPixelScriptBody(pixelId: string): string {
  const id = encodeURIComponent(pixelId);
  return (
    `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){` +
    `n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};` +
    `if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];` +
    `t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];` +
    `s.parentNode.insertBefore(t,s)}(window,document,'script',` +
    `'https://${META_LOADER_HOST}/en_US/fbevents.js');` +
    `fbq('init','${id}');fbq('track','PageView');`
  );
}

/** No-JS fallback beacon URL (raw `&` — callers targeting HTML escape it). */
export function metaPixelNoscriptUrl(pixelId: string): string {
  const id = encodeURIComponent(pixelId);
  return `https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`;
}

/**
 * Build the browser pixel snippet for one tenant's storefront.
 * Returns `{ skipped: true, reason }` instead of throwing so callers can
 * degrade silently (missing/invalid config must never break rendering).
 */
export function renderMetaPixelSnippet(raw: unknown): MetaPixelRender {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { skipped: true, reason: "pixel_not_configured" };
  // Digits-only by construction: anything that could break out of markup
  // (< > " ' & ` / letters) fails the pattern and is never interpolated.
  if (!FB_PIXEL_PATTERN.test(text))
    return { skipped: true, reason: "pixel_id_invalid" };
  const script = `<script>${metaPixelScriptBody(text)}</script>`;
  const noscript =
    `<noscript><img height="1" width="1" style="display:none" ` +
    `src="${metaPixelNoscriptUrl(text).replace(/&/g, "&amp;")}" /></noscript>`;
  return { skipped: false, pixelId: text, script, noscript };
}
