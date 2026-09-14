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
export const Route = createFileRoute("/api/public/domains/verify-sni")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawHost = url.searchParams.get("host");

        if (!rawHost) {
          return Response.json({ allowed: false, error: "missing_host" }, { status: 400 });
        }

        let hostname: string;
        try {
          hostname = normalizeHostname(rawHost);
        } catch {
          return Response.json({ allowed: false, error: "invalid_hostname" }, { status: 400 });
        }

        // Platform root and system domains are always allowed
        if (
          hostname === "framique.com" ||
          hostname === "edge.framique.app" ||
          hostname === "localhost" ||
          hostname.endsWith(".framique.app") ||
          hostname.endsWith(".framique.com")
        ) {
          return Response.json({ allowed: true, hostname, isPlatform: true }, { status: 200 });
        }

        // Check if custom domain exists and is in a valid state
        try {
          const { data: domain, error } = await supabaseAdmin
            .from("merchant_domains")
            .select("id, hostname, status, cert_status")
            .eq("hostname", hostname)
            .maybeSingle();

          if (error || !domain) {
            return Response.json({ allowed: false, error: "domain_not_registered" }, { status: 404 });
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
          return Response.json({ allowed: false, error: "internal_error" }, { status: 500 });
        }
      },
    },
  },
});
