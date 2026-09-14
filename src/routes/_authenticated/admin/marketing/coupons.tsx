import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { saveCouponFn } from "@/lib/marketing.functions";
import { useLang } from "@/lib/i18n";
import {
  CopyLink,
  ErrorFrame,
  Field,
  Money,
  StatusPill,
  
  btnPrimary,
  inputClass,
} from "@/components/admin/MarketingUi";
import { useListState, compareBy } from "@/lib/use-list-state";
import {
  type Column,
  DataTable,
  EmptyState,
  SavedViews,
  Toolbar,
} from "@/components/console/kit";

export const Route = createFileRoute("/_authenticated/admin/marketing/coupons")({
  head: () => ({
    meta: [
      { title: "Coupons — Framique Marketing" },
      { name: "description", content: "Create and manage BDT coupons, promos and usage limits." },
      { property: "og:title", content: "Coupon management" },
      { property: "og:description", content: "Fixed, percent, BOGO and free-shipping promos in BDT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CouponsPage,
});

type CouponType = "fixed" | "percent" | "bogo" | "free_shipping";
type CouponStatus = "draft" | "active" | "paused" | "expired";

const emptyForm = {
  id: undefined as string | undefined,
  code: "",
  type: "fixed" as CouponType,
  amountTaka: "0",
  percentOff: "0",
  buyQuantity: "1",
  getQuantity: "1",
  minSubtotalTaka: "0",
  usageLimit: "",
  perCustomerLimit: "",
  startsAt: "",
  expiresAt: "",
  allowCombine: false,
  onePerOrder: true,
  status: "draft" as CouponStatus,
};

const statusTone: Record<CouponStatus, "warning" | "success" | "neutral" | "danger"> = {
  draft: "warning",
  active: "success",
  paused: "neutral",
  expired: "danger",
};
const statusLabel: Record<CouponStatus, { en: string; bn: string }> = {
  draft: { en: "Draft", bn: "খসড়া" },
  active: { en: "Active", bn: "সক্রিয়" },
  paused: { en: "Paused", bn: "স্থগিত" },
  expired: { en: "Expired", bn: "মেয়াদোত্তীর্ণ" },
};
const typeLabel: Record<CouponType, { en: string; bn: string }> = {
  fixed: { en: "Fixed discount", bn: "নির্দিষ্ট ছাড়" },
  percent: { en: "Percent discount", bn: "শতকরা ছাড়" },
  bogo: { en: "Buy X get Y free", bn: "কিনলে ফ্রি" },
  free_shipping: { en: "Free shipping", bn: "ফ্রি ডেলিভারি" },
};

function toMinor(v: string) {
  return Math.max(0, Math.round(Number(v || 0) * 100));
}

const VIEWS = {
  all: { en: "All", bn: "সব", match: () => true },
  active: { en: "Active", bn: "সক্রিয়", match: (c: any) => c.status === "active" },
  draft: { en: "Draft", bn: "খসড়া", match: (c: any) => c.status === "draft" },
  paused: { en: "Paused", bn: "স্থগিত", match: (c: any) => c.status === "paused" },
  expired: { en: "Expired", bn: "মেয়াদোত্তীর্ণ", match: (c: any) => c.status === "expired" },
} as const;
type ViewKey = keyof typeof VIEWS;

function CouponsPage() {
  const { t } = useLang();
  const { data: merchant } = useMerchant();
  const merchantId = merchant?.id;
  const qc = useQueryClient();
  const list = useListState({ defaultSort: "code", defaultDir: "asc", pageSize: 50 });
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);


  const { data: coupons } = useQuery({
    queryKey: ["coupons", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("coupons")
        .select("*")
        .eq("merchant_id", merchantId!)
        .order("created_at", { ascending: false });
      if (e) throw e;
      return data;
    },
  });

  const { data: redemptions } = useQuery({
    queryKey: ["coupon-redemptions", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("coupon_redemptions")
        .select("id, customer_key, amount_minor_int, created_at")
        .eq("coupon_id", openId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (e) throw e;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () =>
      saveCouponFn({
        data: {
          id: form.id,
          code: form.code.toUpperCase(),
          type: form.type,
          amountMinorInt: toMinor(form.amountTaka),
          percentOff: Number(form.percentOff || 0),
          buyQuantity: Number(form.buyQuantity || 0),
          getQuantity: Number(form.getQuantity || 0),
          minSubtotalMinorInt: toMinor(form.minSubtotalTaka),
          usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
          perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : null,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          allowCombine: form.allowCombine,
          onePerOrder: form.onePerOrder,
          status: form.status,
        },
      }),
    onSuccess: (res) => {
      setError(null);
      setSaved(res.code);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ["coupons", merchantId] });
    },
    onError: (e: Error) => {
      setSaved(null);
      setError(e.message);
    },
  });

  const rows = (coupons ?? []) as any[];
  const view = (list.view in VIEWS ? list.view : "all") as ViewKey;
  const q = list.q.trim().toLowerCase();
  const filtered = rows.filter(
    (c) => VIEWS[view].match(c) && (!q || String(c.code).toLowerCase().includes(q)),
  );
  const sorted = compareBy(
    filtered,
    (c) =>
      list.sort === "usage"
        ? Number(c.redeemed_count)
        : list.sort === "minimum"
          ? Number(c.min_subtotal_minor_int)
          : list.sort === "status"
            ? c.status
            : c.code,
    list.dir,
  );

  const columns: Column<any>[] = [
    {
      key: "code",
      header: t("Code", "কোড"),
      sortable: true,
      cell: (c) => <span className="fq-num font-medium text-foreground">{c.code}</span>,
    },
    {
      key: "type",
      header: t("Type", "ধরন"),
      cell: (c) => t(typeLabel[c.type as CouponType].en, typeLabel[c.type as CouponType].bn),
    },
    {
      key: "value",
      header: t("Value", "মান"),
      numeric: true,
      cell: (c) =>
        c.type === "percent" ? (
          <span>{c.percent_off}%</span>
        ) : c.type === "bogo" ? (
          <span>
            {c.buy_quantity}+{c.get_quantity}
          </span>
        ) : c.type === "free_shipping" ? (
          "—"
        ) : (
          <Money minor={Number(c.amount_minor_int)} />
        ),
    },
    {
      key: "minimum",
      header: t("Minimum", "সর্বনিম্ন"),
      numeric: true,
      sortable: true,
      cell: (c) => <Money minor={Number(c.min_subtotal_minor_int)} />,
    },
    {
      key: "usage",
      header: t("Usage", "ব্যবহার"),
      numeric: true,
      sortable: true,
      cell: (c) => `${c.redeemed_count} / ${c.usage_limit ?? "∞"}`,
    },
    {
      key: "status",
      header: t("Status", "অবস্থা"),
      sortable: true,
      cell: (c) => (
        <StatusPill
          label={t(statusLabel[c.status as CouponStatus].en, statusLabel[c.status as CouponStatus].bn)}
          tone={statusTone[c.status as CouponStatus]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{t("Coupons & promos", "কুপন ও প্রোমো")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "All discounts are verified on the server — discounts sent by the client cart are never accepted.",
            "সব ছাড় সার্ভারে যাচাই হয় — কার্টে ক্লায়েন্টের পাঠানো ছাড় গ্রহণ করা হয় না।",
          )}
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <Toolbar
            end={
              <input
                type="search"
                value={list.q}
                onChange={(e) => list.setQ(e.target.value)}
                placeholder={t("Search code", "কোড খুঁজুন")}
                aria-label={t("Search coupons", "কুপন খুঁজুন")}
                className={`${inputClass} h-9 w-48 py-0`}
              />
            }
          >
            <SavedViews
              activeId={view}
              onSelect={list.setView}
              views={(Object.keys(VIEWS) as ViewKey[]).map((key) => ({
                id: key,
                label: t(VIEWS[key].en, VIEWS[key].bn),
                count: rows.filter(VIEWS[key].match).length,
              }))}
            />
          </Toolbar>

          <DataTable
            rows={sorted}
            columns={columns}
            rowKey={(c: any) => c.id}
            sort={list.sort}
            dir={list.dir}
            onSort={list.toggleSort}
            onRowClick={(c: any) => setOpenId(openId === c.id ? null : c.id)}
            rowActions={(c: any) => (
              <button
                type="button"
                className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
                onClick={() => setOpenId(openId === c.id ? null : c.id)}
                aria-expanded={openId === c.id}
              >
                {t("Details", "বিস্তারিত")}
              </button>
            )}
            empty={
              <EmptyState
                title={t("No coupons yet.", "এখনও কোনো কুপন নেই।")}
                description={t("Create one with the form beside.", "পাশের ফর্ম দিয়ে তৈরি করুন।")}
              />
            }
          />

          {openId && (
            <div className="fq-card p-3">
              <h2 className="mb-2 text-sm font-semibold">{t("Recent usage", "সাম্প্রতিক ব্যবহার")}</h2>
              <ul className="space-y-1 text-sm">
                {(redemptions ?? []).map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span className="fq-sub">{r.customer_key}</span>
                    <Money minor={Number(r.amount_minor_int)} />
                  </li>
                ))}
                {(redemptions ?? []).length === 0 && (
                  <li className="fq-sub">{t("No usage yet.", "কোনো ব্যবহার নেই।")}</li>
                )}
              </ul>
            </div>
          )}
        </div>


        <form
          className="space-y-3 rounded-fq-md border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="font-bangla-display text-base font-semibold">{t("New coupon", "নতুন কুপন")}</h2>
          <Field label={t("Code", "কোড")}>
            <input
              className={inputClass}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              required
            />
          </Field>
          <Field label={t("Type", "ধরন")}>
            <select
              className={inputClass}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as CouponType })}
            >
              {(Object.keys(typeLabel) as CouponType[]).map((ty) => (
                <option key={ty} value={ty}>
                  {t(typeLabel[ty].en, typeLabel[ty].bn)}
                </option>
              ))}
            </select>
          </Field>
          {form.type === "fixed" && (
            <Field label={t("Discount (৳)", "ছাড় (৳)")}>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={form.amountTaka}
                onChange={(e) => setForm({ ...form, amountTaka: e.target.value })}
              />
            </Field>
          )}
          {form.type === "percent" && (
            <Field label={t("Percent (%)", "শতকরা (%)")}>
              <input
                type="number"
                min="1"
                max="100"
                className={inputClass}
                value={form.percentOff}
                onChange={(e) => setForm({ ...form, percentOff: e.target.value })}
              />
            </Field>
          )}
          {form.type === "bogo" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("Buy", "কিনুন")}>
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={form.buyQuantity}
                  onChange={(e) => setForm({ ...form, buyQuantity: e.target.value })}
                />
              </Field>
              <Field label={t("Get free", "ফ্রি পান")}>
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={form.getQuantity}
                  onChange={(e) => setForm({ ...form, getQuantity: e.target.value })}
                />
              </Field>
            </div>
          )}
          <Field label={t("Minimum cart (৳)", "সর্বনিম্ন কার্ট (৳)")}>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={form.minSubtotalTaka}
              onChange={(e) => setForm({ ...form, minSubtotalTaka: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Total limit", "মোট সীমা")}>
              <input
                type="number"
                min="1"
                className={inputClass}
                value={form.usageLimit}
                onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              />
            </Field>
            <Field label={t("Per customer", "প্রতি গ্রাহক")}>
              <input
                type="number"
                min="1"
                className={inputClass}
                value={form.perCustomerLimit}
                onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Starts", "শুরু")}>
              <input
                type="datetime-local"
                className={inputClass}
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </Field>
            <Field label={t("Ends", "শেষ")}>
              <input
                type="datetime-local"
                className={inputClass}
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allowCombine}
              onChange={(e) => setForm({ ...form, allowCombine: e.target.checked })}
            />
            {t("Usable with other coupons", "অন্য কুপনের সাথে ব্যবহারযোগ্য")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.onePerOrder}
              onChange={(e) => setForm({ ...form, onePerOrder: e.target.checked })}
            />
            {t("Once per order", "প্রতি অর্ডারে একবার")}
          </label>
          <Field label={t("Status", "অবস্থা")}>
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CouponStatus })}
            >
              {(Object.keys(statusLabel) as CouponStatus[]).map((s) => (
                <option key={s} value={s}>
                  {t(statusLabel[s].en, statusLabel[s].bn)}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className={btnPrimary} disabled={save.isPending}>
            {t("Save", "সংরক্ষণ করুন")}
          </button>
          <ErrorFrame message={error} />
          {saved && (
            <div className="flex items-center justify-between gap-2 rounded-fq-md border border-success bg-success-soft px-3 py-2 text-sm text-success-foreground">
              <span>{t(`Code ${saved} saved`, `কোড ${saved} সংরক্ষিত`)}</span>
              <CopyLink value={saved} />
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
