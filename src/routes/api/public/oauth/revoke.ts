import { createFileRoute } from "@tanstack/react-router";

/**
 * RFC 7009 token revocation. Always answers 200 — even for unknown tokens — so
 * the endpoint cannot be used to probe which tokens exist.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
};

export const Route = createFileRoute("/api/public/oauth/revoke")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const type = request.headers.get("content-type") ?? "";
        let token = "";
        if (type.includes("application/json")) {
          const body = (await request.json().catch(() => ({}))) as { token?: unknown };
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
        return new Response(null, { status: 200, headers: { ...CORS, "cache-control": "no-store" } });
      },
    },
  },
});
