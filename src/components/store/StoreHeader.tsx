import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Menu as MenuIcon,
  Search,
  ShoppingBag,
  User,
  X,
  Heart
} from "@/components/icons/tabler";
import { useCart } from "@/lib/cart";
import { useWishlistHeader } from "@/lib/wishlist-card";
import { useLang } from "@/lib/i18n";
import { isCustomHostPath } from "@/lib/storefront-url";
import {
  rebaseMenuHref,
  type MenuNode,
  type StoreMenus,
} from "@/lib/menus/menu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { TimezoneToggle } from "./TimezoneToggle";
import {
  resolveHeaderConfig,
  resolveHeaderMenus,
  type HeaderChromeConfig,
} from "./theme-chrome";

/** Re-exported for existing callers (CollectionView subnav lookup). */
export { SONGOSKRITI_MEGA_MENU } from "./theme-chrome";

/**
 * Count badge for header utility icons (wishlist/cart). Single component,
 * semantic token classes only: bg-foreground/text-background is the token
 * equivalent of the old near-black/white pair.
 */
function CountBadge({
  count,
  pop = false,
}: {
  count: React.ReactNode;
  pop?: boolean;
}) {
  return (
    <span
      className={`absolute right-1 top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background${pop ? " motion-safe:animate-[fq-badge-pop_180ms_ease-out]" : ""}`}
    >
      {count}
    </span>
  );
}

export function StoreHeader({
  slug,
  name,
  tagline,
  storeTimezone,
  allowCustomerTimezone,
  menus,
}: {
  slug: string;
  name: string;
  tagline?: string | null;
  storeTimezone?: string;
  allowCustomerTimezone?: boolean;
  menus?: Pick<StoreMenus, "header" | "mobile"> | null;
}) {
  const { count, hydrated } = useCart(slug);
  const { count: wishlistCount } = useWishlistHeader();
  const { t } = useLang();
  const { location } = useRouterState();
  const custom = isCustomHostPath(location.pathname);
  const base = custom ? "" : `/store/${slug}`;
  
  const chrome: HeaderChromeConfig = resolveHeaderConfig(slug, name);

  const { headerMenu, mobileMenu } = resolveHeaderMenus(chrome, menus);
  
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); 
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [expandedMobileMenu, setExpandedMobileMenu] = useState<string | null>(null);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setExpandedMobileMenu(null);
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const logoNode =
    chrome.logoKind === "lockup" && chrome.logoSrc ? (
      <img
        src={chrome.logoSrc}
        alt={chrome.logoAlt}
        className="h-[34px] w-auto object-contain transition-all duration-300"
      />
    ) : null;

  const textLogoNode = (
    <span
      className={`font-bangla-display block truncate text-xl font-semibold tracking-tight ${chrome.textLogoHidden ? "hidden" : ""} ${chrome.textLogoClass}`}
    >
      {name}
    </span>
  );

  const iconLinkCls = "grid size-10 shrink-0 place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 text-[#1a1a1a]/70 hover:text-[#1a1a1a]";

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-250 ease-out bg-[#FAF9F7] ${
        scrolled ? "shadow-sm border-b border-[#eaeaea]" : ""
      }`}
    >
      {/* ── Announcement Bar ── */}
      {chrome.showAnnouncement && (
        <div className={`w-full overflow-hidden transition-all duration-250 ease-out border-b border-[#eaeaea] ${scrolled ? "h-0 opacity-0 border-transparent" : "h-[36px] opacity-100"}`}>
          <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
            <div className="hidden sm:block text-[10px] font-medium tracking-wide text-[#1a1a1a]/60 w-1/3 text-left">
              EASY 7-DAY EXCHANGE
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a] w-full sm:w-1/3 text-center">
              {t("Free delivery across Bangladesh on orders over BDT 5000", "৫০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি")}
            </div>
            <div className="hidden sm:flex justify-end w-1/3">
              <LanguageToggle />
            </div>
          </div>
        </div>
      )}
      
      {/* ── Main bar ── */}
      <div className={`relative mx-auto flex transition-all duration-250 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10 ${scrolled ? "h-[64px]" : "h-[72px]"}`}>

        {/* ── LEFT: Logo + Mobile Hamburger ── */}
        <div className="flex items-center gap-4 flex-1">
          {mobileMenu.length > 0 && (
            <button
              type="button"
              aria-expanded={mobileOpen}
              aria-controls="store-mobile-menu"
              aria-label={mobileOpen ? t("Close menu", "মেনু বন্ধ করুন") : t("Open menu", "মেনু খুলুন")}
              onClick={() => setMobileOpen((open) => !open)}
              className={`${iconLinkCls} md:hidden -ml-2`}
            >
              {mobileOpen ? <X className="size-[22px]" strokeWidth={1} aria-hidden /> : <MenuIcon className="size-[22px]" strokeWidth={1} aria-hidden />}
            </button>
          )}

          {custom ? (
            <Link to="/" className="flex items-center">
              {logoNode}
              {textLogoNode}
            </Link>
          ) : (
            <Link to="/store/$slug" params={{ slug }} className="flex items-center">
              {logoNode}
              {textLogoNode}
            </Link>
          )}
        </div>

        {/* ── CENTER: Desktop Navigation ── */}
        <div className="hidden md:flex flex-1 justify-center pointer-events-auto">
          {headerMenu.length > 0 && (
            <nav aria-label={t("Store menu", "স্টোর মেনু")} className="h-full">
              <ul className="flex items-center gap-7 lg:gap-9">
                {headerMenu.map((node) => (
                  <li key={node.id} className="group relative h-full flex items-center">
                    <HeaderMenuLink
                      node={node as MenuNode}
                      base={base}
                      className="inline-flex items-center py-[24px] text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]/80 hover:text-[#1a1a1a] transition-colors"
                    />
                    {chrome.menuVariant === "mega" &&
                      node.children &&
                      node.children.length > 0 && (
                      <div className="fixed left-0 w-full top-full pt-0 hidden group-hover:block group-focus-within:block z-50">
                        <div className="w-full bg-[#FAF9F7] shadow-xl border-t border-[#eaeaea] max-h-[85vh] overflow-y-auto">
                          <div className="mx-auto flex max-w-[1440px] px-10 py-12 gap-16">
                            <ul className="flex-1 grid grid-cols-4 gap-x-8 gap-y-10">
                              {node.children.map((child: any) => (
                                <li key={child.id}>
                                  <HeaderMenuLink
                                    node={child}
                                    base={base}
                                    className="block font-serif text-[16px] font-normal text-[#1a1a1a] hover:text-[#1a1a1a]/70 transition-colors text-left mb-4"
                                  />
                                  {child.children && child.children.length > 0 && (
                                    <ul className="space-y-3">
                                      {child.children.map((grandchild: any) => (
                                        <li key={grandchild.id}>
                                          <HeaderMenuLink
                                            node={grandchild}
                                            base={base}
                                            className="block font-sans text-[13px] text-[#1a1a1a]/60 hover:text-[#1a1a1a] transition-colors text-left"
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
                                <div className="aspect-[3/4] w-full overflow-hidden bg-[#f0f0f0]">
                                  <img 
                                    src={(node as any).image} 
                                    alt={node.label} 
                                    className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105" 
                                  />
                                </div>
                                <div className="mt-4 flex items-center gap-2">
                                  <span className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a]">Shop {node.label}</span>
                                  <span className="text-[#1a1a1a] text-xs">→</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {chrome.menuVariant !== "mega" &&
                      node.children &&
                      node.children.length > 0 && (
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
          )}
        </div>

        {/* ── RIGHT: utility icons ── */}
        <div className="flex items-center justify-end gap-1 flex-1">
          {custom ? (
            <Link to="/search" search={{}} aria-label={t("Search", "খুঁজুন")} className={iconLinkCls}>
              <Search className="size-[20px]" strokeWidth={1} aria-hidden />
            </Link>
          ) : (
            <Link to="/store/$slug/search" params={{ slug }} search={{}} aria-label={t("Search", "খুঁজুন")} className={iconLinkCls}>
              <Search className="size-[20px]" strokeWidth={1} aria-hidden />
            </Link>
          )}

          {custom ? (
            <Link to="/account" aria-label={t("Your account", "আপনার অ্যাকাউন্ট")} className={`${iconLinkCls} hidden sm:grid`}>
              <User className="size-[20px]" strokeWidth={1} aria-hidden />
            </Link>
          ) : (
            <Link to="/store/$slug/account" params={{ slug }} aria-label={t("Your account", "আপনার অ্যাকাউন্ট")} className={`${iconLinkCls} hidden sm:grid`}>
              <User className="size-[20px]" strokeWidth={1} aria-hidden />
            </Link>
          )}
          
          {custom ? (
            <Link to="/account" search={{ tab: "wishlist" }} aria-label={`${t("Wishlist","উইশলিস্ট")}, ${wishlistCount}`} className={`${iconLinkCls} relative hidden sm:grid`}>
              <Heart className="size-[20px]" strokeWidth={1} aria-hidden />
              {wishlistCount>0 && (
                <CountBadge key={wishlistCount} count={wishlistCount} pop />
              )}
            </Link>
          ) : (
            <Link to="/store/$slug/account" params={{ slug }} search={{ tab: "wishlist" }} aria-label={`${t("Wishlist","উইশলিস্ট")}, ${wishlistCount}`} className={`${iconLinkCls} relative hidden sm:grid`}>
              <Heart className="size-[20px]" strokeWidth={1} aria-hidden />
              {wishlistCount>0 && (
                <CountBadge key={wishlistCount} count={wishlistCount} pop />
              )}
            </Link>
          )}

          {chrome.togglePlacement === "utility" && <LanguageToggle />}

          {custom ? (
            <Link to="/checkout" aria-label={`${t("Cart", "কার্ট")}, ${hydrated ? count : 0}`} className={`${iconLinkCls} relative`}>
              <ShoppingBag className="size-[20px]" strokeWidth={1} aria-hidden />
              {hydrated && count > 0 && (
                <CountBadge count={count} />
              )}
            </Link>
          ) : (
            <Link to="/store/$slug/checkout" params={{ slug }} aria-label={`${t("Cart", "কার্ট")}, ${hydrated ? count : 0}`} className={`${iconLinkCls} relative`}>
              <ShoppingBag className="size-[20px]" strokeWidth={1} aria-hidden />
              {hydrated && count > 0 && (
                <CountBadge count={count} />
              )}
            </Link>
          )}
        </div>
      </div>

      {/* ── Mobile full-height slide-in menu ── */}
      {mobileOpen && mobileMenu.length > 0 && (
        <nav
          id="store-mobile-menu"
          aria-label={t("Store menu", "স্টোর মেনু")}
          className="border-t border-[#eaeaea] bg-[#FAF9F7] md:hidden overflow-y-auto max-h-[calc(100vh-[64px])] fixed left-0 w-full z-40 bottom-0"
          style={{ top: scrolled ? "64px" : "108px" }}
        >
          <ul className="px-4 py-2 pb-24">
            {mobileMenu.map((node: any) => (
              <li key={node.id} className="border-b border-[#eaeaea]">
                <div className="flex justify-between items-center w-full">
                  <HeaderMenuLink
                    node={node}
                    base={base}
                    onNavigate={() => setMobileOpen(false)}
                    className="block py-5 text-[13px] font-semibold uppercase tracking-wide text-[#1a1a1a] flex-1"
                  />
                  {node.children && node.children.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedMobileMenu(expandedMobileMenu === node.id ? null : node.id)}
                      className="p-4 -mr-4 text-[#1a1a1a]"
                      aria-expanded={expandedMobileMenu === node.id}
                    >
                      <span className="text-xl leading-none">{expandedMobileMenu === node.id ? "−" : "+"}</span>
                    </button>
                  )}
                </div>
                {node.children && node.children.length > 0 && expandedMobileMenu === node.id && (
                  <ul className="ml-4 my-2 pb-4 space-y-1 border-t border-transparent">
                    {node.children.map((child: any) => (
                      <li key={child.id}>
                        <HeaderMenuLink
                          node={child}
                          base={base}
                          onNavigate={() => setMobileOpen(false)}
                          className="block py-3 text-[15px] font-medium text-[#1a1a1a]/80"
                        />
                        {child.children && child.children.length > 0 && (
                          <ul className="ml-4 mt-2 mb-4 space-y-2 border-l border-[#eaeaea] pl-4">
                            {child.children.map((gc: any) => (
                               <li key={gc.id}>
                                 <HeaderMenuLink
                                    node={gc}
                                    base={base}
                                    onNavigate={() => setMobileOpen(false)}
                                    className="block py-1.5 text-[14px] text-[#1a1a1a]/60"
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
      )}
    </header>
  );
}

function HeaderMenuLink({
  node,
  base,
  className,
  onNavigate,
}: {
  node: MenuNode;
  base: string;
  className?: string;
  onNavigate?: () => void;
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
      {node.label}
    </a>
  );
}
