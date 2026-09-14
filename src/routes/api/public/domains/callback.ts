import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * TLS edge callback.
 *
 * The certificate worker (OpenResty + lua-resty-acme) registers http-01
 * challenges and reports order results here. Authentication is an HMAC-SHA256
 * signature over `timestamp.body` using DOMAIN_EDGE_TOKEN, compared in
 * constant time with a 5-minute clock-skew window, so a replayed or forged
 * callback cannot flip a domain to active.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("challenge"),
    hostname: z.string().min(3).max(253),
    token: z.string().min(8).max(128),
    keyAuthorization: z.string().min(8).max(512),
  }),
  z.object({
    action: z.literal("cert"),
    hostname: z.string().min(3).max(253),
    ok: z.boolean(),
    expiresAt: z.string().datetime().nullable().optional(),
    error: z.string().max(500).nullable().optional(),
  }),
]);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/domains/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["DOMAIN_EDGE_TOKEN"];
        if (!secret) return new Response("Not found", { status: 404 });

        const raw = await request.text();
        const header = request.headers.get("framique-edge-signature") ?? "";
        const parts = Object.fromEntries(
          header.split(",").map((p) => {
            const [k, v] = p.trim().split("=");
            return [k ?? "", v ?? ""];
          }),
        ) as { t?: string; v1?: string };
        const ts = Number(parts.t);
        if (!parts.v1 || !Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
          return new Response("Unauthorized", { status: 401 });
        }
        const expected = await hmacHex(secret, `${parts.t}.${raw}`);
        if (!safeEqual(parts.v1, expected)) return new Response("Unauthorized", { status: 401 });

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(JSON.parse(raw));
        } catch {
          return Response.json({ error: "invalid_payload" }, { status: 400 });
        }

        try {
          if (body.action === "challenge") {
            const { storeChallenge } = await import("@/lib/domains.server");
            await storeChallenge(body.hostname.toLowerCase(), body.token, body.keyAuthorization);
          } else {
            const { applyCertResult } = await import("@/lib/domains.server");
            await applyCertResult({
              hostname: body.hostname.toLowerCase(),
              ok: body.ok,
              expiresAt: body.expiresAt ?? null,
              error: body.error ?? null,
            });
          }
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          const { captureError } = await import("@/lib/observability.server");
          void captureError(err, { route: "domains.callback", action: body.action });
          const status = (err as { status?: number }).status === 404 ? 404 : 500;
          return Response.json({ error: "callback_failed" }, { status });
        }
      },
    },
  },
});
