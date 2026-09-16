import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLang } from "@/lib/i18n";
import { PUBLIC_BANGLA_ENABLED } from "@/lib/public-locale";
import { BrandLogo } from "@/components/public/BrandLogo";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { PublicFooter } from "@/components/public/PublicFooter";

const NAV = [
  { to: "/features", key: "site.nav.features" },
  { to: "/pricing", key: "site.nav.pricing" },
  { to: "/about", key: "site.nav.about" },
  { to: "/faq", key: "site.nav.faq" },
  { to: "/docs", key: "site.nav.docs" },
  { to: "/contact", key: "site.nav.contact" },
] as const;

export interface PublicShellProps {
  children: ReactNode;
  hideFooterCta?: boolean;
}

/** Shared chrome for every public marketing page. */
export function PublicShell({
  children,
  hideFooterCta = false,
}: PublicShellProps) {
  const { tk, lang, setLang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close the phone menu on navigation, otherwise the panel covers the page
  // the visitor just asked for.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // The public site is English-only until Bangla is switched on from the admin
  // dashboard. A stored `bn` preference from a storefront visit would otherwise
  // leave marketing chrome in Bangla with no toggle to undo it.
  useEffect(() => {
    if (!PUBLIC_BANGLA_ENABLED && lang !== "en") setLang("en");
  }, [lang, setLang]);

  return (
    <div className="fq-site fq-marketing flex min-h-screen flex-col bg-background selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl transition-all">
        <div className="fq-band-inner flex h-16 items-center justify-between gap-4 md:grid md:grid-cols-[auto_1fr_auto]">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2.5 group">
            <BrandLogo size={32} className="group-hover:scale-105" />
            <span className="fq-display text-base font-bold tracking-tight text-foreground">Framique</span>
          </Link>
          <nav className="hidden items-center justify-center gap-1 text-sm md:flex" aria-label={tk("site.nav.label")}>
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "text-foreground after:scale-x-100" }}
                className="relative inline-flex min-h-11 items-center px-3 py-2 text-muted-foreground transition-colors after:absolute after:inset-x-3 after:bottom-2.5 after:h-px after:origin-left after:scale-x-0 after:bg-primary after:transition-transform hover:text-foreground hover:after:scale-x-100"
              >
                {tk(item.key)}
              </Link>
            ))}
            
          </nav>
          <div className="flex min-w-0 shrink items-center justify-end gap-1 sm:gap-2">
            {PUBLIC_BANGLA_ENABLED ? <LanguageToggle /> : null}
            <ThemeToggle />
            <Link
              to="/auth"
              className="hidden min-h-10 items-center rounded-fq-md px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              {tk("site.nav.sign_in")}
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex min-h-10 shrink-0 items-center rounded-fq-md fq-cta-blazing px-3.5 py-2 text-xs font-semibold shadow-sm ring-1 ring-inset ring-white/20 sm:px-4"
            >
              <span className="sm:hidden">{tk("site.cta.trial_short")}</span>
              <span className="hidden sm:inline">{tk("site.cta.trial")}</span>
            </Link>
            {/* Below `md` the centre nav is hidden, which left every marketing
                page unreachable from the header on a phone. A plain disclosure
                panel — no overlay library, no scroll lock — restores it and
                keeps the 44px touch target policy. */}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="public-mobile-nav"
              aria-label={tk("site.nav.label")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-fq-md border border-border text-foreground transition-colors hover:bg-muted md:hidden"
            >
              {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            id="public-mobile-nav"
            aria-label={tk("site.nav.label")}
            className="border-t border-border bg-background md:hidden"
          >
            <ul className="fq-band-inner grid gap-0.5 py-3">
              {NAV.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    activeProps={{ className: "text-foreground" }}
                    className="flex min-h-11 items-center rounded-fq-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {tk(item.key)}
                  </Link>
                </li>
              ))}
              
              <li className="mt-1 border-t border-border pt-1">
                <Link
                  to="/auth"
                  className="flex min-h-11 items-center rounded-fq-md px-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  {tk("site.nav.sign_in")}
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {/* Modern architectural glassmorphic footer matching header and image layout */}
      <PublicFooter hideCta={hideFooterCta} />
    </div>
  );
}
