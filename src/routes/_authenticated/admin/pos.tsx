import { one } from "@/lib/embed";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { fmtMinor } from "@/lib/money";
import { newClientId, usePosQueue } from "@/hooks/use-pos-queue";
import { useLang } from "@/lib/i18n";
import {
  capturePosOrderFn,
  closeShiftFn,
  createShipmentFn,
  lookupBarcodeFn,
  openShiftFn,
  posBootstrap,
  refundPosOrderFn,
  shiftReportFn,
} from "@/lib/pos.functions";


export const Route = createFileRoute("/_authenticated/admin/pos")({
  head: () => ({
    meta: [
      { title: "POS terminal — Framique Admin" },
      {
        name: "description",
        content: "Offline-first point of sale for in-store selling, drawer shifts and courier handoff.",
      },
      { property: "og:title", content: "POS terminal" },
      {
        property: "og:description",
        content: "Sell in-store even without network; queued sales sync automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});

type Line = { variantId: string; quantity: number; title: string; unit: number };

type TenderRow = { method: "cash" | "card" | "cod"; amount: string; received: string };

type PosOrderRow = {
  id: string;
  client_id: string;
  status: string;
  total_minor_int: number;
  captured_at: string;
  items?: unknown;
  pos_payments?: { method: string; amount_minor_int: number }[] | null;
  pos_refunds?: { amount_minor_int: number }[] | null;
};


const inputClass =
  "min-h-11 w-full rounded-fq-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function PosPage() {
  const { t } = useLang();
  const { data: merchant } = useMerchant();
  const merchantId = merchant?.id;
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discountTaka, setDiscountTaka] = useState("0");
  const [tenders, setTenders] = useState<TenderRow[]>([{ method: "cash", amount: "", received: "" }]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [drawerCount, setDrawerCount] = useState("0");
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [carrierCode, setCarrierCode] = useState("");
  const [refundFor, setRefundFor] = useState<PosOrderRow | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [receiptFor, setReceiptFor] = useState<PosOrderRow | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["pos-bootstrap"] });
  const { queue, blocked, online, syncing, enqueue, sync, drop, maxAttempts } = usePosQueue(refresh);


  const boot = useQuery({ queryKey: ["pos-bootstrap"], queryFn: () => posBootstrap() });
  const session = boot.data?.session ?? null;
  const carriers = boot.data?.carriers ?? [];

  const variants = useQuery({
    queryKey: ["pos-variants", merchantId],
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, name, sku, price_amount_minor_int, stock_quantity, products(title)")
        .eq("merchant_id", merchantId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const q = term.trim().toLowerCase();
  const picker = (variants.data ?? []).filter((v) => {
    const title = one<{ title: string }>(v.products)?.title ?? "";
    return (
      !q ||
      title.toLowerCase().includes(q) ||
      v.name.toLowerCase().includes(q) ||
      (v.sku ?? "").toLowerCase().includes(q)
    );
  });

  const subtotal = useMemo(
    () => lines.reduce((a, l) => a + l.unit * l.quantity, 0),
    [lines],
  );
  const discount = Math.min(Math.max(0, Math.round(Number(discountTaka || 0) * 100)), subtotal);
  const total = subtotal - discount;

  // A single tender always takes the whole sale; only a split asks the
  // cashier for amounts, and the sale cannot be taken until they balance.
  const split = tenders.length > 1;
  const tenderMinor = tenders.map((t, i) =>
    split ? Math.max(0, Math.round(Number(t.amount || 0) * 100)) : i === 0 ? total : 0,
  );
  const assigned = tenderMinor.reduce((a, b) => a + b, 0);
  const remaining = total - assigned;
  const cashIndex = tenders.findIndex((t) => t.method === "cash");
  const cashReceived = cashIndex >= 0 ? Math.round(Number(tenders[cashIndex]?.received || 0) * 100) : 0;
  const changeDue =
    cashIndex >= 0 && cashReceived > 0
      ? Math.max(0, cashReceived - (tenderMinor[cashIndex] ?? 0))
      : 0;
  const balanced = lines.length > 0 && remaining === 0;
  const codOnly = tenders.every((t) => t.method === "cod");

  function addLine(v: {
    id: string;
    name: string;
    price_amount_minor_int: number | string;
    products?: { title?: string | null } | { title?: string | null }[] | null;
  }) {
    setLines((prev) => {
      const found = prev.find((l) => l.variantId === v.id);
      if (found) {
        return prev.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          variantId: v.id,
          quantity: 1,
          title: `${one(v.products)?.title ?? ""} · ${v.name}`,
          unit: Number(v.price_amount_minor_int),
        },
      ];
    });
  }

  /** Barcode gun: Enter in the search box resolves an exact SKU and adds it. */
  const scan = useMutation({
    mutationFn: (code: string) => lookupBarcodeFn({ data: { code } }),
    onSuccess: (v) => {
      if (!v) {
        toast.error(t("No product with that code", "এই কোডে কোনো পণ্য নেই"));
        return;
      }
      addLine(v);
      setTerm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openShift = useMutation({
    mutationFn: () =>
      openShiftFn({
        data: { startingCashMinorInt: Math.round(Number(openingCash || 0) * 100) },
      }),
    onSuccess: () => {
      toast.success("Shift opened");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeShift = useMutation({
    mutationFn: () =>
      closeShiftFn({
        data: {
          sessionId: session!.id,
          actualCashMinorInt: Math.round(Number(drawerCount || 0) * 100),
        },
      }),
    onSuccess: (res) => {
      const variance = Number(res.session.variance_minor_int ?? 0);
      if (variance === 0) toast.success("Shift closed, drawer matched");
      else toast.warning(`Drawer variance ${fmtMinor(variance)}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const zReport = useMutation({
    mutationFn: () => shiftReportFn({ data: { sessionId: session!.id } }),
    onSuccess: (res) => setReport(res as Record<string, unknown>),
    onError: (e: Error) => toast.error(e.message),
  });

  const checkout = useMutation({
    mutationFn: async () => {
      const clientId = newClientId();
      const payload = {
        clientId,
        sessionId: session?.id ?? null,
        tenders: tenders.map((t, i) => ({
          method: t.method,
          amountMinorInt: tenderMinor[i] ?? 0,
          tenderedMinorInt: t.method === "cash" ? Math.round(Number(t.received || 0) * 100) : 0,
        })),
        discountMinorInt: discount,
        customerName: name || null,
        customerPhone: phone || null,
        addressLine: address || null,
        city: city || null,
        capturedAt: new Date().toISOString(),
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      };
      if (!navigator.onLine) {
        enqueue({ ...payload, totalMinorInt: total });
        return { queued: true, id: null as string | null };
      }
      const res = await capturePosOrderFn({ data: { ...payload, origin: "online" } });
      return { queued: false, id: String(res.order["id"] ?? "") || null, duplicate: res.duplicate };
    },
    onSuccess: (res) => {
      if (res.queued) toast.success(t("Saved offline, will sync later", "অফলাইনে সংরক্ষিত"));
      else if (res.duplicate) toast.info(t("Already recorded — no second charge", "আগেই রেকর্ড হয়েছে"));
      else toast.success(t("Sale complete", "বিক্রয় সম্পন্ন"));
      setLines([]);
      setDiscountTaka("0");
      setTenders([{ method: "cash", amount: "", received: "" }]);
      setLastOrderId(res.id);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refund = useMutation({
    mutationFn: (input: { amountMinorInt: number; method: TenderRow["method"]; reason: string; restock: boolean }) =>
      refundPosOrderFn({
        data: {
          posOrderId: refundFor!.id,
          idempotencyKey: `refund-${refundFor!.id}-${input.amountMinorInt}-${input.restock}`,
          amountMinorInt: input.amountMinorInt,
          method: input.method,
          reason: input.reason || null,
          restock: input.restock,
          lines: [],
        },
      }),
    onSuccess: (res) => {
      toast.success(
        res["replayed"]
          ? t("Refund already recorded", "রিফান্ড আগেই রেকর্ড হয়েছে")
          : t("Refund recorded", "রিফান্ড রেকর্ড হয়েছে"),
      );
      setRefundFor(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: () =>
      createShipmentFn({
        data: {
          posOrderId: lastOrderId!,
          carrierCode,
          weightGrams: 500,
          isCod: codOnly,
          codAmountMinorInt: codOnly ? total : 0,
          addressLine: address || null,
          city: city || null,
        },
      }),
    onSuccess: (res) => {
      if (res.adapterDown) toast.warning("Courier adapter down — pending pickup");
      else toast.success(`AWB ${res.shipment.awb}`);
      setLastOrderId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bangla-display text-xl font-semibold">{t("POS terminal", "পিওএস টার্মিনাল")}</h1>
          <p className="text-sm text-muted-foreground">In-store selling, offline-first.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`rounded-fq-md px-2.5 py-1 font-medium ${
              online ? "bg-mint-100 text-mint-900" : "bg-amber-100 text-amber-900"
            }`}
          >
            {online ? t("Online", "অনলাইন / Online") : t("Offline mode", "অফলাইন মোড / Offline mode")}
          </span>
          <span className="rounded-fq-md border border-border px-2.5 py-1 money">
            {queue.length} pending syncs
          </span>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={syncing || queue.length === 0}
            className="min-h-11 rounded-fq-md border border-border px-3 font-medium disabled:opacity-50"
          >
            {syncing ? t("Syncing…", "সিঙ্ক হচ্ছে…") : "Sync now"}
          </button>
        </div>
      </header>

      <ShiftBar
        session={session}
        totals={boot.data?.totals ?? null}
        openingCash={openingCash}
        setOpeningCash={setOpeningCash}
        drawerCount={drawerCount}
        setDrawerCount={setDrawerCount}
        onOpen={() => openShift.mutate()}
        onClose={() => closeShift.mutate()}
        onReport={() => zReport.mutate()}
        busy={openShift.isPending || closeShift.isPending || zReport.isPending}
      />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-fq-lg border border-border bg-card p-3">
          <label htmlFor="pos-search" className="block text-xs font-medium text-muted-foreground">
            {t("Scan barcode, or search name / SKU", "বারকোড স্ক্যান বা নাম / SKU খুঁজুন")}
          </label>
          <input
            id="pos-search"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && term.trim().length >= 2) {
                e.preventDefault();
                scan.mutate(term.trim());
              }
            }}
            className={`mt-1 ${inputClass}`}
          />

          <ul className="mt-3 grid max-h-96 gap-2 overflow-auto sm:grid-cols-2">
            {picker.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => addLine(v)}
                  className="flex min-h-14 w-full flex-col items-start rounded-fq-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="text-sm font-medium">{one<{ title: string }>(v.products)?.title ?? v.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {v.name} · {t("Stock", "স্টক")} {v.stock_quantity}
                  </span>
                  <span className="money text-sm">{fmtMinor(Number(v.price_amount_minor_int))}</span>
                </button>
              </li>
            ))}
            {picker.length === 0 && (
              <li className="text-sm text-muted-foreground">{t("No products", "কোনো পণ্য নেই")}</li>
            )}
          </ul>
        </div>

        <div className="rounded-fq-lg border border-border bg-card p-3">
          <h2 className="font-bangla-display text-base font-semibold">{t("Cart", "কার্ট")}</h2>
          <ul className="mt-2 space-y-2">
            {lines.map((l) => (
              <li key={l.variantId} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{l.title}</span>
                <input
                  type="number"
                  min={1}
                  aria-label={`${t("Quantity", "পরিমাণ")} ${l.title}`}
                  value={l.quantity}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x) =>
                        x.variantId === l.variantId
                          ? { ...x, quantity: Math.max(1, Number(e.target.value)) }
                          : x,
                      ),
                    )
                  }
                  className="money min-h-11 w-16 rounded-fq-md border border-border bg-background px-2 text-right"
                />
                <span className="money w-24 text-right">{fmtMinor(l.unit * l.quantity)}</span>
                <button
                  type="button"
                  aria-label={t("Remove", "সরান")}
                  onClick={() =>
                    setLines((prev) => prev.filter((x) => x.variantId !== l.variantId))
                  }
                  className="min-h-11 px-2 text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </li>
            ))}
            {lines.length === 0 && <li className="text-sm text-muted-foreground">{t("Cart is empty", "কার্ট খালি")}</li>}
          </ul>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              aria-label={t("Customer name", "ক্রেতার নাম")}
              placeholder={t("Customer name", "ক্রেতার নাম")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            <input
              aria-label={t("Phone", "ফোন")}
              placeholder={t("Phone", "ফোন")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
            <input
              aria-label={t("Address", "ঠিকানা")}
              placeholder={t("Address (for courier)", "ঠিকানা (কুরিয়ার হলে)")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
            <input
              aria-label={t("City", "শহর")}
              placeholder={t("City", "শহর")}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass}
            />
            <label className="text-xs text-muted-foreground">
              {t("Cash discount (৳)", "ক্যাশ ডিসকাউন্ট (৳)")}
              <input
                type="number"
                min={0}
                value={discountTaka}
                onChange={(e) => setDiscountTaka(e.target.value)}
                className={`money mt-1 ${inputClass}`}
              />
            </label>
          </div>

          <fieldset className="mt-3 rounded-fq-md border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              {t("Payment", "পেমেন্ট")}
            </legend>
            <ul className="space-y-2">
              {tenders.map((tender, i) => (
                <li key={i} className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-muted-foreground">
                    {t("Method", "পদ্ধতি")}
                    <select
                      value={tender.method}
                      onChange={(e) =>
                        setTenders((prev) =>
                          prev.map((x, xi) =>
                            xi === i ? { ...x, method: e.target.value as TenderRow["method"] } : x,
                          ),
                        )
                      }
                      className={`mt-1 ${inputClass}`}
                    >
                      <option value="cash">{t("Cash", "ক্যাশ / Cash")}</option>
                      <option value="card">{t("Card (MFS mock)", "কার্ড (MFS mock)")}</option>
                      <option value="cod">{t("Cash on delivery", "ক্যাশ অন ডেলিভারি")}</option>
                    </select>
                  </label>
                  {split && (
                    <label className="text-xs text-muted-foreground">
                      {t("Amount (৳)", "পরিমাণ (৳)")}
                      <input
                        type="number"
                        min={0}
                        value={tender.amount}
                        onChange={(e) =>
                          setTenders((prev) =>
                            prev.map((x, xi) => (xi === i ? { ...x, amount: e.target.value } : x)),
                          )
                        }
                        className={`money mt-1 w-32 ${inputClass}`}
                      />
                    </label>
                  )}
                  {tender.method === "cash" && (
                    <label className="text-xs text-muted-foreground">
                      {t("Cash received (৳)", "নগদ প্রাপ্ত (৳)")}
                      <input
                        type="number"
                        min={0}
                        value={tender.received}
                        onChange={(e) =>
                          setTenders((prev) =>
                            prev.map((x, xi) => (xi === i ? { ...x, received: e.target.value } : x)),
                          )
                        }
                        className={`money mt-1 w-32 ${inputClass}`}
                      />
                    </label>
                  )}
                  <span className="money pb-3 text-sm">{fmtMinor(tenderMinor[i] ?? 0)}</span>
                  {split && (
                    <button
                      type="button"
                      onClick={() => setTenders((prev) => prev.filter((_, xi) => xi !== i))}
                      className="min-h-11 px-2 pb-1 text-muted-foreground hover:text-destructive"
                      aria-label={t("Remove tender", "পেমেন্ট সরান")}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                disabled={tenders.length >= 4}
                onClick={() =>
                  setTenders((prev) => [
                    ...prev.map((x, i) =>
                      i === 0 && !x.amount ? { ...x, amount: (total / 100).toFixed(2) } : x,
                    ),
                    { method: "card", amount: "", received: "" },
                  ])
                }
                className="min-h-11 rounded-fq-md border border-border px-3 font-medium disabled:opacity-50"
              >
                {t("Split payment", "পেমেন্ট ভাগ করুন")}
              </button>
              {split && (
                <span
                  role="status"
                  className={remaining === 0 ? "text-mint-900" : "text-amber-900"}
                >
                  {remaining === 0
                    ? t("Balanced ✓", "সমান ✓")
                    : `${t("Unassigned", "অবশিষ্ট")} ${fmtMinor(remaining)}`}
                </span>
              )}
              {changeDue > 0 && (
                <span className="money" aria-live="polite">
                  {t("Change due", "ফেরত")} {fmtMinor(changeDue)}
                </span>
              )}
            </div>
          </fieldset>

          <p aria-live="polite" className="money mt-4 text-3xl font-semibold">
            {fmtMinor(total)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Subtotal", "সাবটোটাল")} <span className="money">{fmtMinor(subtotal)}</span> · {t("Discount", "ডিসকাউন্ট")}{" "}
            <span className="money">{fmtMinor(discount)}</span>
          </p>
          <button
            type="button"
            disabled={!balanced || checkout.isPending}
            onClick={() => checkout.mutate()}
            className="mt-3 min-h-14 w-full rounded-fq-md bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {checkout.isPending ? t("Taking payment…", "পেমেন্ট নেওয়া হচ্ছে…") : t("Checkout", "চেকআউট")}
          </button>
          {!balanced && lines.length > 0 && (
            <p className="mt-1 text-xs text-amber-900">
              {t("Assign every taka to a tender before taking payment.", "চেকআউটের আগে সব টাকা পেমেন্টে ভাগ করুন।")}
            </p>
          )}

          {lastOrderId && (
            <div className="mt-3 rounded-fq-md border border-border p-3">
              <p className="text-sm font-medium">{t("Assign courier", "কুরিয়ার অ্যাসাইন করুন")}</p>
              <div className="mt-2 flex gap-2">
                <select
                  aria-label={t("Courier", "কুরিয়ার")}
                  value={carrierCode}
                  onChange={(e) => setCarrierCode(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t("Select", "নির্বাচন করুন")}</option>
                  {carriers.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!carrierCode || assign.isPending}
                  onClick={() => assign.mutate()}
                  className="min-h-11 shrink-0 rounded-fq-md border border-border px-3 text-sm font-medium disabled:opacity-50"
                >
                  {t("Assign", "অ্যাসাইন")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <RecentSales
        orders={(boot.data?.orders ?? []) as unknown as PosOrderRow[]}
        onRefund={setRefundFor}
        onReceipt={setReceiptFor}
      />

      {blocked.length > 0 && (
        <div role="alert" className="rounded-fq-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">
            {t("Sales stuck after", "সিঙ্ক আটকে আছে")} {maxAttempts} {t("sync attempts", "চেষ্টার পরে")}
          </p>
          <ul className="mt-2 space-y-1">
            {blocked.map((b) => (
              <li key={b.clientId} className="flex items-center gap-2">
                <span className="money flex-1">
                  {fmtMinor(b.totalMinorInt)} · {b.error ?? t("sync failed", "সিঙ্ক ব্যর্থ")}
                </span>
                <button
                  type="button"
                  onClick={() => drop(b.clientId)}
                  className="min-h-11 rounded-fq-md border border-border px-3 font-medium"
                >
                  {t("Discard", "বাতিল")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {refundFor && (
        <RefundDialog
          order={refundFor}
          busy={refund.isPending}
          onCancel={() => setRefundFor(null)}
          onConfirm={(v) => refund.mutate(v)}
        />
      )}

      {report && <ZReportDialog report={report} onClose={() => setReport(null)} />}

      {receiptFor && <ReceiptDialog order={receiptFor} onClose={() => setReceiptFor(null)} />}
    </section>
  );
}

function RecentSales(props: {
  orders: PosOrderRow[];
  onRefund: (o: PosOrderRow) => void;
  onReceipt: (o: PosOrderRow) => void;
}) {
  const { t } = useLang();
  if (props.orders.length === 0) return null;
  return (
    <div className="rounded-fq-lg border border-border bg-card p-3">
      <h2 className="font-bangla-display text-base font-semibold">{t("Recent sales", "সাম্প্রতিক বিক্রয়")}</h2>
      <ul className="mt-2 divide-y divide-border text-sm">
        {props.orders.slice(0, 12).map((o) => {
          const refunded = (o.pos_refunds ?? []).reduce((a, r) => a + Number(r.amount_minor_int), 0);
          const tenderLabel = (o.pos_payments ?? []).map((p) => p.method).join(" + ") || "—";
          return (
            <li key={o.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="money w-28">{fmtMinor(Number(o.total_minor_int))}</span>
              <span className="text-xs text-muted-foreground">{tenderLabel}</span>
              <span className="text-xs">{o.status}</span>
              {refunded > 0 && (
                <span className="money text-xs text-amber-900">
                  {t("Refunded", "রিফান্ড")} {fmtMinor(refunded)}
                </span>
              )}
              <button
                type="button"
                onClick={() => props.onReceipt(o)}
                className="ml-auto min-h-11 rounded-fq-md border border-border px-3 text-xs font-medium"
              >
                {t("Receipt", "রসিদ")}
              </button>
              <button
                type="button"
                onClick={() => props.onRefund(o)}
                disabled={o.status === "voided" || refunded >= Number(o.total_minor_int)}
                className="min-h-11 rounded-fq-md border border-border px-3 text-xs font-medium disabled:opacity-50"
              >
                {t("Refund", "রিফান্ড")}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RefundDialog(props: {
  order: PosOrderRow;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (v: {
    amountMinorInt: number;
    method: TenderRow["method"];
    reason: string;
    restock: boolean;
  }) => void;
}) {
  const { t } = useLang();
  const refunded = (props.order.pos_refunds ?? []).reduce((a, r) => a + Number(r.amount_minor_int), 0);
  const max = Number(props.order.total_minor_int) - refunded;
  const [amount, setAmount] = useState((max / 100).toFixed(2));
  const [method, setMethod] = useState<TenderRow["method"]>("cash");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const minor = Math.round(Number(amount || 0) * 100);
  const valid = minor > 0 && minor <= max;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pos-refund-title"
        onKeyDown={(e) => e.key === "Escape" && props.onCancel()}
        className="w-full max-w-md rounded-fq-lg border border-border bg-card p-4"
      >
        <h2 id="pos-refund-title" className="font-bangla-display text-base font-semibold">
          {t("Refund sale", "বিক্রয় ফেরত")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Refundable", "ফেরতযোগ্য")} <span className="money">{fmtMinor(max)}</span>
        </p>
        <div className="mt-3 grid gap-2">
          <label className="text-xs text-muted-foreground">
            {t("Amount (৳)", "পরিমাণ (৳)")}
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`money mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("Refund method", "ফেরতের পদ্ধতি")}
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as TenderRow["method"])}
              className={`mt-1 ${inputClass}`}
            >
              <option value="cash">{t("Cash", "ক্যাশ")}</option>
              <option value="card">{t("Card", "কার্ড")}</option>
              <option value="cod">COD</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            {t("Reason", "কারণ")}
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            {t("Return items to stock", "পণ্য স্টকে ফেরত")}
          </label>
        </div>
        {!valid && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {t("Enter an amount within the refundable total.", "ফেরতযোগ্য সীমার মধ্যে পরিমাণ দিন।")}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="min-h-11 rounded-fq-md border border-border px-4 text-sm font-medium"
          >
            {t("Cancel", "বাতিল")}
          </button>
          <button
            type="button"
            autoFocus
            disabled={!valid || props.busy}
            onClick={() => props.onConfirm({ amountMinorInt: minor, method, reason, restock })}
            className="min-h-11 rounded-fq-md bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
          >
            {props.busy ? t("Refunding…", "ফেরত হচ্ছে…") : t("Refund", "রিফান্ড")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ZReportDialog(props: { report: Record<string, unknown>; onClose: () => void }) {
  const { t } = useLang();
  const n = (k: string) => Number(props.report[k] ?? 0);
  const tenders = (props.report["tenders"] ?? {}) as Record<string, number>;
  const rows: [string, number][] = [
    [t("Sales", "বিক্রয়"), n("gross_minor_int")],
    ...Object.entries(tenders).map(([m, v]) => [m.toUpperCase(), Number(v)] as [string, number]),
    [t("Refunds", "রিফান্ড"), n("refund_total_minor_int")],
    [t("Net", "নেট"), n("net_minor_int")],
    [t("Drawer expected", "ড্রয়ার প্রত্যাশিত"), n("expected_cash_minor_int")],
    [t("Variance", "পার্থক্য"), n("variance_minor_int")],
  ];
  const orders = Number(props.report["orders"] ?? 0);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-z-title"
        onKeyDown={(e) => e.key === "Escape" && props.onClose()}
        className="w-full max-w-md rounded-fq-lg border border-border bg-card p-4"
      >
        <h2 id="pos-z-title" className="font-bangla-display text-base font-semibold">
          {t("Z-report", "জেড-রিপোর্ট")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {orders} {t("sales in this shift", "টি বিক্রয় এই শিফটে")}
        </p>
        <dl className="mt-3 space-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="money">{fmtMinor(value)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-fq-md border border-border px-4 text-sm font-medium"
          >
            {t("Print", "প্রিন্ট")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={props.onClose}
            className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {t("Close", "বন্ধ")}
          </button>
        </div>
      </div>
    </div>
  );
}


type ShiftBarProps = {
  session: { id: string; starting_cash_minor_int: number; open_time: string } | null;
  totals: {
    orders: number;
    drawerCashMinorInt: number;
    codMinorInt: number;
    refundMinorInt?: number;
  } | null;
  openingCash: string;
  setOpeningCash: (v: string) => void;
  drawerCount: string;
  setDrawerCount: (v: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onReport: () => void;
  busy: boolean;
};

function ShiftBar(props: ShiftBarProps) {
  const { t } = useLang();
  const { session, totals } = props;
  if (!session) {
    return (
      <div className="flex flex-wrap items-end gap-3 rounded-fq-lg border border-border bg-card p-3">
        <label className="text-xs text-muted-foreground">
          {t("Opening cash (৳)", "ওপেনিং ক্যাশ (৳)")}
          <input
            type="number"
            min={0}
            value={props.openingCash}
            onChange={(e) => props.setOpeningCash(e.target.value)}
            className={`money mt-1 ${inputClass}`}
          />
        </label>
        <button
          type="button"
          onClick={props.onOpen}
          disabled={props.busy}
          className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("Start shift", "শিফট শুরু")}
        </button>
      </div>
    );
  }
  const expected = Number(session.starting_cash_minor_int) + (totals?.drawerCashMinorInt ?? 0);
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-fq-lg border border-border bg-card p-3 text-sm">
      <span>
        {t("Shift open", "শিফট চালু")} · {t("Orders", "অর্ডার")} <span className="money">{totals?.orders ?? 0}</span>
      </span>
      <span>
        {t("Drawer expected", "ড্রয়ার প্রত্যাশিত")} <span className="money">{fmtMinor(expected)}</span>
      </span>
      <span>
        COD <span className="money">{fmtMinor(totals?.codMinorInt ?? 0)}</span>
      </span>
      <span>
        {t("Refunds", "রিফান্ড")} <span className="money">{fmtMinor(totals?.refundMinorInt ?? 0)}</span>
      </span>
      <label className="text-xs text-muted-foreground">
        {t("Counted cash (৳)", "গোনা ক্যাশ (৳)")}
        <input
          type="number"
          min={0}
          value={props.drawerCount}
          onChange={(e) => props.setDrawerCount(e.target.value)}
          className={`money mt-1 ${inputClass}`}
        />
      </label>
      <button
        type="button"
        onClick={props.onReport}
        disabled={props.busy}
        className="min-h-11 rounded-fq-md border border-border px-4 font-medium disabled:opacity-50"
      >
        {t("Z-report", "জেড-রিপোর্ট")}
      </button>
      <button
        type="button"
        onClick={props.onClose}
        disabled={props.busy}
        className="min-h-11 rounded-fq-md border border-border px-4 font-medium disabled:opacity-50"
      >
        {t("Close shift", "শিফট বন্ধ")}
      </button>
    </div>
  );
}

type ReceiptItem = {
  product_title?: string;
  variant_name?: string;
  quantity?: number;
  line_total_minor_int?: number;
};

/** 80mm thermal-style receipt; `print:` classes hide the rest of the desk. */
function ReceiptDialog(props: { order: PosOrderRow; onClose: () => void }) {
  const { t } = useLang();
  const items = Array.isArray(props.order.items) ? (props.order.items as ReceiptItem[]) : [];
  const paid = props.order.pos_payments ?? [];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 print:bg-transparent print:p-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-receipt-title"
        onKeyDown={(e) => e.key === "Escape" && props.onClose()}
        className="w-full max-w-xs rounded-fq-lg border border-border bg-card p-4 text-sm print:max-w-none print:border-0"
      >
        <h2 id="pos-receipt-title" className="text-center font-bangla-display text-base font-semibold">
          {t("Receipt", "রসিদ")}
        </h2>
        <p className="text-center text-xs text-muted-foreground">
          {new Date(props.order.captured_at).toLocaleString()}
        </p>
        <ul className="mt-3 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {it.product_title ?? it.variant_name} × {it.quantity ?? 1}
              </span>
              <span className="money">{fmtMinor(Number(it.line_total_minor_int ?? 0))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-border pt-2 font-semibold">
          <span>{t("Total", "মোট")}</span>
          <span className="money">{fmtMinor(Number(props.order.total_minor_int))}</span>
        </div>
        <ul className="mt-1 text-xs text-muted-foreground">
          {paid.map((p, i) => (
            <li key={i} className="flex justify-between">
              <span>{p.method}</span>
              <span className="money">{fmtMinor(Number(p.amount_minor_int))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-fq-md border border-border px-4 text-sm font-medium"
          >
            {t("Print", "প্রিন্ট")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={props.onClose}
            className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {t("Close", "বন্ধ")}
          </button>
        </div>
      </div>
    </div>
  );
}
