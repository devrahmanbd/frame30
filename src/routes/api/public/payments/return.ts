import { createFileRoute } from "@tanstack/react-router";

/**
 * Provider return URL. The status is only believed when the HMAC over
 * `intentId.status.nonce` matches the merchant's gateway secret, so a shopper
 * cannot self-serve a "paid" order by editing the query string.
 */
export const Route = createFileRoute("/api/public/payments/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const intent = url.searchParams.get("intent") ?? "";
        const status = url.searchParams.get("status") ?? "";
        const sig = url.searchParams.get("sig") ?? "";
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";

        const { applySignedReturn, PaymentError } = await import("@/lib/payments.server");
        try {
          const result = await applySignedReturn(intent, status, sig, ip);
          const target = new URL(`/store/${result.slug}/order/${result.orderId}`, url.origin);
          if (result.accessToken) target.searchParams.set("t", result.accessToken);
          if (result.status !== "paid") target.searchParams.set("pay", result.status);
          return new Response(null, {
            status: 303,
            headers: { location: target.pathname + target.search, "cache-control": "no-store" },
          });
        } catch (e) {
          const code = e instanceof PaymentError ? e.code : "payment.signature_invalid";
          return new Response(code, { status: code === "payment.signature_invalid" ? 401 : 400 });
        }
      },
    },
  },
});
