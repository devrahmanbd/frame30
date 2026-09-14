/**
 * Signed edge image transform endpoint — §4.4.
 *
 * Public by design (a storefront `<img>` cannot send a bearer token), so the
 * URL signature *is* the authorization: without it this route would be an open
 * proxy. Rate limiting is deliberately generous because a product page pulls
 * dozens of variants, but still bounded per client IP.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/img/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { serveTransform } = await import("@/lib/image-transform.server");
        const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit.server");

        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "anon";
        try {
          await enforceRateLimit("image.transform", ip.split(",")[0]!.trim());
        } catch (error) {
          if (error instanceof RateLimitError) {
            return new Response("rate_limited", {
              status: 429,
              headers: { "retry-after": "60", "cache-control": "no-store" },
            });
          }
          throw error;
        }

        const splat = (params as { _splat?: string })._splat ?? "";
        const outcome = await serveTransform(splat.split("/").filter(Boolean), request.headers.get("accept"));
        return outcome.response;
      },
    },
  },
});
