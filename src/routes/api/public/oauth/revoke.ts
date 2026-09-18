import { createFileRoute } from "@tanstack/react-router";

/**
 * RFC 7009 token revocation. Always answers 200 — even for unknown tokens — so
 * the endpoint cannot be used to probe which tokens exist.
 */
function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (!origin) return "*";
  try {
    const { hostname } = new URL(origin);
    if (
      hostname.endsWith(".framique.store") ||
      hostname.endsWith(".framique.com") ||
      hostname === "framique.qubickle.com" ||
      hostname === "localhost"
    ) {
      return origin;
    }
  } catch { /* ignore */ }
  return "*";
}

function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": getAllowedOrigin(request),
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-credentials": "true",
  };
}

export const Route = createFileRoute("/api/public/oauth/revoke")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: async ({ request }) => {
        const type = request.headers.get("content-type") ?? "";
        let token = "";
        if (type.includes("application/json")) {
          const body = (await request.json().catch(() => ({}))) as {
            token?: unknown;
          };
          token = typeof body.token === "string" ? body.token : "";
        } else {
          const form = await request.formData().catch(() => null);
          const value = form?.get("token");
          token = typeof value === "string" ? value : "";
        }
        if (token) {
          try {
            const { revokeToken } = await import("@/lib/oauth.server");
            await revokeToken(token);
          } catch (err) {
            const { captureError } = await import("@/lib/observability.server");
            void captureError(err, { route: "oauth.revoke" });
          }
        }
        return new Response(null, {
          status: 200,
          headers: { ...corsHeaders(request), "cache-control": "no-store" },
        });
      },
    },
  },
});
