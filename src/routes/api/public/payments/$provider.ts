import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payments/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { rateLimit, rateLimitHeaders } = await import("@/lib/rate-limit.server");
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const verdict = await rateLimit("webhook.gateway", `${params.provider}:${ip}`);
        if (!verdict.allowed) {
          return Response.json(
            { status: "rate_limited", reason: null },
            { status: 429, headers: rateLimitHeaders(verdict) },
          );
        }
        const rawBody = await request.text();
        const signature = request.headers.get("x-webhook-signature");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { ingestWebhook } = await import("@/lib/gateway.server");
        const outcome = await ingestWebhook(
          supabaseAdmin as never,
          params.provider,
          rawBody,
          signature,
        );
        return Response.json(
          { status: outcome.status, reason: outcome.reason ?? null },
          { status: outcome.http, headers: rateLimitHeaders(verdict) },
        );
      },
    },
  },
});
