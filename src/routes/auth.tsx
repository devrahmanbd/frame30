import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { BrandLogo } from "@/components/public/BrandLogo";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { GradientMesh } from "@/components/public/motion/GradientMesh";
import { LanguageToggle } from "@/components/LanguageToggle";
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
  XCircle,
  ChevronDown,
  AlertCircle,
  ShieldCheck,
  Zap,
  Truck,
  CreditCard,
  Building2,
  Globe,
  Sparkles,
  ArrowRight,
  Lock,
  Mail,
  User,
  ArrowLeft,
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
          "Sign in or register for Framique to build, host, and scale your Bangladeshi e-commerce storefront with zero transaction fees.",
      },
      {
        property: "og:title",
        content: "Merchant Console Authentication — Framique",
      },
      {
        property: "og:description",
        content:
          "Merchant console login & registration for Framique cloud commerce.",
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
  { value: "fashion", en: "Fashion, Clothing & Apparel", bn: "ফ্যাশন ও পোশাক" },
  {
    value: "electronics",
    en: "Electronics, Gadgets & Tech",
    bn: "ইলেকট্রনিক্স ও গ্যাজেট",
  },
  {
    value: "beauty",
    en: "Beauty, Cosmetics & Skincare",
    bn: "কসমেটিক্স ও বিউটি কেয়ার",
  },
  {
    value: "food",
    en: "Food, Grocery & Organic Products",
    bn: "খাবার, গ্রোসারি ও অর্গানিক",
  },
  {
    value: "home",
    en: "Home Decor, Furniture & Living",
    bn: "হোম ডেকর ও ফার্নিচার",
  },
  { value: "jewelry", en: "Jewelry, Watches & Luxury", bn: "জুয়েলারি ও ঘড়ি" },
  {
    value: "health",
    en: "Health, Wellness & Pharmacy",
    bn: "স্বাস্থ্য ও ফার্মাসি",
  },
  { value: "books", en: "Books, Stationery & Crafts", bn: "বই ও স্টেশনারি" },
  {
    value: "wholesale",
    en: "Wholesale & B2B Distribution",
    bn: "হোলসেল ও বি২বি ডিস্ট্রিবিউশন",
  },
  { value: "other", en: "Other Industry", bn: "অন্যান্য শিল্প" },
] as const;

const PREVIOUS_CMS_LIST = [
  {
    value: "none",
    en: "None — Starting my first store",
    bn: "কোনোটি নয় — প্রথম স্টোর শুরু করছি",
  },
  { value: "shopify", en: "Shopify", bn: "শপিফাই (Shopify)" },
  {
    value: "woocommerce",
    en: "WooCommerce / WordPress",
    bn: "উ-কমার্স / ওয়ার্ডপ্রেস",
  },
  {
    value: "facebook",
    en: "Facebook / Instagram Page only",
    bn: "শুধুমাত্র ফেসবুক / ইন্সটাগ্রাম পেজ",
  },
  {
    value: "custom",
    en: "Custom built website / App",
    bn: "কাস্টম তৈরি ওয়েবসাইট বা অ্যাপ",
  },
  {
    value: "daraz",
    en: "Daraz / E-commerce Marketplace",
    bn: "দারাজ বা অনলাইন মার্কেটপ্লেস",
  },
  {
    value: "wix_squarespace",
    en: "Wix / Squarespace",
    bn: "উইক্স বা স্কয়ারস্পেস",
  },
  { value: "other", en: "Other platform", bn: "অন্যান্য প্ল্যাটফর্ম" },
] as const;

const REFERRAL_SOURCES = [
  {
    value: "meta_ads",
    en: "Facebook / Instagram Ads or Post",
    bn: "ফেসবুক বা মেটা বিজ্ঞাপন / পোস্ট",
  },
  { value: "google_search", en: "Google Search", bn: "গুগল সার্চ (Google)" },
  { value: "linkedin", en: "LinkedIn", bn: "লিঙ্কডইন (LinkedIn)" },
  { value: "youtube", en: "YouTube Video / Review", bn: "ইউটিউব (YouTube)" },
  {
    value: "friend_referral",
    en: "Friend or Merchant Recommendation",
    bn: "বন্ধু বা পরিচিত কারো সুপারিশ",
  },
  {
    value: "community",
    en: "Tech or Ecommerce Community",
    bn: "ই-কমার্স বা উদ্যোক্তা কমিউনিটি",
  },
  { value: "other", en: "Other", bn: "অন্যান্য" },
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
  const { t } = useLang();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [mode, setMode] = useState<Mode>(search.mode ?? "signup");
  const [stage, setStage] = useState<Stage>("credentials");

  // Signup fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [businessIndustry, setBusinessIndustry] = useState<string>("fashion");
  const [previousCms, setPreviousCms] = useState<string>("none");
  const [referralSource, setReferralSource] = useState<string>("meta_ads");

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
  }, [search.mode]);

  // If already logged in, redirect directly to merchant dashboard
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

    // Reject customer accounts — Framique console is strictly for Merchants
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

    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const factors = await supabase.auth.mfa.listFactors();
    const verifiedTotp =
      factors.data?.totp?.find((f) => f.status === "verified") ??
      factors.data?.totp?.[0];
    const isMfaEnrolled = !!verifiedTotp;

    if (!opts?.skipTwoStep && isMfaEnrolled && aal?.currentLevel !== "aal2") {
      setFactorId(verifiedTotp.id);
      setStage("mfa");
      setNotice(
        t(
          "Two-factor authentication required. Enter the 6-digit code from your authenticator app.",
          "দুই-ধাপ যাচাই প্রয়োজন। আপনার অথেনটিকেটর অ্যাপের ৬ সংখ্যার কোড দিন।",
        ),
      );
      return;
    }

    void registerSessionFn({
      data: {
        sessionId: session.access_token.slice(-32),
        aal: aal?.currentLevel ?? "aal1",
      },
    }).catch(() => undefined);
    void recordAuthEventFn({
      data: { event: "signin.success", outcome: "ok", userId: session.user.id },
    }).catch(() => undefined);

    const target = await landingFor(session.user.id, search?.redirect);
    navigate({ to: target as never, replace: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);

    // Client-side validations for Signup
    if (mode === "signup") {
      if (!firstName.trim()) {
        setErrorMsg(t("First name is required.", "প্রথম নাম আবশ্যক।"));
        return;
      }
      if (!lastName.trim()) {
        setErrorMsg(t("Last name is required.", "শেষ নাম আবশ্যক।"));
        return;
      }
      if (password.length < 8) {
        setErrorMsg(
          t(
            "Password must be at least 8 characters long.",
            "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।",
          ),
        );
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(t("Passwords do not match.", "পাসওয়ার্ড দুটি মিলছে না।"));
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
            "If that email has an account, a reset link is on its way to your inbox.",
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

      // ─── Sign Up Flow ───────────────────────────────────────────────────────
      const { registerMerchantFn } = await import("@/lib/identity.functions");
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      await registerMerchantFn({
        data: {
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          fullName,
          businessIndustry,
          previousCms,
          referralSource,
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
            "Account created! Please check your email to confirm your account.",
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
    <main className="fq-site fq-marketing min-h-screen overflow-x-clip bg-background selection:bg-primary/20 selection:text-primary">
      <div className="grid min-h-screen lg:grid-cols-12">
        {/* ── Left Column: Brand Showcase Panel (Desktop) ─────────────────── */}
        <aside className="relative hidden min-w-0 flex-col justify-between overflow-hidden border-r border-border/70 bg-accent/50 p-10 backdrop-blur-xl dark:bg-card/30 lg:col-span-5 lg:flex xl:p-14">
          <GradientMesh intensity={0.55} />

          {/* Top Brand & Home Link */}
          <div className="relative z-10">
            <Link
              to="/"
              className="inline-flex items-center gap-3 transition-opacity hover:opacity-90 group"
            >
              <BrandLogo
                size={36}
                className="group-hover:scale-105 transition-transform"
              />
              <div className="flex flex-col">
                <span className="fq-display text-xl font-bold tracking-tight text-foreground">
                  Framique
                </span>
                <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
                  Merchant Console
                </span>
              </div>
            </Link>

            <div className="mt-12 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 backdrop-blur-md">
                <Sparkles className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {t(
                    "0% Transaction Fees • No App Bloat",
                    "০% ট্রানজ্যাকশন ফি • কোনো গোপন চার্জ নেই",
                  )}
                </span>
              </div>

              <h1 className="fq-display text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)] font-extrabold tracking-tight text-foreground leading-[1.12] text-balance">
                {t(
                  "Empower your e-commerce with sovereign infrastructure.",
                  "আপনার অনলাইন ব্যবসার জন্য নির্ভরযোগ্য ক্লাউড কমার্স প্ল্যাটফর্ম।",
                )}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                {t(
                  "Join Bangladesh's premier direct-to-consumer platform. Built with native bKash checkout, automated SteadFast dispatch, and sub-second page loads.",
                  "বিকাশ টোকেনাইজড পেমেন্ট, স্টিডফাস্ট ও পাঠাও অটোমেশন এবং দ্রুতগতির স্টোরফ্রন্ট নিয়ে ফ্রেমিক-এ আপনার ব্র্যান্ড শুরু করুন।",
                )}
              </p>
            </div>

            {/* Core Value Highlights */}
            <div className="mt-8 space-y-3.5">
              <div className="flex items-center gap-3 rounded-fq-md border border-border/70 bg-card/90 p-3 text-xs shadow-sm backdrop-blur-sm transition-all hover:border-border dark:bg-card/50 dark:border-border/60">
                <span className="grid size-8 shrink-0 place-items-center rounded-fq-sm bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                  <Zap className="size-4" />
                </span>
                <span className="text-foreground">
                  <strong className="font-semibold text-foreground">
                    {t("Sub-second Speed:", "বিদ্যুৎগতি:")}
                  </strong>{" "}
                  <span className="text-muted-foreground">
                    {t(
                      "Edge CDN deployed in Dhaka for instant mobile checkout.",
                      "ঢাকায় এজ সিডিএন-এর কারণে মোবাইলে ১ সেকেন্ডের কম লোড টাইম।",
                    )}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-3 rounded-fq-md border border-border/70 bg-card/90 p-3 text-xs shadow-sm backdrop-blur-sm transition-all hover:border-border dark:bg-card/50 dark:border-border/60">
                <span className="grid size-8 shrink-0 place-items-center rounded-fq-sm bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                  <CreditCard className="size-4" />
                </span>
                <span className="text-foreground">
                  <strong className="font-semibold text-foreground">
                    {t("MFS Payments:", "বিকাশ ও নগদ:")}
                  </strong>{" "}
                  <span className="text-muted-foreground">
                    {t(
                      "Direct tokenized checkout with instant ledger reconciliation.",
                      "টোকেনাইজড পেমেন্ট ও সরাসরি লেজার ট্র্যাকিং।",
                    )}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-3 rounded-fq-md border border-border/70 bg-card/90 p-3 text-xs shadow-sm backdrop-blur-sm transition-all hover:border-border dark:bg-card/50 dark:border-border/60">
                <span className="grid size-8 shrink-0 place-items-center rounded-fq-sm bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-inset ring-blue-500/20">
                  <Truck className="size-4" />
                </span>
                <span className="text-foreground">
                  <strong className="font-semibold text-foreground">
                    {t("Courier Sync:", "কুরিয়ার অটোমেশন:")}
                  </strong>{" "}
                  <span className="text-muted-foreground">
                    {t(
                      "1-Click SteadFast, Pathao & RedX manifests across 64 districts.",
                      "৬৪ জেলায় স্টিডফাস্ট, পাঠাও ও রেডএক্স বুকিং।",
                    )}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Trial Guarantee Card (truthful terms, no invented proof) */}
          <div className="fq-glass relative z-10 mt-10 rounded-fq-lg p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                {t(
                  "14-day free trial, no card required",
                  "১৪ দিনের ফ্রি ট্রায়াল, কার্ড লাগবে না",
                )}
              </p>
            </div>
            <ul className="mt-3 space-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                <span>
                  {t(
                    "0% transaction fees on every plan",
                    "প্রতিটি প্ল্যানে ০% ট্রানজ্যাকশন ফি",
                  )}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                <span>
                  {t(
                    "bKash, Nagad, cards & COD at checkout",
                    "বিকাশ, নগদ, কার্ড ও ক্যাশ অন ডেলিভারি",
                  )}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                <span>
                  {t(
                    "SteadFast, Pathao & RedX in 64 districts",
                    "৬৪ জেলায় স্টিডফাস্ট, পাঠাও ও রেডএক্স",
                  )}
                </span>
              </li>
            </ul>
          </div>
        </aside>

        {/* ── Right Column: Interactive Form ──────────────────────────────── */}
        <section className="flex min-w-0 flex-col justify-between p-6 sm:p-10 lg:col-span-7 lg:p-12 xl:p-16">
          {/* Top Bar Navigation */}
          <header className="flex items-center justify-between pb-6">
            <div className="flex items-center gap-2 lg:hidden">
              <Link to="/" className="inline-flex items-center gap-2">
                <BrandLogo size={28} />
                <span className="fq-display font-bold text-foreground">
                  Framique
                </span>
              </Link>
            </div>
            <div className="hidden lg:block">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                <span>{t("Back to website", "ওয়েবসাইটে ফিরে যান")}</span>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </header>

          {/* Form Container */}
          <div className="mx-auto my-auto w-full max-w-lg py-4">
            {/* Mobile Marketing Value Pill */}
            {mode === "signup" && stage === "credentials" && (
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 lg:hidden">
                <Sparkles className="size-3.5" />
                <span>
                  {t(
                    "0% Transaction Fees • 14-Day Free Trial",
                    "০% ট্রানজ্যাকশন ফি • ১৪ দিনের ফ্রি ট্রায়াল",
                  )}
                </span>
              </div>
            )}

            {/* Mode Switcher Tabs */}
            {stage === "credentials" && mode !== "reset" && (
              <div
                role="tablist"
                aria-label={t("Authentication mode", "অথেনটিকেশন মোড")}
                className="mb-6 grid grid-cols-2 rounded-fq-md bg-muted p-1 text-xs font-semibold"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signup"}
                  onClick={() => {
                    setMode("signup");
                    setErrorMsg(null);
                    setNotice(null);
                  }}
                  className={`min-h-11 rounded-fq-sm py-2 transition-all ${
                    mode === "signup"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("Create Account", "অ্যাকাউন্ট তৈরি")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signin"}
                  onClick={() => {
                    setMode("signin");
                    setErrorMsg(null);
                    setNotice(null);
                  }}
                  className={`min-h-11 rounded-fq-sm py-2 transition-all ${
                    mode === "signin"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("Sign In", "সাইন ইন")}
                </button>
              </div>
            )}

            {/* Header Titles */}
            <div className="mb-6 space-y-1.5">
              <h2 className="fq-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {stage === "mfa"
                  ? t("Two-factor security check", "দুই-ধাপ নিরাপত্তা যাচাই")
                  : mode === "signup"
                    ? t(
                        "Create your merchant account",
                        "আপনার মার্চেন্ট অ্যাকাউন্ট খুলুন",
                      )
                    : mode === "signin"
                      ? t(
                          "Sign in to your console",
                          "মার্চেন্ট কনসোলে সাইন ইন করুন",
                        )
                      : t("Reset your password", "পাসওয়ার্ড রিসেট করুন")}
              </h2>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {stage === "mfa"
                  ? t(
                      "Enter the verification code from your authenticator app.",
                      "আপনার অথেনটিকেটর অ্যাপ থেকে যাচাইকরণ কোড দিন।",
                    )
                  : mode === "signup"
                    ? t(
                        "Start your 14-day free trial. Setup your store in under 2 minutes.",
                        "১৪ দিনের ফ্রি ট্রায়াল শুরু করুন। কোনো ক্রেডিট কার্ডের প্রয়োজন নেই।",
                      )
                    : mode === "signin"
                      ? t(
                          "Welcome back! Manage your products, orders and payouts.",
                          "স্বাগতম! আপনার প্রোডাক্ট, অর্ডার ও পেমেন্ট পরিচালনা করুন।",
                        )
                      : t(
                          "Enter your registered email address to receive recovery instructions.",
                          "পাসওয়ার্ড রিসেট লিংক পেতে আপনার নিবন্ধিত ইমেইল দিন।",
                        )}
              </p>
            </div>

            {/* Notifications / Alerts */}
            {notice && (
              <div
                role="status"
                aria-live="polite"
                className="mb-5 flex items-start gap-2.5 rounded-fq-md border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground"
              >
                <CheckCircle2 className="size-4 shrink-0 text-primary mt-0.5" />
                <span className="leading-relaxed">{notice}</span>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-fq-md border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive"
              >
                <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* ── Stage: MFA Authentication ─────────────────────────────── */}
            {stage === "mfa" ? (
              <form onSubmit={onVerifyMfa} className="space-y-4">
                <div className="rounded-fq-md border border-border/80 bg-muted/40 p-3.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
                    <ShieldCheck className="size-4 text-primary" />
                    <span>
                      {t(
                        "Two-Factor Authentication Enforced",
                        "দুই-ধাপ নিরাপত্তা সক্রিয়",
                      )}
                    </span>
                  </div>
                  <p>
                    {useBackup
                      ? t(
                          "Enter one of your saved 8-character single-use backup recovery codes.",
                          "আপনার সংরক্ষিত ৮-অক্ষরের একক-ব্যবহারের ব্যাকআপ কোড দিন।",
                        )
                      : t(
                          "Open your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, or Keychain) to get your 6-digit code.",
                          "আপনার অথেনটিকেটর অ্যাপ থেকে ৬ সংখ্যার কোডটি দেখে লিখুন।",
                        )}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    {useBackup
                      ? t("Backup Recovery Code", "ব্যাকআপ রিকভারি কোড")
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
                    className={`min-h-12 w-full rounded-fq-md border border-border bg-background px-3.5 text-center font-mono text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
                      useBackup
                        ? "text-base tracking-wider"
                        : "text-xl tracking-[0.3em]"
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
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy
                    ? t("Verifying…", "যাচাই হচ্ছে…")
                    : t(
                        "Verify & Access Dashboard",
                        "যাচাই করে ড্যাশবোর্ডে প্রবেশ করুন",
                      )}
                </button>

                <div className="flex flex-col items-center gap-2 pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackup(!useBackup);
                      setCode("");
                      setErrorMsg(null);
                      setNotice(
                        useBackup
                          ? t(
                              "Enter the 6-digit code from your authenticator app.",
                              "আপনার অথেনটিকেটর অ্যাপের ৬ সংখ্যার কোড দিন।",
                            )
                          : t(
                              "Enter one of your saved single-use backup codes.",
                              "সেভ করা ব্যাকআপ কোডগুলোর একটি দিন।",
                            ),
                      );
                    }}
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    {useBackup
                      ? t(
                          "Use authenticator app 6-digit code instead",
                          "অথেনটিকেটর অ্যাপের ৬ সংখ্যার কোড ব্যবহার করুন",
                        )
                      : t(
                          "Lost your authenticator device? Use a backup code",
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
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-1"
                  >
                    <ArrowLeft className="size-3.5" aria-hidden="true" />
                    {t(
                      "Sign in with a different account",
                      "অন্য অ্যাকাউন্ট দিয়ে সাইন ইন করুন",
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* ── Stage: Credentials (Signup, Signin, Reset) ─────────────── */
              <form onSubmit={onSubmit} className="space-y-4">
                {/* Signup-Specific Profile Fields */}
                {mode === "signup" && (
                  <>
                    {/* First Name & Last Name (2 columns) */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1.5">
                          {t("First name *", "প্রথম নাম *")}
                        </label>
                        <div className="relative">
                          <input
                            required
                            type="text"
                            maxLength={100}
                            autoComplete="given-name"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder={t("e.g. Shakib", "যেমন: সাকিব")}
                            className="min-h-11 w-full rounded-fq-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                          />
                          <User
                            className="absolute left-3 top-3.5 size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1.5">
                          {t("Last name *", "শেষ নাম *")}
                        </label>
                        <div className="relative">
                          <input
                            required
                            type="text"
                            maxLength={100}
                            autoComplete="family-name"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder={t("e.g. Al Hasan", "যেমন: আল হাসান")}
                            className="min-h-11 w-full rounded-fq-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                          />
                          <User
                            className="absolute left-3 top-3.5 size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    {mode === "signup"
                      ? t("Work or store email *", "বিজনেস বা স্টোর ইমেইল *")
                      : t("Email address *", "ইমেইল অ্যাড্রেস *")}
                  </label>
                  <div className="relative">
                    <input
                      required
                      type="email"
                      maxLength={254}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="merchant@yourbrand.com"
                      className="min-h-11 w-full rounded-fq-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <Mail
                      className="absolute left-3 top-3.5 size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                {/* Password & Confirm Password */}
                {mode !== "reset" && (
                  <div
                    className={
                      mode === "signup"
                        ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                        : "space-y-4"
                    }
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-foreground">
                          {t("Password *", "পাসওয়ার্ড *")}
                        </label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            onClick={() => {
                              setMode("reset");
                              setErrorMsg(null);
                              setNotice(null);
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            {t("Forgot?", "ভুলে গেছেন?")}
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
                          className="min-h-11 w-full rounded-fq-md border border-border bg-background pl-9 pr-10 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                        />
                        <Lock
                          className="absolute left-3 top-3.5 size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-3 text-muted-foreground hover:text-foreground p-0.5 rounded"
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
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-foreground">
                            {t(
                              "Confirm password *",
                              "পাসওয়ার্ড নিশ্চিত করুন *",
                            )}
                          </label>
                          {confirmPassword && (
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              {isPasswordMatch ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                  <CheckCircle2 className="size-3" aria-hidden="true" />
                                  {t("Match", "মিলেছে")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-destructive font-medium">
                                  <XCircle className="size-3" aria-hidden="true" />
                                  {t("Mismatch", "মিলছে না")}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            required
                            type={showConfirmPassword ? "text" : "password"}
                            minLength={8}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className={`min-h-11 w-full rounded-fq-md border bg-background pl-9 pr-10 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 ${
                              !isPasswordMatch
                                ? "border-destructive focus-visible:ring-destructive"
                                : "border-border focus-visible:ring-primary"
                            }`}
                          />
                          <Lock
                            className="absolute left-3 top-3.5 size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            className="absolute right-2.5 top-3 text-muted-foreground hover:text-foreground p-0.5 rounded"
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
                      </div>
                    )}
                  </div>
                )}

                {/* Additional Business Onboarding Metadata (Signup Only) */}
                {mode === "signup" && (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
                      {/* Business Industry */}
                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1.5">
                          {t("Business industry", "ব্যবসার ধরন / শিল্প")}
                        </label>
                        <div className="relative">
                          <select
                            value={businessIndustry}
                            onChange={(e) =>
                              setBusinessIndustry(e.target.value)
                            }
                            className="min-h-11 w-full appearance-none rounded-fq-md border border-border bg-background pl-9 pr-8 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {INDUSTRIES.map((ind) => (
                              <option key={ind.value} value={ind.value}>
                                {t(ind.en, ind.bn)}
                              </option>
                            ))}
                          </select>
                          <Building2
                            className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground">
                            <ChevronDown className="size-4" aria-hidden="true" />
                          </div>
                        </div>
                      </div>

                      {/* Previous CMS */}
                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1.5">
                          {t(
                            "Previous platform / CMS",
                            "আগের প্ল্যাটফর্ম / সিএমএস",
                          )}
                        </label>
                        <div className="relative">
                          <select
                            value={previousCms}
                            onChange={(e) => setPreviousCms(e.target.value)}
                            className="min-h-11 w-full appearance-none rounded-fq-md border border-border bg-background pl-9 pr-8 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {PREVIOUS_CMS_LIST.map((cms) => (
                              <option key={cms.value} value={cms.value}>
                                {t(cms.en, cms.bn)}
                              </option>
                            ))}
                          </select>
                          <Globe
                            className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground">
                            <ChevronDown className="size-4" aria-hidden="true" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Where did you hear about us? */}
                    <div className="pt-1">
                      <label className="block text-xs font-semibold text-foreground mb-1.5">
                        {t(
                          "Where did you hear about us?",
                          "আমাদের সম্পর্কে কোথা থেকে জেনেছেন?",
                        )}
                      </label>
                      <div className="relative">
                        <select
                          value={referralSource}
                          onChange={(e) => setReferralSource(e.target.value)}
                          className="min-h-11 w-full appearance-none rounded-fq-md border border-border bg-background pl-9 pr-8 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {REFERRAL_SOURCES.map((ref) => (
                            <option key={ref.value} value={ref.value}>
                              {t(ref.en, ref.bn)}
                            </option>
                          ))}
                        </select>
                        <Sparkles
                          className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground">
                            <ChevronDown className="size-4" aria-hidden="true" />
                          </div>
                        </div>
                      </div>

                    {/* Terms Agreement Check */}
                    <p className="pt-2 text-[11px] text-muted-foreground leading-relaxed">
                      {t(
                        "By clicking create account, you agree to our ",
                        "অ্যাকাউন্ট তৈরির মাধ্যমে আপনি আমাদের ",
                      )}
                      <Link
                        to="/legal"
                        className="text-primary underline hover:text-foreground"
                      >
                        {t("Terms of Service", "ব্যবহারের শর্তাবলী")}
                      </Link>{" "}
                      {t("and ", "ও ")}
                      <Link
                        to="/legal"
                        className="text-primary underline hover:text-foreground"
                      >
                        {t("Privacy Policy", "গোপনীয়তা নীতি")}
                      </Link>
                      {t(
                        ". No credit card is required for your trial.",
                        " মেনে নিচ্ছেন। ট্রায়ালের জন্য কোনো কার্ড প্রয়োজন নেই।",
                      )}
                    </p>
                  </>
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
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? (
                      t("Processing…", "প্রক্রিয়াকরণ হচ্ছে…")
                    ) : lockedFor > 0 ? (
                      t(
                        `Locked · Retry in ${lockedFor}s`,
                        `লক · ${lockedFor} সেকেন্ডে পুনরায় চেষ্টা করুন`,
                      )
                    ) : mode === "signup" ? (
                      <>
                        <span>
                          {t(
                            "Create Store & Start Free Trial",
                            "স্টোর তৈরি করুন ও ফ্রি ট্রায়াল শুরু করুন",
                          )}
                        </span>
                        <ArrowRight className="size-4" />
                      </>
                    ) : mode === "signin" ? (
                      <>
                        <span>
                          {t(
                            "Sign In to Merchant Console",
                            "মার্চেন্ট কনসোলে সাইন ইন করুন",
                          )}
                        </span>
                        <ArrowRight className="size-4" />
                      </>
                    ) : (
                      <span>
                        {t(
                          "Send Password Reset Link",
                          "পাসওয়ার্ড রিসেট লিংক পাঠান",
                        )}
                      </span>
                    )}
                  </button>
                </div>

                {/* Secondary Switchers */}
                <div className="pt-4 text-center text-xs text-muted-foreground">
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
                        className="font-semibold text-primary underline underline-offset-4 hover:text-foreground"
                      >
                        {t("Sign in here", "সাইন ইন করুন")}
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
                        className="font-semibold text-primary underline underline-offset-4 hover:text-foreground"
                      >
                        {t(
                          "Create a free account",
                          "বিনামূল্যে অ্যাকাউন্ট খুলুন",
                        )}
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
                      className="font-semibold text-primary underline underline-offset-4 hover:text-foreground"
                    >
                      {t("Back to Sign In", "সাইন ইন-এ ফিরে যান")}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

          {/* Footer Note */}
          <footer className="pt-6 text-center text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Framique Technologies. All rights
            reserved. Sovereign Cloud Commerce.
          </footer>
        </section>
      </div>
    </main>
  );
}
