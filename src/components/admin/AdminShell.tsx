import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { BrandLogo } from "@/components/public/BrandLogo";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/admin/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ADMIN_NAV,
  filterNav,
  type IconKey,
  type NavGroup,
} from "@/lib/console-nav";
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
  return to === "/dashboard"
    ? pathname === "/dashboard"
    : pathname === to || pathname.startsWith(`${to}/`);
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
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});

  const toggleSection = (key: string, defaultOpen: boolean) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: prev[key] !== undefined ? !prev[key] : !defaultOpen,
    }));
  };

  return (
    <nav
      aria-label="Admin"
      className={`flex-1 space-y-1 overflow-y-auto ${collapsed ? "px-2 py-3 overflow-visible" : "p-3"}`}
    >
      {groups.map((g) => {
        const GroupIcon = ICONS[g.icon] ?? LayoutDashboard;
        const groupActive = g.items.some((i) => isActive(pathname, i.to));
        const target = g.to ?? g.items[0]?.to ?? "/dashboard";
        const label = t(g.en, g.bn);
        const hasSubmenu = g.items.length > 1;
        const isOpen = expandedSections[g.key] ?? groupActive;

        if (collapsed) {
          return (
            <div
              key={g.key}
              className="relative"
              onMouseEnter={() => setHoveredGroup(g.key)}
              onMouseLeave={() => setHoveredGroup(null)}
              onFocus={() => setHoveredGroup(g.key)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setHoveredGroup(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setHoveredGroup(null);
              }}
            >
              <Link
                to={target}
                onClick={onNavigate}
                title={label}
                aria-label={label}
                aria-current={groupActive ? "page" : undefined}
                className={`flex size-9 items-center justify-center rounded-fq-md text-[13px] font-medium transition-colors duration-150 ${
                  groupActive
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
                }`}
              >
                <GroupIcon
                  className={`size-4 shrink-0 ${groupActive ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden
                />
              </Link>

              {/* WordPress #adminmenu flyout submenu on rail hover */}
              {hoveredGroup === g.key && hasSubmenu && (
                <div
                  role="menu"
                  aria-label={label}
                  className="absolute left-full top-0 ml-2 z-50 min-w-[190px] rounded-fq-md border border-border bg-popover py-1.5 shadow-xl animate-in fade-in-0 zoom-in-95"
                >
                  <div className="border-b border-border px-3 py-1.5 text-xs font-semibold text-foreground">
                    {label}
                  </div>
                  <div className="py-1">
                    {g.items.map((sub) => {
                      const subActive = isActive(pathname, sub.to);
                      return (
                        <Link
                          key={sub.to}
                          to={sub.to}
                          search={sub.search}
                          onClick={() => {
                            setHoveredGroup(null);
                            onNavigate?.();
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                            subActive
                              ? "bg-primary/10 font-semibold text-primary"
                              : "text-foreground/80 hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              subActive
                                ? "bg-primary"
                                : "bg-muted-foreground/40"
                            }`}
                          />
                          <span className="truncate">{t(sub.en, sub.bn)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        }

        // Expanded sidebar: WordPress collapsible accordion navigation
        return (
          <div key={g.key} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <Link
                to={target}
                onClick={onNavigate}
                aria-current={groupActive ? "page" : undefined}
                className={`flex flex-1 min-h-9 items-center gap-3 rounded-fq-md px-2.5 text-[13px] font-medium transition-colors duration-150 ${
                  groupActive
                    ? "bg-primary/10 text-foreground font-semibold"
                    : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
                }`}
              >
                <GroupIcon
                  className={`size-4 shrink-0 ${groupActive ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden
                />
                <span className="truncate">{label}</span>
              </Link>
              {hasSubmenu && (
                <button
                  type="button"
                  onClick={() => toggleSection(g.key, groupActive)}
                  aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
                  className="flex size-8 items-center justify-center rounded-fq-sm text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground cursor-pointer"
                >
                  <ChevronDown
                    className={`size-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
              )}
            </div>

            {/* Collapsible Accordion Submenu */}
            {hasSubmenu && isOpen && (
              <div className="ml-5 space-y-0.5 border-l border-border/60 pl-2.5 py-0.5 animate-in fade-in-0 duration-150">
                {g.items.map((sub) => {
                  const subActive = isActive(pathname, sub.to);
                  return (
                    <Link
                      key={sub.to}
                      to={sub.to}
                      search={sub.search}
                      onClick={onNavigate}
                      className={`flex min-h-7 items-center gap-2 rounded-fq-sm px-2 text-xs transition-colors duration-150 ${
                        subActive
                          ? "bg-primary/10 font-semibold text-primary"
                          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`size-1 rounded-full ${
                          subActive ? "bg-primary" : "bg-muted-foreground/40"
                        }`}
                      />
                      <span className="truncate">{t(sub.en, sub.bn)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function MoreMenu({
  more,
  pathname,
  t,
  moreActive,
  activeRef,
}: {
  more: NavGroup["more"];
  pathname: string;
  t: (en: string, bn: string) => string;
  moreActive: boolean;
  activeRef?: React.MutableRefObject<HTMLElement | null>;
}) {
  if (!more || more.length === 0) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          ref={
            moreActive
              ? (el) => {
                  if (el && activeRef) activeRef.current = el;
                }
              : undefined
          }
          type="button"
          aria-label={t("More", "আরও")}
          className={`inline-flex min-h-9 sm:min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-fq-md px-3 sm:px-2.5 py-1.5 text-[13px] font-medium transition-colors select-none touch-manipulation cursor-pointer active:scale-95 ${
            moreActive
              ? "bg-foreground/[0.07] font-semibold text-foreground shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted"
          }`}
        >
          <span>{t("More", "আরও")}</span>
          <ChevronDown className="size-3.5 opacity-75" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="fq-admin z-50 min-w-48 max-w-[calc(100vw-2rem)] rounded-fq-lg border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-md"
      >
        {more.map((i) => {
          const active = isActive(pathname, i.to);
          return (
            <DropdownMenuItem key={i.to} asChild className="cursor-pointer">
              <Link
                to={i.to}
                search={i.search}
                className={`flex min-h-9 sm:min-h-8 w-full items-center rounded-fq-md px-3 py-2 text-[13px] transition-colors select-none touch-manipulation ${
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground/80 hover:bg-muted hover:text-foreground active:bg-muted"
                }`}
              >
                {t(i.en, i.bn)}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sub-pages of the active section, rendered as page tabs (Polaris pattern). */
function SectionTabs({
  group,
  pathname,
}: {
  group: NavGroup | undefined;
  pathname: string;
}) {
  const { t } = useLang();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLElement | null>(null);

  // Auto-scroll the active tab or "More" button into view on mount or route transition
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [pathname]);

  if (!group || group.items.length < 2) return null;
  const more = group.more ?? [];
  const moreActive = more.some((i) => isActive(pathname, i.to));

  return (
    <div className="sticky top-14 z-20 -mx-4 mb-4 bg-background/95 backdrop-blur sm:-mx-6">
      <div className="flex items-center px-4 sm:px-6">
        {/* Scrollable primary tabs */}
        <div
          ref={scrollRef}
          className="flex min-w-0 flex-1 items-center overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <nav
            aria-label={group.en}
            className="inline-flex gap-1 rounded-fq-lg border border-border bg-card p-1 shadow-xs"
          >
            {group.items.map((i) => {
              const active = isActive(pathname, i.to);
              return (
                <Link
                  key={i.to}
                  ref={
                    active
                      ? (el) => {
                          if (el) activeRef.current = el;
                        }
                      : undefined
                  }
                  to={i.to}
                  search={i.search}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-9 sm:min-h-8 shrink-0 items-center whitespace-nowrap rounded-fq-md px-3.5 sm:px-3 py-1.5 text-[13px] font-medium transition-colors select-none touch-manipulation cursor-pointer ${
                    active
                      ? "bg-foreground/[0.07] font-semibold text-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted"
                  }`}
                >
                  <span className="font-bangla-display">{t(i.en, i.bn)}</span>
                </Link>
              );
            })}

            {/* Desktop: More button is inline inside the nav pill */}
            {more.length > 0 ? (
              <div className="hidden sm:block">
                <MoreMenu
                  more={more}
                  pathname={pathname}
                  t={t}
                  moreActive={moreActive}
                  activeRef={activeRef}
                />
              </div>
            ) : null}
          </nav>
        </div>

        {/* Mobile: More button is pinned on the right so it is ALWAYS visible & immediately clickable */}
        {more.length > 0 ? (
          <div className="ml-2 shrink-0 sm:hidden">
            <div className="rounded-fq-lg border border-border bg-card p-1 shadow-xs">
              <MoreMenu
                more={more}
                pathname={pathname}
                t={t}
                moreActive={moreActive}
                activeRef={activeRef}
              />
            </div>
          </div>
        ) : null}
      </div>
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
    // Safety guard: ensure no stray pointer-events or scroll-lock blocks interaction
    if (typeof document !== "undefined") {
      const unlock = () => {
        const hasActiveModal = document.querySelector(
          '[role="dialog"][data-state="open"]',
        );
        if (!hasActiveModal) {
          if (document.body.style.pointerEvents === "none") {
            document.body.style.pointerEvents = "";
          }
          if (document.body.hasAttribute("data-scroll-locked")) {
            document.body.removeAttribute("data-scroll-locked");
          }
        }
      };
      unlock();
      const timer = setTimeout(unlock, 100);
      return () => clearTimeout(timer);
    }
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
                <ChevronDown
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
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
                            <span className="ml-2 text-[10px] text-primary">
                              ✓
                            </span>
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
            <span className="truncate">
              {t("Search anything", "যেকোনো কিছু খুঁজুন")}
            </span>
            <kbd className="ml-auto rounded border border-border px-1 text-[10px]">
              ⌘K
            </kbd>
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
          <SidebarNav
            groups={groups}
            pathname={pathname}
            collapsed={collapsed}
          />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            title={
              collapsed
                ? t("Expand sidebar", "সাইডবার বড় করুন")
                : t("Collapse sidebar", "সাইডবার ছোট করুন")
            }
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
              {collapsed
                ? t("Expand sidebar", "সাইডবার বড় করুন")
                : t("Collapse sidebar", "সাইডবার ছোট করুন")}
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
              <SidebarNav
                groups={groups}
                pathname={pathname}
                onNavigate={() => setDrawer(false)}
              />
              {activeGroup && activeGroup.items.length > 1 ? (
                <ul className="border-t border-border p-3 text-[13px]">
                  {[...activeGroup.items, ...(activeGroup.more ?? [])].map(
                    (i) => (
                      <li key={i.to}>
                        <Link
                          to={i.to}
                          search={i.search}
                          onClick={() => setDrawer(false)}
                          className="block min-h-9 rounded-fq-md px-2.5 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {t(i.en, i.bn)}
                        </Link>
                      </li>
                    ),
                  )}
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
