/**
 * Songoskriti's OWN renderers for the commerce and account widget types.
 *
 * **What this module is.** The theme-presentation registry lets a theme
 * replace a widget's renderer for its own theme key
 * (`registerThemePresentation(themeKey, widgetType, Component)`,
 * `src/lib/theme-presentations.ts:97`). This module is Songoskriti's half of
 * that lever for the surfaces the prior programme left in the platform's own
 * type language — the cart lines, the totals, the payment rail, the checkout
 * trail, the order list, the profile card and the account's four placeable
 * panels.
 *
 * **The three rules every renderer here obeys.**
 *
 *  1. **The parts prop is the author's.** The effective order comes from
 *     `partOrder(ctx.str("parts"), type)` — the theme's list when it is
 *     valid, the platform's default otherwise — and a part the theme dropped
 *     is not drawn. The vocabulary is CLOSED (`src/lib/widget-parts.ts`), so
 *     a key outside it can never reach the markup.
 *  2. **The data is the route's.** The commerce renderers read the shared
 *     cart context (`useCartContext`), the account renderers read the account
 *     provider — the same route-owned, session-scoped state the platform's
 *     own widgets read. A theme renderer never queries, never fetches and
 *     never carries a credential.
 *  3. **No money is computed here.** Every figure is formatted through
 *     `ctx.money` over the server's MINOR UNITS. A renderer that divides, or
 *     that multiplies a price, is a bug — and the suite
 *     (`commerce-presentations.test.tsx`) reads this file's source and fails
 *     on it.
 *
 * **The type language.** Songoskriti's own: a hairline rule instead of a
 * slab, letterspaced small-caps labels instead of an uppercase slab, and the
 * editorial spacing the rest of the theme uses. The COPY and the DATA are
 * the platform's — a theme presentation changes how a surface reads, never
 * what it says or what it costs.
 */
import type { ReactNode } from "react";
import type { SectionType } from "@/lib/builder-ast";
import { partOrder } from "@/lib/widget-parts";
import { useCartContext } from "@/components/builder/CartContext";
import { QtyStepper } from "@/components/builder/primitives/QtyStepper";
import {
  StepTrail,
  type TrailStep,
} from "@/components/builder/primitives/StepTrail";
import {
  METHOD_GROUP_ORDER,
  groupMethods,
  methodLabel,
  type MethodLayer,
  type PaymentMethodKey,
} from "@/lib/payment-rails";
import type { WidgetComponent, WidgetCtx } from "@/components/builder/widgets";
import {
  AccountDetailsPanel,
  AccountNavPanel,
  AccountOrdersPanel,
  AccountOverviewPanel,
} from "@/components/store/account-widgets";
import {
  useAccountDashboardState,
  type AccountDashboardState,
} from "@/components/store/AccountDashboardContext";

/** The theme's own copy switch — the same shape the platform's uses. */
function t(locale: string, en: string, bn: string) {
  return locale === "bn" ? bn : en;
}

/** The theme's label: small, letterspaced, quiet. */
const LABEL =
  "text-[11px] font-bold fq-caps tracking-widest text-muted-foreground";

/** The theme's rule: a hairline, never a slab. */
const RULE = "border-b border-border/60 pb-3";

/**
 * The row layout. `row` is today's layout — the default — and `card` is the
 * same parts stacked inside one bordered card. The choice is a class, not a
 * second renderer, so the parts stay the parts.
 */
function layoutOf(ctx: WidgetCtx): "row" | "card" {
  return ctx.str("layout") === "card" ? "card" : "row";
}

/** The panel's own title — the theme's small-caps label. */
function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className={LABEL}>{children}</h2>;
}

/* ------------------------------------------------------------- cart_lines */

/**
 * The cart's line list — the theme's own arrangement of the row's interior.
 *
 * The row's VALUES are the server's quote's: the title, the variant, the
 * unit price, the quantity, the line total. The ORDER is the author's, and
 * the parts the author dropped are not drawn.
 */
export const SongoskritiCartLines: WidgetComponent = (ctx) => {
  const { str, locale, money, Heading } = ctx;
  const cart = useCartContext();
  const order = partOrder(str("parts"), "cart_lines");
  const layout = layoutOf(ctx);
  const heading = str("heading");
  const rows = cart.totals?.lines ?? [];

  if (cart.pending && rows.length === 0) {
    return (
      <section aria-label={heading || "Cart"}>
        <div className="space-y-4" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 w-full bg-muted/40" />
          ))}
        </div>
      </section>
    );
  }

  if (cart.error) {
    return (
      <p role="alert" className="border border-border/60 p-4 text-sm">
        {cart.error}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <section aria-label={heading || "Cart"}>
        {heading ? (
          <Heading className={`mb-4 ${LABEL}`}>{heading}</Heading>
        ) : null}
        <p className="text-[13.5px] text-muted-foreground">
          {str("emptyText") ||
            t(locale, "Your cart is empty.", "আপনার কার্ট খালি।")}
        </p>
      </section>
    );
  }

  return (
    <section aria-label={heading || "Cart"}>
      {heading ? (
        <Heading className={`mb-4 ${LABEL}`}>{heading}</Heading>
      ) : null}
      <ul className="m-0 list-none divide-y divide-border/60 p-0">
        {rows.map((line) => {
          const children: ReactNode[] = [];
          let textGroupDrawn = false;
          order.forEach((part) => {
            if (
              part === "title" ||
              part === "variant" ||
              part === "unitPrice"
            ) {
              if (textGroupDrawn) return;
              textGroupDrawn = true;
              children.push(
                <span key="line-text" className="min-w-0 flex-1 basis-40">
                  {order.includes("title") ? (
                    <span className="block break-words text-[14px] font-semibold tracking-wide">
                      {line.productTitle}
                    </span>
                  ) : null}
                  {order.includes("variant") && line.variantName ? (
                    <span className="mt-1 block text-[12px] tracking-wide text-muted-foreground">
                      {line.variantName}
                    </span>
                  ) : null}
                  {order.includes("unitPrice") ? (
                    <span className="money mt-2 block text-[13px] font-semibold tracking-wide tabular-nums">
                      {money(line.unitPriceMinor)}
                    </span>
                  ) : null}
                </span>,
              );
              return;
            }
            if (part === "quantity") {
              children.push(
                <QtyStepper
                  key="quantity"
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
                />,
              );
              return;
            }
            if (part === "lineTotal") {
              children.push(
                <span
                  key="lineTotal"
                  className="money w-24 shrink-0 text-right text-[14px] font-semibold tracking-wide tabular-nums"
                >
                  {money(line.lineTotalMinor)}
                </span>,
              );
              return;
            }
            if (part === "remove") {
              children.push(
                <button
                  key="remove"
                  type="button"
                  onClick={() => cart.remove(line.variantId)}
                  disabled={!cart.live}
                  className={`min-h-11 shrink-0 px-3 text-[11px] font-bold fq-caps tracking-widest text-muted-foreground transition-colors hover:text-foreground ${RULE}`}
                >
                  {str("removeLabel") || t(locale, "Remove", "সরান")}
                  <span className="sr-only"> {line.productTitle}</span>
                </button>,
              );
            }
          });
          return (
            <li
              key={line.variantId}
              className={
                layout === "card"
                  ? "flex flex-col items-stretch gap-3 border border-border/60 p-4"
                  : "flex flex-wrap items-center gap-x-4 gap-y-3 py-5"
              }
            >
              {children}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/* ----------------------------------------------------------- cart_summary */

/**
 * The totals block — the theme's own arrangement of the quote's rows.
 *
 * Every row is the SERVER's row: the subtotal, the discount, the delivery,
 * the cash-on-delivery surcharge, the VAT and the total. The theme chooses
 * the order and which rows to show; it never computes a figure.
 */
export const SongoskritiCartSummary: WidgetComponent = (ctx) => {
  const { str, bool, locale, money, Heading } = ctx;
  const cart = useCartContext();
  const order = partOrder(str("parts"), "cart_summary");
  const heading = str("heading");
  const totals = cart.totals;

  if (!totals) {
    return (
      <section aria-label={heading || "Order summary"}>
        {heading ? (
          <Heading className={`mb-4 ${LABEL}`}>{heading}</Heading>
        ) : null}
        <p className="text-[13.5px] text-muted-foreground">
          {str("emptyText") ||
            t(
              locale,
              "Add something to see your total.",
              "মোট দেখতে পণ্য যোগ করুন।",
            )}
        </p>
      </section>
    );
  }

  const row = (key: string, label: string, value: string, strong = false) => (
    <div key={key} className="flex items-baseline justify-between gap-4 py-2">
      <dt
        className={
          strong
            ? "text-[12px] font-bold fq-caps tracking-widest"
            : "text-[13px] tracking-wide text-muted-foreground"
        }
      >
        {label}
      </dt>
      <dd
        className={
          strong
            ? "money text-[15px] font-bold tracking-wide tabular-nums"
            : "money text-[13.5px] font-semibold tracking-wide tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );

  return (
    <section aria-label={heading || "Order summary"}>
      {heading ? (
        <Heading className={`mb-4 ${LABEL} ${RULE}`}>{heading}</Heading>
      ) : null}
      <dl className="m-0">
        {order.map((part) => {
          if (part === "subtotal") {
            return row(
              "subtotal",
              str("subtotalLabel") || t(locale, "Subtotal", "সাবটোটাল"),
              money(totals.subtotalMinor),
            );
          }
          if (part === "discount") {
            if (totals.discountMinor <= 0) return null;
            return row(
              "discount",
              str("discountLabel") || t(locale, "Discount", "ছাড়"),
              money(totals.discountMinor),
            );
          }
          if (part === "shipping") {
            return row(
              "shipping",
              str("shippingLabel") || t(locale, "Delivery", "ডেলিভারি"),
              money(totals.shippingMinor),
            );
          }
          if (part === "cod") {
            if (totals.codSurchargeMinor <= 0) return null;
            return row(
              "cod",
              str("codLabel") ||
                t(locale, "Cash on delivery fee", "ক্যাশ অন ডেলিভারি ফি"),
              money(totals.codSurchargeMinor),
            );
          }
          if (part === "vat") {
            if (totals.vatMinor <= 0) return null;
            return row(
              "vat",
              str("vatLabel") || t(locale, "VAT", "ভ্যাট"),
              money(totals.vatMinor),
            );
          }
          return (
            <div key="total" className={`mt-3 pt-4 ${RULE}`}>
              {row(
                "total",
                str("totalLabel") || t(locale, "Total", "সর্বমোট"),
                money(totals.totalMinor),
                true,
              )}
            </div>
          );
        })}
      </dl>
      {bool("showCta") ? (
        <a
          href="#"
          className="mt-6 inline-flex min-h-14 w-full items-center justify-center border border-foreground px-8 text-[12px] font-bold fq-caps tracking-widest transition-colors hover:bg-muted/40"
        >
          {str("ctaLabel") || t(locale, "Checkout Now", "চেকআউট")}
        </a>
      ) : null}
    </section>
  );
};

/* -------------------------------------------------------- payment_methods */

/**
 * The payment rail — EXACTLY the rails the server offered.
 *
 * A rail the merchant has not taken live is never drawn: offering it would
 * accept an order that cannot be captured. The theme chooses the rail's
 * arrangement (the legend, the options, the groups, the note) and never
 * which rails exist.
 */
export const SongoskritiPaymentMethods: WidgetComponent = (ctx) => {
  const { str, Heading, locale } = ctx;
  const cart = useCartContext();
  const order = partOrder(str("parts"), "payment_methods");
  const wants = (part: string) => order.includes(part);
  const layout = layoutOf(ctx);
  const byLayer = new Map<MethodLayer, PaymentMethodKey[]>(
    groupMethods(cart.methods).map((group) => [group.layer, group.methods]),
  );
  const lang = locale === "bn" ? "bn" : "en";

  if (cart.methods.length === 0) {
    return (
      <p className="text-[13.5px] text-muted-foreground">
        {str("emptyText") ||
          t(
            locale,
            "No payment method is available right now.",
            "এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি নেই।",
          )}
      </p>
    );
  }

  const railOption = (key: PaymentMethodKey) => (
    <label
      key={key}
      className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border/60 py-2 text-[13.5px] transition-colors hover:bg-muted/30"
    >
      <input
        type="radio"
        name="fq-payment-method"
        value={key}
        checked={cart.method === key}
        onChange={() => cart.setMethod(key)}
        className="h-4 w-4"
      />
      <span className="min-w-0 break-words">{methodLabel(key, lang)}</span>
    </label>
  );

  const groupBlocks = METHOD_GROUP_ORDER.map((group) => {
    const keys = byLayer.get(group) ?? [];
    if (keys.length === 0) return null;
    return (
      <div key={group} className="mt-5">
        {wants("groups") ? (
          <p className={`mb-1 ${LABEL}`}>{groupLabel(group, lang)}</p>
        ) : null}
        {wants("options") ? (
          <div className={layout === "card" ? "grid gap-2 sm:grid-cols-2" : ""}>
            {keys.map(railOption)}
          </div>
        ) : null}
      </div>
    );
  });

  return (
    <fieldset className="border-b border-border/60 pb-5">
      {wants("legend") ? (
        <legend className="px-0 pb-3">
          <Heading className={LABEL}>
            {str("heading") || t(locale, "Payment method", "পেমেন্ট পদ্ধতি")}
          </Heading>
        </legend>
      ) : null}
      {order
        .filter((part) => part !== "legend")
        .map((part) => {
          if (part === "groups") return groupBlocks;
          if (part === "options") {
            if (wants("groups")) return null;
            return (
              <div key="options" className="mt-4">
                {METHOD_GROUP_ORDER.flatMap(
                  (group) => byLayer.get(group) ?? [],
                ).map(railOption)}
              </div>
            );
          }
          if (part === "note") {
            if (!str("note")) return null;
            return (
              <p key="note" className="mt-4 text-[12px] text-muted-foreground">
                {str("note")}
              </p>
            );
          }
          return null;
        })}
    </fieldset>
  );
};

/** The rail group's own label — the platform's group names. */
function groupLabel(group: MethodLayer, lang: "en" | "bn"): string {
  if (group === "cod") {
    return lang === "bn" ? "ক্যাশ অন ডেলিভারি" : "Cash on delivery";
  }
  if (group === "mfs")
    return lang === "bn" ? "মোবাইল ওয়ালেট" : "Mobile wallets";
  if (group === "bank") {
    return lang === "bn" ? "ব্যাংক ট্রান্সফার" : "Bank transfer";
  }
  if (group === "card") return lang === "bn" ? "কার্ড" : "Cards";
  return lang === "bn" ? "অন্যান্য" : "Other";
}

/* --------------------------------------------------------- checkout_steps */

/**
 * The checkout trail — the step names, the marker of where the shopper is and
 * the links back to the completed steps. The theme chooses their order.
 */
export const SongoskritiCheckoutSteps: WidgetComponent = (ctx) => {
  const { str, int, locale } = ctx;
  const order = partOrder(str("parts"), "checkout_steps");
  const wantsLabels = order.includes("labels");
  const wantsLinks = order.includes("links");
  const wantsActive = order.includes("active");
  const steps: TrailStep[] = [
    {
      key: "cart",
      label: wantsLabels ? str("step1") || t(locale, "Cart", "কার্ট") : "",
    },
    {
      key: "details",
      label: wantsLabels ? str("step2") || t(locale, "Details", "তথ্য") : "",
    },
    {
      key: "payment",
      label: wantsLabels ? str("step3") || t(locale, "Payment", "পেমেন্ট") : "",
    },
    {
      key: "confirm",
      label: wantsLabels
        ? str("step4") || t(locale, "Confirmation", "নিশ্চিতকরণ")
        : "",
    },
  ];
  const active = wantsActive
    ? Math.min(steps.length - 1, Math.max(0, int("activeStep", 1, 1, 4) - 1))
    : -1;
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

/* ----------------------------------------------------------- orders_list */

/**
 * The shopper's order history — the theme's own arrangement of the row's
 * interior. The order number, the date, the status and the total are the
 * shopper's own session-scoped rows.
 */
export const SongoskritiOrdersList: WidgetComponent = (ctx) => {
  const { str, locale, money, Heading, data, int } = ctx;
  const order = partOrder(str("parts"), "orders_list");
  const heading = str("heading") || t(locale, "Your orders", "আপনার অর্ডার");
  const rows = data?.rows?.slice(0, int("limit", 5, 1, 20));

  if (data?.pending) {
    return (
      <section className="py-8">
        <div className="h-4 w-40 bg-muted/40" aria-hidden="true" />
      </section>
    );
  }
  if (rows === undefined) {
    return (
      <section className="py-12 text-center">
        <Heading className={LABEL}>{heading}</Heading>
        <p className="mt-3 text-[13.5px] tracking-wide text-muted-foreground">
          {t(locale, "Sign in to continue.", "এগিয়ে যেতে সাইন ইন করুন।")}
        </p>
      </section>
    );
  }
  if (rows.length === 0) {
    return (
      <section className="py-8">
        <Heading className={`mb-4 ${LABEL} ${RULE}`}>{heading}</Heading>
        <p className="text-[13.5px] text-muted-foreground">
          {str("emptyText") ||
            t(locale, "No orders yet.", "এখনও কোনো অর্ডার নেই।")}
        </p>
      </section>
    );
  }
  return (
    <section>
      <Heading className={`mb-4 ${LABEL} ${RULE}`}>{heading}</Heading>
      <ul className="m-0 list-none divide-y divide-border/60 p-0">
        {rows.map((row) => {
          const children: ReactNode[] = [];
          let textGroupDrawn = false;
          order.forEach((part) => {
            if (part === "number" || part === "date") {
              if (textGroupDrawn) return;
              textGroupDrawn = true;
              children.push(
                <span key="order-text" className="min-w-0">
                  {order.includes("number") ? (
                    <span className="block text-[14px] font-semibold tracking-wide tabular-nums">
                      {row.title}
                    </span>
                  ) : null}
                  {order.includes("date") ? (
                    <time
                      dateTime={row.date}
                      className="mt-1 block text-[12px] tracking-wide text-muted-foreground tabular-nums"
                    >
                      {formatDay(row.date, locale)}
                    </time>
                  ) : null}
                </span>,
              );
              return;
            }
            if (part === "status") {
              if (!row.subtitle) return;
              children.push(
                <span
                  key="status"
                  className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground"
                >
                  {row.subtitle}
                </span>,
              );
              return;
            }
            if (part === "total") {
              if (typeof row.priceMinor !== "number") return;
              children.push(
                <span
                  key="total"
                  className="money text-[14px] font-semibold tracking-wide tabular-nums"
                >
                  {money(row.priceMinor, row.currency)}
                </span>,
              );
            }
          });
          return (
            <li
              key={row.id}
              className="flex flex-wrap items-baseline justify-between gap-4 py-5"
            >
              {children}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** The order row's date, in the reader's own locale. */
function formatDay(value: string | undefined, locale: string): string {
  if (!value) return "";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB");
}

/* ----------------------------------------------------------- profile_card */

/**
 * The shopper's details card — the theme's own arrangement of the card's
 * interior. The avatar, the name, the email and the phone are the shopper's
 * own row.
 */
export const SongoskritiProfileCard: WidgetComponent = (ctx) => {
  const { str, Heading, data } = ctx;
  const order = partOrder(str("parts"), "profile_card");
  const row = data?.rows?.[0];
  if (!row) {
    return (
      <section className="py-12 text-center">
        <Heading className={LABEL}>
          {str("heading") || t(ctx.locale, "Your profile", "আপনার প্রোফাইল")}
        </Heading>
        <p className="mt-3 text-[13.5px] tracking-wide text-muted-foreground">
          {t(ctx.locale, "Sign in to continue.", "এগিয়ে যেতে সাইন ইন করুন।")}
        </p>
      </section>
    );
  }
  const children: ReactNode[] = [];
  order.forEach((part) => {
    if (part === "avatar") {
      children.push(
        <span
          key="avatar"
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border/60 text-[16px] font-bold"
        >
          {(row.title || "?").trim().charAt(0).toUpperCase()}
        </span>,
      );
      return;
    }
    if (part === "name") {
      children.push(
        <Heading
          key="name"
          className="truncate text-[13.5px] font-bold tracking-wide"
        >
          {row.title || str("heading")}
        </Heading>,
      );
      return;
    }
    if (part === "email") {
      if (!row.subtitle) return;
      children.push(
        <p key="email" className="mt-1 truncate text-[13px] tracking-wide">
          {row.subtitle}
        </p>,
      );
      return;
    }
    if (!row.body) return;
    children.push(
      <p
        key="phone"
        className="money mt-2 text-[12.5px] tracking-wide text-muted-foreground"
      >
        {row.body}
      </p>,
    );
  });
  return (
    <section className="border-b border-border/60 pb-5">
      <div className="flex items-start gap-4">{children}</div>
    </section>
  );
};

/* --------------------------------------------------------- the account panels */

/**
 * The theme's own copy of the account's four placeable panels.
 *
 * The panels read the account provider and nothing else, so the theme's copy
 * and the dashboard's copy of the same panel read ONE state — the same tab,
 * the same open order, the same write callbacks. The theme adds its own
 * frame (the title and the rule); the DATA and the CONTROLS stay the
 * platform's.
 */
function panelFrame(title: string | undefined, body: ReactNode): ReactNode {
  return (
    <section className="space-y-4">
      {title ? <PanelTitle>{title}</PanelTitle> : null}
      {body}
    </section>
  );
}

/**
 * A theme-placed panel, in the theme's own frame.
 *
 * The panel reads the account provider and **nothing else** — and with no
 * provider it renders **nothing** (it fails closed, it never fetches). A
 * signed-out visitor meets the dashboard's single designed order-lookup
 * panel, so a theme-placed panel stays absent there too.
 */
function accountPanel(
  render: (state: AccountDashboardState, ctx: WidgetCtx) => ReactNode,
): WidgetComponent {
  return (ctx) => {
    const state = useAccountDashboardState();
    if (!state) return null;
    if (state.status === "unauthenticated") return null;
    return <>{render(state, ctx)}</>;
  };
}

/** `account_nav` — the five destinations. */
export const SongoskritiAccountNav: WidgetComponent = accountPanel(
  (state, ctx) =>
    panelFrame(
      ctx.str("heading"),
      <AccountNavPanel
        slug={state.slug}
        tab={state.tab}
        onTabChange={state.setTab}
      />,
    ),
);

/** `account_overview` — the overview strip. */
export const SongoskritiAccountOverview: WidgetComponent = accountPanel(
  (state, ctx) =>
    panelFrame(
      ctx.str("heading"),
      <AccountOverviewPanel overview={state.overview} />,
    ),
);

/**
 * `account_orders` — the structured order rows.
 *
 * The effective part order comes from `partOrder(ctx.str("parts"),
 * "account_orders")` and is handed to the panel, so the row's interior is
 * the author's.
 */
export const SongoskritiAccountOrders: WidgetComponent = accountPanel(
  (state, ctx) => {
    const parts = partOrder(ctx.str("parts"), "account_orders");
    // The orders live on the ORDERS tab — the same rule the dashboard's own
    // copy follows, so the two never disagree about where the orders are.
    if (state.tab !== "orders") return null;
    return panelFrame(
      ctx.str("heading"),
      <AccountOrdersPanel
        slug={state.slug}
        rows={state.orders}
        openOrderId={state.openOrderId}
        onOpenOrder={state.setOpenOrderId}
        onLoadOrder={state.onLoadOrder}
        orderDetail={state.orderDetail}
        orderDetailPending={state.orderDetailPending}
        orderDetailError={state.orderDetailError}
        parts={parts.join(",")}
        layout={ctx.str("layout") === "card" ? "card" : "row"}
      />,
    );
  },
);

/** `account_details` — the addresses, the profile, the consents, the wishlist. */
export const SongoskritiAccountDetails: WidgetComponent = accountPanel(
  (state, ctx) =>
    panelFrame(
      ctx.str("heading"),
      <AccountDetailsPanel
        slug={state.slug}
        tab={state.tab}
        overview={state.overview}
        currency={state.currency}
        onSaveAddress={state.onSaveAddress}
        onDeleteAddress={state.onDeleteAddress}
        onSaveProfile={state.onSaveProfile}
        onSetConsent={state.onSetConsent}
        onToggleWishlist={state.onToggleWishlist}
        busy={state.busy}
      />,
    ),
);

/**
 * The theme's commerce and account pack — the ten renderers this module
 * owns. The registrar joins them to the theme's other pack
 * (`SONGOSKRITI_WIDGETS`) under the same theme key.
 */
export const SONGOSKRITI_COMMERCE_WIDGETS: Partial<
  Record<SectionType, WidgetComponent>
> = {
  cart_lines: SongoskritiCartLines,
  cart_summary: SongoskritiCartSummary,
  payment_methods: SongoskritiPaymentMethods,
  checkout_steps: SongoskritiCheckoutSteps,
  orders_list: SongoskritiOrdersList,
  profile_card: SongoskritiProfileCard,
  account_nav: SongoskritiAccountNav,
  account_overview: SongoskritiAccountOverview,
  account_orders: SongoskritiAccountOrders,
  account_details: SongoskritiAccountDetails,
};
