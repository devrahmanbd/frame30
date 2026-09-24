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
} from "@/components/icons/tabler";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <div className="flex flex-col min-h-screen bg-background">
      {/* Elite Hero Section (Always Dark for Command Center feel) */}
      <div className="relative overflow-hidden bg-slate-950 text-slate-50 pb-24 pt-10 rounded-b-[2.5rem] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.5)]">
        {/* Glow Effects */}
        <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-primary/20 to-transparent opacity-40 blur-3xl pointer-events-none" />
        <div className="absolute right-0 top-0 h-[400px] w-[600px] bg-gradient-to-bl from-blue-500/20 to-transparent opacity-30 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
          <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.3)]">
                  <Lock className="size-6" />
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-bangla-display leading-tight text-white">
                  {t("Platform Command Center", "প্ল্যাটফর্ম কমান্ড সেন্টার")}
                </h1>
              </div>
              <p className="text-sm text-slate-400 font-bangla-body max-w-2xl leading-relaxed">
                {t(
                  "Global sovereign control plane for Framique cloud hosting, commerce engine, and multi-tenant infrastructure.",
                  "ফ্রেমিউক ক্লাউড হোস্টিং, কমার্স ও মাল্টি-টেন্যান্ট অবকাঠামোর সার্বভৌমিক কন্ট্রোল প্লেন।",
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <StatePill
                tone={isSystemDegraded ? "warn" : "ok"}
                className="bg-slate-900 border-slate-800 text-slate-200 shadow-inner px-4 py-1.5"
              >
                {isSystemDegraded
                  ? t("Attention Required", "মনোযোগ প্রয়োজন")
                  : t("All Systems Nominal", "সকল সিস্টেম স্বাভাবিক")}
              </StatePill>
              <div className="hidden items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-400 font-mono md:flex shadow-inner">
                <kbd className="rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold border border-slate-800 text-slate-300 shadow-sm">
                  ⌘K
                </kbd>
                <span>{t("Command Palette", "কমান্ড প্যালেট")}</span>
              </div>
            </div>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              to="/root/revenue"
              className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 backdrop-blur-md transition-all hover:border-primary/50 hover:bg-slate-900/60 hover:shadow-[0_0_30px_rgba(var(--primary),0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-start justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 font-mono">
                    Platform MRR
                  </p>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
                    <TrendingUp className="size-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white tracking-tight">
                  {rev ? formatMinor(rev.mrrMinorInt, rev.currencyCode) : "৳ 0"}
                </div>
                <p className="mt-1 text-xs text-slate-500 font-mono">
                  {rev
                    ? `${formatMinor(rev.mrrMinorInt * 12, rev.currencyCode)} ARR`
                    : "..."}
                </p>
              </div>
            </Link>

            <Link
              to="/root/tenants"
              className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 backdrop-blur-md transition-all hover:border-primary/50 hover:bg-slate-900/60 hover:shadow-[0_0_30px_rgba(var(--primary),0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-start justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 font-mono">
                    Active Stores
                  </p>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 transition-colors group-hover:bg-blue-500/20">
                    <Building2 className="size-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white tracking-tight">
                  {rev ? `${rev.paying}` : "0"}{" "}
                  <span className="text-lg text-slate-500 font-normal">
                    / {rev ? rev.trialing : "0"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 font-mono">
                  {tenants?.total ? `${tenants.total} Total Registry` : "..."}
                </p>
              </div>
            </Link>

            <Link
              to="/root/ai"
              className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 backdrop-blur-md transition-all hover:border-rose-500/50 hover:bg-slate-900/60 hover:shadow-[0_0_30px_rgba(244,63,94,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-start justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 font-mono">
                    Escalations
                  </p>
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg transition-colors",
                      needsAgentCount > 0
                        ? "bg-rose-500/20 text-rose-400 animate-pulse"
                        : "bg-slate-800 text-slate-400 group-hover:bg-slate-700",
                    )}
                  >
                    <Bot className="size-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white tracking-tight">
                  {needsAgentCount}
                </div>
                <p className="mt-1 text-xs text-slate-500 font-mono">
                  {needsAgentCount > 0
                    ? "Human Takeover Required"
                    : "AI Autonomous"}
                </p>
              </div>
            </Link>

            <Link
              to="/root/payouts"
              className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 backdrop-blur-md transition-all hover:border-amber-500/50 hover:bg-slate-900/60 hover:shadow-[0_0_30px_rgba(245,158,11,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-start justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 font-mono">
                    Pending Payouts
                  </p>
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg transition-colors",
                      pendingPayoutCount > 0
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-slate-800 text-slate-400 group-hover:bg-slate-700",
                    )}
                  >
                    <CreditCard className="size-4" />
                  </div>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white tracking-tight">
                  {pendingPayoutCount}
                </div>
                <p className="mt-1 text-xs text-slate-500 font-mono">
                  4-Eyes Approval Queue
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area Overlapping the Hero */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 -mt-8 relative z-20 space-y-10 pb-16">
        {/* Emergency Circuit Breakers (Elevated) */}
        <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-xl overflow-hidden transition-all hover:shadow-2xl hover:border-border/80">
          <div className="border-b border-border bg-muted/30 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold tracking-tight flex items-center gap-2 font-bangla-display">
                <AlertOctagon className="size-5 text-rose-500" />
                {t("Sovereign Circuit Breakers", "জরুরি সার্কিট ব্রেকার")}
              </h2>
              <p className="text-xs text-muted-foreground font-bangla-body">
                {t(
                  "Immediate platform-wide fail-open or fail-safe triggers. Audited 4-eyes actions.",
                  "জরুরি পরিস্থিতিতে প্ল্যাটফর্ম-ব্যাপী সার্ভিস বন্ধ বা চালু করার সুইচ।",
                )}
              </p>
            </div>
            <Link
              to="/root/settings"
              className="inline-flex shrink-0 min-h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground transition-all hover:bg-muted hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
            >
              <Settings className="size-4" />
              <span>{t("Manage Controls", "কন্ট্রোল পরিচালনা")}</span>
            </Link>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-4">
              <div
                className={cn(
                  "inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-xs font-bold font-mono transition-colors shadow-sm",
                  flags.ai_kill_switch === false
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : "border-primary/20 bg-primary/5 text-primary",
                )}
              >
                <Bot className="size-4.5 shrink-0" />
                <span>
                  {flags.ai_kill_switch === false
                    ? "AI Support: Paused"
                    : "AI Support: Active"}
                </span>
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-xs font-bold font-mono transition-colors shadow-sm",
                  flags.fraud_engine_enabled === false
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "border-primary/20 bg-primary/5 text-primary",
                )}
              >
                <ShieldAlert className="size-4.5 shrink-0" />
                <span>
                  {flags.fraud_engine_enabled === false
                    ? "Fraud Defense: Bypass"
                    : "Fraud Defense: Enforced"}
                </span>
              </div>
              <div className="inline-flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold font-mono text-emerald-700 dark:text-emerald-400 shadow-sm">
                <CheckCircle2 className="size-4.5 shrink-0" />
                <span>Gateways: Verified Rails</span>
              </div>
              <div className="inline-flex items-center gap-2.5 rounded-xl border border-border/80 bg-muted/40 px-4 py-2.5 text-xs font-bold font-mono text-muted-foreground shadow-sm">
                <ShieldCheck className="size-4.5 shrink-0" />
                <span>RLS: Tier-1 Live Lockdown</span>
              </div>
            </div>
          </div>
        </div>

        {/* 16 Sovereign Desks Launchpad */}
        <div className="space-y-6 pt-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground font-bangla-display flex items-center gap-2">
                <Layers className="size-5 text-primary" />
                {t(
                  "16 Sovereign Control Desks",
                  "১৬টি সার্বভৌমিক নিয়ন্ত্রণ ডেস্ক",
                )}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground font-bangla-body">
                {t(
                  "Direct platform operations, multi-tenant isolation, money conformance, and infrastructure controls.",
                  "সরাসরি প্ল্যাটফর্ম অপারেশন, মাল্টি-টেন্যান্ট আইসোলেশন ও অবকাঠামো কন্ট্রোল।",
                )}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
              <CheckCircle2 className="size-3.5" />
              16 / 16 Operational
            </span>
          </div>

          <Tabs defaultValue={deskClusters[0].title} className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-2 bg-muted/30 p-2 border border-border/60 rounded-xl justify-start shadow-inner">
              {deskClusters.map((cluster) => (
                <TabsTrigger
                  key={cluster.title}
                  value={cluster.title}
                  className="text-xs font-bold px-4 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
                >
                  {cluster.title}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="mt-8">
              {deskClusters.map((cluster) => (
                <TabsContent
                  key={cluster.title}
                  value={cluster.title}
                  className="outline-none focus:outline-none animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <div className="space-y-1 mb-6">
                    <h3 className="text-lg font-bold tracking-tight text-foreground font-bangla-display">
                      {cluster.title}
                    </h3>
                    <p className="text-sm text-muted-foreground font-bangla-body">
                      {cluster.description}
                    </p>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {cluster.desks.map((desk) => {
                      const Icon = desk.icon;
                      return (
                        <Link
                          key={desk.to}
                          to={desk.to}
                          className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card/50 p-5 min-h-[9rem] transition-all duration-300 hover:border-primary/50 hover:bg-card hover:shadow-xl hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 overflow-hidden"
                        >
                          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/0 to-transparent transition-all duration-500 group-hover:via-primary/50" />
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-lg group-hover:shadow-primary/20">
                                <Icon className="size-5" />
                              </div>
                              {desk.badge && (
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold font-mono tracking-tight shadow-sm border",
                                    desk.alert
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 animate-pulse"
                                      : "bg-muted text-muted-foreground border-border/50",
                                  )}
                                >
                                  {desk.badge}
                                </span>
                              )}
                            </div>

                            <h4 className="mt-4 text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-primary font-bangla-display leading-snug">
                              {desk.title}
                            </h4>
                            <p className="mt-1.5 text-xs text-muted-foreground font-bangla-body leading-relaxed line-clamp-2">
                              {desk.detail}
                            </p>
                          </div>

                          <div className="mt-5 flex items-center justify-between text-[11px] font-bold text-muted-foreground transition-colors group-hover:text-primary uppercase tracking-wider">
                            <span>{t("Open Desk", "ডেস্ক খুলুন")}</span>
                            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </div>

        {/* Recent Privileged Audit Stream */}
        <div className="space-y-4 pt-6">
          <div className="flex items-end justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-bold tracking-tight text-foreground font-bangla-display flex items-center gap-2">
                <FileText className="size-5 text-primary" />
                {t(
                  "Privileged Platform Audit Stream",
                  "প্রিভিলেজড প্ল্যাটফর্ম অডিট ইভেন্ট",
                )}
              </h2>
              <p className="text-sm text-muted-foreground font-bangla-body">
                {t(
                  "Append-only ledger of cross-tenant actions, kill-switch toggles, and payout approvals.",
                  "ক্রস-টেন্যান্ট অ্যাকশন ও পেআউট অনুমোদনের অপরিবর্তনীয় অডিট লেজার।",
                )}
              </p>
            </div>
            <Link
              to="/root/audit"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-muted/50 px-3 text-xs font-bold text-primary transition-all hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span>{t("View Full Ledger", "সম্পূর্ণ লেজার দেখুন")}</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            {audits.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <ShieldCheck className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t(
                    "No recent privileged operations recorded in the ledger.",
                    "কোনো সাম্প্রতিক প্রিভিলেজড অপারেশন রেকর্ড নেই।",
                  )}
                </p>
              </div>
            ) : (
              <OwnerTable
                head={[
                  t("Action / Op", "অ্যাকশন / কাজ"),
                  t("Scope / Tenant", "স্কোপ / টেন্যান্ট"),
                  t("Timestamp (Local)", "সময়"),
                  t("Integrity", "ভেরিফিকেশন"),
                ]}
                className="border-0 shadow-none rounded-none"
              >
                {audits.map((item) => (
                  <TableRow
                    key={item.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="font-mono font-bold text-xs text-primary">
                      {item.action}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="text-muted-foreground uppercase text-[10px] tracking-wider font-bold mr-1">
                        Scope:
                      </span>
                      <span className="font-bold text-foreground">
                        {item.scope ?? "platform"}
                      </span>
                      {item.entity_id && (
                        <span className="ml-1.5 font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm">
                          {item.entity_id.slice(0, 10)}…
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono font-medium">
                      {new Date(item.created_at).toLocaleString("en-BD", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      <StatePill tone="ok" className="shadow-sm">
                        Audited
                      </StatePill>
                    </TableCell>
                  </TableRow>
                ))}
              </OwnerTable>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
