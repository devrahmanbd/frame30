import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { getStoreChrome } from "@/lib/storefront.functions";
import { useMutation } from "@tanstack/react-query";
import { StoreHeader } from "@/components/store/StoreHeader";
import {
  placeOrder,
  quoteCart,
  releaseCheckout,
  reserveCheckout,
} from "@/lib/storefront.functions";
import { startCharge } from "@/lib/payments.functions";
import { fmtMinor } from "@/lib/money";
import { useCart } from "@/lib/cart";
import { useLang } from "@/lib/i18n";
import { trackEvent } from "@/lib/traffic-client";
import {
  PAYMENT_METHOD_CATALOG,
  type PaymentMethodKey,
  groupMethods,
  methodLabel,
} from "@/lib/payment-rails";

type Method = PaymentMethodKey;

/** Rails read very differently to a shopper, so they are labelled, not merged. */
const GROUP_LABELS: Record<string, { en: string; bn: string }> = {
  cod: { en: "Pay on delivery", bn: "ডেলিভারিতে পেমেন্ট" },
  mfs: { en: "Mobile wallet", bn: "মোবাইল ওয়ালেট" },
  bank: { en: "Bank", bn: "ব্যাংক" },
  card: { en: "Card", bn: "কার্ড" },
  aggregator: { en: "All methods in one", bn: "সব মেথড একসাথে" },
};

export const Route = createFileRoute("/store/$slug/checkout")({
  // Checkout wears the active theme like every other storefront page, so the
  // store's header, footer and tokens stay put at the moment a shopper pays.
  loader: async ({ params }) => {
    const chrome = await getStoreChrome({
      data: { slug: params.slug, template: "checkout" },
    });
    if (!chrome) throw notFound();
    return chrome;
  },
  head: () => ({
    meta: [
      { title: "Checkout — secure order placement" },
      {
        name: "description",
        content:
          "Review your cart and place your order with cash on delivery or mobile payment.",
      },
      { property: "og:title", content: "Checkout" },
      {
        property: "og:description",
        content: "Server-validated totals with VAT and delivery included.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { t, lang } = useLang();
  const { slug } = Route.useParams();
  const { merchant, ast, tokens, siteKit, installedPlugins } =
    Route.useLoaderData();
  const navigate = useNavigate();
  const { lines, setQuantity, clear, hydrated } = useCart(slug);
  const [method, setMethod] = useState<Method>("cod");
  const [chargeFailed, setChargeFailed] = useState(false);
  const [quote, setQuote] = useState<Awaited<
    ReturnType<typeof quoteCart>
  > | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const checkoutToken = useMemo(
    () =>
      `${slug}-hold-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    [slug],
  );
  const idempotencyKey = useMemo(
    () =>
      `${slug}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    [slug],
  );

  // Funnel step: checkout started, recorded once the cart is known to hold
  // something. Nothing shopper-identifying is sent.
  useEffect(() => {
    if (hydrated && lines.length > 0) {
      trackEvent({
        entity: "checkout",
        action: "start",
        payload: { lines: lines.length },
      });
    }
  }, [hydrated, lines.length]);

  useEffect(() => {
    let cancelled = false;
    if (!hydrated || lines.length === 0) {
      setQuote(null);
      return;
    }
    setQuoteError(null);
    quoteCart({ data: { slug, cart: lines, paymentMethod: method } })
      .then((res) => !cancelled && setQuote(res))
      .catch((e: Error) => !cancelled && setQuoteError(e.message));
    // Reserve the units while the shopper fills the form; the hold expires on its own.
    reserveCheckout({ data: { slug, cart: lines, checkoutToken } })
      .then((res) => !cancelled && setHoldExpiresAt(res.expires_at))
      .catch(() => !cancelled && setHoldExpiresAt(null));
    return () => {
      cancelled = true;
    };
  }, [hydrated, lines, method, slug, checkoutToken]);

  useEffect(() => {
    return () => {
      void releaseCheckout({ data: { checkoutToken } }).catch(() => undefined);
    };
  }, [checkoutToken]);

  // Passive bot-signal beacon: interaction counters only, no fingerprinting.
  const beaconRef = useRef({
    startedAt: Date.now(),
    interactions: 0,
    pointerMoves: 0,
  });
  useEffect(() => {
    const b = beaconRef.current;
    b.startedAt = Date.now();
    const onInteract = () => {
      b.interactions += 1;
    };
    const onMove = () => {
      b.pointerMoves += 1;
    };
    window.addEventListener("keydown", onInteract, { passive: true });
    window.addEventListener("click", onInteract, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("keydown", onInteract);
      window.removeEventListener("click", onInteract);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const b = beaconRef.current;
      return placeOrder({
        data: {
          slug,
          cart: lines,
          paymentMethod: method,
          idempotencyKey,
          checkoutToken,
          honeypot: String(form.get("company_website") ?? ""),
          beacon: {
            userAgent: navigator.userAgent.slice(0, 400),
            interactions: b.interactions,
            pointerMoves: b.pointerMoves,
            dwellMs: Date.now() - b.startedAt,
            webdriver: Boolean(navigator.webdriver),
          },
          customer: {
            name: String(form.get("name") ?? ""),
            phone: String(form.get("phone") ?? ""),
            email: String(form.get("email") ?? ""),
            addressLine: String(form.get("address") ?? ""),
            city: String(form.get("city") ?? ""),
            postcode: String(form.get("postcode") ?? ""),
            note: String(form.get("note") ?? ""),
          },
        },
      });
    },

    onSuccess: async (res) => {
      clear();
      if (method !== "cod") {
        // Hand the shopper to the provider rail. Only the signed return can mark
        // the order paid, so a failed hop just leaves it awaiting payment.
        try {
          const charge = await startCharge({
            data: {
              slug,
              orderId: res.orderId,
              idempotencyKey: `chg-${idempotencyKey}`,
            },
          });
          if (charge.redirectUrl) {
            window.location.assign(charge.redirectUrl);
            return;
          }
        } catch {
          setChargeFailed(true);
        }
      }
      void navigate({
        to: "/store/$slug/order/$orderId",
        params: { slug, orderId: res.orderId },
        search: { t: res.accessToken },
      });
    },
  });

  const totals = quote?.totals;

  // The server decides which rails this store may offer; the picker only
  // renders that answer. Before the first quote lands we assume nothing.
  const offered = useMemo<Method[]>(
    () => (quote?.settings.methods as Method[] | undefined) ?? ["cod"],
    [quote],
  );
  const methodGroups = useMemo(() => groupMethods(offered), [offered]);
  useEffect(() => {
    // A rail can disappear between quotes (credential suspended); never leave a
    // dead selection in place or the order will be rejected on submit.
    if (offered.length > 0 && !offered.includes(method)) setMethod(offered[0]!);
  }, [offered, method]);

  return (
    <PluginLayer plugins={installedPlugins}>
      <ThemeChrome
        template="checkout"
        storeSlug={slug}
        merchantId={merchant.id}
        // The checkout form is hand-built (server-quoted totals, live rails), so
        // the theme contributes the header, footer and tokens only.
        ast={ast ? { header: ast.header, main: [], footer: ast.footer } : null}
        tokens={tokens}
        siteKit={siteKit}
        ownsPrimary
        chrome={<StoreHeader slug={slug} name={merchant.name} />}
        containerClassName=""
        fallback={
          <div className="mx-auto grid max-w-[var(--fq-container,1280px)] gap-12 px-4 py-12 lg:grid-cols-[1.5fr_1fr] lg:gap-16 sm:px-6 lg:px-8">
            <section className="order-2 lg:order-1">
              <h1 className="font-bangla-display text-3xl font-medium tracking-wide text-foreground/90">
                {t("Checkout", "চেকআউট")}
              </h1>

              <h2 className="mt-10 text-[11px] font-bold fq-caps tracking-widest text-muted-foreground border-b border-border/60 pb-3">
                {t("Your Cart", "আপনার কার্ট")}
              </h2>
              {!hydrated ? null : lines.length === 0 ? (
                <p className="mt-4 text-[13.5px] text-muted-foreground">
                  Your cart is empty.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-border/60">
                  {(totals?.lines ?? []).map((l) => (
                    <li
                      key={l.variantId}
                      className="flex items-center gap-4 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium leading-relaxed">
                          {l.productTitle}
                        </p>
                        <p className="text-[12px] font-medium tracking-wide text-muted-foreground mt-0.5">
                          {l.variantName}
                        </p>
                      </div>
                      <label className="sr-only" htmlFor={`qty-${l.variantId}`}>
                        Quantity for {l.productTitle}
                      </label>
                      <input
                        id={`qty-${l.variantId}`}
                        type="number"
                        min={0}
                        max={l.stock}
                        value={l.quantity}
                        onChange={(e) =>
                          setQuantity(l.variantId, Number(e.target.value))
                        }
                        className="h-10 w-16 bg-transparent border-b border-border/60 text-center text-[13px] font-medium focus:outline-none focus:border-foreground transition-colors"
                      />
                      <span className="money w-24 text-right text-[13.5px] font-semibold tracking-wide">
                        {fmtMinor(l.lineTotalMinor, totals?.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {quoteError && (
                <p
                  role="alert"
                  className="mt-3 rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground"
                >
                  {quoteError}
                </p>
              )}

              <form
                className="mt-12 grid gap-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(new FormData(e.currentTarget));
                }}
              >
                <h2 className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground border-b border-border/60 pb-3">
                  {t("Delivery Information", "ডেলিভারি তথ্য")}
                </h2>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field
                    name="name"
                    label={t("Full name", "নাম / Full name")}
                    required
                  />
                  <Field
                    name="phone"
                    label={t("Phone", "মোবাইল / Phone")}
                    required
                    inputMode="tel"
                  />
                  <Field
                    name="email"
                    label={t("Email (optional)", "ইমেইল / Email (optional)")}
                    type="email"
                  />
                  <Field name="city" label={t("City", "শহর / City")} required />
                  <Field
                    name="postcode"
                    label={t("Postcode", "পোস্টকোড / Postcode")}
                  />
                </div>
                <Field
                  name="address"
                  label={t("Address", "ঠিকানা / Address")}
                  required
                />
                <Field name="note" label={t("Note", "নোট / Note")} />

                {/* Honeypot: hidden from people and assistive tech, filled only by bots. */}
                <div
                  aria-hidden="true"
                  className="absolute left-[-9999px] h-0 w-0 overflow-hidden"
                >
                  <label htmlFor="company_website">Company website</label>
                  <input
                    id="company_website"
                    name="company_website"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                <fieldset className="mt-6">
                  <legend className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground border-b border-border/60 pb-3 mb-4 w-full">
                    {t("Payment Method", "পেমেন্ট মেথড")}
                  </legend>
                  {methodGroups.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t(
                        "This store has not enabled any payment method yet.",
                        "এই দোকান এখনও কোনো পেমেন্ট মেথড চালু করেনি।",
                      )}
                    </p>
                  ) : (
                    methodGroups.map((group) => (
                      <div key={group.layer} className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t(
                            GROUP_LABELS[group.layer].en,
                            GROUP_LABELS[group.layer].bn,
                          )}
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          {group.methods.map((m) => (
                            <label
                              key={m}
                              className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-fq-md border px-3 text-sm ${
                                method === m
                                  ? "border-primary bg-info-soft"
                                  : "border-border bg-card"
                              }`}
                            >
                              <input
                                type="radio"
                                name="method"
                                value={m}
                                checked={method === m}
                                onChange={() => setMethod(m)}
                              />
                              <span>
                                {methodLabel(m, lang === "bn" ? "bn" : "en")}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                  {/* Aggregators bounce the shopper out, so say so before they commit. */}
                  {PAYMENT_METHOD_CATALOG[method].layer === "aggregator" && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t(
                        `You will finish this payment on the ${PAYMENT_METHOD_CATALOG[method].label} page, where you can pay by card, internet banking or any mobile wallet.`,
                        `${PAYMENT_METHOD_CATALOG[method].labelBn} পেজে গিয়ে পেমেন্ট সম্পন্ন করবেন — কার্ড, ইন্টারনেট ব্যাংকিং বা যেকোনো মোবাইল ওয়ালেট দিয়ে।`,
                      )}
                    </p>
                  )}
                </fieldset>

                {mutation.isError && (
                  <p
                    role="alert"
                    className="rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground"
                  >
                    {(mutation.error as Error).message === "order_blocked_risk"
                      ? t(
                          "We could not complete this order. Please contact the store to continue.",
                          "এই অর্ডারটি সম্পন্ন করা যায়নি। এগোতে দোকানের সাথে যোগাযোগ করুন।",
                        )
                      : (mutation.error as Error).message}
                  </p>
                )}

                {chargeFailed && (
                  <p
                    role="alert"
                    className="rounded-fq-md bg-warning-soft p-3 text-sm text-warning-foreground"
                  >
                    {t(
                      "Order placed, but the payment rail could not be reached. Pay again from the order page.",
                      "অর্ডার হয়েছে, তবে পেমেন্ট গেটওয়েতে পৌঁছানো যায়নি। অর্ডার পেজ থেকে আবার পেমেন্ট করুন।",
                    )}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!totals || mutation.isPending}
                  className="min-h-14 mt-4 w-full bg-foreground px-8 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                >
                  {mutation.isPending
                    ? t("Processing…", "প্রসেসিং…")
                    : t("Confirm Order", "অর্ডার নিশ্চিত করুন")}
                </button>
              </form>
            </section>

            <aside className="h-fit bg-muted/20 p-6 lg:p-8 lg:sticky lg:top-24 order-1 lg:order-2">
              <h2 className="text-[11px] font-bold fq-caps tracking-widest text-foreground border-b border-border/60 pb-4">
                {t("Order Summary", "সারসংক্ষেপ")}
              </h2>
              <dl className="mt-6 space-y-4 text-sm">
                <Row
                  label="Subtotal"
                  value={fmtMinor(totals?.subtotalMinor ?? 0, totals?.currency)}
                />
                <Row
                  label="Delivery"
                  value={fmtMinor(totals?.shippingMinor ?? 0, totals?.currency)}
                />
                {(totals?.codSurchargeMinor ?? 0) > 0 && (
                  <Row
                    label="COD surcharge"
                    value={fmtMinor(
                      totals!.codSurchargeMinor,
                      totals?.currency,
                    )}
                  />
                )}
                <Row
                  label={`VAT (${((totals?.vatRateBasisPoints ?? 0) / 100).toFixed(1)}%)${
                    totals?.vatMode === "inclusive"
                      ? " · included in prices"
                      : ""
                  }`}
                  value={fmtMinor(totals?.vatMinor ?? 0, totals?.currency)}
                />
                <Row
                  label="Total (incl. VAT)"
                  value={fmtMinor(totals?.totalMinor ?? 0, totals?.currency)}
                  strong
                  className="border-t border-border pt-2"
                />
              </dl>
              {holdExpiresAt && (
                <p className="mt-3 rounded-fq-md bg-warning-soft p-2 text-xs text-warning-foreground">
                  {t("Items reserved until", "আইটেম রিজার্ভ আছে")}{" "}
                  {new Date(holdExpiresAt).toLocaleTimeString("en-BD", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Totals are calculated on the server from live prices and the
                legal VAT table.
              </p>
            </aside>
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
  className = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <dt className={strong ? "font-bold text-[13px] fq-caps tracking-widest text-foreground" : "text-[13px] font-medium tracking-wide text-muted-foreground"}>
        {label}
      </dt>
      <dd className={`money ${strong ? "text-[14px] font-bold text-foreground tracking-wide" : "text-[13.5px] font-semibold text-foreground tracking-wide"}`}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  name,
  label,
  required,
  type = "text",
  inputMode,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  inputMode?: "tel" | "text";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11.5px] font-bold fq-caps tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        inputMode={inputMode}
        className="h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] font-medium text-foreground focus:border-foreground focus:outline-none transition-colors placeholder:text-muted-foreground/30"
      />
    </label>
  );
}
