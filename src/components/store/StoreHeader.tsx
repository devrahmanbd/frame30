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
  selectMobileMenu,
  type MenuNode,
  type StoreMenus,
} from "@/lib/menus/menu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { TimezoneToggle } from "./TimezoneToggle";

export const SONGOSKRITI_MEGA_MENU = [
  {
    id: "women", label: "Women", url: "/c/women",
    image: "/ph/songoskriti/cat-women.png",
    children: [
      { id: "w-sarees", label: "Sarees", url: "/c/sarees", children: [
        { id: "ws-jamdani", label: "Jamdani", url: "/c/jamdani" },
        { id: "ws-tangail", label: "Tangail", url: "/c/tangail" },
        { id: "ws-muslin", label: "Muslin", url: "/c/muslin" },
        { id: "ws-silk", label: "Silk", url: "/c/silk" },
        { id: "ws-handloom", label: "Handloom", url: "/c/handloom" },
        { id: "ws-cotton", label: "Cotton", url: "/c/cotton" },
        { id: "ws-festive", label: "Festive Sarees", url: "/c/festive" },
      ] },
      { id: "w-occasion", label: "Occasion", url: "/c/occasion", children: [
        { id: "wo-eid", label: "Eid", url: "/c/eid" },
        { id: "wo-wedding", label: "Wedding", url: "/c/wedding" },
        { id: "wo-everyday", label: "Everyday", url: "/c/everyday" },
        { id: "wo-party", label: "Party", url: "/c/party" },
      ] },
      { id: "w-featured", label: "Featured", url: "/c/featured", children: [
        { id: "wf-new", label: "New Arrivals", url: "/c/new-in" },
        { id: "wf-best", label: "Bestsellers", url: "/c/bestsellers" },
      ] },
    ]
  },
  {
    id: "men", label: "Men", url: "/c/men",
    image: "/ph/songoskriti/cat-men.png",
    children: [
      { id: "m-panjabi", label: "Panjabi", url: "/c/panjabi", children: [
        { id: "mp-premium", label: "Premium Panjabi", url: "/c/premium-panjabi" },
        { id: "mp-silk", label: "Silk", url: "/c/silk-panjabi" },
        { id: "mp-handloom", label: "Handloom", url: "/c/handloom-panjabi" },
        { id: "mp-festive", label: "Festive", url: "/c/festive-panjabi" },
        { id: "mp-casual", label: "Casual", url: "/c/casual-panjabi" },
      ] },
      { id: "m-sets", label: "Sets", url: "/c/sets", children: [
        { id: "ms-set", label: "Panjabi & Pajama", url: "/c/panjabi-sets" },
        { id: "ms-family", label: "Family Matching", url: "/c/family" },
      ] },
    ]
  },
  {
    id: "kids", label: "Kids", url: "/c/kids",
    image: "/ph/songoskriti/cat-kids.png",
    children: [
      { id: "k-boys", label: "Boys", url: "/c/boys", children: [
        { id: "kb-panjabi", label: "Panjabi", url: "/c/boys-panjabi" },
        { id: "kb-sets", label: "Sets", url: "/c/boys-sets" },
      ] },
      { id: "k-girls", label: "Girls", url: "/c/girls", children: [
        { id: "kg-saree", label: "Sarees", url: "/c/girls-sarees" },
        { id: "kg-dresses", label: "Dresses", url: "/c/girls-dresses" },
        { id: "kg-lehenga", label: "Lehengas", url: "/c/girls-lehengas" },
      ] },
    ]
  },
  {
    id: "collections", label: "Collections", url: "/c",
    image: "/ph/songoskriti/hero-weaves.png",
    children: [
      { id: "c-featured", label: "Featured", url: "/c/featured", children: [
        { id: "cf-signature", label: "Signature Sarees", url: "/c/signature" },
        { id: "cf-modern", label: "The Modern Panjabi", url: "/c/modern-panjabi" },
        { id: "cf-everyday", label: "Everyday Heritage", url: "/c/everyday" },
      ] }
    ]
  },
  {
    id: "festive", label: "Festive", url: "/c/festive",
    image: "/ph/songoskriti/hero-festive.png",
    children: [
      { id: "f-occ", label: "Occasions", url: "/c/festive", children: [
        { id: "fo-eid", label: "Eid", url: "/c/eid" },
        { id: "fo-wedding", label: "Wedding", url: "/c/wedding" },
        { id: "fo-mehendi", label: "Mehendi", url: "/c/mehendi" },
        { id: "fo-sangeet", label: "Sangeet", url: "/c/sangeet" },
        { id: "fo-puja", label: "Puja", url: "/c/puja" },
        { id: "fo-gifting", label: "Gifting", url: "/c/gifting" },
      ] }
    ]
  },
  {
    id: "heritage", label: "Heritage", url: "/c/heritage",
    image: "/ph/songoskriti/hero-artisans.png",
    children: [
      { id: "h-weaves", label: "Weaves & Craft", url: "/c/heritage", children: [
        { id: "hw-jamdani", label: "Jamdani", url: "/c/jamdani" },
        { id: "hw-tangail", label: "Tangail", url: "/c/tangail" },
        { id: "hw-silk", label: "Rajshahi Silk", url: "/c/silk" },
        { id: "hw-kantha", label: "Nakshi Kantha", url: "/c/kantha" },
        { id: "hw-handloom", label: "Handloom", url: "/c/handloom" },
        { id: "hw-artisan", label: "Artisan Stories", url: "/blog/artisan-story" },
      ] }
    ]
  },
  {
    id: "new-in", label: "New Arrivals", url: "/c/new-in",
    image: "/ph/songoskriti/cat-newin.png",
    children: []
  },
];

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
  
  const isSongoskriti = slug === "songoskriti" || name?.toLowerCase() === "songoskriti";
  
  const headerMenu = isSongoskriti ? SONGOSKRITI_MEGA_MENU : (menus?.header ?? []);
  const mobileMenu = isSongoskriti ? SONGOSKRITI_MEGA_MENU : (menus ? selectMobileMenu(menus) : []);
  
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

  const logoNode = isSongoskriti ? (
    <img
      src="/ph/songoskriti/logo-lockup.svg"
      alt="Songoskriti"
      className="h-[34px] w-auto object-contain transition-all duration-300"
    />
  ) : null;
  
  const textLogoNode = (
    <span className={`font-bangla-display block truncate text-xl font-semibold tracking-tight ${isSongoskriti ? 'hidden' : ''} text-[#1a1a1a]`}>
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
      {isSongoskriti && (
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
                    {isSongoskriti && node.children && node.children.length > 0 && (
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
                    {!isSongoskriti && node.children && node.children.length > 0 && (
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
                <span key={wishlistCount} className="absolute right-1 top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[#1a1a1a] text-[9px] font-bold text-white motion-safe:animate-[fq-badge-pop_180ms_ease-out]">
                  {wishlistCount}
                </span>
              )}
            </Link>
          ) : (
            <Link to="/store/$slug/account" params={{ slug }} search={{ tab: "wishlist" }} aria-label={`${t("Wishlist","উইশলিস্ট")}, ${wishlistCount}`} className={`${iconLinkCls} relative hidden sm:grid`}>
              <Heart className="size-[20px]" strokeWidth={1} aria-hidden />
              {wishlistCount>0 && (
                <span key={wishlistCount} className="absolute right-1 top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[#1a1a1a] text-[9px] font-bold text-white motion-safe:animate-[fq-badge-pop_180ms_ease-out]">
                  {wishlistCount}
                </span>
              )}
            </Link>
          )}

          {!isSongoskriti && <LanguageToggle />}

          {custom ? (
            <Link to="/checkout" aria-label={`${t("Cart", "কার্ট")}, ${hydrated ? count : 0}`} className={`${iconLinkCls} relative`}>
              <ShoppingBag className="size-[20px]" strokeWidth={1} aria-hidden />
              {hydrated && count > 0 && (
                <span className="absolute right-1 top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[#1a1a1a] text-[9px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
          ) : (
            <Link to="/store/$slug/checkout" params={{ slug }} aria-label={`${t("Cart", "কার্ট")}, ${hydrated ? count : 0}`} className={`${iconLinkCls} relative`}>
              <ShoppingBag className="size-[20px]" strokeWidth={1} aria-hidden />
              {hydrated && count > 0 && (
                <span className="absolute right-1 top-1.5 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[#1a1a1a] text-[9px] font-bold text-white">
                  {count}
                </span>
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
