import { createFileRoute } from "@tanstack/react-router";

/**
 * Platform invoice return URL.
 *
 * Reached by the merchant's browser (and, for a contracted rail, by the
 * provider's server-to-server callback). The status is believed only when the
 * HMAC over `chargeId.status.nonce` verifies against the platform rail secret,
 * so nobody can mark our own invoice paid by editing a query string.
 *
 * Both callers are served: a browser gets a 303 back to the invoice screen with
 * the outcome in the query string, a machine caller (`Accept: application/json`)
 * gets the JSON verdict. Settlement itself is idempotent in the database, so a
 * provider that retries its callback five times still moves the money once.
 */
export const Route = createFileRoute("/api/public/payments/platform/return")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const url = new URL(request.url);
  const charge = url.searchParams.get("charge") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  const failure = url.searchParams.get("failure");
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const { applyPlatformReturn, PlatformBillingError } = await import("@/lib/platform-billing.server");
  try {
    const result = await applyPlatformReturn(charge, status, sig, ip, failure);
    if (wantsJson) {
      return Response.json(
        { ok: true, ...result },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const target = new URL("/admin/billing/invoices", url.origin);
    target.searchParams.set("pay", result.status);
    target.searchParams.set("invoice", result.invoiceId);
    if (result.receiptNumber) target.searchParams.set("receipt", result.receiptNumber);
    return new Response(null, {
      status: 303,
      headers: { location: target.pathname + target.search, "cache-control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof PlatformBillingError ? error.code : "platform.signature_invalid";
    const httpStatus = code === "platform.signature_invalid" ? 401 : code === "platform.charge_not_found" ? 404 : 400;
    if (wantsJson) {
      return Response.json({ ok: false, code }, { status: httpStatus, headers: { "cache-control": "no-store" } });
    }
    const target = new URL("/admin/billing/invoices", url.origin);
    target.searchParams.set("pay_error", code);
    return new Response(null, {
      status: 303,
      headers: { location: target.pathname + target.search, "cache-control": "no-store" },
    });
  }
}