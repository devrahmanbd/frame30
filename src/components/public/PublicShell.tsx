import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLang } from "@/lib/i18n";
import { PUBLIC_BANGLA_ENABLED } from "@/lib/public-locale";
import { LEGAL_DOCS, ORG_NAP, napAddressLine } from "@/lib/legal";
import { NewsletterBlock } from "@/components/public/NewsletterForm";
import { BrandLogo } from "@/components/public/BrandLogo";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { marketingRoute, type MarketingRouteId } from "@/lib/marketing-seo";

const NAV = [
  { to: "/features", key: "site.nav.features" },
  { to: "/pricing", key: "site.nav.pricing" },
  { to: "/about", key: "site.nav.about" },
  { to: "/faq", key: "site.nav.faq" },
  { to: "/docs", key: "site.nav.docs" },
  { to: "/contact", key: "site.nav.contact" },
] as const;

/**
 * Phase 10.2 — the deep-dive pages are reachable from the shared footer of
 * every public page, so no registered marketing route is an orphan and the
 * crawl depth from `/` stays at one click. Labels come from the SEO registry
 * so nav copy and breadcrumb copy can never drift apart.
 */
const FOOTER_PRODUCT: readonly MarketingRouteId[] = [
  "features",
  "builder",
  "payments",
  "fulfilment",
  "pricing",
];
const FOOTER_COMPANY: readonly MarketingRouteId[] = [
  "customers",
  "about",
  "security",
  "faq",
  "blog",
  "status",
];

/** Rails printed in the footer trust strip — settlement rails only, no logos. */
const FOOTER_RAILS = ["bKash", "Nagad", "Rocket", "Bank transfer", "Cash on delivery"] as const;

function FooterColumn({
  title,
  children}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <nav aria-label={title} className="min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
      <ul className="mt-3 space-y-1">{children}</ul>
    </nav>
  );
}

function FooterLink({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) {
  return (
    <li>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Link
        {...(rest as any)}
        className="inline-flex min-h-9 items-center text-sm text-foreground/80 transition-colors hover:text-primary"
      >
        {children}
      </Link>
    </li>
  );
}

/** Shared chrome for every public marketing page. */
export function PublicShell({
  children}: {
  children: ReactNode;
  
}) {
  const { tk, lang, setLang } = useLang();
  const year = new Date().getFullYear();
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
            <span className="flex flex-col leading-none">
              <span className="fq-display text-base font-bold tracking-tight text-foreground">Framique</span>
              <span className="mt-0.5 hidden text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">
                Modern Commerce
              </span>
            </span>
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

      <footer className="border-t border-border bg-card">
        {/* Newsletter section with softer framing */}
        <div className="bg-muted/30">
          <div className="fq-band-inner py-12 md:py-16">
            <NewsletterBlock source="footer" />
          </div>
        </div>

        {/* Main Footer Links */}
        <div className="fq-band-inner py-16 md:py-24">
          <div className="grid gap-12 lg:grid-cols-12">
            {/* Company identity + NAP */}
            <div className="lg:col-span-4">
              <div className="flex items-center gap-2.5">
                <BrandLogo size={28} />
                <span className="fq-display text-base font-semibold tracking-tight">{ORG_NAP.legalName}</span>
              </div>
              <p className="mt-4 max-w-[280px] text-sm text-muted-foreground leading-relaxed">
                {tk("site.footer.tagline")}
              </p>
              
              <address className="mt-8 space-y-2 text-sm not-italic text-muted-foreground">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
                  {tk("site.footer.address")}
                </p>
                <div className="space-y-1">
                  <p className="text-foreground/80">{napAddressLine()}</p>
                  <p className="flex items-center gap-2">
                    <a className="hover:text-primary transition-colors" href={`tel:${ORG_NAP.e164Phone}`}>
                      {ORG_NAP.phone}
                    </a>
                    <span className="text-border">•</span>
                    <a className="hover:text-primary transition-colors" href={`mailto:${ORG_NAP.email}`}>
                      {ORG_NAP.email}
                    </a>
                  </p>
                  <p className="text-foreground/70">{ORG_NAP.hours}</p>
                </div>
              </address>
            </div>

            {/* Links Grid */}
            <div className="grid grid-cols-2 gap-10 sm:grid-cols-2 md:grid-cols-4 lg:col-span-8">
              <FooterColumn title={tk("site.footer.product")}>
                {FOOTER_PRODUCT.map((id) => {
                  const route = marketingRoute(id);
                  return (
                    <FooterLink key={route.path} to={route.path}>
                      {route.label[lang] ?? route.label.en}
                    </FooterLink>
                  );
                })}
              </FooterColumn>

              <FooterColumn title={tk("site.footer.company")}>
                {FOOTER_COMPANY.map((id) => {
                  const route = marketingRoute(id);
                  return (
                    <FooterLink key={route.path} to={route.path}>
                      {route.label[lang] ?? route.label.en}
                    </FooterLink>
                  );
                })}
                <FooterLink to="/docs">{tk("site.nav.docs")}</FooterLink>
              </FooterColumn>

              <FooterColumn title={tk("site.footer.merchants")}>
                <FooterLink to="/auth">{tk("site.nav.sign_in")}</FooterLink>
                <FooterLink to="/admin">{tk("site.nav.dashboard")}</FooterLink>
                <FooterLink to="/contact">{tk("site.nav.contact")}</FooterLink>
              </FooterColumn>

              <FooterColumn title={tk("site.footer.legal_group")}>
                <FooterLink to="/legal">{tk("site.footer.legal_group")}</FooterLink>
                {LEGAL_DOCS.map((doc) => (
                  <FooterLink key={doc.slug} to="/legal/$doc" params={{ doc: doc.slug }}>
                    {doc.title[lang]}
                  </FooterLink>
                ))}
              </FooterColumn>
            </div>
          </div>
        </div>

        {/* Unified Bottom Footer */}
        <div className="border-t border-border">
          <div className="fq-band-inner py-8 flex flex-col items-center justify-between gap-6 md:flex-row text-xs text-muted-foreground">
            
            <div className="flex flex-col gap-1 items-center md:items-start">
              <span className="font-medium text-foreground/80">© {year} {ORG_NAP.legalName}</span>
              <span className="text-foreground/60">{tk("site.footer.legal")}</span>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-2">
              <span className="font-medium text-foreground/60 mr-2">Settled through:</span>
              {FOOTER_RAILS.map((rail) => (
                <span key={rail} className="rounded-fq-sm bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {rail}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 font-medium text-foreground/70">
              <span className="hidden lg:inline">{ORG_NAP.locality}, {ORG_NAP.country}</span>
              <Link to="/status" className="hover:text-primary transition-colors">
                System Status
              </Link>
              <Link to="/contact" className="hover:text-primary transition-colors">
                Contact
              </Link>
            </div>

          </div>
        </div>
      </footer>
    </div>
  );
}
