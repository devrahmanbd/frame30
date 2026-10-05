import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Menu as MenuIcon,
  Search,
  ShoppingBag,
  User,
  X,
  Heart,
} from "@/components/icons/tabler";
import { useCart } from "@/lib/cart";
import { useWishlistHeader } from "@/lib/wishlist-card";
import { useLang } from "@/lib/i18n";
import { isCustomHostPath } from "@/lib/storefront-url";
import {
  rebaseMenuHref,
  selectMobileMenu,
  type MenuNode,
  type StoreMenus,
} from "@/lib/menus/menu";
import {
  resolveMenuSwapRows,
  type MenuRendererDecision,
  type MenuSlot,
  type MenuSwapRequest,
} from "@/lib/plugin-manifest";
import {
  PluginMenuBoundary,
  selectPluginMenuRenderer,
} from "@/lib/plugin-menu-renderers";
import { LanguageToggle } from "@/components/LanguageToggle";
import { TimezoneToggle } from "./TimezoneToggle";
import { themeChromeFor, type ThemeHeaderChrome } from "./theme-chrome";

export function MinimalCheckoutHeader({
  slug,
  name,
  themeKey,
}: {
  slug: string;
  name: string;
  /**
   * Theme-remediation Task 3: explicit merchant theme key driving header
   * chrome. Null/undefined renders the generic text wordmark — chrome
   * never sniffs the slug or display name.
   */
  themeKey?: string | null;
}) {
  const { t } = useLang();
  // Theme-owned logo lockup resolves through key-driven config — the
  // shared header names no brand. Generic stores keep the text wordmark.
  const chrome = themeChromeFor(themeKey);
  return (
    <header className="w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-5 sticky top-0 z-40">
      <div className="mx-auto flex max-w-[var(--fq-container,1280px)] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          to="/store/$slug"
          params={{ slug }}
          className="flex items-center transition-opacity hover:opacity-80"
        >
          {chrome ? (
            <img
              src={chrome.logo.src}
              alt={chrome.logo.alt}
              className="h-[28px] w-auto object-contain"
            />
          ) : (
            <span className="font-bangla-display text-xl font-semibold tracking-tight text-foreground">
              {name}
            </span>
          )}
        </Link>
        <Link
          to="/store/$slug/cart"
          params={{ slug }}
          className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground flex items-center gap-2"
        >
          {t("Return to cart", "কার্টে ফিরে যান")}
        </Link>
      </div>
    </header>
  );
}

/**
 * TRACK M — StoreHeader mount points. `menu_bar` selects the desktop nav
 * rows, `menu_drawer` the mobile slide-out rows. Rows resolve through the
 * shared review gate; an approved + scoped swap whose plugin registered a
 * renderer (`registerMenuRenderer`) additionally replaces the nav
 * presentation below, fail-open to the theme markup on any failure.
 * Full-renderer gating lives in `decideMenuRenderer`
 * (`@/lib/plugin-manifest`).
 */
export const STORE_HEADER_MENU_SLOT: MenuSlot = "menu_bar";
export const STORE_DRAWER_MENU_SLOT: MenuSlot = "menu_drawer";

/** Review-gated nav swap request for `StoreHeader` (`menuSwap` prop). */
export type StoreMenuSwap = MenuSwapRequest<MenuNode>;

/* ─────────────────────────────────────────────────────────────
 * LAYER 1 — HeaderData: pure state assembly (no hooks, no JSX).
 * Assembles menu rows (dashboard wins, theme fallback covers only
 * theme-shaped stores), routing base (custom host vs store path),
 * theme chrome lookup (key-driven, never slug or name), fallback
 * localization flags, and announcement state (via chrome).
 * Search, account, wishlist, cart, and locale targets all derive
 * from this data; hooks stay in StoreHeader and flow in as inputs.
 * ───────────────────────────────────────────────────────────── */

export type HeaderDataInput = {
  slug: string;
  menus?: Pick<StoreMenus, "header" | "mobile"> | null;
  themeKey?: string | null;
  menuSwap?: StoreMenuSwap;
  pathname: string;
  t: (en: string, bn?: string) => string;
};

export type HeaderData = {
  headerChrome: ThemeHeaderChrome | null;
  isLuxury: boolean;
  custom: boolean;
  base: string;
  headerMenu: readonly MenuNode[];
  mobileMenu: readonly MenuNode[];
  headerFallback: boolean;
  mobileFallback: boolean;
  fallbackLabel: (label: string) => string;
  /**
   * TRACK M review verdicts per slot (`null` without a `menuSwap`).
   * `ThemeHeaderRenderer` resolves the registered plugin presentation from
   * these — rows above stay the winning rows either way.
   */
  headerDecision: MenuRendererDecision | null;
  mobileDecision: MenuRendererDecision | null;
  /** Row/renderer failure seam from the swap request (boundary reporting). */
  menuOnError?: (error: unknown) => void;
};

/**
 * Pure menu plus chrome plus routing assembly. Dashboard-designed menus
 * win whenever a location is claimed; the theme fallback tree covers
 * theme-shaped stores only (demo and preview safety). Generic stores
 * keep empty menus when no location is claimed.
 */
export function assembleHeaderData({
  slug,
  menus,
  themeKey,
  menuSwap,
  pathname,
  t,
}: HeaderDataInput): HeaderData {
  const custom = isCustomHostPath(pathname);
  const base = custom ? "" : `/store/${slug}`;
  // Theme fallback chrome (menu tree, twins, logo, announcement)
  // resolves through key-driven config — no brand branch lives here.
  // Generic stores (null) keep behavior exactly: empty when no
  // menu claims the location.
  const headerChrome = themeChromeFor(themeKey);
  const isLuxury = headerChrome !== null;

  // Data-driven selection: dashboard-designed menus win whenever a location
  // is claimed; the theme fallback tree covers theme-shaped stores only
  // (demo/preview safety).
  const dbHeader = menus?.header ?? [];
  const dbMobile = menus ? selectMobileMenu(menus) : [];
  const headerThemed =
    dbHeader.length > 0 ? dbHeader : (headerChrome?.fallbackMenu ?? []);
  const mobileThemed =
    dbMobile.length > 0 ? dbMobile : (headerChrome?.fallbackMenu ?? []);
  // TRACK M mount points: `menu_bar` (desktop nav) and `menu_drawer`
  // (mobile slide-out) resolve through the shared review gate. `null` swap
  // (today: always, unless a caller passes `menuSwap`) returns the themed
  // rows untouched — output is byte-identical to before.
  const headerSwap = menuSwap
    ? resolveMenuSwapRows(headerThemed, menuSwap, STORE_HEADER_MENU_SLOT)
    : null;
  const mobileSwap = menuSwap
    ? resolveMenuSwapRows(mobileThemed, menuSwap, STORE_DRAWER_MENU_SLOT)
    : null;
  const headerMenu = headerSwap ? headerSwap.rows : headerThemed;
  const mobileMenu = mobileSwap ? mobileSwap.rows : mobileThemed;
  // The theme twin table covers the fallback tree only. Dashboard nodes
  // (MenuItem) carry no twin field and render as-authored in every locale;
  // generic stores never localize, so their output is byte-identical to
  // before. A winning plugin swap likewise renders as-authored.
  const headerFallback =
    headerSwap?.decision.kind !== "plugin" && isLuxury && dbHeader.length === 0;
  const mobileFallback =
    mobileSwap?.decision.kind !== "plugin" && isLuxury && dbMobile.length === 0;

  // Fallback-tree label localization, bound once: dashboard nodes and
  // generic stores always render the authored label.
  const fallbackLabel = (label: string) =>
    headerChrome?.labelFor(label, t) ?? label;

  return {
    headerChrome,
    isLuxury,
    custom,
    base,
    headerMenu,
    mobileMenu,
    headerFallback,
    mobileFallback,
    fallbackLabel,
    headerDecision: headerSwap ? headerSwap.decision : null,
    mobileDecision: mobileSwap ? mobileSwap.decision : null,
    menuOnError: menuSwap?.onError,
  };
}

/* ─────────────────────────────────────────────────────────────
 * LAYER 2 — HeaderBehavior: shared interactions (hooks only).
 * Owns sticky shrink state (scroll listener), mobile drawer open
 * state (plus body scroll lock), and mobile accordion expansion.
 * No data assembly, no markup — pure interaction state shared by
 * every theme presentation.
 * ───────────────────────────────────────────────────────────── */

export type HeaderBehavior = {
  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  scrolled: boolean;
  expandedMobileMenu: string | null;
  setExpandedMobileMenu: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useHeaderBehavior(): HeaderBehavior {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [expandedMobileMenu, setExpandedMobileMenu] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setExpandedMobileMenu(null);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return {
    mobileOpen,
    setMobileOpen,
    scrolled,
    expandedMobileMenu,
    setExpandedMobileMenu,
  };
}

/* ─────────────────────────────────────────────────────────────
 * LAYER 3 — ThemeHeaderRenderer: single theme-parameterized
 * presentation (no per-theme JSX duplication, no slug checks).
 * Owns logo placement, nav geometry, desktop and mobile layout,
 * mega presentation, icons, sticky behavior, typography, spacing.
 * One renderer serves every theme via isLuxury plus chrome tokens;
 * token-only classes preserved throughout.
 * ───────────────────────────────────────────────────────────── */

const headerIconLinkCls =
  "grid size-10 shrink-0 place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 text-[var(--theme-ink)]/70 hover:text-[var(--theme-ink)]";

export function HeaderAnnouncementBar({
  headerChrome,
  scrolled,
  t,
}: {
  headerChrome: ThemeHeaderChrome | null;
  scrolled: boolean;
  t: (en: string, bn?: string) => string;
}) {
  if (!headerChrome) return null;
  return (
    <div
      className={`w-full overflow-hidden transition-all duration-250 ease-out motion-reduce:transition-none border-b border-[var(--theme-border)] ${scrolled ? "h-0 opacity-0 border-transparent" : "h-[36px] opacity-100"}`}
    >
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <div className="hidden sm:block text-[10px] font-medium tracking-wide text-[var(--theme-ink)]/60 w-1/3 text-left">
          {headerChrome.announcement.left}
        </div>
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)] w-full sm:w-1/3 text-center">
          {t(
            headerChrome.announcement.center,
            headerChrome.announcement.center_bn,
          )}
        </div>
        <div className="hidden sm:flex justify-end w-1/3">
          <LanguageToggle />
        </div>
      </div>
    </div>
  );
}

export function HeaderBrandMark({
  headerChrome,
  isLuxury,
  name,
}: {
  headerChrome: ThemeHeaderChrome | null;
  isLuxury: boolean;
  name: string;
}) {
  const logoNode = headerChrome ? (
    <img
      src={headerChrome.logo.src}
      alt={headerChrome.logo.alt}
      className="h-[34px] w-auto object-contain transition-all duration-300"
    />
  ) : null;

  const textLogoNode = (
    <span
      className={`font-bangla-display block truncate text-xl font-semibold tracking-tight ${isLuxury ? "hidden" : ""} text-[var(--theme-ink)]`}
    >
      {name}
    </span>
  );

  return (
    <>
      {logoNode}
      {textLogoNode}
    </>
  );
}

export function HeaderDesktopNav({
  headerMenu,
  base,
  headerFallback,
  fallbackLabel,
  isLuxury,
  t,
}: {
  headerMenu: readonly MenuNode[];
  base: string;
  headerFallback: boolean;
  fallbackLabel: (label: string) => string;
  isLuxury: boolean;
  t: (en: string, bn?: string) => string;
}) {
  if (headerMenu.length === 0) return null;
  return (
    <nav aria-label={t("Store menu", "স্টোর মেনু")} className="h-full">
      <ul className="flex items-center justify-center flex-wrap gap-x-4 lg:gap-x-9 gap-y-1">
        {headerMenu.map((node) => (
          <li key={node.id} className="group relative h-full flex items-center">
            <HeaderMenuLink
              node={node as MenuNode}
              base={base}
              localizeLabel={headerFallback ? fallbackLabel : undefined}
              className="inline-flex items-center py-[24px] text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]/80 hover:text-[var(--theme-ink)] transition-colors"
            />
            {isLuxury && node.children && node.children.length > 0 && (
              <div className="fixed left-0 w-full top-full pt-0 hidden group-hover:block group-focus-within:block z-50">
                <div className="w-full bg-[var(--theme-surface)] shadow-xl border-t border-[var(--theme-border)] max-h-[85vh] overflow-y-auto">
                  <div className="mx-auto flex max-w-[1440px] px-10 py-12 gap-16">
                    <ul className="flex-1 grid grid-cols-4 gap-x-8 gap-y-10">
                      {node.children.map((child: any) => (
                        <li key={child.id}>
                          <HeaderMenuLink
                            node={child}
                            base={base}
                            localizeLabel={
                              headerFallback ? fallbackLabel : undefined
                            }
                            className="flex min-h-[44px] items-center font-serif text-[16px] font-normal text-[var(--theme-ink)] hover:text-[var(--theme-ink)]/70 motion-safe:transition-colors text-left mb-4"
                          />
                          {child.children && child.children.length > 0 && (
                            <ul className="space-y-3">
                              {child.children.map((grandchild: any) => (
                                <li key={grandchild.id}>
                                  <HeaderMenuLink
                                    node={grandchild}
                                    base={base}
                                    localizeLabel={
                                      headerFallback
                                        ? fallbackLabel
                                        : undefined
                                    }
                                    className="flex min-h-[44px] items-center font-sans text-[13px] text-[var(--theme-ink)]/60 hover:text-[var(--theme-ink)] motion-safe:transition-colors text-left"
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                    {(node as any).image && (
                      <div className="w-[320px] shrink-0">
                        <div className="aspect-[3/4] w-full overflow-hidden bg-[var(--theme-muted)]">
                          <img
                            src={(node as any).image}
                            alt={
                              headerFallback
                                ? fallbackLabel(node.label)
                                : node.label
                            }
                            className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-1000 group-hover:scale-105"
                          />
                        </div>
                        <div className="mt-4 flex min-h-[44px] items-center gap-2">
                          <span className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]">
                            {t("Shop", "কেনাকাটা")}{" "}
                            {headerFallback
                              ? fallbackLabel(node.label)
                              : node.label}
                          </span>
                          <span className="text-[var(--theme-ink)] text-xs">
                            →
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {!isLuxury && node.children && node.children.length > 0 && (
              <div className="absolute left-1/2 -translate-x-1/2 min-w-[200px] top-[100%] pt-0 hidden group-hover:block group-focus-within:block z-50">
                <ul className="bg-white py-4 shadow-xl border border-gray-100 rounded-sm">
                  {node.children.map((child: any) => (
                    <li key={child.id}>
                      <HeaderMenuLink
                        node={child}
                        base={base}
                        className="block px-6 py-2.5 font-sans text-[13px] text-gray-700 hover:text-black hover:bg-gray-50 transition-colors text-left whitespace-nowrap"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function HeaderUtilityIcons({
  custom,
  slug,
  wishlistCount,
  cartCount,
  cartHydrated,
  isLuxury,
  t,
}: {
  custom: boolean;
  slug: string;
  wishlistCount: number;
  cartCount: number;
  cartHydrated: boolean;
  isLuxury: boolean;
  t: (en: string, bn?: string) => string;
}) {
  const iconLinkCls = headerIconLinkCls;
  return (
    <div className="flex items-center justify-end gap-1 shrink-0">
      {custom ? (
        <Link
          to="/search"
          search={{}}
          aria-label={t("Search", "খুঁজুন")}
          className={iconLinkCls}
        >
          <Search className="size-[20px]" strokeWidth={1} aria-hidden />
        </Link>
      ) : (
        <Link
          to="/store/$slug/search"
          params={{ slug }}
          search={{}}
          aria-label={t("Search", "খুঁজুন")}
          className={iconLinkCls}
        >
          <Search className="size-[20px]" strokeWidth={1} aria-hidden />
        </Link>
      )}

      {custom ? (
        <Link
          to="/account"
          aria-label={t("Your account", "আপনার অ্যাকাউন্ট")}
          className={`${iconLinkCls} hidden sm:grid`}
        >
          <User className="size-[20px]" strokeWidth={1} aria-hidden />
        </Link>
      ) : (
        <Link
          to="/store/$slug/account"
          params={{ slug }}
          aria-label={t("Your account", "আপনার অ্যাকাউন্ট")}
          className={`${iconLinkCls} hidden sm:grid`}
        >
          <User className="size-[20px]" strokeWidth={1} aria-hidden />
        </Link>
      )}

      {custom ? (
        <Link
          to="/account"
          search={{ tab: "wishlist" }}
          aria-label={`${t("Wishlist", "উইশলিস্ট")}, ${wishlistCount}`}
          className={`${iconLinkCls} relative hidden sm:grid`}
        >
          <Heart className="size-[20px]" strokeWidth={1} aria-hidden />
          {wishlistCount > 0 && (
            <span
              key={wishlistCount}
              className="absolute right-1 top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[var(--theme-ink)] text-[9px] font-bold text-white motion-safe:animate-[fq-badge-pop_180ms_ease-out]"
            >
              {wishlistCount}
            </span>
          )}
        </Link>
      ) : (
        <Link
          to="/store/$slug/account"
          params={{ slug }}
          search={{ tab: "wishlist" }}
          aria-label={`${t("Wishlist", "উইশলিস্ট")}, ${wishlistCount}`}
          className={`${iconLinkCls} relative hidden sm:grid`}
        >
          <Heart className="size-[20px]" strokeWidth={1} aria-hidden />
          {wishlistCount > 0 && (
            <span
              key={wishlistCount}
              className="absolute right-1 top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[var(--theme-ink)] text-[9px] font-bold text-white motion-safe:animate-[fq-badge-pop_180ms_ease-out]"
            >
              {wishlistCount}
            </span>
          )}
        </Link>
      )}

      {!isLuxury && <LanguageToggle />}

      {custom ? (
        <Link
          to="/cart"
          aria-label={`${t("Cart", "কার্ট")}, ${hydratedCount(cartHydrated, cartCount)}`}
          className={`${iconLinkCls} relative`}
        >
          <ShoppingBag
            className="size-[20px]"
            strokeWidth={1}
            aria-hidden
          />
          {cartHydrated && cartCount > 0 && (
            <span className="absolute right-1 top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[var(--theme-ink)] text-[9px] font-bold text-white">
              {cartCount}
            </span>
          )}
        </Link>
      ) : (
        <Link
          to="/store/$slug/cart"
          params={{ slug }}
          aria-label={`${t("Cart", "কার্ট")}, ${hydratedCount(cartHydrated, cartCount)}`}
          className={`${iconLinkCls} relative`}
        >
          <ShoppingBag
            className="size-[20px]"
            strokeWidth={1}
            aria-hidden
          />
          {cartHydrated && cartCount > 0 && (
            <span className="absolute right-1 top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[var(--theme-ink)] text-[9px] font-bold text-white">
              {cartCount}
            </span>
          )}
        </Link>
      )}
    </div>
  );
}

function hydratedCount(hydrated: boolean, count: number): number {
  return hydrated ? count : 0;
}

export function HeaderMobileDrawer({
  mobileMenu,
  base,
  mobileFallback,
  fallbackLabel,
  isLuxury,
  scrolled,
  expandedMobileMenu,
  setExpandedMobileMenu,
  setMobileOpen,
  t,
}: {
  mobileMenu: readonly MenuNode[];
  base: string;
  mobileFallback: boolean;
  fallbackLabel: (label: string) => string;
  isLuxury: boolean;
  scrolled: boolean;
  expandedMobileMenu: string | null;
  setExpandedMobileMenu: React.Dispatch<React.SetStateAction<string | null>>;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  t: (en: string, bn?: string) => string;
}) {
  return (
    <nav
      id="store-mobile-menu"
      aria-label={t("Store menu", "স্টোর মেনু")}
      className="border-t border-[var(--theme-border)] bg-[var(--theme-surface)] md:hidden overflow-y-auto max-h-[calc(100vh-[64px])] fixed left-0 w-full z-40 bottom-0"
      style={{ top: scrolled ? "64px" : "108px" }}
    >
      <ul className="px-4 py-2 pb-24">
        {mobileMenu.map((node: any) => (
          <li key={node.id} className="border-b border-[var(--theme-border)]">
            <div className="flex justify-between items-center w-full">
              <HeaderMenuLink
                node={node}
                base={base}
                localizeLabel={mobileFallback ? fallbackLabel : undefined}
                onNavigate={() => setMobileOpen(false)}
                className="block py-5 text-[13px] font-semibold uppercase tracking-wide text-[var(--theme-ink)] flex-1"
              />
              {node.children && node.children.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedMobileMenu(
                      expandedMobileMenu === node.id ? null : node.id,
                    )
                  }
                  className="p-4 -mr-4 text-[var(--theme-ink)]"
                  aria-expanded={expandedMobileMenu === node.id}
                >
                  <span className="text-xl leading-none">
                    {expandedMobileMenu === node.id ? "−" : "+"}
                  </span>
                </button>
              )}
            </div>
            {node.children &&
              node.children.length > 0 &&
              expandedMobileMenu === node.id && (
                <ul className="ml-4 my-2 pb-4 space-y-1 border-t border-transparent">
                  {node.children.map((child: any) => (
                    <li key={child.id}>
                      <HeaderMenuLink
                        node={child}
                        base={base}
                        localizeLabel={
                          mobileFallback ? fallbackLabel : undefined
                        }
                        onNavigate={() => setMobileOpen(false)}
                        className={`block py-3 text-[15px] font-medium text-[var(--theme-ink)]/80${isLuxury ? " min-h-[44px]" : ""}`}
                      />
                      {child.children && child.children.length > 0 && (
                        <ul className="ml-4 mt-2 mb-4 space-y-2 border-l border-[var(--theme-border)] pl-4">
                          {child.children.map((gc: any) => (
                            <li key={gc.id}>
                              <HeaderMenuLink
                                node={gc}
                                base={base}
                                localizeLabel={
                                  mobileFallback ? fallbackLabel : undefined
                                }
                                onNavigate={() => setMobileOpen(false)}
                                className={`block py-1.5 text-[14px] text-[var(--theme-ink)]/60${isLuxury ? " min-h-[44px]" : ""}`}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* Nav markup for mega_menu presentations is theme-owned (each theme's
 * header-presentation module renders its own desktop nav plus mobile
 * drawer from the canonical row model). Shared code keeps HeaderData,
 * HeaderBehavior, and the canonical row model in `@/lib/menus/menu`. */

export function ThemeHeaderRenderer({
  slug,
  name,
  custom,
  data,
  behavior,
  wishlistCount,
  cartCount,
  cartHydrated,
  t,
}: {
  slug: string;
  name: string;
  custom: boolean;
  data: HeaderData;
  behavior: HeaderBehavior;
  wishlistCount: number;
  cartCount: number;
  cartHydrated: boolean;
  t: (en: string, bn?: string) => string;
}) {
  const { headerChrome, isLuxury, base, headerMenu, mobileMenu } = data;
  const {
    mobileOpen,
    setMobileOpen,
    scrolled,
    expandedMobileMenu,
    setExpandedMobileMenu,
  } = behavior;
  const iconLinkCls = headerIconLinkCls;
  // MENU RUNTIME replacement: an approved + scoped swap whose plugin
  // registered a renderer owns the slot's presentation and receives the
  // winning rows. Anything else (unapproved, scope-denied, unregistered)
  // keeps the theme markup — the renderer never runs without a `plugin`
  // verdict, so output is byte-identical to before.
  const HeaderPluginNav = selectPluginMenuRenderer(
    data.headerDecision,
    STORE_HEADER_MENU_SLOT,
  );
  const headerPluginId =
    data.headerDecision?.kind === "plugin"
      ? data.headerDecision.pluginId
      : null;
  const DrawerPluginNav = selectPluginMenuRenderer(
    data.mobileDecision,
    STORE_DRAWER_MENU_SLOT,
  );
  const drawerPluginId =
    data.mobileDecision?.kind === "plugin"
      ? data.mobileDecision.pluginId
      : null;
  const themeDesktopNav = (
    <HeaderDesktopNav
      headerMenu={headerMenu}
      base={base}
      headerFallback={data.headerFallback}
      fallbackLabel={data.fallbackLabel}
      isLuxury={isLuxury}
      t={t}
    />
  );
  const themeMobileDrawer = (
    <HeaderMobileDrawer
      mobileMenu={mobileMenu}
      base={base}
      mobileFallback={data.mobileFallback}
      fallbackLabel={data.fallbackLabel}
      isLuxury={isLuxury}
      scrolled={scrolled}
      expandedMobileMenu={expandedMobileMenu}
      setExpandedMobileMenu={setExpandedMobileMenu}
      setMobileOpen={setMobileOpen}
      t={t}
    />
  );
  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-250 ease-out bg-[var(--theme-surface)]${isLuxury ? " motion-reduce:transition-none" : ""} ${
        scrolled ? "shadow-sm border-b border-[var(--theme-border)]" : ""
      }`}
    >
      {/* ── Announcement Bar (luxury variant, theme-authored copy) ── */}
      <HeaderAnnouncementBar
        headerChrome={headerChrome}
        scrolled={scrolled}
        t={t}
      />

      {/* ── Main bar ── */}
      <div
        className={`relative mx-auto flex transition-all duration-250 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10 ${scrolled ? "h-[64px]" : "h-[72px]"}`}
      >
        {/* ── LEFT: Logo + Mobile Hamburger ── */}
        <div className="flex items-center gap-4 shrink-0">
          {mobileMenu.length > 0 && (
            <button
              type="button"
              aria-expanded={mobileOpen}
              aria-controls="store-mobile-menu"
              aria-label={
                mobileOpen
                  ? t("Close menu", "মেনু বন্ধ করুন")
                  : t("Open menu", "মেনু খুলুন")
              }
              onClick={() => setMobileOpen((open) => !open)}
              className={`${iconLinkCls} md:hidden -ml-2`}
            >
              {mobileOpen ? (
                <X className="size-[22px]" strokeWidth={1} aria-hidden />
              ) : (
                <MenuIcon className="size-[22px]" strokeWidth={1} aria-hidden />
              )}
            </button>
          )}

          {custom ? (
            <Link to="/" className="flex items-center">
              <HeaderBrandMark
                headerChrome={headerChrome}
                isLuxury={isLuxury}
                name={name}
              />
            </Link>
          ) : (
            <Link
              to="/store/$slug"
              params={{ slug }}
              className="flex items-center"
            >
              <HeaderBrandMark
                headerChrome={headerChrome}
                isLuxury={isLuxury}
                name={name}
              />
            </Link>
          )}
        </div>

        {/* ── CENTER: Desktop Navigation ── */}
        <div className="hidden md:flex flex-1 min-w-0 justify-center pointer-events-auto">
          {HeaderPluginNav && headerPluginId ? (
            <PluginMenuBoundary
              pluginId={headerPluginId}
              slot={STORE_HEADER_MENU_SLOT}
              fallback={themeDesktopNav}
              onError={data.menuOnError}
            >
              <HeaderPluginNav
                rows={headerMenu}
                slot={STORE_HEADER_MENU_SLOT}
                pluginId={headerPluginId}
              />
            </PluginMenuBoundary>
          ) : (
            themeDesktopNav
          )}
        </div>

        {/* ── RIGHT: utility icons ── */}
        <HeaderUtilityIcons
          custom={custom}
          slug={slug}
          wishlistCount={wishlistCount}
          cartCount={cartCount}
          cartHydrated={cartHydrated}
          isLuxury={isLuxury}
          t={t}
        />
      </div>

      {/* ── Mobile full-height slide-in menu ── */}
      {mobileOpen &&
        mobileMenu.length > 0 &&
        (DrawerPluginNav && drawerPluginId ? (
          <PluginMenuBoundary
            pluginId={drawerPluginId}
            slot={STORE_DRAWER_MENU_SLOT}
            fallback={themeMobileDrawer}
            onError={data.menuOnError}
          >
            <DrawerPluginNav
              rows={mobileMenu}
              slot={STORE_DRAWER_MENU_SLOT}
              pluginId={drawerPluginId}
            />
          </PluginMenuBoundary>
        ) : (
          themeMobileDrawer
        ))}
    </header>
  );
}

export function StoreHeader({
  slug,
  name,
  tagline,
  storeTimezone,
  allowCustomerTimezone,
  menus,
  themeKey,
  menuSwap,
}: {
  slug: string;
  name: string;
  tagline?: string | null;
  storeTimezone?: string;
  allowCustomerTimezone?: boolean;
  menus?: Pick<StoreMenus, "header" | "mobile"> | null;
  /**
   * Theme-remediation Task 3: explicit merchant theme key driving header
   * chrome. Null/undefined renders the generic header — chrome never
   * sniffs the slug or display name.
   */
  themeKey?: string | null;
  /**
   * TRACK M — optional nav renderer swap (review-gated). Absent keeps
   * today's precedence exactly (dashboard rows, else theme fallback). An
   * approved swap substitutes engine-rendered rows fail-open, and — when the
   * plugin registered a renderer for the slot — replaces the nav
   * presentation too: unapproved, scope-denied, unregistered or throwing
   * renderers keep the theme markup and log through the shared
   * resolver/boundary — shoppers never lose navigation.
   */
  menuSwap?: StoreMenuSwap;
}) {
  void tagline;
  void storeTimezone;
  void allowCustomerTimezone;
  const { count, hydrated } = useCart(slug);
  const { count: wishlistCount } = useWishlistHeader();
  const { t } = useLang();
  const { location } = useRouterState();
  // LAYER 1 — HeaderData: pure assembly from hook inputs plus props.
  const data = assembleHeaderData({
    slug,
    menus,
    themeKey,
    menuSwap,
    pathname: location.pathname,
    t,
  });
  // LAYER 2 — HeaderBehavior: shared interactions.
  const behavior = useHeaderBehavior();
  // LAYER 3 — ThemeHeaderRenderer: single parameterized presentation.
  return (
    <ThemeHeaderRenderer
      slug={slug}
      name={name}
      custom={data.custom}
      data={data}
      behavior={behavior}
      wishlistCount={wishlistCount}
      cartCount={count}
      cartHydrated={hydrated}
      t={t}
    />
  );
}

function HeaderMenuLink({
  node,
  base,
  className,
  onNavigate,
  localizeLabel,
}: {
  node: MenuNode;
  base: string;
  className?: string;
  onNavigate?: () => void;
  /** Twin resolver for fallback-tree nodes. Absent for dashboard nodes and
   * generic stores, which always render the authored label. */
  localizeLabel?: (label: string) => string;
}) {
  if (!node.label) return null;
  return (
    <a
      href={rebaseMenuHref(node.url || "#", base)}
      title={node.titleAttr || undefined}
      onClick={onNavigate}
      {...(node.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
      className={className}
    >
      {localizeLabel ? localizeLabel(node.label) : node.label}
    </a>
  );
}
