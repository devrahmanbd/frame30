/**
 * Tenant-aware CSRF origin validator — Phase 0.5 [A].
 *
 * The naive `origin === host` check in `server.ts` correctly handles:
 *   - Same-origin requests from the platform apex
 *   - Wildcard subdomain requests (<slug>.framique.store) when x-forwarded-host
 *     is set by OpenResty before it reaches Nitro
 *   - Merchant custom domains when x-forwarded-host is the custom domain
 *
 * But it INCORRECTLY blocks:
 *   1. Payment gateway POST-back return URLs (bKash / Nagad / SSLCOMMERZ etc.
 *      POST to /store/<slug>/checkout/... from gateway.bkash.com origin).
 *   2. Any edge scenario where origin and host diverge across Framique-controlled
 *      infrastructure (multi-region, canary, preview environments).
 *
 * This module centralises that decision so `server.ts` stays thin.
 *
 * ⚠  Section-A obligations:
 *   - This function must never accept an arbitrary origin.
 *   - The payment-gateway whitelist is an explicit allow-list, not a substring match.
 *   - Custom-domain trust is validated against the `merchant_domains` DB table at
 *     runtime (with a short TTL cache) — not derived from the incoming request.
 */

import { cached } from "./cache.server";

/** All Framique platform suffixes that are always trusted. */
const PLATFORM_SUFFIXES = [
  ".framique.store",
  ".framique.com",
  ".framique.app",
] as const;

const PLATFORM_APEXES = new Set([
  "framique.store",
  "framique.com",
  "framique.app",
]);

/**
 * Payment-gateway return-URL origins.
 * These origins are trusted only for the specific payment callback paths
 * (`/api/public/payments/*`) — enforced by the caller in `server.ts`.
 *
 * Sources: provider integration docs (verified 2026-09-01).
 */
export const PAYMENT_GATEWAY_ORIGINS = new Set([
  // bKash
  "checkout.sandbox.bka.sh",
  "checkout.bka.sh",
  "tokenized.sandbox.bka.sh",
  "tokenized.bka.sh",
  // Nagad
  "sandbox.nagad.com.bd",
  "api.mynagad.com",
  "nagad.com.bd",
  // SSLCOMMERZ
  "sandbox.sslcommerz.com",
  "securepay.sslcommerz.com",
  // aamarPay
  "secure.aamarpay.com",
  "sandbox.aamarpay.com",
  // ShurjoPay
  "sandbox.shurjopayment.com",
  "engine.shurjopayment.com",
  // PortWallet
  "sandbox.portwallet.com",
  "app.portwallet.com",
  // Upay
  "pg.upaybd.com",
  // Tap
  "api.tapcash.me",
]);

/** Paths that accept gateway POST-back requests. */
export const PAYMENT_CALLBACK_PATH_PREFIX = "/api/public/payments/";

/**
 * Returns true when the incoming origin is trusted for this request.
 *
 * @param requestHost   The effective server hostname (from x-forwarded-host or host header).
 * @param originHost    The hostname from the `Origin` header.
 * @param pathname      The request path (used for payment gateway scoping).
 * @param lookupCustomDomain  Async resolver that checks if `originHost` is a
 *                            merchant-registered active custom domain.
 */
export async function isTrustedCsrfOrigin({
  requestHost,
  originHost,
  pathname,
  lookupCustomDomain,
}: {
  requestHost: string;
  originHost: string;
  pathname: string;
  lookupCustomDomain: (hostname: string) => Promise<boolean>;
}): Promise<boolean> {
  // 1. Exact match: origin and request host are the same — always trusted.
  if (originHost === requestHost) return true;

  // 2. Platform apex or subdomain.
  if (PLATFORM_APEXES.has(originHost)) return true;
  for (const suffix of PLATFORM_SUFFIXES) {
    if (originHost.endsWith(suffix)) return true;
  }

  // 3. Payment gateway return POST — only on the payment callback path subtree.
  if (
    pathname.startsWith(PAYMENT_CALLBACK_PATH_PREFIX) &&
    PAYMENT_GATEWAY_ORIGINS.has(originHost)
  ) {
    return true;
  }

  // 4. Merchant custom domain registered in the platform's domain table.
  //    Uses a 30-second cache to avoid a DB hit on every mutation request.
  return lookupCustomDomain(originHost);
}

/**
 * Production resolver: checks `merchant_domains` for an `active` domain
 * matching the hostname.
 *
 * Wrapped in a 30-second TTL cache per hostname; the cache key includes the
 * hostname so different merchants never share an entry.
 */
export async function lookupActiveMerchantDomain(
  hostname: string,
): Promise<boolean> {
  const cacheKey = `csrf:custom-domain:${hostname}`;
  return cached(cacheKey, 30, async () => {
    try {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("merchant_domains")
        .select("id, status")
        .eq("hostname", hostname)
        .eq("status", "active")
        .maybeSingle();
      return data !== null;
    } catch {
      // Fail closed: if the DB is unreachable we refuse the ambiguous origin.
      return false;
    }
  });
}
