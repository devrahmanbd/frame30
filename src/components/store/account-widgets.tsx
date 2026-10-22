/**
 * The account's four placeable panels.
 *
 * **The panels are route-owned data in a theme-placed position.** The account
 * surface is made of four panels — the navigation, the overview, the orders
 * and the details — and each one is a widget the theme may place in its own
 * body. The data behind them is the session-scoped `customer_overview`
 * payload, which the ROUTE resolves under the shopper's own session; the
 * panels read it through the account provider and **nothing else**.
 *
 * **The rule that keeps them safe.** A panel reads the provider, or it renders
 * nothing. It never queries, never fetches, never carries a credential, and
 * it never reads another shopper's rows. A panel with no provider fails
 * closed — it is not an empty shell, it is absent.
 *
 * **The dashboard is the default composition.** `AccountDashboard` renders
 * these same four panels, in today's order, so a theme that places none of
 * them renders exactly what it rendered before — and a theme that places one
 * of them gets that panel, while the dashboard's fallback skips it.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Heart,
  MapPin,
  Package,
  ShieldCheck,
  Trash2,
  User,
} from "@/components/icons/tabler";
import { useLang } from "@/lib/i18n";
import { fmtMinor } from "@/lib/money";
import type { AccountTab } from "@/lib/account-tab";
import type { AccountOverview as AccountOverviewPayload } from "@/lib/accounts.server";
import type { WidgetRow } from "@/lib/widget-data";
import type { WidgetComponent, WidgetCtx } from "@/components/builder/widgets";
import {
  useAccountDashboardState,
  type AccountAddressValues,
  type AccountOrderDetail,
} from "./AccountDashboardContext";

/**
 * The five destinations — the `ACCOUNT_TABS` union, one entry each, with the
 * icon and the label the nav renders. The list is written out (rather than
 * derived) so the icon and the bilingual label live beside the tab value.
 */
const ACCOUNT_TAB_ITEMS: readonly {
  tab: AccountTab;
  en: string;
  bn: string;
  icon: "package" | "map" | "heart" | "user" | "shield";
}[] = [
  { tab: "orders", en: "Orders", bn: "অর্ডার", icon: "package" },
  { tab: "addresses", en: "Addresses", bn: "ঠিকানা", icon: "map" },
  { tab: "wishlist", en: "Wishlist", bn: "উইশলিস্ট", icon: "heart" },
  { tab: "profile", en: "Profile", bn: "প্রোফাইল", icon: "user" },
  { tab: "privacy", en: "Privacy", bn: "গোপনীয়তা", icon: "shield" },
];

/** The consent switches the platform offers — the same four the route owned. */
const CONSENTS: readonly {
  channel: "email" | "sms";
  purpose: "marketing" | "cart_recovery" | "stock_alerts";
}[] = [
  { channel: "email", purpose: "marketing" },
  { channel: "sms", purpose: "marketing" },
  { channel: "email", purpose: "cart_recovery" },
  { channel: "email", purpose: "stock_alerts" },
];

function TabIcon({
  icon,
}: {
  icon: (typeof ACCOUNT_TAB_ITEMS)[number]["icon"];
}) {
  const cls = "size-4 shrink-0";
  if (icon === "package") return <Package className={cls} aria-hidden />;
  if (icon === "map") return <MapPin className={cls} aria-hidden />;
  if (icon === "heart") return <Heart className={cls} aria-hidden />;
  if (icon === "user") return <User className={cls} aria-hidden />;
  return <ShieldCheck className={cls} aria-hidden />;
}

function formatDay(value: string | undefined, lang: string): string {
  if (!value) return "";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB");
}

/** One fact in the overview strip — a count or a fact the RPC returned. */
function Fact({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border border-border/60 p-5 bg-transparent">
      <p className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="money mt-2 truncate text-[15px] font-semibold tracking-wide text-foreground">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-[12px] font-medium tracking-wide text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function Empty({ text, slug }: { text: string; slug: string }) {
  const { t } = useLang();
  return (
    <div className="py-12">
      <p className="text-[13.5px] text-muted-foreground">{text}</p>
      <Link
        to="/store/$slug"
        search={{ preview_token: undefined }}
        params={{ slug }}
        className="mt-6 inline-flex min-h-12 items-center justify-center border border-border px-8 text-[11px] font-bold fq-caps tracking-widest text-foreground hover:bg-muted/50 transition-colors"
      >
        {t("Start Shopping", "কেনাকাটা শুরু করুন")}
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ the nav */

/**
 * The account navigation — the five destinations.
 *
 * **The ARIA tabs pattern.** The five destinations are five states of ONE
 * route, and the selection is the URL's `?tab=` — so the SELECTION is
 * URL-driven, and the keyboard model is the tabs pattern's:
 *
 *   - roving `tabindex`: only the focused tab is in the tab sequence, so
 *     the tablist is ONE tab stop, not five;
 *   - the arrow keys (and Home/End) move that focus between the tabs;
 *   - activation (Enter on a link, Space, or a click) changes the
 *     selection, and the focus then moves to the PANEL, so the shopper
 *     lands on the content that changed.
 */
export function AccountNavPanel({
  slug,
  tab,
  onTabChange,
  onActivate,
}: {
  slug: string;
  tab: AccountTab;
  /** Present where the surface is NOT driven by the URL (the theme preview). */
  onTabChange?: (tab: AccountTab) => void;
  /** Called when a tab is activated — the dashboard focuses its panel then. */
  onActivate?: () => void;
}) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [focusedTab, setFocusedTab] = useState<AccountTab>(tab);
  const tabRefs = useRef<Partial<Record<AccountTab, HTMLAnchorElement | null>>>(
    {},
  );
  const panelId = "account-panel";
  const tabId = (key: AccountTab) => `account-tab-${key}`;

  useEffect(() => {
    setFocusedTab(tab);
  }, [tab]);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const index = ACCOUNT_TAB_ITEMS.findIndex(
      (item) => item.tab === focusedTab,
    );
    if (index < 0) return;
    let next = -1;
    if (event.key === "ArrowRight")
      next = (index + 1) % ACCOUNT_TAB_ITEMS.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + ACCOUNT_TAB_ITEMS.length) % ACCOUNT_TAB_ITEMS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ACCOUNT_TAB_ITEMS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = ACCOUNT_TAB_ITEMS[next]!;
    setFocusedTab(target.tab);
    tabRefs.current[target.tab]?.focus();
  };

  // Activating a tab: the preview drives its own state, the storefront
  // navigates to the tab's own URL.
  const activateTab = (next: AccountTab) => {
    onActivate?.();
    if (onTabChange) {
      onTabChange(next);
      return;
    }
    void navigate({
      to: "/store/$slug/account",
      params: { slug },
      search: { tab: next },
    });
  };

  return (
    <nav
      aria-label={t("Account sections", "অ্যাকাউন্ট বিভাগ")}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 lg:gap-3"
    >
      <div
        role="tablist"
        onKeyDown={onTabKeyDown}
        className="flex gap-2 sm:flex-wrap lg:gap-3"
      >
        {ACCOUNT_TAB_ITEMS.map((item) => {
          const selected = item.tab === tab;
          return (
            <Link
              key={item.tab}
              id={tabId(item.tab)}
              ref={(element: HTMLAnchorElement | null) => {
                tabRefs.current[item.tab] = element;
              }}
              to="/store/$slug/account"
              params={{ slug }}
              search={{ tab: item.tab }}
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              // The ROVING tabindex: one tab stop for the whole tablist.
              tabIndex={focusedTab === item.tab ? 0 : -1}
              onFocus={() => setFocusedTab(item.tab)}
              onKeyDown={(event) => {
                // Space activates a tab (Enter is the link's own).
                if (event.key !== " " && event.key !== "Spacebar") return;
                event.preventDefault();
                activateTab(item.tab);
              }}
              onClick={(event) => {
                if (item.tab !== tab) onActivate?.();
                if (!onTabChange) return;
                event.preventDefault();
                onTabChange(item.tab);
              }}
              className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-bold fq-caps tracking-widest transition-colors ${
                selected
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <TabIcon icon={item.icon} />
              <span>{t(item.en, item.bn)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* --------------------------------------------------------------- the overview */

/** The overview strip — only facts the shopper's own payload carries. */
export function AccountOverviewPanel({
  overview,
}: {
  overview?: AccountOverviewPayload;
}) {
  const { t } = useLang();
  const orders = overview?.orders ?? [];
  const addresses = overview?.addresses ?? [];
  const wishlist = overview?.wishlist ?? [];
  // The MOST RECENT order — the newest `created_at` the RPC returned, not
  // the first row it happened to send.
  const latest = orders.reduce<(typeof orders)[number] | null>(
    (best, order) =>
      best === null ||
      Date.parse(order.created_at) > Date.parse(best.created_at)
        ? order
        : best,
    null,
  );
  const defaultAddress = addresses.find((address) => address.is_default);
  return (
    <section aria-label={t("At a glance", "এক নজরে")} className="space-y-4">
      <h2 className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
        {t("At a glance", "এক নজরে")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact
          label={t("Orders", "অর্ডার")}
          value={
            orders.length === 1
              ? t("1 order", "১টি অর্ডার")
              : t(`${orders.length} orders`, `${orders.length}টি অর্ডার`)
          }
        />
        <Fact
          label={t("Latest order", "সর্বশেষ অর্ডার")}
          value={latest ? latest.order_number : "—"}
          detail={latest ? latest.status : undefined}
        />
        <Fact
          label={t("Default address", "ডিফল্ট ঠিকানা")}
          value={defaultAddress ? defaultAddress.city : "—"}
          detail={
            defaultAddress
              ? defaultAddress.district
              : t("Not set", "সেট করা নেই")
          }
        />
        <Fact
          label={t("Saved items", "সংরক্ষিত পণ্য")}
          value={String(wishlist.length)}
        />
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- the orders */

/**
 * The order history, laid out as ROWS: the order number, the date, the status
 * and the total — the four fields the platform's own row mapping produces
 * (`mapOrdersToRows`), arranged rather than listed.
 *
 * **The row discloses; it never links.** The order route is token-gated
 * (`loadOrder` returns nothing unless the request carries the order's own
 * access token), and the account payload carries no token — so a link to it
 * would dead-end on a 404. The row instead opens the order INLINE, resolved
 * under the shopper's own session (`onLoadOrder` → the route's
 * `accountOrderFn`), so the shopper sees their own order without a token and
 * without a dead link.
 */
function OrderRows({
  rows,
  lang,
  openOrderId,
  onOpenOrder,
  onLoadOrder,
  orderDetail,
  orderDetailPending,
  orderDetailError,
}: {
  rows: WidgetRow[];
  lang: string;
  openOrderId: string | null;
  onOpenOrder: (orderId: string | null) => void;
  onLoadOrder?: (orderId: string) => void;
  orderDetail?: { orderId: string; detail: AccountOrderDetail } | null;
  orderDetailPending?: boolean;
  orderDetailError?: boolean;
}) {
  const { t } = useLang();

  const toggle = (orderId: string) => {
    const next = openOrderId === orderId ? null : orderId;
    onOpenOrder(next);
    if (next) onLoadOrder?.(next);
  };

  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row) => {
        const open = openOrderId === row.id;
        const detail =
          orderDetail?.orderId === row.id ? orderDetail.detail : null;
        return (
          <li key={row.id}>
            <div className="grid gap-2 py-6 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-6 -mx-4 px-4 sm:mx-0 sm:px-0">
              <span className="min-w-0">
                <span className="money block text-[14px] font-bold text-foreground">
                  {row.title}
                </span>
                <time
                  dateTime={row.date}
                  className="money text-[12px] font-medium tracking-wide text-muted-foreground mt-1 block"
                >
                  {formatDay(row.date, lang)}
                </time>
              </span>
              {row.subtitle ? (
                <span className="justify-self-start text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                  {row.subtitle}
                </span>
              ) : null}
              {typeof row.priceMinor === "number" ? (
                <span className="money text-[14px] font-semibold text-foreground tracking-wide">
                  {fmtMinor(row.priceMinor, row.currency)}
                </span>
              ) : null}
              {onLoadOrder ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`account-order-detail-${row.id}`}
                  onClick={() => toggle(row.id)}
                  className="justify-self-start text-[11px] font-bold fq-caps tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                  {open
                    ? t("Hide order", "অর্ডার লুকান")
                    : t("View order", "অর্ডার দেখুন")}
                </button>
              ) : null}
            </div>
            {open ? (
              <div
                id={`account-order-detail-${row.id}`}
                className="pb-6 -mx-4 px-4 sm:mx-0 sm:px-0"
              >
                {orderDetailPending ? (
                  <p
                    role="status"
                    className="text-[13px] text-muted-foreground"
                  >
                    {t("Loading your order…", "আপনার অর্ডার লোড হচ্ছে…")}
                  </p>
                ) : orderDetailError ? (
                  <p
                    role="alert"
                    className="text-[13px] font-medium text-danger-foreground"
                  >
                    {t(
                      "We could not load that order. Please try again.",
                      "অর্ডারটি লোড করা যায়নি। আবার চেষ্টা করুন।",
                    )}
                  </p>
                ) : detail ? (
                  <OrderDetail detail={detail} lang={lang} />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The disclosed order — the shopper's OWN order, in full.
 *
 * Every figure here comes from the session-scoped `customer_order_detail`
 * payload: the order's own numbers, its line items and its server-priced
 * totals. Nothing is computed on the client and nothing is invented.
 */
export function OrderDetail({
  detail,
  lang,
}: {
  detail: AccountOrderDetail;
  lang: string;
}) {
  const { t } = useLang();
  const order = detail.order;
  const money = (minor: number) => fmtMinor(minor, order.currency_code);
  return (
    <div className="border border-border/60 p-5 bg-transparent">
      <p className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
        {t("Order details", "অর্ডারের বিস্তারিত")}
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <Detail
          label={t("Order number", "অর্ডার নম্বর")}
          value={order.order_number}
        />
        <Detail label={t("Status", "অবস্থা")} value={order.status} />
        <Detail
          label={t("Placed", "অর্ডারের সময়")}
          value={formatDay(order.created_at, lang)}
        />
        <Detail label={t("Payment", "পেমেন্ট")} value={order.payment_method} />
        <Detail label={t("City", "শহর")} value={order.city} />
        <Detail
          label={t("Total", "সর্বমোট")}
          value={money(order.total_minor_int)}
        />
      </dl>
      {detail.items.length > 0 ? (
        <ul className="mt-5 divide-y divide-border/60 border-t border-border/60">
          {detail.items.map((item, index) => (
            <li
              key={`${item.title}-${index}`}
              className="flex items-start justify-between gap-4 py-3"
            >
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-foreground">
                  {item.title}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                  {item.variant_name} · ×{item.quantity}
                </span>
              </span>
              <span className="money text-[13.5px] font-semibold text-foreground">
                {money(item.line_minor)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="mt-5 space-y-2 border-t border-border/60 pt-4">
        <Total
          label={t("Subtotal", "সাবটোটাল")}
          value={money(order.subtotal_minor_int)}
        />
        {order.discount_minor_int > 0 ? (
          <Total
            label={t("Discount", "ছাড়")}
            value={money(order.discount_minor_int)}
          />
        ) : null}
        <Total
          label={t("Delivery", "ডেলিভারি")}
          value={money(order.shipping_minor_int)}
        />
        {order.cod_surcharge_minor_int > 0 ? (
          <Total
            label={t("COD surcharge", "ক্যাশ অন ডেলিভারি সারচার্জ")}
            value={money(order.cod_surcharge_minor_int)}
          />
        ) : null}
        {order.vat_minor_int > 0 ? (
          <Total label={t("VAT", "ভ্যাট")} value={money(order.vat_minor_int)} />
        ) : null}
        <Total
          label={t("Total", "সর্বমোট")}
          value={money(order.total_minor_int)}
          strong
        />
      </dl>
    </div>
  );
}

/** One labelled fact in the disclosed order. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="money mt-1 text-[13.5px] font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

/** One line of the disclosed order's totals — the server's own numbers. */
function Total({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
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

/**
 * The orders panel — the structured order rows and the inline order
 * disclosure.
 */
export function AccountOrdersPanel({
  slug,
  rows,
  openOrderId,
  onOpenOrder,
  onLoadOrder,
  orderDetail,
  orderDetailPending,
  orderDetailError,
}: {
  slug: string;
  rows: WidgetRow[];
  openOrderId: string | null;
  onOpenOrder: (orderId: string | null) => void;
  onLoadOrder?: (orderId: string) => void;
  orderDetail?: { orderId: string; detail: AccountOrderDetail } | null;
  orderDetailPending?: boolean;
  orderDetailError?: boolean;
}) {
  const { t, lang } = useLang();
  if (rows.length === 0) {
    return (
      <Empty text={t("No orders yet.", "এখনও কোনো অর্ডার নেই।")} slug={slug} />
    );
  }
  return (
    <OrderRows
      rows={rows}
      lang={lang}
      openOrderId={openOrderId}
      onOpenOrder={onOpenOrder}
      onLoadOrder={onLoadOrder}
      orderDetail={orderDetail}
      orderDetailPending={orderDetailPending}
      orderDetailError={orderDetailError}
    />
  );
}

/* --------------------------------------------------------------- the details */

function AddressForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (values: AccountAddressValues) => void;
}) {
  const { t } = useLang();
  const [values, setValues] = useState<AccountAddressValues>({
    label: "",
    fullName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    district: "",
    postcode: "",
    isDefault: false,
    addressType: "shipping",
  });
  const set =
    (key: keyof AccountAddressValues) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((previous) => ({
        ...previous,
        [key]: key === "isDefault" ? event.target.checked : event.target.value,
      }));

  const fields: [keyof AccountAddressValues, string, string][] = [
    ["label", t("Label", "লেবেল"), t("Home", "বাসা")],
    ["fullName", t("Full name", "পুরো নাম"), ""],
    ["phone", t("Phone", "ফোন"), "01XXXXXXXXX"],
    ["line1", t("Address line 1", "ঠিকানা ১"), ""],
    ["line2", t("Address line 2", "ঠিকানা ২"), ""],
    ["city", t("City", "শহর"), ""],
    ["district", t("District", "জেলা"), ""],
    ["postcode", t("Postcode", "পোস্টকোড"), ""],
  ];

  return (
    <form
      className="mt-12 max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <h2 className="text-[11px] font-bold fq-caps tracking-widest text-foreground border-b border-border/60 pb-3 mb-6">
        {t("Add an Address", "নতুন ঠিকানা যোগ করুন")}
      </h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {fields.map(([key, label, placeholder]) => (
          <label key={key} htmlFor={`addr-${key}`} className="block">
            <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
              {label}
            </span>
            <input
              id={`addr-${key}`}
              value={String(values[key])}
              onChange={set(key)}
              placeholder={placeholder}
              required={[
                "label",
                "fullName",
                "phone",
                "line1",
                "city",
                "district",
              ].includes(key)}
              className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/30"
            />
          </label>
        ))}
      </div>
      <label className="mt-8 flex items-center gap-3 text-[13px] font-medium text-foreground">
        <input
          type="checkbox"
          checked={values.isDefault}
          onChange={set("isDefault")}
          className="size-4 accent-foreground"
        />
        {t("Set as default address", "ডিফল্ট ঠিকানা হিসেবে সেট করুন")}
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-8 min-h-14 bg-foreground px-10 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {busy
          ? t("Saving…", "সংরক্ষণ হচ্ছে…")
          : t("Save Address", "ঠিকানা সংরক্ষণ করুন")}
      </button>
    </form>
  );
}

function ProfileForm({
  busy,
  initial,
  onSubmit,
}: {
  busy: boolean;
  initial: { name: string; email: string; phone: string };
  onSubmit: (values: { name: string; email: string; phone: string }) => void;
}) {
  const { t } = useLang();
  const [values, setValues] = useState(initial);
  return (
    <form
      className="max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <h2 className="text-[11px] font-bold fq-caps tracking-widest text-foreground border-b border-border/60 pb-3 mb-6">
        {t("Your Details", "আপনার তথ্য")}
      </h2>
      <div className="space-y-6">
        <label htmlFor="pf-name" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Full Name", "পুরো নাম")}
          </span>
          <input
            id="pf-name"
            value={values.name}
            required
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                name: event.target.value,
              }))
            }
            className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
          />
        </label>
        <label htmlFor="pf-phone" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Phone", "ফোন")}
          </span>
          <input
            id="pf-phone"
            value={values.phone}
            required
            inputMode="tel"
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                phone: event.target.value,
              }))
            }
            className="money min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
          />
        </label>
        <label htmlFor="pf-email" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Email (optional)", "ইমেইল (ঐচ্ছিক)")}
          </span>
          <input
            id="pf-email"
            value={values.email}
            type="email"
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                email: event.target.value,
              }))
            }
            className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-10 min-h-14 bg-foreground px-10 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {busy
          ? t("Saving…", "সংরক্ষণ হচ্ছে…")
          : t("Save Details", "তথ্য সংরক্ষণ করুন")}
      </button>
    </form>
  );
}

/**
 * The details panel — the addresses, the profile, the consents and the
 * wishlist. One panel, four destinations: the tab decides which of the four
 * the shopper sees.
 */
export function AccountDetailsPanel({
  slug,
  tab,
  overview,
  currency,
  profileSlot,
  onSaveAddress,
  onDeleteAddress,
  onSaveProfile,
  onSetConsent,
  onToggleWishlist,
  busy,
}: {
  slug: string;
  tab: AccountTab;
  overview?: AccountOverviewPayload;
  currency: string;
  profileSlot?: ReactNode;
  onSaveAddress?: (values: AccountAddressValues) => void;
  onDeleteAddress?: (addressId: string) => void;
  onSaveProfile?: (values: {
    name: string;
    email: string;
    phone: string;
  }) => void;
  onSetConsent?: (consent: {
    channel: "email" | "sms";
    purpose: "marketing" | "cart_recovery" | "stock_alerts";
    granted: boolean;
  }) => void;
  onToggleWishlist?: (variantId: string) => void;
  busy?: {
    address?: boolean;
    profile?: boolean;
    consent?: boolean;
    wishlist?: boolean;
  };
}) {
  const { t } = useLang();
  const addresses = overview?.addresses ?? [];
  const wishlist = overview?.wishlist ?? [];
  const consents = overview?.consents ?? [];
  const profile = overview?.profile ?? null;

  return (
    <>
      {tab === "addresses" && (
        <div className="space-y-6">
          {addresses.length === 0 ? (
            <Empty
              text={t(
                "No saved addresses yet.",
                "এখনও কোনো ঠিকানা সংরক্ষণ করা নেই।",
              )}
              slug={slug}
            />
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2">
              {addresses.map((address) => (
                <li
                  key={address.id}
                  className="flex flex-col justify-between border border-border/60 p-6 bg-transparent"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[13.5px] font-bold text-foreground">
                        {address.label}
                        {address.is_default && (
                          <span className="ml-3 inline-block rounded-full bg-foreground/10 px-2.5 py-1 text-[10px] font-bold fq-caps tracking-widest text-foreground">
                            {t("Default", "ডিফল্ট")}
                          </span>
                        )}
                      </p>
                      <p className="mt-3 text-[13.5px] text-muted-foreground leading-relaxed">
                        <span className="font-medium text-foreground/80">
                          {address.full_name}
                        </span>{" "}
                        · <span className="money">{address.phone}</span>
                        <br />
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ""}
                        <br />
                        {address.city}, {address.district}{" "}
                        <span className="money">{address.postcode ?? ""}</span>
                      </p>
                    </div>
                    {onDeleteAddress ? (
                      <button
                        type="button"
                        aria-label={t(
                          `Remove ${address.label}`,
                          `${address.label} মুছুন`,
                        )}
                        onClick={() => onDeleteAddress(address.id)}
                        className="text-muted-foreground hover:text-danger-foreground transition-colors p-2 -mr-2 -mt-2"
                      >
                        <Trash2 className="size-5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {onSaveAddress ? (
            <AddressForm
              busy={busy?.address ?? false}
              onSubmit={(values) => onSaveAddress(values)}
            />
          ) : null}
        </div>
      )}

      {tab === "wishlist" &&
        (wishlist.length === 0 ? (
          <Empty
            text={t("Nothing saved yet.", "এখনও কিছু সংরক্ষিত নেই।")}
            slug={slug}
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {wishlist.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 py-6"
              >
                <Link
                  to="/store/$slug/p/$productSlug"
                  params={{ slug, productSlug: item.product_slug }}
                  className="min-w-0"
                >
                  <span className="block truncate text-[14px] font-medium leading-relaxed">
                    {item.product_title}
                  </span>
                  <span className="block text-[12px] font-medium tracking-wide text-muted-foreground mt-0.5">
                    {item.variant_name}
                  </span>
                  <span className="money mt-2 block text-[13.5px] font-semibold tracking-wide">
                    {fmtMinor(item.price_amount_minor_int, currency)}
                  </span>
                  <span
                    className={`text-[11px] font-bold fq-caps tracking-widest block mt-2 ${item.stock_quantity > 0 ? "text-foreground" : "text-danger-foreground"}`}
                  >
                    {item.stock_quantity > 0
                      ? t("In Stock", "স্টকে আছে")
                      : t("Out of Stock", "স্টক নেই")}
                  </span>
                </Link>
                {onToggleWishlist ? (
                  <button
                    type="button"
                    onClick={() => onToggleWishlist(item.variant_id)}
                    className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
                  >
                    {t("Remove", "সরান")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ))}

      {tab === "profile" && (
        <div className="space-y-8">
          {/* The composed profile — the merchant's OWN `profile_card`
              section when the theme does not place one of its own (the
              route hands it over only then, so the shopper's details are
              never shown twice on one page) — and the editable contact
              fields the platform keeps for the shopper. */}
          {profileSlot ? (
            <section
              aria-label={t("Your profile", "আপনার প্রোফাইল")}
              className="border border-border/60 p-6 bg-transparent"
            >
              {profileSlot}
            </section>
          ) : null}
          {onSaveProfile ? (
            <ProfileForm
              busy={busy?.profile ?? false}
              initial={{
                name: profile?.name ?? "",
                email: profile?.email ?? "",
                phone: profile?.phone ?? "",
              }}
              onSubmit={(values) => onSaveProfile(values)}
            />
          ) : null}
        </div>
      )}

      {tab === "privacy" && (
        <div className="max-w-xl space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(
              "You choose which messages this store may send you. Turning one off applies everywhere immediately.",
              "এই দোকান আপনাকে কোন বার্তা পাঠাতে পারবে তা আপনি ঠিক করবেন। বন্ধ করলে সব জায়গায় সাথে সাথে প্রযোজ্য হবে।",
            )}
          </p>
          {CONSENTS.map((consent) => {
            const granted =
              consents.find(
                (row) =>
                  row.channel === consent.channel &&
                  row.purpose === consent.purpose,
              )?.granted ?? false;
            return (
              <label
                key={`${consent.channel}:${consent.purpose}`}
                className="flex items-center justify-between gap-4 py-6 border-b border-border/60"
              >
                <span>
                  <span className="font-bold text-[13px] text-foreground block">
                    {consent.purpose.replace("_", " ")}
                  </span>
                  <span className="block text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
                    {consent.channel}
                  </span>
                </span>
                {onSetConsent ? (
                  <input
                    type="checkbox"
                    checked={granted}
                    // The consent mutation is in flight: the switch is
                    // disabled, exactly as the address and profile
                    // editors are, so a second write cannot race the first.
                    disabled={busy?.consent ?? false}
                    onChange={(event) =>
                      onSetConsent({
                        channel: consent.channel,
                        purpose: consent.purpose,
                        granted: event.target.checked,
                      })
                    }
                    className="size-5 accent-foreground"
                  />
                ) : (
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    {granted ? t("On", "চালু") : t("Off", "বন্ধ")}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------- the four widget renderers */

/**
 * A panel rendered as a widget. It reads the account provider and **nothing
 * else** — no fetch, no query, no credential — and with no provider it
 * renders **nothing** (it fails closed).
 */
function panelWidget(
  render: (
    state: NonNullable<ReturnType<typeof useAccountDashboardState>>,
  ) => ReactNode,
): WidgetComponent {
  return () => {
    const state = useAccountDashboardState();
    if (!state) return null;
    return <>{render(state)}</>;
  };
}

/** `account_nav` — the five-tab strip. */
export const AccountNav: WidgetComponent = panelWidget((state) => (
  <AccountNavPanel
    slug={state.slug}
    tab={state.tab}
    onTabChange={state.setTab}
  />
));

/** `account_overview` — the overview strip. */
export const AccountOverview: WidgetComponent = panelWidget((state) => (
  <AccountOverviewPanel overview={state.overview} />
));

/** `account_orders` — the structured order rows and the inline disclosure. */
export const AccountOrders: WidgetComponent = panelWidget((state) => (
  <AccountOrdersPanel
    slug={state.slug}
    rows={state.orders}
    openOrderId={state.openOrderId}
    onOpenOrder={state.setOpenOrderId}
    onLoadOrder={state.onLoadOrder}
    orderDetail={state.orderDetail}
    orderDetailPending={state.orderDetailPending}
    orderDetailError={state.orderDetailError}
  />
));

/** `account_details` — the addresses, the profile, the consents, the wishlist. */
export const AccountDetails: WidgetComponent = panelWidget((state) => (
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
  />
));
