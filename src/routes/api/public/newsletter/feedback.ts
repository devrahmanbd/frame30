import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Provider feedback intake: hard bounces and spam complaints (Phase 10.4).
 *
 * Public by necessity — the mail provider is the caller and cannot hold a
 * session — so the handler assumes every request is hostile:
 *
 *   • The body length is checked before the body is read.
 *   • The HMAC-SHA256 signature over the raw body is verified in constant time
 *     against `NEWSLETTER_WEBHOOK_SECRET`. With no secret configured the route
 *     answers 503 and processes nothing, because an unauthenticated
 *     suppression endpoint is a way to unsubscribe other people.
 *   • A timestamp header bounds replay to a five-minute window.
 *   • The payload is schema-validated and the response body is a constant. The
 *     route never reveals whether the address was on the list.
 */
const MAX_BODY_BYTES = 16_384;
const MAX_SKEW_SECONDS = 300;

const bodySchema = z.object({
  type: z.enum(["hard_bounce", "soft_bounce", "complaint"]),
  email: z.string().trim().email().max(254),
  detail: z.string().trim().max(500).optional(),
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/newsletter/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["NEWSLETTER_WEBHOOK_SECRET"];
        if (!secret) {
          return new Response("not configured", { status: 503, headers: { "cache-control": "no-store" } });
        }

        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > MAX_BODY_BYTES) return new Response("too large", { status: 413 });

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) return new Response("too large", { status: 413 });

        const timestamp = request.headers.get("x-framique-timestamp") ?? "";
        const signature = (request.headers.get("x-framique-signature") ?? "").toLowerCase();
        const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
        if (!timestamp || !Number.isFinite(skew) || skew > MAX_SKEW_SECONDS) {
          return new Response("stale", { status: 401, headers: { "cache-control": "no-store" } });
        }

        const expected = await hmacHex(secret, `${timestamp}.${raw}`);
        if (!timingSafeEqual(signature, expected)) {
          return new Response("bad signature", { status: 401, headers: { "cache-control": "no-store" } });
        }

        const parsed = bodySchema.safeParse(JSON.parse(raw || "{}"));
        if (!parsed.success) return new Response("bad request", { status: 400 });

        const { recordDeliveryFeedback } = await import("@/lib/newsletter.server");
        await recordDeliveryFeedback({
          email: parsed.data.email,
          kind:
            parsed.data.type === "complaint" ? "complaint" : parsed.data.type === "hard_bounce" ? "hard" : "soft",
          detail: parsed.data.detail ?? null,
        });

        // Constant response: a provider retry is idempotent, and a probe learns
        // nothing about who is on the list.
        return new Response(JSON.stringify({ ok: true }), {
          status: 202,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});