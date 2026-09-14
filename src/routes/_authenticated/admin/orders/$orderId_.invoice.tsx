import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoiceDocumentFn, invoiceIssueFn } from "@/lib/commerce.functions";
import { fmtMinor } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/admin/orders/$orderId_/invoice")({
  head: () => ({
    meta: [
      { title: "Invoice — Framique Admin" },
      { name: "description", content: "Printable VAT invoice for this order." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvoicePage,
});

function InvoicePage() {
  const { orderId } = useParams({ from: "/_authenticated/admin/orders/$orderId_/invoice" });

  const doc = useQuery({
    queryKey: ["invoice", orderId],
    queryFn: () => invoiceDocumentFn({ data: { orderId } }),
  });

  const issue = useMutation({
    mutationFn: () => invoiceIssueFn({ data: { orderId } }),
    onSuccess: () => void doc.refetch(),
  });

  const d = doc.data;

  return (
    <section className="mx-auto max-w-3xl">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/admin/orders/$orderId"
          params={{ orderId }}
          className="text-sm text-primary underline underline-offset-4"
        >
          ← Back to order
        </Link>
        {d && (
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-fq-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Print / Save as PDF
          </button>
        )}
      </header>

      {doc.isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading invoice…</p>}

      {!doc.isLoading && !d && (
        <div className="mt-8 rounded-fq-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">No invoice issued yet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Issuing mints a sequential, immutable invoice number for the legal year. This cannot be undone.
          </p>
          <button
            type="button"
            disabled={issue.isPending}
            onClick={() => issue.mutate()}
            className="mt-4 min-h-12 rounded-fq-md bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {issue.isPending ? "Issuing…" : "Issue invoice"}
          </button>
          <p aria-live="polite" className="mt-2 text-sm text-destructive">
            {issue.isError ? (issue.error as Error).message : ""}
          </p>
        </div>
      )}

      {d && (
        <article className="mt-6 rounded-fq-lg border border-border bg-card p-6 text-sm print:border-0 print:p-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-bangla-display text-xl font-semibold">{d.merchant.name}</h1>
              {d.invoice.businessBin && (
                <p className="text-xs text-muted-foreground">BIN: {d.invoice.businessBin}</p>
              )}
              {d.merchant.supportPhone && (
                <p className="text-xs text-muted-foreground">{d.merchant.supportPhone}</p>
              )}
              {d.merchant.supportEmail && (
                <p className="text-xs text-muted-foreground">{d.merchant.supportEmail}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">VAT invoice</p>
              <p className="font-semibold">{d.invoice.number}</p>
              <p className="text-xs text-muted-foreground">
                Issued {new Date(d.invoice.issuedAt).toLocaleDateString("en-BD")}
              </p>
              <p className="text-xs text-muted-foreground">Order {d.order.number}</p>
            </div>
          </div>

          <div className="mt-6 rounded-fq-md bg-muted/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Billed to</p>
            <p className="font-medium">{d.order.customer.name}</p>
            <p className="text-muted-foreground">
              {d.order.customer.address}, {d.order.customer.city}
              {d.order.customer.postcode ? ` — ${d.order.customer.postcode}` : ""}
            </p>
            <p className="text-muted-foreground">{d.order.customer.phone}</p>
          </div>

          <table className="mt-6 w-full text-left">
            <caption className="sr-only">Invoice lines</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="py-2">Item</th>
                <th scope="col" className="py-2 text-right">Qty</th>
                <th scope="col" className="py-2 text-right">Unit</th>
                <th scope="col" className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="py-2">
                    {l.title}
                    <span className="block text-xs text-muted-foreground">
                      {l.variant}
                      {l.sku ? ` · ${l.sku}` : ""}
                    </span>
                  </td>
                  <td className="py-2 text-right money">{l.quantity}</td>
                  <td className="py-2 text-right money">{fmtMinor(l.unitPriceMinor, d.invoice.currency)}</td>
                  <td className="py-2 text-right money">{fmtMinor(l.lineTotalMinor, d.invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="ml-auto mt-4 w-full max-w-xs space-y-1">
            <TotalRow label="Subtotal" value={fmtMinor(d.invoice.subtotalMinor, d.invoice.currency)} />
            {d.invoice.discountMinor > 0 && (
              <TotalRow label="Discount" value={`− ${fmtMinor(d.invoice.discountMinor, d.invoice.currency)}`} />
            )}
            <TotalRow label="Delivery" value={fmtMinor(d.invoice.shippingMinor, d.invoice.currency)} />
            {d.order.codSurchargeMinor > 0 && (
              <TotalRow label="COD surcharge" value={fmtMinor(d.order.codSurchargeMinor, d.invoice.currency)} />
            )}
            <TotalRow
              label={`VAT (${(d.invoice.vatRateBasisPoints / 100).toFixed(1)}%)${d.merchant.pricesIncludeVat ? " — included" : ""}`}
              value={fmtMinor(d.invoice.vatMinor, d.invoice.currency)}
            />
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="money">{fmtMinor(d.invoice.totalMinor, d.invoice.currency)}</dd>
            </div>
          </dl>

          <p className="mt-6 text-xs text-muted-foreground">
            Invoice {d.invoice.sequenceNo} of legal year {d.invoice.sequenceYear}. Amounts are computed
            server-side from the order record and the legal VAT table.
          </p>
        </article>
      )}
    </section>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="money">{value}</dd>
    </div>
  );
}
