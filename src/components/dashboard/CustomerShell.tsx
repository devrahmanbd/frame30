/**
 * Customer console shell — `/dashboard`.
 *
 * Inherits the merchant's published look-and-feel language (typography, radii,
 * accent) so the portal feels like the store rather than an admin panel. It
 * shares the console primitives with `/admin` but never with `/root`.
 */
import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Package, Truck, Heart, User, ChevronDown } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useCustomerAccount, useCustomerAccounts } from "@/hooks/use-customer";

type Dest = { to: string; en: string; bn: string; icon: typeof Home };

// Max five destinations: the bottom bar is the primary navigation on mobile.
const DESTS: Dest[] = [
  { to: "/dashboard", en: "Home", bn: "হোম", icon: Home },
  { to: "/dashboard/orders", en: "Orders", bn: "অর্ডার", icon: Package },
  { to: "/dashboard/track", en: "Track", bn: "ট্র্যাক", icon: Truck },
  { to: "/dashboard/wishlist", en: "Wishlist", bn: "উইশলিস্ট", icon: Heart },
  { to: "/dashboard/profile", en: "Profile", bn: "প্রোফাইল", icon: User },
];

export function CustomerShell({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | undefined>();
  const [openStoreMenu, setOpenStoreMenu] = useState(false);
  const { data: account } = useCustomerAccount(selectedMerchantId);
  const { data: accountsData } = useCustomerAccounts();
  const accounts = accountsData ?? [];

  const isActive = (to: string) => (to === "/dashboard" ? pathname === to : pathname.startsWith(to));

  return (
    <div className="fq-theme flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#customer-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-fq-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        {t("Skip to content", "মূল অংশে যান")}
      </a>

      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          {accounts.length > 1 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenStoreMenu((v) => !v)}
                className="flex items-center gap-1.5 rounded-fq-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted"
                aria-expanded={openStoreMenu}
                aria-haspopup="menu"
              >
                <span className="max-w-[140px] truncate font-bangla-display">
                  {account?.storeName ?? t("Select store", "দোকান নির্বাচন")}
                </span>
                <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
              </button>
              {openStoreMenu ? (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    role="presentation"
                    onClick={() => setOpenStoreMenu(false)}
                  />
                  <ul
                    role="menu"
                    className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-fq-lg border border-border bg-card p-1 shadow-lg"
                  >
                    {accounts.map((a) => (
                      <li key={a.id} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setSelectedMerchantId(a.merchantId);
                            setOpenStoreMenu(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-fq-md px-2.5 py-1.5 text-left text-xs ${
                            a.merchantId === account?.merchantId
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span className="truncate">{a.storeName ?? a.storeSlug ?? "Store"}</span>
                          {a.merchantId === account?.merchantId ? <span>✓</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <span className="font-bangla-display text-sm font-semibold">
              {account?.storeName ?? t("My account", "আমার অ্যাকাউন্ট")}
            </span>
          )}
          {account?.storeSlug ? (
            <a
              href={`/store/${account.storeSlug}`}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {t("Visit store", "দোকানে যান")}
            </a>
          ) : null}
          <div className="ml-auto">
            <LanguageToggle />
          </div>
        </div>

        <nav
          aria-label={t("Account sections", "অ্যাকাউন্ট বিভাগ")}
          className="mx-auto hidden max-w-4xl gap-1 px-4 pb-2 sm:flex"
        >
          {DESTS.map((d) => (
            <Link
              key={d.to}
              to={d.to}
              aria-current={isActive(d.to) ? "page" : undefined}
              className={`rounded-fq-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                isActive(d.to)
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="font-bangla-display">{t(d.en, d.bn)}</span>
            </Link>
          ))}
        </nav>
      </header>

      <main id="customer-main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 p-4 pb-24 sm:pb-8">
        {children}
      </main>

      <nav
        aria-label={t("Account sections", "অ্যাকাউন্ট বিভাগ")}
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card sm:hidden"
      >
        {DESTS.map((d) => (
          <Link
            key={d.to}
            to={d.to}
            aria-current={isActive(d.to) ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] ${
              isActive(d.to) ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <d.icon className="size-4" aria-hidden />
            <span className="font-bangla-display">{t(d.en, d.bn)}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
