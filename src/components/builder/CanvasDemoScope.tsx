/**
 * The editor canvas's DEMO data scope.
 *
 * The canvas mounts the SAME demo providers the theme preview mounts, and
 * ONLY for the theme that ships the demo data (review S3): a non-Songoskriti
 * theme gets its children unwrapped, never another theme's products, prices
 * or account rows. The account provider is FIRST, exactly as the preview
 * nests it — every placeable account panel reads one state, and a panel with
 * no provider renders nothing (review M5).
 *
 * The scope is a separate module so the builder route and its render test
 * exercise the same component, with the same nesting order. It is a
 * provider wrapper, not a renderer: `SectionRenderer` still draws the
 * widgets.
 */
import type { ReactNode } from "react";
import { CartProvider } from "@/components/builder/CartContext";
import type { CartContextValue } from "@/components/builder/CartContext";
import { BlogFeedProvider } from "@/components/builder/blog";
import type { BlogFeed } from "@/components/builder/blog";
import { CollectionQueryProvider } from "@/components/builder/collection";
import type { CollectionQuery } from "@/components/builder/collection";
import {
  AccountDashboardProvider,
  type AccountDashboardState,
} from "@/components/store/AccountDashboardContext";

export function CanvasDemoScope({
  enabled,
  cart,
  query,
  feed,
  account,
  children,
}: {
  enabled: boolean;
  cart: CartContextValue;
  query: CollectionQuery;
  feed: BlogFeed;
  account: AccountDashboardState;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <AccountDashboardProvider value={account}>
      <CartProvider value={cart}>
        <CollectionQueryProvider value={query}>
          <BlogFeedProvider value={feed}>{children}</BlogFeedProvider>
        </CollectionQueryProvider>
      </CartProvider>
    </AccountDashboardProvider>
  );
}
