import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { BrandLogo } from "@/components/public/BrandLogo";
import { CommandPalette, useCommandPalette } from "@/components/admin/CommandPalette";
import { ADMIN_NAV, filterNav, type IconKey, type NavGroup } from "@/lib/console-nav";
import { useCan } from "@/hooks/use-membership";
import { useMerchant, useMerchants } from "@/hooks/use-merchant";
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  ChevronDown,
  Code2,
  Contact,
  Download,
  ExternalLink,
  FileText,
  FolderTree,
  Gem,
  Gift,
  Globe,
  Image,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Tags,
  Ticket,
  Truck,
  Undo2,
  UserCog,
  Users,
  X,
} from "lucide-react";

const ICONS: Record<IconKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  analytics: BarChart3,
  orders: ShoppingCart,
  products: Package,
  catalog: Boxes,
  pages: FileText,
  collections: Layers,
  builder: Layers,
  pos: Store,
  shipping: Truck,
  inventory: Boxes,
  returns: Undo2,
  gift: Gift,
  bundles: ShoppingBasket,
  carts: ShoppingCart,
  customers: Contact,
  receipt: Receipt,
  pricing: Tags,
  purchasing: Truck,
  subscriptions: Gem,
  tags: Tags,
  categories: FolderTree,
  marketing: Megaphone,
  ticket: Ticket,
  users: Users,
  send: Send,
  articles: FileText,
  media: Image,
  seo: Search,
  marketplace: Store,
  fraud: ShieldAlert,
  infra: Activity,
  ai: Bot,
  support: LifeBuoy,
  exports: Download,
  apikeys: KeyRound,
  developers: Code2,
  rails: Landmark,
  domains: Globe,
  security: ShieldCheck,
  plans: Gem,
  staff: UserCog,
  approvals: ShieldCheck,
  activity: Activity,
  settings: Settings,
};

function isActive(pathname: string, to: string) {
  return to === "/admin" ? pathname === "/admin" : pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Shopify-style primary navigation: a short list of top-level sections only.
 * Sub-pages are not repeated here — they surface as tabs inside the page,
 * so the sidebar stays scannable at eight rows.
 */
function SidebarNav({
  groups,
  pathname,
  onNavigate,
  collapsed = false,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
  /** Icon-only rail: the label survives as `title` + accessible name. */
  collapsed?: boolean;
}) {
  const { t } = useLang();

  return (
    <nav
      aria-label="Admin"
      className={`flex-1 space-y-0.5 overflow-y-auto ${collapsed ? "px-2 py-3" : "p-3"}`}
    >
      {groups.map((g) => {
        const GroupIcon = ICONS[g.icon];
        const groupActive = g.items.some((i) => isActive(pathname, i.to));
        const target = g.to ?? g.items[0]?.to ?? "/admin";
        const label = t(g.en, g.bn);
        return (
          <Link
            key={g.key}
            to={target}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            aria-current={groupActive ? "page" : undefined}
            className={`flex min-h-9 items-center rounded-fq-md text-[13px] font-medium transition-colors duration-150 ${
              collapsed ? "justify-center px-0" : "gap-3 px-2.5"
            } ${
              groupActive
                ? "bg-primary/10 text-foreground"
                : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
            }`}
          >
            <GroupIcon
              className={`size-4 shrink-0 ${groupActive ? "text-primary" : "text-muted-foreground"}`}
              aria-hidden
            />
            {collapsed ? null : <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sub-pages of the active section, rendered as page tabs (Polaris pattern). */
function SectionTabs({ group, pathname }: { group: NavGroup | undefined; pathname: string }) {
  const { t } = useLang();
  const [openMore, setOpenMore] = useState(false);
  useEffect(() => {
    setOpenMore(false);
  }, [pathname]);
  if (!group || group.items.length < 2) return null;
  const more = group.more ?? [];
  const moreActive = more.some((i) => isActive(pathname, i.to));
  return (
    <div className="sticky top-14 z-20 -mx-4 mb-4 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
      {/* This is section navigation, not a tab widget: each item is a route
          link and the "More" popover is not a tab, so `role="tablist"` failed
          aria-required-children. A labelled <nav> with aria-current is the
          honest role. */}
      <nav
        aria-label={group.en}
        className="inline-flex gap-1 rounded-fq-lg border border-border bg-card p-1"
      >
        {group.items.map((i) => {
          const active = isActive(pathname, i.to);
          return (
            <Link
              key={i.to}
              to={i.to}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-8 items-center whitespace-nowrap rounded-fq-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-foreground/[0.07] text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="font-bangla-display">{t(i.en, i.bn)}</span>
            </Link>
          );
        })}

        {more.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMore((v) => !v)}
              aria-expanded={openMore}
              aria-haspopup="menu"
              className={`flex min-h-8 items-center gap-1 whitespace-nowrap rounded-fq-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                moreActive
                  ? "bg-foreground/[0.07] text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t("More", "আরও")}
              <ChevronDown className="size-3.5" aria-hidden />
            </button>
            {openMore ? (
              <>
                <div
                  className="fixed inset-0 z-10"
                  role="presentation"
                  onClick={() => setOpenMore(false)}
                />
                <ul
                  role="menu"
                  className="absolute right-0 z-20 mt-1 min-w-48 rounded-fq-lg border border-border bg-card p-1 shadow-lg"
                >
                  {more.map((i) => (
                    <li key={i.to} role="none">
                      <Link
                        to={i.to}
                        role="menuitem"
                        onClick={() => setOpenMore(false)}
                        className={`block rounded-fq-md px-2.5 py-1.5 text-[13px] transition-colors ${
                          isActive(pathname, i.to)
                            ? "bg-foreground/[0.07] text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {t(i.en, i.bn)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </nav>
    </div>
  );
}


const COLLAPSE_KEY = "fq.admin.sidebar.collapsed";

export function AdminShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openStoreMenu, setOpenStoreMenu] = useState(false);

  // Read after mount: a `typeof window` guard in the initializer mismatches SSR.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* private mode — the rail simply resets next load */
      }
      return next;
    });

  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { t } = useLang();
  const can = useCan();
  const palette = useCommandPalette();
  const { data: merchant } = useMerchant();
  const { memberships, switchMerchant } = useMerchants();

  const groups = useMemo(() => filterNav(ADMIN_NAV, can), [can]);
  const activeGroup = useMemo(
    () =>
      groups.find((g) =>
        [...g.items, ...(g.more ?? [])].some((i) => isActive(pathname, i.to)),
      ),
    [groups, pathname],
  );

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  return (
    <div className="fq-admin flex min-h-screen w-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card px-3 sm:px-4">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label={t("Open menu", "মেনু খুলুন")}
          className="fq-iconbtn grid size-10 place-items-center rounded-fq-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>

        <div className="relative flex min-w-0 items-center gap-2">
          <Link
            to="/"
            className="inline-flex shrink-0 items-center transition-transform hover:scale-105"
            title={t("Framique Home", "ফ্রেমিক হোম")}
            aria-label={t("Framique Home", "ফ্রেমিক হোম")}
          >
            <BrandLogo size={24} />
          </Link>
          {memberships.length > 1 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenStoreMenu((v) => !v)}
                className="flex items-center gap-1.5 rounded-fq-md px-2 py-1 text-sm font-semibold hover:bg-muted"
                aria-expanded={openStoreMenu}
                aria-haspopup="menu"
              >
                <span className="max-w-[140px] truncate font-bangla-display sm:max-w-[200px]">
                  {merchant?.name ?? t("Framique", "ফ্রেমিক")}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
                    className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-fq-lg border border-border bg-card p-1 shadow-lg"
                  >
                    {memberships.map((m) => (
                      <li key={m.merchant_id} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            switchMerchant(m.merchant_id);
                            setOpenStoreMenu(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-fq-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                            m.merchant_id === merchant?.id
                              ? "bg-primary/10 font-semibold text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span className="truncate">{m.merchant.name}</span>
                          {m.merchant_id === merchant?.id ? (
                            <span className="ml-2 text-[10px] text-primary">✓</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <span className="hidden min-w-0 truncate font-bangla-display text-sm font-semibold sm:block">
              {merchant?.name ?? t("Framique", "ফ্রেমিক")}
            </span>
          )}
        </div>

        <div className="mx-auto hidden w-full max-w-xl px-4 sm:block">
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            className="flex w-full items-center gap-2 rounded-fq-md border border-border bg-background px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t("Search anything", "যেকোনো কিছু খুঁজুন")}</span>
            <kbd className="ml-auto rounded border border-border px-1 text-[10px]">⌘K</kbd>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          {merchant?.slug ? (
            <a
              href={`/store/${merchant.slug}`}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-fq-md px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground lg:flex"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {t("View store", "দোকান দেখুন")}
            </a>
          ) : null}
          <NotificationBell />
          <LanguageToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-border/70 transition-[width] duration-200 md:flex ${
            collapsed ? "w-[4.25rem]" : "w-60"
          }`}
        >
          <SidebarNav groups={groups} pathname={pathname} collapsed={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            title={collapsed ? t("Expand sidebar", "সাইডবার বড় করুন") : t("Collapse sidebar", "সাইডবার ছোট করুন")}
            className="m-2 flex min-h-9 items-center justify-center gap-2 rounded-fq-md text-xs fq-sub transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="size-4" aria-hidden />
                <span>{t("Collapse", "ছোট করুন")}</span>
              </>
            )}
            <span className="sr-only">
              {collapsed ? t("Expand sidebar", "সাইডবার বড় করুন") : t("Collapse sidebar", "সাইডবার ছোট করুন")}
            </span>
          </button>
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-foreground/40"
              role="presentation"
              onClick={() => setDrawer(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card">
              <div className="flex h-14 items-center justify-between border-b border-border px-3">
                <span className="font-bangla-display text-sm font-semibold">
                  {merchant?.name ?? t("Framique Admin", "ফ্রেমিক অ্যাডমিন")}
                </span>
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label={t("Close menu", "মেনু বন্ধ")}
                  className="fq-iconbtn grid size-10 place-items-center rounded-fq-md text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <SidebarNav groups={groups} pathname={pathname} onNavigate={() => setDrawer(false)} />
              {activeGroup && activeGroup.items.length > 1 ? (
                <ul className="border-t border-border p-3 text-[13px]">
                  {[...activeGroup.items, ...(activeGroup.more ?? [])].map((i) => (
                    <li key={i.to}>
                      <Link
                        to={i.to}
                        onClick={() => setDrawer(false)}
                        className="block min-h-9 rounded-fq-md px-2.5 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {t(i.en, i.bn)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-6xl">
            <SectionTabs group={activeGroup} pathname={pathname} />
            {children}
          </div>
        </main>
      </div>

      <CommandPalette
        open={palette.open}
        onClose={() => palette.setOpen(false)}
        groups={groups}
        can={can}
      />
    </div>
  );
}
