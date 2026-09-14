import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { fmtMinor } from "@/lib/money";
import { receivingProgress } from "@/lib/commerce-desk";
import {
  purchaseOrderActionFn,
  purchaseOrderSaveFn,
  purchasingLoadFn,
  supplierSaveFn,
} from "@/lib/commerce-desk.functions";

export const Route = createFileRoute("/_authenticated/admin/purchasing")({
  head: () => ({
    meta: [
      { title: "Suppliers & purchase orders — Framique Admin" },
      {
        name: "description",
        content:
          "Track suppliers, raise purchase orders and receive stock partially or in full — inventory updates as each delivery lands.",
      },
      { property: "og:title", content: "Suppliers and purchase orders" },
      { property: "og:description", content: "Restock with partial receiving and live inventory updates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchasingPage,
});

const PO_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-info-soft text-info-foreground",
  partial: "bg-warning-soft text-warning-foreground",
  received: "bg-success-soft text-success-foreground",
  cancelled: "bg-danger-soft text-danger-foreground",
};

function PurchasingPage() {
  const qc = useQueryClient();
  const load = useServerFn(purchasingLoadFn);
  const saveSupplier = useServerFn(supplierSaveFn);
  const savePo = useServerFn(purchaseOrderSaveFn);
  const act = useServerFn(purchaseOrderActionFn);

  const data = useQuery({ queryKey: ["purchasing"], queryFn: () => load() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["purchasing"] });

  const [supplier, setSupplier] = useState({ code: "", name: "", email: "", phone: "", leadTimeDays: 0 });
  const [po, setPo] = useState({
    supplierId: "",
    expectedAt: "",
    note: "",
    items: [] as { variantId: string; sku: string; quantityOrdered: number; unitCostMinorInt: number }[],
  });
  const [receiving, setReceiving] = useState<Record<string, number>>({});

  const supplierMutation = useMutation({
    mutationFn: () =>
      saveSupplier({ data: { ...supplier, addressLine: "", isActive: true } }),
    onSuccess: () => {
      setSupplier({ code: "", name: "", email: "", phone: "", leadTimeDays: 0 });
      invalidate();
      toast.success("Supplier saved");
    },
    onError: () => toast.error("That supplier could not be saved"),
  });

  const poMutation = useMutation({
    mutationFn: () =>
      savePo({
        data: {
          supplierId: po.supplierId,
          locationId: null,
          currencyCode: "BDT",
          expectedAt: po.expectedAt || null,
          note: po.note,
          items: po.items,
        },
      }),
    onSuccess: () => {
      setPo({ supplierId: "", expectedAt: "", note: "", items: [] });
      invalidate();
      toast.success("Purchase order created");
    },
    onError: () => toast.error("That purchase order could not be created"),
  });

  const poAction = useMutation({
    mutationFn: (vars: { id: string; action: "submit" | "cancel" | "receive"; lines?: { itemId: string; quantity: number }[] }) =>
      act({ data: { id: vars.id, action: vars.action, lines: vars.lines ?? [] } }),
    onSuccess: () => {
      setReceiving({});
      invalidate();
      toast.success("Purchase order updated");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "That action could not be completed"),
  });

  const suppliers = data.data?.suppliers ?? [];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">Purchasing</h1>
        <p className="text-sm text-muted-foreground">
          Raise a purchase order with a supplier, then receive the boxes as they arrive. Stock is added the
          moment you record a delivery — partial deliveries are normal and safe to record more than once.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Suppliers</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["code", "Code"],
                ["name", "Name"],
                ["email", "Email"],
                ["phone", "Phone"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs font-medium text-muted-foreground">
                {label}
                <input
                  value={supplier[key]}
                  onChange={(e) => setSupplier((s) => ({ ...s, [key]: e.target.value }))}
                  className="mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
                />
              </label>
            ))}
            <label className="text-xs font-medium text-muted-foreground">
              Lead time (days)
              <input
                type="number"
                min={0}
                value={supplier.leadTimeDays}
                onChange={(e) => setSupplier((s) => ({ ...s, leadTimeDays: Number(e.target.value) || 0 }))}
                className="money mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={supplierMutation.isPending || supplier.code.length < 2 || supplier.name.length < 2}
            onClick={() => supplierMutation.mutate()}
            className="mt-3 min-h-10 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Save supplier
          </button>
          <ul className="mt-4 divide-y divide-border text-sm">
            {suppliers.map((s) => (
              <li key={s.id} className="py-2">
                <span className="font-medium">{s.name}</span>{" "}
                <span className="money text-xs text-muted-foreground">
                  {s.code} · {s.lead_time_days}d lead
                </span>
              </li>
            ))}
            {!suppliers.length ? <li className="py-2 text-muted-foreground">No suppliers yet.</li> : null}
          </ul>
        </div>

        <div className="rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">New purchase order</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted-foreground">
              Supplier
              <select
                value={po.supplierId}
                onChange={(e) => setPo((p) => ({ ...p, supplierId: e.target.value }))}
                className="mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
              >
                <option value="">Choose a supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Expected date
              <input
                type="date"
                value={po.expectedAt}
                onChange={(e) => setPo((p) => ({ ...p, expectedAt: e.target.value }))}
                className="mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() =>
              setPo((p) => ({
                ...p,
                items: [...p.items, { variantId: "", sku: "", quantityOrdered: 1, unitCostMinorInt: 0 }],
              }))
            }
            className="mt-3 min-h-9 rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
          >
            Add line
          </button>

          <ul className="mt-2 space-y-2">
            {po.items.map((line, index) => (
              <li key={index} className="grid gap-2 sm:grid-cols-[1fr_80px_110px]">
                <input
                  aria-label={`Line ${index + 1} variant id`}
                  placeholder="Variant id"
                  value={line.variantId}
                  onChange={(e) =>
                    setPo((p) => ({
                      ...p,
                      items: p.items.map((l, i) => (i === index ? { ...l, variantId: e.target.value } : l)),
                    }))
                  }
                  className="min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                />
                <input
                  aria-label={`Line ${index + 1} quantity`}
                  type="number"
                  min={1}
                  value={line.quantityOrdered}
                  onChange={(e) =>
                    setPo((p) => ({
                      ...p,
                      items: p.items.map((l, i) =>
                        i === index ? { ...l, quantityOrdered: Number(e.target.value) || 1 } : l,
                      ),
                    }))
                  }
                  className="money min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                />
                <input
                  aria-label={`Line ${index + 1} unit cost in paisa`}
                  type="number"
                  min={0}
                  value={line.unitCostMinorInt}
                  onChange={(e) =>
                    setPo((p) => ({
                      ...p,
                      items: p.items.map((l, i) =>
                        i === index ? { ...l, unitCostMinorInt: Number(e.target.value) || 0 } : l,
                      ),
                    }))
                  }
                  className="money min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                />
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={poMutation.isPending || !po.supplierId || po.items.length === 0}
            onClick={() => poMutation.mutate()}
            className="mt-3 min-h-10 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Create purchase order
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {(data.data?.purchaseOrders ?? []).map((order) => {
          const items = order.purchase_order_items ?? [];
          const progress = receivingProgress(
            items.map((i) => ({ ordered: i.quantity_ordered, received: i.quantity_received })),
          );
          return (
            <article key={order.id} className="rounded-fq-lg border border-border bg-card p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="money text-sm font-semibold">{order.number}</h3>
                  <p className="text-xs text-muted-foreground">
                    {order.suppliers?.name ?? "—"} ·{" "}
                    {fmtMinor(Number(order.total_minor_int), order.currency_code)} ·{" "}
                    {progress.received}/{progress.ordered} units received
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${PO_TONE[order.status] ?? ""}`}>
                    {order.status}
                  </span>
                  {order.status === "draft" ? (
                    <button
                      type="button"
                      onClick={() => poAction.mutate({ id: order.id, action: "submit" })}
                      className="min-h-9 rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
                    >
                      Submit
                    </button>
                  ) : null}
                  {order.status !== "cancelled" && order.status !== "received" ? (
                    <button
                      type="button"
                      onClick={() => poAction.mutate({ id: order.id, action: "cancel" })}
                      className="min-h-9 rounded-fq-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </header>

              <div
                className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${order.number} receiving progress`}
              >
                <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
              </div>

              <ul className="mt-3 divide-y divide-border text-sm">
                {items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="money">
                      {i.sku || (i.variant_id ?? "").slice(0, 8)} · {i.quantity_received}/{i.quantity_ordered}
                    </span>
                    {order.status === "submitted" || order.status === "partial" ? (
                      <label className="text-xs text-muted-foreground">
                        Receive now
                        <input
                          type="number"
                          min={0}
                          max={i.quantity_ordered - i.quantity_received}
                          value={receiving[i.id] ?? 0}
                          onChange={(e) =>
                            setReceiving((r) => ({ ...r, [i.id]: Number(e.target.value) || 0 }))
                          }
                          className="money ml-2 min-h-9 w-24 rounded-fq-md border border-border bg-background px-2 text-sm"
                        />
                      </label>
                    ) : null}
                  </li>
                ))}
              </ul>

              {order.status === "submitted" || order.status === "partial" ? (
                <button
                  type="button"
                  disabled={poAction.isPending}
                  onClick={() =>
                    poAction.mutate({
                      id: order.id,
                      action: "receive",
                      lines: items
                        .filter((i) => (receiving[i.id] ?? 0) > 0)
                        .map((i) => ({ itemId: i.id, quantity: receiving[i.id] ?? 0 })),
                    })
                  }
                  className="mt-3 min-h-10 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  Record delivery
                </button>
              ) : null}
            </article>
          );
        })}
        {data.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!data.isLoading && !(data.data?.purchaseOrders ?? []).length ? (
          <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
        ) : null}
      </div>
    </section>
  );
}
