import { useRouterState } from "@tanstack/react-router";
import { isCustomHostPath } from "@/lib/storefront-url";
import { rebaseMenuHref, type MenuNode } from "@/lib/menus/menu";
import { useLang } from "@/lib/i18n";

/**
 * Phase 16 T4 — dashboard-designed footer navigation.
 *
 * Rendered as a fallback block by the storefront home surfaces
 * (`StorefrontPage`, `StoreHomepage`) when a footer menu is claimed — no
 * `ThemeChrome` edit: `contextSlots` only reaches context widgets, and
 * `nav_menu` is a static widget, so the DB menu rides below the theme footer
 * instead of overriding it. Theme presets ship no footer `nav_menu`, so in
 * practice this *is* the footer nav; a merchant-authored static footer widget
 * keeps rendering alongside (documented: prefer one or the other). Empty
 * menus render nothing, leaving static widgets as the fallback.
 *
 * T3.3 split — data vs presentation:
 *
 * - `FooterData` is the merchant-owned footer payload: nav columns grouped
 *   from the dashboard menu tree, plus the optional brand area, newsletter
 *   placement, contact block, payment marks, legal row and mobile accordion
 *   state. One `FooterData` renders under every theme — the merchant reuses
 *   the same data across themes, only the presentation changes.
 * - `ThemeFooterRenderer` is the theme-owned presentation over that data.
 *   `presentation="columns"` is today's 4-column grid, byte-identical;
 *   `presentation="stacked"` is the alternate single-column treatment for
 *   themes that want it. Same data, different theme presentations.
 * - `buildFooterData` is the pure data derivation (menu tree + store base
 *   → columns, caps preserved: 12 columns, 24 links each). No hooks, no
 *   markup — unit-testable in isolation.
 *
 * `StoreFooterMenus` keeps its exact props and default output: it derives
 * the base from the router, builds the data, and renders the `columns`
 * presentation. No behavior/visual change on the default path.
 */
export type FooterColumnLink = {
  id: string;
  label: string;
  /** Rebased onto the store base (`/store/<slug>`), or the raw href on custom hosts. */
  href: string;
  titleAttr: string;
  newTab: boolean;
};

export type FooterColumn = {
  id: string;
  /** Top-level node label — the column heading. */
  label: string;
  /** Rebased heading href; `"#"` (or empty) renders a heading-only `<p>`. */
  href: string;
  titleAttr: string;
  newTab: boolean;
  links: FooterColumnLink[];
};

/** Brand statement zone. Absent today — reserved for theme presentations. */
export type FooterBrandArea = {
  name?: string;
  statement?: string;
  storyHref?: string;
};

/** Where the newsletter CTA sits relative to the columns. */
export type FooterNewsletterPlacement =
  | "above-columns"
  | "below-columns"
  | "none";

/** Contact block lines (phone, email, flagship rows). */
export type FooterContact = {
  lines: FooterColumnLink[];
};

/** Payment marks row (e.g. bKash, Nagad, Visa). */
export type FooterPayments = {
  marks: string[];
};

/** Closing legal row (colophon notice + policy links). */
export type FooterLegalRow = {
  notice?: string;
  links: FooterColumnLink[];
};

/** Mobile accordion state lives in data so every presentation agrees. */
export type FooterMobileAccordion = {
  expandedId: string | null;
};

export type FooterData = {
  columns: FooterColumn[];
  /** True exactly when the dashboard claimed no footer menu (`nodes` empty). */
  isEmpty: boolean;
  brand?: FooterBrandArea;
  newsletterPlacement?: FooterNewsletterPlacement;
  contact?: FooterContact;
  payments?: FooterPayments;
  legal?: FooterLegalRow;
  mobileAccordion: FooterMobileAccordion;
};

/** Theme presentation over one `FooterData`. */
export type FooterPresentation = "columns" | "stacked";

/**
 * Pure derivation: dashboard menu tree + store base → merchant footer data.
 * Caps mirror the legacy render exactly (12 columns, 24 links each) so the
 * default presentation is byte-identical to before the split.
 */
export function buildFooterData(
  nodes: MenuNode[],
  base: string,
): FooterData {
  return {
    columns: nodes.slice(0, 12).map((node) => ({
      id: node.id,
      label: node.label,
      href: rebaseMenuHref(node.url || "#", base),
      titleAttr: node.titleAttr,
      newTab: node.newTab,
      links: node.children.slice(0, 24).map((child) => ({
        id: child.id,
        label: child.label,
        href: rebaseMenuHref(child.url || "#", base),
        titleAttr: child.titleAttr,
        newTab: child.newTab,
      })),
    })),
    isEmpty: nodes.length === 0,
    mobileAccordion: { expandedId: null },
  };
}

/** Shared heading target/rel spread: new-tab nodes open externally. */
function footerNewTabProps(newTab: boolean) {
  return newTab ? { target: "_blank", rel: "noreferrer" } : {};
}

/**
 * Theme-owned footer presentation over shared merchant data. `columns` is
 * the legacy 4-column grid, verbatim; `stacked` renders the same columns as
 * a single-column stack for themes that want that treatment.
 */
export function ThemeFooterRenderer({
  data,
  label,
  presentation = "columns",
}: {
  data: FooterData;
  /** Localised nav label (hooks stay in the caller; this is pure markup). */
  label: string;
  presentation?: FooterPresentation;
}) {
  if (presentation === "stacked") {
    return (
      <nav aria-label={label} className="border-t border-[#eaeaea] bg-transparent">
        <div
          data-footer-presentation="stacked"
          className="mx-auto max-w-6xl space-y-10 px-4 py-16"
        >
          {data.columns.map((column) => (
            <section key={column.id} className="min-w-0">
              {column.href && column.href !== "#" ? (
                <a
                  href={column.href}
                  title={column.titleAttr || undefined}
                  {...footerNewTabProps(column.newTab)}
                  className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground hover:text-foreground/70 transition-colors block mb-6"
                >
                  {column.label}
                </a>
              ) : (
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground mb-6">
                  {column.label}
                </p>
              )}
              {column.links.length > 0 && (
                <ul className="space-y-4">
                  {column.links.map((link) => (
                    <li key={link.id}>
                      <a
                        href={link.href}
                        title={link.titleAttr || undefined}
                        {...footerNewTabProps(link.newTab)}
                        className="font-serif text-[15px] font-light text-foreground/70 hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </nav>
    );
  }
  return (
    <nav aria-label={label} className="border-t border-[#eaeaea] bg-transparent">
      <ul className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {data.columns.map((column) => (
          <li key={column.id} className="min-w-0">
            {column.href && column.href !== "#" ? (
              <a
                href={column.href}
                title={column.titleAttr || undefined}
                {...footerNewTabProps(column.newTab)}
                className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground hover:text-foreground/70 transition-colors block mb-6"
              >
                {column.label}
              </a>
            ) : (
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground mb-6">
                {column.label}
              </p>
            )}
            {column.links.length > 0 && (
              <ul className="space-y-4">
                {column.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.href}
                      title={link.titleAttr || undefined}
                      {...footerNewTabProps(link.newTab)}
                      className="font-serif text-[15px] font-light text-foreground/70 hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function StoreFooterMenus({
  slug,
  nodes,
  presentation = "columns",
}: {
  slug: string;
  nodes: MenuNode[];
  /** Theme presentation switch. Absent keeps today's grid exactly. */
  presentation?: FooterPresentation;
}) {
  const { t } = useLang();
  const { location } = useRouterState();
  const base = isCustomHostPath(location.pathname) ? "" : `/store/${slug}`;
  const data = buildFooterData(nodes, base);
  if (data.isEmpty) return null;
  return (
    <ThemeFooterRenderer
      data={data}
      label={t("Footer menu", "ফুটার মেনু")}
      presentation={presentation}
    />
  );
}
