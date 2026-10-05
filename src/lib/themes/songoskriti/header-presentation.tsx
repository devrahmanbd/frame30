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
 * Imports nothing from the shared header — no theme branch lives here:
 * this module names only its own key.
 */
import { useState } from "react";
import {
  canonicalHref,
  canonicalLabel,
  canonicalPromoTitle,
  type CanonicalMenuItem,
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

registerThemePresentation(
  "songoskriti",
  "mega_menu",
  SongoskritiHeaderPresentation,
);
