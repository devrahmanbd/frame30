import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  QrCode,
  KeyRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { recordAuthEventFn } from "@/lib/identity.functions";

export function TotpCard({
  showLinkToSecurity = false,
}: {
  showLinkToSecurity?: boolean;
}) {
  const { t } = useLang();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.some((f) => f.status === "verified");
      setEnrolled(Boolean(verified || (data?.totp?.length ?? 0) > 0));
    } catch {
      setEnrolled(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function startEnroll() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start enrollment",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!factorId) return;
    if (!code.trim() || code.trim().length < 6) {
      toast.error(t("Please enter a 6-digit code.", "৬ সংখ্যার কোড দিন।"));
      return;
    }
    setBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) {
        toast.error(challenge.error.message);
        return;
      }
      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) {
        toast.error(verify.error.message);
        return;
      }
      void recordAuthEventFn({
        data: { event: "mfa.enrolled", outcome: "ok" },
      }).catch(() => undefined);
      toast.success(
        t(
          "Two-factor authentication is now active!",
          "দুই-ধাপ যাচাই সফলভাবে চালু হয়েছে!",
        ),
      );
      setQr(null);
      setSecret(null);
      setFactorId(null);
      setCode("");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (
      !confirm(
        t(
          "Are you sure you want to disable two-factor authentication?",
          "আপনি কি নিশ্চিত দুই-ধাপ যাচাই বন্ধ করতে চান?",
        ),
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.[0];
      if (!totp) return;
      const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
      if (error) {
        toast.error(error.message);
        return;
      }
      void recordAuthEventFn({
        data: { event: "mfa.unenrolled", outcome: "ok" },
      }).catch(() => undefined);
      toast.success(
        t("Two-factor authentication disabled.", "দুই-ধাপ যাচাই বন্ধ হয়েছে।"),
      );
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success(
      t("Secret key copied to clipboard.", "সিক্রেট কোড কপি হয়েছে।"),
    );
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-fq-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t("Two-factor authentication (TOTP)", "দুই-ধাপ যাচাই (TOTP)")}
            </h2>
            {enrolled === true ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-3.5" />
                {t("Active & Enforced", "চালু ও সুরক্ষিত")}
              </span>
            ) : enrolled === false ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <ShieldAlert className="size-3.5" />
                {t("Recommended", "প্রস্তাবিত")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {t(
              "Protects your merchant account against password theft. When enabled, signing in requires a 6-digit verification code from Google Authenticator, Microsoft Authenticator, 1Password or Apple Keychain.",
              "পাসওয়ার্ড চুরি থেকে আপনার অ্যাকাউন্ট রক্ষা করে। চালু থাকলে লগইন করতে গুগল অথেনটিকেটর বা অ্যাপের ৬ সংখ্যার কোড লাগবে।",
            )}
          </p>
        </div>
      </div>

      {enrolled ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-fq-md border border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {t(
                "Your store login is protected with TOTP.",
                "আপনার স্টোর লগইন TOTP দিয়ে সুরক্ষিত।",
              )}
            </p>
            <p className="mt-0.5">
              {t(
                "High-risk operations like refunds, payouts, and store deletion also require TOTP verification.",
                "রিফান্ড, পেআউট এবং স্টোর পরিবর্তনের মতো সংবেদনশীল কাজের জন্যও TOTP কোড লাগবে।",
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {showLinkToSecurity && (
              <Link
                to="/dashboard/settings/security"
                className="inline-flex min-h-9 items-center justify-center rounded-fq-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
              >
                <KeyRound className="mr-1.5 size-3.5 text-muted-foreground" />
                {t(
                  "Manage Backup Codes & Active Sessions",
                  "ব্যাকআপ কোড ও সেশন পরিচালনা",
                )}
              </Link>
            )}

            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="min-h-9 rounded-fq-md border border-destructive/30 px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {busy
                ? t("Updating…", "পরিবর্তন হচ্ছে…")
                : t("Turn off two-factor", "দুই-ধাপ যাচাই বন্ধ করুন")}
            </button>
          </div>
        </div>
      ) : qr ? (
        <div className="mt-4 space-y-4 rounded-fq-md border border-border/80 bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <QrCode className="size-4 text-primary" />
            <span>
              {t(
                "Step 1: Scan this QR code with your authenticator app",
                "ধাপ ১: আপনার অথেনটিকেটর অ্যাপ দিয়ে QR কোডটি স্ক্যান করুন",
              )}
            </span>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              className="size-36 shrink-0 rounded-fq-md border border-border p-2 shadow-xs"
              style={{ backgroundColor: "#ffffff" }}
            >
              <img
                src={qr}
                alt={t("Two-factor QR code", "দুই-ধাপ যাচাইয়ের QR কোড")}
                className="size-full object-contain"
              />
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">
                {t(
                  "Can't scan? Copy the secret key below and paste it manually into your authenticator app:",
                  "স্ক্যান করতে পারছেন না? নিচের কোডটি কপি করে অ্যাপে ম্যানুয়ালি বসান:",
                )}
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded-fq-sm border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] font-semibold text-foreground select-all">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="inline-flex size-8 items-center justify-center rounded-fq-md border border-border bg-background text-muted-foreground hover:text-foreground"
                  title={t("Copy secret", "কপি করুন")}
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              {t(
                "Step 2: Enter the 6-digit code shown in your app",
                "ধাপ ২: অ্যাপে প্রদর্শিত ৬ সংখ্যার কোড দিন",
              )}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="min-h-10 w-36 rounded-fq-md border border-input bg-background px-3 text-sm font-mono tracking-widest text-center text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <button
                type="button"
                onClick={confirmEnroll}
                disabled={busy || code.trim().length < 6}
                className="min-h-10 rounded-fq-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy
                  ? t("Activating…", "চালু হচ্ছে…")
                  : t("Confirm & Activate", "নিশ্চিত ও চালু করুন")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQr(null);
                  setSecret(null);
                  setFactorId(null);
                  setCode("");
                }}
                className="min-h-10 rounded-fq-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {t("Cancel", "বাতিল")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startEnroll}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-fq-md bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:opacity-90 disabled:opacity-50"
          >
            <ShieldCheck className="mr-1.5 size-4" />
            {busy
              ? t("Generating QR…", "তৈরি হচ্ছে…")
              : t(
                  "Set up two-factor authentication (TOTP)",
                  "দুই-ধাপ যাচাই (TOTP) চালু করুন",
                )}
          </button>

          {showLinkToSecurity && (
            <Link
              to="/dashboard/settings/security"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {t("View full security settings", "সম্পূর্ণ নিরাপত্তা সেটিংস")}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
