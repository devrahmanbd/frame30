import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  createFileRoute,
  notFound,
  useNavigate,
  Link,
} from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import type { StorefrontSiteKit } from "@/components/store/SiteKitTags";
import { PluginLayer } from "@/components/store/PluginLayer";
import { getStoreChrome } from "@/lib/storefront.functions";
import {
  StorefrontError,
  isStorefrontInfrastructureError,
  normalizeStorefrontLoaderError,
} from "@/components/store/StorefrontError";
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
import { checkoutShellControls } from "@/lib/theme-shell-slots";
import type { ThemeAst, ThemeTokens } from "@/lib/builder-ast";
import { useCart } from "@/lib/cart";
import { useCartContext } from "@/components/builder/CartContext";
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

/** Legacy entropy for runtimes without WebCrypto randomUUID (see mintCheckoutToken). */
function legacyHoldSuffix(): string {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Unpredictable checkout-hold token. The `${slug}-hold-` prefix shape is
 * kept (recognizable in logs; parsed by nothing — the server matches the
 * full token AND the merchant scope), but the random part is
 * `crypto.randomUUID` entropy (dash-stripped, per the payment-keys
 * convention), never guessable `Math.random`+`Date.now`.
 */
export function mintCheckoutToken(slug: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${slug}-hold-${uuid ? uuid.replace(/-/g, "") : legacyHoldSuffix()}`;
}

export type PendingOrder = {
  orderId: string;
  accessToken: string;
  placedAt: number;
};

/** Rescue window for a stranded checkout: one day, then the key expires. */
export const PENDING_ORDER_TTL_MS = 24 * 60 * 60 * 1000;

type PendingOrderStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function pendingOrderStorage(
  fallback?: PendingOrderStore,
): PendingOrderStore | null {
  if (fallback) return fallback;
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      // Touch it once: private-mode Safari throws on access, not on read.
      window.sessionStorage.getItem("__fq_probe__");
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
  return null;
}

export function pendingOrderKeyName(slug: string): string {
  return `fq-pending-order:${slug}`;
}

/**
 * Persisted BEFORE the charge hop so a network drop never strands the
 * shopper: the order already exists server-side from here on, and the banner
 * can link straight back to it.
 */
export function savePendingOrder(
  slug: string,
  pending: { orderId: string; accessToken: string },
  store?: PendingOrderStore,
): void {
  const s = pendingOrderStorage(store);
  if (!s) return;
  try {
    s.setItem(
      pendingOrderKeyName(slug),
      JSON.stringify({ ...pending, placedAt: Date.now() }),
    );
  } catch {
    // Storage full/blocked: the order still exists server-side.
  }
}

/** Fresh pending order for this tab, or null when none/malformed/stale. */
export function readPendingOrder(
  slug: string,
  store?: PendingOrderStore,
): PendingOrder | null {
  const s = pendingOrderStorage(store);
  if (!s) return null;
  let raw: string | null;
  try {
    raw = s.getItem(pendingOrderKeyName(slug));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingOrder>;
    if (
      typeof parsed.orderId !== "string" ||
      !parsed.orderId ||
      typeof parsed.accessToken !== "string" ||
      !parsed.accessToken ||
      typeof parsed.placedAt !== "number"
    )
      return null;
    if (Date.now() - parsed.placedAt > PENDING_ORDER_TTL_MS) return null;
    return {
      orderId: parsed.orderId,
      accessToken: parsed.accessToken,
      placedAt: parsed.placedAt,
    };
  } catch {
    return null;
  }
}

/** Retired once the shopper reaches the order page, or on banner dismiss. */
export function clearPendingOrder(
  slug: string,
  store?: PendingOrderStore,
): void {
  try {
    pendingOrderStorage(store)?.removeItem(pendingOrderKeyName(slug));
  } catch {
    // Best-effort: a stale key merely expires via TTL.
  }
}

export const Route = createFileRoute("/store/$slug/checkout")({
  // Checkout wears the active theme like every other storefront page, so the
  // store's header, footer and tokens stay put at the moment a shopper pays.
  loader: async ({ params }) => {
    let chrome;
    try {
      chrome = await getStoreChrome({
        data: { slug: params.slug, template: "checkout" },
      });
    } catch (err) {
      // Infrastructure blips (5xx/timeout) reach the shared errorComponent
      // with retry; only a null payload below becomes a 404.
      if (!isStorefrontInfrastructureError(err)) throw err;
      throw normalizeStorefrontLoaderError(err);
    }
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
  errorComponent: StorefrontError,
  notFoundComponent: CheckoutMissing,
});

function CheckoutMissing() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">
        {t("Store not found", "দোকান পাওয়া যায়নি")}
      </h1>
    </main>
  );
}

/**
 * The checkout route's shell.
 *
 * Decision **D2'**: the theme's `checkout` composition is the PRODUCTION
 * shell — the progress trail, the payment block and the order summary, all
 * of them PLATFORM widgets reading the server's quote. The route keeps the
 * form, the customer fields, the server quote, the validation, the stock hold
 * and the order write; they reach the theme's frame through the platform's
 * route-owned body slot (`contentSlot`), exactly as the authored page's body
 * does.
 *
 * A store whose theme publishes NO checkout body gets today's hand-built
 * checkout, unchanged — that is the `fallback` in `CheckoutShell` below.
 */
function CheckoutPage() {
  const { merchant, ast, tokens, siteKit, installedPlugins, themeKey } =
    Route.useLoaderData();
  const { slug } = Route.useParams();

  return (
    <PluginLayer plugins={installedPlugins}>
      <CheckoutShell
        slug={slug}
        store={{ merchant, ast, tokens, siteKit, themeKey }}
        chrome={
          <MinimalCheckoutHeader
            slug={slug}
            name={merchant.name}
            themeKey={themeKey ?? null}
          />
        }
        containerClassName="bg-muted/10 min-h-screen pb-24"
      />
    </PluginLayer>
  );
}

/**
 * The production checkout's SHELL — the theme's composition around the
 * platform's own form.
 *
 * Exported so the DOM-order pin renders the PRODUCTION wiring itself rather
 * than a restatement of it
 * (`src/routes/checkout-dom-order.test.tsx`).
 */
export function CheckoutShell({
  slug,
  store,
  chrome,
  containerClassName,
}: {
  slug: string;
  store: {
    merchant: { id: string };
    ast: ThemeAst | null;
    tokens: ThemeTokens | null;
    siteKit: StorefrontSiteKit | null;
    themeKey: string | null;
  };
  chrome: ReactNode;
  containerClassName: string;
}) {
  const { merchant, ast, tokens, siteKit, themeKey } = store;
  // The two controls a checkout cannot be without: the PAYMENT PICKER and
  // the ORDER SUMMARY. The theme's body may carry them — `payment_methods`
  // and `cart_summary` are platform widgets that read the live cart — or it
  // may not. A body that carries NEITHER would leave the shopper placing an
  // order with no rail chosen (the order would silently go out on the
  // shared cart's initial "cod") and no total shown, so the route supplies
  // its OWN picker and its OWN summary when the theme's body carries none.
  // The account route's pattern, applied to the checkout.
  //
  // The helper sees the sections wherever they sit — the songoskriti
  // composition nests them in columns and containers — knows that an
  // `invalid` section is skipped by the renderer, and knows that a body
  // without the route-owned body slot is dropped whole.
  const shellControls = checkoutShellControls(ast, "shell");
  const fallbackControls = checkoutShellControls(ast, "fallback");

  // The place-order ACTION renders AFTER the theme's band (the payment block
  // and the order summary) — the shopper meets the address first, then the
  // rail, then the total, and only then the button. Its state (the server
  // quote, the pending mutation, the charge hop) belongs to the FORM, which
  // owns the order write, so the form reports it up.
  const { t } = useLang();
  const [submit, setSubmit] = useState<CheckoutSubmitState>(() => ({
    label: t("Place Order", "অর্ডার কনফার্ম করুন"),
    disabled: true,
    notice: null,
  }));
  const reportSubmit = useCallback((next: CheckoutSubmitState) => {
    setSubmit((prev) =>
      prev.label === next.label &&
      prev.disabled === next.disabled &&
      prev.notice === next.notice
        ? prev
        : next,
    );
  }, []);
  // The form's own id — the action names it through the HTML form owner, so
  // it can submit the route's form while living outside the form element.
  const formId = `fq-checkout-form-${slug}`;

  return (
    <ThemeChrome
      template="checkout"
      storeSlug={slug}
      themeKey={themeKey}
      merchantId={merchant.id}
      ast={ast}
      tokens={tokens}
      siteKit={siteKit}
      ownsPrimary
      // The route's own body — the checkout FORM — flows through the
      // platform's route-owned body slot. The theme's body renders only
      // when it declares that slot, so a theme-less store keeps today's
      // hand-built checkout (the `fallback`).
      contentSlot="page_content"
      contextSlots={{
        // The five cart slots the theme's checkout body reads: the lines,
        // the summary, the drawer, the trail and the payment block. `null`
        // is the platform's "granted" token — the widgets read the live
        // cart themselves.
        cart_lines: null,
        cart_summary: null,
        cart_drawer: null,
        checkout_steps: null,
        payment_methods: null,
        page_content: (
          <CheckoutBody
            slug={slug}
            variant="shell"
            formId={formId}
            showPaymentPicker={shellControls.showPaymentPicker}
            showSummary={shellControls.showSummary}
            submitTrailing={shellControls.submitAfterBody}
            onSubmitState={reportSubmit}
          />
        ),
      }}
      chrome={chrome}
      containerClassName={containerClassName}
      // The route's own trailing action — AFTER the theme's band, so the
      // shopper meets the button after the rail and the total.
      afterBody={
        shellControls.submitAfterBody ? (
          <div className="mx-auto max-w-[var(--fq-container,1280px)] px-4 pb-10 pt-2 sm:px-6 lg:px-8">
            <CheckoutSubmit state={submit} formId={formId} />
          </div>
        ) : null
      }
      fallback={
        <CheckoutBody
          slug={slug}
          variant="fallback"
          formId={formId}
          showPaymentPicker={fallbackControls.showPaymentPicker}
          showSummary={fallbackControls.showSummary}
        />
      }
    />
  );
}

/**
 * The place-order ACTION's state.
 *
 * The action renders after the theme's band, but the state that drives it —
 * the server quote, the pending mutation and the charge hop — belongs to the
 * form, which owns the order write. The form REPORTS this triple up; the
 * route renders the action.
 */
export type CheckoutSubmitState = {
  /** The action's label. */
  label: string;
  /** True while the shopper may not submit (no quote yet, or an order in flight). */
  disabled: boolean;
  /** The live-region notice under the action while the order is in flight. */
  notice: string | null;
};

/**
 * The place-order ACTION — the route's own submit button.
 *
 * It renders AFTER the theme's band when the theme's body carries one (the
 * production shell), so the shopper meets it last: the address first, then the
 * rail, then the total, then the button. It is the route's own, and it
 * submits the route's own FORM through the HTML form owner (`form="…"`), so
 * it can live outside the form element and still submit it — the browser
 * still validates the form's own fields and still treats this button as the
 * form's default button.
 */
function CheckoutSubmit({
  state,
  formId,
}: {
  state: CheckoutSubmitState;
  formId: string;
}) {
  return (
    <div className="pt-8 border-t border-border/40">
      <button
        type="submit"
        form={formId}
        disabled={state.disabled}
        className="min-h-14 w-full rounded-fq-md bg-foreground px-8 text-[13.5px] font-bold fq-caps tracking-widest text-background shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
      >
        {state.label}
      </button>
      {state.notice ? (
        <p
          aria-live="polite"
          className="mt-3 text-center text-[12.5px] text-muted-foreground"
        >
          {state.notice}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The checkout body — the platform's own form, in two shapes.
 *
 * - `fallback` — today's complete hand-built checkout (the progress trail,
 *   the form WITH the payment picker and the order summary aside). A store
 *   whose theme publishes no checkout body sees exactly this, byte for byte.
 * - `shell` — the form alone: the customer fields, the validation messages
 *   and the place-order action. The theme's frame supplies the trail, the
 *   payment picker and the order summary around it.
 *
 * **The payment method is the SHARED cart's**, never a private copy: the
 * platform's `payment_methods` widget writes `cart.setMethod`, so the route
 * reads the same value back and the order is placed with the rail the
 * shopper actually chose.
 */
function CheckoutBody({
  slug,
  variant,
  formId,
  showPaymentPicker,
  showSummary,
  submitTrailing = false,
  onSubmitState,
}: {
  slug: string;
  variant: "shell" | "fallback";
  formId: string;
  showPaymentPicker: boolean;
  showSummary: boolean;
  /**
   * True when the place-order ACTION renders in the route's trailing slot
   * (after the theme's band) rather than inside this form. The action then
   * submits this form through the HTML form owner.
   */
  submitTrailing?: boolean;
  /** Reports the action's state up to the route's trailing slot. */
  onSubmitState?: (next: CheckoutSubmitState) => void;
}) {
  const { t, lang } = useLang();
  const cart = useCartContext();
  const navigate = useNavigate();
  const { lines, setQuantity, clear, hydrated } = useCart(slug);
  const method = cart.method;
  const [chargeFailed, setChargeFailed] = useState(false);
  // Rescue: an order placed in this tab whose charge hop never completed
  // (network drop). Read post-hydration so SSR and first paint agree.
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  useEffect(() => {
    setPendingOrder(readPendingOrder(slug));
  }, [slug]);
  // Explicit hop state: placing (mutation) → redirecting (charge hop).
  const [chargeHop, setChargeHop] = useState<"idle" | "redirecting">("idle");
  const [quote, setQuote] = useState<Awaited<
    ReturnType<typeof quoteCart>
  > | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const checkoutToken = useMemo(() => mintCheckoutToken(slug), [slug]);
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
      void releaseCheckout({ data: { checkoutToken, slug } }).catch(
        () => undefined,
      );
    };
  }, [checkoutToken, slug]);

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
      // Rescue first: the order exists server-side from here on, so a
      // dropped hop can always link back to it.
      const placed: PendingOrder = {
        orderId: res.orderId,
        accessToken: res.accessToken,
        placedAt: Date.now(),
      };
      savePendingOrder(slug, {
        orderId: res.orderId,
        accessToken: res.accessToken,
      });
      setPendingOrder(placed);
      clear();
      // The order is placed: retire the session key so the next checkout in
      // this tab cannot replay this order's idempotency key.
      clearCheckoutSessionKey(slug);
      if (method !== "cod") {
        // Hand the shopper to the provider rail. Only the signed return can mark
        // the order paid, so a failed hop just leaves it awaiting payment.
        setChargeHop("redirecting");
        try {
          const charge = await startCharge({
            data: {
              slug,
              orderId: res.orderId,
              idempotencyKey: `chg-${idempotencyKey}`,
            },
          });
          if (charge.redirectUrl) {
            // The pending key stays: if this hop dies mid-flight, the banner
            // links straight back to the awaiting-payment order.
            window.location.assign(charge.redirectUrl);
            return;
          }
        } catch {
          setChargeFailed(true);
        } finally {
          setChargeHop("idle");
        }
      }
      // The shopper lands on the order page (which owns retry from here),
      // so the rescue key retires.
      clearPendingOrder(slug);
      setPendingOrder(null);
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
    if (offered.length > 0 && !offered.includes(method)) {
      cart.setMethod(offered[0]!);
    }
  }, [offered, method, cart]);

  const pendingBanner = pendingOrder ? (
    <div
      role="status"
      className="mb-6 rounded-fq-md border border-border/60 bg-warning-soft p-4 text-left"
    >
      <p className="text-[13.5px] font-medium text-warning-foreground">
        {t(
          "You have an order awaiting payment.",
          "আপনার একটি অর্ডার পেমেন্টের অপেক্ষায় আছে।",
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          to="/store/$slug/order/$orderId"
          params={{ slug, orderId: pendingOrder.orderId }}
          search={{ t: pendingOrder.accessToken }}
          className="inline-flex min-h-11 items-center justify-center rounded-fq-md bg-foreground px-5 text-[13px] font-bold fq-caps tracking-widest text-background"
        >
          {t("Continue to order", "অর্ডারে যান")}
        </Link>
        <button
          type="button"
          onClick={() => {
            clearPendingOrder(slug);
            setPendingOrder(null);
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-fq-md border border-border px-5 text-[13px] font-medium"
        >
          {t("Dismiss", "বাদ দিন")}
        </button>
      </div>
    </div>
  ) : null;

  const contactAndAddress = (
    <>
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
          <Field name="city" label={t("City", "শহর / City")} required />
          <Field name="postcode" label={t("Postcode", "পোস্টকোড / Postcode")} />
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
    </>
  );

  const paymentPicker = (
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
                {t(GROUP_LABELS[group.layer].en, GROUP_LABELS[group.layer].bn)}
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
                      onChange={() => cart.setMethod(m)}
                      className="h-4 w-4 text-primary focus:ring-primary border-border"
                    />
                    <span>{methodLabel(m, lang === "bn" ? "bn" : "en")}</span>
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
  );

  const messages = (
    <>
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
    </>
  );

  // The place-order ACTION's state — the server quote decides whether the
  // shopper may submit, the mutation and the charge hop decide the label.
  // When the action renders in the route's trailing slot (after the theme's
  // band), this triple is REPORTED up: the route renders the action, and the
  // state that drives it belongs to this form.
  const submitLabel = mutation.isPending
    ? t("Processing…", "প্রসেসিং…")
    : chargeHop === "redirecting"
      ? t("Redirecting to payment…", "পেমেন্টে নিয়ে যাওয়া হচ্ছে…")
      : t("Place Order", "অর্ডার কনফার্ম করুন");
  const submitDisabled =
    !totals || mutation.isPending || chargeHop === "redirecting";
  const submitNotice =
    mutation.isPending || chargeHop === "redirecting"
      ? chargeHop === "redirecting"
        ? t(
            "Contacting the payment provider — do not close this page.",
            "পেমেন্ট প্রোভাইডারের সাথে যোগাযোগ করা হচ্ছে — এই পেজ বন্ধ করবেন না।",
          )
        : t("Placing your order…", "অর্ডার করা হচ্ছে…")
      : null;
  // Primitive deps only: the report must never loop.
  useEffect(() => {
    onSubmitState?.({
      label: submitLabel,
      disabled: submitDisabled,
      notice: submitNotice,
    });
  }, [onSubmitState, submitLabel, submitDisabled, submitNotice]);

  const placeOrderButton = (
    <CheckoutSubmit
      state={{
        label: submitLabel,
        disabled: submitDisabled,
        notice: submitNotice,
      }}
      formId={formId}
    />
  );

  // The order summary — the SERVER's quote (the lines, the delivery, the
  // VAT, the COD surcharge and the total). The theme's own `cart_summary`
  // widget reads the same live quote, so the two can never disagree; the
  // route's panel is what a theme body without that widget falls back to.
  const summaryPanel = (
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
                  <label className="sr-only" htmlFor={`qty-${l.variantId}`}>
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
                  <span className="text-[12px] text-muted-foreground">×</span>
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
          value={fmtMinor(totals?.subtotalMinor ?? 0, totals?.currency)}
        />
        <Row
          label="Delivery"
          value={fmtMinor(totals?.shippingMinor ?? 0, totals?.currency)}
        />
        {(totals?.codSurchargeMinor ?? 0) > 0 && (
          <Row
            label="COD surcharge"
            value={fmtMinor(totals!.codSurchargeMinor, totals?.currency)}
          />
        )}
        <Row
          label={`VAT (${((totals?.vatRateBasisPoints ?? 0) / 100).toFixed(1)}%)${
            totals?.vatMode === "inclusive" ? " · included in prices" : ""
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
  );

  const form = (
    <form
      id={formId}
      className="grid gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(new FormData(e.currentTarget));
      }}
    >
      {contactAndAddress}
      {showPaymentPicker ? paymentPicker : null}
      {messages}
      {/* The action renders AFTER the theme's band when the theme's body
          carries one — then the route's trailing slot draws it, and it
          submits this form through the HTML form owner. */}
      {submitTrailing ? null : placeOrderButton}
    </form>
  );

  if (variant === "shell") {
    // The theme's frame supplies the trail, the payment picker and the order
    // summary; the route's own body is the form. When the theme's body
    // carries no payment picker and no order summary, the route supplies
    // BOTH — a shopper must always see the rail they are paying with and
    // the total they are paying.
    if (!showSummary) {
      return (
        <div className="mx-auto max-w-[var(--fq-container,1280px)] px-4 py-8 sm:px-6 lg:px-8">
          {pendingBanner}
          {form}
        </div>
      );
    }
    return (
      <div className="mx-auto grid max-w-[var(--fq-container,1280px)] gap-12 px-4 py-8 lg:grid-cols-[1.5fr_1fr] lg:gap-16 sm:px-6 lg:px-8">
        <section className="order-2 lg:order-1 pt-4">
          {pendingBanner}
          {form}
        </section>

        <aside className="order-1 lg:order-2">{summaryPanel}</aside>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[var(--fq-container,1280px)] gap-12 px-4 py-8 lg:grid-cols-[1.5fr_1fr] lg:gap-16 sm:px-6 lg:px-8">
      <section className="order-2 lg:order-1 pt-4">
        {pendingBanner}
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

        {form}
      </section>

      <aside className="order-1 lg:order-2">{summaryPanel}</aside>
    </div>
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
