import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Field,
  ErrorFrame,
  CopyLink,
  inputClass,
  btnPrimary,
} from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { discountBatchesFn, discountGenerateFn } from "@/lib/commerce.functions";

export const Route = createFileRoute("/_authenticated/admin/marketing/codes")({
  head: () => ({
    meta: [
      { title: "Discount code batches — Framique admin" },
      {
        name: "description",
        content:
          "Generate up to 500 unique single-use discount codes at once, with usage caps and expiry, then track redemption per batch.",
      },
      { property: "og:title", content: "Discount code batches — Framique admin" },
      {
        property: "og:description",
        content: "Bulk unique codes that reuse the same server-side coupon validation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CodesPage,
});

const KEY = ["commerce", "code-batches"] as const;

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function CodesPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(discountBatchesFn);
  const generate = useServerFn(discountGenerateFn);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [type, setType] = useState<"fixed" | "percent" | "free_shipping">("percent");

  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: KEY,
    queryFn: () => load(),
  });

  type GenerateArgs = {
    prefix: string;
    count: number;
    type: "fixed" | "percent" | "free_shipping";
    amountMinorInt?: number;
    percentOff?: number;
    minSubtotalMinorInt?: number;
    maxDiscountMinorInt?: number | null;
    usageLimit: number | null;
    perCustomerLimit: number | null;
    expiresAt?: string | null;
    batchLabel: string;
  };

  const gen = useMutation({
    mutationFn: (input: GenerateArgs) => generate({ data: input }),

    onSuccess: (r) => {
      setError(null);
      setPreview(r.codes.slice(0, 12));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => setError(message(e)),
  });

  const batches = data?.batches ?? [];

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Discount code batches", "ডিসকাউন্ট কোড ব্যাচ")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Generated codes are ordinary coupons, so every discount rule and usage cap is enforced server-side.",
            "তৈরি কোডগুলো সাধারণ কুপন, তাই সব নিয়ম সার্ভারেই যাচাই হয়।",
          )}
        </p>
      </header>

      <ErrorFrame message={error ?? (isError ? message(loadError) : null)} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Discount code batches</caption>
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="p-3">{t("Batch", "ব্যাচ")}</th>
                <th scope="col" className="p-3">{t("Codes", "কোড")}</th>
                <th scope="col" className="p-3">{t("Active", "সক্রিয়")}</th>
                <th scope="col" className="p-3">{t("Redeemed", "ব্যবহৃত")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {batches.map((b) => (
                <tr key={b.label}>
                  <td className="p-3 font-medium">{b.label}</td>
                  <td className="p-3 tabular-nums">{b.codes}</td>
                  <td className="p-3 tabular-nums">{b.active}</td>
                  <td className="p-3 tabular-nums">{b.redeemed}</td>
                </tr>
              ))}
              {!isLoading && batches.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-sm text-muted-foreground">
                    {t("No batches generated yet.", "এখনো কোনো ব্যাচ তৈরি হয়নি।")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {preview.length > 0 && (
            <div className="border-t border-border p-4">
              <h2 className="text-sm font-semibold">{t("Latest codes", "সর্বশেষ কোড")}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {preview.map((code) => (
                  <li
                    key={code}
                    className="flex items-center gap-1 inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs tabular-nums"
                  >
                    {code}
                    <CopyLink value={code} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <form
          className="space-y-3 rounded-fq-lg border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const usage = Number(form.get("usageLimit") ?? 1);
            gen.mutate({
              prefix: String(form.get("prefix") ?? ""),
              count: Math.max(1, Number(form.get("count") ?? 10)),
              type,
              amountMinorInt: Math.round(Number(form.get("amount") ?? 0) * 100),
              percentOff: Number(form.get("percent") ?? 0),
              minSubtotalMinorInt: Math.round(Number(form.get("minSubtotal") ?? 0) * 100),
              maxDiscountMinorInt: null,
              usageLimit: usage > 0 ? usage : null,
              perCustomerLimit: 1,
              expiresAt: String(form.get("expires") ?? "") || null,
              batchLabel: String(form.get("label") ?? ""),
            });
          }}
        >
          <h2 className="text-sm font-semibold">{t("Generate a batch", "ব্যাচ তৈরি করুন")}</h2>
          <Field label={t("Batch name", "ব্যাচের নাম")}>
            <input name="label" required maxLength={80} className={inputClass} />
          </Field>
          <Field label={t("Code prefix", "কোড প্রিফিক্স")} hint="EID, WINTER…">
            <input name="prefix" maxLength={12} className={inputClass} />
          </Field>
          <Field label={t("How many codes", "কতগুলো কোড")}>
            <input
              name="count"
              type="number"
              min={1}
              max={500}
              defaultValue={25}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field label={t("Discount type", "ডিসকাউন্টের ধরন")}>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className={inputClass}
            >
              <option value="percent">{t("Percent off", "শতকরা ছাড়")}</option>
              <option value="fixed">{t("Fixed taka off", "নির্দিষ্ট টাকা ছাড়")}</option>
              <option value="free_shipping">{t("Free shipping", "ফ্রি ডেলিভারি")}</option>
            </select>
          </Field>
          {type === "percent" && (
            <Field label={t("Percent", "শতকরা")}>
              <input
                name="percent"
                type="number"
                min={1}
                max={100}
                defaultValue={10}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
          )}
          {type === "fixed" && (
            <Field label={t("Amount (BDT)", "পরিমাণ (টাকা)")}>
              <input
                name="amount"
                type="number"
                min={1}
                step="0.01"
                className={`${inputClass} tabular-nums`}
              />
            </Field>
          )}
          <Field label={t("Minimum order (BDT)", "সর্বনিম্ন অর্ডার (টাকা)")}>
            <input
              name="minSubtotal"
              type="number"
              min={0}
              step="0.01"
              defaultValue={0}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field label={t("Uses per code", "প্রতি কোডে ব্যবহার")}>
            <input
              name="usageLimit"
              type="number"
              min={1}
              defaultValue={1}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field label={t("Expires on", "মেয়াদ শেষ")}>
            <input name="expires" type="date" className={inputClass} />
          </Field>
          <button type="submit" className={btnPrimary} disabled={gen.isPending}>
            {t("Generate codes", "কোড তৈরি")}
          </button>
        </form>
      </div>
    </section>
  );
}
