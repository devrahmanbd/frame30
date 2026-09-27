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
 */
export function StoreFooterMenus({
  slug,
  nodes,
}: {
  slug: string;
  nodes: MenuNode[];
}) {
  const { t } = useLang();
  const { location } = useRouterState();
  const base = isCustomHostPath(location.pathname) ? "" : `/store/${slug}`;
  if (nodes.length === 0) return null;
  return (
    <nav
      aria-label={t("Footer menu", "ফুটার মেনু")}
      className="border-t border-[#eaeaea] bg-transparent"
    >
      <ul className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {nodes.slice(0, 12).map((node) => (
          <li key={node.id} className="min-w-0">
            {node.url && node.url !== "#" ? (
              <a
                href={rebaseMenuHref(node.url, base)}
                title={node.titleAttr || undefined}
                {...(node.newTab
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground hover:text-foreground/70 transition-colors block mb-6"
              >
                {node.label}
              </a>
            ) : (
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-foreground mb-6">
                {node.label}
              </p>
            )}
            {node.children.length > 0 && (
              <ul className="space-y-4">
                {node.children.slice(0, 24).map((child) => (
                  <li key={child.id}>
                    <a
                      href={rebaseMenuHref(child.url || "#", base)}
                      title={child.titleAttr || undefined}
                      {...(child.newTab
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                      className="font-serif text-[15px] font-light text-foreground/70 hover:text-foreground transition-colors"
                    >
                      {child.label}
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
