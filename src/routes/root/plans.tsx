import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { platformPlansFn, platformSavePlanFn } from "@/lib/platform.functions";

export const Route = createFileRoute("/root/plans")({
  head: () => ({
    meta: [
      { title: "Plans & limits — Framique owner console" },
      {
        name: "description",
        content:
          "Create and edit Framique plan definitions: monthly price in BDT, trial days, product and staff caps, allowed payment methods and feature flags.",
      },
      { property: "og:title", content: "Plans & limits — Framique owner console" },
      {
        property: "og:description",
        content: "Plan builder for Framique platform owners with audited changes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlansAndLimits,
});

const PLAN_KEYS = ["launch", "growth", "business", "enterprise"] as const;
type PlanKey = (typeof PLAN_KEYS)[number];
const METHODS = ["cod", "bkash", "nagad", "rocket"] as const;
const FLAGS = ["pos", "couriers", "marketplace", "fraud_desk", "api_access"] as const;

const field =
  "w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm tabular-nums";

type Draft = {
  plan: PlanKey;
  title_en: string;
  title_bn: string;
  price_minor_int: number | null;
  currency_code: string;
  products_limit: number;
  staff_limit: number;
  features: string;
  trial_days: number;
  payment_methods_allowed: string[];
  feature_flags: Record<string, boolean>;
  sort_order: number;
  active: boolean;
};

type PlanDef = {
  plan: PlanKey;
  en: string;
  title: string;
  priceMinorInt: number | null;
  currencyCode: string;
  products: number;
  staff: number;
  features: string[];
  trialDays: number;
  paymentMethods: string[];
  featureFlags: Record<string, string | number | boolean>;
};

function emptyDraft(plan: PlanKey, sortOrder: number): Draft {
  return {
    plan,
    title_en: "",
    title_bn: "",
    price_minor_int: 0,
    currency_code: "BDT",
    products_limit: 0,
    staff_limit: 0,
    features: "",
    trial_days: 0,
    payment_methods_allowed: ["cod"],
    feature_flags: {},
    sort_order: sortOrder,
    active: true,
  };
}

function toDraft(def: PlanDef, sortOrder: number): Draft {
  return {
    plan: def.plan,
    title_en: def.en,
    title_bn: def.title,
    price_minor_int: def.priceMinorInt,
    currency_code: def.currencyCode,
    products_limit: def.products,
    staff_limit: def.staff,
    features: def.features.join("\n"),
    trial_days: def.trialDays,
    payment_methods_allowed: def.paymentMethods,
    feature_flags: Object.fromEntries(
      Object.entries(def.featureFlags).map(([k, v]) => [k, Boolean(v)]),
    ),
    sort_order: sortOrder,
    active: true,
  };
}

function PlanForm({ initial, onSaved }: { initial: Draft; onSaved: () => void }) {
  const { tk, tError } = useLang();
  const save = useServerFn(platformSavePlanFn);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          plan: draft.plan,
          title_en: draft.title_en,
          title_bn: draft.title_bn,
          price_minor_int: draft.price_minor_int,
          currency_code: draft.currency_code.toUpperCase(),
          products_limit: draft.products_limit,
          staff_limit: draft.staff_limit,
          features: draft.features
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean),
          trial_days: draft.trial_days,
          payment_methods_allowed: draft.payment_methods_allowed as (
            | "cod"
            | "bkash"
            | "nagad"
            | "rocket"
          )[],
          feature_flags: draft.feature_flags,
          sort_order: draft.sort_order,
          active: draft.active,
        },
      }),
    onSuccess: () => {
      toast.success(tk("platform.plan_saved"));
      onSaved();
    },
    onError: (e: Error) => toast.error(tError(e)),
  });

  const toggleMethod = (m: string) =>
    setDraft({
      ...draft,
      payment_methods_allowed: draft.payment_methods_allowed.includes(m)
        ? draft.payment_methods_allowed.filter((x) => x !== m)
        : [...draft.payment_methods_allowed, m],
    });

  return (
    <form
      className="space-y-3 rounded-fq-md border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide">{draft.plan}</h3>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          Active
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Name (EN)
          <input
            className={field}
            value={draft.title_en}
            onChange={(e) => setDraft({ ...draft, title_en: e.target.value })}
            required
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Name (BN)
          <input
            className={field}
            value={draft.title_bn}
            onChange={(e) => setDraft({ ...draft, title_bn: e.target.value })}
            required
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Monthly price (minor units, blank = contact sales)
          <input
            className={field}
            inputMode="numeric"
            value={draft.price_minor_int === null ? "" : String(draft.price_minor_int)}
            onChange={(e) =>
              setDraft({
                ...draft,
                price_minor_int: e.target.value.trim() === "" ? null : Number(e.target.value) || 0,
              })
            }
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Currency code
          <input
            className={field}
            maxLength={3}
            value={draft.currency_code}
            onChange={(e) => setDraft({ ...draft, currency_code: e.target.value })}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Trial days
          <input
            className={field}
            inputMode="numeric"
            value={draft.trial_days}
            onChange={(e) => setDraft({ ...draft, trial_days: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Sort order
          <input
            className={field}
            inputMode="numeric"
            value={draft.sort_order}
            onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Product cap (-1 = unlimited)
          <input
            className={field}
            inputMode="numeric"
            value={draft.products_limit}
            onChange={(e) => setDraft({ ...draft, products_limit: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Staff cap (-1 = unlimited)
          <input
            className={field}
            inputMode="numeric"
            value={draft.staff_limit}
            onChange={(e) => setDraft({ ...draft, staff_limit: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-xs text-muted-foreground">Payment methods allowed</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {METHODS.map((m) => (
            <label key={m} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.payment_methods_allowed.includes(m)}
                onChange={() => toggleMethod(m)}
              />
              {m.toUpperCase()}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-xs text-muted-foreground">Feature flags</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {FLAGS.map((f) => (
            <label key={f} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={Boolean(draft.feature_flags[f])}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    feature_flags: { ...draft.feature_flags, [f]: e.target.checked },
                  })
                }
              />
              {f}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-xs text-muted-foreground">
        Features (one per line)
        <textarea
          className={`${field} min-h-24`}
          value={draft.features}
          onChange={(e) => setDraft({ ...draft, features: e.target.value })}
        />
      </label>

      <button
        type="submit"
        disabled={mutation.isPending}
        className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {tk("common.save")}
      </button>
    </form>
  );
}

function PlansAndLimits() {
  const { tk, tError } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(platformPlansFn);
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => load(),
    retry: false,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["platform-plans"] });

  if (isLoading) return <p className="text-sm text-muted-foreground">{tk("common.loading")}</p>;
  if (error) return <p className="text-sm text-destructive">{tError(error)}</p>;

  const defs = (data?.plans ?? []) as PlanDef[];
  const existing = new Map(defs.map((d) => [d.plan, d]));

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Prices are stored in minor units with an explicit currency code. Caps set here drive the
        database enforcement checks; nothing is hardcoded in the app.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {PLAN_KEYS.map((plan, i) => {
          const def = existing.get(plan);
          return (
            <PlanForm
              key={plan}
              initial={def ? toDraft(def, i) : emptyDraft(plan, i)}
              onSaved={refresh}
            />
          );
        })}
      </div>
    </section>
  );
}
