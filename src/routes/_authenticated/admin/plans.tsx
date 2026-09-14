import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  billingChangePlanFn,
  billingLoadFn,
  billingPlanPreviewFn,
} from "@/lib/billing.functions";
import type { PlanPreview } from "@/lib/billing-desk.server";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";

type PlanCode = "launch" | "growth" | "business" | "enterprise";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({
    meta: [
      { title: "প্ল্যান ও বিলিং — Framique" },
      {
        name: "description",
        content:
          "Compare Framique plans, track trial days, monitor usage limits and change plan with day-prorated, VAT-inclusive BDT invoicing.",
      },
      { property: "og:title", content: "Framique plans & billing" },
      {
        property: "og:description",
        content:
          "Launch, Growth, Business and Enterprise plans with usage meters, proration preview and dunning status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlansPage,
});

function Meter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const { t } = useLang();
  const unlimited = cap < 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(cap, 1)) * 100));
  return (
    <div className="rounded-fq-md border border-border bg-card p-4">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-bangla-display">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {used} / {unlimited ? "∞" : cap}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full transition-[width] duration-300 motion-reduce:transition-none ${
            pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary"
          }`}
          style={{ width: `${unlimited ? 4 : pct}%` }}
        />
      </div>
      {!unlimited && pct >= 80 && pct < 100 && (
        <p className="mt-2 text-xs text-warning">{t("Nearing limit", "সীমার কাছাকাছি")}</p>
      )}
      {!unlimited && pct >= 100 && (
        <p className="mt-2 text-xs text-destructive">{t("Limit reached", "সীমা শেষ")}</p>
      )}
    </div>
  );
}

/** The ladder is rendered as reached / current / upcoming — never colour alone. */
function DunningLadder({
  ladder,
  stage,
  pastDueDays,
}: {
  ladder: readonly { stage: number; day: number; channel: string }[];
  stage: number;
  pastDueDays: number | null;
}) {
  const { t } = useLang();
  const label: Record<number, string> = {
    1: t("Reminder", "রিমাইন্ডার"),
    2: t("Second reminder", "দ্বিতীয় রিমাইন্ডার"),
    3: t("Marked overdue", "মেয়াদোত্তীর্ণ"),
    4: t("Store paused", "স্টোর পজ"),
    5: t("Cancelled", "বাতিল"),
  };
  return (
    <ol className="mt-3 grid gap-2 sm:grid-cols-5">
      {ladder.map((step) => {
        const reached = stage >= step.stage;
        return (
          <li
            key={step.stage}
            className={`rounded-fq-md border p-2 text-xs ${
              reached ? "border-destructive bg-destructive/10" : "border-border bg-card"
            }`}
          >
            <span className="block font-medium">
              {reached ? "✓ " : "· "}
              {label[step.stage]}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {t("day", "দিন")} {step.day}
              {pastDueDays !== null && !reached
                ? ` · ${Math.max(step.day - pastDueDays, 0)} ${t("days left", "দিন বাকি")}`
                : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PlansPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(billingLoadFn);
  const previewFn = useServerFn(billingPlanPreviewFn);
  const changeFn = useServerFn(billingChangePlanFn);
  const { data, isLoading } = useQuery({ queryKey: ["billing"], queryFn: () => load() });
  const [pending, setPending] = useState<{ plan: PlanCode; preview: PlanPreview } | null>(null);

  const preview = useMutation({
    mutationFn: (plan: PlanCode) => previewFn({ data: { plan } }),
    onSuccess: (p, plan) => {
      if (p.kind === "contact_sales") {
        toast.info(t("Contact sales for Enterprise", "এন্টারপ্রাইজের জন্য সেলসে যোগাযোগ করুন"));
        return;
      }
      setPending({ plan, preview: p });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const change = useMutation({
    mutationFn: (plan: PlanCode) => changeFn({ data: { plan } }),
    onSuccess: (r) => {
      setPending(null);
      const msg: Record<string, string> = {
        upgraded: t("Plan upgraded — prorated invoice issued", "প্ল্যান আপগ্রেড — প্রোরেটেড ইনভয়েস তৈরি"),
        downgrade_scheduled: t("Downgrade scheduled for period end", "মেয়াদ শেষে ডাউনগ্রেড নির্ধারিত"),
        downgrade_cancelled: t("Scheduled downgrade cancelled", "নির্ধারিত ডাউনগ্রেড বাতিল"),
      };
      toast.success(msg[r.kind] ?? t("Plan updated", "প্ল্যান হালনাগাদ"));
      void qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = pending?.preview;
  const dialogBody =
    p?.kind === "upgrade"
      ? `${t("Prorated for", "প্রোরেটেড")} ${p.remaining_days ?? 0} ${t("remaining days", "দিন বাকি")} · ${t("credit", "ক্রেডিট")} ${fmtMinor(p.credit_minor_int ?? 0)} · ${t("subtotal", "সাবটোটাল")} ${fmtMinor(p.subtotal_minor_int ?? 0)} + VAT ${fmtMinor(p.vat_minor_int ?? 0)} = ${fmtMinor(p.total_minor_int ?? 0)} ${t("payable now", "এখন প্রদেয়")}.`
      : p?.kind === "downgrade"
        ? `${t("Takes effect at period end", "মেয়াদ শেষে কার্যকর")} (${p.effective_at ? new Date(p.effective_at).toLocaleDateString() : "—"}). ${t("No refund; limits drop to", "রিফান্ড নেই; সীমা হবে")} ${p.products_limit} ${t("products", "পণ্য")} / ${p.staff_limit} ${t("staff", "স্টাফ")}.`
        : t("Cancels the scheduled downgrade.", "নির্ধারিত ডাউনগ্রেড বাতিল করবে।");

  return (
    <AdminShell>
      <div className="space-y-6">
        <header>
          <h1 className="font-bangla-display text-2xl font-semibold">
            {t("Plans & usage", "প্ল্যান ও ব্যবহার")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Plan changes are prorated per day and priced server-side; VAT comes from the legal rate table.",
              "প্ল্যান পরিবর্তন দিন-ভিত্তিক প্রোরেটেড; ভ্যাট আইনি রেট টেবিল থেকে।",
            )}
          </p>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>}

        {data && (
          <>
            {data.dunning.cancelled && (
              <div role="alert" className="rounded-fq-md border border-destructive bg-destructive/10 p-4 text-sm">
                <strong className="font-bangla-display">{t("Subscription cancelled", "সাবস্ক্রিপশন বাতিল")}</strong>{" "}
                — {t("data export window is open; contact support to reinstate.", "ডেটা এক্সপোর্ট উইন্ডো চালু; পুনরায় চালু করতে সাপোর্টে যোগাযোগ করুন।")}
              </div>
            )}
            {data.dunning.paused && !data.dunning.cancelled && (
              <div role="alert" className="rounded-fq-md border border-destructive bg-destructive/10 p-4 text-sm">
                <strong className="font-bangla-display">{t("Store paused", "স্টোর পজ")}</strong> —{" "}
                {t("storefront is read-only until the balance is settled.", "বকেয়া পরিশোধ না হওয়া পর্যন্ত স্টোরফ্রন্ট রিড-অনলি।")}{" "}
                <Link to="/admin/billing/invoices" className="underline">
                  {t("Pay now", "এখন পরিশোধ করুন")}
                </Link>
              </div>
            )}
            {data.dunning.limited && !data.dunning.paused && (
              <div role="alert" className="rounded-fq-md border border-warning bg-warning/10 p-4 text-sm">
                <strong className="font-bangla-display">{t("Payment overdue", "পেমেন্ট বকেয়া")}</strong> —{" "}
                <span className="tabular-nums">{data.dunning.pastDueDays ?? 0}</span>{" "}
                {t("days past due.", "দিন বকেয়া।")}{" "}
                {data.dunning.graceDaysLeft !== null && (
                  <>
                    {t("Grace ends in", "গ্রেস শেষ হবে")}{" "}
                    <span className="tabular-nums font-semibold">
                      {Math.max(data.dunning.graceDaysLeft, 0)}
                    </span>{" "}
                    {t("days.", "দিনে।")}
                  </>
                )}
                <DunningLadder
                  ladder={data.dunning.ladder}
                  stage={data.dunning.stage}
                  pastDueDays={data.dunning.pastDueDays}
                />
              </div>
            )}
            {data.scheduled && (
              <div className="flex flex-wrap items-center gap-3 rounded-fq-md border border-border bg-muted/40 p-4 text-sm">
                <span>
                  {t("Downgrade to", "ডাউনগ্রেড")} <strong>{data.scheduled.plan}</strong>{" "}
                  {t("on", "তারিখে")}{" "}
                  <span className="tabular-nums">
                    {new Date(data.scheduled.at).toLocaleDateString()}
                  </span>
                </span>
                <button
                  type="button"
                  className="min-h-11 rounded-fq-md border border-border px-3"
                  onClick={() => change.mutate(data.subscription.plan as PlanCode)}
                >
                  {t("Keep current plan", "বর্তমান প্ল্যান রাখুন")}
                </button>
              </div>
            )}
            {data.subscription.status === "trial" && data.trialDaysLeft !== null && (
              <div className="rounded-fq-md border border-primary bg-primary/10 p-4 text-sm">
                {t("Trial ends in", "ট্রায়াল শেষ হতে")}{" "}
                <span className="tabular-nums font-semibold">
                  {Math.max(data.trialDaysLeft, 0)}
                </span>{" "}
                {t("days.", "দিন বাকি।")}
              </div>
            )}
            {data.merchant?.kyc_status !== "verified" && (
              <div className="rounded-fq-md border border-border bg-muted/40 p-4 text-sm">
                {t("KYC verification is required before upgrading", "আপগ্রেডের আগে KYC যাচাই প্রয়োজন")} (
                {t("current", "বর্তমান")}: {data.merchant?.kyc_status}).
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2">
              <Meter
                label={t("Products", "পণ্য")}
                used={data.usage.products}
                cap={data.limits.products_limit}
              />
              <Meter
                label={t("Staff", "স্টাফ")}
                used={data.usage.staff}
                cap={data.limits.staff_limit}
              />
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.plans.map((plan) => {
                const current = data.subscription.plan === plan.plan;
                const vatted =
                  plan.priceMinorInt === null
                    ? null
                    : plan.priceMinorInt + Math.round((plan.priceMinorInt * data.vat.rate) / 10000);
                const currentPrice =
                  data.plans.find((x) => x.plan === data.subscription.plan)?.priceMinorInt ?? 0;
                const isDowngrade =
                  plan.priceMinorInt !== null && plan.priceMinorInt < (currentPrice ?? 0);
                return (
                  <article
                    key={plan.plan}
                    className={`flex flex-col rounded-fq-md border p-4 transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none ${
                      current ? "border-primary bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-bangla-display text-lg font-semibold">{plan.title}</h2>
                      {current && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                          {t("Current", "বর্তমান")}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 tabular-nums text-xl font-semibold">
                      {plan.priceMinorInt === null
                        ? t("Custom", "কাস্টম")
                        : `${fmtMinor(plan.priceMinorInt)} / ${t("mo", "মাস")}`}
                    </p>
                    {vatted !== null && (plan.priceMinorInt ?? 0) > 0 && (
                      <p className="tabular-nums text-xs text-muted-foreground">
                        VAT {data.vat.rate / 100}% {t("incl.", "সহ")} {fmtMinor(vatted)}
                      </p>
                    )}
                    <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground">
                      {plan.features.map((f) => (
                        <li key={f} className="font-bangla-display">
                          • {f}
                        </li>
                      ))}
                    </ul>
                    {!current && (
                      <button
                        type="button"
                        disabled={
                          preview.isPending ||
                          change.isPending ||
                          data.dunning.cancelled ||
                          (!isDowngrade && data.merchant?.kyc_status !== "verified")
                        }
                        onClick={() => preview.mutate(plan.plan as PlanCode)}
                        className={`mt-4 min-h-11 rounded-fq-md px-3 text-sm font-medium disabled:opacity-50 ${
                          isDowngrade
                            ? "border border-border text-foreground"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        {isDowngrade ? t("Downgrade", "ডাউনগ্রেড") : t("Upgrade", "আপগ্রেড")}
                      </button>
                    )}
                  </article>
                );
              })}
            </section>

            <Link to="/admin/billing/invoices" className="inline-block text-sm underline">
              {t("Invoices & payments", "ইনভয়েস ও পেমেন্ট")}
            </Link>
          </>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={
          p?.kind === "upgrade"
            ? t("Confirm upgrade", "আপগ্রেড নিশ্চিত করুন")
            : t("Confirm downgrade", "ডাউনগ্রেড নিশ্চিত করুন")
        }
        description={dialogBody}
        confirmLabel={t("Confirm", "নিশ্চিত")}
        tone={p?.kind === "downgrade" ? "danger" : "primary"}
        busy={change.isPending}
        onConfirm={() => pending && change.mutate(pending.plan)}
        onCancel={() => setPending(null)}
      />
    </AdminShell>
  );
}
