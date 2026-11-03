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
import { Link, useRouterState } from "@tanstack/react-router";
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
  activeClassName,
  onNavigate,
}: {
  item: CanonicalMenuItem;
  base: string;
  locale: string;
  className?: string;
  activeClassName?: string;
  onNavigate?: () => void;
}) {
  if (!item.label) return null;
  const href = canonicalHref(item, base);
  const newTab = item.metadata?.["target"] === "_blank";

  let currentPath = "";
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    currentPath = useRouterState().location.pathname;
  } catch {
    currentPath = "";
  }

  const isActive = Boolean(
    currentPath &&
      href !== "#" &&
      (currentPath === href ||
        (href !== "/" &&
          href !== `/store/${base}` &&
          currentPath.startsWith(`${href}/`))),
  );

  const appliedClass = `${className ?? ""} ${isActive && activeClassName ? activeClassName : ""}`.trim();

  const isExternal =
    href.startsWith("http") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href === "#" ||
    newTab;

  const content = (
    <>
      {canonicalLabel(item, locale)}
      {item.badge ? (
        <span className="ml-2 inline-flex min-h-5 items-center rounded-full bg-[var(--theme-muted)] px-2 text-[11px] font-semibold text-[var(--theme-ink)]">
          {item.badge}
        </span>
      ) : null}
    </>
  );

  return (
    <a
      href={href}
      title={item.metadata?.["title"] || undefined}
      onClick={onNavigate}
      {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}
      className={appliedClass}
    >
      {content}
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
  const imgSrc = item.image || item.promo?.image;
  const promoTitle = item.promo
    ? canonicalPromoTitle(item.promo, locale)
    : canonicalLabel(item, locale);
  const href = item.promo
    ? canonicalHref(item.promo, base)
    : canonicalHref(item, base);

  if (!imgSrc && !item.promo) return null;

  return (
    <div className="group/lookbook relative flex flex-col overflow-hidden rounded-xs border border-[var(--theme-border)]/80 bg-[var(--theme-surface)] p-3.5 shadow-sm transition-all duration-300 hover:shadow-md">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[var(--theme-muted)]">
        {imgSrc && (
          <img
            src={imgSrc}
            alt={promoTitle}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover/lookbook:scale-105"
            loading="lazy"
          />
        )}
        <div className="absolute top-2.5 left-2.5 z-10">
          <span className="inline-flex items-center rounded-xs bg-[var(--theme-ink)]/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-surface)] backdrop-blur-xs">
            {locale === "bn" ? "বিশেষ কালেকশন" : "Featured Collection"}
          </span>
        </div>
      </div>
      <div className="mt-3.5 flex flex-col">
        <span className="font-serif text-[15px] font-medium text-[var(--theme-ink)]">
          {promoTitle}
        </span>
        <a
          href={href}
          className="mt-2.5 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-accent,#C05A3E)] hover:text-[var(--theme-ink)] transition-colors min-h-[44px]"
        >
          <span>
            {locale === "bn" ? "কেনাকাটা" : "Shop"} {canonicalLabel(item, locale)}
          </span>
          <span className="transition-transform duration-200 group-hover/lookbook:translate-x-1">
            →
          </span>
        </a>
      </div>
    </div>
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
      <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-[var(--theme-border)]/60">
        <span className="h-1 w-1 rounded-full bg-[var(--theme-accent,#C05A3E)] shrink-0" />
        <SongoskritiLink
          item={item}
          base={base}
          locale={locale}
          activeClassName="text-[var(--theme-accent,#C05A3E)] font-semibold"
          className="flex min-h-[40px] items-center text-left font-serif text-[15px] font-medium tracking-wide text-[var(--theme-ink)] motion-safe:transition-colors hover:text-[var(--theme-accent,#C05A3E)]"
        />
      </div>
      {item.children && item.children.length > 0 && (
        <ul className="space-y-1">
          {item.children.map((grandchild) => (
            <li key={grandchild.id}>
              <SongoskritiLink
                item={grandchild}
                base={base}
                locale={locale}
                activeClassName="text-[var(--theme-accent,#C05A3E)] font-semibold"
                className="group/link flex min-h-[38px] items-center text-left font-sans text-[13px] text-[var(--theme-ink)]/70 motion-safe:transition-all hover:text-[var(--theme-ink)] hover:translate-x-1"
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
}: SongoskritiNavProps & { scrolled?: boolean }) {
  if (items.length === 0) return null;

  let currentPath = "";
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    currentPath = useRouterState().location.pathname;
  } catch {
    currentPath = "";
  }

  return (
    <nav
      aria-label={label ?? (locale === "bn" ? "মেনু" : "Menu")}
      data-nav="songoskriti-desktop"
      className="w-full"
    >
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 lg:gap-x-9">
        {items.map((item) => {
          const itemHref = canonicalHref(item, base);
          const isItemActive = Boolean(
            currentPath &&
              itemHref !== "#" &&
              (currentPath === itemHref ||
                (itemHref !== "/" &&
                  itemHref !== `/store/${base}` &&
                  currentPath.startsWith(`${itemHref}/`)) ||
                item.children?.some((c) => {
                  const cHref = canonicalHref(c, base);
                  return (
                    cHref !== "#" &&
                    (currentPath === cHref ||
                      c.children?.some(
                        (gc) => canonicalHref(gc, base) === currentPath,
                      ))
                  );
                })),
          );

          return (
            <li key={item.id} className="group flex h-full items-center">
              <SongoskritiLink
                item={item}
                base={base}
                locale={locale}
                className={`relative inline-flex items-center py-[24px] text-[11px] font-medium uppercase tracking-[0.2em] transition-colors ${
                  isItemActive
                    ? "text-[var(--theme-ink)] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--theme-accent,#C05A3E)]"
                    : "text-[var(--theme-ink)]/80 hover:text-[var(--theme-ink)]"
                }`}
              />
              {item.children && item.children.length > 0 && (
                <div
                  data-mega="songoskriti"
                  className="absolute left-0 top-full z-50 hidden w-full pt-0 group-hover:block group-focus-within:block pointer-events-auto before:absolute before:-top-4 before:left-0 before:right-0 before:h-4 before:content-['']"
                >
                  <div className="max-h-[85vh] w-full overflow-y-auto border-t border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl">
                    {/* Top Editorial Archive Ribbon */}
                    <div className="border-b border-[var(--theme-border)]/60 bg-[var(--theme-surface)]/90 backdrop-blur-xs px-10 py-2.5">
                      <div className="mx-auto flex max-w-[1440px] items-center justify-between text-[10px] font-medium tracking-[0.22em] uppercase text-[var(--theme-ink)]/75">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-accent,#C05A3E)] animate-pulse" />
                          <span>
                            {locale === "bn"
                              ? "ফ্লেম ফ্যাশন বিডি · হ্যান্ডলুম ও উৎসবের সংগ্রহ"
                              : "Flame Fashion BD · Handloom & Festive Collections"}
                          </span>
                        </div>
                        <div className="hidden sm:flex items-center gap-3 text-[var(--theme-ink)]/60">
                          <span>
                            {locale === "bn"
                              ? "৳৫,০০০ এর বেশি অর্ডারে সারাদেশে ফ্রি ডেলিভারি"
                              : "Free delivery across Bangladesh on orders over ৳5,000"}
                          </span>
                          <span className="text-[var(--theme-accent,#C05A3E)]">✦</span>
                          <span>
                            {locale === "bn"
                              ? "আসল হ্যান্ডলুম"
                              : "Authentic Handloom"}
                          </span>
                        </div>
                      </div>
                    </div>

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
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
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
            activeClassName="text-[var(--theme-accent,#C05A3E)] font-semibold"
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
  let currentPath = "";
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    currentPath = useRouterState().location.pathname;
  } catch {
    currentPath = "";
  }

  let initialExpanded = defaultExpandedId;
  if (!initialExpanded && currentPath) {
    const activeParent = items.find((item) =>
      item.children?.some((c) => {
        const cHref = canonicalHref(c, base);
        return (
          cHref !== "#" &&
          (currentPath === cHref ||
            c.children?.some((gc) => canonicalHref(gc, base) === currentPath))
        );
      }),
    );
    if (activeParent) initialExpanded = activeParent.id;
  }

  const [expanded, setExpanded] = useState<string | null>(initialExpanded);
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={label ?? (locale === "bn" ? "স্টোর মেনু" : "Store menu")}
      data-nav="songoskriti-drawer"
      className="flex flex-col"
    >
      {/* Drawer Top Metadata */}
      <div className="mb-3 pb-3 border-b border-[var(--theme-border)]/70 flex items-center justify-between text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--theme-ink)]/75">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-accent,#C05A3E)] animate-pulse" />
          <span>
            {locale === "bn"
              ? "ফ্লেম ফ্যাশন বিডি · কালেকশন"
              : "Flame Fashion BD · Collections"}
          </span>
        </div>
        <span className="text-[var(--theme-accent,#C05A3E)]">✦</span>
      </div>

      <ul>
        {items.map((item) => {
          const kids = item.children ?? [];
          const open = expanded === item.id;
          return (
            <li key={item.id} className="border-b border-[var(--theme-border)]">
              <div className="flex w-full items-center justify-between">
                <SongoskritiLink
                  item={item}
                  base={base}
                  locale={locale}
                  onNavigate={onNavigate}
                  activeClassName="text-[var(--theme-accent,#C05A3E)] font-semibold"
                  className="block flex-1 py-5 text-[13px] font-semibold uppercase tracking-wider text-[var(--theme-ink)]"
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

      {/* Drawer Footer */}
      <div className="mt-8 pt-6 border-t border-[var(--theme-border)] space-y-4 text-[12px] text-[var(--theme-ink)]/70">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-ink)]/50 mb-1">
            {locale === "bn" ? "ফ্ল্যাগশিপ আউটলেট" : "Flagship Stores"}
          </p>
          <p className="font-serif text-[13px] text-[var(--theme-ink)]">
            {locale === "bn"
              ? "উত্তরা ৩ · গুলশান ২ · চট্টগ্রাম জিইসি"
              : "Uttara Sector 3 · Gulshan 2 · Chittagong GEC"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-ink)]/50 mb-1">
            {locale === "bn" ? "কাস্টমার সার্ভিস" : "Customer Support"}
          </p>
          <a
            href="tel:+8801711000000"
            className="inline-flex items-center gap-1.5 text-[var(--theme-accent,#C05A3E)] font-medium"
          >
            <span>+880 1711-000000</span>
            <span className="text-[10px] text-[var(--theme-ink)]/50">
              (10am–8pm)
            </span>
          </a>
        </div>
      </div>
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
      badge: typeof badgeRaw === "string" && badgeRaw.trim() ? badgeRaw : null,
      metadata,
      image: typeof imageRaw === "string" && imageRaw ? imageRaw : null,
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
      scrolled={scrolled}
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
        className={`mx-auto flex transition-all duration-250 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10 ${scrolled ? "h-[64px]" : "h-[72px]"}`}
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
