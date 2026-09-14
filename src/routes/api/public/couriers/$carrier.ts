import { createFileRoute } from "@tanstack/react-router";

/**
 * Carrier webhook intake: `/api/public/couriers/<carrier-code>`.
 *
 * Public by URL, never by trust — the body is HMAC verified against the
 * merchant's stored carrier secret before anything is written, unknown AWBs
 * are dead-lettered, and no tenant data is ever echoed back to the caller.
 */
export const Route = createFileRoute("/api/public/couriers/$carrier")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method not allowed", {
          status: 405,
          headers: { allow: "POST", "cache-control": "no-store" },
        }),
      POST: async ({ request, params }) => {
        const carrier = String(params.carrier ?? "").toLowerCase();
        if (!/^[a-z0-9_-]{2,40}$/.test(carrier)) {
          return Response.json({ error: "unknown_carrier" }, { status: 404 });
        }
        const raw = await request.text();
        if (raw.length > 64_000) {
          return Response.json({ error: "payload_too_large" }, { status: 413 });
        }
        const signature =
          request.headers.get("x-framique-signature") ??
          request.headers.get("x-courier-signature") ??
          request.headers.get("x-hub-signature-256");

        const { ingestWebhook } = await import("@/lib/courier.server");
        try {
          const result = await ingestWebhook(carrier, raw, signature);
          return Response.json(
            { accepted: result.accepted, reason: result.reason },
            { status: result.status ?? 200, headers: { "cache-control": "no-store" } },
          );
        } catch (err) {
          const { captureError } = await import("@/lib/observability.server");
          void captureError(err, { route: "webhook.courier", carrier });
          return Response.json({ error: "ingest_failed" }, { status: 500 });
        }
      },
    },
  },
});
