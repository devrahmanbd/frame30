import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { getOrder } from "@/lib/storefront.functions";
import { startCharge } from "@/lib/payments.functions";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/store/$slug/order/$orderId")({
  validateSearch: (search: Record<string, unknown>): { t?: string; pay?: string } => ({
    ...(typeof search.t === "string" ? { t: search.t } : {}),
    ...(search.pay === "failed" || search.pay === "cancelled" ? { pay: search.pay } : {}),
  }),
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: async ({ params, deps }) => {
    const data = await getOrder({ data: { orderId: params.orderId, token: deps.t } });
    if (!data) throw notFound();
    return data;
  },
  head: () => ({
    meta: [
      { title: "Order confirmation — Framique" },
      { name: "description", content: "Your order details, payment status and delivery timeline." },
      { property: "og:title", content: "Order confirmation" },
      { property: "og:description", content: "Track your order status and delivery timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderConfirmation,
  notFoundComponent: OrderNotFound,
});

function OrderNotFound() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t("Order not found", "অর্ডার পাওয়া যায়নি")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          "Open the link from your confirmation message, or sign in with the account that placed the order.",
          "কনফার্মেশন মেসেজের লিংক ব্যবহার করুন, অথবা যে অ্যাকাউন্টে অর্ডার করেছেন তাতে সাইন ইন করুন।",
        )}
      </p>
    </main>
  );
}

function OrderConfirmation() {
  const { t } = useLang();
  const { order, items, events, merchant } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { pay } = Route.useSearch();
  const currency = order.currency_code;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const unpaid = order.status === "pending" || order.status === "payment_pending";

  // A new attempt opens a fresh intent; the previous one stays on record.
  async function retryPayment() {
    setRetrying(true);
    setRetryError("");
    try {
      const charge = await startCharge({
        data: { slug, orderId: order.id, idempotencyKey: `retry-${order.id}-${Date.now()}` },
      });
      if (charge.redirectUrl) window.location.assign(charge.redirectUrl);
      else setRetryError(t("This order is cash on delivery.", "এই অর্ডারটি ক্যাশ অন ডেলিভারি।"));
    } catch {
      setRetryError(t("Payment could not be started. Try again.", "পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="min-h-screen bg-background" lang="bn">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-muted-foreground">{merchant?.name}</p>
        <h1 className="font-bangla-display mt-1 text-2xl font-bold">{t("Thank you! Order confirmed", "ধন্যবাদ! অর্ডার নিশ্চিত হয়েছে")}</h1>
        <p className="money mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Order {order.order_number}</span>
          <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs text-primary">{order.status}</span>
        </p>

        {(pay || unpaid) && (
          <section
            role="alert"
            className="mt-4 rounded-fq-lg border border-warning-foreground/30 bg-warning-soft p-4"
          >
            <h2 className="text-sm font-semibold text-warning-foreground">
              {pay === "cancelled"
                ? t("Payment cancelled", "পেমেন্ট বাতিল হয়েছে")
                : pay === "failed"
                  ? t("Payment did not go through", "পেমেন্ট সম্পন্ন হয়নি")
                  : t("Payment pending", "পেমেন্ট বাকি আছে")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Your order is held. Complete payment to move it into fulfilment.",
                "আপনার অর্ডার সংরক্ষিত আছে। ফুলফিলমেন্টে যেতে পেমেন্ট সম্পন্ন করুন।",
              )}
            </p>
            {unpaid && (
              <button
                type="button"
                onClick={() => void retryPayment()}
                disabled={retrying}
                className="mt-3 min-h-12 rounded-fq-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {retrying ? t("Opening…", "খোলা হচ্ছে…") : t("Pay now", "এখনই পেমেন্ট করুন")}
              </button>
            )}
            {retryError && <p className="mt-2 text-sm text-danger-foreground">{retryError}</p>}
          </section>
        )}

        <section className="mt-6 rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Items</h2>
          <ul className="mt-2 divide-y divide-border">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {i.product_title}
                  <span className="text-muted-foreground"> × {i.quantity}</span>
                </span>
                <span className="money font-medium">
                  {fmtMinor(Number(i.line_total_minor_int), currency)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
            <Row label="Subtotal" value={fmtMinor(Number(order.subtotal_minor_int), currency)} />
            <Row label="Delivery" value={fmtMinor(Number(order.shipping_minor_int), currency)} />
            {Number(order.cod_surcharge_minor_int) > 0 && (
              <Row label="COD surcharge" value={fmtMinor(Number(order.cod_surcharge_minor_int), currency)} />
            )}
            <Row
              label={`VAT (${(order.vat_rate_basis_points / 100).toFixed(1)}%)`}
              value={fmtMinor(Number(order.vat_minor_int), currency)}
            />
            <Row label="Total (incl. VAT)" value={fmtMinor(Number(order.total_minor_int), currency)} strong />
          </dl>
        </section>

        <section className="mt-6 rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("Delivery", "ডেলিভারি")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {order.customer_name} · {order.customer_phone}
            <br />
            {order.address_line}, {order.city} {order.postcode ?? ""}
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold">{t("Timeline", "টাইমলাইন")}</h2>
          <ol className="mt-3 space-y-3">
            {events.map((e) => (
              <li key={e.created_at + e.event_type} className="rounded-fq-lg rounded-bl-sm bg-info-soft p-3 text-sm">
                <p className="font-medium">{e.event_type}</p>
                {e.note && <p className="text-muted-foreground">{e.note}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("en-BD")}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <Link
          to="/store/$slug"
          params={{ slug }}
          className="mt-8 inline-flex min-h-12 items-center rounded-fq-md border border-border px-5 text-sm font-medium"
        >
          {t("Continue shopping", "আরও কেনাকাটা করুন")}
        </Link>
      </main>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={`money ${strong ? "font-bold" : ""}`}>{value}</dd>
    </div>
  );
}
