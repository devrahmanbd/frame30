import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
import { CheckCircle, Clock, XCircle } from "@/components/icons/tabler";
import { getOrder, getStoreChrome } from "@/lib/storefront.functions";
import { startCharge } from "@/lib/payments.functions";
import { buildRetryKey } from "@/lib/payment-keys";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/store/$slug/order/$orderId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { t?: string; pay?: string } => ({
    ...(typeof search.t === "string" ? { t: search.t } : {}),
    ...(search.pay === "failed" || search.pay === "cancelled"
      ? { pay: search.pay }
      : {}),
  }),
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: async ({ params, deps }) => {
    const [data, chrome] = await Promise.all([
      getOrder({ data: { orderId: params.orderId, token: deps.t } }),
      getStoreChrome({ data: { slug: params.slug, template: "account" } }).catch(() => null),
    ]);
    if (!data) throw notFound();
    // Defense in depth: the path slug is decorative (token gates), but a
    // mismatched slug must never render another tenant's order page.
    if (data.merchant?.slug !== params.slug) throw notFound();
    return { ...data, chrome };
  },
  head: () => ({
    meta: [
      { title: "Order confirmation — Framique" },
      {
        name: "description",
        content: "Your order details, payment status and delivery timeline.",
      },
      { property: "og:title", content: "Order confirmation" },
      {
        property: "og:description",
        content: "Track your order status and delivery timeline.",
      },
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
      <h1 className="text-2xl font-semibold">
        {t("Order not found", "অর্ডার পাওয়া যায়নি")}
      </h1>
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
  const { order, items, events, merchant, chrome } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { pay } = Route.useSearch();
  const currency = order.currency_code;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  // Deterministic attempt per mount; the in-flight guard collapses a
  // double-click onto one call, and the server canonicalises the key onto
  // the current attempt (replay when live, +1 after terminal).
  const retryAttempt = useRef(1);
  const retryInflight = useRef(false);
  const unpaid =
    order.status === "pending" || order.status === "payment_pending";

  // A retry reuses the live attempt's intent; only a new attempt opens a
  // fresh intent, and the previous one stays on record.
  async function retryPayment() {
    if (retryInflight.current) return;
    retryInflight.current = true;
    const attempt = retryAttempt.current;
    retryAttempt.current += 1;
    setRetrying(true);
    setRetryError("");
    try {
      const charge = await startCharge({
        data: {
          slug,
          orderId: order.id,
          idempotencyKey: buildRetryKey(order.id, attempt),
        },
      });
      if (charge.redirectUrl) window.location.assign(charge.redirectUrl);
      else
        setRetryError(
          t(
            "This order is cash on delivery.",
            "এই অর্ডারটি ক্যাশ অন ডেলিভারি।",
          ),
        );
    } catch {
      setRetryError(
        t(
          "Payment could not be started. Try again.",
          "পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।",
        ),
      );
    } finally {
      setRetrying(false);
      retryInflight.current = false;
    }
  }

  return (
    <PluginLayer plugins={chrome?.installedPlugins ?? []}>
      <ThemeChrome
        template="account"
        ast={chrome?.ast ?? null}
        tokens={chrome?.tokens ?? null}
        storeSlug={slug}
        themeKey={chrome?.themeKey ?? null}
        merchantId={chrome?.merchant.id ?? null}
        siteKit={chrome?.siteKit ?? null}
        ownsPrimary
        chrome={
          <StoreHeader
            slug={slug}
            name={chrome?.merchant.name ?? merchant?.name ?? slug}
            menus={chrome?.menus ?? null}
            themeKey={chrome?.themeKey ?? null}
          />
        }
        fallback={
          <div className="bg-muted/10 font-sans pb-24" lang="bn">
            <main className="mx-auto max-w-[800px] px-4 py-12 sm:px-6 lg:px-8 space-y-8">
            <header className="flex flex-col items-center text-center space-y-4 mb-10 pb-10 border-b border-border/40">
              {pay === "failed" || pay === "cancelled" ? (
                <>
                  <XCircle className="size-16 text-danger" />
                  <h1 className="font-bangla-display text-3xl font-semibold tracking-tight text-foreground">
                    {t("Payment failed", "পেমেন্ট ব্যর্থ হয়েছে")}
                  </h1>
                  <p className="text-muted-foreground text-[15px]">
                    {pay === "cancelled" 
                      ? t("You cancelled the payment process.", "আপনি পেমেন্ট প্রক্রিয়া বাতিল করেছেন।")
                      : t("We could not process your payment.", "আমরা আপনার পেমেন্ট প্রসেস করতে পারিনি।")}
                  </p>
                </>
              ) : unpaid ? (
                <>
                  <Clock className="size-16 text-warning" />
                  <h1 className="font-bangla-display text-3xl font-semibold tracking-tight text-foreground">
                    {t("Awaiting approval", "অনুমোদনের অপেক্ষায়")}
                  </h1>
                  <p className="text-muted-foreground text-[15px]">
                    {t("Your order has been placed and is waiting for admin approval.", "আপনার অর্ডারটি গ্রহণ করা হয়েছে এবং অ্যাডমিন অনুমোদনের অপেক্ষায় আছে।")}
                  </p>
                </>
              ) : (
                <>
                  <CheckCircle className="size-16 text-success" />
                  <h1 className="font-bangla-display text-3xl font-semibold tracking-tight text-foreground">
                    {t("Thank you! Order successful", "ধন্যবাদ! অর্ডার সফল হয়েছে")}
                  </h1>
                  <p className="text-muted-foreground text-[15px]">
                    {t("We've received your order and payment. It is now being processed.", "আমরা আপনার অর্ডার এবং পেমেন্ট পেয়েছি। এটি এখন প্রসেস করা হচ্ছে।")}
                  </p>
                </>
              )}
          <p className="mt-2 text-sm font-medium text-foreground bg-background border border-border px-4 py-2 rounded-full shadow-sm">
            Order <span className="font-semibold">{order.order_number}</span>
          </p>
        </header>

        {(pay === "failed" || pay === "cancelled") && (
          <section className="flex flex-col items-center gap-4 bg-background p-6 rounded-2xl border border-border/60 shadow-sm">
            <button
              type="button"
              onClick={() => void retryPayment()}
              disabled={retrying}
              className="w-full sm:w-auto min-w-[200px] h-[46px] rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50 transition-opacity hover:opacity-90"
            >
              {retrying
                ? t("Opening…", "খোলা হচ্ছে…")
                : t("Pay now", "এখনই পেমেন্ট করুন")}
            </button>
            {retryError && (
              <p className="text-sm text-danger-foreground font-medium">
                {retryError}
              </p>
            )}
          </section>
        )}

        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-8">
            <section className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
              <h2 className="font-bangla-display text-xl font-semibold tracking-tight mb-6">Items</h2>
              <ul className="divide-y divide-border/40">
                {items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="flex gap-4">
                       <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-muted/30 shrink-0 flex items-center justify-center">
                         {i.image_url ? (
                           <img src={i.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                         ) : (
                           <span className="text-xs text-muted-foreground">Img</span>
                         )}
                         <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">{i.quantity}</div>
                       </div>
                       <div>
                         <p className="text-sm font-medium text-foreground line-clamp-2">{i.product_title}</p>
                         {i.variant_name && i.variant_name !== "Default" && (
                           <p className="text-xs text-muted-foreground mt-0.5">{i.variant_name}</p>
                         )}
                         <div className="flex items-center gap-2 mt-1">
                           <p className="text-xs text-muted-foreground">Qty: {i.quantity}</p>
                           {i.sku && (
                             <p className="text-xs text-muted-foreground/60 border-l border-border/60 pl-2">SKU: {i.sku}</p>
                           )}
                         </div>
                       </div>
                    </div>
                    <span className="money text-sm font-medium text-foreground whitespace-nowrap">
                      {fmtMinor(Number(i.line_total_minor_int), currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="mt-6 space-y-3 border-t border-border/40 pt-6 text-sm">
                <Row label="Subtotal" value={fmtMinor(Number(order.subtotal_minor_int), currency)} />
                <Row label="Delivery" value={fmtMinor(Number(order.shipping_minor_int), currency)} />
                {Number(order.cod_surcharge_minor_int) > 0 && (
                  <Row label="COD surcharge" value={fmtMinor(Number(order.cod_surcharge_minor_int), currency)} />
                )}
                <Row label={`VAT (${(order.vat_rate_basis_points / 100).toFixed(1)}%)`} value={fmtMinor(Number(order.vat_minor_int), currency)} />
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-border/40 mt-4 text-base">
                   <dt className="font-semibold text-foreground">Total</dt>
                   <dd className="money font-semibold tracking-tight">{fmtMinor(Number(order.total_minor_int), currency)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="lg:col-span-2 space-y-8">
            <section className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
              <h2 className="font-bangla-display text-xl font-semibold tracking-tight mb-4">{t("Delivery", "ডেলিভারি")}</h2>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{order.customer_name}</p>
                <p>{order.address_line}</p>
                <p>{order.city} {order.postcode ?? ""}</p>
                <p className="pt-2 mt-2 border-t border-border/40">{order.customer_phone}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
              <h2 className="font-bangla-display text-xl font-semibold tracking-tight mb-4">{t("Timeline", "টাইমলাইন")}</h2>
              <ol className="relative border-s border-border/60 ml-3 space-y-6">
                {events.map((e, idx) => (
                  <li key={e.created_at + e.event_type} className="ms-6">
                    <span className="absolute -start-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-background ring-4 ring-background border border-border">
                       <div className={`h-2 w-2 rounded-full ${idx === 0 ? "bg-primary" : "bg-muted-foreground"}`} />
                    </span>
                    <h3 className={`text-sm font-semibold leading-tight ${idx === 0 ? "text-foreground" : "text-muted-foreground"}`}>{e.event_type}</h3>
                    <time className="block mb-2 text-xs font-normal leading-none text-muted-foreground/80 mt-1">
                       {new Date(e.created_at).toLocaleString("en-BD", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </time>
                    {e.note && <p className="text-[13px] font-normal text-muted-foreground">{e.note}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>

        <div className="text-center pt-8">
          <Link
            to="/store/$slug/account"
            search={{ tab: "orders" }}
            params={{ slug }}
            className="inline-flex h-[46px] items-center justify-center rounded-md border border-border/60 bg-background px-8 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/30"
          >
            {t("View all orders", "সব অর্ডার দেখুন")}
          </Link>
        </div>
      </main>
    </div>
    }
  />
</PluginLayer>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd className={`money ${strong ? "font-bold" : ""}`}>{value}</dd>
    </div>
  );
}
