import { useEffect, useId, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, ExternalLink, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useStoreUrl } from "@/hooks/use-store-url";
import { ImpersonationConsent } from "@/components/admin/ImpersonationConsent";
import { useLang } from "@/lib/i18n";
import {
  COMMON_TIMEZONES,
  DEFAULT_MERCHANT_TIMEZONE,
  isValidTimezone,
  formatDateTime,
} from "@/lib/timezone";
import { Switch } from "@/components/ui/switch";

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

  const { data, isLoading } = useQuery({
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
      const nextSteps: Record<string, unknown> = {
        ...currentSteps,
        timezone: form.timezone,
        allow_customer_timezone: form.allow_customer_timezone,
      };

      // merchant_settings has UNIQUE(merchant_id) but no PK, so the
      // conflict target must be explicit — otherwise PostgREST answers 409.
      const { error } = await supabase.from("merchant_settings").upsert(
        {
          merchant_id: merchant!.id,
          tagline: form.tagline.trim() || null,
          cod_enabled: form.cod_enabled,
          mfs_enabled: form.mfs_enabled,
          cod_surcharge_minor_int: Math.round(form.cod_surcharge_taka * 100),
          shipping_flat_minor_int: Math.round(form.shipping_flat_taka * 100),
          free_shipping_threshold_minor_int:
            form.free_shipping_taka === null || form.free_shipping_taka === 0
              ? null
              : Math.round(form.free_shipping_taka * 100),
          prices_include_vat: form.prices_include_vat,
          setup_steps: nextSteps,
        },
        { onConflict: "merchant_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        t("Settings saved successfully.", "সেটিংস সংরক্ষিত হয়েছে।"),
      );
      void qc.invalidateQueries({ queryKey: ["merchant-settings"] });
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("Failed to save settings.", "সেটিংস সংরক্ষণ ব্যর্থ হয়েছে।"),
      );
    },
  });

  // Support ⌘S / Ctrl+S to quickly save without breaking focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (merchant && !save.isPending) {
          save.mutate();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [merchant, save]);

  const taglineId = useId();
  const timezoneId = useId();

  return (
    <div className="max-w-3xl space-y-6 pb-12">
      {/* Calm Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bangla-display text-2xl font-bold tracking-tight text-foreground">
            {t("Store Settings", "স্টোর সেটিংস")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Configure your storefront identity, payment options, delivery rates and regional preferences.",
              "আপনার স্টোরফ্রন্ট পরিচিতি, পেমেন্ট অপশন, ডেলিভারি চার্জ ও আঞ্চলিক পছন্দ নির্ধারণ করুন।",
            )}
          </p>
        </div>

        {merchant && (
          <div className="pt-1 sm:pt-0">
            {primaryHost ? (
              <a
                target="_blank"
                rel="noreferrer"
                href={storeUrl()}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs transition hover:border-border hover:text-foreground"
                title={t("Open live storefront", "লাইভ স্টোরফ্রন্ট খুলুন")}
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="font-mono text-xs">{primaryHost}</span>
                <ExternalLink
                  className="size-3 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden
                />
              </a>
            ) : (
              <Link
                to="/dashboard/settings/domains"
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              >
                <Globe className="size-3 text-muted-foreground" aria-hidden />
                <span>
                  {t("Connect custom domain", "কাস্টম ডোমেইন যুক্ত করুন")}
                </span>
              </Link>
            )}
          </div>
        )}
      </header>

      {/* Main Settings Form */}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {/* 1. Store Identity */}
        <SettingsCard
          title={t("Store Identity", "স্টোর পরিচিতি")}
          description={t(
            "Primary tagline and subtitle shown to shoppers and search engines.",
            "ক্রেতা এবং সার্চ ইঞ্জিনের সামনে প্রদর্শিত প্রধান ট্যাগলাইন ও সাবটাইটেল।",
          )}
        >
          <div className="space-y-1.5">
            <label
              htmlFor={taglineId}
              className="text-sm font-medium text-foreground"
            >
              {t("Store Tagline", "স্টোর ট্যাগলাইন")}
            </label>
            <input
              id={taglineId}
              value={form.tagline}
              onChange={(e) =>
                setForm((f) => ({ ...f, tagline: e.target.value }))
              }
              placeholder={t(
                "e.g. Handcrafted Bangladeshi Artisan Goods",
                "যেমন: হাতে তৈরি হস্তশিল্প পণ্য",
              )}
              className="h-10 w-full rounded-fq-md border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Appears below your store name in browser tabs, meta previews, and receipts.",
                "ব্রাউজার ট্যাব, মেটা প্রিভিউ এবং রসিদে স্টোর নামের নিচে দেখা যাবে।",
              )}
            </p>
          </div>
        </SettingsCard>

        {/* 2. Payment Methods */}
        <SettingsCard
          title={t("Payment Methods", "পেমেন্ট পদ্ধতি")}
          description={t(
            "Control which payment options are presented to customers at checkout.",
            "চেকআউটে ক্রেতাদের জন্য কোন কোন পেমেন্ট অপশন চালু থাকবে তা নির্ধারণ করুন।",
          )}
        >
          <div className="divide-y divide-border/60">
            <SettingToggleRow
              id="settings-cod-toggle"
              title={t(
                "Enable Cash on Delivery (COD)",
                "ক্যাশ অন ডেলিভারি (COD) চালু রাখুন",
              )}
              description={t(
                "Allow customers to pay in cash upon receiving their order.",
                "পণ্য হাতে পেয়ে ক্রেতাদের নগদ টাকায় মূল্য পরিশোধের সুযোগ দিন।",
              )}
              checked={form.cod_enabled}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, cod_enabled: checked }))
              }
            />

            <SettingToggleRow
              id="settings-mfs-toggle"
              title={t(
                "Enable bKash / Nagad Mobile Payments",
                "bKash / Nagad মোবাইল পেমেন্ট চালু রাখুন",
              )}
              description={t(
                "Accept payments through Bangladesh mobile financial services.",
                "বাংলাদেশি মোবাইল ফিনান্সিয়াল সার্ভিসের মাধ্যমে ডিজিটাল পেমেন্ট গ্রহণ করুন।",
              )}
              checked={form.mfs_enabled}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, mfs_enabled: checked }))
              }
            />
          </div>
        </SettingsCard>

        {/* 3. Pricing & Taxes */}
        <SettingsCard
          title={t("Pricing & Taxes", "মূল্য ও কর")}
          description={t(
            "Define how taxes are calculated and presented on product listings.",
            "পণ্যের মূল্যের সাথে কর ও ভ্যাট কীভাবে হিসাব হবে তা নির্ধারণ করুন।",
          )}
        >
          <SettingToggleRow
            id="settings-vat-toggle"
            title={t(
              "Listed prices already include VAT",
              "তালিকাভুক্ত দামে ভ্যাট অন্তর্ভুক্ত",
            )}
            description={t(
              "Checkout extracts VAT from the displayed price instead of adding extra charges on top, so shoppers pay exactly the advertised amount.",
              "চেকআউটে অতিরিক্ত ভ্যাট যোগ না করে পণ্যের প্রদর্শিত দামের ভেতর থেকেই হিসাব হবে, ফলে ক্রেতা সঠিক প্রদর্শিত মূল্যই পরিশোধ করবেন।",
            )}
            checked={form.prices_include_vat}
            onCheckedChange={(checked) =>
              setForm((f) => ({ ...f, prices_include_vat: checked }))
            }
          />
        </SettingsCard>

        {/* 4. Delivery & Fulfillment Rates */}
        <SettingsCard
          title={t("Delivery & Fulfillment Rates", "ডেলিভারি ও শিপিং চার্জ")}
          description={t(
            "Standard shipping fees and order thresholds applied to checkouts.",
            "চেকআউটে প্রযোজ্য স্ট্যান্ডার্ড ডেলিভারি ফি এবং ফ্রি ডেলিভারির সীমা।",
          )}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <MoneyField
              id="settings-shipping-flat"
              label={t("Flat delivery", "ফিক্সড ডেলিভারি")}
              hint={t("Default fee", "ডিফল্ট চার্জ")}
              value={form.shipping_flat_taka}
              onChange={(val) =>
                setForm((f) => ({ ...f, shipping_flat_taka: val }))
              }
              placeholder="60"
            />

            <MoneyField
              id="settings-free-shipping"
              label={t("Free delivery above", "ফ্রি ডেলিভারি নূন্যতম")}
              hint={t("0 to disable", "বন্ধ রাখতে ০")}
              value={form.free_shipping_taka ?? 0}
              onChange={(val) =>
                setForm((f) => ({
                  ...f,
                  free_shipping_taka: val > 0 ? val : null,
                }))
              }
              placeholder="0"
            />

            <MoneyField
              id="settings-cod-surcharge"
              label={t("COD surcharge", "সিওডি অতিরিক্ত চার্জ")}
              hint={t("Added to COD", "সিওডিতে প্রযোজ্য")}
              value={form.cod_surcharge_taka}
              onChange={(val) =>
                setForm((f) => ({ ...f, cod_surcharge_taka: val }))
              }
              placeholder="0"
            />
          </div>
        </SettingsCard>

        {/* 5. Timezone & Regional Localization */}
        <SettingsCard
          title={t("Timezone & Localization", "টাইমজোন ও আঞ্চলিক সেটিংস")}
          description={t(
            "Controls order histories, analytics reporting, invoices and scheduled campaign cutoffs.",
            "অর্ডার ইতিহাস, ইনভয়েস, দৈনিক কাটঅফ এবং নির্ধারিত ক্যাম্পেইনে ব্যবহৃত হবে।",
          )}
          headerAction={<LiveTimeBadge timezone={form.timezone} />}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor={timezoneId}
                className="text-sm font-medium text-foreground"
              >
                {t("Primary Store Timezone", "প্রধান স্টোর টাইমজোন")}
              </label>
              <select
                id={timezoneId}
                value={form.timezone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timezone: e.target.value }))
                }
                className="h-10 w-full rounded-fq-md border border-input bg-background px-3 text-sm text-foreground transition-colors focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
              >
                {Array.from(
                  new Set(COMMON_TIMEZONES.map((tz) => tz.region)),
                ).map((region) => (
                  <optgroup key={region} label={region}>
                    {COMMON_TIMEZONES.filter((tz) => tz.region === region).map(
                      (tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.offset} — {tz.label}
                        </option>
                      ),
                    )}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-border/60">
              <SettingToggleRow
                id="settings-customer-tz-toggle"
                title={t(
                  "Allow shoppers to view dates in their local timezone",
                  "ক্রেতাদের তাদের স্থানীয় টাইমজোনে দেখার অনুমতি দিন",
                )}
                description={t(
                  "When enabled, visitors will see order timelines and tracking timestamps in their device's local timezone. When disabled, all dates strictly adhere to your store timezone.",
                  "চালু থাকলে ক্রেতারা তাদের ডিভাইসের স্থানীয় টাইমজোনে স্টোরের তারিখ ও সময় দেখতে পারবেন। বন্ধ থাকলে সবাই আপনার স্টোর টাইমজোন দেখতে পাবে।",
                )}
                checked={form.allow_customer_timezone}
                onCheckedChange={(checked) =>
                  setForm((f) => ({
                    ...f,
                    allow_customer_timezone: checked,
                  }))
                }
              />
            </div>
          </div>
        </SettingsCard>

        {/* Action / Save Bar */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground hidden sm:block">
            <span>
              {t(
                "Press ⌘S or Ctrl+S to save anytime",
                "যেকোনো সময় সেভ করতে ⌘S অথবা Ctrl+S চাপুন",
              )}
            </span>
          </div>

          <button
            type="submit"
            disabled={!merchant || isLoading || save.isPending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-fq-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                <span>{t("Saving…", "সংরক্ষণ হচ্ছে…")}</span>
              </>
            ) : (
              <span>{t("Save Settings", "সেটিংস সংরক্ষণ")}</span>
            )}
          </button>
        </div>
      </form>

      {/* Platform Support Access */}
      {merchant ? <ImpersonationConsent merchantId={merchant.id} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Calm Presentational Subcomponents                                          */
/* -------------------------------------------------------------------------- */

function SettingsCard({
  title,
  description,
  headerAction,
  children,
}: {
  title: string;
  description?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-fq-lg border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-shadow">
      <header className="flex flex-wrap items-start justify-between gap-3 pb-4">
        <div>
          <h2 className="font-bangla-display text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {headerAction}
      </header>
      <div className="pt-1">{children}</div>
    </section>
  );
}

function SettingToggleRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="space-y-0.5 pr-2">
        <label
          htmlFor={id}
          className="text-sm font-medium text-foreground cursor-pointer select-none"
        >
          {title}
        </label>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

function MoneyField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium text-foreground">
          {label}
        </label>
        {hint && (
          <span className="text-[11px] text-muted-foreground/80">{hint}</span>
        )}
      </div>
      <div className="relative flex items-center">
        <span
          className="pointer-events-none absolute left-3 text-xs font-semibold text-muted-foreground select-none"
          aria-hidden
        >
          ৳
        </span>
        <input
          id={id}
          type="number"
          min={0}
          value={value === 0 ? "0" : value || ""}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={placeholder}
          className="h-10 w-full rounded-fq-md border border-input bg-background pl-7 pr-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
      </div>
    </div>
  );
}

/**
 * Live time pill isolated in its own subcomponent so the parent form
 * does not re-render every 10 seconds.
 */
function LiveTimeBadge({ timezone }: { timezone: string }) {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
      title="Store current time"
    >
      <Clock className="size-3.5 text-muted-foreground/70" aria-hidden />
      <span className="font-mono text-[11px] font-medium text-foreground tabular-nums">
        {formatDateTime(time, timezone)}
      </span>
    </div>
  );
}
