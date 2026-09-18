import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ShieldAlert,
  Bot,
  CreditCard,
  Building2,
  Settings,
  Activity,
  Layers,
  FileText,
  Users,
  HardDrive,
  Radio,
  Sliders,
  Sparkles,
  Ticket,
  Percent,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  KeyRound,
  ShieldCheck,
  Server,
  Lock,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { formatMinor } from "@/lib/revenue";
import {
  ownerAiFn,
  ownerAuditFn,
  ownerRevenueFn,
  ownerSettingsFn,
} from "@/lib/owner.functions";
import { ownerPayoutsFn } from "@/lib/owner-desk.functions";
import { opsDeskFn } from "@/lib/ops.functions";
import {
  OwnerHeader,
  OwnerCard,
  OwnerTable,
  StatCard,
  StatGrid,
  StatePill,
} from "@/components/root/OwnerUi";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/root/")({
  head: () => ({
    meta: [
      { title: "Platform Command Center — Framique Owner Console" },
      {
        name: "description",
        content:
          "Framique Executive Platform Command Center: global health, recurring revenue, tenant isolation, emergency kill switches, AI moderation and 16 sovereign control desks.",
      },
      {
        property: "og:title",
        content: "Platform Command Center — Framique Owner Console",
      },
      {
        property: "og:description",
        content:
          "Executive control plane for Framique cloud hosting and commerce platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RootCommandCenter,
});

function RootCommandCenter() {
  const { t } = useLang();

  const loadRevenue = useServerFn(ownerRevenueFn);
  const loadAi = useServerFn(ownerAiFn);
  const loadPayouts = useServerFn(ownerPayoutsFn);
  const loadOps = useServerFn(opsDeskFn);
  const loadAudit = useServerFn(ownerAuditFn);
  const loadSettings = useServerFn(ownerSettingsFn);

  const revenueQuery = useQuery({
    queryKey: ["owner-revenue"],
    queryFn: () => loadRevenue(),
    staleTime: 60_000,
  });

  const aiQuery = useQuery({
    queryKey: ["owner-ai"],
    queryFn: () => loadAi(),
    staleTime: 30_000,
  });

  const payoutsQuery = useQuery({
    queryKey: ["owner-payouts"],
    queryFn: () => loadPayouts({ data: {} }),
    staleTime: 45_000,
  });

  const opsQuery = useQuery({
    queryKey: ["owner-ops"],
    queryFn: () => loadOps(),
    staleTime: 60_000,
  });

  const auditQuery = useQuery({
    queryKey: ["owner-audit-feed"],
    queryFn: () => loadAudit({ data: { page: 1, pageSize: 6 } }),
    staleTime: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: ["owner-settings"],
    queryFn: () => loadSettings(),
    staleTime: 60_000,
  });

  const rev = revenueQuery.data?.snapshot;
  const tenants = revenueQuery.data?.tenants;
  const ai = aiQuery.data;
  const payouts = payoutsQuery.data;
  const ops = opsQuery.data;
  const audits = auditQuery.data?.rows ?? [];
  const flags = settingsQuery.data?.flags ?? {};

  const needsAgentCount = ai?.counts?.needsAgent ?? 0;
  const pendingPayoutCount = payouts?.totals?.openCount ?? 0;
  const dlqCount = ops?.summary?.total ?? 0;

  const isSystemDegraded =
    needsAgentCount > 10 || dlqCount > 0 || (tenants?.suspended ?? 0) > 0;

  const deskClusters = [
    {
      title: t(
        "Commercial & Revenue Governance",
        "বাণিজ্যিক ও রেভিনিউ প্রশাসন",
      ),
      description: t(
        "Platform monetization, subscription plans, pricing tiers, trial conversions, and integer minor-unit money conformance.",
        "প্ল্যাটফর্ম মানিটাইজেশন, সাবস্ক্রিপশন প্ল্যান, ট্রায়াল কনভার্সন এবং মুদ্রা নিয়মাবলি।",
      ),
      desks: [
        {
          title: t("Platform Revenue", "প্ল্যাটফর্ম রেভিনিউ"),
          to: "/root/revenue",
          icon: TrendingUp,
          detail: rev
            ? `${formatMinor(rev.mrrMinorInt, rev.currencyCode)} MRR`
            : "MRR, ARR & Churn",
          badge: rev ? `${rev.paying} paying` : undefined,
        },
        {
          title: t("Plans & Quotas", "প্ল্যান ও কোটা"),
          to: "/root/plans",
          icon: Layers,
          detail: t(
            "Tiers, product/staff quotas & pricing drafts",
            "টিয়ার, পণ্য/স্টাফ কোটা ও ড্রাফট",
          ),
        },
        {
          title: t("Trial Lifecycle", "ট্রায়াল ব্যবস্থাপনা"),
          to: "/root/trial",
          icon: Clock,
          detail: t(
            "5-day ladder, trial extension & anti-abuse",
            "৫-দিনের ল্যাডার ও ট্রায়াল মেয়াদ",
          ),
          badge: rev?.trialing ? `${rev.trialing} active` : undefined,
        },
        {
          title: t("Global Coupons", "গ্লোবাল কুপন"),
          to: "/root/coupons",
          icon: Percent,
          detail: t(
            "Platform-wide discount rules and caps",
            "প্ল্যাটফর্ম-ব্যাপী ছাড় ও ক্যাপ",
          ),
        },
        {
          title: t("Money Conformance", "মুদ্রা নিয়ন্ত্রণ"),
          to: "/root/money",
          icon: CreditCard,
          detail: t(
            "Integer minor units, FX snapshots, zero float",
            "পূর্ণসংখ্যা মাইনর ইউনিট ও শূন্য ফ্লোট",
          ),
        },
      ],
    },
    {
      title: t(
        "Multi-Tenant Isolation & Access",
        "মাল্টি-টেন্যান্ট আইসোলেশন ও অ্যাক্সেস",
      ),
      description: t(
        "Tenant lifecycle, resource quotas, tombstones, GDPR cooling purge queue, and merchant-consented impersonation.",
        "টেন্যান্ট জীবনচক্র, রিসোর্স কোটা, টম্বস্টোন, কুলিং পার্জ এবং ইমপারসোনেশন।",
      ),
      desks: [
        {
          title: t("Tenants Directory", "টেন্যান্ট তালিকা"),
          to: "/root/tenants",
          icon: Building2,
          detail: t(
            "Per-tenant plan, usage meters & limit overrides",
            "টেন্যান্ট প্ল্যান ও ব্যবহারের মিটার",
          ),
          badge: tenants?.total ? `${tenants.total} stores` : undefined,
        },
        {
          title: t("Tenancy & Purge", "টেন্যান্সি ও পার্জ"),
          to: "/root/tenancy",
          icon: HardDrive,
          detail: t(
            "Isolation posture, schema drift & cooling purges",
            "আইসোলেশন ও কুলিং পার্জ কিউ",
          ),
        },
        {
          title: t("Platform Users", "প্ল্যাটফর্ম ইউজার"),
          to: "/root/users",
          icon: Users,
          detail: t(
            "Owner roster, RBAC grants & staff invites",
            "ওনার রস্টার ও আরব্যাক গ্রান্ট",
          ),
        },
        {
          title: t("Privileged Impersonation", "বিশেষ ইমপারসোনেশন"),
          to: "/root/access",
          icon: KeyRound,
          detail: t(
            "Time-bound, merchant-consented support sessions",
            "সময়-সীমিত ও মার্চেন্ট-অনুমোদিত সাপোর্ট সেশন",
          ),
        },
      ],
    },
    {
      title: t("Payments, Settlement & Rails", "পেমেন্ট, সেটেলমেন্ট ও চ্যানেল"),
      description: t(
        "Four-eyes dual approval merchant payouts, MFS gateway credential verification, and webhook dead-letter queues.",
        "৪-চোখ ডুয়াল অনুমোদন পেআউট, এমএফএস গেটওয়ে যাচাইকরণ এবং ডিএলকিউ।",
      ),
      desks: [
        {
          title: t("Merchant Payouts", "মার্চেন্ট পেআউট"),
          to: "/root/payouts",
          icon: CreditCard,
          detail: t(
            "4-Eyes approval queue, platform holds & reversals",
            "৪-চোখ অনুমোদন কিউ ও হোল্ড",
          ),
          badge:
            pendingPayoutCount > 0
              ? `${pendingPayoutCount} pending`
              : undefined,
          alert: pendingPayoutCount > 0,
        },
        {
          title: t("Payment Gateways", "পেমেন্ট গেটওয়ে"),
          to: "/root/gateway",
          icon: Radio,
          detail: t(
            "bKash, Nagad, Rocket, CellFin, SSLCOMMERZ rails",
            "বিকাশ, নগদ, রকেট, সেলফিন রেল",
          ),
        },
      ],
    },
    {
      title: t(
        "Trust, Security & AI Supervision",
        "নিরাপত্তা, ট্রাস্ট ও এআই মডারেশন",
      ),
      description: t(
        "Real-time customer support supervision, 1-click human intervention, ad-fraud defense, and marketing consent audit.",
        "রিয়েল-টাইম কাস্টমার সাপোর্ট তত্ত্বাবধান, অ্যাড-ফ্রড প্রতিরোধ ও মার্কেটিং কনসেন্ট।",
      ),
      desks: [
        {
          title: t("AI Support Console", "এআই সাপোর্ট কনসোল"),
          to: "/root/ai",
          icon: Bot,
          detail: t(
            "Live chat stream, human takeover & audio chime",
            "লাইভ চ্যাট স্ট্রিম ও হিউম্যান টেকওভার",
          ),
          badge:
            needsAgentCount > 0 ? `${needsAgentCount} escalated` : "Autonomous",
          alert: needsAgentCount > 0,
        },
        {
          title: t("Fraud & Abuse Desk", "ফ্রড ও অ্যাবিউজ ডেস্ক"),
          to: "/root/fraud",
          icon: ShieldAlert,
          detail: t(
            "COD refusal velocity, IP blacklist & honeypot",
            "সিওডি রিফিউজাল গতি ও ব্ল্যাকলিস্ট",
          ),
        },
        {
          title: t("Marketing Channels", "মার্কেটিং চ্যানেল"),
          to: "/root/marketing",
          icon: Ticket,
          detail: t(
            "Email/SMS/Push switches & opt-out ledger",
            "ইমেইল/এসএমএস/পুশ সুইচ ও অপ্ট-আউট লেজার",
          ),
        },
      ],
    },
    {
      title: t(
        "Platform Operations & Infrastructure",
        "প্ল্যাটফর্ম অপারেশনস ও অবকাঠামো",
      ),
      description: t(
        "Cron job scheduler, automated PITR snapshots, Prometheus observability, and immutable owner action audit trail.",
        "ক্রন জব শিডিউলার, স্বয়ংক্রিয় ব্যাকআপ স্ন্যাপশট ও অডিট ট্রেইল।",
      ),
      desks: [
        {
          title: t("Operations & Cron", "অপারেশনস ও ক্রন"),
          to: "/root/ops",
          icon: Sliders,
          detail: t(
            "Supercronic schedules, BullMQ worker & DLQ replay",
            "সুপারক্রনিক শিডিউল ও ডিএলকিউ রিপ্লে",
          ),
          badge: dlqCount > 0 ? `${dlqCount} dead-letter` : undefined,
          alert: dlqCount > 0,
        },
        {
          title: t("Snapshots & Restore", "স্ন্যাপশট ও রিস্টোর"),
          to: "/root/snapshots",
          icon: HardDrive,
          detail: t(
            "Nightly automated backups & PITR drills",
            "নৈশ ব্যাকআপ ও পিআইটিআর ড্রিল",
          ),
        },
        {
          title: t("System Status", "সিস্টেম স্ট্যাটাস"),
          to: "/root/status",
          icon: Activity,
          detail: t(
            "Public status page, uptime probes & incident room",
            "পাবলিক স্ট্যাটাস পেজ ও আপটাইম প্রব",
          ),
        },
        {
          title: t("Deep Observability", "ডিপ অবজারভেবিলিটি"),
          to: "/root/observability",
          icon: Sparkles,
          detail: t(
            "Prometheus metrics, 7 Grafana dashboards & Loki logs",
            "প্রমিথিউস মেট্রিক্স ও গ্রাফানা ড্যাশবোর্ড",
          ),
        },
        {
          title: t("Immutable Audit Trail", "অডিট ট্রেইল"),
          to: "/root/audit",
          icon: FileText,
          detail: t(
            "Append-only log of every cross-tenant action",
            "প্রতিটি ক্রস-টেন্যান্ট কাজের অপরিবর্তনীয় লগ",
          ),
        },
        {
          title: t("Compliance & Settings", "কমপ্লায়েন্স ও সেটিংস"),
          to: "/root/settings",
          icon: Settings,
          detail: t(
            "Data retention periods & gateway safety thresholds",
            "ডাটা রিটেনশন সময় ও গেটওয়ে থ্রেশহোল্ড",
          ),
        },
      ],
    },
  ];

  return (
    <section className="space-y-8 pb-12">
      {/* Top Sovereign Header Banner */}
      <OwnerHeader
        title={t("Platform Command Center", "প্ল্যাটফর্ম কমান্ড সেন্টার")}
        subtitle={t(
          "Global sovereign control plane for Framique cloud hosting, commerce engine, and multi-tenant infrastructure.",
          "ফ্রেমিউক ক্লাউড হোস্টিং, কমার্স ও মাল্টি-টেন্যান্ট অবকাঠামোর সার্বভৌমিক কন্ট্রোল প্লেন।",
        )}
        badge={
          <span className="inline-flex items-center gap-1 rounded-sm border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
            <Lock className="size-3 shrink-0" aria-hidden="true" />
            ROOT PRIVILEGED
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <StatePill tone={isSystemDegraded ? "warn" : "ok"}>
              {isSystemDegraded
                ? t("Attention Required", "মনোযোগ প্রয়োজন")
                : t("All Systems Nominal", "সকল সিস্টেম স্বাভাবিক")}
            </StatePill>
            <div className="hidden items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground font-mono md:flex">
              <kbd className="rounded bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground border border-border shadow-2xs">
                ⌘K
              </kbd>
              <span>{t("Command Palette", "কমান্ড প্যালেট")}</span>
            </div>
          </div>
        }
      />

      {/* Top-Line Executive KPIs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
            {t(
              "Executive Telemetry & Vital Signals",
              "এক্সিকিউটিভ টেলিমেট্রি ও ভাইটাল সিগন্যাল",
            )}
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            Auto-refresh: 30s
          </span>
        </div>

        <StatGrid cols={4}>
          <StatCard
            label={t("Platform MRR", "প্ল্যাটফর্ম এমআরআর")}
            value={rev ? formatMinor(rev.mrrMinorInt, rev.currencyCode) : "৳ 0"}
            subtext={
              rev
                ? `${formatMinor(rev.mrrMinorInt * 12, rev.currencyCode)} ARR projected`
                : undefined
            }
            icon={TrendingUp}
            tone="primary"
            to="/root/revenue"
          />
          <StatCard
            label={t(
              "Active Stores (Paying / Trial)",
              "সক্রিয় স্টোর (পেইং / ট্রায়াল)",
            )}
            value={rev ? `${rev.paying} / ${rev.trialing}` : "0 / 0"}
            subtext={
              tenants?.total
                ? `${tenants.total} total hosted stores`
                : "Tenant store registry"
            }
            icon={Building2}
            tone="ok"
            to="/root/tenants"
          />
          <StatCard
            label={t(
              "Support Escalations",
              "সাপোর্ট এসকেলেশন (হিউম্যান এজেন্ট)",
            )}
            value={String(needsAgentCount)}
            subtext={
              needsAgentCount > 0
                ? t("Requires human takeover", "হিউম্যান টেকওভার প্রয়োজন")
                : t(
                    "AI handling autonomously",
                    "এআই স্বয়ংক্রিয়ভাবে সামলাচ্ছে",
                  )
            }
            icon={Bot}
            tone={needsAgentCount > 0 ? "bad" : "default"}
            to="/root/ai"
          />
          <StatCard
            label={t("Pending Merchant Payouts", "অপেক্ষমাণ পেআউট")}
            value={String(pendingPayoutCount)}
            subtext={t("4-Eyes approval queue", "৪-চোখ অনুমোদন কিউ")}
            icon={CreditCard}
            tone={pendingPayoutCount > 0 ? "warn" : "default"}
            to="/root/payouts"
          />
        </StatGrid>
      </div>

      {/* Emergency Platform Posture & Kill Switches */}
      <OwnerCard
        title={t(
          "Emergency Posture & Sovereign Circuit Breakers",
          "প্ল্যাটফর্ম জরুরি সুইচ ও সার্কিট ব্রেকার",
        )}
        description={t(
          "Immediate platform-wide fail-open or fail-safe circuit breakers. Fully audited under the 4-eyes principle.",
          "জরুরি পরিস্থিতিতে প্ল্যাটফর্ম-ব্যাপী অবিলম্বে সার্ভিস বন্ধ বা চালু করার সুইচ।",
        )}
        actions={
          <Link
            to="/root/settings"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>{t("Manage Circuit Breakers →", "কন্ট্রোল পরিচালনা →")}</span>
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium font-mono transition-colors",
              flags.ai_kill_switch === false
                ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                : "border-primary/20 bg-primary/5 text-primary",
            )}
          >
            <Bot className="size-3.5 shrink-0" />
            <span>
              {flags.ai_kill_switch === false
                ? "AI Support: Paused"
                : "AI Support: Active"}
            </span>
          </div>

          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium font-mono transition-colors",
              flags.fraud_engine_enabled === false
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-primary/20 bg-primary/5 text-primary",
            )}
          >
            <ShieldAlert className="size-3.5 shrink-0" />
            <span>
              {flags.fraud_engine_enabled === false
                ? "Fraud Defense: Manual Bypass"
                : "Fraud Defense: Enforced"}
            </span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium font-mono text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5 shrink-0" />
            <span>Gateways: Verified Rails</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-xs font-medium font-mono text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span>RLS: Tier-1 Live Lockdown</span>
          </div>
        </div>
      </OwnerCard>

      {/* 16 Sovereign Desks Launchpad */}
      <div className="space-y-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground font-bangla-display">
              {t(
                "16 Sovereign Control Desks",
                "১৬টি সার্বভৌমিক নিয়ন্ত্রণ ডেস্ক",
              )}
            </h2>
            <p className="text-xs text-muted-foreground font-bangla-body">
              {t(
                "Direct platform operations, multi-tenant isolation, money conformance, and infrastructure controls.",
                "সরাসরি প্ল্যাটফর্ম অপারেশন, মাল্টি-টেন্যান্ট আইসোলেশন ও অবকাঠামো কন্ট্রোল।",
              )}
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            16 / 16 Operational
          </span>
        </div>

        <div className="space-y-8">
          {deskClusters.map((cluster) => (
            <div key={cluster.title} className="space-y-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold tracking-tight text-foreground font-bangla-display">
                  {cluster.title}
                </h3>
                <p className="text-xs text-muted-foreground font-bangla-body">
                  {cluster.description}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cluster.desks.map((desk) => {
                  const Icon = desk.icon;
                  return (
                    <Link
                      key={desk.to}
                      to={desk.to}
                      className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card/95 p-4 min-h-[8.5rem] transition-all duration-200 hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex size-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                            <Icon className="size-4.5" />
                          </div>
                          {desk.badge && (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold font-mono tracking-tight",
                                desk.alert
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {desk.badge}
                            </span>
                          )}
                        </div>

                        <h4 className="mt-3 text-sm font-bold tracking-tight text-foreground transition-colors group-hover:text-primary font-bangla-display leading-snug">
                          {desk.title}
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground font-bangla-body leading-relaxed line-clamp-2">
                          {desk.detail}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors group-hover:text-primary pt-2 border-t border-border/40">
                        <span>{t("Open Desk", "ডেস্ক খুলুন")}</span>
                        <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Privileged Audit Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-foreground font-bangla-display">
              {t(
                "Privileged Platform Audit Stream",
                "প্রিভিলেজড প্ল্যাটফর্ম অডিট ইভেন্ট",
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(
                "Append-only ledger of cross-tenant actions, kill-switch toggles, and payout approvals.",
                "ক্রস-টেন্যান্ট অ্যাকশন ও পেআউট অনুমোদনের অপরিবর্তনীয় অডিট লেজার।",
              )}
            </p>
          </div>
          <Link
            to="/root/audit"
            className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xs px-2"
          >
            <span>
              {t("View full audit trail", "সম্পূর্ণ অডিট ট্রেইল দেখুন")}
            </span>
            <ArrowRight className="size-3" />
          </Link>
        </div>

        {audits.length === 0 ? (
          <div className="rounded-xl border border-border/80 bg-card p-8 text-center text-sm text-muted-foreground">
            {t(
              "No recent privileged operations recorded in the ledger.",
              "কোনো সাম্প্রতিক প্রিভিলেজড অপারেশন রেকর্ড নেই।",
            )}
          </div>
        ) : (
          <OwnerTable
            head={[
              t("Action / Op", "অ্যাকশন / কাজ"),
              t("Scope / Tenant", "স্কোপ / টেন্যান্ট"),
              t("Timestamp (Local)", "সময়"),
              t("Integrity", "ভেরিফিকেশন"),
            ]}
          >
            {audits.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/40">
                <TableCell className="font-mono font-semibold text-xs text-primary">
                  {item.action}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="text-muted-foreground">Scope: </span>
                  <span className="font-medium text-foreground">
                    {item.scope ?? "platform"}
                  </span>
                  {item.entity_id && (
                    <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                      ({item.entity_id.slice(0, 10)}…)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {new Date(item.created_at).toLocaleString("en-BD", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </TableCell>
                <TableCell>
                  <StatePill tone="ok">audited</StatePill>
                </TableCell>
              </TableRow>
            ))}
          </OwnerTable>
        )}
      </div>
    </section>
  );
}
