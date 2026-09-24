import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Menu as MenuIcon,
  Search,
  ShoppingBag,
  User,
  X,
} from "@/components/icons/tabler";
import { useCart } from "@/lib/cart";
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

/**
 * Phase 16 T4 — optional dashboard-designed navigation.
 *
 * When `menus` carries a claimed header location the header renders it as the
 * storefront nav row (desktop) and the slide-out disclosure (mobile falls back
 * to the header menu when no mobile menu is claimed). Empty/absent menus
 * render nothing extra, leaving the theme's static `nav_menu` widgets as the
 * fallback. Menu hrefs arrive root-shaped and are rebased per-request for
 * path hosts, mirroring the header's own link branching below.
 *
 * Heritage visual contract (Songoskriti): the one memorable element is the
 * wordmark lockup — a terracotta seal drawn inline next to the store name in
 * the theme's roman display face. Everything else stays quiet: borderless
 * action links, a terracotta pill only for the cart, and a menubar whose
 * hover is a single underline that grows from the left. Colours resolve
 * through the theme tokens (`--theme-accent`, `--theme-surface`,
 * `--theme-font-display`) with heritage fallbacks, so a merchant theme wins
 * whenever one is installed.
 */
/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
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
  const { t } = useLang();
  // Custom-domain-only cutover: on a custom host every header link stays in
  // root shape (logo -> "/"); on path hosts the legacy /store/<slug> shape.
  const { location } = useRouterState();
  const custom = isCustomHostPath(location.pathname);
  const base = custom ? "" : `/store/${slug}`;
  const headerMenu = menus?.header ?? [];
  const mobileMenu = menus ? selectMobileMenu(menus) : [];
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <style>{`
        .sh-wordmark {
          font-family: var(--theme-font-display, "Playfair Display", "Playfair Display Fallback", Georgia, "Noto Sans Bengali", serif);
          font-style: normal;
        }
        .sh-menu-link { position: relative; text-decoration: none; }
        .sh-menu-link::after {
          content: "";
          position: absolute;
          left: 0.75rem;
          right: 0.75rem;
          bottom: 0.3rem;
          height: 2px;
          border-radius: 999px;
          background: var(--theme-accent, #8A3B1F);
          transform: scaleX(0);
          transform-origin: left center;
          transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .sh-menu-link:hover::after,
        .sh-menu-link:focus-visible::after { transform: scaleX(1); }
        .sh-menu-link:hover { color: var(--theme-accent, #8A3B1F); }
        .sh-quiet:hover { color: var(--theme-accent, #8A3B1F); }
        @media (prefers-reduced-motion: reduce) {
          .sh-menu-link::after { transition: none; }
        }
      `}</style>
      {/* Masthead — asymmetric: brand lockup left, quiet actions right. The
          actions cluster wraps instead of squeezing the brand off a 320px
          viewport. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {custom ? (
          <Link
            to="/"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-fq-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:gap-2.5"
          >
            <WordmarkSeal className="size-7 shrink-0 sm:size-9" />
            <span className="min-w-0">
              <span className="sh-wordmark block truncate text-[19px] font-semibold leading-snug sm:text-[22px]">
                {name}
              </span>
              {tagline && (
                <span className="block truncate text-xs text-muted-foreground">
                  {tagline}
                </span>
              )}
            </span>
          </Link>
        ) : (
          <Link
            to="/store/$slug"
            params={{ slug }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-fq-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:gap-2.5"
          >
            <WordmarkSeal className="size-7 shrink-0 sm:size-9" />
            <span className="min-w-0">
              <span className="sh-wordmark block truncate text-[19px] font-semibold leading-snug sm:text-[22px]">
                {name}
              </span>
              {tagline && (
                <span className="block truncate text-xs text-muted-foreground">
                  {tagline}
                </span>
              )}
            </span>
          </Link>
        )}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-0.5 gap-y-1 sm:gap-x-1">
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
              className="sh-quiet inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap px-2 text-sm font-medium text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
            >
              {mobileOpen ? (
                <X className="size-4" aria-hidden />
              ) : (
                <MenuIcon className="size-4" aria-hidden />
              )}
              <span>{mobileOpen ? t("Close", "বন্ধ") : t("Menu", "মেনু")}</span>
            </button>
          )}
          {custom ? (
            <Link
              to="/search"
              search={{}}
              aria-label={t("Search", "খুঁজুন")}
              className="sh-quiet inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Search className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">
                {t("Search", "খুঁজুন")}
              </span>
            </Link>
          ) : (
            <Link
              to="/store/$slug/search"
              params={{ slug }}
              search={{}}
              aria-label={t("Search", "খুঁজুন")}
              className="sh-quiet inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Search className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">
                {t("Search", "খুঁজুন")}
              </span>
            </Link>
          )}
          {custom ? (
            <Link
              to="/account"
              aria-label={t("Your account", "আপনার অ্যাকাউন্ট")}
              className="sh-quiet inline-flex min-h-11 items-center px-2 text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <User className="size-4" aria-hidden />
            </Link>
          ) : (
            <Link
              to="/store/$slug/account"
              params={{ slug }}
              aria-label={t("Your account", "আপনার অ্যাকাউন্ট")}
              className="sh-quiet inline-flex min-h-11 items-center px-2 text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <User className="size-4" aria-hidden />
            </Link>
          )}
          <TimezoneToggle
            storeTimezone={storeTimezone}
            allowCustomerTimezone={allowCustomerTimezone}
          />
          <LanguageToggle />
          {custom ? (
            <Link
              to="/checkout"
              style={{
                backgroundColor: "var(--theme-accent, #8A3B1F)",
                color: "var(--theme-surface, #FAF8F5)",
              }}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ShoppingBag className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("Cart", "কার্ট")}</span>
              <span
                className="money rounded-full bg-white/25 px-2 py-0.5 text-xs tabular-nums"
                aria-live="polite"
              >
                {hydrated ? count : 0}
              </span>
            </Link>
          ) : (
            <Link
              to="/store/$slug/checkout"
              params={{ slug }}
              style={{
                backgroundColor: "var(--theme-accent, #8A3B1F)",
                color: "var(--theme-surface, #FAF8F5)",
              }}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ShoppingBag className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("Cart", "কার্ট")}</span>
              <span
                className="money rounded-full bg-white/25 px-2 py-0.5 text-xs tabular-nums"
                aria-live="polite"
              >
                {hydrated ? count : 0}
              </span>
            </Link>
          )}
        </div>
      </div>
      {headerMenu.length > 0 && (
        <nav
          aria-label={t("Store menu", "স্টোর মেনু")}
          className="hidden border-t border-border/70 md:block"
        >
          <ul className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 px-4">
            {headerMenu.slice(0, 12).map((node) => (
              <li key={node.id} className="group relative">
                <HeaderMenuLink
                  node={node}
                  base={base}
                  className="sh-menu-link inline-flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-medium tracking-[0.01em] text-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
                {node.children.length > 0 && (
                  <ul
                    style={{
                      borderTop:
                        "2px solid var(--theme-accent, #8A3B1F)",
                    }}
                    className="absolute left-0 top-full z-30 hidden min-w-60 rounded-b-fq-lg border border-t-0 border-border bg-card py-1 shadow-md group-hover:block group-focus-within:block"
                  >
                    {node.children.slice(0, 24).map((child) => (
                      <li key={child.id}>
                        <HeaderMenuLink
                          node={child}
                          base={base}
                          className="sh-quiet block px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
      {mobileOpen && mobileMenu.length > 0 && (
        <nav
          id="store-mobile-menu"
          aria-label={t("Store menu", "স্টোর মেনু")}
          className="border-t border-border/70 md:hidden"
        >
          <ul className="mx-auto max-w-6xl px-4 py-2">
            {mobileMenu.slice(0, 24).map((node) => (
              <li
                key={node.id}
                className="border-b border-border/60 last:border-0"
              >
                <HeaderMenuLink
                  node={node}
                  base={base}
                  onNavigate={() => setMobileOpen(false)}
                  className="sh-wordmark block min-h-11 whitespace-nowrap px-1 py-2.5 text-[17px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                />
                {node.children.length > 0 && (
                  <ul
                    style={{
                      borderColor: "var(--theme-accent, #8A3B1F)",
                    }}
                    className="mb-2 ml-1 border-l-2 pl-3"
                  >
                    {node.children.slice(0, 24).map((child) => (
                      <li key={child.id}>
                        <HeaderMenuLink
                          node={child}
                          base={base}
                          onNavigate={() => setMobileOpen(false)}
                          className="sh-quiet block min-h-10 whitespace-nowrap px-1 py-1.5 text-sm text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                        />
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

/**
 * The signature element: a terracotta seal — outer ring, kantha-diamond,
 * centre dot — drawn inline so it inherits the theme accent and never
 * renders as a generic bordered icon button.
 */
function WordmarkSeal({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      style={{ color: "var(--theme-accent, #8A3B1F)" }}
      className={className}
    >
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M16 8.5 23.5 16 16 23.5 8.5 16Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="2.1" fill="currentColor" />
    </svg>
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
