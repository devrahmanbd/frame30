/**
 * Themeless storefront chrome (theme purge + themeless gate).
 *
 * Ruling 2026-09-23 (updated at main-merge): every store is themeless after
 * the purge, so `isThemeless` is always true and every route serves the
 * single shared welcome page (PR #20 decision: one page, one HTML for all
 * stores without a theme). Builder content paths stay in the routes for a
 * future storefront revival, but the gate owns the render.
 */
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CartProvider, useLiveCart } from "@/components/builder/CartContext";
import { VitalsReporter } from "@/components/store/VitalsReporter";
import { TrafficReporter } from "@/components/store/TrafficReporter";
import {
  SiteKitSurface,
  type StorefrontSiteKit,
} from "@/components/store/SiteKitTags";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
import { StoreWelcome } from "@/components/store/StoreWelcome";
import { PluginFooterMounts } from "@/components/store/PluginFooterMounts";
import { PluginProvider } from "@/components/builder/PluginContext";
import type { InstalledPlugin } from "@/lib/plugin-manifest";
import { isCustomHostPath } from "@/lib/storefront-url";
import { useLangScope } from "@/lib/i18n";
import type { TemplateKey } from "@/lib/builder-ast";

type Props = {
  template: TemplateKey;
  /** Store chrome (header, support widget) rendered above the page body. */
  chrome?: ReactNode;
  /** The route's complete content — rendered when the gate ever opens. */
  fallback: ReactNode;
  /** Display name for the themeless fallback. Defaults to the slug. */
  storeName?: string | null;
  /**
   * Merchant plugins for this storefront render. Footer-slot widgets of
   * enabled plugins auto-mount on every page (themed and themeless) via
   * `PluginFooterMounts`; the same list feeds placed app-blocks through
   * context. Absent/empty renders zero mount points.
   */
  installedPlugins?: InstalledPlugin[];
  /** Store slug — namespaces channel state and server bundle quotes. */
  storeSlug?: string;
  /**
   * Phase 4.4: when supplied, this page view reports field vitals (LCP/CLS/
   * INP) for the store. Absent in the studio preview, where lab numbers would
   * pollute a merchant's real-user data.
   */
  merchantId?: string | null;
  /**
   * Phase 5: verification metas and the consent-gated analytics plan. Mounted
   * here so no admin route can ever load a merchant's pixels.
   */
  siteKit?: StorefrontSiteKit | null;
  ownsPrimary?: boolean;
  containerClassName?: string;
  /**
   * Deprecated theme props — ignored after the purge, kept optional so
   * un-migrated callers fail visibly at the type level, not silently.
   */
  ast?: unknown;
  tokens?: unknown;
  customCss?: string | null;
  contextSlots?: unknown;
  productSlot?: ReactNode;
  collectionSlot?: ReactNode;
};

/**
 * Phase 2.5: one live cart per storefront render. Every cart widget under it
 * shares a single server quote, so a page with a line list, a summary and a
 * drawer costs one round trip per change instead of three.
 */
function LiveCartScope({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const cart = useLiveCart(slug);
  return <CartProvider value={cart}>{children}</CartProvider>;
}

/** True when the merchant has no theme at all: every route then serves the
 *  single shared welcome page instead of per-template fallbacks. After the
 *  purge the server passes no ast/tokens, so this is always true. */
export function isThemeless(ast: unknown, tokens: unknown): boolean {
  return !ast && !tokens;
}

export function ThemeChrome({
  template,
  chrome,
  storeSlug,
  storeName,
  merchantId,
  siteKit,
  fallback,
  containerClassName = "mx-auto max-w-6xl px-4 py-8",
  installedPlugins = [],
  ast = null,
  tokens = null,
}: Props) {
  // Phase 2.1: language choice is remembered per storefront.
  useLangScope(storeSlug ?? null);
  const { pathname } = useRouterState().location;
  if (isThemeless(ast, tokens)) {
    return (
      <PluginProvider plugins={installedPlugins}>
        <StoreWelcome
          slug={storeSlug ?? ""}
          name={storeName ?? storeSlug ?? ""}
          custom={isCustomHostPath(pathname)}
        />
        <PluginFooterMounts />
      </PluginProvider>
    );
  }

  const body = (
    <ThemeSurface>
      <VitalsReporter
        merchantId={merchantId}
        template={template ?? "unknown"}
      />
      <TrafficReporter
        merchantId={merchantId}
        template={template ?? "unknown"}
      />
      <SiteKitSurface siteKit={siteKit ?? null} />
      {chrome}
      <main className={containerClassName}>{fallback}</main>
    </ThemeSurface>
  );

  // Without a slug (studio preview) the widgets fall back to the demo cart.
  // The plugin provider rides the same tree so placed app-blocks and the
  // footer mounts resolve the merchant's installs, not an empty list.
  const tree = (
    <PluginProvider plugins={installedPlugins}>
      {body}
      <PluginFooterMounts />
    </PluginProvider>
  );
  return storeSlug ? (
    <LiveCartScope slug={storeSlug}>{tree}</LiveCartScope>
  ) : (
    tree
  );
}
