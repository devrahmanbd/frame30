import { one } from "@/lib/embed";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { fmtMinor } from "@/lib/money";
import { adjustPrice, availabilityView, validateBulkRows, type BulkRow } from "@/lib/commerce-desk";
import {
  bulkUpdateVariantsFn,
  skuNextFn,
  variantGridFn,
  variantPreorderSaveFn,
} from "@/lib/commerce-desk.functions";

export const Route = createFileRoute("/_authenticated/admin/bulk-editor")({
  head: () => ({
    meta: [
      { title: "Bulk variant editor — Framique Admin" },
      {
        name: "description",
        content:
          "Edit prices, stock, SKUs and barcodes across hundreds of variants at once, with pre-order rules and a preview of every change before it applies.",
      },
      { property: "og:title", content: "Bulk variant editor" },
      { property: "og:description", content: "Change many prices and stock levels in one safe batch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BulkEditorPage,
});

type Edit = { price?: number; compareAt?: number; stock?: number; sku?: string; barcode?: string };

function BulkEditorPage() {
  const qc = useQueryClient();
  const loadGrid = useServerFn(variantGridFn);
  const apply = useServerFn(bulkUpdateVariantsFn);
  const savePreorder = useServerFn(variantPreorderSaveFn);
  const nextSku = useServerFn(skuNextFn);

  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [op, setOp] = useState<{ mode: "percent" | "amount" | "set"; value: number }>({
    mode: "percent",
    value: 0,
  });

  const grid = useQuery({
    queryKey: ["variant-grid", term],
    queryFn: () => loadGrid({ data: { search: term } }),
  });
  const rows = grid.data?.rows ?? [];
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const pending: BulkRow[] = useMemo(
    () =>
      Object.entries(edits).map(([variant_id, e]) => ({
        variant_id,
        ...(e.price !== undefined ? { price_minor_int: e.price } : {}),
        ...(e.compareAt !== undefined ? { compare_at_minor_int: e.compareAt } : {}),
        ...(e.stock !== undefined ? { stock_quantity: e.stock } : {}),
        ...(e.sku ? { sku: e.sku } : {}),
        ...(e.barcode ? { barcode: e.barcode } : {}),
      })),
    [edits],
  );
  const check = useMemo(() => validateBulkRows(pending), [pending]);

  const applyMutation = useMutation({
    mutationFn: () => apply({ data: { rows: check.valid } }),
    onSuccess: (res) => {
      setEdits({});
      void qc.invalidateQueries({ queryKey: ["variant-grid"] });
      const r = res as { applied: number; rejected: number };
      toast.success(`${r.applied} updated${r.rejected ? `, ${r.rejected} rejected` : ""}`);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "That batch could not be applied"),
  });

  const preorderMutation = useMutation({
    mutationFn: (vars: { variantId: string; policy: "deny" | "allow" | "preorder"; releaseAt: string | null }) =>
      savePreorder({
        data: { variantId: vars.variantId, policy: vars.policy, limit: 0, releaseAt: vars.releaseAt, note: "" },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["variant-grid"] });
      toast.success("Availability rule saved");
    },
    onError: () => toast.error("That rule could not be saved"),
  });

  const codegen = useMutation({
    mutationFn: (variantId: string) =>
      nextSku({ data: { prefix: "SKU" } }).then((res) => ({ variantId, ...(res as { sku: string; barcode: string }) })),
    onSuccess: ({ variantId, sku, barcode }) => {
      setEdits((e) => ({ ...e, [variantId]: { ...e[variantId], sku, barcode } }));
      toast.success(`Generated ${sku}`);
    },
    onError: () => toast.error("Could not generate a code"),
  });

  const applyToSelection = () => {
    setEdits((current) => {
      const next = { ...current };
      for (const row of rows) {
        if (!selected[row.id]) continue;
        const base = next[row.id]?.price ?? Number(row.price_amount_minor_int ?? 0);
        next[row.id] = { ...next[row.id], price: adjustPrice(base, op) };
      }
      return next;
    });
  };

  const setEdit = (id: string, patch: Edit) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">Bulk editor</h1>
        <p className="text-sm text-muted-foreground">
          Change prices, stock and codes across many variants at once. Nothing is saved until you apply the
          batch, and anything we can spot as wrong is listed before it goes anywhere near your catalogue.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-fq-lg border border-border bg-card p-4">
        <label className="text-xs font-medium text-muted-foreground">
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setTerm(search);
            }}
            placeholder="SKU, name or barcode"
            className="mt-1 block min-h-9 w-56 rounded-fq-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => setTerm(search)}
          className="min-h-10 rounded-fq-md border border-border px-3 text-sm hover:bg-muted"
        >
          Find
        </button>

        <div className="ml-auto flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Price change
            <select
              value={op.mode}
              onChange={(e) =>
                setOp((o) => ({ ...o, mode: e.target.value as "percent" | "amount" | "set" }))
              }
              className="mt-1 block min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
            >
              <option value="percent">Percent %</option>
              <option value="amount">Add paisa</option>
              <option value="set">Set to paisa</option>
            </select>
          </label>
          <input
            aria-label="Adjustment value"
            type="number"
            value={op.value}
            onChange={(e) => setOp((o) => ({ ...o, value: Number(e.target.value) || 0 }))}
            className="money min-h-9 w-28 rounded-fq-md border border-border bg-background px-2 text-sm"
          />
          <button
            type="button"
            disabled={!selectedIds.length}
            onClick={applyToSelection}
            className="min-h-10 rounded-fq-md border border-border px-3 text-sm disabled:opacity-60"
          >
            Stage for {selectedIds.length} selected
          </button>
        </div>
      </div>

      {check.invalid.length ? (
        <div className="rounded-fq-lg border border-border bg-warning-soft p-3 text-sm text-warning-foreground">
          <p className="font-medium">{check.invalid.length} change(s) need attention</p>
          <ul className="mt-1 list-disc pl-5">
            {check.invalid.slice(0, 5).map((i, index) => (
              <li key={index}>
                {i.row.variant_id.slice(0, 8)} — {i.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Product variants</caption>
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="p-2">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col" className="p-2">Variant</th>
              <th scope="col" className="p-2">Price</th>
              <th scope="col" className="p-2">Stock</th>
              <th scope="col" className="p-2">SKU / barcode</th>
              <th scope="col" className="p-2">Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {grid.isLoading ? (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">Loading…</td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">No variants match that search.</td>
              </tr>
            ) : (
              rows.map((row) => {
                const edit = edits[row.id] ?? {};
                const price = edit.price ?? Number(row.price_amount_minor_int ?? 0);
                const stock = edit.stock ?? Number(row.stock_quantity ?? 0);
                const view = availabilityView({
                  stock,
                  policy: (row.backorder_policy ?? "deny") as "deny" | "allow" | "preorder",
                  limit: Number(row.backorder_limit ?? 0),
                  releaseAt: row.preorder_release_at,
                });
                return (
                  <tr key={row.id} className={edits[row.id] ? "bg-info-soft/40" : undefined}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${one<{ title: string }>(row.products)?.title ?? row.name}`}
                        checked={!!selected[row.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [row.id]: e.target.checked }))}
                      />
                    </td>
                    <td className="p-2">
                      <span className="font-medium">{one<{ title: string }>(row.products)?.title ?? "—"}</span>
                      <span className="block text-xs text-muted-foreground">{row.name}</span>
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Price for ${row.name}`}
                        type="number"
                        min={0}
                        value={price}
                        onChange={(e) => setEdit(row.id, { price: Number(e.target.value) || 0 })}
                        className="money min-h-9 w-28 rounded-fq-md border border-border bg-background px-2 text-sm"
                      />
                      <span className="money block text-xs text-muted-foreground">
                        {fmtMinor(price, row.currency_code ?? "BDT")}
                      </span>
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Stock for ${row.name}`}
                        type="number"
                        min={0}
                        value={stock}
                        onChange={(e) => setEdit(row.id, { stock: Number(e.target.value) || 0 })}
                        className="money min-h-9 w-24 rounded-fq-md border border-border bg-background px-2 text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <input
                          aria-label={`SKU for ${row.name}`}
                          value={edit.sku ?? row.sku ?? ""}
                          onChange={(e) => setEdit(row.id, { sku: e.target.value })}
                          className="min-h-9 w-32 rounded-fq-md border border-border bg-background px-2 text-sm"
                        />
                        <button
                          type="button"
                          aria-label={`Generate SKU and barcode for ${row.name}`}
                          onClick={() => codegen.mutate(row.id)}
                          className="inline-flex min-h-9 items-center rounded-fq-md border border-border px-2 text-xs hover:bg-muted"
                        >
                          <Sparkles className="size-3.5" aria-hidden />
                        </button>
                      </div>
                      <span className="money block text-xs text-muted-foreground">
                        {edit.barcode ?? row.barcode ?? "no barcode"}
                      </span>
                    </td>
                    <td className="p-2">
                      <select
                        aria-label={`Availability policy for ${row.name}`}
                        value={row.backorder_policy ?? "deny"}
                        onChange={(e) =>
                          preorderMutation.mutate({
                            variantId: row.id,
                            policy: e.target.value as "deny" | "allow" | "preorder",
                            releaseAt: row.preorder_release_at,
                          })
                        }
                        className="min-h-9 rounded-fq-md border border-border bg-background px-2 text-xs"
                      >
                        <option value="deny">Stop at zero</option>
                        <option value="allow">Allow backorder</option>
                        <option value="preorder">Pre-order</option>
                      </select>
                      <span className="block text-xs text-muted-foreground">{view.label}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-fq-lg border border-border bg-card p-3 shadow-sm">
        <p className="text-sm text-muted-foreground">
          {check.valid.length} change(s) staged
          {check.overflow ? ` · ${check.overflow} beyond the 500-row batch limit` : ""}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!Object.keys(edits).length}
            onClick={() => setEdits({})}
            className="min-h-10 rounded-fq-md border border-border px-3 text-sm disabled:opacity-60"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={applyMutation.isPending || !check.valid.length}
            onClick={() => applyMutation.mutate()}
            className="inline-flex min-h-10 items-center gap-2 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {applyMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Apply batch
          </button>
        </div>
      </div>
    </section>
  );
}
