/**
 * Somvabona header presentation — theme-owned (HEADER OWNERSHIP lane).
 *
 * Claims the `somvabona × mega_menu` pair through
 * `registerThemePresentation` (first-wins, never throws) and renders
 * fully theme-owned nav markup: an everyday desktop menubar
 * (`SomvabonaDesktopNav` — compact absolute dropdown column, promo as a
 * thumb row, no mega panel) plus a disclosure mobile drawer
 * (`SomvabonaMobileDrawer` — native `details`/`summary` with a chevron,
 * no accordion state). Same canonical row model as every theme
 * (`CanonicalMenuItem` + `canonicalLabel` / `canonicalHref` /
 * `canonicalPromoTitle` from `@/lib/menus/menu`) — only this nav
 * structure differs.
 *
 * Items derive from the widget's live rows when the batch resolved any
 * (capped at the `limit` prop), else from the section's own trigger label
 * plus its widget-level promo props. Hrefs are pre-rebased through the
 * context `link` (host-aware), so the nav renders with an empty base.
 * The store-header shell below renders over the shared header contract
 * (type-only plus slot constants — never another theme's markup):
 * this module still names only its own key.
 */
import {
  canonicalHref,
  canonicalLabel,
  canonicalPromoTitle,
  type CanonicalMenuItem,
  type MenuNode,
} from "@/lib/menus/menu";
import { registerThemePresentation } from "@/lib/theme-presentations";
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
  type HeaderShellComponent,
  type HeaderShellProps,
} from "@/components/store/StoreHeader";
import {
  PluginMenuBoundary,
  selectPluginMenuRenderer,
} from "@/lib/plugin-menu-renderers";
import type { WidgetComponent } from "@/components/builder/widgets";

export type SomvabonaNavProps = {
  items: readonly CanonicalMenuItem[];
  base?: string;
  locale?: string;
  label?: string;
};

function SomvabonaLink({
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

function SomvabonaPromoRow({
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
      <div className="overflow-hidden rounded-sm bg-[var(--theme-muted)]">
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
      className="flex min-h-[44px] items-center gap-3 rounded-sm border border-[var(--theme-border)] bg-[var(--theme-muted)] p-2"
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

function SomvabonaDropChild({
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
      <SomvabonaLink
        item={item}
        base={base}
        locale={locale}
        className="block px-6 py-2.5 text-left font-sans text-[13px] text-[var(--theme-ink)]/70 transition-colors hover:bg-[var(--theme-muted)] hover:text-[var(--theme-ink)]"
      />
      {item.children && item.children.length > 0 && (
        <ul className="ml-6 space-y-0.5 border-l border-[var(--theme-border)] py-1 pl-2">
          {item.children.map((grandchild) => (
            <SomvabonaDropChild
              key={grandchild.id}
              item={grandchild}
              base={base}
              locale={locale}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Everyday desktop menubar — compact dropdown column over canonical items. */
export function SomvabonaDesktopNav({
  items,
  base = "",
  locale = "en",
  label,
}: SomvabonaNavProps) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={label ?? (locale === "bn" ? "মেনু" : "Menu")}
      data-nav="somvabona-desktop"
      className="w-full"
    >
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-1">
        {items.map((item) => (
          <li key={item.id} className="group relative">
            <SomvabonaLink
              item={item}
              base={base}
              locale={locale}
              className="inline-flex min-h-10 items-center py-2 text-[13px] font-semibold tracking-wide text-[var(--theme-ink)]/80 transition-colors hover:text-[var(--theme-ink)]"
            />
            {item.children && item.children.length > 0 && (
              <div
                data-drop="somvabona"
                className="absolute left-0 top-full z-50 hidden min-w-52 pt-1 group-hover:block group-focus-within:block"
              >
                <div className="space-y-2 rounded-sm border border-[var(--theme-border)] bg-[var(--theme-surface)] py-2 shadow-xl">
                  <ul>
                    {item.children.map((child) => (
                      <SomvabonaDropChild
                        key={child.id}
                        item={child}
                        base={base}
                        locale={locale}
                      />
                    ))}
                  </ul>
                  <div className="px-2">
                    <SomvabonaPromoRow
                      item={item}
                      base={base}
                      locale={locale}
                    />
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

function SomvabonaDisclosureSubtree({
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
    <ul className="ml-4 space-y-1 border-l border-[var(--theme-border)] py-2 pl-4">
      {nodes.map((node) => (
        <li key={node.id}>
          <SomvabonaLink
            item={node}
            base={base}
            locale={locale}
            onNavigate={onNavigate}
            className="block min-h-[44px] py-2.5 text-[15px] font-medium text-[var(--theme-ink)]/80"
          />
          {node.children && node.children.length > 0 && (
            <SomvabonaDisclosureSubtree
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
 * Everyday mobile drawer — native disclosure over canonical items.
 * Collapsed by default; `defaultExpandedId` pins one open panel (tests,
 * deep links) through the `open` attribute.
 */
export function SomvabonaMobileDrawer({
  items,
  base = "",
  locale = "en",
  label,
  defaultExpandedId = null,
  onNavigate,
}: SomvabonaNavProps & {
  defaultExpandedId?: string | null;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={label ?? (locale === "bn" ? "স্টোর মেনু" : "Store menu")}
      data-nav="somvabona-drawer"
    >
      <ul>
        {items.map((item) => {
          const kids = item.children ?? [];
          if (kids.length === 0) {
            return (
              <li
                key={item.id}
                className="border-b border-[var(--theme-border)]"
              >
                <SomvabonaLink
                  item={item}
                  base={base}
                  locale={locale}
                  onNavigate={onNavigate}
                  className="flex min-h-[44px] flex-1 items-center py-3 text-[15px] font-medium text-[var(--theme-ink)]"
                />
              </li>
            );
          }
          return (
            <li key={item.id} className="border-b border-[var(--theme-border)]">
              <details
                className="group/disclosure"
                {...(defaultExpandedId === item.id ? { open: true } : {})}
              >
                <summary
                  aria-label={`${canonicalLabel(item, locale)} submenu`}
                  className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 py-3 text-[15px] font-medium text-[var(--theme-ink)]"
                >
                  <SomvabonaLink
                    item={item}
                    base={base}
                    locale={locale}
                    onNavigate={onNavigate}
                    className="flex flex-1 items-center text-[15px] font-medium text-[var(--theme-ink)]"
                  />
                  <span
                    aria-hidden
                    className="shrink-0 text-[var(--theme-ink)]/60 transition-transform group-open/disclosure:rotate-180"
                  >
                    ▾
                  </span>
                </summary>
                <div className="pb-3">
                  <SomvabonaDisclosureSubtree
                    nodes={kids}
                    base={base}
                    locale={locale}
                    onNavigate={onNavigate}
                  />
                  {(item.image || item.promo) && (
                    <div className="ml-4 mt-2 pr-4">
                      <SomvabonaPromoRow
                        item={item}
                        base={base}
                        locale={locale}
                      />
                    </div>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function somvabonaHeaderItems(
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

export const SomvabonaHeaderPresentation: WidgetComponent = (ctx) => {
  const items = somvabonaHeaderItems(ctx);
  if (items.length === 0) return null;
  const label = ctx.str("label") || "Shop";
  return (
    <div
      data-header-presentation="somvabona"
      className="w-full bg-[var(--theme-surface)]"
    >
      <div className="mx-auto hidden max-w-[var(--fq-container,1280px)] px-4 sm:px-6 md:block">
        <SomvabonaDesktopNav
          items={items}
          base=""
          locale={ctx.locale}
          label={label}
        />
      </div>
      <div className="border-t border-[var(--theme-border)] md:hidden">
        <SomvabonaMobileDrawer
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
 * text-wordmark brand, compact dropdown desktop nav, icon controls with
 * the language switch, sticky shrink, and the disclosure mobile drawer.
 * Same menu rows and header state as every theme — only this markup
 * differs. Attached as a static on the registered `mega_menu`
 * presentation so StoreHeader resolves it through the existing
 * registry with the generic shell as fallback.
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

export function SomvabonaHeaderShell({
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
  const { base, headerMenu, mobileMenu } = data;
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
    <SomvabonaDesktopNav
      items={headerItems}
      base={base}
      locale={locale}
      label={navLabel}
    />
  );
  const drawerThemeNav = (
    <SomvabonaMobileDrawer
      items={drawerItems}
      base={base}
      locale={locale}
      label={navLabel}
      defaultExpandedId={expandedMobileMenu}
      onNavigate={() => setMobileOpen(false)}
    />
  );
  return (
    <header
      data-header-shell="somvabona"
      className={`sticky top-0 z-40 w-full transition-all duration-250 ease-out bg-[var(--theme-surface)] motion-reduce:transition-none ${
        scrolled ? "shadow-sm border-b border-[var(--theme-border)]" : ""
      }`}
    >
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
              <span className="font-bangla-display block truncate text-xl font-semibold tracking-tight text-[var(--theme-ink)]">
                {name}
              </span>
            </Link>
          ) : (
            <Link
              to="/store/$slug"
              params={{ slug }}
              className="flex items-center"
            >
              <span className="font-bangla-display block truncate text-xl font-semibold tracking-tight text-[var(--theme-ink)]">
                {name}
              </span>
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

(SomvabonaHeaderPresentation as unknown as HeaderShellCarrier).HeaderShell =
  SomvabonaHeaderShell;

type HeaderShellCarrier = WidgetComponent & {
  HeaderShell?: HeaderShellComponent;
};

registerThemePresentation(
  "somvabona",
  "mega_menu",
  SomvabonaHeaderPresentation,
);
