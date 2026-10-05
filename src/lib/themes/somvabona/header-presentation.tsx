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
 * Somvabona keeps the generic text wordmark: no header chrome is
 * registered here, so `themeChromeFor("somvabona")` stays null. Imports
 * nothing from the shared header — no theme branch lives here: this
 * module names only its own key.
 */
import {
  canonicalHref,
  canonicalLabel,
  canonicalPromoTitle,
  type CanonicalMenuItem,
} from "@/lib/menus/menu";
import { registerThemePresentation } from "@/lib/theme-presentations";
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

registerThemePresentation(
  "somvabona",
  "mega_menu",
  SomvabonaHeaderPresentation,
);
