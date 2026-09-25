import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  btnGhost,
  btnPrimary,
  inputClass,
  Field,
  StatusPill,
} from "@/components/admin/MarketingUi";
import { SectionCard } from "@/components/admin/DeveloperUi";
import { InlineAlert } from "@/components/admin/FinanceUi";
import {
  getEmailSettingsFn,
  saveEmailTemplateFn,
  sendTemplatePreviewFn,
} from "@/lib/email-settings.functions";
import {
  type EmailTemplateKind,
  type EmailTemplateConfig,
  renderEmailHtml,
  interpolate,
} from "@/lib/transactional-mailer-renderer";
import { useLang } from "@/lib/i18n";
import {
  Palette,
  Smartphone,
  Monitor,
  Send,
  Sparkles,
  ShoppingBag,
  FileText,
  Truck,
  UserPlus,
  Mail,
} from "@/components/icons/tabler";

export const Route = createFileRoute(
  "/_authenticated/dashboard/marketing/templates",
)({
  loader: async () => {
    return await getEmailSettingsFn();
  },
  head: () => ({
    meta: [
      { title: "Email & Newsletter Templates — Framique Admin" },
      {
        name: "description",
        content:
          "Customize branding, colors, subjects, and copy for newsletters and transactional emails.",
      },
      { property: "og:title", content: "Email & Newsletter Templates" },
      { property: "robots", content: "noindex" },
    ],
  }),
  component: EmailTemplatesPage,
});

type LoaderData = Awaited<ReturnType<typeof getEmailSettingsFn>>;

const KIND_META: Record<
  EmailTemplateKind,
  {
    labelEn: string;
    labelBn: string;
    icon: typeof Mail;
    descriptionEn: string;
    descriptionBn: string;
  }
> = {
  newsletter: {
    labelEn: "Newsletter Blast",
    labelBn: "নিউজলেটার",
    icon: Mail,
    descriptionEn: "Broadcast campaigns sent to audience subscribers",
    descriptionBn: "সাবস্ক্রাইবারদের পাঠানো নিয়মিত নিউজলেটার বার্তা",
  },
  order_confirmation: {
    labelEn: "Order Confirmation",
    labelBn: "অর্ডার নিশ্চিতকরণ",
    icon: ShoppingBag,
    descriptionEn: "Itemized purchase receipt sent immediately after checkout",
    descriptionBn: "চেকআউট সম্পন্ন হওয়ার পর তাৎক্ষণিক প্রেরিত রসিদ",
  },
  invoice_delivery: {
    labelEn: "Tax Invoice",
    labelBn: "ট্যাক্স ইনভয়েস",
    icon: FileText,
    descriptionEn: "Official legal tax invoice document and viewing link",
    descriptionBn: "অফিসিয়াল কর ইনভয়েস এবং দেখার লিংক",
  },
  order_dispatched: {
    labelEn: "Shipping Dispatch",
    labelBn: "শিপিং ডেলিভারি",
    icon: Truck,
    descriptionEn: "Courier dispatch notice with consignment AWB tracking",
    descriptionBn: "কুরিয়ার ট্র্যাকিং কোড ও ডেলিভারি আপডেট",
  },
  order_delivered: {
    labelEn: "Delivered Notice",
    labelBn: "ডেলিভারি সম্পন্ন",
    icon: Truck,
    descriptionEn: "Delivered notification with review call to action",
    descriptionBn: "পার্সেল সফলভাবে ডেলিভারি হওয়ার নোটিফিকেশন",
  },
  customer_welcome: {
    labelEn: "Welcome Email",
    labelBn: "স্বাগতম ইমেইল",
    icon: UserPlus,
    descriptionEn: "Account registration and onboarding welcome message",
    descriptionBn: "নতুন গ্রাহক নিবন্ধন ও স্বাগতম বার্তা",
  },
};

const SAMPLE_VARS: Record<string, string> = {
  store_name: "Artisan Leather",
  store_slug: "artisan-leather",
  customer_name: "Tanzim Ahmed",
  order_number: "FQ-2026-8910",
  total_amount: "৳ 2,450.00",
  invoice_number: "INV-2026-0042",
  carrier_name: "Steadfast Express",
  awb_number: "SF-991042",
  tracking_url: "https://framique.qubickle.com/store/artisan-leather/track",
};

const PALETTE = [
  "#0f172a", // Slate
  "#10b981", // Emerald
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#f97316", // Orange
  "#0284c7", // Sky
  "#8b5cf6", // Purple
];

function EmailTemplatesPage() {
  const { t } = useLang();
  const initial = Route.useLoaderData() as LoaderData;

  const [templates, setTemplates] = useState(initial.templates);
  const [activeKind, setActiveKind] = useState<EmailTemplateKind>("newsletter");
  const [deviceView, setDeviceView] = useState<"desktop" | "mobile">("desktop");
  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [testStatus, setTestStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const saveTemplate = useServerFn(saveEmailTemplateFn);
  const sendPreview = useServerFn(sendTemplatePreviewFn);

  const currentTpl: EmailTemplateConfig = templates[activeKind] || {};

  const updateCurrent = (patch: Partial<EmailTemplateConfig>) => {
    setTemplates((prev) => ({
      ...prev,
      [activeKind]: {
        ...prev[activeKind],
        ...patch,
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await saveTemplate({
        data: {
          kind: activeKind,
          brandColor: currentTpl.brandColor,
          logoUrl: currentTpl.logoUrl || undefined,
          headerTitle: currentTpl.headerTitle || "Notification",
          subjectTemplate: currentTpl.subjectTemplate || "Update",
          bodyTemplate: currentTpl.bodyTemplate || "Hello",
          ctaText: currentTpl.ctaText || undefined,
          ctaUrl: currentTpl.ctaUrl || undefined,
          footerText: currentTpl.footerText || undefined,
        },
      });
      setTemplates((prev) => ({ ...prev, [activeKind]: res }));
      setSaveStatus({
        ok: true,
        message: t(
          "Template saved successfully!",
          "টেমপ্লেট সফলভাবে সংরক্ষিত হয়েছে!",
        ),
      });
    } catch (err) {
      setSaveStatus({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : t("Failed to save template.", "টেমপ্লেট সংরক্ষণ ব্যর্থ হয়েছে।"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) return;
    setSendingTest(true);
    setTestStatus(null);
    try {
      const res = await sendPreview({
        data: {
          kind: activeKind,
          recipientEmail: testEmail,
          brandColor: currentTpl.brandColor,
          logoUrl: currentTpl.logoUrl || undefined,
          headerTitle: currentTpl.headerTitle || "Preview",
          subjectTemplate: currentTpl.subjectTemplate || "Preview",
          bodyTemplate: currentTpl.bodyTemplate || "Preview",
          ctaText: currentTpl.ctaText || undefined,
          ctaUrl: currentTpl.ctaUrl || undefined,
          footerText: currentTpl.footerText || undefined,
        },
      });
      if (res.ok) {
        setTestStatus({
          ok: true,
          message: t(
            "Test preview email sent to your inbox!",
            "টেস্ট প্রিভিউ আপনার ইনবক্সে পাঠানো হয়েছে!",
          ),
        });
      } else {
        setTestStatus({
          ok: false,
          message:
            res.error ||
            t("Failed to send test email.", "টেস্ট ইমেইল পাঠানো যায়নি।"),
        });
      }
    } catch (err) {
      setTestStatus({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : t("Error sending test.", "সমস্যা হয়েছে।"),
      });
    } finally {
      setSendingTest(false);
    }
  };

  const insertTag = (tag: string) => {
    const field = currentTpl.bodyTemplate || "";
    updateCurrent({ bodyTemplate: `${field} {{${tag}}}` });
  };

  // Live rendered HTML
  const previewSubject = interpolate(
    currentTpl.subjectTemplate || "",
    SAMPLE_VARS,
  );
  const previewHeader = interpolate(currentTpl.headerTitle || "", SAMPLE_VARS);
  const previewBody = interpolate(currentTpl.bodyTemplate || "", SAMPLE_VARS);
  const previewCta = currentTpl.ctaUrl
    ? interpolate(currentTpl.ctaUrl, SAMPLE_VARS)
    : undefined;
  const previewFooter = currentTpl.footerText
    ? interpolate(currentTpl.footerText, SAMPLE_VARS)
    : undefined;

  const previewHtml = renderEmailHtml({
    storeName: SAMPLE_VARS["store_name"]!,
    brandColor: currentTpl.brandColor || "#0f172a",
    logoUrl: currentTpl.logoUrl || null,
    headerTitle: previewHeader,
    bodyText: previewBody,
    ctaText: currentTpl.ctaText || null,
    ctaUrl: previewCta || null,
    footerText: previewFooter || null,
    unsubscribeUrl: "https://example.com/unsubscribe",
  });

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {t("Email & Newsletter Templates", "ইমেইল ও নিউজলেটার টেমপ্লেট")}
            </h1>
            <StatusPill tone="info" label={t("Live Preview", "লাইভ প্রিভিউ")} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "Customize brand colors, subjects, header logos, and copy for your newsletter and automated store emails.",
              "আপনার স্টোরের নিউজলেটার ও স্বয়ংক্রিয় ইমেইলের জন্য ব্র্যান্ডিং, রং, লোগো এবং লেখা কাস্টমাইজ করুন।",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-fq-md border border-border self-start">
          <button
            type="button"
            onClick={() => setDeviceView("desktop")}
            className={`px-3 py-1.5 rounded-fq-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              deviceView === "desktop"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Monitor className="size-3.5" />
            <span>Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => setDeviceView("mobile")}
            className={`px-3 py-1.5 rounded-fq-sm text-xs font-medium flex items-center gap-1.5 transition-colors ${
              deviceView === "mobile"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone className="size-3.5" />
            <span>Mobile</span>
          </button>
        </div>
      </div>

      {/* Template Kind Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border">
        {(Object.keys(KIND_META) as EmailTemplateKind[]).map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          const isActive = activeKind === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setActiveKind(kind);
                setSaveStatus(null);
                setTestStatus(null);
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-fq-md text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              <Icon className="size-4" />
              <span>{t(meta.labelEn, meta.labelBn)}</span>
            </button>
          );
        })}
      </div>

      {/* Two Column Layout: Editor (Left) & Live Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Editor Form */}
        <div className="lg:col-span-6 space-y-6">
          <SectionCard
            title={t(
              KIND_META[activeKind].labelEn,
              KIND_META[activeKind].labelBn,
            )}
            hint={t(
              KIND_META[activeKind].descriptionEn,
              KIND_META[activeKind].descriptionBn,
            )}
          >
            <form onSubmit={handleSave} className="space-y-4 pt-2">
              {saveStatus && (
                <InlineAlert tone={saveStatus.ok ? "success" : "danger"}>
                  {saveStatus.message}
                </InlineAlert>
              )}

              {/* Brand Accent Color */}
              <div>
                <span className="text-sm font-medium text-foreground block mb-2">
                  {t("Brand Accent Color", "ব্র্যান্ড অ্যাকসেন্ট কালার")}
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateCurrent({ brandColor: color })}
                        className={`size-7 rounded-full border-2 transition-transform ${
                          currentTpl.brandColor === color
                            ? "scale-110 border-foreground shadow-sm"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 border border-border rounded-fq-md px-2 py-1 bg-background text-xs">
                    <Palette className="size-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={currentTpl.brandColor || "#0f172a"}
                      onChange={(e) =>
                        updateCurrent({ brandColor: e.target.value })
                      }
                      className="w-16 bg-transparent outline-none font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Logo URL */}
              <Field
                label={t("Brand Logo URL (Optional)", "লোগো URL (ঐচ্ছিক)")}
                hint="Hosted image URL displayed at top of email"
              >
                <input
                  type="url"
                  className={inputClass}
                  placeholder="https://example.com/logo.png"
                  value={currentTpl.logoUrl || ""}
                  onChange={(e) => updateCurrent({ logoUrl: e.target.value })}
                />
              </Field>

              {/* Header Title */}
              <Field
                label={t("Banner Heading", "ব্যানার হেডিং")}
                hint="Main headline at the top of the email card"
              >
                <input
                  type="text"
                  className={inputClass}
                  required
                  value={currentTpl.headerTitle || ""}
                  onChange={(e) =>
                    updateCurrent({ headerTitle: e.target.value })
                  }
                />
              </Field>

              {/* Subject Line */}
              <Field
                label={t("Subject Line", "সাবজেক্ট")}
                hint="Email subject as seen in customer's inbox"
              >
                <input
                  type="text"
                  className={inputClass}
                  required
                  value={currentTpl.subjectTemplate || ""}
                  onChange={(e) =>
                    updateCurrent({ subjectTemplate: e.target.value })
                  }
                />
              </Field>

              {/* Body Copy */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {t("Email Body Copy", "ইমেইল বার্তা")}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="size-3.5 text-primary" />
                    <span>{t("Insert Tag:", "ট্যাগ যুক্ত করুন:")}</span>
                    {[
                      "customer_name",
                      "store_name",
                      "order_number",
                      "total_amount",
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertTag(tag)}
                        className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[11px] font-mono text-foreground transition-colors"
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={6}
                  className={`${inputClass} resize-y font-sans`}
                  required
                  value={currentTpl.bodyTemplate || ""}
                  onChange={(e) =>
                    updateCurrent({ bodyTemplate: e.target.value })
                  }
                />
              </div>

              {/* CTA Button */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t("Button Text", "বাটনের লেখা")}>
                  <input
                    type="text"
                    className={inputClass}
                    value={currentTpl.ctaText || ""}
                    onChange={(e) => updateCurrent({ ctaText: e.target.value })}
                  />
                </Field>
                <Field label={t("Button URL", "বাটনের লিংক")}>
                  <input
                    type="text"
                    className={inputClass}
                    value={currentTpl.ctaUrl || ""}
                    onChange={(e) => updateCurrent({ ctaUrl: e.target.value })}
                  />
                </Field>
              </div>

              {/* Custom Footer */}
              <Field
                label={t("Footer Text", "ফুটার বার্তা")}
                hint="Store address, copyright or support note"
              >
                <input
                  type="text"
                  className={inputClass}
                  value={currentTpl.footerText || ""}
                  onChange={(e) =>
                    updateCurrent({ footerText: e.target.value })
                  }
                />
              </Field>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="submit"
                  disabled={saving}
                  className={`${btnPrimary} min-h-[44px] px-6`}
                >
                  {saving
                    ? t("Saving...", "সংরক্ষণ করা হচ্ছে...")
                    : t("Save Template Changes", "টেমপ্লেট সংরক্ষণ করুন")}
                </button>
              </div>
            </form>
          </SectionCard>

          {/* Test Dispatch Form */}
          <SectionCard
            title={t("Send Sample Preview", "নমুনা টেস্ট পাঠান")}
            hint={t(
              "Deliver a real test email with current customizations",
              "বর্তমান পরিবর্তনের নমুনা আপনার ইমেইলে পাঠান",
            )}
          >
            <form onSubmit={handleSendTest} className="space-y-3 pt-2">
              {testStatus && (
                <InlineAlert tone={testStatus.ok ? "success" : "danger"}>
                  {testStatus.message}
                </InlineAlert>
              )}
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  placeholder="your.email@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="submit"
                  disabled={sendingTest || !testEmail}
                  className={`${btnGhost} min-h-[44px] px-4 flex items-center gap-1.5`}
                >
                  <Send className="size-4" />
                  <span>
                    {sendingTest
                      ? t("Sending...", "পাঠানো হচ্ছে...")
                      : t("Send Test", "টেস্ট পাঠান")}
                  </span>
                </button>
              </div>
            </form>
          </SectionCard>
        </div>

        {/* Live Interactive Preview */}
        <div className="lg:col-span-6 lg:sticky lg:top-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("Live Render Preview", "লাইভ প্রিভিউ")}
            </span>
            <span className="text-xs text-muted-foreground">
              Subject:{" "}
              <strong className="text-foreground">{previewSubject}</strong>
            </span>
          </div>

          <div
            className={`mx-auto rounded-fq-lg border border-border shadow-md overflow-hidden transition-all duration-300 bg-background ${
              deviceView === "mobile" ? "max-w-[360px]" : "w-full"
            }`}
          >
            {/* Fake Email Client Browser Bar */}
            <div className="bg-muted/60 border-b border-border px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-red-400" />
                <span className="size-2.5 rounded-full bg-yellow-400" />
                <span className="size-2.5 rounded-full bg-green-400" />
              </div>
              <span className="ml-2 font-mono text-[11px] truncate">
                {previewSubject}
              </span>
            </div>

            {/* Email HTML Frame */}
            <div className="p-0 overflow-y-auto max-h-[620px]">
              <iframe
                title="Email Preview"
                srcDoc={previewHtml}
                className="w-full min-h-[580px] border-none bg-slate-50"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
