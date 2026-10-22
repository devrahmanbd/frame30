/**
 * The account dashboard's state — ONE provider, shared by every copy of the
 * account surface.
 *
 * **Why a provider.** The account surface is rendered in TWO places at once
 * once the theme can place the account's panels: the theme's own body may
 * carry an `account_nav` / `account_overview` / `account_orders` /
 * `account_details` panel, and the route's body slot carries the dashboard —
 * the platform's default composition of the same four panels. Both must read
 * ONE state: the same tab, the same open order, the same write callbacks.
 * Without a provider the two copies would disagree, and the shopper would see
 * one tab selected in the nav and another tab's panel below it.
 *
 * **The provider owns no data of its own.** It carries what the ROUTE owns —
 * the session-scoped `customer_overview` payload (`src/lib/accounts.server.ts`),
 * the route's own write callbacks and the route's URL state. A panel reads the
 * provider and **nothing else**: it never queries, never fetches and never
 * carries a credential. A panel with no provider renders **nothing** — it
 * fails closed, it never fetches.
 *
 * **The pattern is the platform's own.** `CartProvider`, `BlogFeedProvider`
 * and `CollectionQueryProvider` already own their surfaces' state the same
 * way (`src/components/builder/CartContext.tsx:126-135`).
 *
 * No server access, no credential, no fetch: this module is a context and a
 * type.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { AccountTab } from "@/lib/account-tab";
import type { AccountStatus } from "@/lib/account-status";
import type {
  AccountOverview,
  ConsentChannel,
  ConsentPurpose,
} from "@/lib/accounts.server";
import type { WidgetRow } from "@/lib/widget-data";

/**
 * The route's own state — the six states the account surface distinguishes.
 *
 * The DECISION lives in the pure mapping (`src/lib/account-status.ts`); this
 * is the name the dashboard's prop carries.
 */
export type AccountDashboardStatus = AccountStatus;

/**
 * ONE of the shopper's own orders, in full — the session-scoped detail the
 * `customer_order_detail` RPC returns (`ownOrderDetail`,
 * `src/lib/accounts.server.ts:430-464`).
 *
 * It is declared here rather than imported because the server module is
 * §7-prohibited for this batch: the shape is the RPC's, and the route's
 * `useServerFn(accountOrderFn)` return is checked against it by the
 * compiler, so the two cannot drift.
 */
export type AccountOrderDetail = {
  order: {
    id: string;
    order_number: string;
    status: string;
    payment_method: string;
    currency_code: string;
    subtotal_minor_int: number;
    shipping_minor_int: number;
    discount_minor_int: number;
    cod_surcharge_minor_int: number;
    vat_minor_int: number;
    total_minor_int: number;
    city: string;
    created_at: string;
  };
  items: {
    title: string;
    variant_name: string;
    quantity: number;
    unit_minor: number;
    line_minor: number;
  }[];
};

export type AccountAddressValues = {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  district: string;
  postcode: string;
  isDefault: boolean;
  addressType: "shipping" | "billing";
};

/** The four panels the account surface is made of. */
export type AccountPanelType =
  "account_nav" | "account_overview" | "account_orders" | "account_details";

/**
 * The state every copy of the account surface reads.
 *
 * It is the route's state, verbatim: the session-scoped overview, the URL's
 * tab, the disclosed order and the write callbacks. Nothing here is derived
 * from a query parameter, a widget or another customer.
 */
export type AccountDashboardState = {
  /** The store's slug — every link is a real route on this store. */
  slug: string;
  /** The store's currency — the fallback when a row carries none. */
  currency: string;
  /** Which state the surface is in. */
  status: AccountDashboardStatus;
  /** The shopper's own overview. Undefined while loading or signed out. */
  overview?: AccountOverview;
  /** The shopper's orders in the platform's own row contract. */
  orders: WidgetRow[];
  /** The active tab — a `?tab=` value on `/store/$slug/account`. */
  tab: AccountTab;
  /** Moves the selection. The URL is the selection on the storefront. */
  setTab: (tab: AccountTab) => void;
  /** The order the shopper has opened, if any. */
  openOrderId: string | null;
  /** Opens or closes the order disclosure. */
  setOpenOrderId: (orderId: string | null) => void;
  /** The loaded order detail, with the id it belongs to. */
  orderDetail?: { orderId: string; detail: AccountOrderDetail } | null;
  /** The detail is in flight. */
  orderDetailPending?: boolean;
  /** The detail could not be loaded. */
  orderDetailError?: boolean;
  /** Loads ONE of the shopper's own orders — the session-scoped detail. */
  onLoadOrder?: (orderId: string) => void;
  onSaveAddress?: (values: AccountAddressValues) => void;
  onDeleteAddress?: (addressId: string) => void;
  onSaveProfile?: (values: {
    name: string;
    email: string;
    phone: string;
  }) => void;
  onSetConsent?: (consent: {
    channel: ConsentChannel;
    purpose: ConsentPurpose;
    granted: boolean;
  }) => void;
  onToggleWishlist?: (variantId: string) => void;
  busy?: {
    address?: boolean;
    profile?: boolean;
    consent?: boolean;
    wishlist?: boolean;
  };
  /**
   * The panels the THEME's own body placed. The dashboard's fallback skips
   * those, so a panel is never shown twice on one page.
   */
  placed?: readonly AccountPanelType[];
};

const AccountDashboardCtx = createContext<AccountDashboardState | null>(null);

/**
 * The provider. The ROUTE mounts it — above `ThemeChrome`, so a panel the
 * theme places in its own body and the dashboard's own copy read one state.
 */
export function AccountDashboardProvider({
  value,
  children,
}: {
  value: AccountDashboardState;
  children: ReactNode;
}) {
  return (
    <AccountDashboardCtx.Provider value={value}>
      {children}
    </AccountDashboardCtx.Provider>
  );
}

/**
 * The state — or `null` when there is no provider.
 *
 * The SAFE read: a panel uses it to fail closed (render nothing) rather than
 * to throw. `useAccountDashboard` is the strict read.
 */
export function useAccountDashboardState(): AccountDashboardState | null {
  return useContext(AccountDashboardCtx);
}

/**
 * The state. **Throws** when there is no provider — a named error, so a
 * component that cannot work without the state says so instead of quietly
 * rendering an empty shell.
 */
export function useAccountDashboard(): AccountDashboardState {
  const state = useContext(AccountDashboardCtx);
  if (!state) {
    throw new Error(
      "AccountDashboardProviderMissing: the account surface reads its state from the provider; mount <AccountDashboardProvider> above it.",
    );
  }
  return state;
}
