/**
 * Phase 2.5 — cart, checkout and order widgets.
 *
 * All seven renderers read the shared `CartContext`: lines, server totals,
 * pending flag and the rails the store can actually take money through. None
 * of them adds, subtracts or multiplies a money value — every figure on screen
 * came back from `quoteCart`, which is what keeps the displayed total and the
 * charged total the same number.
 *
 * No theme module is imported: colour, radius and shadow come from tokens.
 */
import { useCallback, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { isCustomHostPath } from "@/lib/storefront-url";
import type { SectionType } from "@/lib/builder-ast";
import {
  METHOD_GROUP_ORDER,
  groupMethods,
  methodLabel,
  type PaymentMethodKey,
} from "@/lib/payment-rails";
import type { WidgetComponent, WidgetCtx } from "./widgets";
import {
  useCartContext,
  useCartDrawerOpener,
  type CartTotals,
} from "./CartContext";
import { QtyStepper } from "./primitives/QtyStepper";
import { StepTrail, type TrailStep } from "./primitives/StepTrail";
import { OverlayHost } from "./primitives/OverlayHost";

function t(locale: string, en: string, bn: string) {
  return locale === "bn" ? bn : en;
}

function LineSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 py-4">
          <div className="h-16 w-16 shrink-0 motion-safe:animate-pulse bg-muted/50" />
          <div className="flex-1 space-y-3">
            <div className="h-3 w-2/3 motion-safe:animate-pulse bg-muted/50" />
            <div className="h-3 w-1/3 motion-safe:animate-pulse bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-3 w-full motion-safe:animate-pulse bg-muted/50" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- cart_lines */

function LineList({
  ctx,
  compact = false,
}: {
  ctx: WidgetCtx;
  compact?: boolean;
}) {
  const { str, locale, money, storeSlug } = ctx;
  const cart = useCartContext();
  const { location } = useRouterState();
  const base = storeBase(storeSlug, location.pathname);
  const serverRows = cart.totals?.lines ?? [];
  /**
   * Optimistic quantities: the local cart updates synchronously on every tap
   * while the server re-quotes, so the stepper reflects the tap instantly.
   * Only the quantity (never money) is merged — line totals stay server truth
   * until the quote lands, covered by `aria-busy` and the status line below.
   * Removed lines drop out immediately; added lines appear with the quote.
   */
  const rows = cart.live
    ? serverRows
        .filter((line) =>
          cart.lines.some((local) => local.variantId === line.variantId),
        )
        .map((line) => ({
          ...line,
          quantity:
            cart.lines.find((local) => local.variantId === line.variantId)
              ?.quantity ?? line.quantity,
        }))
    : serverRows;
  const updating = cart.pending && rows.length > 0;

  if (cart.pending && rows.length === 0) return <LineSkeleton />;
  if (cart.error) {
    return (
      <p
        role="alert"
        className="rounded-fq-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
      >
        {cart.error}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-fq-md border border-border bg-card p-6 text-center">
        <p className="text-sm font-medium">
          {str("emptyText") ||
            t(locale, "Your cart is empty.", "আপনার কার্ট খালি।")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            locale,
            "Add items to see them here.",
            "এখানে দেখতে পণ্য যোগ করুন।",
          )}
        </p>
        {storeSlug && (
          <a
            href={`${base}/`}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-fq-md border border-border px-4 text-sm font-medium"
          >
            {t(locale, "Continue shopping", "কেনাকাটা চালিয়ে যান")}
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      {updating && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {t(locale, "Updating your cart…", "কার্ট আপডেট হচ্ছে…")}
        </p>
      )}
      <ul
        className="m-0 list-none divide-y divide-border p-0"
        aria-busy={cart.pending || undefined}
      >
        {rows.map((line) => (
          <li
            key={line.variantId}
            className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4"
          >
            <div className="min-w-0 flex-1 basis-40">
              <p className="break-words text-[13.5px] font-medium leading-relaxed">
                {line.productTitle}
              </p>
              {line.variantName && (
                <p className="mt-0.5 text-[12px] font-medium tracking-wide text-muted-foreground">
                  {line.variantName}
                </p>
              )}
              <p className="mt-2 text-[13.5px] font-semibold tracking-wide tabular-nums text-foreground">
                {money(line.unitPriceMinor)}
              </p>
            </div>
            <QtyStepper
              value={line.quantity}
              max={line.stock}
              label={t(
                locale,
                `Quantity for ${line.productTitle}`,
                `${line.productTitle} এর পরিমাণ`,
              )}
              locale={locale}
              disabled={!cart.live}
              onChange={(next) => cart.setQuantity(line.variantId, next)}
            />
            <p className="w-24 shrink-0 text-right text-[13.5px] font-semibold tracking-wide tabular-nums">
              {money(line.lineTotalMinor)}
            </p>
            {!compact && (
              <button
                type="button"
                onClick={() => cart.remove(line.variantId)}
                disabled={!cart.live}
                className="inline-flex min-h-11 items-center px-4 py-2 text-[11px] font-bold fq-caps tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                {str("removeLabel") || t(locale, "Remove", "সরান")}
                <span className="sr-only"> {line.productTitle}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

const CartLines: WidgetComponent = (ctx) => {
  const { str, Heading } = ctx;
  const heading = str("heading");
  return (
    <section aria-label={heading || "Cart"}>
      {heading && (
        <Heading className="mb-3 text-lg font-semibold">{heading}</Heading>
      )}
      <LineList ctx={ctx} />
    </section>
  );
};

/* ------------------------------------------------- free shipping progress */

/**
 * Progress toward free shipping. The remainder is a server field; the only
 * number computed here is a percentage for the bar's width, which is not money.
 */
function FreeShippingBar({
  ctx,
  totals,
}: {
  ctx: WidgetCtx;
  totals: CartTotals | null;
}) {
  const { str, locale, money } = ctx;
  const threshold = totals?.freeShippingThresholdMinor ?? null;
  if (!totals || threshold === null || threshold <= 0) return null;
  const remaining = totals.freeShippingRemainingMinor;
  const earned = remaining <= 0;
  const percent = Math.max(
    0,
    Math.min(100, Math.round(((threshold - remaining) / threshold) * 100)),
  );
  return (
    <div className="py-4 border-b border-border/60">
      <p
        className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground"
        aria-live="polite"
      >
        {earned
          ? str("freeShippingDone") ||
            t(locale, "Free shipping unlocked.", "ফ্রি ডেলিভারি চালু হয়েছে।")
          : `${str("freeShippingLabel") || t(locale, "Spend", "আরও")} ${money(remaining)} ${
              str("freeShippingSuffix") ||
              t(locale, "more for free shipping", "খরচ করলে ফ্রি ডেলিভারি")
            }`}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t(
          locale,
          "Free shipping progress",
          "ফ্রি ডেলিভারির অগ্রগতি",
        )}
        className="mt-3 h-1 w-full overflow-hidden bg-muted/50"
      >
        <div
          className="h-full bg-foreground motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

const FreeShippingWidget: WidgetComponent = (ctx) => {
  const cart = useCartContext();
  return <FreeShippingBar ctx={ctx} totals={cart.totals} />;
};

/* ----------------------------------------------------------- cart_summary */

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5`}>
      <dt
        className={`min-w-0 break-words ${strong ? "text-[13px] font-bold fq-caps tracking-widest text-foreground" : "text-[13px] font-medium tracking-wide text-muted-foreground"}`}
      >
        {label}
      </dt>
      <dd
        className={`m-0 shrink-0 tabular-nums tracking-wide ${strong ? "text-[14px] font-bold text-foreground" : "text-[13.5px] font-semibold text-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function storeBase(
  storeSlug: string | null | undefined,
  pathname: string | undefined,
): string {
  if (pathname !== undefined && isCustomHostPath(pathname)) return "";
  return storeSlug ? `/store/${storeSlug}` : "";
}

function SummaryBody({ ctx }: { ctx: WidgetCtx }) {
  const { str, bool, locale, money, storeSlug } = ctx;
  const cart = useCartContext();
  const [draftCoupon, setDraftCoupon] = useState(cart.couponCode);
  const { location } = useRouterState();
  const base = storeBase(storeSlug, location.pathname);
  const totals = cart.totals;

  if (cart.pending && !totals) return <SummarySkeleton />;
  if (!totals) {
    return (
      <p className="text-sm text-muted-foreground">
        {str("emptyText") ||
          t(
            locale,
            "Add something to see your total.",
            "মোট দেখতে পণ্য যোগ করুন।",
          )}
      </p>
    );
  }

  return (
    <div className="space-y-3" aria-busy={cart.pending || undefined}>
      {bool("showFreeShipping") && (
        <FreeShippingBar ctx={ctx} totals={totals} />
      )}
      <dl className="m-0 space-y-2">
        <SummaryRow
          label={str("subtotalLabel") || t(locale, "Subtotal", "সাবটোটাল")}
          value={money(totals.subtotalMinor)}
        />
        {totals.discountMinor > 0 && (
          <SummaryRow
            label={str("discountLabel") || t(locale, "Discount", "ছাড়")}
            value={money(totals.discountMinor)}
          />
        )}
        <SummaryRow
          label={str("shippingLabel") || t(locale, "Delivery", "ডেলিভারি")}
          value={money(totals.shippingMinor)}
        />
        {totals.codSurchargeMinor > 0 && (
          <SummaryRow
            label={
              str("codLabel") ||
              t(locale, "Cash on delivery fee", "ক্যাশ অন ডেলিভারি ফি")
            }
            value={money(totals.codSurchargeMinor)}
          />
        )}
        {totals.vatMinor > 0 && (
          <SummaryRow
            label={str("vatLabel") || t(locale, "VAT", "ভ্যাট")}
            value={money(totals.vatMinor)}
          />
        )}
        <div className="border-t border-border/60 pt-4 mt-2">
          <SummaryRow
            label={str("totalLabel") || t(locale, "Total", "সর্বমোট")}
            value={money(totals.totalMinor)}
            strong
          />
        </div>
      </dl>
      {/* Screen-reader announcement for the server total on every re-quote. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {`${str("totalLabel") || t(locale, "Total", "সর্বমোট")}: ${money(totals.totalMinor)}`}
      </p>

      {bool("showCoupon") && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            cart.setCouponCode(draftCoupon.trim());
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <label htmlFor="fq-coupon" className="sr-only">
            {str("couponLabel") || t(locale, "Coupon code", "কুপন কোড")}
          </label>
          <input
            id="fq-coupon"
            value={draftCoupon}
            onChange={(event) => setDraftCoupon(event.target.value)}
            placeholder={
              str("couponLabel") || t(locale, "Coupon code", "কুপন কোড")
            }
            className="h-11 min-w-0 flex-1 rounded-fq-md border border-border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-fq-md border border-border px-4 text-sm font-medium"
          >
            {str("couponApplyLabel") || t(locale, "Apply", "প্রয়োগ")}
          </button>
          {totals.coupon && (
            <p className="w-full text-xs text-muted-foreground">
              {totals.coupon.code} · {money(totals.coupon.discountMinor)}
            </p>
          )}
        </form>
      )}

      {cart.error && (
        <p role="alert" className="text-sm text-destructive">
          {cart.error}
        </p>
      )}

      {bool("showCta") && (
        <a
          href={storeSlug ? `${base}/checkout` : "#"}
          className="inline-flex min-h-14 mt-4 w-full items-center justify-center bg-foreground px-8 text-[13px] font-bold fq-caps tracking-widest text-background motion-safe:transition-transform hover:bg-foreground/90 motion-safe:active:scale-[0.98]"
        >
          {str("ctaLabel") || t(locale, "Checkout Now", "চেকআউট")}
        </a>
      )}
    </div>
  );
}

/**
 * Phase 2.5 upgrade: `cart_summary` used to be a passive host slot. It is now
 * a real widget backed by the server quote, with the host slot kept as a
 * fallback for routes that still render their own summary.
 */
const CartSummary: WidgetComponent = (ctx) => {
  const { str, Heading, slot } = ctx;
  const cart = useCartContext();
  if (!cart.live && slot) return <>{slot}</>;
  const heading = str("heading");
  return (
    <section
      aria-label={heading || "Order summary"}
      className="p-6 bg-muted/20"
    >
      {heading && (
        <Heading className="mb-6 text-[11px] font-bold fq-caps tracking-widest text-foreground border-b border-border/60 pb-3">
          {heading}
        </Heading>
      )}
      <SummaryBody ctx={ctx} />
    </section>
  );
};

/* ------------------------------------------------------------ cart_drawer */

const CartDrawer: WidgetComponent = (ctx) => {
  const { str, locale } = ctx;
  const [open, setOpen] = useState(false);
  const cart = useCartContext();
  useCartDrawerOpener(useCallback(() => setOpen(true), []));
  const title = str("heading") || t(locale, "Your cart", "আপনার কার্ট");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-12 items-center justify-center gap-2 px-3 text-[12px] font-bold fq-caps tracking-widest text-foreground transition-colors hover:text-muted-foreground"
      >
        {str("triggerLabel") || title}
        <span
          aria-live="polite"
          aria-atomic="true"
          className="ml-1 min-w-5 px-1.5 text-center tabular-nums"
        >
          ({cart.count})
        </span>
      </button>
      <OverlayHost
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        side="right"
        closeLabel={locale === "bn" ? "বন্ধ করুন" : "Close"}
      >
        <div className="space-y-4">
          <LineList ctx={ctx} compact />
          {/* Pinned checkout footer: stays visible while lines scroll. */}
          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-border bg-card px-4 py-4">
            <SummaryBody ctx={ctx} />
          </div>
        </div>
      </OverlayHost>
    </>
  );
};

/* --------------------------------------------------------- checkout_steps */

const CheckoutSteps: WidgetComponent = (ctx) => {
  const { str, int, locale, storeSlug } = ctx;
  const { location } = useRouterState();
  const base = storeBase(storeSlug, location.pathname);
  const steps: TrailStep[] = [
    {
      key: "cart",
      label: str("step1") || t(locale, "Cart", "কার্ট"),
      href: `${base}/cart`,
    },
    {
      key: "details",
      label: str("step2") || t(locale, "Details", "তথ্য"),
      href: `${base}/checkout`,
    },
    { key: "payment", label: str("step3") || t(locale, "Payment", "পেমেন্ট") },
    {
      key: "confirm",
      label: str("step4") || t(locale, "Confirmation", "নিশ্চিতকরণ"),
    },
  ];
  const active = Math.min(
    steps.length - 1,
    Math.max(0, int("activeStep", 1, 1, 4) - 1),
  );
  return (
    <nav
      aria-label={
        str("heading") || t(locale, "Checkout progress", "চেকআউট ধাপ")
      }
    >
      <StepTrail steps={steps} activeIndex={active} locale={locale} />
    </nav>
  );
};

/* -------------------------------------------------------- payment_methods */

const GROUP_LABEL: Record<string, { en: string; bn: string }> = {
  cod: { en: "Cash on delivery", bn: "ক্যাশ অন ডেলিভারি" },
  mfs: { en: "Mobile wallets", bn: "মোবাইল ওয়ালেট" },
  bank: { en: "Bank transfer", bn: "ব্যাংক ট্রান্সফার" },
  card: { en: "Cards", bn: "কার্ড" },
  aggregator: { en: "Other", bn: "অন্যান্য" },
};

/**
 * Renders exactly the rails the server said this store can take. A method the
 * merchant has not taken live is never drawn — offering it would accept an
 * order that cannot be captured.
 */
const PaymentMethods: WidgetComponent = (ctx) => {
  const { str, Heading, locale } = ctx;
  const cart = useCartContext();
  const grouped = groupMethods(cart.methods);
  const lang = locale === "bn" ? "bn" : "en";

  if (cart.methods.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {str("emptyText") ||
          t(
            locale,
            "No payment method is available right now.",
            "এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি নেই।",
          )}
      </p>
    );
  }

  return (
    <fieldset className="rounded-fq-lg border border-border bg-card p-4">
      <legend className="px-1 text-sm font-semibold">
        <Heading className="text-base font-semibold">
          {str("heading") || t(locale, "Payment method", "পেমেন্ট পদ্ধতি")}
        </Heading>
      </legend>
      {METHOD_GROUP_ORDER.map((group) => {
        const keys = (grouped[group] ?? []) as PaymentMethodKey[];
        if (keys.length === 0) return null;
        return (
          <div key={group} className="mt-3">
            <p className="mb-1 text-xs fq-caps text-muted-foreground">
              {GROUP_LABEL[group]![lang]}
            </p>
            <div className="space-y-2">
              {keys.map((key) => (
                <label
                  key={key}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-fq-md border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="fq-payment-method"
                    value={key}
                    checked={cart.method === key}
                    onChange={() => cart.setMethod(key)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 break-words">
                    {methodLabel(key, lang)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {str("note") && (
        <p className="mt-3 text-xs text-muted-foreground">{str("note")}</p>
      )}
    </fieldset>
  );
};

/* ------------------------------------------------------------ order_tracker */

const ORDER_STAGES = ["placed", "confirmed", "shipped", "delivered"] as const;

/** Maps whatever the order row says onto the four shopper-facing stages. */
export function orderStageIndex(status: string | undefined): number {
  const value = (status ?? "").toLowerCase();
  if (value.includes("deliver")) return 3;
  if (
    value.includes("ship") ||
    value.includes("transit") ||
    value.includes("dispatch")
  )
    return 2;
  if (
    value.includes("confirm") ||
    value.includes("paid") ||
    value.includes("process")
  )
    return 1;
  return 0;
}

const OrderTracker: WidgetComponent = (ctx) => {
  const { str, Heading, locale, data } = ctx;
  const row = data?.rows?.[0];

  if (data?.pending) return <SummarySkeleton />;

  const labels: Record<(typeof ORDER_STAGES)[number], string> = {
    placed: str("step1") || t(locale, "Placed", "অর্ডার হয়েছে"),
    confirmed: str("step2") || t(locale, "Confirmed", "নিশ্চিত"),
    shipped: str("step3") || t(locale, "Shipped", "পাঠানো হয়েছে"),
    delivered: str("step4") || t(locale, "Delivered", "ডেলিভারি সম্পন্ন"),
  };
  const active = orderStageIndex(row?.subtitle);
  const steps: TrailStep[] = ORDER_STAGES.map((stage, index) => ({
    key: stage,
    label: labels[stage],
    ...(index === active && row?.body ? { detail: row.body } : {}),
  }));

  return (
    <section className="rounded-fq-lg border border-border bg-card p-4">
      <Heading className="text-base font-semibold">
        {str("heading") || t(locale, "Order status", "অর্ডারের অবস্থা")}
      </Heading>
      {row?.title && (
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {row.title}
        </p>
      )}
      <div className="mt-3">
        <StepTrail
          steps={steps}
          activeIndex={active}
          orientation="vertical"
          locale={locale}
        />
      </div>
      {str("note") && (
        <p className="mt-3 text-xs text-muted-foreground">{str("note")}</p>
      )}
    </section>
  );
};

export const CART_WIDGETS: Record<
  Extract<
    SectionType,
    | "cart_lines"
    | "cart_summary"
    | "cart_drawer"
    | "checkout_steps"
    | "payment_methods"
    | "order_tracker"
    | "free_shipping_bar"
  >,
  WidgetComponent
> = {
  cart_lines: CartLines,
  cart_summary: CartSummary,
  cart_drawer: CartDrawer,
  checkout_steps: CheckoutSteps,
  payment_methods: PaymentMethods,
  order_tracker: OrderTracker,
  free_shipping_bar: FreeShippingWidget,
};
