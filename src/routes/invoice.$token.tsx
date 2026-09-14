import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { fmtMinor } from "@/lib/money";
import { draftOrderAcceptFn, draftOrderPublicFn } from "@/lib/commerce-desk.functions";

export const Route = createFileRoute("/invoice/$token")({
  head: () => ({
    meta: [
      { title: "Your quote — Framique" },
      {
        name: "description",
        content: "Review the items, totals and delivery details on your quote, then accept it when you are ready.",
      },
      { property: "og:title", content: "Your quote" },
      { property: "og:description", content: "A private quote prepared for you by the shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InvoicePage,
  errorComponent: () => (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold">This quote could not be opened</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The link may have expired. Ask the shop to send you a fresh one.
      </p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold">Quote not found</h1>
    </main>
  ),
});

type PublicDraft = {
  found?: boolean;
  throttled?: boolean;
  status?: string;
  number?: string;
  currency_code?: string;
  subtotal_minor_int?: number;
  discount_minor_int?: number;
  shipping_minor_int?: number;
  vat_minor_int?: number;
  total_minor_int?: number;
  expires_at?: string | null;
  note?: string;
  items?: { title: string; variant_name?: string; quantity: number; unit_price_minor_int: number }[];
};

function InvoicePage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(draftOrderPublicFn);
  const accept = useServerFn(draftOrderAcceptFn);

  const quote = useQuery({
    queryKey: ["invoice", token],
    queryFn: () => load({ data: { token } }) as Promise<PublicDraft>,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => accept({ data: { token } }),
    onSuccess: (res) => {
      const outcome = (res as { outcome: string }).outcome;
      void qc.invalidateQueries({ queryKey: ["invoice", token] });
      if (outcome === "accepted") toast.success("Thank you — the shop has been notified");
      else if (outcome === "already_accepted") toast.info("You have already accepted this quote");
      else toast.error("This quote can no longer be accepted");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  if (quote.isLoading) {
    return <main className="mx-auto max-w-2xl p-8 text-sm text-muted-foreground">Loading your quote…</main>;
  }

  const data = quote.data;

  if (data?.throttled) {
    return (
      <main className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold">Too many attempts</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please wait a moment and refresh this page.</p>
      </main>
    );
  }

  if (!data || data.found === false || !data.number) {
    return (
      <main className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold">This quote is no longer available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have expired or been cancelled. Please contact the shop for a new one.
        </p>
      </main>
    );
  }

  const currency = data.currency_code ?? "BDT";
  const accepted = data.status === "accepted" || data.status === "converted";
  const closed = data.status === "cancelled" || data.status === "expired";

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-bangla-display text-xl font-semibold">Quote {data.number}</h1>
        {data.expires_at ? (
          <p className="text-xs text-muted-foreground">
            Valid until {new Date(data.expires_at).toLocaleDateString("en-BD")}
          </p>
        ) : null}
      </header>

      <div className="mt-4 overflow-hidden rounded-fq-lg border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Items on this quote</caption>
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="p-3">Item</th>
              <th scope="col" className="p-3">Qty</th>
              <th scope="col" className="p-3">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data.items ?? []).map((item, index) => (
              <tr key={index}>
                <td className="p-3">
                  {item.title}
                  {item.variant_name ? (
                    <span className="block text-xs text-muted-foreground">{item.variant_name}</span>
                  ) : null}
                </td>
                <td className="money p-3">{item.quantity}</td>
                <td className="money p-3">
                  {fmtMinor(Number(item.unit_price_minor_int) * item.quantity, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="space-y-1 border-t border-border p-4 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="money">{fmtMinor(Number(data.subtotal_minor_int ?? 0), currency)}</dd>
          </div>
          {Number(data.discount_minor_int ?? 0) > 0 ? (
            <div className="flex justify-between">
              <dt>Discount</dt>
              <dd className="money">−{fmtMinor(Number(data.discount_minor_int), currency)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt>Delivery</dt>
            <dd className="money">{fmtMinor(Number(data.shipping_minor_int ?? 0), currency)}</dd>
          </div>
          {Number(data.vat_minor_int ?? 0) > 0 ? (
            <div className="flex justify-between">
              <dt>VAT</dt>
              <dd className="money">{fmtMinor(Number(data.vat_minor_int), currency)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="money">{fmtMinor(Number(data.total_minor_int ?? 0), currency)}</dd>
          </div>
        </dl>
      </div>

      {data.note ? <p className="mt-4 text-sm text-muted-foreground">{data.note}</p> : null}

      <div className="mt-6">
        {accepted ? (
          <p className="inline-flex items-center gap-2 rounded-fq-md bg-success-soft px-3 py-2 text-sm text-success-foreground">
            <CheckCircle2 className="size-4" aria-hidden /> Accepted — the shop will be in touch.
          </p>
        ) : closed ? (
          <p className="text-sm text-muted-foreground">This quote is closed.</p>
        ) : (
          <button
            type="button"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
            className="inline-flex min-h-11 items-center gap-2 rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {acceptMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Accept this quote
          </button>
        )}
      </div>
    </main>
  );
}
