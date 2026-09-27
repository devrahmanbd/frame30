import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  useMerchant,
  candidateStoreSlugs,
  loadMemberships,
} from "@/hooks/use-merchant";
import { canCreateAdditionalStore } from "@/lib/store-limits";
import { useLang } from "@/lib/i18n";
import { fmtMinor } from "@/lib/money";
import { billingClaimTrialFn } from "@/lib/billing.functions";
import { toast } from "sonner";

type Plan = "launch" | "growth" | "business" | "enterprise";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Create your store — Framique" },
      {
        name: "description",
        content:
          "Name your store, connect its custom domain and choose a plan to start your Framique trial.",
      },
      { property: "og:title", content: "Create your store" },
      {
        property: "og:description",
        content: "Set up a hosted storefront on Framique in three short steps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const { t, tk, tError, lang } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: merchant, isPending, isError, error, refetch } = useMerchant();

  // Single-store MVP gate (policy, not deletion): one store per account.
  // Existing multi-store accounts keep working; no new second store.
  const { data: memberships } = useQuery({
    queryKey: ["merchant-memberships"],
    queryFn: loadMemberships,
    staleTime: 60_000,
  });
  const atCap = !canCreateAdditionalStore(memberships?.length ?? 0);

  const claimTrial = useServerFn(billingClaimTrialFn);
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    if (merchant) void navigate({ to: "/dashboard", replace: true });
  }, [merchant, navigate]);

  const { data: plans } = useQuery({
    queryKey: ["plan-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_definitions")
        .select(
          "plan, title_en, title_bn, price_minor_int, currency_code, trial_days, products_limit, staff_limit",
        )
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (atCap) throw new Error("store.limit_reached");
      // No address step anymore (custom domains are the identity): derive
      // name-based candidates and take the first one create_store accepts.
      let lastError: unknown = null;
      for (const candidate of candidateStoreSlugs(name)) {
        const { data, error } = await supabase.rpc("create_store", {
          p_name: name.trim(),
          p_slug: candidate,
          p_plan: plan!,
        });
        if (!error) return data as string;
        lastError = error;
        if (!/taken|23505|duplicate/i.test(error.message ?? "")) throw error;
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("store.slug_taken");
    },
    onSuccess: async () => {
      // Trial length and abuse fingerprinting are decided server-side.
      const claim = await claimTrial().catch(() => null);
      if (claim?.kind === "denied") {
        toast.warning(
          tk("onboarding.trial_denied") ??
            "Trial not available for this account; the plan starts as paid.",
        );
      } else {
        toast.success(tk("onboarding.created"));
      }
      // Refetch (not just invalidate) so a slow/denied merchant read cannot
      // strand a completed merchant back on this wizard unseen.
      await qc.refetchQueries({ queryKey: ["merchant"] }).catch(() => null);
      void navigate({ to: "/dashboard", replace: true });
    },

    onError: (error) => toast.error(tError(error)),
  });

  const steps = [
    tk("onboarding.step_details"),
    t("Custom domain", "কাস্টম ডোমেইন"),
    tk("onboarding.step_plan"),
  ];

  if (isPending) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        {tk("common.loading")}
      </p>
    );
  }

  // Completed merchants whose store read fails must NEVER see the wizard
  // again silently (Sept 18 2026 loop fix): show why + recovery instead.
  if (isError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-bangla-display text-2xl font-bold">
          {t("We couldn't load your store", "আপনার স্টোর লোড করা যায়নি")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : tError(error)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "If you already created a store, you may be signed in with a different account (e.g. Google vs email) — those are separate logins. Otherwise retry; the read may have been transient.",
            "আপনি ইতিমধ্যে স্টোর তৈরি করে থাকলে, হয়তো ভিন্ন অ্যাকাউন্টে সাইন ইন করেছেন (যেমন Google বনাম ইমেইল) — এগুলো আলাদা লগইন। অন্যথায় আবার চেষ্টা করুন।",
          )}
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {t("Retry", "আবার চেষ্টা করুন")}
          </button>
          <button
            type="button"
            onClick={() =>
              void supabase.auth
                .signOut()
                .then(() => navigate({ to: "/auth", replace: true }))
            }
            className="rounded-fq-md border border-border px-4 py-2 text-sm"
          >
            {t("Switch account", "অ্যাকাউন্ট বদলান")}
          </button>
        </div>
      </main>
    );
  }

  // Single-store MVP gate: an account that already owns a store does not
  // get a second wizard. Existing multi-store accounts keep working.
  if (!isPending && !isError && !merchant && atCap) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-bangla-display text-2xl font-bold">
          {t("You already have a store", "আপনার ইতিমধ্যে একটি স্টোর আছে")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Each account manages one storefront while we are in early access. Head to your dashboard to keep building it.",
            "আর্লি অ্যাক্সেস চলাকালে প্রতিটি অ্যাকাউন্ট একটি স্টোরফ্রন্ট পরিচালনা করে। এটি তৈরি করতে ড্যাশবোর্ডে যান।",
          )}
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => void navigate({ to: "/dashboard", replace: true })}
            className="rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {t("Go to dashboard", "ড্যাশবোর্ডে যান")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-bangla-display text-2xl font-bold">
        {tk("onboarding.title")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {tk("onboarding.subtitle")}
      </p>

      <ol
        className="mt-6 flex gap-2 text-xs"
        aria-label={tk("onboarding.title")}
      >
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={`rounded-fq-md px-3 py-1 ${
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                  ? "bg-success-soft text-success-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-fq-lg border border-border bg-card p-6">
        {step === 0 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="store-name">
              {tk("onboarding.store_name")}
            </label>
            <input
              id="store-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm"
              placeholder={tk("onboarding.store_name_placeholder")}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {tk("onboarding.store_name_hint")}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {t(
                  "Custom Domain (Settings-only, optional)",
                  "কাস্টম ডোমেইন (শুধু সেটিংসে, ঐচ্ছিক)",
                )}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  `Your store gets 1 custom domain (1 store = 1 domain on every plan). Connect it after signup in Settings › Domains — nothing to enter here. Continue to choose your plan.`,
                  `আপনার স্টোর ১টি কাস্টম ডোমেইন পায় (প্রতিটি প্ল্যানে ১ স্টোর = ১ ডোমেইন)। সাইনআপের পরে Settings › Domains-এ যুক্ত করুন — এখানে কিছু লিখতে হবে না। প্ল্যান বেছে নিতে এগিয়ে যান।`,
                )}
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {tk("common.next")}{" "}
                <span className="text-primary-foreground/70">→</span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              {tk("onboarding.choose_plan")}
            </legend>
            {(plans ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                {tk("billing.limits.unconfigured")}
              </p>
            )}
            {(plans ?? []).map((p) => (
              <label
                key={p.plan}
                className={`flex cursor-pointer items-start gap-3 rounded-fq-md border p-4 ${
                  plan === p.plan
                    ? "border-primary bg-info-soft"
                    : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  className="mt-1"
                  checked={plan === p.plan}
                  onChange={() => setPlan(p.plan as Plan)}
                />
                <span className="flex-1">
                  <span className="flex items-center justify-between text-sm font-semibold">
                    <span>{lang === "bn" ? p.title_bn : p.title_en}</span>
                    <span className="money">
                      {p.price_minor_int === null
                        ? tk("billing.custom_price")
                        : `${fmtMinor(p.price_minor_int, p.currency_code)}/${tk("billing.per_month")}`}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {tk("onboarding.plan_caps", {
                      products: p.products_limit,
                      staff: p.staff_limit,
                    })}
                    {p.trial_days > 0
                      ? ` · ${tk("onboarding.trial_days", { days: p.trial_days })}`
                      : ""}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-fq-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {tk("common.previous")}
          </button>
          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 ? name.trim().length < 2 : false}
              className="rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {tk("common.next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={!plan || create.isPending}
              className="rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {create.isPending
                ? tk("common.loading")
                : tk("onboarding.create_store")}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
