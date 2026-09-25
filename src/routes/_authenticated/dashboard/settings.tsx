import { useEffect, useId, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2 } from "@/components/icons/tabler";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
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
    <div className="max-w-4xl space-y-8 pb-16">
      {/* Calm & Focused Header without extraneous badges */}
      <header className="border-b border-border/40 pb-5">
        <h1 className="font-bangla-display text-2xl font-bold tracking-tight text-foreground">
          {t("Store Settings", "স্টোর সেটিংস")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Manage your store profile, checkout preferences, shipping fees, and timezone.",
            "আপনার স্টোর পরিচিতি, চেকআউট অপশন, ডেলিভারি ফি এবং টাইমজোন পরিচালনা করুন।",
          )}
        </p>
      </header>

      {/* Main Form structured in clean, calm two-column sections */}
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {/* 1. Store Profile */}
        <FormSection
          title={t("Store Profile", "স্টোর পরিচিতি")}
          description={t(
            "Public branding information displayed across your storefront, browser tabs, and receipts.",
            "স্টোরফ্রন্ট হেডার, ব্রাউজার ট্যাব এবং রসিদে প্রদর্শিত সাধারণ ব্র্যান্ড তথ্য।",
          )}
        >
          <div className="space-y-1.5">
            <label
              htmlFor={taglineId}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
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
                "A short tagline or subtitle displayed beneath your store title.",
                "আপনার স্টোর নামের নিচে প্রদর্শিত সংক্ষিপ্ত স্লোগান বা সাবটাইটেল।",
              )}
            </p>
          </div>
        </FormSection>

        {/* 2. Checkout & Payments */}
        <FormSection
          title={t("Payments & Checkout", "পেমেন্ট ও চেকআউট")}
          description={t(
            "Control payment methods presented to shoppers and specify how taxes are calculated.",
            "চেকআউটে কোন কোন পেমেন্ট পদ্ধতি সক্রিয় থাকবে এবং কীভাবে ভ্যাট হিসাব হবে তা নির্ধারণ করুন।",
          )}
        >
          <div className="divide-y divide-border/50">
            <SettingToggleRow
              id="settings-cod-toggle"
              title={t("Cash on Delivery (COD)", "ক্যাশ অন ডেলিভারি (COD)")}
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
                "bKash / Nagad Mobile Payments",
                "bKash / Nagad মোবাইল পেমেন্ট",
              )}
              description={t(
                "Accept instant payments through Bangladesh mobile financial services.",
                "বাংলাদেশি মোবাইল ফিনান্সিয়াল সার্ভিসের মাধ্যমে ডিজিটাল পেমেন্ট গ্রহণ করুন।",
              )}
              checked={form.mfs_enabled}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, mfs_enabled: checked }))
              }
            />

            <SettingToggleRow
              id="settings-vat-toggle"
              title={t(
                "Listed prices include VAT",
                "তালিকাভুক্ত দামে ভ্যাট অন্তর্ভুক্ত",
              )}
              description={t(
                "Checkout extracts VAT from the displayed price instead of adding extra charges, so customers pay exactly the listed amount.",
                "চেকআউটে অতিরিক্ত ভ্যাট যোগ না করে পণ্যের দামের ভেতর থেকেই হিসাব হবে, ফলে ক্রেতা প্রদর্শিত মূল্যই পরিশোধ করবেন।",
              )}
              checked={form.prices_include_vat}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, prices_include_vat: checked }))
              }
            />
          </div>
        </FormSection>

        {/* 3. Shipping & Delivery */}
        <FormSection
          title={t("Shipping & Delivery", "ডেলিভারি ও শিপিং চার্জ")}
          description={t(
            "Standard delivery fees and threshold policies automatically calculated at checkout.",
            "চেকআউটে স্বয়ংক্রিয়ভাবে প্রযোজ্য ডেলিভারি চার্জ এবং ফ্রি ডেলিভারির সীমা।",
          )}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CurrencyField
                id="settings-shipping-flat"
                label={t("Standard Delivery Fee", "স্ট্যান্ডার্ড ডেলিভারি ফি")}
                hint={t(
                  "Default flat delivery charge per order",
                  "প্রতি অর্ডারের সাধারণ ডেলিভারি চার্জ",
                )}
                value={form.shipping_flat_taka}
                onChange={(val) =>
                  setForm((f) => ({ ...f, shipping_flat_taka: val }))
                }
                placeholder="60"
              />

              <CurrencyField
                id="settings-free-shipping"
                label={t("Free Delivery Threshold", "ফ্রি ডেলিভারি নূন্যতম")}
                hint={t(
                  "Orders above this amount ship free (0 to disable)",
                  "এই মূল্যের বেশি অর্ডারে ফ্রি ডেলিভারি (বন্ধ রাখতে ০)",
                )}
                value={form.free_shipping_taka ?? 0}
                onChange={(val) =>
                  setForm((f) => ({
                    ...f,
                    free_shipping_taka: val > 0 ? val : null,
                  }))
                }
                placeholder="0"
              />
            </div>

            <div className="pt-2 border-t border-border/40">
              <CurrencyField
                id="settings-cod-surcharge"
                label={t("Cash on Delivery Surcharge", "সিওডি অতিরিক্ত ফি")}
                hint={t(
                  "Optional surcharge added only when COD is chosen (0 for none)",
                  "শুধুমাত্র ক্যাশ অন ডেলিভারি অর্ডারে প্রযোজ্য ফি (না থাকলে ০)",
                )}
                value={form.cod_surcharge_taka}
                onChange={(val) =>
                  setForm((f) => ({ ...f, cod_surcharge_taka: val }))
                }
                placeholder="0"
              />
            </div>
          </div>
        </FormSection>

        {/* 4. Regional & Timezone */}
        <FormSection
          title={t("Regional & Timezone", "টাইমজোন ও সময়")}
          description={t(
            "Governs daily cutoff schedules, analytics reporting, order timestamps, and customer date formatting.",
            "দৈনিক সেলস কাটঅফ, ইনভয়েস, অর্ডার টাইমস্ট্যাম্প এবং রিপোর্ট তৈরিতে ব্যবহৃত হবে।",
          )}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor={timezoneId}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
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

              <LiveStoreTime timezone={form.timezone} />
            </div>

            <div className="pt-3 border-t border-border/50">
              <SettingToggleRow
                id="settings-customer-tz-toggle"
                title={t(
                  "Allow shoppers to view dates in their local timezone",
                  "ক্রেতাদের তাদের স্থানীয় টাইমজোনে তারিখ দেখার অনুমতি দিন",
                )}
                description={t(
                  "When enabled, order tracking timestamps display in each visitor's device timezone. When disabled, all timestamps strictly follow your store timezone.",
                  "চালু থাকলে ক্রেতারা তাদের ডিভাইসের স্থানীয় টাইমজোনে সময় দেখতে পাবেন। বন্ধ থাকলে সবসময় আপনার স্টোর টাইমজোন প্রদর্শিত হবে।",
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
        </FormSection>

        {/* Action / Save Bar */}
        <div className="flex items-center justify-between pt-4 border-t border-border/40">
          <p className="text-xs text-muted-foreground hidden sm:block">
            {t(
              "Press ⌘S or Ctrl+S to save changes anytime",
              "যেকোনো সময় সেভ করতে ⌘S অথবা Ctrl+S চাপুন",
            )}
          </p>

          <button
            type="submit"
            disabled={!merchant || isLoading || save.isPending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-fq-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
/* Calm, Minimal Section Layout Primitives                                    */
/* -------------------------------------------------------------------------- */

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-x-8 gap-y-4 pt-8 first:pt-0 border-t border-border/50 first:border-0 md:grid-cols-3">
      <div className="md:col-span-1">
        <h2 className="text-sm font-semibold text-foreground tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
      <div className="md:col-span-2">
        <div className="rounded-fq-lg border border-border/70 bg-card p-5 shadow-xs">
          {children}
        </div>
      </div>
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
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
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

function CurrencyField({
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
 * Quiet store time indicator placed naturally below the timezone dropdown.
 */
function LiveStoreTime({ timezone }: { timezone: string }) {
  const { t } = useLang();
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
      <Clock className="size-3.5 text-muted-foreground/70" aria-hidden />
      <span>{t("Current store time:", "বর্তমান স্টোর সময়:")}</span>
      <span className="font-mono font-medium text-foreground tabular-nums">
        {formatDateTime(time, timezone)}
      </span>
    </div>
  );
}
