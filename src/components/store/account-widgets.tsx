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
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { isCustomHostPath } from "@/lib/storefront-url";
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
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import type { AccountTab } from "@/lib/account-tab";
import type { AccountOverview as AccountOverviewPayload } from "@/lib/accounts.server";
import type { WidgetRow } from "@/lib/widget-data";
import type { WidgetComponent, WidgetCtx } from "@/components/builder/widgets";
import { partOrder } from "@/lib/widget-parts";
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
    <div className="border border-border/60 p-4 sm:p-5 bg-transparent">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="money font-serif text-[18px] sm:text-[20px] font-normal tracking-tight text-foreground truncate">
          {value}
        </span>
        {detail ? (
          <span className="truncate text-[11px] font-medium tracking-wide text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </div>
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

function useSafePathname(): string {
  try {
    const res = useRouterState({ select: (s) => s.location.pathname });
    if (typeof res === "string") return res;
    if (res && typeof (res as any).location?.pathname === "string") {
      return (res as any).location.pathname;
    }
    return "/";
  } catch {
    return "/";
  }
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
  heading,
}: {
  slug: string;
  tab: AccountTab;
  /** Present where the surface is NOT driven by the URL (the theme preview). */
  onTabChange?: (tab: AccountTab) => void;
  /** Called when a tab is activated — the dashboard focuses its panel then. */
  onActivate?: () => void;
  /**
   * The panel's own title. Blank by default (the catalogue's default is the
   * empty string), so the panel renders exactly what it rendered before the
   * field existed.
   */
  heading?: string;
}) {
  const { t } = useLang();
  const navigate = useNavigate();
  const pathname = useSafePathname();
  const isCustom = isCustomHostPath(pathname);
  const [focusedTab, setFocusedTab] = useState<AccountTab>(tab);
  const tabRefs = useRef<Partial<Record<AccountTab, HTMLAnchorElement | null>>>(
    {},
  );
  const navRef = useRef<HTMLElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const panelId = "account-panel";
  const tabId = (key: AccountTab) => `account-tab-${key}`;

  const checkScroll = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    setFocusedTab(tab);
    const activeEl = tabRefs.current[tab];
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [tab]);

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [checkScroll, tab]);

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
    if (isCustom) {
      void navigate({
        to: "/account",
        search: { tab: next },
      });
    } else {
      void navigate({
        to: "/store/$slug/account",
        params: { slug },
        search: { tab: next },
      });
    }
  };

  return (
    <>
      {heading ? (
        <h2 className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
          {heading}
        </h2>
      ) : null}
      <div className="relative">
        {canScrollLeft && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent sm:hidden z-10"
          />
        )}
        {canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent sm:hidden z-10"
          />
        )}
        <nav
          ref={navRef}
          onScroll={checkScroll}
          aria-label={t("Account sections", "অ্যাকাউন্ট বিভাগ")}
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 border-b border-border/60 sm:mx-0 sm:flex-wrap sm:px-0 lg:gap-3"
        >
          <div
            role="tablist"
            onKeyDown={onTabKeyDown}
            className="flex gap-1.5 sm:flex-wrap lg:gap-3 shrink-0"
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
                  tabIndex={focusedTab === item.tab ? 0 : -1}
                  onFocus={() => setFocusedTab(item.tab)}
                  onKeyDown={(event) => {
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
                  className={`flex min-h-11 min-w-[44px] shrink-0 items-center gap-2 rounded-none border-b-2 px-3 sm:px-4 py-2.5 text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.15em] transition-colors -mb-px ${
                    selected
                      ? "border-[var(--theme-ink,#1A1A1A)] text-[var(--theme-ink,#1A1A1A)]"
                      : "border-transparent text-muted-foreground hover:text-[var(--theme-ink,#1A1A1A)]"
                  }`}
                >
                  <TabIcon icon={item.icon} />
                  <span>{t(item.en, item.bn)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- the overview */

/** The overview strip — only facts the shopper's own payload carries. */
export function AccountOverviewPanel({
  overview,
  heading,
}: {
  overview?: AccountOverviewPayload;
  /** The panel's own title. Blank by default — today's own title then. */
  heading?: string;
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
  const title = heading || t("At a glance", "এক নজরে");
  return (
    <section aria-label={t("At a glance", "এক নজরে")} className="space-y-4">
      <h2 className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
        {title}
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
  parts,
  layout,
}: {
  rows: WidgetRow[];
  lang: string;
  openOrderId: string | null;
  onOpenOrder: (orderId: string | null) => void;
  onLoadOrder?: (orderId: string) => void;
  orderDetail?: { orderId: string; detail: AccountOrderDetail } | null;
  orderDetailPending?: boolean;
  orderDetailError?: boolean;
  /** The author's part order — the row's interior, never its values. */
  parts?: string;
  /** `row` is today's layout; `card` stacks the same parts in a card. */
  layout?: "row" | "card";
}) {
  const { t } = useLang();

  const toggle = (orderId: string) => {
    const next = openOrderId === orderId ? null : orderId;
    onOpenOrder(next);
    if (next) onLoadOrder?.(next);
  };

  /**
   * The row's parts. `number` and `date` share ONE block today (the order
   * number with its date under it), so the group stays together when a theme
   * reorders the row — and the group's position in the row is the position
   * of its FIRST part. The default order is today's order, so a row with no
   * authored `parts` renders byte for byte what it rendered before.
   */
  const order = partOrder(parts, "account_orders");
  const card = layout === "card";

  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row) => {
        const open = openOrderId === row.id;
        const detail =
          orderDetail?.orderId === row.id ? orderDetail.detail : null;
        const children: ReactNode[] = [];
        let textGroupDrawn = false;
        order.forEach((part) => {
          if (part === "number" || part === "date") {
            if (textGroupDrawn) return;
            textGroupDrawn = true;
            children.push(
              <span key="order-text" className="min-w-0">
                {order.includes("number") ? (
                  <span className="money block text-[14px] font-bold text-foreground">
                    {row.title}
                  </span>
                ) : null}
                {order.includes("date") ? (
                  <time
                    dateTime={row.date}
                    className="money text-[12px] font-medium tracking-wide text-muted-foreground mt-1 block"
                  >
                    {formatDay(row.date, lang)}
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
                className="justify-self-start text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/50 px-3 py-1 rounded-full"
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
                className="money text-[14px] font-semibold text-foreground tracking-wide"
              >
                {fmtMinor(row.priceMinor, row.currency)}
              </span>,
            );
          }
        });
        return (
          <li
            key={row.id}
            className={card ? "border border-border/60 p-4" : undefined}
          >
            <div
              className={
                card
                  ? "flex flex-col items-start gap-2 py-2"
                  : "grid gap-2 py-6 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-6 -mx-4 px-4 sm:mx-0 sm:px-0"
              }
            >
              {children}
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
  heading,
  parts,
  layout,
}: {
  slug: string;
  rows: WidgetRow[];
  openOrderId: string | null;
  onOpenOrder: (orderId: string | null) => void;
  onLoadOrder?: (orderId: string) => void;
  orderDetail?: { orderId: string; detail: AccountOrderDetail } | null;
  orderDetailPending?: boolean;
  orderDetailError?: boolean;
  /** The panel's own title. Blank by default — no title then. */
  heading?: string;
  /** The author's part order — the row's interior, never its values. */
  parts?: string;
  /** `row` is today's layout; `card` stacks the same parts in a card. */
  layout?: "row" | "card";
}) {
  const { t, lang } = useLang();
  if (rows.length === 0) {
    return (
      <>
        {heading ? (
          <h2 className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {heading}
          </h2>
        ) : null}
        <Empty
          text={t("No orders yet.", "এখনও কোনো অর্ডার নেই।")}
          slug={slug}
        />
      </>
    );
  }
  return (
    <>
      {heading ? (
        <h2 className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
          {heading}
        </h2>
      ) : null}
      <OrderRows
        rows={rows}
        lang={lang}
        openOrderId={openOrderId}
        onOpenOrder={onOpenOrder}
        onLoadOrder={onLoadOrder}
        orderDetail={orderDetail}
        orderDetailPending={orderDetailPending}
        orderDetailError={orderDetailError}
        parts={parts}
        layout={layout}
      />
    </>
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
  heading,
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
  /** The panel's own title. Blank by default — no title then. */
  heading?: string;
}) {
  const { t } = useLang();
  const cart = useCart(slug);
  const pathname = useSafePathname();
  const isCustom = isCustomHostPath(pathname);
  const addresses = overview?.addresses ?? [];
  const wishlist = overview?.wishlist ?? [];
  const consents = overview?.consents ?? [];
  const profile = overview?.profile ?? null;

  return (
    <>
      {heading ? (
        <h2 className="text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
          {heading}
        </h2>
      ) : null}
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
                          <span className="ml-3 inline-block rounded-none border border-foreground/30 px-2 py-0.5 text-[10px] font-bold fq-caps tracking-widest text-foreground">
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
          <div className="py-16 text-center border border-border/60 p-8">
            <h3 className="font-serif text-2xl font-normal tracking-tight text-[var(--theme-ink,#1A1A1A)]">
              {t("Your wishlist is empty.", "আপনার উইশলিস্ট খালি।")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              {t(
                "Explore our collection and save your favorite pieces to find them easily later.",
                "আমাদের কালেকশন দেখুন এবং আপনার পছন্দের পোশাকগুলো সংরক্ষণ করুন।",
              )}
            </p>
            <Link
              to="/store/$slug"
              params={{ slug }}
              search={{ preview_token: undefined }}
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-none bg-[var(--theme-ink,#1A1A1A)] px-8 text-xs font-semibold uppercase tracking-widest text-[var(--theme-surface,#FAF9F7)] hover:bg-[var(--theme-accent,#8B4513)] transition-colors cursor-pointer"
            >
              {t("Continue shopping", "কেনাকাটা চালিয়ে যান")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {wishlist.map((item) => {
              const inStock = item.stock_quantity > 0;
              const productHref = isCustom
                ? `/p/${item.product_slug}`
                : `/store/${slug}/p/${item.product_slug}`;

              return (
                <div
                  key={item.id}
                  className="group flex flex-col justify-between border border-border/60 bg-transparent p-3 sm:p-4 transition-all hover:border-[var(--theme-ink,#1A1A1A)]/40"
                >
                  <div>
                    {/* 4:5 Portrait Image Card */}
                    <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted/30 border border-border/40">
                      <a href={productHref} className="block size-full">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.product_title}
                            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-muted-foreground/40">
                            <Package className="size-8" />
                          </div>
                        )}
                      </a>
                      {onToggleWishlist ? (
                        <button
                          type="button"
                          onClick={() => onToggleWishlist(item.variant_id)}
                          aria-label={t(
                            `Remove ${item.product_title} from wishlist`,
                            `উইশলিস্ট থেকে ${item.product_title} সরান`,
                          )}
                          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-none bg-background/80 text-muted-foreground backdrop-blur-xs transition-colors hover:bg-background hover:text-danger cursor-pointer"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>

                    {/* Product Meta */}
                    <div className="mt-3 space-y-1">
                      <a
                        href={productHref}
                        className="block truncate font-serif text-[14px] sm:text-[15px] font-normal leading-snug text-[var(--theme-ink,#1A1A1A)] hover:text-[var(--theme-accent,#8B4513)] transition-colors"
                      >
                        {item.product_title}
                      </a>
                      {item.variant_name ? (
                        <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground">
                          {item.variant_name}
                        </p>
                      ) : null}
                      <p className="money text-[13.5px] sm:text-[14px] font-semibold tracking-wide text-[var(--theme-ink,#1A1A1A)] tabular-nums pt-0.5">
                        {fmtMinor(item.price_amount_minor_int, currency)}
                      </p>
                      <p
                        className={`text-[10px] font-bold uppercase tracking-widest pt-0.5 ${
                          inStock ? "text-emerald-700 dark:text-emerald-400" : "text-danger"
                        }`}
                      >
                        {inStock
                          ? t("In Stock", "স্টকে আছে")
                          : t("Out of Stock", "স্টক নেই")}
                      </p>
                    </div>
                  </div>

                  {/* Add to Bag CTA */}
                  <div className="mt-4 pt-3 border-t border-border/40">
                    <button
                      type="button"
                      disabled={!inStock}
                      onClick={() => {
                        cart.add(item.variant_id, 1);
                        toast.success(
                          t(
                            `Added ${item.product_title} to bag`,
                            `${item.product_title} ব্যাগে যোগ করা হয়েছে`,
                          ),
                        );
                      }}
                      className={`min-h-12 w-full rounded-none px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${
                        inStock
                          ? "bg-[var(--theme-ink,#1A1A1A)] text-[var(--theme-surface,#FAF9F7)] hover:bg-[var(--theme-accent,#8B4513)] hover:text-white"
                          : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                      }`}
                    >
                      {t("Add to Bag", "ব্যাগে যোগ করুন")}
                    </button>
                    {onToggleWishlist && (
                      <button
                        type="button"
                        onClick={() => onToggleWishlist(item.variant_id)}
                        className="mt-2 min-h-11 w-full text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 hover:text-[var(--theme-ink,#1A1A1A)] transition-colors cursor-pointer"
                      >
                        {t("Remove", "মুছুন")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
 *
 * The widget's own `ctx` carries the panel's DECLARED props (`heading`, and
 * for the orders panel the composable `parts` order and the row `layout`).
 * A blank heading renders no title, so a panel with no authored props
 * renders exactly what it rendered before the fields existed.
 */
function panelWidget(
  render: (
    state: NonNullable<ReturnType<typeof useAccountDashboardState>>,
    ctx: WidgetCtx,
  ) => ReactNode,
): WidgetComponent {
  return (ctx) => {
    const state = useAccountDashboardState();
    if (!state) return null;
    // A SIGNED-OUT visitor meets the dashboard's single designed order-lookup
    // panel — the dashboard returns it INSTEAD of its panels. A theme-placed
    // panel must not add a second sign-in block in a different type language,
    // so it renders nothing here.
    if (state.status === "unauthenticated") return null;
    return <>{render(state, ctx)}</>;
  };
}

/** `account_nav` — the five-tab strip. */
export const AccountNav: WidgetComponent = panelWidget((state, ctx) => (
  <AccountNavPanel
    slug={state.slug}
    tab={state.tab}
    onTabChange={state.setTab}
    heading={ctx.str("heading")}
  />
));

/** `account_overview` — the overview strip. */
export const AccountOverview: WidgetComponent = panelWidget((state, ctx) => (
  <AccountOverviewPanel
    overview={state.overview}
    heading={ctx.str("heading")}
  />
));

/** `account_orders` — the structured order rows and the inline disclosure. */
export const AccountOrders: WidgetComponent = panelWidget((state, ctx) => {
  // The orders live on the ORDERS tab — the same rule the dashboard's own
  // copy follows (`AccountDashboard.tsx:295`), so the theme's panel and the
  // dashboard's never disagree about where the orders are.
  if (state.tab !== "orders") return null;
  return (
    <AccountOrdersPanel
      slug={state.slug}
      rows={state.orders}
      openOrderId={state.openOrderId}
      onOpenOrder={state.setOpenOrderId}
      onLoadOrder={state.onLoadOrder}
      orderDetail={state.orderDetail}
      orderDetailPending={state.orderDetailPending}
      orderDetailError={state.orderDetailError}
      heading={ctx.str("heading")}
      parts={ctx.str("parts")}
      layout={ctx.str("layout") === "card" ? "card" : "row"}
    />
  );
});

/** `account_details` — the addresses, the profile, the consents, the wishlist. */
export const AccountDetails: WidgetComponent = panelWidget((state, ctx) => (
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
    heading={ctx.str("heading")}
  />
));
