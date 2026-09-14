import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Storefront beacon collector.
 *
 * Public by design (a shopper is not signed in) but never trusted: the body is
 * schema-validated, capped at 50 events, rate limited per store, stripped of
 * PII, and pseudonymized before it reaches the raw store. Clients can only
 * report that something happened — every number a merchant sees is computed
 * server-side from these rows.
 */
const beaconSchema = z.object({
  merchantId: z.string().uuid(),
  events: z
    .array(
      z.object({
        entity: z.enum(["page", "product", "cart", "checkout", "order", "search"]),
        action: z.string().trim().min(1).max(40),
        occurredAt: z.string().datetime().optional(),
        source: z.string().trim().max(60).optional(),
        campaign: z.string().trim().max(60).optional(),
        valueMinorInt: z.number().int().min(0).max(1_000_000_000).optional(),
        currencyCode: z.string().trim().length(3).optional(),
        payload: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
        dedupeKey: z.string().trim().min(4).max(120).optional(),
      }),
    )
    .min(1)
    .max(50),
  visitorId: z.string().trim().min(4).max(80).optional(),
  sessionId: z.string().trim().min(4).max(80).optional(),
});

export const Route = createFileRoute("/api/public/analytics/beacon")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method not allowed", {
          status: 405,
          headers: { allow: "POST", "cache-control": "no-store" },
        }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = beaconSchema.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid_payload" }, { status: 400 });
        }

        const { rateLimit, rateLimitHeaders } = await import("@/lib/rate-limit.server");
        const verdict = await rateLimit("analytics.beacon", parsed.merchantId);
        if (!verdict.allowed) {
          return Response.json(
            { error: "rate_limited" },
            { status: 429, headers: { ...rateLimitHeaders(verdict), "cache-control": "no-store" } },
          );
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { ingestBeacons } = await import("@/lib/analytics-warehouse.server");
          // Location and device are resolved here, from the request itself —
          // never accepted from the browser, which a shopper controls.
          const { requestGeo } = await import("@/lib/geo.server");
          const geo = await requestGeo(request);
          const result = await ingestBeacons(
            supabaseAdmin as never,
            parsed.merchantId,
            parsed.events.map((event) => ({
              ...event,
              visitorRaw: parsed.visitorId ?? null,
              sessionRaw: parsed.sessionId ?? null,
            })),
            geo,
          );
          return Response.json(result, {
            headers: { ...rateLimitHeaders(verdict), "cache-control": "no-store" },
          });
        } catch (err) {
          const { captureError } = await import("@/lib/observability.server");
          void captureError(err, { route: "analytics.beacon" });
          return Response.json({ error: "ingest_failed" }, { status: 500 });
        }
      },
    },
  },
});
