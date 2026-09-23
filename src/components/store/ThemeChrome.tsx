/**
 * Themeless storefront chrome (theme purge Task 3).
 *
 * Ruling 2026-09-23: themeless fallback = builder content + default chrome,
 * zero theme tokens. The route's own fallback IS the page — Studio nodes else
 * HTML, catalogue grids, product detail, cart, search, checkout — wrapped in
 * the default chrome (header, support widget, vitals, site-kit). Theme AST
 * sections, token CSS and theme asset stylesheets are gone: an ACTIVE theme
 * can never blank a store or leak tokens into markup again.
 */
import type { ReactNode } from "react";
import { CartProvider, useLiveCart } from "@/components/builder/CartContext";
import { VitalsReporter } from "@/components/store/VitalsReporter";
import { TrafficReporter } from "@/components/store/TrafficReporter";
import {
  SiteKitSurface,
  type StorefrontSiteKit,
} from "@/components/store/SiteKitTags";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
import { useLangScope } from "@/lib/i18n";
import type {
  Section,
  TemplateKey,
  ThemeAst,
} from "@/lib/builder-ast";

type Props = {
  template: TemplateKey;
  /** Store chrome (header, support widget) rendered above the page body. */
  chrome?: ReactNode;
  /** The route's complete content — always rendered, never blank. */
  fallback: ReactNode;
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
   * REPORT: other tracks must stop passing these; see Task 3 report.
   */
  ast?: ThemeAst | null;
  tokens?: unknown;
  customCss?: string | null;
  contextSlots?: unknown;
  productSlot?: ReactNode;
  collectionSlot?: ReactNode;
};

/**
 * Deprecated: kept for the theme-contract suite owned by another track.
 * The themeless chrome never calls this — every page owns its own h1.
 * REPORT: Task 1/4 owns deletion with the preset contract suite.
 */
export function primarySectionId(ast: ThemeAst | null): string | null {
  if (!ast) return null;
  const candidates = ast.main.filter((s) => !s.invalid);
  const heading = (s: Section) =>
    s.type === "hero" ||
    (typeof s.props["heading"] === "string" && s.props["heading"]);
  return (
    candidates.find((s) => s.type === "hero")?.id ??
    candidates.find(heading)?.id ??
    null
  );
}

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

export function ThemeChrome({
  template,
  chrome,
  storeSlug,
  merchantId,
  siteKit,
  fallback,
  containerClassName = "mx-auto max-w-6xl px-4 py-8",
}: Props) {
  // Phase 2.1: language choice is remembered per storefront.
  useLangScope(storeSlug ?? null);

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
  return storeSlug ? (
    <LiveCartScope slug={storeSlug}>{body}</LiveCartScope>
  ) : (
    body
  );
}
