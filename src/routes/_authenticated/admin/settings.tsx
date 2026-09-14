import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { ImpersonationConsent } from "@/components/admin/ImpersonationConsent";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Store settings — Framique Admin" },
      { name: "description", content: "Configure your storefront name, payment methods and delivery charges." },
      { property: "og:title", content: "Store settings" },
      { property: "og:description", content: "Control COD, mobile payments and shipping fees." },
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
  });

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
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("merchant_settings").upsert({
        merchant_id: merchant!.id,
        tagline: form.tagline || null,
        cod_enabled: form.cod_enabled,
        mfs_enabled: form.mfs_enabled,
        cod_surcharge_minor_int: Math.round(form.cod_surcharge_taka * 100),
        shipping_flat_minor_int: Math.round(form.shipping_flat_taka * 100),
        free_shipping_threshold_minor_int:
          form.free_shipping_taka === null ? null : Math.round(form.free_shipping_taka * 100),
        prices_include_vat: form.prices_include_vat,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["merchant-settings"] }),
  });

  return (
    <section className="max-w-xl">
      <h1 className="font-bangla-display text-xl font-semibold">{t("Settings", "সেটিংস")}</h1>
      {merchant && (
        <p className="mt-1 text-sm text-muted-foreground">
          Your storefront:{" "}
          <a className="text-primary underline" href={`/store/${merchant.slug}`}>
            /store/{merchant.slug}
          </a>
        </p>
      )}

      {merchant ? (
        <div className="mt-6">
          <ImpersonationConsent merchantId={merchant.id} />
        </div>
      ) : null}

      <form
        className="mt-6 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tagline</span>
          <input
            value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            className="h-12 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
          />
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.cod_enabled}
            onChange={(e) => setForm((f) => ({ ...f, cod_enabled: e.target.checked }))}
          />
          {t("Enable cash on delivery", "ক্যাশ অন ডেলিভারি চালু")}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.mfs_enabled}
            onChange={(e) => setForm((f) => ({ ...f, mfs_enabled: e.target.checked }))}
          />
          {t("Enable bKash / Nagad", "bKash / Nagad চালু")}
        </label>
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.prices_include_vat}
            onChange={(e) => setForm((f) => ({ ...f, prices_include_vat: e.target.checked }))}
          />
          <span>
            {t("Listed prices already include VAT", "তালিকাভুক্ত দামে ভ্যাট অন্তর্ভুক্ত")}
            <span className="block text-xs text-muted-foreground">
              {t(
                "Checkout extracts VAT from the price shown instead of adding it on top, so the shopper pays exactly the listed amount.",
                "চেকআউটে দামের উপরে ভ্যাট যোগ না করে দামের ভেতর থেকে হিসাব হবে।",
              )}
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="COD surcharge (৳)"
            value={form.cod_surcharge_taka}
            onChange={(v) => setForm((f) => ({ ...f, cod_surcharge_taka: v }))}
          />
          <NumberField
            label="Flat delivery (৳)"
            value={form.shipping_flat_taka}
            onChange={(v) => setForm((f) => ({ ...f, shipping_flat_taka: v }))}
          />
          <NumberField
            label="Free delivery above (৳, empty = never)"
            value={form.free_shipping_taka ?? 0}
            onChange={(v) => setForm((f) => ({ ...f, free_shipping_taka: v || null }))}
          />
        </div>

        <button
          type="submit"
          disabled={!merchant || save.isPending}
          className="min-h-12 w-fit rounded-fq-md bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
        <p aria-live="polite" className="text-sm text-success-foreground">
          {save.isSuccess ? "Saved" : ""}
        </p>
      </form>
    </section>
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
