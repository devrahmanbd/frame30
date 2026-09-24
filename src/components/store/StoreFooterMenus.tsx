import { useId } from "react";
import { useRouterState } from "@tanstack/react-router";
import { LanguageToggle } from "@/components/LanguageToggle";
import { isCustomHostPath } from "@/lib/storefront-url";
import { rebaseMenuHref, type MenuNode } from "@/lib/menus/menu";
import { useLang } from "@/lib/i18n";
import {
  BRAND_NAME,
  BRAND_NAME_BN,
  COLOPHON,
  FALLBACK_COLUMNS,
  NEWSLETTER,
  PAYMENTS_LIST,
  STATEMENT,
} from "@/lib/themes/songoskriti/footer";

/* Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V5
 * Statement footer (Ft5): asymmetric brand panel + link columns, one
 * signature (terracotta rule + oversized display line), tokens only,
 * single-column mobile, no invented metrics or logos. */

type FooterLink = {
  key: string;
  label: string;
  href: string;
  titleAttr?: string;
  newTab?: boolean;
};

type FooterColumn = { key: string; title: string; links: FooterLink[] };

/** `Label|/href` newline rows — the same shape the sitemap widget parses. */
function parseFallbackLinks(raw: string): FooterLink[] {
  return raw
    .split(/[\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, href] = part.split("|");
      return {
        key: `${(label ?? "").trim()}|${((href ?? "").trim() || "#").trim()}`,
        label: (label ?? "").trim(),
        href: (href ?? "").trim() || "#",
      };
    })
    .filter((link) => link.label.length > 0);
}

function columnsFor(
  nodes: MenuNode[],
  base: string,
  t: (en: string, bn?: string) => string,
): { columns: FooterColumn[]; fallback: boolean } {
  if (nodes.length === 0) {
    return {
      fallback: true,
      columns: FALLBACK_COLUMNS.map((col, index) => ({
        key: `fallback-${index}`,
        title: t(col.title, col.title_bn),
        links: parseFallbackLinks(col.links).map((link) => ({
          ...link,
          href: rebaseMenuHref(link.href, base),
        })),
      })),
    };
  }
  return {
    fallback: false,
    columns: nodes.slice(0, 4).map((node) => ({
      key: node.id,
      title: node.label,
      links:
        node.children.length > 0
          ? node.children.slice(0, 8).map((child) => ({
              key: child.id,
              label: child.label,
              href: rebaseMenuHref(child.url || "#", base),
              titleAttr: child.titleAttr || undefined,
              newTab: child.newTab || undefined,
            }))
          : node.url && node.url !== "#"
            ? [
                {
                  key: `${node.id}-self`,
                  label: node.label,
                  href: rebaseMenuHref(node.url, base),
                  titleAttr: node.titleAttr || undefined,
                  newTab: node.newTab || undefined,
                },
              ]
            : [],
    })),
  };
}

/**
 * Phase 16 T4 — dashboard-designed footer navigation, Songoskriti
 * statement standard.
 *
 * Rendered below the theme footer by the storefront home surfaces. Unlike
 * the first version it never vanishes: with no claimed footer menu it
 * renders the brand statement, the single newsletter CTA and manual
 * fallback columns with verified routes, so an unconfigured store still
 * closes the page to brand standard.
 */
export function StoreFooterMenus({
  slug,
  nodes,
  name,
}: {
  slug: string;
  nodes: MenuNode[];
  /** Merchant name; defaults to the Songoskriti brand line. */
  name?: string;
}) {
  const { t } = useLang();
  const { location } = useRouterState();
  const base = isCustomHostPath(location.pathname) ? "" : `/store/${slug}`;
  const emailId = useId();
  const year = new Date().getFullYear();
  const brand = name?.trim() ? name.trim() : t(BRAND_NAME, BRAND_NAME_BN);
  const { columns } = columnsFor(nodes, base, t);

  return (
    <footer
      aria-label={t("Footer", "ফুটার")}
      className="border-t border-border bg-muted/40"
    >
      <span
        aria-hidden="true"
        className="block h-1"
        style={{ backgroundColor: "var(--theme-accent, #C45D3E)" }}
      />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.2fr_2fr]">
          <div className="min-w-0">
            <p className="font-bangla-display text-3xl font-bold leading-tight">
              {brand}
            </p>
            <p className="mt-3 text-xl font-semibold leading-snug">
              {t(STATEMENT.heading, STATEMENT.heading_bn)}
            </p>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              {t(STATEMENT.body, STATEMENT.body_bn)}
            </p>
            <section
              aria-labelledby={`${emailId}-heading`}
              className="mt-6"
            >
              <h2
                id={`${emailId}-heading`}
                className="text-sm font-semibold"
              >
                {t(NEWSLETTER.heading, NEWSLETTER.heading_bn)}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(NEWSLETTER.body, NEWSLETTER.body_bn)}
              </p>
              <form
                className="mt-3 flex max-w-md flex-col gap-2 sm:flex-row"
                method="post"
                action="#newsletter"
              >
                <label className="sr-only" htmlFor={emailId}>
                  {t("Email address", "ইমেইল ঠিকানা")}
                </label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="min-h-11 min-w-0 flex-1 rounded-fq-md border border-border bg-card px-3 text-sm"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-fq-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
                >
                  {t(NEWSLETTER.buttonLabel, NEWSLETTER.buttonLabel_bn)}
                </button>
              </form>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(NEWSLETTER.consentText, NEWSLETTER.consentText_bn)}
              </p>
            </section>
          </div>
          <nav
            aria-label={t("Footer menu", "ফুটার মেনু")}
            className="grid min-w-0 grid-cols-1 gap-8 py-2 sm:grid-cols-2"
          >
            {columns.map((col) => (
              <div key={col.key} className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {col.title}
                </p>
                {col.links.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {col.links.map((link) => (
                      <li key={link.key}>
                        <a
                          href={link.href}
                          title={link.titleAttr}
                          {...(link.newTab
                            ? { target: "_blank", rel: "noreferrer" }
                            : {})}
                          className="text-sm text-muted-foreground hover:text-primary hover:underline"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
          <ul
            aria-label={t("Payment methods", "পেমেন্ট মাধ্যম")}
            className="flex flex-wrap items-center gap-2"
          >
            {PAYMENTS_LIST.map((mark) => (
              <li
                key={mark}
                className="rounded-fq-sm border border-border bg-card px-2 py-1"
              >
                {mark}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0">
              {t(COLOPHON.body, COLOPHON.body_bn)}{" "}
              <span>
                © {year} {brand}
              </span>
            </p>
            <LanguageToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
