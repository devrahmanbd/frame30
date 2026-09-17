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
  StatCard,
  StatGrid,
  StatePill,
} from "@/components/root/OwnerUi";

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
        "Revenue & Commercial Governance",
        "রেভিনিউ ও বাণিজ্যিক প্রশাসন",
      ),
      description: t(
        "Platform monetization, subscription plans, pricing tiers, trial conversions, and legal year money conformance.",
        "প্ল্যাটফর্ম মানিটাইজেশন, সাবস্ক্রিপশন প্ল্যান, ট্রায়াল কনভার্সন এবং মুদ্রা নিয়মাবলি।",
      ),
      desks: [
        {
          title: t("Platform Revenue", "প্ল্যাটফর্ম রেভিনিউ"),
          to: "/root/revenue",
          icon: TrendingUp,
          detail: rev
            ? `${formatMinor(rev.mrrMinorInt, rev.currencyCode)} MRR`
            : "MRR & ARR",
          badge: rev ? `${rev.paying} paying` : undefined,
        },
        {
          title: t("Plans & Limits", "প্ল্যান ও লিমিট"),
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
        "Trust, Security & AI Moderation",
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
      {/* Top Banner */}
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("Platform Command Center", "প্ল্যাটফর্ম কমান্ড সেন্টার")}
            </h1>
            <span className="rounded-fq-sm bg-destructive/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-destructive">
              ROOT PRIVILEGED
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Global sovereign control plane for Framique cloud hosting, commerce, and multi-tenant infrastructure.",
              "ফ্রেমিউক ক্লাউড হোস্টিং, কমার্স ও মাল্টি-টেন্যান্ট অবকাঠামোর সার্বভৌমিক কন্ট্রোল প্লেন।",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatePill tone={isSystemDegraded ? "warn" : "ok"}>
            {isSystemDegraded
              ? t("Attention Required", "মনোযোগ প্রয়োজন")
              : t("All Systems Nominal", "সকল সিস্টেম স্বাভাবিক")}
          </StatePill>
          <div className="hidden items-center gap-1.5 rounded-fq-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground md:flex">
            <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground border border-border shadow-xs">
              ⌘K
            </kbd>
            <span>
              {t("Universal Command Palette", "ইউনিভার্সাল কমান্ড প্যালেট")}
            </span>
          </div>
        </div>
      </div>

      {/* Top-Line Executive KPIs */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t(
            "Executive Telemetry & Vital Signals",
            "এক্সিকিউটিভ টেলিমেট্রি ও ভাইটাল সিগন্যাল",
          )}
        </h2>
        <StatGrid>
          <StatCard
            label={t("Platform MRR", "প্ল্যাটফর্ম এমআরআর")}
            value={rev ? formatMinor(rev.mrrMinorInt, rev.currencyCode) : "৳ 0"}
          />
          <StatCard
            label={t(
              "Active Stores (Paying / Trial)",
              "সক্রিয় স্টোর (পেইং / ট্রায়াল)",
            )}
            value={rev ? `${rev.paying} / ${rev.trialing}` : "0 / 0"}
          />
          <StatCard
            label={t(
              "Support Escalations (Needs Agent)",
              "সাপোর্ট এসকেলেশন (হিউম্যান এজেন্ট)",
            )}
            value={String(needsAgentCount)}
          />
          <StatCard
            label={t("Pending Payouts Awaiting Review", "অপেক্ষমাণ পেআউট")}
            value={String(pendingPayoutCount)}
          />
        </StatGrid>
      </div>

      {/* Emergency Platform Posture & Kill Switches */}
      <div className="rounded-fq-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t(
                "Platform Emergency Posture & Kill Switches",
                "প্ল্যাটফর্ম জরুরি সুইচ ও সার্কিট ব্রেকার",
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "Immediate platform-wide fail-open or fail-safe toggles. Four-eyes audited.",
                "জরুরি পরিস্থিতিতে প্ল্যাটফর্ম-ব্যাপী অবিলম্বে সার্ভিস বন্ধ বা চালু করার সুইচ।",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-fq-md border px-2.5 py-1 text-xs font-medium ${
                flags.ai_kill_switch === false
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-primary/20 bg-primary/5 text-primary"
              }`}
            >
              <Bot className="size-3.5" />
              {flags.ai_kill_switch === false
                ? "AI Support: Paused"
                : "AI Support: Active"}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-fq-md border px-2.5 py-1 text-xs font-medium ${
                flags.fraud_engine_enabled === false
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-primary/20 bg-primary/5 text-primary"
              }`}
            >
              <ShieldAlert className="size-3.5" />
              {flags.fraud_engine_enabled === false
                ? "Fraud Defense: Manual"
                : "Fraud Defense: Active"}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-fq-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
              <CheckCircle2 className="size-3.5" />
              Gateways: Protected
            </span>

            <Link
              to="/root/settings"
              className="rounded-fq-md border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              {t("Manage Controls →", "কন্ট্রোল পরিচালনা →")}
            </Link>
          </div>
        </div>
      </div>

      {/* 16 Sovereign Desks Launchpad */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {t(
              "16 Sovereign Control Desks",
              "১৬টি সার্বভৌমিক নিয়ন্ত্রণ ডেস্ক",
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "Click any desk to access dedicated operator tools",
              "যেকোনো ডেস্কে ক্লিক করে নির্দিষ্ট টুল ব্যবহার করুন",
            )}
          </p>
        </div>

        <div className="space-y-8">
          {deskClusters.map((cluster) => (
            <div key={cluster.title} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {cluster.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {cluster.description}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cluster.desks.map((desk) => {
                  const Icon = desk.icon;
                  return (
                    <Link
                      key={desk.to}
                      to={desk.to}
                      className="group relative flex flex-col justify-between rounded-fq-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex size-9 items-center justify-center rounded-fq-md bg-muted text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                            <Icon className="size-4.5" />
                          </div>
                          {desk.badge && (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                desk.alert
                                  ? "bg-destructive/10 text-destructive animate-pulse"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {desk.badge}
                            </span>
                          )}
                        </div>

                        <h4 className="mt-3 text-sm font-semibold text-foreground group-hover:text-primary">
                          {desk.title}
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                          {desk.detail}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary">
                        <span>{t("Open Desk", "ডেস্ক খুলুন")}</span>
                        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
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
          <h2 className="text-sm font-semibold text-foreground">
            {t(
              "Recent Privileged Platform Audit Events",
              "সাম্প্রতিক প্রিভিলেজড প্ল্যাটফর্ম অডিট ইভেন্ট",
            )}
          </h2>
          <Link
            to="/root/audit"
            className="text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            {t("View full audit trail →", "সম্পূর্ণ অডিট ট্রেইল দেখুন →")}
          </Link>
        </div>

        <div className="overflow-hidden rounded-fq-lg border border-border bg-card">
          {audits.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t(
                "No recent privileged operations recorded.",
                "কোনো সাম্প্রতিক প্রিভিলেজড অপারেশন রেকর্ড নেই।",
              )}
            </p>
          ) : (
            <div className="divide-y divide-border text-xs">
              {audits.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-semibold text-primary">
                      {item.action}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      Scope:{" "}
                      <span className="text-foreground">
                        {item.scope ?? "platform"}
                      </span>
                    </span>
                    {item.entity_id && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-mono text-muted-foreground">
                          {item.entity_id.slice(0, 12)}…
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {new Date(item.created_at).toLocaleString("en-BD", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    <StatePill tone="ok">audited</StatePill>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
