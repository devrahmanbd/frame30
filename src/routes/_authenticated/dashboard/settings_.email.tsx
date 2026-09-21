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
  saveSmtpConfigFn,
  testSmtpConnectionFn,
} from "@/lib/email-settings.functions";
import { useLang } from "@/lib/i18n";
import { Send, AlertCircle } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/dashboard/settings_/email",
)({
  loader: async () => {
    return await getEmailSettingsFn();
  },
  head: () => ({
    meta: [
      { title: "Email & SMTP Settings — Framique Admin" },
      {
        name: "description",
        content:
          "Configure custom SMTP provider, verify connection, and manage outbound email delivery.",
      },
      { property: "og:title", content: "Email & SMTP Settings" },
      { property: "robots", content: "noindex" },
    ],
  }),
  component: EmailSettingsPage,
});

type LoaderData = Awaited<ReturnType<typeof getEmailSettingsFn>>;

function EmailSettingsPage() {
  const { t } = useLang();
  const initial = Route.useLoaderData() as LoaderData;

  const [smtp, setSmtp] = useState(initial.smtp);
  const [form, setForm] = useState({
    enabled: initial.smtp.enabled,
    host: initial.smtp.host || "",
    port: initial.smtp.port || 587,
    secure: initial.smtp.secure || false,
    user: initial.smtp.user || "",
    password: "",
    fromName: initial.smtp.fromName || "",
    fromEmail: initial.smtp.fromEmail || "",
    replyTo: initial.smtp.replyTo || "",
  });

  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [testStatus, setTestStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const saveSmtp = useServerFn(saveSmtpConfigFn);
  const testConnection = useServerFn(testSmtpConnectionFn);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await saveSmtp({
        data: {
          enabled: form.enabled,
          host: form.host,
          port: Number(form.port),
          secure: form.secure,
          user: form.user,
          password: form.password || undefined,
          fromName: form.fromName,
          fromEmail: form.fromEmail,
          replyTo: form.replyTo || undefined,
        },
      });
      setSmtp(res);
      setForm((prev) => ({ ...prev, password: "" }));
      setSaveStatus({
        ok: true,
        message: t(
          "SMTP settings saved and credentials sealed successfully.",
          "এসএমটিপি সেটিংস সংরক্ষিত এবং এনক্রিপ্ট করা হয়েছে।",
        ),
      });
    } catch (err) {
      setSaveStatus({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : t("Failed to save settings.", "সেটিংস সংরক্ষণ ব্যর্থ হয়েছে।"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) return;
    setTesting(true);
    setTestStatus(null);
    try {
      const res = await testConnection({
        data: {
          recipientEmail: testEmail,
          adhocConfig: {
            host: form.host,
            port: Number(form.port),
            secure: form.secure,
            user: form.user,
            password: form.password || undefined,
            fromName: form.fromName,
            fromEmail: form.fromEmail,
            replyTo: form.replyTo || undefined,
          },
        },
      });
      if (res.ok) {
        setTestStatus({
          ok: true,
          message:
            res.message ||
            t(
              "Connection verified and test email sent!",
              "সংযোগ যাচাই হয়েছে এবং টেস্ট ইমেইল পাঠানো হয়েছে!",
            ),
        });
      } else {
        setTestStatus({
          ok: false,
          message:
            res.error ||
            t("Connection test failed.", "সংযোগ পরীক্ষা ব্যর্থ হয়েছে।"),
        });
      }
    } catch (err) {
      setTestStatus({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : t("Error running test.", "পরীক্ষা চলাকালীন সমস্যা হয়েছে।"),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header — single quiet block; the global SectionTabs strip above
          already handles Settings navigation. */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-bangla-display text-2xl font-bold tracking-tight text-foreground">
            {t("Email & SMTP Gateway", "ইমেইল ও এসএমটিপি গেটওয়ে")}
          </h1>
          <StatusPill
            tone={
              smtp.enabled && smtp.configured
                ? "success"
                : smtp.configured
                  ? "warning"
                  : "neutral"
            }
            label={
              smtp.enabled && smtp.configured
                ? t("Custom SMTP Active", "কাস্টম এসএমটিপি সক্রিয়")
                : smtp.configured
                  ? t("Configured (Paused)", "সংরক্ষিত (স্থগিত)")
                  : t("Platform Default", "প্ল্যাটফর্ম ডিফল্ট")
            }
          />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "Connect SendGrid, Mailgun, Postmark, AWS SES, or private SMTP to send store emails and newsletters from your verified domain.",
            "আপনার নিজস্ব ডোমেইন থেকে ইমেইল পাঠাতে সেন্ডগ্রিড, মেইলগান, পোস্টমার্ক বা নিজস্ব এসএমটিপি যুক্ত করুন।",
          )}
        </p>
      </div>

      {/* Main Settings Form — single column, quiet order:
          config first, test second. The header StatusPill already
          carries provider/state, so no overview cards. */}
          <SectionCard
            title={t(
              "SMTP Server Configuration",
              "এসএমটিপি সার্ভার কনফিগারেশন",
            )}
            subtitle={t(
              "Enter your outbound host and credential details",
              "আপনার আউটবাউন্ড হোস্ট ও অ্যাকাউন্টের বিবরণ দিন",
            )}
          >
            <form onSubmit={handleSave} className="space-y-4 pt-2">
              {saveStatus && (
                <InlineAlert
                  tone={saveStatus.ok ? "success" : "danger"}
                  message={saveStatus.message}
                />
              )}

              <div className="flex items-center justify-between p-3 rounded-fq-md border border-border bg-muted/30">
                <div>
                  <span className="font-medium text-sm text-foreground">
                    {t(
                      "Enable Custom SMTP Delivery",
                      "কাস্টম এসএমটিপি ডেলিভারি সক্রিয় করুন",
                    )}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "When disabled, emails fall back to the platform Resend gateway.",
                      "বন্ধ থাকলে ইমেইল প্ল্যাটফর্মের রেজেন্ড গেটওয়ে দিয়ে পাঠানো হবে।",
                    )}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.checked })
                  }
                  className="size-5 accent-primary cursor-pointer"
                  aria-label="Enable custom SMTP"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Field
                    label={t("SMTP Host", "এসএমটিপি হোস্ট")}
                    hint="e.g. smtp.sendgrid.net or smtp.mailgun.org"
                  >
                    <input
                      type="text"
                      className={inputClass}
                      required
                      placeholder="smtp.example.com"
                      value={form.host}
                      onChange={(e) =>
                        setForm({ ...form, host: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div>
                  <Field label={t("Port", "পোর্ট")} hint="587, 465, or 25">
                    <input
                      type="number"
                      className={inputClass}
                      required
                      value={form.port}
                      onChange={(e) =>
                        setForm({ ...form, port: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
              </div>

              <div className="p-3 rounded-fq-md border border-border bg-muted/20">
                <span className="text-xs font-medium text-foreground block mb-2">
                  {t("Encryption Protocol", "এনক্রিপশন প্রোটোকল")}
                </span>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="secure"
                      checked={!form.secure}
                      onChange={() =>
                        setForm({ ...form, secure: false, port: 587 })
                      }
                      className="accent-primary"
                    />
                    <span>STARTTLS (Port 587/25 - Recommended)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="secure"
                      checked={form.secure}
                      onChange={() =>
                        setForm({ ...form, secure: true, port: 465 })
                      }
                      className="accent-primary"
                    />
                    <span>SSL / Direct TLS (Port 465)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label={t(
                    "Username / API Key Name",
                    "ইউজারনেম / এপিআই কী নাম",
                  )}
                  hint="e.g. apikey or your username"
                >
                  <input
                    type="text"
                    className={inputClass}
                    value={form.user}
                    onChange={(e) => setForm({ ...form, user: e.target.value })}
                  />
                </Field>

                <Field
                  label={t(
                    "Password / API Secret",
                    "পাসওয়ার্ড / এপিআই সিক্রেট",
                  )}
                  hint={
                    smtp.hasPassword && !form.password
                      ? t(
                          "Sealed at rest. Leave blank to keep current password.",
                          "এনক্রিপ্ট করা আছে। পরিবর্তন না করতে চাইলে ফাঁকা রাখুন।",
                        )
                      : t(
                          "Stored encrypted with AES-GCM.",
                          "AES-GCM দিয়ে সুরক্ষিত সংরক্ষণ করা হবে।",
                        )
                  }
                >
                  <input
                    type="password"
                    className={inputClass}
                    placeholder={
                      smtp.hasPassword
                        ? "••••••••••••••••"
                        : t("Enter password or API key", "পাসওয়ার্ড দিন")
                    }
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label={t("From Name", "প্রেরকের নাম")}
                  hint="e.g. Acme Fashion"
                >
                  <input
                    type="text"
                    className={inputClass}
                    required
                    placeholder="My Store"
                    value={form.fromName}
                    onChange={(e) =>
                      setForm({ ...form, fromName: e.target.value })
                    }
                  />
                </Field>

                <Field
                  label={t("From Email", "প্রেরকের ইমেইল")}
                  hint="Must be verified on your provider"
                >
                  <input
                    type="email"
                    className={inputClass}
                    required
                    placeholder="orders@mystore.com"
                    value={form.fromEmail}
                    onChange={(e) =>
                      setForm({ ...form, fromEmail: e.target.value })
                    }
                  />
                </Field>
              </div>

              <Field
                label={t(
                  "Reply-To Email (Optional)",
                  "রিপ্লাই-টু ইমেইল (ঐচ্ছিক)",
                )}
                hint="Where customer replies should be routed"
              >
                <input
                  type="email"
                  className={inputClass}
                  placeholder="support@mystore.com"
                  value={form.replyTo}
                  onChange={(e) =>
                    setForm({ ...form, replyTo: e.target.value })
                  }
                />
              </Field>

              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className={`${btnPrimary} min-h-[44px] px-5`}
                >
                  {saving
                    ? t("Saving & Sealing...", "সংরক্ষণ করা হচ্ছে...")
                    : t(
                        "Save SMTP Configuration",
                        "এসএমটিপি সেটিংস সংরক্ষণ করুন",
                      )}
                </button>
              </div>
            </form>
          </SectionCard>

        {/* Test Connection Card */}
          <SectionCard
            title={t("Test Connection", "সংযোগ পরীক্ষা")}
            subtitle={t(
              "Verify credentials and send a test message",
              "সার্ভার যাচাই করে টেস্ট ইমেইল পাঠান",
            )}
          >
            <form onSubmit={handleTest} className="space-y-4 pt-2">
              {testStatus && (
                <InlineAlert
                  tone={testStatus.ok ? "success" : "danger"}
                  message={testStatus.message}
                />
              )}

              <Field
                label={t("Send Test Email To", "টেস্ট ইমেইল প্রাপক")}
                hint="Recipient email to receive test message"
              >
                <input
                  type="email"
                  className={inputClass}
                  required
                  placeholder="you@domain.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </Field>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {t(
                  "Sends a live probe that verifies the socket handshake, EHLO, and authentication without affecting customer communications.",
                  "এটি সার্ভারের হ্যান্ডশেক ও অথেন্টিকেশন যাচাই করে আপনার কাছে একটি পরীক্ষামূলক বার্তা পাঠাবে।",
                )}
              </p>

              <button
                type="submit"
                disabled={testing || !testEmail}
                className={`${btnGhost} w-full min-h-[44px] flex items-center justify-center gap-2`}
              >
                <Send className="size-4" />
                {testing
                  ? t("Testing Gateway...", "পরীক্ষা করা হচ্ছে...")
                  : t("Send Test Email", "টেস্ট ইমেইল পাঠান")}
              </button>
            </form>
          </SectionCard>

          <div className="rounded-fq-lg border border-border bg-muted/10 p-4 text-xs space-y-2 text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <AlertCircle className="size-4 text-primary" />
              <span>
                {t("Deliverability Best Practices", "ডেলিভারেবিলিটি পরামর্শ")}
              </span>
            </div>
            <p>
              {t(
                "Ensure SPF and DKIM records are configured on your domain DNS so customer mailboxes do not route messages to spam.",
                "আপনার ডোমেইনে SPF এবং DKIM রেকর্ড যুক্ত রাখুন যাতে ইমেইল স্প্যাম ফোল্ডারে না যায়।",
              )}
            </p>
          </div>
    </div>
  );
}
