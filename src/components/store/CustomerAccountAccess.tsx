import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Heart, Package, User, UserPlus } from "@/components/icons/tabler";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { accountRegisterCustomerFn } from "@/lib/accounts.functions";
import type { AccountTab } from "@/lib/account-tab";

export type CustomerAccountAccessProps = {
  slug: string;
  merchantName: string;
  requestedTab?: AccountTab;
  isStoreSlugRoute?: boolean;
};

function useSafeQueryClient() {
  try {
    return useQueryClient();
  } catch {
    return null;
  }
}

function useSafeNavigate() {
  try {
    return useNavigate();
  } catch {
    return () => Promise.resolve();
  }
}

export function CustomerAccountAccess({
  slug,
  merchantName,
  requestedTab,
  isStoreSlugRoute = false,
}: CustomerAccountAccessProps) {
  const { t } = useLang();
  const navigate = useSafeNavigate();
  const qc = useSafeQueryClient();
  const registerFn = useServerFn(accountRegisterCustomerFn);

  const [mode, setMode] = useState<"signin" | "register" | "track">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orderId, setOrderId] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isWishlistIntent = requestedTab === "wishlist";

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMsg(null);
    setBusy(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const msg = error.message.includes("Invalid login credentials")
          ? t(
              "Invalid email or password. Please try again.",
              "ভুল ইমেইল বা পাসওয়ার্ড। আবার চেষ্টা করুন।",
            )
          : error.message;
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      toast.success(
        t("Signed in successfully.", "সফলভাবে সাইন ইন সম্পন্ন হয়েছে।"),
      );
      if (qc) {
        await qc.invalidateQueries({ queryKey: ["auth-session"] });
        await qc.invalidateQueries({ queryKey: ["store-account", slug] });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMsg(null);

    if (password.length < 8) {
      const msg = t(
        "Password must be at least 8 characters.",
        "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।",
      );
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }

    setBusy(true);
    try {
      await registerFn({
        data: {
          slug,
          email: email.trim(),
          password,
          fullName: fullName.trim(),
        },
      });

      // Auto sign in after registration
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInErr) {
        toast.success(
          t(
            "Account created. Please sign in.",
            "অ্যাকাউন্ট তৈরি হয়েছে। অনুগ্রহ করে সাইন ইন করুন।",
          ),
        );
        setMode("signin");
        return;
      }

      toast.success(
        t(
          "Account created and signed in.",
          "অ্যাকাউন্ট তৈরি এবং সাইন ইন সম্পন্ন হয়েছে।",
        ),
      );
      if (qc) {
        await qc.invalidateQueries({ queryKey: ["auth-session"] });
        await qc.invalidateQueries({ queryKey: ["store-account", slug] });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("already registered") ||
            err.message.includes("User already exists")
            ? t(
                "An account with this email already exists. Try signing in.",
                "এই ইমেইলে ইতোমধ্যে অ্যাকাউন্ট আছে। সাইন ইন করার চেষ্টা করুন।",
              )
            : err.message
          : "Registration failed";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleTrackOrder = (e: FormEvent) => {
    e.preventDefault();
    const cleanId = orderId.trim();
    if (!cleanId) return;

    if (isStoreSlugRoute) {
      void navigate({
        to: "/store/$slug/order/$orderId",
        params: { slug, orderId: cleanId },
        search: accessCode.trim() ? { t: accessCode.trim() } : undefined,
      });
    } else {
      void navigate({
        to: "/order/$orderId",
        params: { orderId: cleanId },
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      {/* Brand & Context Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center text-[var(--theme-ink,#1A1A1A)]">
          {mode === "signin" && <User className="size-6" />}
          {mode === "register" && <UserPlus className="size-6" />}
          {mode === "track" && <Package className="size-6" />}
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[var(--theme-ink,#1A1A1A)]">
          {mode === "signin" &&
            t("Sign in to your account", "আপনার অ্যাকাউন্টে সাইন ইন")}
          {mode === "register" &&
            t("Create your customer account", "নতুন অ্যাকাউন্ট তৈরি করুন")}
          {mode === "track" && t("Track guest order", "অর্ডার অনুসন্ধান")}
        </h1>
        <p className="mt-2 text-xs sm:text-sm uppercase tracking-widest text-muted-foreground font-medium">
          {merchantName}
        </p>
      </div>

      {/* Wishlist contextual banner */}
      {isWishlistIntent && (
        <div className="mb-6 flex items-start gap-3 rounded-none border border-[var(--theme-accent,#8B4513)]/40 bg-[var(--theme-accent,#8B4513)]/5 p-4 text-xs sm:text-sm text-[var(--theme-ink,#1A1A1A)]">
          <Heart className="size-5 shrink-0 text-[var(--theme-accent,#8B4513)] mt-0.5" />
          <div>
            <p className="font-semibold text-[var(--theme-accent,#8B4513)]">
              {t("Wishlist access", "উইশলিস্টে প্রবেশ")}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {t(
                "Sign in or create an account to view and manage your saved items.",
                "আপনার সংরক্ষিত পণ্য দেখতে সাইন ইন করুন বা নতুন অ্যাকাউন্ট তৈরি করুন।",
              )}
            </p>
          </div>
        </div>
      )}

      {/* Mode navigation switcher */}
      <div
        role="tablist"
        aria-label={t("Account access options", "অ্যাকাউন্ট অপশন")}
        className="mb-8 flex border-b border-border/60 text-center"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          onClick={() => {
            setMode("signin");
            setErrorMsg(null);
          }}
          className={`flex-1 min-h-12 border-b-2 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-all cursor-pointer ${
            mode === "signin"
              ? "border-[var(--theme-ink,#1A1A1A)] text-[var(--theme-ink,#1A1A1A)]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("Sign In", "সাইন ইন")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          onClick={() => {
            setMode("register");
            setErrorMsg(null);
          }}
          className={`flex-1 min-h-12 border-b-2 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-all cursor-pointer ${
            mode === "register"
              ? "border-[var(--theme-ink,#1A1A1A)] text-[var(--theme-ink,#1A1A1A)]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("Register", "নিবন্ধন")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "track"}
          onClick={() => {
            setMode("track");
            setErrorMsg(null);
          }}
          className={`flex-1 min-h-12 border-b-2 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-all cursor-pointer ${
            mode === "track"
              ? "border-[var(--theme-ink,#1A1A1A)] text-[var(--theme-ink,#1A1A1A)]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("Track Your Order", "অর্ডার অনুসন্ধান")}
        </button>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-6 rounded-none border border-danger/40 bg-danger/10 p-3 text-xs sm:text-sm text-danger-foreground"
        >
          {errorMsg}
        </div>
      )}

      {/* Sign In Form */}
      <form
        onSubmit={handleSignIn}
        className={mode === "signin" ? "space-y-4" : "hidden"}
      >
        <div>
          <label
            htmlFor="access-signin-email"
            className="block text-xs font-semibold fq-caps tracking-wider text-muted-foreground mb-1.5"
          >
            {t("Email address", "ইমেইল")}
          </label>
          <input
            id="access-signin-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            required
            className="min-h-12 w-full rounded-none border border-border/70 bg-background px-3.5 text-sm text-foreground focus:border-[var(--theme-ink,#1A1A1A)] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="access-signin-password"
            className="block text-xs font-semibold fq-caps tracking-wider text-muted-foreground mb-1.5"
          >
            {t("Password", "পাসওয়ার্ড")}
          </label>
          <input
            id="access-signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="min-h-12 w-full rounded-none border border-border/70 bg-background px-3.5 text-sm text-foreground focus:border-[var(--theme-ink,#1A1A1A)] focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 min-h-12 w-full rounded-none bg-[var(--theme-ink,#1A1A1A)] px-6 text-xs sm:text-sm font-semibold uppercase tracking-widest text-[var(--theme-surface,#FAF9F7)] transition-all hover:bg-[var(--theme-accent,#8B4513)] hover:text-white active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          {busy
            ? t("Signing in…", "সাইন ইন হচ্ছে…")
            : t("Sign In", "সাইন ইন করুন")}
        </button>

        <div className="pt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setErrorMsg(null);
            }}
            className="min-h-11 text-xs sm:text-sm text-muted-foreground hover:text-[var(--theme-ink,#1A1A1A)] hover:underline underline-offset-4 transition-colors inline-flex items-center"
          >
            {t(
              "Don't have an account? Create one",
              "অ্যাকাউন্ট নেই? নতুন অ্যাকাউন্ট তৈরি করুন",
            )}
          </button>
        </div>
      </form>

      {/* Register Form */}
      <form
        onSubmit={handleRegister}
        className={mode === "register" ? "space-y-4" : "hidden"}
      >
        <div>
          <label
            htmlFor="access-reg-name"
            className="block text-xs font-semibold fq-caps tracking-wider text-muted-foreground mb-1.5"
          >
            {t("Full name", "পুরো নাম")}
          </label>
          <input
            id="access-reg-name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("e.g. John Doe", "যেমন: আপনার নাম")}
            required
            className="min-h-12 w-full rounded-none border border-border/70 bg-background px-3.5 text-sm text-foreground focus:border-[var(--theme-ink,#1A1A1A)] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="access-reg-email"
            className="block text-xs font-semibold fq-caps tracking-wider text-muted-foreground mb-1.5"
          >
            {t("Email address", "ইমেইল")}
          </label>
          <input
            id="access-reg-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            required
            className="min-h-12 w-full rounded-none border border-border/70 bg-background px-3.5 text-sm text-foreground focus:border-[var(--theme-ink,#1A1A1A)] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="access-reg-password"
            className="block text-xs font-semibold fq-caps tracking-wider text-muted-foreground mb-1.5"
          >
            {t("Password (min 8 characters)", "পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)")}
          </label>
          <input
            id="access-reg-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="min-h-12 w-full rounded-none border border-border/70 bg-background px-3.5 text-sm text-foreground focus:border-[var(--theme-ink,#1A1A1A)] focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 min-h-12 w-full rounded-none bg-[var(--theme-ink,#1A1A1A)] px-6 text-xs sm:text-sm font-semibold uppercase tracking-widest text-[var(--theme-surface,#FAF9F7)] transition-all hover:bg-[var(--theme-accent,#8B4513)] hover:text-white active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          {busy
            ? t("Creating account…", "অ্যাকাউন্ট তৈরি হচ্ছে…")
            : t("Create Account", "অ্যাকাউন্ট তৈরি করুন")}
        </button>

        <div className="pt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setErrorMsg(null);
            }}
            className="min-h-11 text-xs sm:text-sm text-muted-foreground hover:text-[var(--theme-ink,#1A1A1A)] hover:underline underline-offset-4 transition-colors inline-flex items-center"
          >
            {t(
              "Already have an account? Sign in",
              "ইতোমধ্যে অ্যাকাউন্ট আছে? সাইন ইন করুন",
            )}
          </button>
        </div>
      </form>

      {/* Guest Order Tracking Form */}
      <form
        onSubmit={handleTrackOrder}
        className={mode === "track" ? "space-y-4" : "hidden"}
      >
        <h2 className="sr-only">
          {t("Track Your Order", "আপনার অর্ডার খুঁজুন")}
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mb-4">
          {t(
            "Track your order status directly with your Order ID from your confirmation receipt.",
            "আপনার নিশ্চিতকরণ রসিদ থেকে অর্ডার আইডি দিয়ে সরাসরি অর্ডারের স্থিতি ট্র্যাক করুন।",
          )}
        </p>

        <div>
          <label
            htmlFor="order-lookup-input"
            className="block text-xs font-semibold fq-caps tracking-wider text-muted-foreground mb-1.5"
          >
            {t("Order ID", "অর্ডার আইডি")}
          </label>
          <input
            id="order-lookup-input"
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder={t("e.g. ord_01j7...", "যেমন: ord_01j7...")}
            required
            className="min-h-12 w-full rounded-none border border-border/70 bg-background px-3.5 text-sm text-foreground focus:border-[var(--theme-ink,#1A1A1A)] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="order-lookup-code"
            className="block text-xs font-semibold fq-caps tracking-wider text-muted-foreground mb-1.5"
          >
            {t("Access code (optional)", "অ্যাক্সেস কোড (ঐচ্ছিক)")}
          </label>
          <input
            id="order-lookup-code"
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder={t(
              "The code in your confirmation link",
              "কনফার্মেশন লিংকের কোড",
            )}
            className="min-h-12 w-full rounded-none border border-border/70 bg-background px-3.5 text-sm text-foreground focus:border-[var(--theme-ink,#1A1A1A)] focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          className="mt-6 min-h-12 w-full rounded-none bg-[var(--theme-ink,#1A1A1A)] px-6 text-xs sm:text-sm font-semibold uppercase tracking-widest text-[var(--theme-surface,#FAF9F7)] transition-all hover:bg-[var(--theme-accent,#8B4513)] hover:text-white active:scale-[0.99] cursor-pointer"
        >
          {t("View Order Status", "অর্ডার স্ট্যাটাস দেখুন")}
        </button>

        <div className="pt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setErrorMsg(null);
            }}
            className="min-h-11 text-xs sm:text-sm text-muted-foreground hover:text-[var(--theme-ink,#1A1A1A)] hover:underline underline-offset-4 transition-colors inline-flex items-center"
          >
            {t("Back to Sign In", "সাইন ইন-এ ফিরে যান")}
          </button>
        </div>
      </form>
    </div>
  );
}
