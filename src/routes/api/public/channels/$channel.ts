import { createFileRoute } from "@tanstack/react-router";

/**
 * WhatsApp / Messenger inbound webhook.
 *
 * Providers retry hard and duplicate freely, so this route:
 *  - answers the Meta GET verification handshake,
 *  - verifies an HMAC signature (when a shared secret is configured),
 *  - hands one normalised event to the idempotent intake layer,
 *  - always answers 200 on a *recognised* event so retries stop.
 * No internals ever reach the response body.
 */

type Channel = "whatsapp" | "messenger";

const CHANNELS: Channel[] = ["whatsapp", "messenger"];

function isChannel(value: string): value is Channel {
  return (CHANNELS as string[]).includes(value);
}

type Normalised = { eventId: string; externalId: string; text: string; from: string | null } | null;

/** Extract the first inbound text message from either provider envelope. */
function normalise(channel: Channel, payload: unknown): Normalised {
  const body = payload as Record<string, unknown>;
  const entries = Array.isArray(body?.["entry"]) ? (body["entry"] as Record<string, unknown>[]) : [];
  const entry = entries[0];
  if (!entry) return null;

  if (channel === "whatsapp") {
    const changes = Array.isArray(entry["changes"]) ? (entry["changes"] as Record<string, unknown>[]) : [];
    const value = changes[0]?.["value"] as Record<string, unknown> | undefined;
    const messages = Array.isArray(value?.["messages"])
      ? (value?.["messages"] as Record<string, unknown>[])
      : [];
    const message = messages[0];
    const meta = value?.["metadata"] as Record<string, unknown> | undefined;
    const text = (message?.["text"] as Record<string, unknown> | undefined)?.["body"];
    if (!message || typeof text !== "string") return null;
    return {
      eventId: String(message["id"] ?? ""),
      externalId: String(meta?.["phone_number_id"] ?? entry["id"] ?? ""),
      text,
      from: typeof message["from"] === "string" ? message["from"] : null,
    };
  }

  const messaging = Array.isArray(entry["messaging"])
    ? (entry["messaging"] as Record<string, unknown>[])
    : [];
  const event = messaging[0];
  const message = event?.["message"] as Record<string, unknown> | undefined;
  if (!event || typeof message?.["text"] !== "string") return null;
  const sender = event["sender"] as Record<string, unknown> | undefined;
  return {
    eventId: String(message["mid"] ?? event["timestamp"] ?? ""),
    externalId: String((event["recipient"] as Record<string, unknown> | undefined)?.["id"] ?? entry["id"] ?? ""),
    text: message["text"],
    from: typeof sender?.["id"] === "string" ? sender["id"] : null,
  };
}

const noStore = { "cache-control": "no-store" } as const;

export const Route = createFileRoute("/api/public/channels/$channel")({
  server: {
    handlers: {
      // Meta subscription handshake.
      GET: async ({ request, params }) => {
        if (!isChannel(params.channel)) return new Response("Not found", { status: 404 });
        const url = new URL(request.url);
        const verifyToken = process.env["SUPPORT_CHANNEL_VERIFY_TOKEN"];
        if (!verifyToken) return new Response("Not found", { status: 404 });
        if (
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === verifyToken
        ) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { headers: noStore });
        }
        return new Response("Forbidden", { status: 403, headers: noStore });
      },

      POST: async ({ request, params }) => {
        if (!isChannel(params.channel)) return new Response("Not found", { status: 404 });
        const channel = params.channel;

        const raw = await request.text();
        if (raw.length > 100_000) return new Response("Payload too large", { status: 413 });

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad request", { status: 400, headers: noStore });
        }

        const event = normalise(channel, payload);
        // Status callbacks, reactions, read receipts: acknowledge and drop.
        if (!event || !event.eventId || !event.externalId || !event.text.trim()) {
          return Response.json({ outcome: "ignored" }, { headers: noStore });
        }

        const { ingestChannelEvent } = await import("@/lib/support-channels.server");
        const { RateLimitError } = await import("@/lib/rate-limit.server");
        try {
          const result = await ingestChannelEvent({
            channel,
            externalId: event.externalId,
            eventId: event.eventId,
            text: event.text.slice(0, 1000),
            from: event.from,
            rawBody: raw,
            signature: request.headers.get("x-hub-signature-256"),
            secret: process.env["SUPPORT_CHANNEL_SECRET"] ?? null,
          });
          return Response.json({ outcome: result.outcome }, { headers: noStore });
        } catch (err) {
          if (err instanceof RateLimitError) {
            return Response.json({ error: "rate_limited" }, { status: 429, headers: noStore });
          }
          const { captureError } = await import("@/lib/observability.server");
          void captureError(err, { route: "channels.webhook", channel });
          return Response.json({ error: "intake_failed" }, { status: 500, headers: noStore });
        }
      },
    },
  },
});
