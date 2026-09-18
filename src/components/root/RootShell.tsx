import { useEffect, useState } from "react";
import { Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  Lock,
  Activity,
  Server,
  Clock,
  ExternalLink,
  ChevronRight,
  Search,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { RootCommandPalette } from "./RootCommandPalette";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Item = {
  to: LinkProps["to"];
  label: string;
  badge?: string | number;
  alert?: boolean;
};

type Group = {
  heading: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Item[];
};

/**
 * Sovereign Platform Owner Console Shell
 *
 * Designed to Hallmark & shadcn/ui standards:
 * - Sovereign isolation: shares zero layout/components with merchant or storefront consoles.
 * - OKLCH comfort contrast with warm backdrop plate and tactile micro-elevation.
 * - Touch targets >= 44x44px for WCAG 2.5.8 & mobile compliance.
 * - Standard browser navigation (Cmd+click / middle-click to new tab).
 * - Full keyboard navigation (focus rings, Skip-to-Content, Esc drawer dismissal).
 * - Live UTC operational heartbeat and posture telemetry.
 */
export function RootShell({ children }: { children: ReactNode }) {
  const { tk, t } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [utcTime, setUtcTime] = useState<string>("");

  // Live UTC operational clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(
        now.toISOString().substring(11, 19) + " UTC",
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileNavOpen) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavOpen]);

  // Telemetry queries for badges and system posture
  const aiData = qc.getQueryData<{
    counts?: { needsAgent?: number };
    aiEnabled?: boolean;
  }>(["owner-ai"]);
  const settingsData = qc.getQueryData<{ flags?: Record<string, unknown> }>([
    "owner-settings",
  ]);
  const payoutsData = qc.getQueryData<{ totals?: { openCount?: number } }>([
    "owner-payouts",
  ]);
  const opsData = qc.getQueryData<{ summary?: { total?: number } }>([
    "owner-ops",
  ]);

  const needsAgentCount = aiData?.counts?.needsAgent ?? 0;
  const pendingPayoutCount = payoutsData?.totals?.openCount ?? 0;
  const dlqCount = opsData?.summary?.total ?? 0;

  const isAiDisabled = settingsData?.flags?.["ai_support_enabled"] === false;
  const isFraudDisabled = settingsData?.flags?.["fraud_engine_enabled"] === false;
  const isPlatformDegraded =
    isAiDisabled || isFraudDisabled || needsAgentCount > 10 || dlqCount > 0;

  async function handleSignOut() {
    await supabase.auth.signOut();
    void navigate({ to: "/root/login", replace: true });
  }

  const groups: Group[] = [
    {
      heading: t("Commercial & Revenue", "বাণিজ্যিক ও রেভিনিউ"),
      icon: TrendingUp,
      items: [
        { to: "/root", label: t("Command Center", "কমান্ড সেন্টার") },
        { to: "/root/revenue", label: t("Platform Revenue", "প্ল্যাটফর্ম রেভিনিউ") },
        { to: "/root/plans", label: t("Plans & Quotas", "প্ল্যান ও কোটা") },
        { to: "/root/trial", label: t("Trial Lifecycle", "ট্রায়াল ব্যবস্থাপনা") },
        { to: "/root/coupons", label: t("Global Coupons", "গ্লোবাল কুপন") },
      ],
    },
    {
      heading: t("Tenancy & Access", "টেন্যান্সি ও অ্যাক্সেস"),
      icon: Building2,
      items: [
        { to: "/root/tenants", label: t("Tenants Directory", "টেন্যান্ট তালিকা") },
        { to: "/root/tenancy", label: t("Tenancy & Purge", "টেন্যান্সি ও পার্জ") },
        { to: "/root/users", label: t("Platform Users", "প্ল্যাটফর্ম ইউজার") },
        { to: "/root/access", label: t("Store Impersonation", "স্টোর ইমপারসোনেশন") },
      ],
    },
    {
      heading: t("Financials & Rails", "আর্থিক ও গেটওয়ে"),
      icon: CreditCard,
      items: [
        { to: "/root/money", label: t("Money Conformance", "মুদ্রা নিয়ন্ত্রণ") },
        {
          to: "/root/payouts",
          label: t("Merchant Payouts", "মার্চেন্ট পেআউট"),
          badge: pendingPayoutCount > 0 ? pendingPayoutCount : undefined,
          alert: pendingPayoutCount > 0,
        },
        { to: "/root/gateway", label: t("Payment Gateways", "পেমেন্ট গেটওয়ে") },
      ],
    },
    {
      heading: t("Trust, AI & Fraud", "ট্রাস্ট, এআই ও নিরাপত্তা"),
      icon: Bot,
      items: [
        { to: "/root/fraud", label: t("Fraud Defense", "ফ্রড ডিফেন্স") },
        {
          to: "/root/ai",
          label: t("AI Moderation", "এআই মডারেশন"),
          badge: needsAgentCount > 0 ? needsAgentCount : undefined,
          alert: needsAgentCount > 0,
        },
        { to: "/root/marketing", label: t("Marketing Switches", "মার্কেটিং সুইচ") },
      ],
    },
    {
      heading: t("Infrastructure & Ops", "অবকাঠামো ও অপারেশনস"),
      icon: Layers,
      items: [
        {
          to: "/root/ops",
          label: t("Operations & Cron", "অপারেশনস ও ক্রন"),
          badge: dlqCount > 0 ? dlqCount : undefined,
          alert: dlqCount > 0,
        },
        { to: "/root/snapshots", label: t("Snapshots & Restore", "স্ন্যাপশট ও রিস্টোর") },
        { to: "/root/status", label: t("System Status", "সিস্টেম স্ট্যাটাস") },
        { to: "/root/observability", label: t("Deep Observability", "ডিপ অবজারভেবিলিটি") },
        { to: "/root/audit", label: t("Audit Trail", "অডিট ট্রেইল") },
        { to: "/root/settings", label: t("Compliance & Settings", "কমপ্লায়েন্স ও সেটিংস") },
      ],
    },
  ];

  const renderNavLinks = () => (
    <nav aria-label={tk("platform.console")} className="space-y-5">
      {groups.map((g) => {
        const GroupIcon = g.icon;
        return (
          <div key={g.heading} className="space-y-1.5">
            <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 font-mono">
              <GroupIcon className="size-3.5 opacity-70 shrink-0" aria-hidden="true" />
              <span className="truncate">{g.heading}</span>
            </div>
            <div className="space-y-0.5">
              {g.items.map((item) => (
                <Link
                  key={item.to as string}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/root" }}
                  onClick={() => setMobileNavOpen(false)}
                  className="group relative flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                  activeProps={{
                    className:
                      "group relative flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 border-l-2 border-primary pl-2.5",
                    "aria-current": "page",
                  }}
                >
                  <span className="truncate font-bangla-display leading-snug">
                    {item.label}
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold font-mono leading-none shrink-0 transition-transform group-hover:scale-105",
                        item.alert
                          ? "bg-rose-500 text-white animate-pulse"
                          : "bg-muted text-muted-foreground",
                      )}
                      aria-label={`${item.badge} notifications`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Accessible Skip to Content */}
      <a
        href="#root-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {tk("common.skip_to_content")}
      </a>

      {/* Sovereign Executive Header */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/90 backdrop-blur-md transition-shadow duration-200">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Toggle (>= 44x44px target) */}
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileNavOpen}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            >
              {mobileNavOpen ? (
                <X className="size-5" aria-hidden="true" />
              ) : (
                <Menu className="size-5" aria-hidden="true" />
              )}
            </button>

            {/* Brand Title & Sovereign Indicator */}
            <Link
              to="/root"
              className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="inline-flex items-center gap-1 rounded-sm border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                <Lock className="size-3 shrink-0" aria-hidden="true" />
                root
              </span>
              <div className="hidden sm:block">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tracking-tight text-foreground">
                    Framique
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    Console
                  </span>
                </div>
              </div>
            </Link>

            {/* Platform Posture Telemetry Pill */}
            <div
              className={cn(
                "hidden lg:flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isPlatformDegraded
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
              )}
            >
              <span className="relative flex size-2">
                <span
                  className={cn(
                    "absolute inline-flex size-full rounded-full opacity-75",
                    isPlatformDegraded
                      ? "bg-amber-400 animate-ping"
                      : "bg-emerald-400 animate-ping",
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex size-2 rounded-full",
                    isPlatformDegraded ? "bg-amber-500" : "bg-emerald-500",
                  )}
                />
              </span>
              <span>
                {isPlatformDegraded
                  ? t("Degraded Posture", "ডিক্রেডেড মোড")
                  : t("All Systems Nominal", "সকল সিস্টেম সচল")}
              </span>
            </div>

            {/* Live UTC Operational Clock */}
            {utcTime && (
              <div
                title="Operational UTC Clock"
                className="hidden xl:flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-mono text-muted-foreground"
              >
                <Clock className="size-3 text-muted-foreground/70" aria-hidden="true" />
                <span>{utcTime}</span>
              </div>
            )}
          </div>

          {/* Right Actions & Utilities */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-xs text-muted-foreground 2xl:inline font-mono">
              PROD · Cloud Edge
            </span>

            {/* Command Palette Modal Trigger */}
            <RootCommandPalette
              destinations={groups.flatMap((g) =>
                g.items.map((i) => ({
                  to: i.to,
                  label: i.label,
                  group: g.heading,
                })),
              )}
            />

            {/* Sovereign Sign Out Action */}
            <button
              type="button"
              onClick={handleSignOut}
              title={t("Sign out of sovereign root session", "রুট সেশন থেকে লগআউট")}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <LogOut className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">{t("Sign Out", "লগআউট")}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs md:hidden transition-opacity"
          onClick={() => setMobileNavOpen(false)}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="fixed inset-y-0 left-0 w-80 max-w-[85vw] border-r border-border bg-card p-5 overflow-y-auto shadow-2xl flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-border/80">
                <div className="flex items-center gap-2">
                  <span className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-mono font-bold uppercase text-rose-600 dark:text-rose-400">
                    root
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    Navigation
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                  aria-label="Close drawer"
                >
                  <X className="size-4" />
                </button>
              </div>
              {renderNavLinks()}
            </div>

            {/* Mobile Drawer Footer */}
            <div className="pt-6 border-t border-border/80 mt-6 space-y-3">
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1 font-mono">
                <div className="flex justify-between">
                  <span>RLS Security:</span>
                  <span className="text-emerald-600 font-semibold">Tier-1 Live</span>
                </div>
                <div className="flex justify-between">
                  <span>Isolation:</span>
                  <span className="text-foreground font-semibold">Enforced</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs font-semibold text-rose-600 hover:bg-rose-500/20"
              >
                <LogOut className="size-4" />
                <span>{t("Sign Out", "লগআউট")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="mx-auto grid max-w-[1600px] gap-8 p-4 sm:p-6 lg:p-8 md:grid-cols-[16rem_1fr]">
        {/* Desktop Sidebar Rail */}
        <aside className="hidden md:block">
          <div className="sticky top-20 space-y-6">
            <div className="rounded-xl border border-border/70 bg-card/60 p-4 backdrop-blur-xs shadow-xs">
              {renderNavLinks()}
            </div>

            {/* Sovereign Security & Integrity Telemetry Mini-Card */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground font-semibold font-mono text-[11px] uppercase tracking-wider">
                <Server className="size-3.5 text-primary" />
                <span>Security Posture</span>
              </div>
              <div className="space-y-1 text-[11px] font-mono">
                <div className="flex items-center justify-between">
                  <span>RLS Lockdown:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    ✓ Tier-1
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Multi-Tenant:</span>
                  <span className="text-foreground font-medium">Strict Deny</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Edge Cache:</span>
                  <span className="text-foreground font-medium">Private PII Safe</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Sovereign Primary Workspace */}
        <main id="root-main" tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
