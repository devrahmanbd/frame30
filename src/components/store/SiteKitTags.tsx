/**
 * Phase 5 — storefront delivery for Site Kit.
 *
 * Three rules decide everything here:
 *
 *  1. **Verification metas are SSR-safe and idempotent.** They belong in the
 *     document head (`siteKitHeadMeta` feeds the route's `head()`); the
 *     post-hydration pass below only repairs the case where a cached HTML
 *     document predates a newly added token, and it never duplicates a tag.
 *  2. **Analytics loaders are never inlined into the SSR document.** They are
 *     attached after paint, at idle, and only once the visitor has consented
 *     when the merchant left consent gating on (the default). No pixel may
 *     compete with LCP, and none may fire before consent.
 *  3. **Custom-domain gate (belt and suspenders).** The server already strips
 *     analytics IDs on slug-based storefronts; `SiteKitSurface` also refuses
 *     to mount `AnalyticsTags` when `hasCustomDomain` is false so that a stale
 *     CDN edge cache cannot accidentally deliver IDs that the server would now
 *     withhold.
 */
import { useEffect, useState } from "react";
import {
  tagPlan,
  verificationTags,
  type AnalyticsSettings,
  type VerificationSettings,
} from "@/lib/search-console";

/**
 * Storefront projection of Site Kit settings.
 *
 * `hasCustomDomain` is always false on shared slug storefronts — `AnalyticsTags`
 * must not fire in that case. `botProtection` enables the Cloudflare Turnstile
 * loader so individual form components can call `window.turnstile.render()`.
 */
export type StorefrontSiteKit = {
  verification: VerificationSettings;
  analytics: AnalyticsSettings;
  /** False on framique.qubickle.com/store/<slug> — tags must not fire there. */
  hasCustomDomain: boolean;
  /** Merchant-enabled bot protection via Cloudflare Turnstile. */
  botProtection: boolean;
};

const CONSENT_KEY = "fq.analytics.consent";

/** Cloudflare Turnstile CDN — loaded once when the merchant enables bot protection. */
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/** Repairs verification metas missing from an already-cached document. */
export function SiteVerification({
  verification,
}: {
  verification: VerificationSettings;
}) {
  useEffect(() => {
    for (const tag of verificationTags(verification)) {
      if (document.querySelector(`meta[name="${CSS.escape(tag.name)}"]`))
        continue;
      const el = document.createElement("meta");
      el.setAttribute("name", tag.name);
      el.setAttribute("content", tag.content);
      document.head.appendChild(el);
    }
  }, [verification]);
  return null;
}

/** Reads the visitor's stored analytics consent for this browser. */
export function useAnalyticsConsent(): boolean {
  const [consented, setConsented] = useState(false);
  useEffect(() => {
    try {
      setConsented(window.localStorage.getItem(CONSENT_KEY) === "granted");
    } catch {
      setConsented(false);
    }
  }, []);
  return consented;
}

/**
 * Writes the visitor's analytics consent choice to localStorage.
 * Call with `true` (grant) or `false` (deny) from a consent banner.
 */
export function setAnalyticsConsent(granted: boolean): void {
  try {
    if (granted) {
      window.localStorage.setItem(CONSENT_KEY, "granted");
    } else {
      window.localStorage.removeItem(CONSENT_KEY);
    }
  } catch {
    // Storage blocked — silently ignore, consent defaults to false.
  }
}

/**
 * Consent-gated, idle-time vendor loader. One script per vendor, once.
 *
 * Belt-and-suspenders: only runs when `hasCustomDomain` is true. The server
 * already strips IDs on slug storefronts; this prevents a stale cached HTML
 * snapshot from re-injecting tags the server would now gate.
 */
export function AnalyticsTags({
  analytics,
  consented,
  hasCustomDomain,
}: {
  analytics: AnalyticsSettings;
  consented: boolean;
  hasCustomDomain: boolean;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Primary gate: never fire tags on slug-based storefronts.
    if (!hasCustomDomain) return;
    if (done) return;
    const plan = tagPlan(analytics);
    if (plan.length === 0) return;
    if (analytics.consentRequired && !consented) return;

    const attach = () => {
      for (const tag of plan) {
        if (!tag.src) continue;
        if (document.querySelector(`script[data-fq-tag="${tag.vendor}"]`))
          continue;
        const el = document.createElement("script");
        el.async = true;
        el.src = tag.src;
        el.dataset["fqTag"] = tag.vendor;
        document.head.appendChild(el);
      }
      setDone(true);
    };

    const idle = (
      window as unknown as { requestIdleCallback?: (cb: () => void) => number }
    ).requestIdleCallback;
    if (idle) idle(attach);
    else window.setTimeout(attach, 1500);
  }, [analytics, consented, done, hasCustomDomain]);

  return null;
}

/**
 * Loads the Cloudflare Turnstile script when the merchant has enabled bot
 * protection. The script is loaded with `defer` and `async` so it never
 * blocks the critical rendering path. Individual form components call
 * `window.turnstile.render()` to place the widget.
 */
export function TurnstileLoader() {
  useEffect(() => {
    if (document.querySelector(`script[data-fq-tag="turnstile"]`)) return;
    const el = document.createElement("script");
    el.src = TURNSTILE_SRC;
    el.async = true;
    el.defer = true;
    el.dataset["fqTag"] = "turnstile";
    document.head.appendChild(el);
  }, []);
  return null;
}

/** Everything the storefront mounts for Site Kit. Never used on admin routes. */
export function SiteKitSurface({
  siteKit,
}: {
  siteKit: StorefrontSiteKit | null;
}) {
  const consented = useAnalyticsConsent();
  if (!siteKit) return null;
  return (
    <>
      <SiteVerification verification={siteKit.verification} />
      {/* Analytics: only fires on verified custom-domain storefronts */}
      <AnalyticsTags
        analytics={siteKit.analytics}
        consented={consented}
        hasCustomDomain={siteKit.hasCustomDomain}
      />
      {/* Bot protection: merchant-toggled Cloudflare Turnstile loader */}
      {siteKit.botProtection && <TurnstileLoader />}
    </>
  );
}
