import { createFileRoute } from "@tanstack/react-router";

/**
 * Prometheus scrape target. Guarded by METRICS_TOKEN; with no token configured
 * the endpoint stays closed (404) so an unconfigured deploy exposes nothing.
 */
export const Route = createFileRoute("/api/public/metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = process.env["METRICS_TOKEN"];
        if (!token) return new Response("Not found", { status: 404 });
        const auth = request.headers.get("authorization");
        if (auth !== `Bearer ${token}`) return new Response("Unauthorized", { status: 401 });
        const { renderPrometheus } = await import("@/lib/observability.server");
        return new Response(renderPrometheus(), {
          headers: { "content-type": "text/plain; version=0.0.4", "cache-control": "no-store" },
        });
      },
    },
  },
});
