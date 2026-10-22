/**
 * The account dashboard — the shopper's OWN account area.
 *
 * The account route used to hand-build this surface inline (a heading, a tab
 * strip and five panels, `src/routes/store.$slug.account.tsx`). It is a
 * component now, because the theme composes AROUND it: the route owns the
 * data, the theme owns the frame, and this module is the designed body both
 * of them agree on.
 *
 * **The data contract.** Everything here is read from ONE payload — the
 * `AccountOverview` the `customer_overview` RPC returns for the CURRENT
 * shopper (`src/lib/accounts.server.ts:36-67`). Nothing is derived from
 * another customer, from a query parameter or from a widget: the identity is
 * the session's, and the numbers are counts and facts the RPC hands back.
 * A figure that cannot be computed from that payload is not rendered at all.
 *
 * **The navigation contract.** The five destinations are the `ACCOUNT_TABS`
 * union (`src/lib/account-tab.ts:8-14`) and each one is a REAL link to
 * `?tab=<value>` on this same route (`/store/$slug/account`). The tree
 * serves no per-tab routes — the tabs are search values on ONE route — so
 * there is no such path to link to here.
 *
 * **The provider contract.** When the route mounts the account provider (it
 * does so ABOVE `ThemeChrome`), this dashboard reads its state from the
 * provider — the SAME state a panel the theme places in its own body reads.
 * Without a provider the dashboard falls back to its props, which is what the
 * studio and the tests use.
 *
 * **The layout contract.** The breakpoints are the platform's (`sm` 640,
 * `md` 768, `lg` 1024, `xl` 1280 — `src/lib/responsive.ts:11-18`), used
 * through Tailwind's own prefixes. No hand-rolled width variants appear in
 * this file, so the storefront can never drift from the studio's device
 * frames.
 */
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLang } from "@/lib/i18n";
import type { AccountTab } from "@/lib/account-tab";
import type { AccountOverview } from "@/lib/accounts.server";
import { mapOrdersToRows } from "./account-slots";
import {
  AccountDetailsPanel,
  AccountNavPanel,
  AccountOrdersPanel,
  AccountOverviewPanel,
} from "./account-widgets";
import {
  useAccountDashboardState,
  type AccountDashboardStatus,
  type AccountOrderDetail,
  type AccountAddressValues,
  type AccountPanelType,
} from "./AccountDashboardContext";

/**
 * The route's own state — the six states the account surface distinguishes.
 *
 * The DECISION lives in the pure mapping (`src/lib/account-status.ts`); this
 * is the name the dashboard's prop carries.
 */
export type {
  AccountDashboardStatus,
  AccountOrderDetail,
  AccountAddressValues,
};

/**
 * The disclosed order — re-exported from the panels module, which owns the
 * order rows and their disclosure.
 */
export { OrderDetail } from "./account-widgets";

export type AccountDashboardProps = {
  /** The store's slug — every link is a real route on this store. */
  slug: string;
  /** The shopper's own overview. Undefined while loading or signed out. */
  overview?: AccountOverview;
  /** Which state the surface is in. */
  status: AccountDashboardStatus;
  /** The active tab — a `?tab=` value on `/store/$slug/account`. */
  tab: AccountTab;
  /**
   * Called when the shopper picks a tab. Present only where the surface is
   * NOT driven by the URL (the theme preview); on the storefront the tab
   * links navigate and the route's own search parameter carries the state.
   */
  onTabChange?: (tab: AccountTab) => void;
  /**
   * The composed `profile_card` — the merchant's OWN profile section. The
   * dashboard renders it in its profile area when the theme does not place a
   * profile section of its own, so the shopper's details are never shown
   * twice on one page.
   */
  profileSlot?: ReactNode;
  /** The store's currency — the fallback when a row carries none. */
  currency: string;
  /**
   * Loads ONE of the shopper's own orders — the session-scoped detail.
   *
   * The order route is token-gated, so the row can never LINK to it; the
   * dashboard discloses the order INSTEAD, and the route resolves it under
   * the shopper's own session (`accountOrderFn`). Absent where there is no
   * session (the theme preview), so no affordance is drawn there.
   */
  onLoadOrder?: (orderId: string) => void;
  /** The loaded detail, with the id it belongs to. */
  orderDetail?: { orderId: string; detail: AccountOrderDetail } | null;
  /** The detail is in flight. */
  orderDetailPending?: boolean;
  /** The detail could not be loaded. */
  orderDetailError?: boolean;
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
};

/**
 * The account surface.
 *
 * The six states are DISTINCT and each one is reachable: signed out, loading,
 * failed, signed in with orders, signed in without orders.
 */
export function AccountDashboard(props: AccountDashboardProps) {
  const { t } = useLang();
  const state = useAccountDashboardState();

  /**
   * The provider wins when it is mounted: the dashboard's own copy of a panel
   * and the panel the theme places in its body must read ONE state — the same
   * tab, the same open order, the same write callbacks. Without a provider
   * the dashboard falls back to its props (the studio, the tests).
   */
  const slug = state ? state.slug : props.slug;
  const overview = state ? state.overview : props.overview;
  const status = state ? state.status : props.status;
  const tab = state ? state.tab : props.tab;
  const currency = state ? state.currency : props.currency;
  const orderDetail = state ? state.orderDetail : props.orderDetail;
  const orderDetailPending = state
    ? state.orderDetailPending
    : props.orderDetailPending;
  const orderDetailError = state
    ? state.orderDetailError
    : props.orderDetailError;
  const onLoadOrder = state ? state.onLoadOrder : props.onLoadOrder;
  const onSaveAddress = state ? state.onSaveAddress : props.onSaveAddress;
  const onDeleteAddress = state ? state.onDeleteAddress : props.onDeleteAddress;
  const onSaveProfile = state ? state.onSaveProfile : props.onSaveProfile;
  const onSetConsent = state ? state.onSetConsent : props.onSetConsent;
  const onToggleWishlist = state
    ? state.onToggleWishlist
    : props.onToggleWishlist;
  const busy = state ? state.busy : props.busy;
  const onTabChange = state ? state.setTab : props.onTabChange;
  /** The panels the THEME placed — the dashboard's fallback skips them. */
  const placed: readonly AccountPanelType[] = state?.placed ?? [];

  /**
   * The shopper's orders in the platform's own row contract. With a provider
   * the route has already mapped them; without one the dashboard maps the
   * overview itself, through the same `mapOrdersToRows`.
   */
  const rows = state ? state.orders : mapOrdersToRows(overview?.orders ?? []);

  // The disclosed order. With a provider the open order is the provider's —
  // so the theme's copy of the orders panel and this one open the SAME order.
  const [localOpenOrderId, setLocalOpenOrderId] = useState<string | null>(null);
  const openOrderId = state ? state.openOrderId : localOpenOrderId;
  const setOpenOrderId = state ? state.setOpenOrderId : setLocalOpenOrderId;

  // ── The ARIA tabs pattern ───────────────────────────────────────────────
  // The five destinations are five states of ONE route, and the selection is
  // the URL's `?tab=` — so the SELECTION is URL-driven, and the keyboard
  // model is the tabs pattern's:
  //
  //   - roving `tabindex`: only the focused tab is in the tab sequence, so
  //     the tablist is ONE tab stop, not five;
  //   - the arrow keys (and Home/End) move that focus between the tabs;
  //   - activation (Enter on a link, Space, or a click) changes the
  //     selection, and the focus then moves to the PANEL, so the shopper
  //     lands on the content that changed.
  //
  // The hooks live ABOVE the state branches below, so the hook order never
  // changes with the surface's state.
  const panelRef = useRef<HTMLElement | null>(null);
  // Set when the shopper activates a tab from inside the dashboard, so the
  // panel can take the focus once the new content is in.
  const activatedRef = useRef(false);

  useEffect(() => {
    const activated = activatedRef.current;
    activatedRef.current = false;
    if (!activated) return;
    panelRef.current?.focus();
  }, [tab]);

  if (status === "unauthenticated") {
    return <OrderLookup slug={slug} />;
  }

  const panelId = "account-panel";
  const tabId = (key: AccountTab) => `account-tab-${key}`;

  if (status === "loading") {
    return (
      <section className="py-16" aria-live="polite">
        <h1 className="font-bangla-display text-3xl font-medium tracking-wide text-foreground/90 sm:text-4xl">
          {t("Your Account", "আপনার অ্যাকাউন্ট")}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("Loading your account…", "আপনার অ্যাকাউন্ট লোড হচ্ছে…")}
        </p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="py-16">
        <h1 className="font-bangla-display text-3xl font-medium tracking-wide text-foreground/90 sm:text-4xl">
          {t("Your Account", "আপনার অ্যাকাউন্ট")}
        </h1>
        <p
          role="alert"
          className="mt-6 rounded-fq-md border border-danger bg-danger/10 p-4 text-sm text-danger-foreground"
        >
          {t(
            "We could not load your account right now.",
            "এখন আপনার অ্যাকাউন্ট লোড করা যায়নি।",
          )}
        </p>
      </section>
    );
  }

  const name = overview?.profile?.name ?? "";
  const email = overview?.profile?.email ?? "";

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-bangla-display text-3xl font-medium tracking-wide text-foreground/90 sm:text-4xl">
          {t("Your Account", "আপনার অ্যাকাউন্ট")}
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          {name
            ? t("Signed in as ", "সাইন ইন করা আছেন ") + name
            : t(
                "Signed in to this store's account.",
                "এই দোকানের অ্যাকাউন্টে সাইন ইন করা আছে।",
              )}
          {email ? ` · ${email}` : ""}
        </p>
      </header>

      {!placed.includes("account_nav") && (
        <AccountNavPanel
          slug={slug}
          tab={tab}
          onTabChange={onTabChange}
          onActivate={() => {
            activatedRef.current = true;
          }}
        />
      )}

      <section
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(tab)}
        tabIndex={0}
        ref={panelRef}
        className="space-y-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
      >
        {!placed.includes("account_overview") && (
          <AccountOverviewPanel overview={overview} />
        )}

        {!placed.includes("account_orders") && tab === "orders" && (
          <AccountOrdersPanel
            slug={slug}
            rows={rows}
            openOrderId={openOrderId}
            onOpenOrder={setOpenOrderId}
            onLoadOrder={onLoadOrder}
            orderDetail={orderDetail}
            orderDetailPending={orderDetailPending}
            orderDetailError={orderDetailError}
          />
        )}

        {!placed.includes("account_details") && (
          <AccountDetailsPanel
            slug={slug}
            tab={tab}
            overview={overview}
            currency={currency}
            profileSlot={props.profileSlot}
            onSaveAddress={onSaveAddress}
            onDeleteAddress={onDeleteAddress}
            onSaveProfile={onSaveProfile}
            onSetConsent={onSetConsent}
            onToggleWishlist={onToggleWishlist}
            busy={busy}
          />
        )}
      </section>
    </div>
  );
}

/**
 * The signed-out state.
 *
 * The platform's honest unauthenticated surface is the ORDER LOOKUP: a
 * shopper who is not signed in can still find an order they placed. This is
 * the same thing the account route rendered before the dashboard existed —
 * the same honest thing, not a themed sign-in page the platform cannot
 * authenticate against.
 *
 * **The access code is not optional.** The order route is token-gated
 * (`loadOrder` returns nothing unless the request carries the order's own
 * access token), so a lookup that carried only the order id would dead-end
 * on a 404. The code is the order's own secret, and the shopper has it: it
 * is in the confirmation link they were sent. The form asks for both, and
 * navigates with the code — so the lookup ends on the order, never on a 404.
 */
function OrderLookup({ slug }: { slug: string }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState("");
  const [code, setCode] = useState("");

  const handleLookup = (event: React.FormEvent) => {
    event.preventDefault();
    if (!orderId.trim() || !code.trim()) return;
    void navigate({
      to: "/store/$slug/order/$orderId",
      params: { slug, orderId: orderId.trim() },
      search: { t: code.trim() },
    });
  };

  return (
    <div className="mx-auto max-w-md py-10 text-center sm:py-16">
      <h1 className="font-bangla-display text-3xl font-medium tracking-wide">
        {t("Track Your Order", "আপনার অর্ডার খুঁজুন")}
      </h1>
      <p className="mt-4 text-[13.5px] text-muted-foreground leading-relaxed">
        {t(
          "Enter your Order ID and the access code from your confirmation link to check its status.",
          "অর্ডারের অবস্থা দেখতে আপনার অর্ডার আইডি এবং কনফার্মেশন লিংকের অ্যাক্সেস কোড দিন।",
        )}
      </p>
      <form
        onSubmit={handleLookup}
        className="mt-10 flex flex-col gap-6 text-left"
      >
        <label htmlFor="order-lookup-input" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Order ID", "অর্ডার আইডি")}
          </span>
          <input
            id="order-lookup-input"
            type="text"
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            placeholder={t(
              "From your confirmation link",
              "কনফার্মেশন লিংক থেকে",
            )}
            required
            className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/30"
          />
        </label>
        <label htmlFor="order-lookup-code" className="block">
          <span className="mb-2 block text-[11px] font-bold fq-caps tracking-widest text-muted-foreground">
            {t("Access code", "অ্যাক্সেস কোড")}
          </span>
          <input
            id="order-lookup-code"
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t(
              "The code in your confirmation link",
              "কনফার্মেশন লিংকের কোড",
            )}
            required
            className="min-h-12 w-full border-b border-border/60 bg-transparent px-0 text-[13.5px] focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/30"
          />
        </label>
        <button
          type="submit"
          className="min-h-14 w-full bg-foreground px-8 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform active:scale-[0.98]"
        >
          {t("View Order Status", "অর্ডার স্ট্যাটাস দেখুন")}
        </button>
      </form>
    </div>
  );
}
