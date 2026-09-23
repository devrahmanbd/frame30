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
 */
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
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {custom ? (
          <Link to="/" className="min-w-0">
            <span className="font-bangla-display block truncate text-lg font-semibold">
              {name}
            </span>
            {tagline && (
              <span className="block truncate text-xs text-muted-foreground">
                {tagline}
              </span>
            )}
          </Link>
        ) : (
          <Link to="/store/$slug" params={{ slug }} className="min-w-0">
            <span className="font-bangla-display block truncate text-lg font-semibold">
              {name}
            </span>
            {tagline && (
              <span className="block truncate text-xs text-muted-foreground">
                {tagline}
              </span>
            )}
          </Link>
        )}
        <div className="flex items-center gap-2">
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
              className="inline-flex min-h-11 items-center rounded-fq-md border border-border px-3 md:hidden"
            >
              {mobileOpen ? (
                <X className="size-4" aria-hidden />
              ) : (
                <MenuIcon className="size-4" aria-hidden />
              )}
            </button>
          )}
          {custom ? (
            <Link
              to="/search"
              search={{}}
              className="inline-flex min-h-11 items-center gap-2 rounded-fq-md border border-border px-3 text-sm"
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
              className="inline-flex min-h-11 items-center gap-2 rounded-fq-md border border-border px-3 text-sm"
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
              className="inline-flex min-h-11 items-center rounded-fq-md border border-border px-3"
            >
              <User className="size-4" aria-hidden />
            </Link>
          ) : (
            <Link
              to="/store/$slug/account"
              params={{ slug }}
              aria-label={t("Your account", "আপনার অ্যাকাউন্ট")}
              className="inline-flex min-h-11 items-center rounded-fq-md border border-border px-3"
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
              className="inline-flex min-h-11 items-center gap-2 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <ShoppingBag className="size-4" aria-hidden />
              <span>{t("Cart", "কার্ট")}</span>
              <span
                className="money rounded-full bg-primary-foreground/20 px-2 text-xs"
                aria-live="polite"
              >
                {hydrated ? count : 0}
              </span>
            </Link>
          ) : (
            <Link
              to="/store/$slug/checkout"
              params={{ slug }}
              className="inline-flex min-h-11 items-center gap-2 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <ShoppingBag className="size-4" aria-hidden />
              <span>{t("Cart", "কার্ট")}</span>
              <span
                className="money rounded-full bg-primary-foreground/20 px-2 text-xs"
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
          className="hidden border-t border-border md:block"
        >
          <ul className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 px-4">
            {headerMenu.slice(0, 12).map((node) => (
              <li key={node.id} className="group relative">
                <HeaderMenuLink
                  node={node}
                  base={base}
                  className="inline-flex min-h-11 items-center px-3 text-sm hover:text-primary hover:underline"
                />
                {node.children.length > 0 && (
                  <ul className="absolute left-0 top-full z-30 mt-1 hidden min-w-[12rem] rounded-fq-lg border border-border bg-card py-1 shadow-md group-hover:block group-focus-within:block">
                    {node.children.slice(0, 24).map((child) => (
                      <li key={child.id}>
                        <HeaderMenuLink
                          node={child}
                          base={base}
                          className="block px-3 py-1.5 text-sm hover:bg-muted hover:text-primary"
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
          className="border-t border-border md:hidden"
        >
          <ul className="mx-auto max-w-6xl space-y-0.5 px-4 py-3">
            {mobileMenu.slice(0, 24).map((node) => (
              <li key={node.id}>
                <HeaderMenuLink
                  node={node}
                  base={base}
                  onNavigate={() => setMobileOpen(false)}
                  className="block min-h-11 rounded-fq-md px-3 py-2 text-sm font-medium hover:bg-muted"
                />
                {node.children.length > 0 && (
                  <ul className="ml-4 border-l border-border pl-2">
                    {node.children.slice(0, 24).map((child) => (
                      <li key={child.id}>
                        <HeaderMenuLink
                          node={child}
                          base={base}
                          onNavigate={() => setMobileOpen(false)}
                          className="block min-h-10 rounded-fq-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-primary"
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
