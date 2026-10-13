import { createFileRoute } from "@tanstack/react-router";

/**
 * Prometheus scrape target. Guarded by METRICS_TOKEN; with no token configured
 * the endpoint stays closed (404) so an unconfigured deploy exposes nothing.
 * The token compare is constant-time and scrapes are rate limited per IP so
 * the secret cannot be brute-forced byte by byte or at line rate.
 */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clientIp(request: Request): string {
  const header =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "";
  return header.split(",")[0]!.trim().slice(0, 64) || "unknown";
}

export const Route = createFileRoute("/api/public/metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = process.env["METRICS_TOKEN"];
        if (!token) return new Response("Not found", { status: 404 });
        const { rateLimit, rateLimitHeaders } =
          await import("@/lib/rate-limit.server");
        const verdict = await rateLimit(
          "ops.status",
          `metrics:${clientIp(request)}`,
        );
        if (!verdict.allowed) {
          return new Response("Rate limited", {
            status: 429,
            headers: {
              ...rateLimitHeaders(verdict),
              "cache-control": "no-store",
            },
          });
        }
        const auth = request.headers.get("authorization") ?? "";
        if (!safeEqual(auth, `Bearer ${token}`))
          return new Response("Unauthorized", { status: 401 });
        const { renderPrometheus } = await import("@/lib/observability.server");
        return new Response(renderPrometheus(), {
          headers: {
            "content-type": "text/plain; version=0.0.4",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
