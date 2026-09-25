import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  ShieldAlert,
  Bot,
  Sliders,
  Radio,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Lock,
  Mail,
  MessageSquare,
} from "@/components/icons/tabler";
import { useLang } from "@/lib/i18n";
import { ownerSetFlagFn, ownerSettingsFn } from "@/lib/owner.functions";
import { OwnerHeader, StatCard, StatGrid } from "@/components/root/OwnerUi";
import { RootConfirmDialog } from "@/components/root/RootConfirmDialog";
import {
  COMMON_TIMEZONES,
  DEFAULT_PLATFORM_TIMEZONE,
  formatInTimezone,
  sanitizeTimezone,
} from "@/lib/timezone";

export const Route = createFileRoute("/root/settings")({
  head: () => ({
    meta: [
      { title: "Platform Controls & Governance — Framique Root" },
      {
        name: "description",
        content:
          "Framique platform sovereign settings: emergency kill switches, AI support posture, fraud fail-open switches, retention windows and dead-letter queues.",
      },
      {
        property: "og:title",
        content: "Platform Controls & Governance — Framique Root",
      },
      {
        property: "og:description",
        content:
          "Emergency kill switches, retention windows and platform posture.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OwnerSettings,
});

function num(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

export function OwnerSettings() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(ownerSettingsFn);
  const setFlag = useServerFn(ownerSetFlagFn);
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Confirm dialog state for high-impact circuit breakers
  const [confirmSwitch, setConfirmSwitch] = useState<{
    key: string;
    nextValue: boolean;
    title: string;
    description: string;
    tone: "danger" | "neutral";
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["owner-settings"],
    queryFn: () => load(),
    staleTime: 30_000,
  });

  const saveNumberFlag = useMutation({
    mutationFn: (input: { key: string; value: number }) =>
      setFlag({ data: input }),
    onSuccess: () => {
      toast.success(
        t("Setting saved successfully", "সেটিংস সফলভাবে সংরক্ষিত হয়েছে"),
      );
      void qc.invalidateQueries({ queryKey: ["owner-settings"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to update setting";
      toast.error(msg);
    },
  });

  const saveBoolFlag = useMutation({
    mutationFn: (input: { key: string; value: boolean }) =>
      setFlag({ data: input }),
    onSuccess: () => {
      toast.success(
        t(
          "Platform circuit breaker updated",
          "প্ল্যাটফর্ম সার্কিট ব্রেকার আপডেট হয়েছে",
        ),
      );
      setConfirmSwitch(null);
      void qc.invalidateQueries({ queryKey: ["owner-settings"] });
      void qc.invalidateQueries({ queryKey: ["owner-ai"] });
      void qc.invalidateQueries({ queryKey: ["owner-fraud"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to update breaker";
      toast.error(msg);
      setConfirmSwitch(null);
    },
  });

  const saveStringFlag = useMutation({
    mutationFn: (input: { key: string; value: string }) =>
      setFlag({ data: input }),
    onSuccess: () => {
      toast.success(
        t(
          "Platform timezone updated successfully",
          "প্ল্যাটফর্ম টাইমজোন সফলভাবে আপডেট হয়েছে",
        ),
      );
      void qc.invalidateQueries({ queryKey: ["owner-settings"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to update timezone";
      toast.error(msg);
    },
  });

  const flags = data?.flags ?? {};
  const platformTimezone = sanitizeTimezone(
    flags["platform_timezone"],
    DEFAULT_PLATFORM_TIMEZONE,
  );
  const isAiActive = flags["ai_support_enabled"] !== false;
  const isFraudActive = flags["fraud_engine_enabled"] !== false;
  const isEmailActive = flags["consent_channel_email"] !== false;
  const isSmsActive = flags["consent_channel_sms"] !== false;

  const retentionFields = [
    {
      key: "retention_raw_days",
      label: t(
        "Raw Analytics Retention (Days)",
        "র অ্যানালিটিক্স রিটেনশন (দিন)",
      ),
      hint: t(
        "Rolling window before raw storefront click/view events are purged.",
        "কাঁচা ইভেন্ট মুছে ফেলার আগে ধরে রাখার সময়কাল।",
      ),
      fallback: 90,
    },
    {
      key: "retention_audit_days",
      label: t("Audit Ledger Retention (Days)", "অডিট লেজার রিটেনশন (দিন)"),
      hint: t(
        "Strict compliance window for privileged operator actions (minimum 365 days).",
        "প্রিভিলেজড অ্যাকশন লেজার সংরক্ষণের বাধ্যবাধকতা (নূন্যতম ৩৬৫ দিন)।",
      ),
      fallback: 1095,
    },
    {
      key: "pii_retention_days",
      label: t(
        "PII Data Retention Window (Days)",
        "ব্যক্তিগত তথ্য (PII) রিটেনশন (দিন)",
      ),
      hint: t(
        "GDPR & customer privacy anonymization timeline.",
        "গ্রাহকের ব্যক্তিগত তথ্য এননিমাস করার নির্দিষ্ট সময়সীমা।",
      ),
      fallback: 90,
    },
  ];

  return (
    <section className="space-y-8">
      <OwnerHeader
        title={t(
          "Platform Controls & Sovereign Governance",
          "প্ল্যাটফর্ম কন্ট্রোল ও সার্বভৌম প্রশাসন",
        )}
        subtitle={t(
          "Emergency kill switches, autonomous circuit breakers, and data compliance policies.",
          "জরুরি কিল সুইচ, স্বায়ত্তশাসিত সার্কিট ব্রেকার এবং কমপ্লায়েন্স নীতি।",
        )}
      />

      {/* Emergency Platform Posture Banner */}
      <div
        className={`rounded-fq-lg border p-4.5 transition-colors ${
          !isAiActive || !isFraudActive
            ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            : "border-primary/20 bg-card text-foreground"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-fq-md ${
                !isAiActive || !isFraudActive
                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {!isAiActive || !isFraudActive ? (
                <AlertTriangle className="size-5" />
              ) : (
                <ShieldAlert className="size-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                {!isAiActive || !isFraudActive
                  ? t(
                      "Emergency Degraded Posture Active",
                      "জরুরি ডিক্রেডেড মোড সক্রিয়",
                    )
                  : t(
                      "Normal Platform Security Posture",
                      "স্বাভাবিক প্ল্যাটফর্ম নিরাপত্তা মোড",
                    )}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {!isAiActive || !isFraudActive
                  ? t(
                      "One or more emergency circuit breakers are currently tripped. Review details below.",
                      "এক বা একাধিক জরুরি সার্কিট ব্রেকার বন্ধ রাখা হয়েছে। নিচের বিস্তারিত দেখুন।",
                    )
                  : t(
                      "All autonomous AI agents and edge fraud scoring engines are operating normally.",
                      "সমস্ত এআই সাপোর্ট এজেন্ট এবং ফ্রড ইঞ্জিন সক্রিয়ভাবে কাজ করছে।",
                    )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                isAiActive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive animate-pulse"
              }`}
            >
              <Bot className="size-3" />
              AI: {isAiActive ? "Online" : "HALTED"}
            </span>

            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                isFraudActive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse"
              }`}
            >
              <ShieldAlert className="size-3" />
              Fraud: {isFraudActive ? "Automated" : "Manual Review"}
            </span>
          </div>
        </div>
      </div>

      {/* Platform Sovereign Timezone & Regional Governance */}
      <section className="rounded-fq-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="size-4.5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">
                {t(
                  "Platform Sovereign Timezone",
                  "প্ল্যাটফর্ম পরিচালন টাইমজোন",
                )}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {platformTimezone}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {t(
                "Sets the default timezone for platform-wide metrics, cron schedules, root audit ledgers, and operator incident reports.",
                "প্ল্যাটফর্ম মেট্রিক্স, ক্রন শিডিউল, অডিট লেজার এবং ইনসিডেন্ট রিপোর্টের সার্বজনীন টাইমজোন নির্ধারণ করে।",
              )}
            </p>
          </div>

          <div className="text-right hidden sm:block">
            <span className="text-[11px] text-muted-foreground block font-mono">
              {t("Live Platform Clock", "প্ল্যাটফর্ম লাইভ সময়")}
            </span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {formatInTimezone(new Date(), platformTimezone, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              })}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
          <label className="text-xs font-semibold text-foreground shrink-0">
            {t("Select Active Timezone:", "সক্রিয় টাইমজোন নির্বাচন করুন:")}
          </label>
          <select
            value={platformTimezone}
            disabled={saveStringFlag.isPending}
            onChange={(e) =>
              saveStringFlag.mutate({
                key: "platform_timezone",
                value: e.target.value,
              })
            }
            className="min-h-10 w-full sm:w-80 rounded-fq-md border border-input bg-background px-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.offset} — {tz.label}
              </option>
            ))}
          </select>
          {saveStringFlag.isPending && (
            <span className="text-xs text-muted-foreground animate-pulse">
              {t("Saving…", "সংরক্ষণ হচ্ছে…")}
            </span>
          )}
        </div>
      </section>

      {/* Emergency Circuit Breakers (Kill Switches) */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sliders className="size-4.5 text-primary" />
            {t(
              "Emergency Circuit Breakers & Kill Switches",
              "জরুরি সার্কিট ব্রেকার ও কিল সুইচ",
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              "Physical software breakers capable of stopping autonomous subsystems without affecting core commerce.",
              "প্রধান প্ল্যাটফর্ম ঠিক রেখে ঝুঁকিপূর্ণ সাবসিস্টেম তাৎক্ষণিক বন্ধ বা চালুর সুইচ।",
            )}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* AI Support Kill Switch */}
          <div className="flex flex-col justify-between rounded-fq-lg border border-border bg-card p-4.5">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                  <Bot className="size-4 text-primary" />
                  <span>
                    {t(
                      "Autonomous AI Support Engine",
                      "স্বায়ত্তশাসিত এআই সাপোর্ট ইঞ্জিন",
                    )}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isAiActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {isAiActive
                    ? t("Enabled", "সক্রিয়")
                    : t("KILLED / HALTED", "বন্ধ")}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {t(
                  "When tripped, all autonomous AI responses across every store are immediately suspended. Inbound customer messages escalate to human operator queues with zero hallucination risk.",
                  "কিল সুইচ অন করলে সকল স্টোরের এআই অটো-রিপ্লাই স্থগিত হয়ে যাবে এবং সমস্ত বার্তা সরাসরি মানব অপারেটরের কাছে চলে আসবে।",
                )}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <Link
                to="/root/ai"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <span>{t("Open AI Desk", "এআই ডেস্ক দেখুন")}</span>
                <ArrowRight className="size-3" />
              </Link>
              <button
                type="button"
                onClick={() =>
                  setConfirmSwitch({
                    key: "ai_support_enabled",
                    nextValue: !isAiActive,
                    title: isAiActive
                      ? t(
                          "Halt Autonomous AI Support?",
                          "এআই সাপোর্ট কি বন্ধ করবেন?",
                        )
                      : t(
                          "Resume Autonomous AI Support?",
                          "এআই সাপোর্ট কি চালু করবেন?",
                        ),
                    description: isAiActive
                      ? t(
                          "This will trip the global AI kill-switch. No autonomous responses will be sent to any storefront shoppers until manually re-enabled.",
                          "এটি প্ল্যাটফর্মের সকল স্টোরের এআই সাপোর্ট বন্ধ করে দেবে। অপারেটর নিজে পুনরায় চালু না করা পর্যন্ত এআই উত্তর দেবে না।",
                        )
                      : t(
                          "This will resume autonomous AI support responses across all connected stores.",
                          "এটি সকল স্টোরে পুনরায় স্বায়ত্তশাসিত এআই প্রতিক্রিয়া সক্রিয় করবে।",
                        ),
                    tone: isAiActive ? "danger" : "neutral",
                  })
                }
                disabled={saveBoolFlag.isPending}
                className={`rounded-fq-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  isAiActive
                    ? "bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {isAiActive
                  ? t("Trip Kill Switch", "কিল সুইচ প্রয়োগ করুন")
                  : t("Resume AI Engine", "এআই চালু করুন")}
              </button>
            </div>
          </div>

          {/* Fraud Scoring Engine Breaker */}
          <div className="flex flex-col justify-between rounded-fq-lg border border-border bg-card p-4.5">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                  <ShieldAlert className="size-4 text-primary" />
                  <span>
                    {t(
                      "Automated Fraud Scoring Engine",
                      "স্বয়ংক্রিয় ফ্রড স্কোরিং ইঞ্জিন",
                    )}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isFraudActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {isFraudActive
                    ? t("Active", "সক্রিয়")
                    : t("Fail-Open (Manual)", "ম্যানুয়াল রিভিউ")}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {t(
                  "When disabled, algorithmic checkout blocking fails open to prevent false positives during flash sales. High-risk orders are marked for manual review instead of rejection.",
                  "বন্ধ করা হলে ফ্ল্যাশ সেল চলাকালীন নিরীহ কাস্টমার ব্লক হওয়া রোধে ফ্রড ইঞ্জিন ফেইল-ওপেন মোডে চলে যাবে এবং অর্ডার ম্যানুয়াল রিভিউয়ের জন্য রাখা হবে।",
                )}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <Link
                to="/root/fraud"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <span>{t("Open Fraud Desk", "ফ্রড ডেস্ক দেখুন")}</span>
                <ArrowRight className="size-3" />
              </Link>
              <button
                type="button"
                onClick={() =>
                  setConfirmSwitch({
                    key: "fraud_engine_enabled",
                    nextValue: !isFraudActive,
                    title: isFraudActive
                      ? t(
                          "Disable Automated Fraud Blocking?",
                          "ফ্রড স্কোরিং কি নিষ্ক্রিয় করবেন?",
                        )
                      : t(
                          "Enable Automated Fraud Blocking?",
                          "ফ্রড স্কোরিং কি সক্রিয় করবেন?",
                        ),
                    description: isFraudActive
                      ? t(
                          "Edge heuristic scoring will be bypassed. Suspicious orders will fail open into manual review rather than immediate denial.",
                          "সন্দেহজনক অর্ডার স্বয়ংক্রিয়ভাবে বাতিল না হয়ে ম্যানুয়াল পর্যালোচনার জন্য জমা হবে।",
                        )
                      : t(
                          "Automated algorithmic risk score evaluation and blacklisting will be restored.",
                          "স্বয়ংক্রিয় ঝুঁকি মূল্যায়ন পুনরায় চালু হবে।",
                        ),
                    tone: isFraudActive ? "danger" : "neutral",
                  })
                }
                disabled={saveBoolFlag.isPending}
                className={`rounded-fq-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  isFraudActive
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {isFraudActive
                  ? t("Disable (Fail-Open)", "ফেইল-ওপেন করুন")
                  : t("Enable Automation", "অটোমেশন চালু করুন")}
              </button>
            </div>
          </div>

          {/* Email Broadcast Rail */}
          <div className="flex flex-col justify-between rounded-fq-lg border border-border bg-card p-4.5">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                  <Mail className="size-4 text-primary" />
                  <span>
                    {t("Marketing Email Broadcast Rail", "মার্কেটিং ইমেইল রেল")}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isEmailActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isEmailActive ? t("Enabled", "সচল") : t("Paused", "স্থগিত")}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {t(
                  "Global circuit breaker for bulk merchant marketing emails. Transactional emails (receipts, password resets) are protected and unaffected.",
                  "বাল্ক মার্কেটিং ইমেইল প্রেরণের প্ল্যাটফর্ম সুইচ। ট্রানজেকশনাল ইমেইল (পেমেন্ট রসিদ, পাসওয়ার্ড রিসেট) প্রভাবিত হবে না।",
                )}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <Link
                to="/root/marketing"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <span>{t("Open Marketing Desk", "মার্কেটিং ডেস্ক দেখুন")}</span>
                <ArrowRight className="size-3" />
              </Link>
              <button
                type="button"
                onClick={() =>
                  saveBoolFlag.mutate({
                    key: "consent_channel_email",
                    value: !isEmailActive,
                  })
                }
                disabled={saveBoolFlag.isPending}
                className="rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {isEmailActive
                  ? t("Pause Broadcasts", "ইমেইল স্থগিত করুন")
                  : t("Resume Broadcasts", "ইমেইল চালু করুন")}
              </button>
            </div>
          </div>

          {/* SMS Broadcast Rail */}
          <div className="flex flex-col justify-between rounded-fq-lg border border-border bg-card p-4.5">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                  <MessageSquare className="size-4 text-primary" />
                  <span>
                    {t(
                      "Marketing SMS Delivery Rail",
                      "মার্কেটিং এসএমএস ডেলিভারি রেল",
                    )}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isSmsActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isSmsActive ? t("Enabled", "সচল") : t("Paused", "স্থগিত")}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {t(
                  "Global kill switch for promotional SMS campaigns across all gateways (SSL Wireless, Banglalink, Grameenphone). OTP alerts remain intact.",
                  "সকল প্রমোশনাল এসএমএস স্থগিত করার কেন্দ্রীয় সুইচ। গ্রাহকের ওটিপি মেসেজ চালু থাকবে।",
                )}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <Link
                to="/root/marketing"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <span>{t("Open Marketing Desk", "মার্কেটিং ডেস্ক দেখুন")}</span>
                <ArrowRight className="size-3" />
              </Link>
              <button
                type="button"
                onClick={() =>
                  saveBoolFlag.mutate({
                    key: "consent_channel_sms",
                    value: !isSmsActive,
                  })
                }
                disabled={saveBoolFlag.isPending}
                className="rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {isSmsActive
                  ? t("Pause SMS", "এসএমএস স্থগিত করুন")
                  : t("Resume SMS", "এসএমএস চালু করুন")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance & Data Retention Windows */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Clock className="size-4.5 text-primary" />
            {t(
              "Compliance, Retention & Anonymization Windows",
              "কমপ্লায়েন্স ও ডেটা রিটেনশন উইন্ডো",
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              "Configured rolling retention periods for raw operational telemetry and compliance archives.",
              "কাঁচা তথ্য এবং আইনগত অডিট রেকর্ড কতদিন সংরক্ষিত থাকবে তার সময়সীমা।",
            )}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {retentionFields.map((f) => {
            const current = num(flags[f.key], f.fallback);
            const value = draft[f.key] ?? String(current);
            const isDirty = Number(value) !== current && Number(value) > 0;

            return (
              <div
                key={f.key}
                className="flex flex-col justify-between rounded-fq-lg border border-border bg-card p-4.5"
              >
                <div>
                  <label
                    className="text-sm font-semibold text-foreground"
                    htmlFor={f.key}
                  >
                    {f.label}
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {f.hint}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      id={f.key}
                      type="number"
                      min={1}
                      max={36500}
                      className="w-24 rounded-fq-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums font-mono focus-visible:outline-2 focus-visible:outline-ring"
                      value={value}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>

                  <button
                    type="button"
                    className="rounded-fq-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 cursor-pointer"
                    disabled={
                      saveNumberFlag.isPending || !isDirty || !Number(value)
                    }
                    onClick={() =>
                      saveNumberFlag.mutate({
                        key: f.key,
                        value: Number(value),
                      })
                    }
                  >
                    {t("Save", "সংরক্ষণ")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gateway & Settlement Health */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Radio className="size-4.5 text-primary" />
              {t(
                "Payment Gateways & Settlement Health",
                "পেমেন্ট গেটওয়ে ও সেটেলমেন্ট অবস্থা",
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "Dead-letter webhook depth and pending multi-operator authorizations.",
                "ব্যর্থ ওয়েবহুক এবং অমীমাংসিত বহু-অপারেটর অনুমোদন।",
              )}
            </p>
          </div>
          <Link
            to="/root/gateway"
            className="text-xs font-medium text-primary hover:underline underline-offset-4 flex items-center gap-1"
          >
            <span>{t("Open Gateway Desk", "গেটওয়ে ডেস্ক খুলুন")}</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>

        <StatGrid>
          <StatCard
            label={t("Dead Letter Webhooks", "ব্যর্থ ওয়েবহুক (DLQ)")}
            value={String(data?.gateway.deadLetter ?? 0)}
          />
          <StatCard
            label={t("Processed Webhook Events", "প্রক্রিয়াকৃত ওয়েবহুক")}
            value={String(data?.gateway.processed ?? 0)}
          />
          <StatCard
            label={t("Pending Dual Approvals", "অমীমাংসিত অনুমোদন")}
            value={String(data?.approvals.pending ?? 0)}
          />
        </StatGrid>
      </div>

      {/* Confirmation Dialog for Breaker Toggles */}
      {confirmSwitch && (
        <RootConfirmDialog
          open={Boolean(confirmSwitch)}
          title={confirmSwitch.title}
          description={confirmSwitch.description}
          confirmLabel={t("Confirm Action", "নিশ্চিত করুন")}
          tone={confirmSwitch.tone === "danger" ? "danger" : "primary"}
          busy={saveBoolFlag.isPending}
          onConfirm={() =>
            saveBoolFlag.mutate({
              key: confirmSwitch.key,
              value: confirmSwitch.nextValue,
            })
          }
          onCancel={() => setConfirmSwitch(null)}
        />
      )}
    </section>
  );
}
