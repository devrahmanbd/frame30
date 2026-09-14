import { createFileRoute } from "@tanstack/react-router";

/**
 * Public REST API v1. Every concern (auth, scopes, rate limit, idempotency,
 * pagination, problem responses, metrics) lives in the gateway module so the
 * route stays a thin adapter.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,idempotency-key",
  "access-control-max-age": "600",
};

async function dispatch(request: Request, splat: string | undefined) {
  const { handleApiRequest } = await import("@/lib/rest-gateway.server");
  const res = await handleApiRequest(request, splat ?? "");
  const headers = new Headers(res.headers);
  Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
}

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => dispatch(request, params._splat),
      POST: async ({ request, params }) => dispatch(request, params._splat),
      PATCH: async ({ request, params }) => dispatch(request, params._splat),
      DELETE: async ({ request, params }) => dispatch(request, params._splat),
    },
  },
});
