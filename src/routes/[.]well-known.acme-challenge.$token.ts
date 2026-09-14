import { createFileRoute } from "@tanstack/react-router";

/**
 * ACME http-01 responder.
 *
 * Certificate authorities fetch `http://<host>/.well-known/acme-challenge/<token>`
 * over plain HTTP with no auth, so this lives at the real well-known path (the
 * `[.]` escape keeps the leading dot literal) and answers for any hostname a
 * merchant has registered. The body is the key authorization the TLS edge
 * stored for that token; unknown or expired tokens get a flat 404.
 */
export const Route = createFileRoute("/.well-known/acme-challenge/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const host = (request.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
        const token = params.token;
        if (!host || !token || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
          return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
        }
        try {
          const { enforceRateLimit } = await import("@/lib/rate-limit.server");
          await enforceRateLimit("domains.acme", host);
          const { readChallenge } = await import("@/lib/domains.server");
          const value = await readChallenge(host, token);
          if (!value) {
            return new Response("Not found", {
              status: 404,
              headers: { "cache-control": "no-store" },
            });
          }
          const { incr } = await import("@/lib/observability.server");
          incr("framique_domain_acme_served_total");
          return new Response(value, {
            headers: { "content-type": "text/plain", "cache-control": "no-store" },
          });
        } catch {
          return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
