import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  BEACON_MAX_BODY_BYTES,
  checkTimestamp,
  isBodyWithinLimit,
  isJsonContentType,
  isOriginAllowed,
  isValidNonce,
  rejectionStatus,
  safeLandingPath,
  safeReferrerHost,
  signaturePayload,
  timingSafeEqualHex,
  type BeaconRejection,
} from "@/lib/beacon-guard";

/**
 * Storefront ad-click collector (§4.2), hardened.
 *
 * Public by necessity — the shopper is anonymous — and therefore treated as
 * hostile input. The order of checks is deliberate: cheap, allocation-free
 * rejections first (method, media type, size), then per-IP throttling, then
 * parsing, then freshness/signature, then the durable replay claim, and only
 * then the expensive scoring path. That way a flood costs an attacker far more
 * than it costs us.
 *
 * The response never reveals score reasoning; it only acknowledges receipt so
 * an attacker cannot tune around the model.
 */
const clickSchema = z.object({
  merchantId: z.string().uuid(),
  network: z.string().trim().min(1).max(20),
  campaign: z.string().trim().max(120).optional(),
  adset: z.string().trim().max(120).optional(),
  creative: z.string().trim().max(120).optional(),
  clickId: z.string().trim().max(200).optional(),
  landingPath: z.string().trim().max(300).optional(),
  referrerHost: z.string().trim().max(200).optional(),
  javascriptRan: z.boolean().default(true),
  automationHints: z.number().int().min(0).max(20).optional(),
  dwellMs: z.number().int().min(0).max(3_600_000).optional(),
  interactions: z.number().int().min(0).max(10_000).optional(),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  visitorId: z.string().trim().min(4).max(80),
  nonce: z.string().trim().min(16).max(64),
  sentAt: z.number().int().positive(),
  signature: z.string().trim().regex(/^[0-9a-f]{64}$/).optional(),
});

const ROUTE = "ads.click";

function clientIp(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? "0.0.0.0").trim();
}

function noStore(extra: Record<string, string> = {}) {
  return { "cache-control": "no-store", ...extra };
}

async function reject(reason: BeaconRejection, extraHeaders: Record<string, string> = {}) {
  const { incr } = await import("@/lib/observability.server");
  incr("framique_ad_click_rejected_total", { reason });
  return Response.json({ error: reason }, { status: rejectionStatus(reason), headers: noStore(extraHeaders) });
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/public/ads/click")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method not allowed", { status: 405, headers: noStore({ allow: "POST" }) }),
      POST: async ({ request }) => {
        const { withRequestTrace } = await import("@/lib/observability.server");
        return withRequestTrace("ads.click", request, async () => {
          const {
            addBreadcrumb,
            captureError,
            incr,
            observe,
            setTraceTag,
          } = await import("@/lib/observability.server");

          if (!isJsonContentType(request.headers.get("content-type"))) {
            return reject("unsupported_media_type");
          }
          if (
            request.headers.get("content-length") &&
            Number(request.headers.get("content-length")) > BEACON_MAX_BODY_BYTES
          ) {
            return reject("payload_too_large");
          }

          const { rateLimit, rateLimitHeaders } = await import("@/lib/rate-limit.server");

          // Charge the source address before any parsing so a flood never
          // reaches the JSON parser, let alone the database.
          const ip = clientIp(request);
          const ipVerdict = await rateLimit("ads.click_ip", `edge:${ip}`);
          if (!ipVerdict.allowed) return reject("rate_limited", rateLimitHeaders(ipVerdict));

          const raw = await request.text();
          if (!isBodyWithinLimit(request.headers.get("content-length"), new TextEncoder().encode(raw).length)) {
            return reject("payload_too_large");
          }

          let parsed: z.infer<typeof clickSchema>;
          try {
            parsed = clickSchema.parse(JSON.parse(raw));
          } catch {
            return reject("invalid_payload");
          }

          setTraceTag("merchant", parsed.merchantId);
          setTraceTag("network", parsed.network);

          if (!isValidNonce(parsed.nonce)) return reject("invalid_nonce");

          const freshness = checkTimestamp(parsed.sentAt);
          if (freshness !== "ok") return reject(freshness);

          const merchantVerdict = await rateLimit("ads.click", parsed.merchantId);
          if (!merchantVerdict.allowed) return reject("rate_limited", rateLimitHeaders(merchantVerdict));

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { beaconPolicy } = await import("@/lib/ad-fraud.server");
          const policy = await beaconPolicy(supabaseAdmin as never, parsed.merchantId);
          if (!policy.exists) return reject("unknown_merchant");

          // Origin allowlisting only engages once a merchant has declared its
          // storefront hosts, so an unconfigured store keeps working.
          if (!isOriginAllowed(request.headers.get("origin"), policy.allowedOrigins)) {
            return reject("origin_not_allowed");
          }

          if (policy.beaconSecret) {
            const expected = await hmacHex(
              policy.beaconSecret,
              signaturePayload({
                merchantId: parsed.merchantId,
                nonce: parsed.nonce,
                sentAt: parsed.sentAt,
                visitorId: parsed.visitorId,
                network: parsed.network,
              }),
            );
            if (!parsed.signature || !timingSafeEqualHex(parsed.signature, expected)) {
              return reject("invalid_signature");
            }
          }

          const { claimIdempotency, completeIdempotency, hashRequest, releaseIdempotency } = await import(
            "@/lib/replay-guard.server"
          );
          const requestHash = await hashRequest(raw);
          // The header wins when a client retries a network failure; otherwise
          // the beacon nonce is the natural single-use token.
          const idemKey = (request.headers.get("idempotency-key") ?? parsed.nonce).slice(0, 64);

          let claim;
          try {
            claim = await claimIdempotency(supabaseAdmin as never, {
              merchantId: parsed.merchantId,
              route: ROUTE,
              key: idemKey,
              requestHash,
            });
          } catch (err) {
            void captureError(err, { route: ROUTE, stage: "idempotency" });
            return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: noStore() });
          }

          if (claim.status === "conflict") {
            incr("framique_ad_click_rejected_total", { reason: "idempotency_conflict" });
            return Response.json({ error: "idempotency_conflict" }, { status: 409, headers: noStore() });
          }
          if (claim.status === "replay") {
            incr("framique_ad_click_replay_total", { source: "idempotency" });
            return Response.json(claim.response ?? { ok: true, duplicate: true }, {
              status: claim.httpStatus,
              headers: noStore({ "idempotent-replay": "true", ...rateLimitHeaders(merchantVerdict) }),
            });
          }

          const started = Date.now();
          try {
            const { ingestClick } = await import("@/lib/ad-fraud.server");
            addBreadcrumb("ads", "beacon accepted", { network: parsed.network });

            const result = await ingestClick(
              supabaseAdmin as never,
              parsed.merchantId,
              {
                network: parsed.network,
                campaign: parsed.campaign ?? null,
                adset: parsed.adset ?? null,
                creative: parsed.creative ?? null,
                clickId: parsed.clickId ?? null,
                landingPath: safeLandingPath(parsed.landingPath),
                referrerHost: safeReferrerHost(parsed.referrerHost),
                userAgent: (request.headers.get("user-agent") ?? "").slice(0, 400),
                ipRaw: ip,
                visitorRaw: parsed.visitorId,
                javascriptRan: parsed.javascriptRan,
                automationHints: parsed.automationHints ?? 0,
                dwellMs: parsed.dwellMs ?? 0,
                interactions: parsed.interactions ?? 0,
                visitorCountry: request.headers.get("cf-ipcountry"),
                timezoneOffsetMinutes: parsed.timezoneOffsetMinutes ?? null,
              },
              { asnHint: request.headers.get("cf-ray") ? null : null, targetCountry: policy.targetCountry },
            );

            observe("framique_ad_score", result.score, { network: parsed.network });
            observe("framique_ad_ingest_ms", Date.now() - started, { network: parsed.network, path: "route" });

            const body = { ok: true, duplicate: result.duplicate };
            await completeIdempotency(supabaseAdmin as never, {
              merchantId: parsed.merchantId,
              route: ROUTE,
              key: idemKey,
              response: body,
              httpStatus: 200,
            });

            return Response.json(body, {
              headers: noStore(rateLimitHeaders(merchantVerdict)),
            });
          } catch (err) {
            // Never let a failed attempt burn the key — the retry must work.
            await releaseIdempotency(supabaseAdmin as never, {
              merchantId: parsed.merchantId,
              route: ROUTE,
              key: idemKey,
            }).catch(() => undefined);
            void captureError(err, { route: ROUTE, stage: "ingest" });
            incr("framique_ad_click_rejected_total", { reason: "ingest_failed" });
            return Response.json({ error: "ingest_failed" }, { status: 500, headers: noStore() });
          }
        });
      },
    },
  },
});
