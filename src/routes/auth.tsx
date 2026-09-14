import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import {
  consumeRecoveryCodeFn,
  recordAuthEventFn,
  registerSessionFn,
  requestPasswordResetFn,
  signInGuardFn,
} from "@/lib/identity.functions";


export const Route = createFileRoute("/auth")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; mode?: "signin" | "signup" | "reset"; accountType?: "merchant" | "customer" } => ({
    redirect:
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined,
    mode:
      search.mode === "signup" || search.mode === "signin" || search.mode === "reset"
        ? search.mode
        : undefined,
    accountType:
      search.accountType === "customer" || search.accountType === "merchant"
        ? search.accountType
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Framique merchant admin" },
      {
        name: "description",
        content:
          "Sign in to Framique with email, Google or a two-factor code to manage your Bangladeshi storefront, catalog, orders and payouts.",
      },
      { property: "og:title", content: "Sign in to Framique" },
      {
        property: "og:description",
        content: "Merchant login for the Framique commerce admin. Two-factor ready.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset";
type Stage = "credentials" | "mfa";

const OWNER_EMAIL = "devrahmanbd@gmail.com";

/**
 * Where a signed-in person belongs.
 * 1. Honors explicit redirect target if provided.
 * 2. Framique owner lands in /root.
 * 3. Shop staff and merchant owners land in /admin.
 * 4. Platform owners land in /root.
 * 5. Everyone else is a shopper/appointee and lands in /dashboard.
 */
async function landingFor(
  userId: string,
  explicitRedirect?: string,
  userEmail?: string | null,
): Promise<string> {
  if (explicitRedirect && explicitRedirect.startsWith("/") && !explicitRedirect.startsWith("//")) {
    return explicitRedirect;
  }
  if (userEmail && userEmail.toLowerCase() === OWNER_EMAIL) {
    return "/root";
  }
  const [owner, member] = await Promise.all([
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase
      .from("merchant_members")
      .select("merchant_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  if (owner.data) return "/root";
  if (member.data) return "/admin";
  return "/dashboard";
}

function AuthPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState(0);

  // Sync mode if query param changes
  useEffect(() => {
    if (search.mode && search.mode !== mode) {
      setMode(search.mode);
    }
  }, [search.mode]);

  // If already logged in, redirect directly rather than forcing sign-in again
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
  }, []);

  useEffect(() => {
    if (lockedFor <= 0) return;
    const id = window.setInterval(() => setLockedFor((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [lockedFor]);

  async function afterSession(opts?: { skipTwoStep?: boolean }) {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!opts?.skipTwoStep && aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const factors = await supabase.auth.mfa.listFactors();
      const totp = factors.data?.totp?.[0];
      if (totp) {
        setFactorId(totp.id);
        setStage("mfa");
        setNotice(t("Enter the 6-digit code from your authenticator app.", "আপনার অথেনটিকেটর অ্যাপের ৬ সংখ্যার কোড দিন।"));
        return;
      }
    }

    void registerSessionFn({
      data: { sessionId: session.access_token.slice(-32), aal: aal?.currentLevel ?? "aal1" },
    }).catch(() => undefined);
    void recordAuthEventFn({
      data: { event: "signin.success", outcome: "ok", userId: session.user.id },
    }).catch(() => undefined);
    const target = await landingFor(session.user.id, search?.redirect, session.user.email);
    navigate({ to: target as any, replace: true });
  }


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "reset") {
        await requestPasswordResetFn({
          data: { email, redirectTo: `${window.location.origin}/reset-password` },
        });

        setNotice(
          t(
            "If that email has an account, a reset link is on its way.",
            "ইমেইলটির অ্যাকাউন্ট থাকলে রিসেট লিংক পাঠানো হয়েছে।",
          ),
        );
        return;
      }

      if (mode === "signin") {
        const guard = await signInGuardFn({ data: { email } });
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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          void recordAuthEventFn({
            data: { event: "signin.failed", outcome: "denied", email },
          }).catch(() => undefined);
          throw error;
        }
        await afterSession();
        return;
      }

      if (search.accountType === "merchant") {
        const { registerMerchantFn } = await import("@/lib/identity.functions");
        await registerMerchantFn({ data: { email, password, fullName } });
        
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        
        if (data.session) await afterSession();
        else setNotice(t("Check your email to confirm your account.", "অ্যাকাউন্ট নিশ্চিত করতে ইমেইল দেখুন।"));
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName,
              account_type: "customer",
            },
          },
        });
        if (error) throw error;
        void recordAuthEventFn({
          data: { event: "signup.success", outcome: "ok", email },
        }).catch(() => undefined);
        if (data.session) await afterSession();
        else
          setNotice(
            t("Check your email to confirm your account.", "অ্যাকাউন্ট নিশ্চিত করতে ইমেইল দেখুন।"),
          );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (useBackup) {
        // Lost phone path: one single-use backup code stands in for the
        // authenticator, is burned server-side, and never raises AAL — so we
        // continue explicitly rather than re-entering the two-step step.
        const res = await consumeRecoveryCodeFn({ data: { code: code.trim() } });
        if (!res?.ok) throw new Error(t("That backup code is not valid.", "ব্যাকআপ কোডটি সঠিক নয়।"));
        void recordAuthEventFn({
          data: { event: "mfa.challenge.success", outcome: "ok" },
        }).catch(() => undefined);
        setStage("credentials");
        setUseBackup(false);
        setCode("");
        await afterSession({ skipTwoStep: true });
        return;
      }
      if (!factorId) return;
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId,
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
      await afterSession();
    } catch (err) {
      void recordAuthEventFn({
        data: { event: "mfa.challenge.failed", outcome: "denied", email },
      }).catch(() => undefined);
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    void recordAuthEventFn({ data: { event: "oauth.started", outcome: "ok" } }).catch(
      () => undefined,
    );
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
  }


  const heading =
    stage === "mfa"
      ? t("Two-factor check", "দুই-ধাপ যাচাই")
      : mode === "signin"
        ? t("Sign in", "সাইন ইন")
        : mode === "signup"
          ? t("Create an account", "অ্যাকাউন্ট তৈরি করুন")
          : t("Reset your password", "পাসওয়ার্ড রিসেট করুন");

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-fq-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="font-bangla-display text-xl font-semibold text-foreground">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Framique merchant admin</p>

        {notice && (
          <p
            role="status"
            aria-live="polite"
            className="mt-4 rounded-fq-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
          >
            {notice}
          </p>
        )}

        {stage === "mfa" ? (
          <form onSubmit={onVerifyMfa} className="mt-6 space-y-4">
            <Field
              label={
                useBackup
                  ? t("Backup code", "ব্যাকআপ কোড")
                  : t("Authenticator code", "অথেনটিকেটর কোড")
              }
              value={code}
              onChange={setCode}
              type="text"
              autoComplete="one-time-code"
              {...(useBackup ? {} : { inputMode: "numeric" as const })}
              required
            />
            <Submit busy={busy} label={t("Verify", "যাচাই করুন")} />
            <button
              type="button"
              onClick={() => {
                setUseBackup(!useBackup);
                setCode("");
                setNotice(
                  useBackup
                    ? t(
                        "Enter the 6-digit code from your authenticator app.",
                        "আপনার অথেনটিকেটর অ্যাপের ৬ সংখ্যার কোড দিন।",
                      )
                    : t(
                        "Enter one of the backup codes you saved. Each code works once.",
                        "সেভ করা ব্যাকআপ কোডগুলোর একটি দিন। প্রতিটি কোড একবারই কাজ করে।",
                      ),
                );
              }}
              className="w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {useBackup
                ? t("Use my authenticator app instead", "বরং অথেনটিকেটর অ্যাপ ব্যবহার করুন")
                : t("Lost your phone? Use a backup code", "ফোন হারিয়েছেন? ব্যাকআপ কোড দিন")}
            </button>
          </form>

        ) : (
          <>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {mode === "signup" && (
                <Field
                  label={t("Full name", "পূর্ণ নাম")}
                  value={fullName}
                  onChange={setFullName}
                  type="text"
                  autoComplete="name"
                />
              )}
              <Field
                label={t("Email", "ইমেইল")}
                value={email}
                onChange={setEmail}
                type="email"
                autoComplete="email"
                required
              />
              {mode !== "reset" && (
                <Field
                  label={t("Password", "পাসওয়ার্ড")}
                  value={password}
                  onChange={setPassword}
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                />
              )}
              <Submit
                busy={busy || lockedFor > 0}
                label={
                  lockedFor > 0
                    ? t(`Locked · ${lockedFor}s`, `লক · ${lockedFor}s`)
                    : mode === "signin"
                      ? t("Sign in", "সাইন ইন")
                      : mode === "signup"
                        ? t("Create account", "অ্যাকাউন্ট তৈরি")
                        : t("Send reset link", "রিসেট লিংক পাঠান")
                }
              />
            </form>

            {mode !== "reset" && (
              <>
                <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {t("or", "অথবা")}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <button
                  type="button"
                  onClick={onGoogle}
                  className="min-h-11 w-full rounded-fq-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                >
                  {t("Continue with Google", "Google দিয়ে চালিয়ে যান")}
                </button>
              </>
            )}

            <div className="mt-4 space-y-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setNotice(null);
                }}
                className="w-full text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {mode === "signin"
                  ? t("No account? Create one", "অ্যাকাউন্ট নেই? তৈরি করুন")
                  : t("Already have an account? Sign in", "অ্যাকাউন্ট আছে? সাইন ইন")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setNotice(null);
                }}
                className="w-full text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t("Forgot password?", "পাসওয়ার্ড ভুলে গেছেন?")}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Submit({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      className="min-h-11 w-full rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {busy ? "…" : label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete?: string;
  required?: boolean;
  inputMode?: "numeric";
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
    </label>
  );
}
