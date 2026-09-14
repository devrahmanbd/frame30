import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Send, Trash2, FileCheck2 } from "lucide-react";
import { fmtMinor } from "@/lib/money";
import { canSendDraft, draftTotals } from "@/lib/commerce-desk";
import {
  draftOrderActionFn,
  draftOrderSaveFn,
  draftOrdersLoadFn,
} from "@/lib/commerce-desk.functions";

export const Route = createFileRoute("/_authenticated/admin/draft-orders")({
  head: () => ({
    meta: [
      { title: "Draft orders & invoice links — Framique Admin" },
      {
        name: "description",
        content:
          "Build an order for a customer, send it as a secure invoice link, and convert it into a real order once accepted.",
      },
      { property: "og:title", content: "Draft orders and invoice links" },
      { property: "og:description", content: "Quote, share and convert orders without a checkout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DraftOrdersPage,
});

type LineDraft = {
  variantId: string | null;
  title: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPriceMinorInt: number;
};

const EMPTY = {
  id: undefined as string | undefined,
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  addressLine: "",
  city: "",
  postcode: "",
  note: "",
  discountMinorInt: 0,
  shippingMinorInt: 0,
  vatMinorInt: 0,
  items: [] as LineDraft[],
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info-soft text-info-foreground",
  accepted: "bg-success-soft text-success-foreground",
  converted: "bg-success-soft text-success-foreground",
  expired: "bg-warning-soft text-warning-foreground",
  cancelled: "bg-danger-soft text-danger-foreground",
};

function DraftOrdersPage() {
  const qc = useQueryClient();
  const load = useServerFn(draftOrdersLoadFn);
  const save = useServerFn(draftOrderSaveFn);
  const act = useServerFn(draftOrderActionFn);
  const [form, setForm] = useState({ ...EMPTY });

  const drafts = useQuery({ queryKey: ["draft-orders"], queryFn: () => load() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["draft-orders"] });

  const totals = useMemo(
    () =>
      draftTotals(
        form.items.map((i) => ({ quantity: i.quantity, unitPriceMinor: i.unitPriceMinorInt })),
        {
          discountMinor: form.discountMinorInt,
          shippingMinor: form.shippingMinorInt,
          vatMinor: form.vatMinorInt,
        },
      ),
    [form],
  );

  const sendable = canSendDraft({
    lineCount: form.items.length,
    customerEmail: form.customerEmail,
    status: "draft",
  });

  const saveDraft = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...form,
          currencyCode: "BDT",
          items: form.items.filter((i) => i.title.trim()),
        },
      }),
    onSuccess: () => {
      setForm({ ...EMPTY });
      invalidate();
      toast.success("Draft saved");
    },
    onError: () => toast.error("Could not save that draft"),
  });

  const runAction = useMutation({
    mutationFn: (vars: { id: string; action: "send" | "convert" | "cancel" }) => act({ data: vars }),
    onSuccess: (res) => {
      invalidate();
      const outcome = (res as { outcome?: string }).outcome;
      if (outcome === "already_converted") toast.info("That draft was already converted");
      else if ((res as { action?: string }).action === "send") toast.success("Invoice link ready to share");
      else toast.success("Done");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "That action could not be completed"),
  });

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/invoice/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Invoice link copied");
  };

  const setLine = (index: number, patch: Partial<LineDraft>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">Draft orders</h1>
        <p className="text-sm text-muted-foreground">
          Quote a customer, send them a secure invoice link, then convert it into a real order once they
          accept. Nothing is charged and no stock moves until you convert.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">New draft</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["customerName", "Customer name"],
                ["customerEmail", "Email"],
                ["customerPhone", "Phone"],
                ["city", "City"],
                ["addressLine", "Address"],
                ["postcode", "Postcode"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs font-medium text-muted-foreground">
                {label}
                <input
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm text-foreground"
                />
              </label>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Items</h3>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  items: [
                    ...f.items,
                    { variantId: null, title: "", variantName: "", sku: "", quantity: 1, unitPriceMinorInt: 0 },
                  ],
                }))
              }
              className="inline-flex min-h-9 items-center gap-1 rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
            >
              <Plus className="size-3.5" aria-hidden /> Add line
            </button>
          </div>

          {form.items.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No lines yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {form.items.map((line, index) => (
                <li key={index} className="grid gap-2 rounded-fq-md border border-border p-2 sm:grid-cols-[1fr_90px_120px_40px]">
                  <input
                    aria-label={`Item ${index + 1} title`}
                    placeholder="Product title"
                    value={line.title}
                    onChange={(e) => setLine(index, { title: e.target.value })}
                    className="min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                  />
                  <input
                    aria-label={`Item ${index + 1} quantity`}
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => setLine(index, { quantity: Number(e.target.value) || 1 })}
                    className="money min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                  />
                  <input
                    aria-label={`Item ${index + 1} unit price in paisa`}
                    type="number"
                    min={0}
                    value={line.unitPriceMinorInt}
                    onChange={(e) => setLine(index, { unitPriceMinorInt: Number(e.target.value) || 0 })}
                    className="money min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                  />
                  <button
                    type="button"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))}
                    className="inline-flex min-h-9 items-center justify-center rounded-fq-md border border-border text-muted-foreground hover:bg-muted"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(
              [
                ["discountMinorInt", "Discount (paisa)"],
                ["shippingMinorInt", "Shipping (paisa)"],
                ["vatMinorInt", "VAT (paisa)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs font-medium text-muted-foreground">
                {label}
                <input
                  type="number"
                  min={0}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) || 0 }))}
                  className="money mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
                />
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="money text-sm">
              Total <strong>{fmtMinor(totals.total, "BDT")}</strong>
              <span className="ml-2 text-xs text-muted-foreground">
                subtotal {fmtMinor(totals.subtotal, "BDT")}
              </span>
            </p>
            <div className="flex items-center gap-2">
              {!sendable.ok && form.items.length > 0 ? (
                <span className="text-xs text-muted-foreground">{sendable.reason}</span>
              ) : null}
              <button
                type="button"
                disabled={saveDraft.isPending || form.items.length === 0}
                onClick={() => saveDraft.mutate()}
                className="inline-flex min-h-10 items-center gap-2 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saveDraft.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Save draft
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">How this works</h2>
          <ol className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li>1. Save the draft with the customer&apos;s details and items.</li>
            <li>2. Send it — that creates a private link you can share on any channel.</li>
            <li>3. The customer opens the link, reviews the quote and accepts.</li>
            <li>4. Convert it once. A second conversion returns the same order.</li>
          </ol>
        </div>
      </div>

      <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Draft orders</caption>
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="p-3">Draft</th>
              <th scope="col" className="p-3">Customer</th>
              <th scope="col" className="p-3">Items</th>
              <th scope="col" className="p-3">Total</th>
              <th scope="col" className="p-3">Status</th>
              <th scope="col" className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {drafts.isLoading ? (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">Loading…</td>
              </tr>
            ) : !drafts.data?.drafts.length ? (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">No drafts yet.</td>
              </tr>
            ) : (
              drafts.data.drafts.map((d) => (
                <tr key={d.id}>
                  <td className="money p-3 font-medium">{d.number}</td>
                  <td className="p-3">
                    {d.customer_name || "—"}
                    <span className="block text-xs text-muted-foreground">{d.customer_email}</span>
                  </td>
                  <td className="money p-3">{d.draft_order_items?.length ?? 0}</td>
                  <td className="money p-3 font-semibold">
                    {fmtMinor(Number(d.total_minor_int), d.currency_code)}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[d.status] ?? ""}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {d.status === "draft" ? (
                        <button
                          type="button"
                          onClick={() => runAction.mutate({ id: d.id, action: "send" })}
                          className="inline-flex min-h-9 items-center gap-1 rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
                        >
                          <Send className="size-3.5" aria-hidden /> Send
                        </button>
                      ) : null}
                      {d.status !== "draft" && d.status !== "cancelled" ? (
                        <button
                          type="button"
                          onClick={() => void copyLink(d.share_token)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
                        >
                          <Copy className="size-3.5" aria-hidden /> Copy link
                        </button>
                      ) : null}
                      {(d.status === "sent" || d.status === "accepted") && !d.order_id ? (
                        <button
                          type="button"
                          onClick={() => runAction.mutate({ id: d.id, action: "convert" })}
                          className="inline-flex min-h-9 items-center gap-1 rounded-fq-md bg-primary px-2 text-xs text-primary-foreground"
                        >
                          <FileCheck2 className="size-3.5" aria-hidden /> Convert
                        </button>
                      ) : null}
                      {d.status !== "converted" && d.status !== "cancelled" ? (
                        <button
                          type="button"
                          onClick={() => runAction.mutate({ id: d.id, action: "cancel" })}
                          className="inline-flex min-h-9 items-center rounded-fq-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
