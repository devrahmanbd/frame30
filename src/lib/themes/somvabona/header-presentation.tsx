/**
 * Somvabona header presentation — theme-owned (HEADER DE-THEMING lane).
 *
 * Claims the `somvabona × mega_menu` pair through
 * `registerThemePresentation` (first-wins, never throws) and renders the
 * shared canonical modes (`CanonicalDropdownMenu` for desktop,
 * `CanonicalMobileDrawer` for mobile) inside the everyday chrome: a compact
 * menubar row over the brand surface, drawer separated by a top border.
 * Same canonical data as every theme — only this presentation differs.
 *
 * Items derive from the widget's live rows when the batch resolved any
 * (capped at the `limit` prop), else from the section's own trigger label
 * plus its widget-level promo props. Hrefs are pre-rebased through the
 * context `link` (host-aware), so the canonical modes render with an empty
 * base. Somvabona keeps the generic text wordmark: no header chrome is
 * registered here, so `themeChromeFor("somvabona")` stays null. No theme
 * branch lives here: this module names only its own key.
 */
import type { CanonicalMenuItem } from "@/lib/menus/menu";
import { registerThemePresentation } from "@/lib/theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";
import {
  CanonicalDropdownMenu,
  CanonicalMobileDrawer,
} from "@/components/store/StoreHeader";

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
        <CanonicalDropdownMenu
          items={items}
          base=""
          locale={ctx.locale}
          label={label}
        />
      </div>
      <div className="border-t border-[var(--theme-border)] md:hidden">
        <CanonicalMobileDrawer
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
