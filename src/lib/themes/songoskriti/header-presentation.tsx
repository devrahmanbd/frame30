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
import { useState, useRef, useEffect } from "react";
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
    <li className="min-w-0">
      <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-[var(--theme-border)]/60 min-w-0">
        <span className="h-1 w-1 rounded-full bg-[var(--theme-accent,#C05A3E)] shrink-0" />
        <SongoskritiLink
          item={item}
          base={base}
          locale={locale}
          activeClassName="text-[var(--theme-accent,#C05A3E)] font-semibold"
          className="flex min-h-[40px] items-center text-left font-serif text-[15px] font-medium tracking-wide text-[var(--theme-ink)] motion-safe:transition-colors hover:text-[var(--theme-accent,#C05A3E)] break-words whitespace-normal leading-snug"
        />
      </div>
      {item.children && item.children.length > 0 && (
        <ul className="space-y-1">
          {item.children.map((grandchild) => (
            <li key={grandchild.id} className="min-w-0">
              <SongoskritiLink
                item={grandchild}
                base={base}
                locale={locale}
                activeClassName="text-[var(--theme-accent,#C05A3E)] font-semibold"
                className="group/link flex min-h-[38px] items-center text-left font-sans text-[13px] text-[var(--theme-ink)]/70 motion-safe:transition-all hover:text-[var(--theme-ink)] hover:translate-x-1 break-words whitespace-normal leading-snug"
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
      className="w-full flex justify-center"
    >
      <ul className="flex flex-nowrap whitespace-nowrap items-center justify-center gap-x-6 xl:gap-x-8">
        {items.map((item) => {
          const itemHref = canonicalHref(item, base);
          const hasChildren = Boolean(item.children && item.children.length > 0);
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
            <li
              key={item.id}
              className="group flex h-full items-center shrink-0"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  const trigger = e.currentTarget.querySelector<HTMLAnchorElement>(":scope > a");
                  (document.activeElement as HTMLElement)?.blur?.();
                  trigger?.focus();
                }
              }}
            >
              <SongoskritiLink
                item={item}
                base={base}
                locale={locale}
                aria-haspopup={hasChildren ? "true" : undefined}
                className={`relative inline-flex items-center py-[24px] text-[11px] font-medium uppercase tracking-[0.2em] transition-colors whitespace-nowrap shrink-0 ${
                  isItemActive
                    ? "text-[var(--theme-ink)] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--theme-accent,#C05A3E)]"
                    : "text-[var(--theme-ink)]/80 hover:text-[var(--theme-ink)]"
                }`}
              />
              {hasChildren && (
                <div
                  data-mega="songoskriti"
                  role="region"
                  aria-label={`${canonicalLabel(item, locale)} submenu`}
                  className="absolute left-0 top-full z-50 hidden w-full pt-0 group-hover:block group-focus-within:block pointer-events-auto before:absolute before:-top-4 before:left-0 before:right-0 before:h-4 before:content-['']"
                >
                  <div className="max-h-[85vh] w-full overflow-y-auto border-t border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl">
                    <div className="mx-auto flex flex-col xl:flex-row max-w-[1440px] gap-8 xl:gap-12 2xl:gap-16 px-6 lg:px-10 py-10 lg:py-12">
                      <ul className="grid flex-1 min-w-0 grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-x-8 gap-y-10">
                        {item.children!.map((child) => (
                          <SongoskritiMegaChild
                            key={child.id}
                            item={child}
                            base={base}
                            locale={locale}
                          />
                        ))}
                      </ul>

                      {(item.image || item.promo) && (
                        <div className="w-full max-w-[320px] mx-auto xl:mx-0 xl:w-[280px] 2xl:w-[320px] shrink-0">
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
  supportEmail,
  supportHours,
  policyDelivery,
  custom = false,
  slug,
  wishlistCount = 0,
}: SongoskritiNavProps & {
  defaultExpandedId?: string | null;
  onNavigate?: () => void;
  supportEmail?: string | null;
  supportHours?: string | null;
  policyDelivery?: string | null;
  custom?: boolean;
  slug?: string;
  wishlistCount?: number;
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
      {/* Mobile Drawer Account & Wishlist Quick Access */}
      <div className="grid grid-cols-2 gap-3 pb-4 mb-2 border-b border-[var(--theme-border)]">
        {custom ? (
          <Link
            to="/account"
            onClick={onNavigate}
            className="flex items-center gap-2.5 px-3 py-2.5 border border-[var(--theme-border)] text-[var(--theme-ink)] hover:border-[var(--theme-accent)] transition-colors min-h-[44px]"
            aria-label={locale === "bn" ? "আমার অ্যাকাউন্ট" : "My Account"}
          >
            <User className="size-[18px] text-[var(--theme-ink)]/70 shrink-0" strokeWidth={1.25} aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
              {locale === "bn" ? "অ্যাকাউন্ট" : "Account"}
            </span>
          </Link>
        ) : (
          <Link
            to="/store/$slug/account"
            params={{ slug: slug || base }}
            onClick={onNavigate}
            className="flex items-center gap-2.5 px-3 py-2.5 border border-[var(--theme-border)] text-[var(--theme-ink)] hover:border-[var(--theme-accent)] transition-colors min-h-[44px]"
            aria-label={locale === "bn" ? "আমার অ্যাকাউন্ট" : "My Account"}
          >
            <User className="size-[18px] text-[var(--theme-ink)]/70 shrink-0" strokeWidth={1.25} aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
              {locale === "bn" ? "অ্যাকাউন্ট" : "Account"}
            </span>
          </Link>
        )}

        {custom ? (
          <Link
            to="/account"
            search={{ tab: "wishlist" }}
            onClick={onNavigate}
            className="flex items-center justify-between px-3 py-2.5 border border-[var(--theme-border)] text-[var(--theme-ink)] hover:border-[var(--theme-accent)] transition-colors min-h-[44px]"
            aria-label={`${locale === "bn" ? "উইশলিস্ট" : "Wishlist"}, ${wishlistCount ?? 0}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Heart className="size-[18px] text-[var(--theme-ink)]/70 shrink-0" strokeWidth={1.25} aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                {locale === "bn" ? "উইশলিস্ট" : "Wishlist"}
              </span>
            </div>
            {(wishlistCount ?? 0) > 0 && (
              <span className="flex h-[18px] min-w-[18px] px-1 items-center justify-center rounded-full bg-[var(--theme-ink)] text-[10px] font-bold text-white shrink-0">
                {wishlistCount}
              </span>
            )}
          </Link>
        ) : (
          <Link
            to="/store/$slug/account"
            params={{ slug: slug || base }}
            search={{ tab: "wishlist" }}
            onClick={onNavigate}
            className="flex items-center justify-between px-3 py-2.5 border border-[var(--theme-border)] text-[var(--theme-ink)] hover:border-[var(--theme-accent)] transition-colors min-h-[44px]"
            aria-label={`${locale === "bn" ? "উইশলিস্ট" : "Wishlist"}, ${wishlistCount ?? 0}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Heart className="size-[18px] text-[var(--theme-ink)]/70 shrink-0" strokeWidth={1.25} aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                {locale === "bn" ? "উইশলিস্ট" : "Wishlist"}
              </span>
            </div>
            {(wishlistCount ?? 0) > 0 && (
              <span className="flex h-[18px] min-w-[18px] px-1 items-center justify-center rounded-full bg-[var(--theme-ink)] text-[10px] font-bold text-white shrink-0">
                {wishlistCount}
              </span>
            )}
          </Link>
        )}
      </div>

      {/* Language Switcher in Drawer */}
      <div className="flex items-center justify-between py-2 px-1 mb-2 border-b border-[var(--theme-border)] text-xs text-[var(--theme-ink)]/70">
        <span className="font-semibold uppercase tracking-wider text-[11px]">
          {locale === "bn" ? "ভাষা" : "Language"}
        </span>
        <LanguageToggle />
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
      {(policyDelivery || supportEmail) && (
        <div className="mt-8 pt-6 border-t border-[var(--theme-border)] space-y-4 text-[12px] text-[var(--theme-ink)]/70">
          {policyDelivery && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-ink)]/50 mb-1">
                {locale === "bn" ? "কাস্টমার কনসিয়ার্জ" : "Customer Concierge"}
              </p>
              <p className="font-serif text-[13px] text-[var(--theme-ink)]">
                {policyDelivery}
              </p>
            </div>
          )}
          {supportEmail && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--theme-ink)]/50 mb-1">
                {locale === "bn" ? "কাস্টমার সার্ভিস" : "Customer Support"}
              </p>
              <a
                href={`mailto:${supportEmail}`}
                className="inline-flex items-center gap-1.5 text-[var(--theme-accent,#C05A3E)] font-medium"
              >
                <span>{supportEmail}</span>
                {supportHours && (
                  <span className="text-[10px] text-[var(--theme-ink)]/50">
                    ({supportHours})
                  </span>
                )}
              </a>
            </div>
          )}
        </div>
      )}
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
      <div className="mx-auto hidden max-w-[var(--fq-container,1440px)] items-center justify-center px-4 lg:block">
        <SongoskritiDesktopNav
          items={items}
          base=""
          locale={ctx.locale}
          label={label}
        />
      </div>
      <div className="lg:hidden">
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
  showAnnouncement = true,
  supportEmail,
  supportHours,
  policyDelivery,
}: HeaderShellProps) {
  const { base, headerMenu, mobileMenu, headerChrome } = data;
  const { mobileOpen, setMobileOpen, scrolled, expandedMobileMenu } = behavior;
  const [menuFits, setMenuFits] = useState<boolean | null>(null);

  const headerContainerRef = useRef<HTMLDivElement>(null);
  const brandContainerRef = useRef<HTMLDivElement>(null);
  const utilsContainerRef = useRef<HTMLDivElement>(null);
  const measurerRef = useRef<HTMLDivElement>(null);

  const navLabel = t("Store menu", "স্টোর মেনু");
  const headerItems = toShellItems(
    headerMenu,
    data.headerFallback ? data.fallbackLabel : null,
  );
  const drawerItems = toShellItems(
    mobileMenu,
    data.mobileFallback ? data.fallbackLabel : null,
  );

  useEffect(() => {
    const checkFit = () => {
      const container = headerContainerRef.current;
      const measurer = measurerRef.current;
      if (!container || !measurer) return;

      const containerW = container.clientWidth;
      const brandEl =
        brandContainerRef.current?.querySelector("a") ||
        brandContainerRef.current;
      const brandW = brandEl ? brandEl.offsetWidth : 200;
      const utilsW = utilsContainerRef.current?.offsetWidth ?? 200;
      const menuW = measurer.scrollWidth;

      // 32px safety padding between brand, menu, and utility controls
      const availW = containerW - brandW - utilsW - 32;
      const fits = window.innerWidth >= 1024 && availW >= menuW;
      setMenuFits(fits);
    };

    checkFit();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        checkFit();
      });
      if (headerContainerRef.current) {
        ro.observe(headerContainerRef.current);
      }
      if (measurerRef.current) {
        ro.observe(measurerRef.current);
      }
    }

    window.addEventListener("resize", checkFit);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", checkFit);
    };
  }, [headerItems, locale]);

  // Escape key dismisses mobile drawer when open
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, setMobileOpen]);

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
      supportEmail={supportEmail ?? (slug === "flame-fashion-bd" ? "support@flamelancer.com" : null)}
      supportHours={supportHours}
      policyDelivery={policyDelivery}
      custom={custom}
      slug={slug}
      wishlistCount={wishlistCount}
    />
  );
  const isFlameMerchant =
    slug === "flame-fashion-bd" || name === "Flame Fashion BD";
  const brandMark =
    headerChrome && !isFlameMerchant ? (
      <img
        src={headerChrome.logo.src}
        alt={name || headerChrome.logo.alt}
        className="h-[34px] w-auto object-contain transition-all duration-300"
      />
    ) : (
      <span className="font-serif text-lg sm:text-2xl font-light tracking-[0.1em] sm:tracking-[0.15em] uppercase text-[var(--theme-ink)] block truncate max-w-[150px] min-[360px]:max-w-[200px] sm:max-w-none">
        {name}
      </span>
    );

  const showHamburgerClass =
    menuFits === null ? "lg:hidden flex" : menuFits ? "hidden" : "flex";
  const showDesktopNavClass =
    menuFits === null ? "hidden lg:flex" : menuFits ? "flex" : "hidden";
  const drawerVisibilityClass =
    menuFits === null ? "lg:hidden" : menuFits ? "hidden" : "block";
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
      {showAnnouncement && (
        <HeaderAnnouncementBar
          themeKey="songoskriti"
          headerChrome={headerChrome}
          scrolled={scrolled}
          locale={locale}
          slug={slug}
          t={t}
        />
      )}

      <div
        ref={headerContainerRef}
        className={`mx-auto flex transition-all duration-250 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10 ${scrolled ? "h-[64px]" : "h-[72px]"}`}
      >
        <div ref={brandContainerRef} className="flex items-center gap-2 sm:gap-4 shrink-0 min-w-max">
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
              className={`${shellIconLinkCls} ${showHamburgerClass} -ml-2 shrink-0`}
            >
              {mobileOpen ? (
                <X className="size-[22px]" strokeWidth={1} aria-hidden />
              ) : (
                <MenuIcon className="size-[22px]" strokeWidth={1} aria-hidden />
              )}
            </button>
          )}

          {custom ? (
            <Link to="/" className="flex items-center min-w-0">
              {brandMark}
            </Link>
          ) : (
            <Link
              to="/store/$slug"
              params={{ slug }}
              className="flex items-center min-w-0"
            >
              {brandMark}
            </Link>
          )}
        </div>

        <div className={`${showDesktopNavClass} flex-1 min-w-0 justify-center pointer-events-auto`}>
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

        <div ref={utilsContainerRef} className="flex items-center justify-end gap-1 shrink-0 min-w-max">
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

          <div className="hidden sm:inline-flex shrink-0">
            <LanguageToggle />
          </div>

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
          className={`border-t border-[var(--theme-border)] bg-[var(--theme-surface)] ${drawerVisibilityClass} overflow-y-auto fixed left-0 w-full z-40 bottom-0`}
          style={{
            top: scrolled ? "64px" : showAnnouncement ? "108px" : "72px",
            maxHeight: `calc(100vh - ${scrolled ? "64px" : showAnnouncement ? "108px" : "72px"})`,
          }}
        >
          <div className="mx-auto max-w-2xl px-4 sm:px-6 py-2 pb-24">
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

      {/* Offscreen invisible measurement container to measure un-wrapped menu width */}
      <div
        ref={measurerRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute -left-[9999px] top-0 flex flex-nowrap whitespace-nowrap opacity-0"
        style={{ position: "absolute", left: "-9999px", top: 0, visibility: "hidden" }}
      >
        <ul className="flex flex-nowrap whitespace-nowrap items-center gap-x-6 xl:gap-x-8 text-[11px] font-medium uppercase tracking-[0.2em]">
          {headerItems.map((item) => (
            <li key={item.id} className="shrink-0 px-2 py-6">
              <span className="whitespace-nowrap">{canonicalLabel(item, locale)}</span>
            </li>
          ))}
        </ul>
      </div>
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
