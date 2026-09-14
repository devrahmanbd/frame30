import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MAX_BATCH, VITAL_METRICS } from "@/lib/vitals-report";
import { MAX_BODY_BYTES } from "@/lib/vitals.server";

/**
 * Phase 4.4 — real-user vitals collector.
 *
 * Public by necessity (a shopper is never signed in) and therefore treated as
 * hostile input at every step: the body length is checked before it is read,
 * the payload is schema-validated, the caller is rate limited per store *and*
 * per IP, and the ingest path itself clamps every value. The response is
 * always small and `no-store`, and it is `202` on success because the write is
 * best-effort telemetry — a shopper's page must never be told that our
 * analytics table was busy.
 */
const sampleSchema = z.object({
  metric: z.enum(VITAL_METRICS),
  value: z.number().finite().min(0),
  template: z.string().trim().max(40).optional(),
  path: z.string().trim().max(200).optional(),
  locale: z.enum(["en", "bn"]).optional(),
  device: z.enum(["mobile", "tablet", "desktop", "unknown"]).optional(),
  connection: z.string().trim().max(20).optional(),
  ts: z.number().finite().optional(),
});

const bodySchema = z.object({
  merchantId: z.string().uuid(),
  samples: z.array(sampleSchema).min(1).max(MAX_BATCH),
});

function clientIp(request: Request): string | null {
  const header =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  if (!header) return null;
  return header.split(",")[0]!.trim().slice(0, 64) || null;
}

const NO_STORE = { "cache-control": "no-store" } as const;

export const Route = createFileRoute("/api/public/vitals")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method not allowed", { status: 405, headers: { allow: "POST", ...NO_STORE } }),

      POST: async ({ request }) => {
        // Cheapest possible rejection first: a declared body over the ceiling
        // never gets parsed.
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
          return Response.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
        }

        let raw: string;
        try {
          raw = await request.text();
        } catch {
          return Response.json({ error: "unreadable_body" }, { status: 400, headers: NO_STORE });
        }
        if (raw.length > MAX_BODY_BYTES) {
          return Response.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
        }

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(JSON.parse(raw));
        } catch {
          return Response.json({ error: "invalid_payload" }, { status: 400, headers: NO_STORE });
        }

        const { rateLimit, rateLimitHeaders } = await import("@/lib/rate-limit.server");
        const store = await rateLimit("vitals.ingest", parsed.merchantId);
        if (!store.allowed) {
          return Response.json(
            { error: "rate_limited" },
            { status: 429, headers: { ...rateLimitHeaders(store), ...NO_STORE } },
          );
        }
        const ip = clientIp(request);
        if (ip) {
          const perIp = await rateLimit("vitals.ingest_ip", `${parsed.merchantId}:${ip}`);
          if (!perIp.allowed) {
            return Response.json(
              { error: "rate_limited" },
              { status: 429, headers: { ...rateLimitHeaders(perIp), ...NO_STORE } },
            );
          }
        }

        try {
          const { ingestVitals } = await import("@/lib/vitals.server");
          const result = await ingestVitals(parsed.samples, {
            merchantId: parsed.merchantId,
            ip,
            userAgent: request.headers.get("user-agent"),
          });
          return Response.json(result, {
            status: 202,
            headers: { ...rateLimitHeaders(store), ...NO_STORE },
          });
        } catch (err) {
          // Should be unreachable — ingestVitals never throws — but telemetry
          // must not be able to 500 a storefront even if that changes.
          const { captureError } = await import("@/lib/observability.server");
          void captureError(err, { route: "public.vitals" });
          return Response.json({ accepted: 0, degraded: true }, { status: 202, headers: NO_STORE });
        }
      },
    },
  },
});
