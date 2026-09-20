/* Hallmark · genre: modern-minimal · macrostructure: Centered Focus · theme: monochrome-restraint · nav: N1 Wordmark minimal · footer: Ft2 Inline single line */
/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 · Anti-AI-slop verified */

import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang, LanguageProvider } from "@/lib/i18n";
import { BrandLogo } from "@/components/public/BrandLogo";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import {
  consumeRecoveryCodeFn,
  recordAuthEventFn,
  registerSessionFn,
  requestPasswordResetFn,
  signInGuardFn,
} from "@/lib/identity.functions";
import {
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ChevronDown,
  ArrowLeft,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; mode?: "signin" | "signup" | "reset" } => ({
    redirect:
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined,
    mode:
      search.mode === "signup" ||
      search.mode === "signin" ||
      search.mode === "reset"
        ? search.mode
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Merchant Console Authentication — Framique" },
      {
        name: "description",
        content:
          "Sign in or register for Framique to build, host, and scale your storefront with zero transaction fees.",
      },
      {
        property: "og:title",
        content: "Merchant Console Authentication — Framique",
      },
      {
        property: "og:description",
        content:
          "Merchant console login and registration for Framique cloud commerce.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset";
type Stage = "credentials" | "mfa";

const INDUSTRIES = [
  { value: "fashion", en: "Fashion & Apparel", bn: "ফ্যাশন ও পোশাক" },
  {
    value: "electronics",
    en: "Electronics & Tech",
    bn: "ইলেকট্রনিক্স ও গ্যাজেট",
  },
  { value: "beauty", en: "Beauty & Cosmetics", bn: "কসমেটিক্স ও রূপচর্চা" },
  { value: "food", en: "Food & Grocery", bn: "খাবার ও মুদি" },
  { value: "home", en: "Home & Living", bn: "হোম ডেকর ও ফার্নিচার" },
  { value: "other", en: "Other Industry", bn: "অন্যান্য শিল্প" },
] as const;

const PREVIOUS_CMS_LIST = [
  {
    value: "none",
    en: "None — Starting first store",
    bn: "কোনোটি নয় — প্রথম স্টোর",
  },
  { value: "shopify", en: "Shopify", bn: "শপিফাই" },
  {
    value: "woocommerce",
    en: "WooCommerce / WordPress",
    bn: "উ-কমার্স / ওয়ার্ডপ্রেস",
  },
  {
    value: "facebook",
    en: "Facebook / Instagram only",
    bn: "শুধুমাত্র সোশ্যাল মিডিয়া",
  },
  { value: "other", en: "Other platform", bn: "অন্যান্য প্ল্যাটফর্ম" },
] as const;

/** Where a signed-in merchant belongs */
async function landingFor(
  userId: string,
  explicitRedirect?: string,
): Promise<string> {
  if (
    explicitRedirect &&
    explicitRedirect.startsWith("/") &&
    !explicitRedirect.startsWith("//") &&
    !explicitRedirect.startsWith("/root") &&
    !explicitRedirect.startsWith("/admin")
  ) {
    return explicitRedirect;
  }

  const { data: member } = await supabase
    .from("merchant_members")
    .select("merchant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (member) {
    return "/dashboard";
  }
  return "/onboarding";
}

function AuthPage() {
  return (
    <LanguageProvider initialLang="en">
      <AuthPageInner />
    </LanguageProvider>
  );
}

function AuthPageInner() {
  const { t } = useLang();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [stage, setStage] = useState<Stage>("credentials");

  // Signup fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [businessIndustry, setBusinessIndustry] = useState<string>("fashion");
  const [previousCms, setPreviousCms] = useState<string>("none");

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState(0);

  // MFA fields
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);

  // Sync mode with query parameter
  useEffect(() => {
    if (search.mode && search.mode !== mode) {
      setMode(search.mode);
      setErrorMsg(null);
      setNotice(null);
    }
  }, [search.mode, mode]);

  // If already logged in, redirect directly
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) {
        void afterSession();
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lockout timer
  useEffect(() => {
    if (lockedFor <= 0) return;
    const id = window.setInterval(
      () => setLockedFor((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [lockedFor]);

  async function afterSession(opts?: { skipTwoStep?: boolean }) {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return;

    if (session.user.user_metadata?.account_type === "customer") {
      await supabase.auth.signOut();
      setNotice(
        t(
          "Customer accounts cannot log in to Framique console. Please log in directly on your merchant storefront.",
          "কাস্টমার অ্যাকাউন্ট দিয়ে ফ্রেমিক কনসোলে লগ ইন করা যাবে না। অনুগ্রহ করে সরাসরি মার্চেন্টের ওয়েবসাইটে যান।",
        ),
      );
      return;
    }

    if (!opts?.skipTwoStep) {
      try {
        const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (
          aal.data?.currentLevel === "aal1" &&
          aal.data?.nextLevel === "aal2"
        ) {
          const factors = await supabase.auth.mfa.listFactors();
          const verifiedTotp =
            factors.data?.totp?.find((f) => f.status === "verified") ??
            factors.data?.totp?.[0];
          setFactorId(verifiedTotp?.id ?? null);
          setStage("mfa");
          return;
        }
      } catch {
        // Fall through
      }
    }

    try {
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      await registerSessionFn({
        data: {
          sessionId: session.access_token,
          aal: aal.data?.currentLevel ?? null,
        },
      });
    } catch {
      // Best effort
    }

    void recordAuthEventFn({
      data: {
        event: "signin.success",
        outcome: "ok",
        email: session.user.email ?? email,
      },
    }).catch(() => undefined);

    const dest = await landingFor(session.user.id, search.redirect);
    navigate({ to: dest });
  }

  function validateSignupBasics(): string | null {
    if (!email.trim() || !email.includes("@")) {
      return t(
        "Please provide a valid email address.",
        "অনুগ্রহ করে একটি সঠিক ইমেইল দিন।",
      );
    }
    if (password.length < 8) {
      return t(
        "Password must be at least 8 characters long.",
        "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।",
      );
    }
    if (password !== confirmPassword) {
      return t("Passwords do not match.", "পাসওয়ার্ড দুটি মিলছে না।");
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);

    if (mode === "signup") {
      const err = validateSignupBasics();
      if (err) {
        setErrorMsg(err);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "reset") {
        await requestPasswordResetFn({
          data: {
            email: email.trim(),
            redirectTo: `${window.location.origin}/reset-password`,
          },
        });

        setNotice(
          t(
            "If an account exists for that email, recovery instructions have been sent.",
            "ইমেইলটির অ্যাকাউন্ট থাকলে রিসেট লিংক ইনবক্সে পাঠানো হয়েছে।",
          ),
        );
        return;
      }

      if (mode === "signin") {
        const guard = await signInGuardFn({ data: { email: email.trim() } });
        if (!guard.allowed) {
          setLockedFor(guard.retryAfterSeconds);
          setNotice(
            t(
              `Too many attempts. Try again in ${guard.retryAfterSeconds}s.`,
              `অনেকবার চেষ্টা হয়েছে। ${guard.retryAfterSeconds} সেকেন্ড পরে আবার চেষ্টা করুন।`,
            ),
          );
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          void recordAuthEventFn({
            data: {
              event: "signin.failed",
              outcome: "denied",
              email: email.trim(),
            },
          }).catch(() => undefined);
          throw error;
        }

        await afterSession();
        return;
      }

      // Sign up flow
      const { registerMerchantFn } = await import("@/lib/identity.functions");
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      await registerMerchantFn({
        data: {
          email: email.trim(),
          password,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          fullName: fullName || undefined,
          businessIndustry: businessIndustry || undefined,
          previousCms: previousCms || undefined,
        },
      });

      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (signInError) throw signInError;

      if (data.session) {
        toast.success(
          t(
            "Account created successfully! Welcome to Framique.",
            "অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে! ফ্রেমিক-এ স্বাগতম।",
          ),
        );
        await afterSession();
      } else {
        setNotice(
          t(
            "Account created. Please check your email to confirm your address.",
            "অ্যাকাউন্ট তৈরি হয়েছে! নিশ্চিত করতে আপনার ইমেইল চেক করুন।",
          ),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      if (useBackup) {
        const res = await consumeRecoveryCodeFn({
          data: { code: code.trim() },
        });
        if (!res?.ok)
          throw new Error(
            t("That backup code is not valid.", "ব্যাকআপ কোডটি সঠিক নয়।"),
          );
        void recordAuthEventFn({
          data: { event: "mfa.challenge.success", outcome: "ok" },
        }).catch(() => undefined);
        setStage("credentials");
        setUseBackup(false);
        setCode("");
        toast.success(
          t(
            "Recovery code verified. Welcome back!",
            "ব্যাকআপ কোড যাচাই সম্পন্ন হয়েছে!",
          ),
        );
        await afterSession({ skipTwoStep: true });
        return;
      }

      let activeFactorId = factorId;
      if (!activeFactorId) {
        const factors = await supabase.auth.mfa.listFactors();
        const verifiedTotp =
          factors.data?.totp?.find((f) => f.status === "verified") ??
          factors.data?.totp?.[0];
        activeFactorId = verifiedTotp?.id ?? null;
      }
      if (!activeFactorId) {
        throw new Error(
          t(
            "No authenticator factor found for this account.",
            "কোনো অথেনটিকেটর ফ্যাক্টর পাওয়া যায়নি।",
          ),
        );
      }

      const challenge = await supabase.auth.mfa.challenge({
        factorId: activeFactorId,
      });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: activeFactorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) {
        void recordAuthEventFn({
          data: { event: "mfa.challenge.failed", outcome: "denied", email },
        }).catch(() => undefined);
        throw verify.error;
      }
      void recordAuthEventFn({
        data: { event: "mfa.challenge.success", outcome: "ok" },
      }).catch(() => undefined);
      setStage("credentials");
      setCode("");
      toast.success(
        t("Two-factor verification successful!", "দুই-ধাপ যাচাই সফল হয়েছে!"),
      );
      await afterSession();
    } catch (err) {
      void recordAuthEventFn({
        data: { event: "mfa.challenge.failed", outcome: "denied", email },
      }).catch(() => undefined);
      const msg = err instanceof Error ? err.message : "Verification failed";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const isPasswordMatch =
    mode !== "signup" ||
    confirmPassword.length === 0 ||
    password === confirmPassword;

  return (
    <main className="fq-site min-h-screen flex flex-col justify-between overflow-x-clip bg-background text-foreground selection:bg-primary/20 selection:text-primary antialiased">
      {/* ── Top Navigation Bar ── */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between px-6 py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 text-foreground hover:opacity-80 transition-opacity"
        >
          <BrandLogo size={28} />
          <span className="font-semibold tracking-tight text-base sm:text-lg">
            Framique
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>{t("Back to home", "হোমে ফিরে যান")}</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Center Auth Container ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-[400px] space-y-6">
          {/* Main Card Surface */}
          <div className="rounded-2xl border border-border/80 bg-card/60 dark:bg-card/40 p-6 sm:p-8 shadow-xs backdrop-blur-xs space-y-6">
            {/* Header Titles */}
            <div className="space-y-1.5 text-center">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                {stage === "mfa"
                  ? t("Two-factor verification", "দুই-ধাপ নিরাপত্তা যাচাই")
                  : mode === "signup"
                    ? t(
                        "Create your merchant account",
                        "মার্চেন্ট অ্যাকাউন্ট তৈরি করুন",
                      )
                    : mode === "signin"
                      ? t("Sign in to Framique", "ফ্রেমিক-এ সাইন ইন করুন")
                      : t("Reset your password", "পাসওয়ার্ড রিসেট করুন")}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground leading-normal">
                {stage === "mfa"
                  ? t(
                      "Enter the 6-digit code from your authenticator app.",
                      "আপনার অথেনটিকেটর অ্যাপ থেকে ৬ সংখ্যার কোডটি দিন।",
                    )
                  : mode === "signup"
                    ? t(
                        "Start your 14-day free trial. Zero transaction fees.",
                        "১৪ দিনের ফ্রি ট্রায়াল শুরু করুন। কোনো ট্রানজ্যাকশন ফি নেই।",
                      )
                    : mode === "signin"
                      ? t(
                          "Enter your email and password to access your console.",
                          "আপনার কনসোলে প্রবেশ করতে তথ্য দিন।",
                        )
                      : t(
                          "Enter your registered email to receive recovery instructions.",
                          "পাসওয়ার্ড রিসেট লিংক পেতে আপনার নিবন্ধিত ইমেইল দিন।",
                        )}
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            {stage === "credentials" && mode !== "reset" && (
              <div
                role="tablist"
                aria-label={t("Authentication mode", "অথেনটিকেশন মোড")}
                className="grid grid-cols-2 rounded-lg bg-muted/60 p-1 text-xs font-medium"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signin"}
                  onClick={() => {
                    setMode("signin");
                    setErrorMsg(null);
                    setNotice(null);
                  }}
                  className={`min-h-9 rounded-md py-1.5 transition-colors text-center ${
                    mode === "signin"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("Sign In", "সাইন ইন")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signup"}
                  onClick={() => {
                    setMode("signup");
                    setErrorMsg(null);
                    setNotice(null);
                  }}
                  className={`min-h-9 rounded-md py-1.5 transition-colors text-center ${
                    mode === "signup"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("Create Account", "অ্যাকাউন্ট তৈরি")}
                </button>
              </div>
            )}

            {/* Notifications / Alerts */}
            {notice && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 p-3 text-xs text-foreground leading-relaxed"
              >
                <CheckCircle2 className="size-4 shrink-0 text-primary mt-0.5" />
                <span>{notice}</span>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive leading-relaxed"
              >
                <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ── Stage: MFA Authentication ─────────────────────────────── */}
            {stage === "mfa" ? (
              <form onSubmit={onVerifyMfa} className="space-y-4">
                <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <ShieldCheck className="size-4 text-primary" />
                    <span>
                      {t("Two-Factor Authentication", "দুই-ধাপ নিরাপত্তা")}
                    </span>
                  </div>
                  <p>
                    {useBackup
                      ? t(
                          "Enter one of your saved 8-character backup recovery codes.",
                          "আপনার সংরক্ষিত ৮-অক্ষরের একক-ব্যবহারের ব্যাকআপ কোড দিন।",
                        )
                      : t(
                          "Open your authenticator app (Google Authenticator, 1Password, or Keychain) to get your code.",
                          "আপনার অথেনটিকেটর অ্যাপ থেকে ৬ সংখ্যার কোডটি লিখুন।",
                        )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    {useBackup
                      ? t("Backup recovery code", "ব্যাকআপ রিকভারি কোড")
                      : t(
                          "Authenticator 6-digit code",
                          "অথেনটিকেটর ৬ সংখ্যার কোড",
                        )}
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={useBackup ? 16 : 6}
                    value={code}
                    onChange={(e) => {
                      const val = useBackup
                        ? e.target.value.toUpperCase()
                        : e.target.value.replace(/\D/g, "");
                      setCode(val);
                    }}
                    autoComplete="one-time-code"
                    placeholder={useBackup ? "XXXX-XXXX" : "123456"}
                    className={`min-h-11 w-full rounded-lg border border-border bg-background px-3.5 text-center font-mono text-foreground outline-none transition-colors hover:border-foreground/20 focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground ${
                      useBackup
                        ? "text-sm tracking-wider"
                        : "text-lg tracking-[0.25em]"
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={
                    busy ||
                    !code.trim() ||
                    (!useBackup && code.trim().length < 6)
                  }
                  className="min-h-11 w-full rounded-lg bg-foreground text-background font-medium text-sm hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>{t("Verifying…", "যাচাই হচ্ছে…")}</span>
                    </>
                  ) : (
                    t("Verify and continue", "যাচাই করে এগিয়ে যান")
                  )}
                </button>

                <div className="flex flex-col items-center gap-2 pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackup(!useBackup);
                      setCode("");
                      setErrorMsg(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
                  >
                    {useBackup
                      ? t(
                          "Use authenticator 6-digit code instead",
                          "অথেনটিকেটর অ্যাপের ৬ সংখ্যার কোড ব্যবহার করুন",
                        )
                      : t(
                          "Lost your authenticator device? Use backup code",
                          "অথেনটিকেটর ডিভাইস হারিয়েছেন? ব্যাকআপ কোড দিন",
                        )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void supabase.auth.signOut();
                      setStage("credentials");
                      setMode("signin");
                      setCode("");
                      setErrorMsg(null);
                      setNotice(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-1 transition-colors"
                  >
                    <ArrowLeft className="size-3.5" aria-hidden="true" />
                    <span>
                      {t(
                        "Sign in with another account",
                        "অন্য অ্যাকাউন্ট দিয়ে সাইন ইন করুন",
                      )}
                    </span>
                  </button>
                </div>
              </form>
            ) : (
              /* ── Stage: Credentials (Signin, Signup, Reset) ─────────────── */
              <form onSubmit={onSubmit} className="space-y-4">
                {/* Signup Name Fields */}
                {mode === "signup" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">
                        {t("First name", "প্রথম নাম")}
                      </label>
                      <input
                        required
                        type="text"
                        maxLength={100}
                        autoComplete="given-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Amina"
                        className="min-h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors hover:border-foreground/20 focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-foreground">
                        {t("Last name", "শেষ নাম")}
                      </label>
                      <input
                        required
                        type="text"
                        maxLength={100}
                        autoComplete="family-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Rahman"
                        className="min-h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors hover:border-foreground/20 focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground"
                      />
                    </div>
                  </div>
                )}

                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    {mode === "signup"
                      ? t("Work email", "কাজের ইমেইল")
                      : t("Email address", "ইমেইল অ্যাড্রেস")}
                  </label>
                  <input
                    required
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="merchant@yourbrand.com"
                    className="min-h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors hover:border-foreground/20 focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground"
                  />
                </div>

                {/* Password Fields */}
                {mode !== "reset" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-foreground">
                          {t("Password", "পাসওয়ার্ড")}
                        </label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            onClick={() => {
                              setMode("reset");
                              setErrorMsg(null);
                              setNotice(null);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {t("Forgot password?", "ভুলে গেছেন?")}
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          required
                          type={showPassword ? "text" : "password"}
                          minLength={8}
                          autoComplete={
                            mode === "signin"
                              ? "current-password"
                              : "new-password"
                          }
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="min-h-11 w-full rounded-lg border border-border bg-background pl-3.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors hover:border-foreground/20 focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-3 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {mode === "signup" && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-foreground">
                          {t("Confirm password", "পাসওয়ার্ড নিশ্চিত করুন")}
                        </label>
                        <div className="relative">
                          <input
                            required
                            type={showConfirmPassword ? "text" : "password"}
                            minLength={8}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className={`min-h-11 w-full rounded-lg border bg-background pl-3.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-1 ${
                              !isPasswordMatch
                                ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive"
                                : "border-border focus-visible:border-foreground focus-visible:ring-foreground"
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            className="absolute right-2.5 top-3 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                            aria-label={
                              showConfirmPassword
                                ? "Hide password"
                                : "Show password"
                            }
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                        {confirmPassword && !isPasswordMatch && (
                          <p className="text-[11px] text-destructive">
                            {t(
                              "Passwords do not match.",
                              "পাসওয়ার্ড দুটি মিলছে না।",
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Optional Store Details (Progressive Disclosure) */}
                {mode === "signup" && (
                  <details className="group pt-0.5">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none list-none inline-flex items-center gap-1.5">
                      <ChevronDown className="size-3.5 transition-transform duration-150 group-open:rotate-180" />
                      <span>
                        {t("Optional store details", "ঐচ্ছিক স্টোর তথ্য")}
                      </span>
                    </summary>
                    <div className="mt-3 space-y-3 pt-2 border-t border-border/50">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-foreground">
                          {t("Industry", "ব্যবসার ধরন")}
                        </label>
                        <select
                          value={businessIndustry}
                          onChange={(e) => setBusinessIndustry(e.target.value)}
                          className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors hover:border-foreground/20 focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground"
                        >
                          {INDUSTRIES.map((ind) => (
                            <option key={ind.value} value={ind.value}>
                              {t(ind.en, ind.bn)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-foreground">
                          {t("Previous platform", "আগের প্ল্যাটফর্ম")}
                        </label>
                        <select
                          value={previousCms}
                          onChange={(e) => setPreviousCms(e.target.value)}
                          className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors hover:border-foreground/20 focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground"
                        >
                          {PREVIOUS_CMS_LIST.map((cms) => (
                            <option key={cms.value} value={cms.value}>
                              {t(cms.en, cms.bn)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </details>
                )}

                {/* Legal terms disclaimer */}
                {mode === "signup" && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                    {t(
                      "By continuing, you agree to our ",
                      "অ্যাকাউন্ট তৈরির মাধ্যমে আপনি আমাদের ",
                    )}
                    <Link
                      to="/legal"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {t("Terms", "শর্তাবলী")}
                    </Link>{" "}
                    {t("and ", "ও ")}
                    <Link
                      to="/legal"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {t("Privacy Policy", "গোপনীয়তা নীতি")}
                    </Link>
                    .
                  </p>
                )}

                {/* Primary Submit CTA */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={
                      busy ||
                      lockedFor > 0 ||
                      (mode === "signup" && !isPasswordMatch)
                    }
                    className="min-h-11 w-full rounded-lg bg-foreground text-background font-medium text-sm hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        <span>
                          {mode === "reset"
                            ? t("Sending…", "পাঠানো হচ্ছে…")
                            : mode === "signup"
                              ? t("Creating account…", "তৈরি হচ্ছে…")
                              : t("Signing in…", "সাইন ইন হচ্ছে…")}
                        </span>
                      </>
                    ) : lockedFor > 0 ? (
                      t(
                        `Locked · Retry in ${lockedFor}s`,
                        `লক · ${lockedFor} সেকেন্ডে পুনরায় চেষ্টা করুন`,
                      )
                    ) : mode === "signup" ? (
                      t("Create account", "অ্যাকাউন্ট তৈরি করুন")
                    ) : mode === "signin" ? (
                      t("Sign in", "সাইন ইন করুন")
                    ) : (
                      t(
                        "Send reset instructions",
                        "পাসওয়ার্ড রিসেট লিংক পাঠান",
                      )
                    )}
                  </button>
                </div>

                {/* Secondary Switchers */}
                <div className="pt-2 text-center text-xs text-muted-foreground">
                  {mode === "signup" ? (
                    <p>
                      {t(
                        "Already have an account? ",
                        "ইতিমধ্যে অ্যাকাউন্ট আছে? ",
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMode("signin");
                          setErrorMsg(null);
                          setNotice(null);
                        }}
                        className="font-medium text-foreground hover:underline underline-offset-4 transition-colors"
                      >
                        {t("Sign in", "সাইন ইন")}
                      </button>
                    </p>
                  ) : mode === "signin" ? (
                    <p>
                      {t("New to Framique? ", "ফ্রেমিক-এ নতুন? ")}
                      <button
                        type="button"
                        onClick={() => {
                          setMode("signup");
                          setErrorMsg(null);
                          setNotice(null);
                        }}
                        className="font-medium text-foreground hover:underline underline-offset-4 transition-colors"
                      >
                        {t("Create an account", "অ্যাকাউন্ট খুলুন")}
                      </button>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        setErrorMsg(null);
                        setNotice(null);
                      }}
                      className="font-medium text-foreground hover:underline underline-offset-4 transition-colors"
                    >
                      {t("Back to sign in", "সাইন ইন-এ ফিরে যান")}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── Minimal Colophon Footer ── */}
      <footer className="w-full max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground border-t border-border/40">
        <p>
          © {new Date().getFullYear()} Framique Technologies. Sovereign Cloud
          Commerce.
        </p>
        <div className="flex items-center gap-4">
          <Link to="/legal" className="hover:text-foreground transition-colors">
            {t("Terms", "শর্তাবলী")}
          </Link>
          <Link to="/legal" className="hover:text-foreground transition-colors">
            {t("Privacy", "গোপনীয়তা")}
          </Link>
        </div>
      </footer>
    </main>
  );
}
