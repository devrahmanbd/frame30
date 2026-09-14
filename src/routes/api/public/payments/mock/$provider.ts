import { createFileRoute } from "@tanstack/react-router";

/**
 * Mock MFS sandbox. Stands in for bKash / Nagad / Rocket hosted pages: it shows
 * the three real-world outcomes and hands back a signed conclusion, so the app
 * only ever trusts an HMAC — never a client-declared status.
 */
export const Route = createFileRoute("/api/public/payments/mock/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const intent = url.searchParams.get("intent") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(intent)) {
          return new Response("Bad intent", { status: 400 });
        }
        const action = `/api/public/payments/mock/${params.provider}`;
        const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${params.provider} sandbox</title>
<style>body{font:16px/1.5 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f6}
.card{background:#fff;border:1px solid #dcdfdc;border-radius:12px;padding:24px;max-width:420px;width:100%}
h1{font-size:18px;margin:0 0 4px}p{color:#555;margin:0 0 16px;font-size:14px}
button{min-height:48px;width:100%;margin-top:8px;border-radius:8px;border:1px solid #dcdfdc;background:#fff;font:inherit;cursor:pointer}
button.pay{background:#0f766e;color:#fff;border-color:#0f766e}</style></head>
<body><main class="card"><h1>${params.provider} sandbox</h1>
<p>Signed-mock rail. No real money moves; the outcome returns as an HMAC-signed conclusion.</p>
<form method="POST" action="${action}">
<input type="hidden" name="intent" value="${intent}">
<button class="pay" name="outcome" value="success" type="submit">Approve payment</button>
<button name="outcome" value="fail" type="submit">Decline payment</button>
<button name="outcome" value="cancel" type="submit">Cancel and go back</button>
</form></main></body></html>`;
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
      },

      POST: async ({ request, params }) => {
        const form = await request.formData();
        const intent = String(form.get("intent") ?? "");
        const outcome = String(form.get("outcome") ?? "");
        if (!["success", "fail", "cancel"].includes(outcome)) {
          return new Response("Bad outcome", { status: 400 });
        }
        const { rateLimit } = await import("@/lib/rate-limit.server");
        const verdict = await rateLimit("payments.return", `mock:${intent}`);
        if (!verdict.allowed) return new Response("Too many attempts", { status: 429 });

        const { mockAuthorise, PaymentError } = await import("@/lib/payments.server");
        try {
          const origin = new URL(request.url).origin;
          const { redirectTo } = await mockAuthorise(
            params.provider,
            intent,
            outcome as "success" | "fail" | "cancel",
            origin,
          );
          return new Response(null, { status: 303, headers: { location: redirectTo } });
        } catch (e) {
          const code = e instanceof PaymentError ? e.code : "payment.intent_not_found";
          return new Response(code, { status: 400 });
        }
      },
    },
  },
});
