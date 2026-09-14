/**
 * Live rail callback (`/api/public/payments/live/:provider`).
 *
 * SSLCommerz, aamarPay and bKash all POST (and sometimes GET) the shopper back
 * here. The handler never trusts the body: `settleLiveCallback` re-validates
 * with the provider and matches the amount before any order moves to paid.
 */
import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request, provider: string, redirect: boolean) {
  const { rateLimit, rateLimitHeaders } = await import("@/lib/rate-limit.server");
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const verdict = await rateLimit("webhook.gateway", `live:${provider}:${ip}`);
  if (!verdict.allowed) {
    return Response.json({ status: "rate_limited" }, { status: 429, headers: rateLimitHeaders(verdict) });
  }

  const body: Record<string, unknown> = {};
  const url = new URL(request.url);
  url.searchParams.forEach((v, k) => (body[k] = v));
  if (request.method === "POST") {
    const raw = await request.text();
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("json")) {
      try {
        Object.assign(body, JSON.parse(raw) as Record<string, unknown>);
      } catch {
        /* keep the query parameters we already read */
      }
    } else {
      new URLSearchParams(raw).forEach((v, k) => (body[k] = v));
    }
  }

  try {
    const { settleLiveCallback } = await import("@/lib/live-gateway.server");
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const result = await settleLiveCallback(provider, body, ip, headers);

    if (redirect && result.orderId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("access_token, merchant_id")
        .eq("id", result.orderId)
        .maybeSingle();
      const { data: merchant } = await supabaseAdmin
        .from("merchants")
        .select("slug")
        .eq("id", order?.merchant_id ?? "")
        .maybeSingle();
      const to = new URL(`/store/${merchant?.slug ?? ""}/order/${result.orderId}`, url.origin);
      if (order?.access_token) to.searchParams.set("t", order.access_token);
      to.searchParams.set("payment", result.status);
      return Response.redirect(to.toString(), 303);
    }
    return Response.json({ status: result.status }, { headers: rateLimitHeaders(verdict) });
  } catch (err) {
    const code = (err as { code?: string }).code ?? "live_gateway.failed";
    // A provider retries on non-2xx, which is what we want for a transient
    // failure; an unknown intent is permanent, so it is acknowledged.
    const permanent = code === "live_gateway.intent_missing" || code === "live_gateway.unsupported_provider";
    if (redirect) return Response.redirect(new URL("/", url.origin).toString(), 303);
    return Response.json({ status: "rejected", reason: code }, { status: permanent ? 200 : 502 });
  }
}

export const Route = createFileRoute("/api/public/payments/live/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handle(request, params.provider, new URL(request.url).searchParams.get("redirect") === "1"),
      GET: async ({ request, params }) => handle(request, params.provider, true),
    },
  },
});
