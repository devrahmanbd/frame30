import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant, slugify } from "@/hooks/use-merchant";
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
          "Name your store, pick its web address and choose a plan to start your Framique trial.",
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
  const { data: merchant, isPending } = useMerchant();

  const claimTrial = useServerFn(billingClaimTrialFn);
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    if (merchant) void navigate({ to: "/dashboard", replace: true });
  }, [merchant, navigate]);

  useEffect(() => {
    if (!slugTouched) setSlug(name ? slugify(name) : "");
  }, [name, slugTouched]);

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

  const { data: slugStatus, isFetching: slugChecking } = useQuery({
    queryKey: ["slug-status", slug],
    enabled: slug.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("store_slug_status", {
        p_slug: slug,
      });
      if (error) throw error;
      return data as string;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_store", {
        p_name: name.trim(),
        p_slug: slug,
        p_plan: plan!,
      });
      if (error) throw error;
      return data as string;
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
      await qc.invalidateQueries({ queryKey: ["merchant"] });
      void navigate({ to: "/dashboard", replace: true });
    },

    onError: (error) => toast.error(tError(error)),
  });

  const slugMessage = useMemo(() => {
    if (slug.length === 0) return null;
    if (slug.length < 3 || slugStatus === "invalid")
      return tk("store.slug_invalid");
    if (slugChecking) return tk("common.loading");
    if (slugStatus === "reserved") return tk("store.slug_reserved");
    if (slugStatus === "taken") return tk("store.slug_taken");
    if (slugStatus === "available") return tk("onboarding.address_available");
    return null;
  }, [slug, slugStatus, slugChecking, tk]);

  const slugOk = slugStatus === "available";
  const [customDomain, setCustomDomain] = useState("");
  const steps = [
    tk("onboarding.step_details"),
    tk("onboarding.step_address"),
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
          <div className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="store-slug">
              {tk("onboarding.web_address")}
            </label>
            <div className="flex items-center gap-1 text-sm">
              <input
                id="store-slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  );
                }}
                aria-describedby="slug-status"
                className="w-56 rounded-fq-md border border-border bg-background px-3 py-2"
              />
              <span className="text-muted-foreground font-mono">
                .framique.store
              </span>
            </div>
            <p
              id="slug-status"
              role="status"
              className={`text-xs ${slugOk ? "text-success-foreground" : "text-muted-foreground"}`}
            >
              {slugMessage}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "Your store will be hosted on an isolated wildcard subdomain with dedicated cookies and secure origin.",
                "আপনার স্টোরটি ডেডিকেটেড কুকি এবং সুরক্ষিত অরিজিন সহ একটি পৃথক ওয়াইল্ডকার্ড সাবডোমেইনে হোস্ট করা হবে।",
              )}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {t(
                  "Connect Custom Domain (Optional)",
                  "কাস্টম ডোমেইন যুক্ত করুন (ঐচ্ছিক)",
                )}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  `Your storefront is always accessible at ${slug || "your-store"}.framique.store. You can also connect your own custom domain or skip and configure it later.`,
                  `আপনার স্টোরফ্রন্ট সবসময় ${slug || "your-store"}.framique.store ঠিকানায় চালু থাকবে। আপনি চাইলে এখনই নিজের ডোমেইন যুক্ত করতে পারেন অথবা পরে সেটিংস থেকে করতে পারেন।`,
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-xs font-medium"
                htmlFor="custom-domain"
              >
                {t("Custom Domain", "কাস্টম ডোমেইন")}
              </label>
              <input
                id="custom-domain"
                value={customDomain}
                onChange={(e) =>
                  setCustomDomain(e.target.value.toLowerCase().trim())
                }
                className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm font-mono"
                placeholder="e.g. mystore.com"
              />
            </div>

            {/* DNS Instructions Card */}
            <div className="rounded-fq-md border border-border bg-muted/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {t("Required DNS Records", "প্রয়োজনীয় DNS রেকর্ড")}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Edge TLS
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-[11px]">
                      <th className="pb-1 font-medium">Type</th>
                      <th className="pb-1 font-medium">Host</th>
                      <th className="pb-1 font-medium">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 text-[11px]">
                    <tr>
                      <td className="py-1 font-semibold text-primary">CNAME</td>
                      <td className="py-1">www</td>
                      <td className="py-1 text-foreground">
                        edge.framique.store
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 font-semibold text-primary">A</td>
                      <td className="py-1">@</td>
                      <td className="py-1 text-foreground">76.76.21.21</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                {t(
                  "Skip for now — I'll connect it from Settings › Domains",
                  "এখনই নয় — আমি পরে সেটিংস থেকে ডোমেইন যুক্ত করব",
                )}{" "}
                →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
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
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={
                step === 0
                  ? name.trim().length < 2
                  : step === 1
                    ? !slugOk
                    : false
              }
              className="rounded-fq-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {tk("common.next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={!plan || !slugOk || create.isPending}
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
