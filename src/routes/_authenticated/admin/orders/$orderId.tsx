import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { fmtMinor } from "@/lib/money";
import { statusLabel, statusTone } from "./index";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  advanceOrder,
  amendOrder,
  cancelOrder,
  declineRefund,
  loadOrderDetail,
  refundOrder,
} from "@/lib/orders-admin.functions";
import { openRefund as requestPartialRefund } from "@/lib/payments.functions";
import { OrderDesk } from "@/components/admin/OrderDesk";
import { useLang } from "@/lib/i18n";


export const Route = createFileRoute("/_authenticated/admin/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Order detail — Framique Admin" },
      { name: "description", content: "Inspect line items, totals, timeline and issue refunds for an order." },
      { property: "og:title", content: "Order detail" },
      { property: "og:description", content: "Fulfil, cancel or refund a storefront order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderDetailPage,
  errorComponent: ({ error }) => (
    <p role="alert" className="text-sm text-danger-foreground">
      {error.message}
    </p>
  ),
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Order not found.</p>,
});

const FORWARD: Record<string, "packed" | "shipped" | "delivered" | undefined> = {
  confirmed: "packed",
  paid: "packed",
  packed: "shipped",
  shipped: "delivered",
};
const CANCELLABLE = ["pending", "payment_pending", "confirmed", "paid", "packed"];
const TERMINAL = ["cancelled", "refunded"];

const STEPS = ["created", "confirmed", "packed", "shipped", "delivered"] as const;

type Dialog = "cancel" | "refund" | "decline" | null;

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(loadOrderDetail);
  const advance = useServerFn(advanceOrder);
  const cancel = useServerFn(cancelOrder);
  const refund = useServerFn(refundOrder);
  const decline = useServerFn(declineRefund);
  const [dialog, setDialog] = useState<Dialog>(null);
  const amend = useServerFn(amendOrder);
  const [amendOpen, setAmendOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => load({ data: { orderId } }),
  });

  const action = useMutation({
    mutationFn: async (kind: "advance" | "cancel" | "refund" | "decline") => {
      if (kind === "advance") {
        const target = FORWARD[data!.order.status];
        if (!target) throw new Error("No further step available");
        return advance({ data: { orderId, target } });
      }
      if (kind === "cancel") return cancel({ data: { orderId } });
      if (kind === "decline") return decline({ data: { orderId } });
      return refund({ data: { orderId } });
    },
    onSuccess: () => {
      setDialog(null);
      toast.success("Order updated");
      void qc.invalidateQueries({ queryKey: ["admin-order", orderId] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => {
      setDialog(null);
      toast.error(e.message);
    },
  });

  const amendment = useMutation({
    mutationFn: async (form: FormData) =>
      amend({
        data: {
          orderId,
          reason: String(form.get("reason") ?? ""),
          shippingMinor: Number(form.get("shipping") ?? 0),
          discountMinor: Number(form.get("discount") ?? 0),
        },
      }),
    onSuccess: (res) => {
      setAmendOpen(false);
      toast.success(`Order amended · delta ${res.delta_minor_int}`);
      void qc.invalidateQueries({ queryKey: ["admin-order", orderId] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const partialRefund = useMutation({
    mutationFn: (form: FormData) =>
      requestPartialRefund({
        data: {
          orderId,
          amountMinor: Number(form.get("amount") ?? 0),
          reason: String(form.get("reason") ?? ""),
          // Stable per amount+reason so a double submit cannot open two refunds.
          refundKey: `rf-${orderId}-${String(form.get("amount"))}-${String(form.get("reason")).slice(0, 24)}`,
        },
      }),
    onSuccess: () => {
      toast.success(t("Refund requested", "রিফান্ড অনুরোধ হয়েছে"));
      void qc.invalidateQueries({ queryKey: ["admin-order", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p role="alert" className="text-sm text-danger-foreground">{error.message}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Order not found.</p>;

  const { order, items, events, refunds, payments, amendments } = data;
  const currency = order.currency_code;
  const status = order.status;
  const nextStep = FORWARD[status];
  const closed = TERMINAL.includes(status);
  const canCancel = !closed && CANCELLABLE.includes(status);
  const refundPending = status === "refund_requested";
  const payment = payments[0];
  const capturedMinor = payments
    .filter((p) => p.payment_status === "paid")
    .reduce((sum, p) => sum + Number(p.amount_minor_int), 0);
  const refundedMinor = refunds
    .filter((r) => ["requested", "approved", "processing", "settled"].includes(r.status ?? ""))
    .reduce((sum, r) => sum + Number(r.amount_minor_int), 0);
  const refundableMinor = Math.max(0, capturedMinor - refundedMinor);

  const reached = new Set<string>(["created"]);
  for (const e of events) reached.add(e.event_type.replace(/^order\./, ""));
  if (status === "delivered") STEPS.forEach((s) => reached.add(s));

  return (
    <section>
      <Link
        to="/admin/orders"
        className="text-sm text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        ← {t("Back to orders", "অর্ডারে ফিরুন")}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="money font-bangla-display text-xl font-semibold">{order.order_number}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[status] ?? ""}`}>
          {statusLabel[status] ?? status}
        </span>
        <span className="money text-xs text-muted-foreground">
          {new Date(order.created_at).toLocaleString("en-BD")}
        </span>
        <Link
          to="/admin/orders/$orderId/invoice"
          params={{ orderId: order.id }}
          className="ml-auto min-h-9 rounded-fq-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("Invoice", "চালান")}
        </Link>
      </div>

      {closed ? (
        <p className="mt-4 rounded-fq-lg border border-border bg-muted p-3 text-sm text-foreground">
          {t("This order is closed", "এই অর্ডারটি বন্ধ")} ({statusLabel[status] ?? status}). No further actions
          are available.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {refundPending ? (
            <>
              <button
                type="button"
                disabled={action.isPending}
                aria-label="Approve the refund request"
                onClick={() => setDialog("refund")}
                className="min-h-11 rounded-fq-md bg-bd-teal-700 px-4 text-sm font-medium text-background disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("Approve refund", "রিফান্ড অনুমোদন")}
              </button>
              <button
                type="button"
                disabled={action.isPending}
                aria-label="Decline the refund request"
                onClick={() => setDialog("decline")}
                className="min-h-11 rounded-fq-md border border-border px-4 text-sm font-medium text-danger-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("Decline refund", "রিফান্ড নাকচ")}
              </button>
            </>
          ) : null}

          {nextStep ? (
            <button
              type="button"
              disabled={action.isPending}
              aria-label={`Mark this order ${nextStep}`}
              onClick={() => action.mutate("advance")}
              className="min-h-11 rounded-fq-md bg-bd-teal-700 px-4 text-sm font-medium text-background disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("Mark as", "হিসেবে চিহ্নিত করুন")} {statusLabel[nextStep] ?? nextStep}
            </button>
          ) : null}

          {canCancel ? (
            <button
              type="button"
              disabled={action.isPending}
              aria-label="Cancel this order and restore stock"
              onClick={() => setDialog("cancel")}
              className="min-h-11 rounded-fq-md border border-border px-4 text-sm font-medium text-danger-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("Cancel order", "অর্ডার বাতিল")}
            </button>
          ) : null}
        </div>
      )}

      <ol className="mt-6 flex flex-wrap gap-2" aria-label="Fulfilment progress">
        {STEPS.map((s) => {
          const done = reached.has(s);
          return (
            <li
              key={s}
              className={`rounded-full border px-3 py-1 text-xs ${
                done
                  ? "border-mint-600 bg-success-soft text-success-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {done ? "✓ " : "○ "}
              {statusLabel[s] ?? s}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("Customer", "গ্রাহক")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {order.customer_name}
            <br />
            <span className="money">{order.customer_phone}</span>
            {order.customer_email ? (
              <>
                <br />
                {order.customer_email}
              </>
            ) : null}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {order.address_line}
            <br />
            {order.city} <span className="money">{order.postcode ?? ""}</span>
          </p>
          {order.note ? <p className="mt-2 text-xs text-muted-foreground">Note: {order.note}</p> : null}
        </div>

        <div className="rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("Payment", "পেমেন্ট")}</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Method" value={order.payment_method.toUpperCase()} />
            <Row label="Payment id" value={payment?.id ?? "—"} />
            <Row label="Payment status" value={payment?.payment_status ?? "—"} />
            <Row
              label="Captured"
              value={payment ? fmtMinor(Number(payment.amount_minor_int), currency) : "—"}
            />
          </dl>
        </div>

        <div className="rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("Totals", "মোট")}</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Subtotal" value={fmtMinor(Number(order.subtotal_minor_int), currency)} />
            <Row label="Discount" value={fmtMinor(Number(order.discount_minor_int), currency)} />
            <Row label="Delivery" value={fmtMinor(Number(order.shipping_minor_int), currency)} />
            <Row label="COD surcharge" value={fmtMinor(Number(order.cod_surcharge_minor_int), currency)} />
            <Row
              label={`VAT (${(order.vat_rate_basis_points / 100).toFixed(1)}%)`}
              value={fmtMinor(Number(order.vat_minor_int), currency)}
            />
            <Row label="Total" value={fmtMinor(Number(order.total_minor_int), currency)} strong />
            {refunds.map((r) => (
              <Row
                key={r.id}
                label="Refunded"
                value={`− ${fmtMinor(Number(r.amount_minor_int), currency)}`}
              />
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-fq-lg border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Order line items</caption>
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="p-3">Product</th>
              <th scope="col" className="p-3">Variant</th>
              <th scope="col" className="p-3">SKU</th>
              <th scope="col" className="p-3">Qty</th>
              <th scope="col" className="p-3">Unit</th>
              <th scope="col" className="p-3">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="p-3">{i.product_title}</td>
                <td className="p-3 text-muted-foreground">{i.variant_name}</td>
                <td className="money p-3 text-muted-foreground">{i.sku ?? "—"}</td>
                <td className="money p-3">{i.quantity}</td>
                <td className="money p-3">{fmtMinor(Number(i.unit_price_minor_int), currency)}</td>
                <td className="money p-3 font-medium">
                  {fmtMinor(Number(i.line_total_minor_int), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OrderDesk
        orderId={orderId}
        items={items.map((i) => ({
          id: i.id,
          product_title: i.product_title,
          variant_name: i.variant_name,
          quantity: Number(i.quantity),
          unit_price_minor_int: Number(i.unit_price_minor_int),
        }))}
        currency={currency}
        paymentMethod={order.payment_method}
        tags={(order as { tags?: string[] }).tags ?? []}
        closed={closed}
      />

      <div className="mt-4 rounded-fq-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">{t("Refund whole order", "পুরো অর্ডার রিফান্ড")}</h2>
        <p className="money mt-1 text-sm text-muted-foreground">
          {t("Refundable now", "এখন রিফান্ডযোগ্য")}: {fmtMinor(refundableMinor, currency)}
        </p>
        {refundableMinor === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Nothing left to refund on this order.", "এই অর্ডারে রিফান্ড করার কিছু বাকি নেই।")}
          </p>
        ) : (
          <form
            className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget as HTMLFormElement);
              partialRefund.mutate(form);
            }}
          >
            <label className="text-sm">
              <span className="block text-muted-foreground">{t("Amount (minor)", "পরিমাণ (পয়সা)")}</span>
              <input
                name="amount"
                type="number"
                min={1}
                max={refundableMinor}
                required
                defaultValue={refundableMinor}
                className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-muted-foreground">{t("Reason", "কারণ")}</span>
              <input
                name="reason"
                minLength={4}
                maxLength={300}
                required
                className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={partialRefund.isPending}
              className="mt-6 min-h-11 rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {partialRefund.isPending ? t("Requesting…", "অনুরোধ হচ্ছে…") : t("Request refund", "রিফান্ড অনুরোধ")}
            </button>
          </form>
        )}
      </div>


      <div className="mt-4 rounded-fq-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{t("Amend amounts", "পরিমাণ সংশোধন")}</h2>
          {!closed && (
            <button
              type="button"
              aria-expanded={amendOpen}
              onClick={() => setAmendOpen((v) => !v)}
              className="min-h-11 rounded-fq-md border border-border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {amendOpen ? t("Close", "বন্ধ") : t("Edit shipping / discount", "ডেলিভারি / ডিসকাউন্ট সম্পাদনা")}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "VAT and total are recomputed server-side from the stored rate. Every edit is written to an append-only amendment log with a reason.",
            "ভ্যাট ও মোট সার্ভারে সংরক্ষিত হারে পুনরায় গণনা হয়। প্রতিটি সংশোধন কারণসহ অপরিবর্তনীয় লগে লেখা হয়।",
          )}
        </p>

        {amendOpen && !closed && (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              amendment.mutate(new FormData(e.currentTarget));
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("Delivery (minor units)", "ডেলিভারি (পয়সা)")}</span>
              <input
                name="shipping"
                type="number"
                min={0}
                step={1}
                required
                defaultValue={Number(order.shipping_minor_int)}
                className="money h-12 w-full rounded-fq-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("Discount (minor units)", "ডিসকাউন্ট (পয়সা)")}</span>
              <input
                name="discount"
                type="number"
                min={0}
                step={1}
                required
                defaultValue={Number(order.discount_minor_int)}
                className="money h-12 w-full rounded-fq-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("Reason", "কারণ")}</span>
              <input
                name="reason"
                required
                minLength={4}
                maxLength={300}
                placeholder={t("Courier fee corrected", "কুরিয়ার ফি সংশোধন")}
                className="h-12 w-full rounded-fq-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={amendment.isPending}
                className="min-h-11 rounded-fq-md bg-bd-teal-700 px-4 text-sm font-medium text-background disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {amendment.isPending ? t("Applying…", "প্রয়োগ হচ্ছে…") : t("Apply amendment", "সংশোধন প্রয়োগ")}
              </button>
            </div>
          </form>
        )}

        {amendments.length > 0 && (
          <ul className="mt-4 space-y-2">
            {amendments.map((a) => (
              <li key={a.id} className="rounded-fq-md border border-border p-3 text-sm">
                <p className="font-medium">{a.reason}</p>
                <p className="money mt-1 text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("en-BD")} ·{" "}
                  {Number(a.delta_minor_int) >= 0 ? "+" : ""}
                  {fmtMinor(Number(a.delta_minor_int), currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-fq-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">{t("Timeline", "টাইমলাইন")}</h2>
        <ol className="mt-3 space-y-3">
          <li className="rounded-fq-lg rounded-bl-sm bg-info-soft p-3 text-sm">
            <p className="font-medium">order.created</p>
            <p className="money mt-1 text-xs text-muted-foreground">
              {new Date(order.created_at).toLocaleString("en-BD")}
            </p>
          </li>
          {events.map((e) => (
            <li key={e.id} className="rounded-fq-lg rounded-bl-sm bg-info-soft p-3 text-sm">
              <p className="font-medium">{e.event_type}</p>
              {e.note ? <p className="text-muted-foreground">{e.note}</p> : null}
              <p className="money mt-1 text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString("en-BD")}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <ConfirmDialog
        open={dialog === "cancel"}
        tone="danger"
        title={t("Cancel this order?", "অর্ডার বাতিল করবেন?")}
        description="Stock will be restored and the customer will be notified. This cannot be undone."
        confirmLabel={t("Confirm cancel", "বাতিল নিশ্চিত")}
        busy={action.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() => action.mutate("cancel")}
      />
      <ConfirmDialog
        open={dialog === "refund"}
        title={t("Approve refund?", "রিফান্ড অনুমোদন?")}
        description={`${fmtMinor(Number(order.total_minor_int), currency)} will be refunded in the order currency using an idempotent refund key.`}
        confirmLabel={t("Approve refund", "রিফান্ড দিন")}
        busy={action.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() => action.mutate("refund")}
      />
      <ConfirmDialog
        open={dialog === "decline"}
        tone="danger"
        title={t("Decline refund?", "রিফান্ড নাকচ?")}
        description="The order returns to its previous state and the request is logged in the timeline."
        confirmLabel={t("Confirm decline", "নাকচ নিশ্চিত")}
        busy={action.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() => action.mutate("decline")}
      />
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="money truncate">{value}</dd>
    </div>
  );
}
