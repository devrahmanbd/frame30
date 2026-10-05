/**
 * Songoskriti header presentation — theme-owned (HEADER OWNERSHIP lane).
 *
 * Claims the `songoskriti × mega_menu` pair through
 * `registerThemePresentation` (first-wins, never throws) and renders
 * fully theme-owned nav markup: a luxury desktop mega panel
 * (`SongoskritiDesktopNav` — full-width fixed panel, 4-column grid,
 * editorial image aside) plus an accordion mobile drawer
 * (`SongoskritiMobileDrawer` — `+`/`−` buttons, bordered subtree).
 * Same canonical row model as every theme (`CanonicalMenuItem` +
 * `canonicalLabel` / `canonicalHref` / `canonicalPromoTitle` from
 * `@/lib/menus/menu`) — only this nav structure differs.
 *
 * Items derive from the widget's live rows when the batch resolved any
 * (capped at the `limit` prop), else from the section's own trigger label
 * plus its widget-level promo props. Hrefs are pre-rebased through the
 * context `link` (host-aware), so the nav renders with an empty base.
 * The store-header shell below renders over the shared header contract
 * (type-only plus slot constants — never another theme's markup):
 * this module still names only its own key.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Menu as MenuIcon,
  Search,
  ShoppingBag,
  User,
  X,
  Heart,
} from "@/components/icons/tabler";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  STORE_DRAWER_MENU_SLOT,
  STORE_HEADER_MENU_SLOT,
  HeaderAnnouncementBar,
  type HeaderShellComponent,
  type HeaderShellProps,
} from "@/components/store/StoreHeader";
import {
  PluginMenuBoundary,
  selectPluginMenuRenderer,
} from "@/lib/plugin-menu-renderers";
import {
  canonicalHref,
  canonicalLabel,
  canonicalPromoTitle,
  type CanonicalMenuItem,
  type MenuNode,
} from "@/lib/menus/menu";
import { registerThemePresentation } from "@/lib/theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";

export type SongoskritiNavProps = {
  items: readonly CanonicalMenuItem[];
  base?: string;
  locale?: string;
  label?: string;
};

function SongoskritiLink({
  item,
  base,
  locale,
  className,
  onNavigate,
}: {
  item: CanonicalMenuItem;
  base: string;
  locale: string;
  className?: string;
  onNavigate?: () => void;
}) {
  if (!item.label) return null;
  const newTab = item.metadata?.["target"] === "_blank";
  return (
    <a
      href={canonicalHref(item, base)}
      title={item.metadata?.["title"] || undefined}
      onClick={onNavigate}
      {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}
      className={className}
    >
      {canonicalLabel(item, locale)}
      {item.badge ? (
        <span className="ml-2 inline-flex min-h-5 items-center rounded-full bg-[var(--theme-muted)] px-2 text-[11px] font-semibold text-[var(--theme-ink)]">
          {item.badge}
        </span>
      ) : null}
    </a>
  );
}

function SongoskritiPromoTile({
  item,
  base,
  locale,
}: {
  item: CanonicalMenuItem;
  base: string;
  locale: string;
}) {
  if (item.image) {
    return (
      <div className="aspect-[3/4] w-full overflow-hidden bg-[var(--theme-muted)]">
        <img
          src={item.image}
          alt={canonicalLabel(item, locale)}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  const promo = item.promo;
  if (!promo) return null;
  return (
    <a
      href={canonicalHref(promo, base)}
      className="flex min-h-[44px] items-center gap-3"
    >
      <img
        src={promo.image}
        alt=""
        className="h-12 w-12 shrink-0 rounded-sm object-cover"
        loading="lazy"
      />
      <span className="text-sm font-semibold text-[var(--theme-ink)]">
        {canonicalPromoTitle(promo, locale)}
      </span>
    </a>
  );
}

function SongoskritiMegaChild({
  item,
  base,
  locale,
}: {
  item: CanonicalMenuItem;
  base: string;
  locale: string;
}) {
  return (
    <li>
      <SongoskritiLink
        item={item}
        base={base}
        locale={locale}
        className="flex min-h-[44px] items-center text-left font-serif text-[16px] font-normal text-[var(--theme-ink)] motion-safe:transition-colors hover:text-[var(--theme-ink)]/70"
      />
      {item.children && item.children.length > 0 && (
        <ul className="mt-4 space-y-3">
          {item.children.map((grandchild) => (
            <li key={grandchild.id}>
              <SongoskritiLink
                item={grandchild}
                base={base}
                locale={locale}
                className="flex min-h-[44px] items-center text-left font-sans text-[13px] text-[var(--theme-ink)]/60 motion-safe:transition-colors hover:text-[var(--theme-ink)]"
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Luxury desktop mega nav — full-width fixed panel over canonical items. */
export function SongoskritiDesktopNav({
  items,
  base = "",
  locale = "en",
  label,
}: SongoskritiNavProps) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={label ?? (locale === "bn" ? "মেনু" : "Menu")}
      data-nav="songoskriti-desktop"
      className="w-full"
    >
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 lg:gap-x-9">
        {items.map((item) => (
          <li
            key={item.id}
            className="group relative flex h-full items-center"
          >
            <SongoskritiLink
              item={item}
              base={base}
              locale={locale}
              className="inline-flex items-center py-[24px] text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]/80 transition-colors hover:text-[var(--theme-ink)]"
            />
            {item.children && item.children.length > 0 && (
              <div
                data-mega="songoskriti"
                className="fixed left-0 top-full z-50 hidden w-full pt-0 group-hover:block group-focus-within:block"
              >
                <div className="max-h-[85vh] w-full overflow-y-auto border-t border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-xl">
                  <div className="mx-auto flex max-w-[1440px] gap-16 px-10 py-12">
                    <ul className="grid flex-1 grid-cols-4 gap-x-8 gap-y-10">
                      {item.children.map((child) => (
                        <SongoskritiMegaChild
                          key={child.id}
                          item={child}
                          base={base}
                          locale={locale}
                        />
                      ))}
                    </ul>
                    {(item.image || item.promo) && (
                      <div className="w-[320px] shrink-0">
                        <SongoskritiPromoTile
                          item={item}
                          base={base}
                          locale={locale}
                        />
                        <div className="mt-4 flex min-h-[44px] items-center gap-2">
                          <span className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)]">
                            {locale === "bn" ? "কেনাকাটা" : "Shop"}{" "}
                            {canonicalLabel(item, locale)}
                          </span>
                          <span className="text-xs text-[var(--theme-ink)]">
                            →
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SongoskritiDrawerSubtree({
  nodes,
  base,
  locale,
  onNavigate,
}: {
  nodes: readonly CanonicalMenuItem[];
  base: string;
  locale: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="my-2 ml-4 space-y-1 border-l border-[var(--theme-border)] py-2 pl-4">
      {nodes.map((node) => (
        <li key={node.id}>
          <SongoskritiLink
            item={node}
            base={base}
            locale={locale}
            onNavigate={onNavigate}
            className="block min-h-[44px] py-2.5 text-[15px] font-medium text-[var(--theme-ink)]/80"
          />
          {node.children && node.children.length > 0 && (
            <SongoskritiDrawerSubtree
              nodes={node.children}
              base={base}
              locale={locale}
              onNavigate={onNavigate}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Luxury mobile drawer — accordion over canonical items. Collapsed by
 * default; `defaultExpandedId` pins one open panel (tests, deep links).
 */
export function SongoskritiMobileDrawer({
  items,
  base = "",
  locale = "en",
  label,
  defaultExpandedId = null,
  onNavigate,
}: SongoskritiNavProps & {
  defaultExpandedId?: string | null;
  onNavigate?: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(defaultExpandedId);
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={label ?? (locale === "bn" ? "স্টোর মেনু" : "Store menu")}
      data-nav="songoskriti-drawer"
    >
      <ul>
        {items.map((item) => {
          const kids = item.children ?? [];
          const open = expanded === item.id;
          return (
            <li
              key={item.id}
              className="border-b border-[var(--theme-border)]"
            >
              <div className="flex w-full items-center justify-between">
                <SongoskritiLink
                  item={item}
                  base={base}
                  locale={locale}
                  onNavigate={onNavigate}
                  className="block flex-1 py-5 text-[13px] font-semibold uppercase tracking-wide text-[var(--theme-ink)]"
                />
                {kids.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : item.id)}
                    className="min-h-[44px] min-w-[44px] p-4 text-[var(--theme-ink)]"
                    aria-expanded={open}
                    aria-label={`${canonicalLabel(item, locale)} submenu`}
                  >
                    <span className="text-xl leading-none">
                      {open ? "−" : "+"}
                    </span>
                  </button>
                )}
              </div>
              {open && kids.length > 0 && (
                <div className="pb-4">
                  <SongoskritiDrawerSubtree
                    nodes={kids}
                    base={base}
                    locale={locale}
                    onNavigate={onNavigate}
                  />
                  {(item.image || item.promo) && (
                    <div className="ml-4 mt-2 pr-4">
                      <SongoskritiPromoTile
                        item={item}
                        base={base}
                        locale={locale}
                      />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function songoskritiHeaderItems(
  ctx: Parameters<WidgetComponent>[0],
): CanonicalMenuItem[] {
  const rows = ctx.data?.rows ?? [];
  const limit = ctx.int("limit", 8, 1, 24);
  if (rows.length > 0) {
    return rows.slice(0, limit).map((row) => ({
      id: row.id,
      label: row.title,
      href: ctx.link(row.href ?? "#"),
      image: row.imageUrl ?? null,
    }));
  }
  const label = ctx.str("label") || "Shop";
  const promoImage = ctx.str("promoImage");
  const promoHref = ctx.str("promoHref") || "#";
  const promoTitle = ctx.str("promoTitle") || label;
  return [
    {
      id: ctx.section.id,
      label,
      href: "#",
      promo: promoImage
        ? { image: promoImage, href: ctx.link(promoHref), title: promoTitle }
        : null,
    },
  ];
}

export const SongoskritiHeaderPresentation: WidgetComponent = (ctx) => {
  const items = songoskritiHeaderItems(ctx);
  if (items.length === 0) return null;
  const label = ctx.str("label") || "Shop";
  return (
    <div
      data-header-presentation="songoskriti"
      className="w-full border-b border-[var(--theme-border)] bg-[var(--theme-surface)]"
    >
      <div className="mx-auto hidden max-w-[var(--fq-container,1440px)] items-center justify-center px-4 md:block">
        <SongoskritiDesktopNav
          items={items}
          base=""
          locale={ctx.locale}
          label={label}
        />
      </div>
      <div className="md:hidden">
        <SongoskritiMobileDrawer
          items={items}
          base=""
          locale={ctx.locale}
          label={label}
        />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
 * Store header shell (R1 header theme presentation runtime).
 *
 * Theme-owned full-header renderer over the shared header contract
 * (`HeaderData` + `HeaderBehavior` + control counts from StoreHeader):
 * luxury announcement bar with the language switch, logo-lockup brand,
 * mega desktop nav, icon controls, sticky shrink, and the accordion
 * mobile drawer. Same menu rows and header state as every theme — only
 * this markup differs. Attached as a static on the registered
 * `mega_menu` presentation so StoreHeader resolves it through the
 * existing registry with the generic shell as fallback.
 *
 * Menu rows arrive as dashboard/theme `MenuNode`s (fallback nodes are
 * partial — no dashboard metadata), so the adapter below builds the
 * canonical items defensively and twin-resolves fallback labels through
 * the header chrome labeler. Swap wiring mirrors the shared boundary
 * exactly (resolution itself stays in StoreHeader): a `plugin` verdict
 * with a registered renderer owns the slot, fail-open to this markup.
 * ───────────────────────────────────────────────────────────── */

function toShellItems(
  nodes: readonly MenuNode[],
  localize: ((label: string) => string) | null,
): CanonicalMenuItem[] {
  return nodes.map((node) => {
    const extra = node as unknown as Record<string, unknown>;
    const rawKids = Array.isArray(node.children) ? node.children : [];
    const metadata: Record<string, string> = {};
    if (typeof node.titleAttr === "string" && node.titleAttr.trim()) {
      metadata["title"] = node.titleAttr.trim();
    }
    if (node.newTab) metadata["target"] = "_blank";
    if (typeof node.cssClass === "string" && node.cssClass.trim()) {
      metadata["class"] = node.cssClass.trim();
    }
    const carried = extra["metadata"];
    if (carried && typeof carried === "object" && !Array.isArray(carried)) {
      for (const [key, value] of Object.entries(
        carried as Record<string, unknown>,
      )) {
        if (typeof value === "string") metadata[key] = value;
      }
    }
    const label = typeof node.label === "string" ? node.label : "";
    const href = typeof node.url === "string" && node.url ? node.url : "#";
    const badgeRaw = extra["badge"];
    const imageRaw = extra["image"];
    return {
      id: node.id,
      label: localize ? localize(label) : label,
      href,
      children: toShellItems(rawKids as MenuNode[], localize),
      badge:
        typeof badgeRaw === "string" && badgeRaw.trim() ? badgeRaw : null,
      metadata,
      image:
        typeof imageRaw === "string" && imageRaw ? imageRaw : null,
      promo: null,
    };
  });
}

const shellIconLinkCls =
  "grid size-10 shrink-0 place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 text-[var(--theme-ink)]/70 hover:text-[var(--theme-ink)]";

export function SongoskritiHeaderShell({
  slug,
  name,
  custom,
  data,
  behavior,
  wishlistCount,
  cartCount,
  cartHydrated,
  locale,
  t,
}: HeaderShellProps) {
  const { base, headerMenu, mobileMenu, headerChrome } = data;
  const { mobileOpen, setMobileOpen, scrolled, expandedMobileMenu } = behavior;
  const navLabel = t("Store menu", "স্টোর মেনু");
  const headerItems = toShellItems(
    headerMenu,
    data.headerFallback ? data.fallbackLabel : null,
  );
  const drawerItems = toShellItems(
    mobileMenu,
    data.mobileFallback ? data.fallbackLabel : null,
  );
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
  const desktopThemeNav = (
    <SongoskritiDesktopNav
      items={headerItems}
      base={base}
      locale={locale}
      label={navLabel}
    />
  );
  const drawerThemeNav = (
    <SongoskritiMobileDrawer
      items={drawerItems}
      base={base}
      locale={locale}
      label={navLabel}
      defaultExpandedId={expandedMobileMenu}
      onNavigate={() => setMobileOpen(false)}
    />
  );
  const brandMark = headerChrome ? (
    <img
      src={headerChrome.logo.src}
      alt={headerChrome.logo.alt}
      className="h-[34px] w-auto object-contain transition-all duration-300"
    />
  ) : (
    <span className="font-bangla-display block truncate text-xl font-semibold tracking-tight text-[var(--theme-ink)]">
      {name}
    </span>
  );
  return (
    <header
      data-header-shell="songoskriti"
      className={`sticky top-0 z-40 w-full transition-all duration-250 ease-out bg-[var(--theme-surface)] motion-reduce:transition-none ${
        scrolled ? "shadow-sm border-b border-[var(--theme-border)]" : ""
      }`}
    >
      {/* ── Announcement slot (R1b): active theme's announcement presentation
          via the registry; the shared bar is the generic fallback. The
          language switch lives in the icon controls below (everyday parity),
          so this slot owns announcement chrome only. ── */}
      <HeaderAnnouncementBar
        themeKey="songoskriti"
        headerChrome={headerChrome}
        scrolled={scrolled}
        locale={locale}
        slug={slug}
        t={t}
      />

      <div
        className={`relative mx-auto flex transition-all duration-250 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10 ${scrolled ? "h-[64px]" : "h-[72px]"}`}
      >
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
              className={`${shellIconLinkCls} md:hidden -ml-2`}
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
              {brandMark}
            </Link>
          ) : (
            <Link
              to="/store/$slug"
              params={{ slug }}
              className="flex items-center"
            >
              {brandMark}
            </Link>
          )}
        </div>

        <div className="hidden md:flex flex-1 min-w-0 justify-center pointer-events-auto">
          {HeaderPluginNav && headerPluginId ? (
            <PluginMenuBoundary
              pluginId={headerPluginId}
              slot={STORE_HEADER_MENU_SLOT}
              fallback={desktopThemeNav}
              onError={data.menuOnError}
            >
              <HeaderPluginNav
                rows={headerMenu}
                slot={STORE_HEADER_MENU_SLOT}
                pluginId={headerPluginId}
              />
            </PluginMenuBoundary>
          ) : (
            desktopThemeNav
          )}
        </div>

        <div className="flex items-center justify-end gap-1 shrink-0">
          {custom ? (
            <Link
              to="/search"
              search={{}}
              aria-label={t("Search", "খুঁজুন")}
              className={shellIconLinkCls}
            >
              <Search className="size-[20px]" strokeWidth={1} aria-hidden />
            </Link>
          ) : (
            <Link
              to="/store/$slug/search"
              params={{ slug }}
              search={{}}
              aria-label={t("Search", "খুঁজুন")}
              className={shellIconLinkCls}
            >
              <Search className="size-[20px]" strokeWidth={1} aria-hidden />
            </Link>
          )}

          {custom ? (
            <Link
              to="/account"
              aria-label={t("Your account", "আপনার অ্যাকাউন্ট")}
              className={`${shellIconLinkCls} hidden sm:grid`}
            >
              <User className="size-[20px]" strokeWidth={1} aria-hidden />
            </Link>
          ) : (
            <Link
              to="/store/$slug/account"
              params={{ slug }}
              aria-label={t("Your account", "আপনার অ্যাকাউন্ট")}
              className={`${shellIconLinkCls} hidden sm:grid`}
            >
              <User className="size-[20px]" strokeWidth={1} aria-hidden />
            </Link>
          )}

          {custom ? (
            <Link
              to="/account"
              search={{ tab: "wishlist" }}
              aria-label={`${t("Wishlist", "উইশলিস্ট")}, ${wishlistCount}`}
              className={`${shellIconLinkCls} relative hidden sm:grid`}
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
              className={`${shellIconLinkCls} relative hidden sm:grid`}
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

          <LanguageToggle />

          {custom ? (
            <Link
              to="/cart"
              aria-label={`${t("Cart", "কার্ট")}, ${cartHydrated ? cartCount : 0}`}
              className={`${shellIconLinkCls} relative`}
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
              aria-label={`${t("Cart", "কার্ট")}, ${cartHydrated ? cartCount : 0}`}
              className={`${shellIconLinkCls} relative`}
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
      </div>

      {mobileOpen && mobileMenu.length > 0 && (
        <div
          id="store-mobile-menu"
          className="border-t border-[var(--theme-border)] bg-[var(--theme-surface)] md:hidden overflow-y-auto max-h-[calc(100vh-[64px])] fixed left-0 w-full z-40 bottom-0"
          style={{ top: scrolled ? "64px" : "108px" }}
        >
          <div className="px-4 py-2 pb-24">
            {DrawerPluginNav && drawerPluginId ? (
              <PluginMenuBoundary
                pluginId={drawerPluginId}
                slot={STORE_DRAWER_MENU_SLOT}
                fallback={drawerThemeNav}
                onError={data.menuOnError}
              >
                <DrawerPluginNav
                  rows={mobileMenu}
                  slot={STORE_DRAWER_MENU_SLOT}
                  pluginId={drawerPluginId}
                />
              </PluginMenuBoundary>
            ) : (
              drawerThemeNav
            )}
          </div>
        </div>
      )}
    </header>
  );
}

(SongoskritiHeaderPresentation as unknown as HeaderShellCarrier).HeaderShell =
  SongoskritiHeaderShell;

type HeaderShellCarrier = WidgetComponent & {
  HeaderShell?: HeaderShellComponent;
};

registerThemePresentation(
  "songoskriti",
  "mega_menu",
  SongoskritiHeaderPresentation,
);
