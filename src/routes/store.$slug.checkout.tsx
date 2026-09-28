import { useEffect, useMemo, useRef, useState } from "react";
import {
  createFileRoute,
  notFound,
  useNavigate,
  Link,
} from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { getStoreChrome } from "@/lib/storefront.functions";
import { useMutation } from "@tanstack/react-query";
import {
  StoreHeader,
  MinimalCheckoutHeader,
} from "@/components/store/StoreHeader";
import {
  placeOrder,
  quoteCart,
  releaseCheckout,
  reserveCheckout,
} from "@/lib/storefront.functions";
import { startCharge } from "@/lib/payments.functions";
import {
  clearCheckoutSessionKey,
  getCheckoutSessionKey,
} from "@/lib/payment-keys";
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
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { t, lang } = useLang();
  const { slug } = Route.useParams();
  const { merchant, ast, tokens, siteKit, installedPlugins, themeKey } =
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
  // One order key per checkout session: persisted in sessionStorage so a
  // remount or refresh resubmits the SAME key (server replays) instead of
  // minting a duplicate order. Rotated on successful placement below.
  const [idempotencyKey] = useState(() => getCheckoutSessionKey(slug));

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
      // The order is placed: retire the session key so the next checkout in
      // this tab cannot replay this order's idempotency key.
      clearCheckoutSessionKey(slug);
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
        themeKey={themeKey ?? null}
        merchantId={merchant.id}
        // The checkout form is hand-built (server-quoted totals, live rails), so
        // the theme contributes the tokens only. We drop the normal header and footer.
        ast={null}
        tokens={tokens}
        siteKit={siteKit}
        ownsPrimary
        chrome={
          <MinimalCheckoutHeader
            slug={slug}
            name={merchant.name}
            themeKey={themeKey ?? null}
          />
        }
        containerClassName="bg-muted/10 min-h-screen pb-24"
        fallback={
          <div className="mx-auto grid max-w-[var(--fq-container,1280px)] gap-12 px-4 py-8 lg:grid-cols-[1.5fr_1fr] lg:gap-16 sm:px-6 lg:px-8">
            <section className="order-2 lg:order-1 pt-4">
              <nav className="mb-10 flex items-center gap-3 text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
                <Link
                  to="/store/$slug/cart"
                  params={{ slug }}
                  className="hover:text-foreground transition-colors"
                >
                  {t("Cart", "কার্ট")}
                </Link>
                <span className="text-border">/</span>
                <span className="text-foreground">{t("Details", "বিবরণ")}</span>
                <span className="text-border">/</span>
                <span>{t("Payment", "পেমেন্ট")}</span>
              </nav>

              <form
                className="grid gap-10"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(new FormData(e.currentTarget));
                }}
              >
                <div>
                  <h2 className="text-[16px] font-semibold tracking-tight text-foreground mb-6">
                    {t("Contact Information", "যোগাযোগের তথ্য")}
                  </h2>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      name="email"
                      label={t("Email (optional)", "ইমেইল / Email (optional)")}
                      type="email"
                    />
                    <Field
                      name="phone"
                      label={t("Phone", "মোবাইল / Phone")}
                      required
                      inputMode="tel"
                    />
                  </div>
                </div>

                <div>
                  <h2 className="text-[16px] font-semibold tracking-tight text-foreground mb-6 pt-8 border-t border-border/40">
                    {t("Delivery Address", "ডেলিভারি ঠিকানা")}
                  </h2>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      name="name"
                      label={t("Full name", "নাম / Full name")}
                      required
                      className="sm:col-span-2"
                    />
                    <Field
                      name="address"
                      label={t("Address", "ঠিকানা / Address")}
                      required
                      className="sm:col-span-2"
                    />
                    <Field
                      name="city"
                      label={t("City", "শহর / City")}
                      required
                    />
                    <Field
                      name="postcode"
                      label={t("Postcode", "পোস্টকোড / Postcode")}
                    />
                    <Field
                      name="note"
                      label={t("Note", "নোট / Note")}
                      className="sm:col-span-2"
                    />
                  </div>
                </div>

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

                <fieldset>
                  <legend className="text-[16px] font-semibold tracking-tight text-foreground mb-6 pt-8 border-t border-border/40 w-full">
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
                    <div className="grid gap-6">
                      {methodGroups.map((group) => (
                        <div key={group.layer}>
                          <p className="text-xs font-medium text-muted-foreground mb-3">
                            {t(
                              GROUP_LABELS[group.layer].en,
                              GROUP_LABELS[group.layer].bn,
                            )}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {group.methods.map((m) => (
                              <label
                                key={m}
                                className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-fq-md border px-4 text-[13.5px] font-medium transition-colors ${
                                  method === m
                                    ? "border-primary bg-primary/[0.03]"
                                    : "border-border bg-background hover:border-border/80"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="method"
                                  value={m}
                                  checked={method === m}
                                  onChange={() => setMethod(m)}
                                  className="h-4 w-4 text-primary focus:ring-primary border-border"
                                />
                                <span>
                                  {methodLabel(m, lang === "bn" ? "bn" : "en")}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Aggregators bounce the shopper out, so say so before they commit. */}
                  {PAYMENT_METHOD_CATALOG[method].layer === "aggregator" && (
                    <p className="mt-4 text-[13px] text-muted-foreground">
                      {t(
                        `You will finish this payment on the ${PAYMENT_METHOD_CATALOG[method].label} page, where you can pay by card, internet banking or any mobile wallet.`,
                        `${PAYMENT_METHOD_CATALOG[method].labelBn} পেজে গিয়ে পেমেন্ট সম্পন্ন করবেন — কার্ড, ইন্টারনেট ব্যাংকিং বা যেকোনো মোবাইল ওয়ালেট দিয়ে।`,
                      )}
                    </p>
                  )}
                </fieldset>

                {quoteError && (
                  <p
                    role="alert"
                    className="rounded-fq-md bg-danger-soft p-4 text-[13.5px] text-danger-foreground font-medium"
                  >
                    {quoteError}
                  </p>
                )}

                {mutation.isError && (
                  <p
                    role="alert"
                    className="rounded-fq-md bg-danger-soft p-4 text-[13.5px] text-danger-foreground font-medium"
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
                    className="rounded-fq-md bg-warning-soft p-4 text-[13.5px] text-warning-foreground font-medium"
                  >
                    {t(
                      "Order placed, but the payment rail could not be reached. Pay again from the order page.",
                      "অর্ডার হয়েছে, তবে পেমেন্ট গেটওয়েতে পৌঁছানো যায়নি। অর্ডার পেজ থেকে আবার পেমেন্ট করুন।",
                    )}
                  </p>
                )}

                <div className="pt-8 border-t border-border/40">
                  <button
                    type="submit"
                    disabled={!totals || mutation.isPending}
                    className="min-h-14 w-full rounded-fq-md bg-foreground px-8 text-[13.5px] font-bold fq-caps tracking-widest text-background shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                  >
                    {mutation.isPending
                      ? t("Processing…", "প্রসেসিং…")
                      : t("Place Order", "অর্ডার কনফার্ম করুন")}
                  </button>
                </div>
              </form>
            </section>

            <aside className="order-1 lg:order-2">
              <div className="bg-background border border-border/40 rounded-fq-lg p-6 lg:p-8 shadow-sm lg:sticky lg:top-24">
                <h2 className="text-[16px] font-semibold tracking-tight text-foreground mb-6">
                  {t("Order Summary", "সারসংক্ষেপ")}
                </h2>

                {!hydrated ? null : lines.length === 0 ? (
                  <p className="mt-4 text-[13.5px] text-muted-foreground">
                    Your cart is empty.
                  </p>
                ) : (
                  <ul className="mb-6 divide-y divide-border/40 border-b border-border/40 pb-6">
                    {(totals?.lines ?? []).map((l) => (
                      <li
                        key={l.variantId}
                        className="flex items-start gap-4 py-4 first:pt-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium leading-relaxed text-foreground">
                            {l.productTitle}
                          </p>
                          <p className="text-[12px] font-medium tracking-wide text-muted-foreground mt-1">
                            {l.variantName}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <label
                              className="sr-only"
                              htmlFor={`qty-${l.variantId}`}
                            >
                              Quantity
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
                              className="h-8 w-14 rounded border border-border/60 bg-transparent text-center text-[13px] font-medium focus:border-foreground focus:outline-none transition-colors"
                            />
                            <span className="text-[12px] text-muted-foreground">
                              ×
                            </span>
                            <span className="money text-[13px] font-medium text-foreground">
                              {fmtMinor(
                                Math.round(l.lineTotalMinor / l.quantity),
                                totals?.currency,
                              )}
                            </span>
                          </div>
                        </div>
                        <span className="money text-right text-[14px] font-semibold tracking-wide text-foreground mt-1">
                          {fmtMinor(l.lineTotalMinor, totals?.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <dl className="space-y-3.5 text-sm">
                  <Row
                    label="Subtotal"
                    value={fmtMinor(
                      totals?.subtotalMinor ?? 0,
                      totals?.currency,
                    )}
                  />
                  <Row
                    label="Delivery"
                    value={fmtMinor(
                      totals?.shippingMinor ?? 0,
                      totals?.currency,
                    )}
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
                    label="Total"
                    value={fmtMinor(totals?.totalMinor ?? 0, totals?.currency)}
                    strong
                    className="border-t border-border/40 pt-4 mt-2"
                  />
                </dl>
                {holdExpiresAt && (
                  <p className="mt-6 rounded bg-warning-soft p-3 text-[12.5px] font-medium text-warning-foreground text-center">
                    {t("Items reserved until", "আইটেম রিজার্ভ আছে")}{" "}
                    {new Date(holdExpiresAt).toLocaleTimeString("en-BD", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
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
      <dt
        className={
          strong
            ? "font-bold text-[13px] fq-caps tracking-widest text-foreground"
            : "text-[13px] font-medium tracking-wide text-muted-foreground"
        }
      >
        {label}
      </dt>
      <dd
        className={`money ${strong ? "text-[14px] font-bold text-foreground tracking-wide" : "text-[13.5px] font-semibold text-foreground tracking-wide"}`}
      >
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
  className = "",
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  inputMode?: "tel" | "text";
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-[11.5px] font-bold fq-caps tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        inputMode={inputMode}
        className="h-[46px] w-full rounded-fq-md border border-border/60 bg-transparent px-3 text-[14px] font-medium text-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-all placeholder:text-muted-foreground/30"
      />
    </label>
  );
}
