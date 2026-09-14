import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import {
  StatusPill,
  Money,
  Field,
  ErrorFrame,
  inputClass,
  btnPrimary,
  btnGhost,
} from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { bundlesLoadFn, bundleSaveFn, bundleDeleteFn } from "@/lib/commerce.functions";

export const Route = createFileRoute("/_authenticated/admin/bundles")({
  head: () => ({
    meta: [
      { title: "Product bundles — Framique admin" },
      {
        name: "description",
        content:
          "Sell sets at a bundle price: pick the component variants, choose a fixed price or a percentage off, and let the server derive the total.",
      },
      { property: "og:title", content: "Product bundles — Framique admin" },
      {
        property: "og:description",
        content: "Bundle pricing derived server-side from live component prices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BundlesPage,
});

const KEY = ["commerce", "bundles"] as const;

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function BundlesPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const { data: merchant } = useMerchant();
  const load = useServerFn(bundlesLoadFn);
  const save = useServerFn(bundleSaveFn);
  const remove = useServerFn(bundleDeleteFn);
  const [mode, setMode] = useState<"fixed" | "percent">("percent");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: KEY,
    queryFn: () => load(),
  });

  const { data: variants } = useQuery({
    queryKey: ["commerce", "bundle-variants", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("product_variants")
        .select("id, name, price_amount_minor_int, products(id, title)")
        .eq("merchant_id", merchant!.id)
        .limit(300);
      if (err) throw err;
      return rows ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["commerce", "bundle-products", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("products")
        .select("id, title")
        .eq("merchant_id", merchant!.id)
        .order("title")
        .limit(300);
      if (err) throw err;
      return rows ?? [];
    },
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: KEY });

  const saveMutation = useMutation({
    mutationFn: (input: {
      productId: string;
      pricingMode: "fixed" | "percent";
      fixedPriceMinorInt?: number | null;
      percentOff?: number;
      components: { variantId: string; quantity: number }[];
    }) => save({ data: input }),
    onSuccess: () => {
      setError(null);
      setPicked([]);
      invalidate();
    },
    onError: (e) => setError(message(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (bundleId: string) => remove({ data: { bundleId } }),
    onSuccess: invalidate,
    onError: (e) => setError(message(e)),
  });

  const componentTotal = (variants ?? [])
    .filter((v) => picked.includes(v.id))
    .reduce((s, v) => s + Number(v.price_amount_minor_int), 0);

  const bundles = data?.bundles ?? [];

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Product bundles", "প্রোডাক্ট বান্ডল")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "The browser never sends a bundle price — the server recomputes it from the live component prices at checkout.",
            "বান্ডলের দাম ব্রাউজার পাঠায় না — চেকআউটে সার্ভারই হিসাব করে।",
          )}
        </p>
      </header>

      <ErrorFrame message={error ?? (isError ? message(loadError) : null)} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ul className="space-y-3">
          {bundles.map((b) => {
            const product = b.products as { title?: string } | null;
            const items = (b.bundle_items ?? []) as { id: string }[];
            return (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-fq-lg border border-border bg-card p-4"
              >
                <div>
                  <p className="font-medium">{product?.title ?? b.product_id.slice(0, 8)}</p>
                  <p className="text-sm text-muted-foreground">
                    {items.length} {t("components", "উপাদান")} ·{" "}
                    {b.pricing_mode === "fixed" ? (
                      <Money minor={Number(b.fixed_price_minor_int ?? 0)} />
                    ) : (
                      <span className="tabular-nums">{b.percent_off}% {t("off", "ছাড়")}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill
                    label={b.active ? t("Active", "সক্রিয়") : t("Paused", "বন্ধ")}
                    tone={b.active ? "success" : "neutral"}
                  />
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(b.id)}
                  >
                    {t("Delete", "মুছুন")}
                  </button>
                </div>
              </li>
            );
          })}
          {!isLoading && bundles.length === 0 && (
            <li className="rounded-fq-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              {t("No bundles yet.", "এখনো কোনো বান্ডল নেই।")}
            </li>
          )}
        </ul>

        <form
          className="space-y-3 rounded-fq-lg border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            saveMutation.mutate({
              productId: String(form.get("product") ?? ""),
              pricingMode: mode,
              fixedPriceMinorInt:
                mode === "fixed" ? Math.round(Number(form.get("price") ?? 0) * 100) : null,
              percentOff: mode === "percent" ? Number(form.get("percent") ?? 0) : 0,
              components: picked.map((variantId) => ({ variantId, quantity: 1 })),
            });
          }}
        >
          <h2 className="text-sm font-semibold">{t("Create a bundle", "বান্ডল তৈরি করুন")}</h2>
          <Field label={t("Bundle product", "বান্ডল পণ্য")}>
            <select name="product" required className={inputClass}>
              {(products ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("Components (pick at least two)", "উপাদান (কমপক্ষে দুটি)")}
            </legend>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-fq-md border border-border p-2">
              {(variants ?? []).map((v) => {
                const product = v.products as { title?: string } | null;
                return (
                  <label key={v.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={picked.includes(v.id)}
                      onChange={(e) =>
                        setPicked((prev) =>
                          e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id),
                        )
                      }
                    />
                    <span className="flex-1">
                      {product?.title} — {v.name}
                    </span>
                    <Money minor={Number(v.price_amount_minor_int)} className="text-xs" />
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Component total", "উপাদানের মোট")}: <Money minor={componentTotal} />
            </p>
          </fieldset>

          <Field label={t("Pricing", "মূল্য নির্ধারণ")}>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              className={inputClass}
            >
              <option value="percent">{t("Percent off components", "উপাদানের উপর শতকরা ছাড়")}</option>
              <option value="fixed">{t("Fixed bundle price", "নির্দিষ্ট বান্ডল মূল্য")}</option>
            </select>
          </Field>
          {mode === "percent" ? (
            <Field label={t("Percent off", "শতকরা ছাড়")}>
              <input
                name="percent"
                type="number"
                min={1}
                max={100}
                defaultValue={10}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
          ) : (
            <Field label={t("Bundle price (BDT)", "বান্ডল মূল্য (টাকা)")}>
              <input
                name="price"
                type="number"
                min={0}
                step="0.01"
                className={`${inputClass} tabular-nums`}
              />
            </Field>
          )}
          <button
            type="submit"
            className={btnPrimary}
            disabled={picked.length < 2 || saveMutation.isPending}
          >
            {t("Save bundle", "বান্ডল সেভ")}
          </button>
        </form>
      </div>
    </section>
  );
}
