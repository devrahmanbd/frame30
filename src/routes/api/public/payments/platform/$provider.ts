import { createFileRoute } from "@tanstack/react-router";

/**
 * Hosted authorisation page for the platform collection rail.
 *
 * In production this route is replaced by the contracted provider's own hosted
 * page; until a rail is contracted per deployment, this page stands in for it
 * with the *same* contract: it never settles anything itself, it only produces a
 * signed return URL that `../return` verifies. That means the trust boundary is
 * exercised in preview exactly as it is in production — no "sandbox shortcut"
 * that marks an invoice paid without a signature.
 *
 * The page is deliberately server-rendered HTML with a plain form: no client
 * bundle, no JS requirement, `no-store`, `noindex`, and no merchant PII.
 */
export const Route = createFileRoute("/api/public/payments/platform/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const chargeId = url.searchParams.get("charge") ?? "";
        const { isPlatformMethod, methodLabel } = await import("@/lib/platform-billing");
        if (!isPlatformMethod(params.provider)) {
          return new Response("unsupported_provider", { status: 404 });
        }
        const { hostedChargeView } = await import("@/lib/platform-billing.server");
        const charge = chargeId ? await hostedChargeView(chargeId) : null;
        if (!charge || charge.method !== params.provider) {
          return html(page({ title: "Payment not found", body: notFoundBody() }), 404);
        }
        const { fmtMinor } = await import("@/lib/money");
        if (charge.expired || charge.status !== "pending") {
          return html(
            page({
              title: "Payment window closed",
              body: `<p>This payment attempt is no longer active (<code>${escape(charge.status)}</code>). Start a new payment from your invoices page.</p>
                     <p><a href="/admin/billing/invoices">Back to invoices</a></p>`,
            }),
            410,
          );
        }
        return html(
          page({
            title: `${methodLabel(charge.method)} — authorise payment`,
            body: `
              <p class="amount">${escape(fmtMinor(charge.amountMinorInt, charge.currencyCode))}</p>
              <p class="muted">Attempt ${charge.attempt} · window closes ${escape(charge.expiresAt.slice(11, 16))} UTC</p>
              <form method="post" action="${escape(url.pathname + url.search)}">
                <button name="outcome" value="success" class="ok">Approve payment</button>
                <button name="outcome" value="fail" class="warn">Simulate decline</button>
                <button name="outcome" value="cancel" class="muted-btn">Cancel</button>
              </form>
              <p class="muted">Nothing is settled by this page. The result is signed and verified on return.</p>`,
          }),
        );
      },

      POST: async ({ request, params }) => {
        const url = new URL(request.url);
        const chargeId = url.searchParams.get("charge") ?? "";
        const form = await request.formData();
        const raw = String(form.get("outcome") ?? "");
        const outcome = raw === "success" || raw === "fail" || raw === "cancel" ? raw : null;
        if (!outcome || !chargeId) return new Response("bad_request", { status: 400 });

        const { isPlatformMethod } = await import("@/lib/platform-billing");
        if (!isPlatformMethod(params.provider)) {
          return new Response("unsupported_provider", { status: 404 });
        }
        const { platformHostedOutcome, PlatformBillingError } = await import(
          "@/lib/platform-billing.server"
        );
        try {
          const { redirectTo } = await platformHostedOutcome(chargeId, outcome, url.origin);
          return new Response(null, {
            status: 303,
            headers: { location: redirectTo, "cache-control": "no-store" },
          });
        } catch (error) {
          const code = error instanceof PlatformBillingError ? error.code : "platform.unavailable";
          return new Response(code, { status: 400 });
        }
      },
    },
  },
});

function escape(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function notFoundBody() {
  return `<p>This payment attempt does not exist or has been replaced.</p>
          <p><a href="/admin/billing/invoices">Back to invoices</a></p>`;
}

function page({ title, body }: { title: string; body: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #0f172a; color: #f8fafc; }
  main { width: min(28rem, 92vw); padding: 2rem; border-radius: 1rem; background: #16213e; box-shadow: 0 20px 60px rgb(0 0 0 / .35); }
  h1 { font-size: 1.15rem; margin: 0 0 1rem; }
  .amount { font-size: 2rem; font-weight: 600; margin: .25rem 0; }
  .muted { color: #94a3b8; font-size: .85rem; }
  form { display: grid; gap: .5rem; margin: 1.25rem 0; }
  button { min-height: 2.75rem; border: 0; border-radius: .5rem; font: inherit; font-weight: 600; cursor: pointer; }
  .ok { background: #22c55e; color: #052e16; }
  .warn { background: #f59e0b; color: #451a03; }
  .muted-btn { background: transparent; color: #94a3b8; border: 1px solid #334155; }
  a { color: #93c5fd; }
</style></head>
<body><main><h1>${escape(title)}</h1>${body}</main></body></html>`;
}

function html(markup: string, status = 200) {
  return new Response(markup, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}