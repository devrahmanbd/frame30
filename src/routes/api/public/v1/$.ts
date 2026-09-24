import { createFileRoute } from "@tanstack/react-router";

/**
 * Public REST API v1. Every concern (auth, scopes, rate limit, idempotency,
 * pagination, problem responses, metrics) lives in the gateway module so the
 * route stays a thin adapter.
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
  } catch {
    /* ignore */
  }
  return "*";
}

function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": getAllowedOrigin(request),
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":
      "authorization,content-type,idempotency-key",
    "access-control-max-age": "600",
    "access-control-allow-credentials": "true",
  };
}

async function dispatch(request: Request, splat: string | undefined) {
  const { handleApiRequest } = await import("@/lib/rest-gateway.server");
  const res = await handleApiRequest(request, splat ?? "");
  const headers = new Headers(res.headers);
  Object.entries(corsHeaders(request)).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
}

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      GET: async ({ request, params }) => dispatch(request, params._splat),
      POST: async ({ request, params }) => dispatch(request, params._splat),
      PATCH: async ({ request, params }) => dispatch(request, params._splat),
      DELETE: async ({ request, params }) => dispatch(request, params._splat),
    },
  },
});
