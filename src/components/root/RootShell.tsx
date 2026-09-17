import { useState } from "react";
import { Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Menu,
  X,
  LogOut,
  ShieldAlert,
  Bot,
  TrendingUp,
  Building2,
  CreditCard,
  Layers,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { RootCommandPalette } from "./RootCommandPalette";

type Item = {
  to: LinkProps["to"];
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
};
type Group = {
  heading: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Item[];
};

const tab =
  "flex items-center justify-between rounded-fq-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const active = "bg-primary/10 text-primary font-semibold";

/**
 * Owner console shell. Owns its own chrome end-to-end — it shares no layout,
 * navigation or header component with AdminShell, so a merchant-console change
 * can never alter what a platform owner sees (and vice versa).
 */
export function RootShell({ children }: { children: ReactNode }) {
  const { tk, t } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const aiData = qc.getQueryData<{
    counts?: { needsAgent?: number };
    aiEnabled?: boolean;
  }>(["owner-ai"]);
  const settingsData = qc.getQueryData<{ flags?: Record<string, unknown> }>([
    "owner-settings",
  ]);

  const needsAgentCount = aiData?.counts?.needsAgent ?? 0;
  const isAiDisabled = settingsData?.flags?.["ai_support_enabled"] === false;
  const isFraudDisabled =
    settingsData?.flags?.["fraud_engine_enabled"] === false;
  const isPlatformDegraded = isAiDisabled || isFraudDisabled;

  async function handleSignOut() {
    await supabase.auth.signOut();
    void navigate({ to: "/root/login", replace: true });
  }

  const groups: Group[] = [
    {
      heading: tk("owner.revenue"),
      icon: TrendingUp,
      items: [
        { to: "/root", label: tk("platform.console") },
        { to: "/root/revenue", label: tk("owner.revenue") },
        { to: "/root/plans", label: tk("platform.plans_and_limits") },
        { to: "/root/trial", label: tk("owner.trial") },
        { to: "/root/coupons", label: tk("owner.coupons") },
      ],
    },
    {
      heading: tk("platform.tenants"),
      icon: Building2,
      items: [
        { to: "/root/tenants", label: tk("platform.tenants") },
        { to: "/root/tenancy", label: tk("tenancy") },
        { to: "/root/users", label: tk("owner.users") },
      ],
    },
    {
      heading: tk("money"),
      icon: CreditCard,
      items: [
        { to: "/root/money", label: tk("money") },
        { to: "/root/payouts", label: tk("owner.payouts") },
        { to: "/root/gateway", label: tk("platform.gateway") },
      ],
    },
    {
      heading: tk("owner.fraud"),
      icon: Bot,
      items: [
        { to: "/root/fraud", label: tk("owner.fraud") },
        { to: "/root/ai", label: tk("owner.ai") },
        { to: "/root/marketing", label: tk("owner.marketing") },
      ],
    },
    {
      heading: tk("owner.ops"),
      icon: Layers,
      items: [
        { to: "/root/ops", label: tk("owner.ops") },
        { to: "/root/snapshots", label: tk("owner.snapshots") },
        { to: "/root/status", label: tk("owner.status") },
        { to: "/root/observability", label: tk("owner.observability") },
        { to: "/root/access", label: tk("owner.access") },
        { to: "/root/audit", label: tk("owner.audit") },
        { to: "/root/settings", label: tk("owner.settings") },
      ],
    },
  ];

  const renderNavLinks = () => (
    <nav aria-label={tk("platform.console")} className="space-y-4">
      {groups.map((g) => {
        const GroupIcon = g.icon;
        return (
          <div key={g.heading}>
            <p className="flex items-center gap-1.5 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <GroupIcon className="size-3.5 opacity-70" />
              <span>{g.heading}</span>
            </p>
            <div className="space-y-0.5">
              {g.items.map((l) => {
                const isAiTab = l.to === "/root/ai";
                return (
                  <Link
                    key={l.to as string}
                    to={l.to}
                    activeOptions={{ exact: l.to === "/root" }}
                    onClick={() => setMobileNavOpen(false)}
                    className={tab}
                    activeProps={{
                      className: `${tab} ${active}`,
                      "aria-current": "page",
                    }}
                  >
                    <span>{l.label}</span>
                    {isAiTab && needsAgentCount > 0 ? (
                      <span
                        id="nav-badge-ai-needs-agent"
                        className="inline-flex items-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground animate-pulse"
                        aria-label={`${needsAgentCount} conversations need attention`}
                      >
                        {needsAgentCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#root-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-fq-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        {tk("common.skip_to_content")}
      </a>

      {/* Sovereign Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label={
                mobileNavOpen ? "Close navigation" : "Open navigation"
              }
              className="flex size-8 items-center justify-center rounded-fq-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            >
              {mobileNavOpen ? (
                <X className="size-4.5" />
              ) : (
                <Menu className="size-4.5" />
              )}
            </button>

            <Link to="/root" className="flex items-center gap-2">
              <span className="rounded-fq-sm bg-destructive/10 border border-destructive/20 px-2 py-0.5 text-xs font-mono font-bold uppercase tracking-wider text-destructive">
                root
              </span>
              <h1 className="text-sm font-semibold tracking-tight text-foreground hidden sm:inline">
                {tk("platform.console")}
              </h1>
            </Link>

            {/* Platform Posture Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {isPlatformDegraded ? (
                <>
                  <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-amber-600 dark:text-amber-400">
                    {t("Degraded Posture", "ডিক্রেডেড মোড")}
                  </span>
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-emerald-500" />
                  <span>{t("All Systems Nominal", "সকল সিস্টেম সচল")}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <p className="hidden text-xs text-muted-foreground xl:block">
              {tk("owner.cross_tenant_notice")}
            </p>

            <RootCommandPalette
              destinations={groups.flatMap((g) =>
                g.items.map((i) => ({
                  to: i.to,
                  label: i.label,
                  group: g.heading,
                })),
              )}
            />

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleSignOut}
              title={t("Sign out of root console", "রুট কনসোল থেকে লগআউট")}
              className="inline-flex items-center gap-1.5 rounded-fq-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">{t("Sign Out", "লগআউট")}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-xs md:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="fixed inset-y-0 left-0 top-14 w-72 max-w-[85vw] border-r border-border bg-card p-4 overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {renderNavLinks()}
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-6 md:grid-cols-[14rem_1fr]">
        {/* Desktop Sidebar Rail */}
        <aside className="hidden md:block">
          <div className="sticky top-20">{renderNavLinks()}</div>
        </aside>

        <main id="root-main" tabIndex={-1} className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
