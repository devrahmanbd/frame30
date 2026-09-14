/**
 * Phase 5 — storefront delivery for Site Kit.
 *
 * Two rules decide everything here:
 *
 *  1. **Verification metas are SSR-safe and idempotent.** They belong in the
 *     document head (`siteKitHeadMeta` feeds the route's `head()`); the
 *     post-hydration pass below only repairs the case where a cached HTML
 *     document predates a newly added token, and it never duplicates a tag.
 *  2. **Analytics loaders are never inlined into the SSR document.** They are
 *     attached after paint, at idle, and only once the visitor has consented
 *     when the merchant left consent gating on (the default). No pixel may
 *     compete with LCP, and none may fire before consent.
 */
import { useEffect, useState } from "react";
import { tagPlan, verificationTags, type AnalyticsSettings, type VerificationSettings } from "@/lib/search-console";

export type StorefrontSiteKit = {
  verification: VerificationSettings;
  analytics: AnalyticsSettings;
};

const CONSENT_KEY = "fq.analytics.consent";

/** Repairs verification metas missing from an already-cached document. */
export function SiteVerification({ verification }: { verification: VerificationSettings }) {
  useEffect(() => {
    for (const tag of verificationTags(verification)) {
      if (document.querySelector(`meta[name="${CSS.escape(tag.name)}"]`)) continue;
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

/** Consent-gated, idle-time vendor loader. One script per vendor, once. */
export function AnalyticsTags({
  analytics,
  consented,
}: {
  analytics: AnalyticsSettings;
  consented: boolean;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    const plan = tagPlan(analytics);
    if (plan.length === 0) return;
    if (analytics.consentRequired && !consented) return;

    const attach = () => {
      for (const tag of plan) {
        if (!tag.src) continue;
        if (document.querySelector(`script[data-fq-tag="${tag.vendor}"]`)) continue;
        const el = document.createElement("script");
        el.async = true;
        el.src = tag.src;
        el.dataset["fqTag"] = tag.vendor;
        document.head.appendChild(el);
      }
      setDone(true);
    };

    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (idle) idle(attach);
    else window.setTimeout(attach, 1500);
  }, [analytics, consented, done]);

  return null;
}

/** Everything the storefront mounts for Site Kit. Never used on admin routes. */
export function SiteKitSurface({ siteKit }: { siteKit: StorefrontSiteKit | null }) {
  const consented = useAnalyticsConsent();
  if (!siteKit) return null;
  return (
    <>
      <SiteVerification verification={siteKit.verification} />
      <AnalyticsTags analytics={siteKit.analytics} consented={consented} />
    </>
  );
}
