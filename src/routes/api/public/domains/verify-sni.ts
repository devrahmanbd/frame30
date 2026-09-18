import { createFileRoute } from "@tanstack/react-router";
import { normalizeHostname } from "@/lib/domains";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Edge SNI Whitelist Verification Endpoint.
 *
 * Queried by OpenResty (lua-resty-acme domain_whitelist_callback) before requesting
 * a Let's Encrypt certificate for a custom domain.
 *
 * This prevents SNI rate-limit exhaustion attacks where attackers connect with
 * thousands of arbitrary hostnames to exhaust Let's Encrypt certificates quotas.
 */
const NEGATIVE_CACHE = new Map<string, number>();

function cleanNegativeCache() {
  if (NEGATIVE_CACHE.size > 5000) {
    const now = Date.now();
    for (const [k, exp] of NEGATIVE_CACHE.entries()) {
      if (exp <= now) NEGATIVE_CACHE.delete(k);
    }
  }
}

export const Route = createFileRoute("/api/public/domains/verify-sni")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawHost = url.searchParams.get("host");

        if (!rawHost) {
          return Response.json(
            { allowed: false, error: "missing_host" },
            { status: 400 },
          );
        }

        let hostname: string;
        try {
          hostname = normalizeHostname(rawHost);
        } catch {
          return Response.json(
            { allowed: false, error: "invalid_hostname" },
            { status: 400 },
          );
        }

        // Platform root and system domains are always allowed
        if (
          hostname === "framique.store" ||
          hostname === "framique.com" ||
          hostname === "edge.framique.store" ||
          hostname === "localhost" ||
          hostname.endsWith(".framique.store") ||
          hostname.endsWith(".framique.com") ||
          hostname.endsWith(".framique.app")
        ) {
          return Response.json(
            { allowed: true, hostname, isPlatform: true },
            { status: 200 },
          );
        }

        // Rate limit by client IP (REPORT WF-15)
        const clientIp =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-real-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "127.0.0.1";

        try {
          const { enforceRateLimit } = await import("@/lib/rate-limit.server");
          await enforceRateLimit("domains.acme", clientIp);
        } catch {
          return Response.json(
            { allowed: false, error: "rate_limit_exceeded" },
            { status: 429, headers: { "Cache-Control": "no-store" } },
          );
        }

        // Negative cache check to prevent repeated DB enumeration hits
        cleanNegativeCache();
        const cachedExp = NEGATIVE_CACHE.get(hostname);
        if (cachedExp && cachedExp > Date.now()) {
          return Response.json(
            { allowed: false, error: "domain_not_registered" },
            { status: 404, headers: { "Cache-Control": "public, max-age=15" } },
          );
        }

        // Check if custom domain exists and is in a valid state
        try {
          const { data: domain, error } = await supabaseAdmin
            .from("merchant_domains")
            .select("id, hostname, status, cert_status")
            .eq("hostname", hostname)
            .maybeSingle();

          if (error || !domain) {
            NEGATIVE_CACHE.set(hostname, Date.now() + 15_000);
            return Response.json(
              { allowed: false, error: "domain_not_registered" },
              {
                status: 404,
                headers: { "Cache-Control": "public, max-age=15" },
              },
            );
          }

          // Allowed if verified, active, or currently issuing
          const isAllowedState =
            domain.status === "dns_verified" ||
            domain.status === "issuing_cert" ||
            domain.status === "active";

          if (!isAllowedState) {
            return Response.json(
              { allowed: false, error: `domain_state_${domain.status}` },
              { status: 403 },
            );
          }

          return Response.json(
            {
              allowed: true,
              hostname: domain.hostname,
              domainId: domain.id,
              status: domain.status,
            },
            {
              status: 200,
              headers: { "Cache-Control": "public, max-age=60" },
            },
          );
        } catch {
          return Response.json(
            { allowed: false, error: "internal_error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
