import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sliders,
  Globe,
  Shield,
  CreditCard,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useStoreUrl } from "@/hooks/use-store-url";
import { ImpersonationConsent } from "@/components/admin/ImpersonationConsent";
import { TotpCard } from "@/components/admin/settings/TotpCard";
import { useLang } from "@/lib/i18n";
import {
  COMMON_TIMEZONES,
  DEFAULT_MERCHANT_TIMEZONE,
  isValidTimezone,
  formatDateTime,
} from "@/lib/timezone";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Store settings — Framique Admin" },
      {
        name: "description",
        content:
          "Configure your storefront name, payment methods, timezone and delivery charges.",
      },
      { property: "og:title", content: "Store settings" },
      {
        property: "og:description",
        content: "Control COD, mobile payments, timezone and shipping fees.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type Settings = {
  tagline: string;
  cod_enabled: boolean;
  mfs_enabled: boolean;
  cod_surcharge_taka: number;
  shipping_flat_taka: number;
  free_shipping_taka: number | null;
  prices_include_vat: boolean;
  timezone: string;
  allow_customer_timezone: boolean;
};

function SettingsPage() {
  const { t } = useLang();
  const { data: merchant } = useMerchant();
  const { storeUrl, primaryHost } = useStoreUrl();
  const qc = useQueryClient();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [form, setForm] = useState<Settings>({
    tagline: "",
    cod_enabled: true,
    mfs_enabled: true,
    cod_surcharge_taka: 0,
    shipping_flat_taka: 60,
    free_shipping_taka: null,
    prices_include_vat: false,
    timezone: DEFAULT_MERCHANT_TIMEZONE,
    allow_customer_timezone: false,
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data } = useQuery({
    queryKey: ["merchant-settings", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_settings")
        .select("*")
        .eq("merchant_id", merchant!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    const steps = (
      data.setup_steps && typeof data.setup_steps === "object"
        ? data.setup_steps
        : {}
    ) as Record<string, unknown>;
    setForm({
      tagline: data.tagline ?? "",
      cod_enabled: data.cod_enabled,
      mfs_enabled: data.mfs_enabled,
      cod_surcharge_taka: Number(data.cod_surcharge_minor_int) / 100,
      shipping_flat_taka: Number(data.shipping_flat_minor_int) / 100,
      free_shipping_taka: data.free_shipping_threshold_minor_int
        ? Number(data.free_shipping_threshold_minor_int) / 100
        : null,
      prices_include_vat: data.prices_include_vat,
      timezone:
        typeof steps.timezone === "string" && isValidTimezone(steps.timezone)
          ? steps.timezone
          : DEFAULT_MERCHANT_TIMEZONE,
      allow_customer_timezone:
        typeof steps.allow_customer_timezone === "boolean"
          ? steps.allow_customer_timezone
          : false,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const currentSteps = (
        data?.setup_steps && typeof data.setup_steps === "object"
          ? data.setup_steps
          : {}
      ) as Record<string, unknown>;
      const nextSteps = {
        ...currentSteps,
        timezone: form.timezone,
        allow_customer_timezone: form.allow_customer_timezone,
      };

      // merchant_settings has UNIQUE(merchant_id) but no PK, so the
      // conflict target must be explicit — otherwise PostgREST answers 409.
      const { error } = await supabase.from("merchant_settings").upsert(
        {
          merchant_id: merchant!.id,
          tagline: form.tagline || null,
          cod_enabled: form.cod_enabled,
          mfs_enabled: form.mfs_enabled,
          cod_surcharge_minor_int: Math.round(form.cod_surcharge_taka * 100),
          shipping_flat_minor_int: Math.round(form.shipping_flat_taka * 100),
          free_shipping_threshold_minor_int:
            form.free_shipping_taka === null
              ? null
              : Math.round(form.free_shipping_taka * 100),
          prices_include_vat: form.prices_include_vat,
          setup_steps: nextSteps as any,
        },
        { onConflict: "merchant_id" },
      );
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["merchant-settings"] }),
  });

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-bangla-display text-2xl font-bold tracking-tight text-foreground">
          {t("Store Settings", "স্টোর সেটিংস")}
        </h1>
        {merchant &&
          (primaryHost ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Your live storefront:", "আপনার লাইভ স্টোরফ্রন্ট:")}{" "}
              <a
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
                href={storeUrl()}
              >
                {`${primaryHost} ↗`}
              </a>
            </p>
          ) : (
            // Path storefronts are retired (bare 404): with no custom
            // domain there is no live storefront, so never link one.
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "No live storefront yet —",
                "এখনো কোনো লাইভ স্টোরফ্রন্ট নেই —",
              )}{" "}
              <Link
                className="font-medium text-primary hover:underline"
                to="/dashboard/settings/domains"
              >
                {t("connect a custom domain", "কাস্টম ডোমেইন যুক্ত করুন")}
              </Link>
            </p>
          ))}
      </div>

      {/* Settings Subnav Tabs */}
      <nav
        aria-label={t("Settings navigation", "সেটিংস নেভিগেশন")}
        className="flex overflow-x-auto border-b border-border text-sm"
      >
        <Link
          to="/dashboard/settings"
          className="flex items-center gap-2 border-b-2 border-primary px-4 py-2.5 font-medium text-primary"
        >
          <Sliders className="size-4" />
          <span>{t("General", "সাধারণ")}</span>
        </Link>
        <Link
          to="/dashboard/settings/security"
          className="flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 font-medium text-muted-foreground hover:text-foreground hover:border-border"
        >
          <Shield className="size-4" />
          <span>{t("Security & 2FA", "নিরাপত্তা ও ২এফএ")}</span>
        </Link>
        <Link
          to="/dashboard/settings/domains"
          className="flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 font-medium text-muted-foreground hover:text-foreground hover:border-border"
        >
          <Globe className="size-4" />
          <span>{t("Domains", "ডোমেইন")}</span>
        </Link>
        <Link
          to="/dashboard/settings/providers"
          className="flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 font-medium text-muted-foreground hover:text-foreground hover:border-border"
        >
          <CreditCard className="size-4" />
          <span>{t("Payments", "পেমেন্ট")}</span>
        </Link>
      </nav>

      {/* Two-Factor Authentication (TOTP) Card */}
      <TotpCard showLinkToSecurity={true} />

      {/* General Storefront Settings Form */}
      <section className="rounded-fq-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">
          {t(
            "Storefront Preferences & Payments",
            "স্টোরফ্রন্ট পছন্দ ও পেমেন্ট",
          )}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Configure order payment options, delivery charges and VAT calculation.",
            "পেমেন্ট অপশন, ডেলিভারি চার্জ ও ভ্যাট নির্ধারণ করুন।",
          )}
        </p>

        <form
          className="mt-5 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">
              {t("Store Tagline", "স্টোর ট্যাগলাইন")}
            </span>
            <input
              value={form.tagline}
              onChange={(e) =>
                setForm((f) => ({ ...f, tagline: e.target.value }))
              }
              placeholder={t(
                "e.g. Handcrafted Bangladeshi Artisan Goods",
                "যেমন: হাতে তৈরি হস্তশিল্প পণ্য",
              )}
              className="h-11 w-full rounded-fq-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>

          <div className="space-y-3 pt-1">
            <label className="flex min-h-6 items-center gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.cod_enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cod_enabled: e.target.checked }))
                }
                className="size-4 rounded-fq-sm border-border text-primary"
              />
              {t(
                "Enable Cash on Delivery (COD)",
                "ক্যাশ অন ডেলিভারি (COD) চালু রাখুন",
              )}
            </label>

            <label className="flex min-h-6 items-center gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.mfs_enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, mfs_enabled: e.target.checked }))
                }
                className="size-4 rounded-fq-sm border-border text-primary"
              />
              {t(
                "Enable bKash / Nagad Mobile Financial Services",
                "bKash / Nagad মোবাইল পেমেন্ট চালু রাখুন",
              )}
            </label>

            <label className="flex min-h-6 items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded-fq-sm border-border text-primary"
                checked={form.prices_include_vat}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    prices_include_vat: e.target.checked,
                  }))
                }
              />
              <span>
                {t(
                  "Listed prices already include VAT",
                  "তালিকাভুক্ত দামে ভ্যাট অন্তর্ভুক্ত",
                )}
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {t(
                    "Checkout extracts VAT from the price shown instead of adding it on top, so the shopper pays exactly the listed amount.",
                    "চেকআউটে দামের উপরে ভ্যাট যোগ না করে দামের ভেতর থেকে হিসাব হবে।",
                  )}
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            <NumberField
              label={t("COD surcharge (৳)", "সিওডি অতিরিক্ত চার্জ (৳)")}
              value={form.cod_surcharge_taka}
              onChange={(v) =>
                setForm((f) => ({ ...f, cod_surcharge_taka: v }))
              }
            />
            <NumberField
              label={t("Flat delivery (৳)", "ফিক্সড ডেলিভারি (৳)")}
              value={form.shipping_flat_taka}
              onChange={(v) =>
                setForm((f) => ({ ...f, shipping_flat_taka: v }))
              }
            />
            <NumberField
              label={t("Free delivery above (৳)", "ফ্রি ডেলিভারি নূন্যতম (৳)")}
              value={form.free_shipping_taka ?? 0}
              onChange={(v) =>
                setForm((f) => ({ ...f, free_shipping_taka: v || null }))
              }
            />
          </div>

          {/* Store Timezone & Customer Experience Section */}
          <div className="rounded-fq-md border border-border bg-muted/20 p-4 pt-3.5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">
                  {t(
                    "Store Timezone & Shopper Policy",
                    "স্টোর টাইমজোন ও ক্রেতার পছন্দ",
                  )}
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {t("Current Store Time:", "বর্তমান স্টোর সময়:")}
                </span>
                <span className="font-mono font-medium text-foreground bg-background px-2 py-0.5 rounded border border-border">
                  {formatDateTime(currentTime, form.timezone)}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-foreground">
                  {t("Primary Store Timezone", "প্রধান স্টোর টাইমজোন")}
                </span>
                <select
                  value={form.timezone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, timezone: e.target.value }))
                  }
                  className="h-11 w-full rounded-fq-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {Array.from(
                    new Set(COMMON_TIMEZONES.map((tz) => tz.region)),
                  ).map((region) => (
                    <optgroup key={region} label={region}>
                      {COMMON_TIMEZONES.filter(
                        (tz) => tz.region === region,
                      ).map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.offset} — {tz.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t(
                    "Used for order histories, invoices, daily cutoffs and scheduled campaign launches.",
                    "অর্ডার ইতিহাস, ইনভয়েস, দৈনিক কাটঅফ এবং নির্ধারিত ক্যাম্পেইনে ব্যবহৃত হবে।",
                  )}
                </span>
              </label>

              <div className="space-y-1 sm:pt-1">
                <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  {t("Shopper Timezone Preference", "ক্রেতার টাইমজোন সুবিধা")}
                </span>
                <label className="flex items-start gap-2.5 rounded-fq-md border border-border/80 bg-background p-3 text-sm text-foreground cursor-pointer hover:border-primary/40 transition-colors">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded-fq-sm border-border text-primary"
                    checked={form.allow_customer_timezone}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        allow_customer_timezone: e.target.checked,
                      }))
                    }
                  />
                  <div>
                    <span className="font-medium">
                      {t(
                        "Allow shoppers to view dates in their local timezone",
                        "ক্রেতাদের তাদের স্থানীয় টাইমজোনে দেখার অনুমতি দিন",
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {t(
                        "If enabled, shoppers can view order timelines and timestamps in their local device timezone or pick from the storefront header. If disabled, all visitors see dates strictly in your store timezone.",
                        "চালু থাকলে ক্রেতারা তাদের ডিভাইসের স্থানীয় টাইমজোনে স্টোরের তারিখ ও সময় দেখতে পারবেন। বন্ধ থাকলে সবাই আপনার স্টোর টাইমজোন দেখতে পাবে।",
                      )}
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!merchant || save.isPending}
              className="min-h-10 rounded-fq-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending
                ? t("Saving…", "সংরক্ষণ হচ্ছে…")
                : t("Save Settings", "সেটিংস সংরক্ষণ")}
            </button>
            <p
              aria-live="polite"
              className="text-sm font-medium text-emerald-600"
            >
              {save.isSuccess
                ? t("Settings saved successfully.", "সেটিংস সংরক্ষিত হয়েছে।")
                : ""}
            </p>
          </div>
        </form>
      </section>

      {/* Impersonation Consent */}
      {merchant ? <ImpersonationConsent merchantId={merchant.id} /> : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="money h-12 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
      />
    </label>
  );
}
