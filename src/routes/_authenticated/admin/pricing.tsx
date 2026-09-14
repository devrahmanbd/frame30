import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { fmtMinor } from "@/lib/money";
import { netTermsDueAt } from "@/lib/commerce-desk";
import {
  b2bAccountSaveFn,
  priceListItemDeleteFn,
  priceListItemSaveFn,
  priceListSaveFn,
  pricingLoadFn,
} from "@/lib/commerce-desk.functions";

export const Route = createFileRoute("/_authenticated/admin/pricing")({
  head: () => ({
    meta: [
      { title: "Price lists & wholesale accounts — Framique Admin" },
      {
        name: "description",
        content:
          "Set wholesale price lists with quantity breaks, then assign them to approved business accounts with net terms and credit limits.",
      },
      { property: "og:title", content: "Price lists and wholesale accounts" },
      { property: "og:description", content: "Tiered pricing and net terms for business buyers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const qc = useQueryClient();
  const load = useServerFn(pricingLoadFn);
  const saveList = useServerFn(priceListSaveFn);
  const saveItem = useServerFn(priceListItemSaveFn);
  const deleteItem = useServerFn(priceListItemDeleteFn);
  const saveAccount = useServerFn(b2bAccountSaveFn);

  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => load() });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["pricing"] });

  const [list, setList] = useState({
    code: "",
    name: "",
    kind: "percent_off" as "fixed" | "percent_off",
    adjustmentBp: 0,
    priority: 0,
  });
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [item, setItem] = useState({ variantId: "", minQuantity: 1, priceMinorInt: 0 });
  const [account, setAccount] = useState({
    customerId: "",
    companyName: "",
    taxId: "",
    priceListId: "",
    netTermsDays: 0,
    creditLimitMinorInt: 0,
    isApproved: false,
  });

  const listMutation = useMutation({
    mutationFn: () =>
      saveList({ data: { ...list, currencyCode: "BDT", isActive: true } }),
    onSuccess: () => {
      setList({ code: "", name: "", kind: "percent_off", adjustmentBp: 0, priority: 0 });
      invalidate();
      toast.success("Price list saved");
    },
    onError: () => toast.error("That price list could not be saved"),
  });

  const itemMutation = useMutation({
    mutationFn: () =>
      saveItem({
        data: {
          priceListId: selectedList!,
          variantId: item.variantId,
          minQuantity: item.minQuantity,
          priceMinorInt: item.priceMinorInt,
        },
      }),
    onSuccess: () => {
      setItem({ variantId: "", minQuantity: 1, priceMinorInt: 0 });
      invalidate();
      toast.success("Quantity break saved");
    },
    onError: () => toast.error("Check the variant id and try again"),
  });

  const removeItem = useMutation({
    mutationFn: (id: string) => deleteItem({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Removed");
    },
  });

  const accountMutation = useMutation({
    mutationFn: () =>
      saveAccount({
        data: { ...account, priceListId: account.priceListId || null },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Business account saved");
    },
    onError: () => toast.error("That account could not be saved"),
  });

  const lists = pricing.data?.lists ?? [];
  const items = (pricing.data?.items ?? []).filter((i) => i.price_list_id === selectedList);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">Pricing & wholesale</h1>
        <p className="text-sm text-muted-foreground">
          A price list is a named set of prices. Attach it to a business account and that buyer sees those
          prices — including quantity breaks — everywhere they shop.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Price lists</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted-foreground">
              Code
              <input
                value={list.code}
                onChange={(e) => setList((l) => ({ ...l, code: e.target.value }))}
                placeholder="WHOLESALE"
                className="mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Name
              <input
                value={list.name}
                onChange={(e) => setList((l) => ({ ...l, name: e.target.value }))}
                className="mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Type
              <select
                value={list.kind}
                onChange={(e) =>
                  setList((l) => ({ ...l, kind: e.target.value as "fixed" | "percent_off" }))
                }
                className="mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
              >
                <option value="percent_off">Percent off retail</option>
                <option value="fixed">Fixed prices only</option>
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              {list.kind === "percent_off" ? "Discount (basis points)" : "Priority"}
              <input
                type="number"
                min={0}
                value={list.kind === "percent_off" ? list.adjustmentBp : list.priority}
                onChange={(e) =>
                  setList((l) =>
                    l.kind === "percent_off"
                      ? { ...l, adjustmentBp: Number(e.target.value) || 0 }
                      : { ...l, priority: Number(e.target.value) || 0 },
                  )
                }
                className="money mt-1 min-h-9 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={listMutation.isPending || list.code.length < 2 || list.name.length < 2}
            onClick={() => listMutation.mutate()}
            className="mt-3 min-h-10 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Save price list
          </button>

          <ul className="mt-4 space-y-2">
            {lists.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  aria-pressed={selectedList === l.id}
                  onClick={() => setSelectedList(l.id)}
                  className={`w-full rounded-fq-md border p-2 text-left text-sm ${
                    selectedList === l.id ? "border-primary bg-info-soft" : "border-border hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{l.name}</span>{" "}
                  <span className="money text-xs text-muted-foreground">
                    {l.code} · {l.kind === "percent_off" ? `${l.adjustment_bp / 100}% off` : "fixed"}
                  </span>
                </button>
              </li>
            ))}
            {!lists.length ? <li className="text-sm text-muted-foreground">No price lists yet.</li> : null}
          </ul>
        </div>

        <div className="rounded-fq-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Quantity breaks</h2>
          {!selectedList ? (
            <p className="mt-2 text-sm text-muted-foreground">Pick a price list to edit its prices.</p>
          ) : (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_90px_120px]">
                <input
                  aria-label="Variant id"
                  placeholder="Variant id"
                  value={item.variantId}
                  onChange={(e) => setItem((i) => ({ ...i, variantId: e.target.value }))}
                  className="min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                />
                <input
                  aria-label="Minimum quantity"
                  type="number"
                  min={1}
                  value={item.minQuantity}
                  onChange={(e) => setItem((i) => ({ ...i, minQuantity: Number(e.target.value) || 1 }))}
                  className="money min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                />
                <input
                  aria-label="Price in paisa"
                  type="number"
                  min={0}
                  value={item.priceMinorInt}
                  onChange={(e) => setItem((i) => ({ ...i, priceMinorInt: Number(e.target.value) || 0 }))}
                  className="money min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={itemMutation.isPending || item.variantId.length < 10}
                onClick={() => itemMutation.mutate()}
                className="mt-3 min-h-10 rounded-fq-md border border-border px-3 text-sm disabled:opacity-60"
              >
                Add break
              </button>

              <ul className="mt-4 divide-y divide-border text-sm">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-2">
                    <span className="money">
                      {i.min_quantity}+ → {fmtMinor(Number(i.price_minor_int), "BDT")}
                      <span className="ml-2 text-xs text-muted-foreground">{(i.variant_id ?? "").slice(0, 8)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem.mutate(i.id)}
                      className="min-h-9 rounded-fq-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {!items.length ? <li className="py-2 text-muted-foreground">No breaks yet.</li> : null}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="rounded-fq-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Business accounts</h2>
        <p className="text-xs text-muted-foreground">
          Approved accounts can order on terms. Net {account.netTermsDays || 0} days means an invoice raised
          today is due{" "}
          {netTermsDueAt(new Date(), account.netTermsDays || 0).toLocaleDateString("en-BD")}.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            aria-label="Customer id"
            placeholder="Customer id"
            value={account.customerId}
            onChange={(e) => setAccount((a) => ({ ...a, customerId: e.target.value }))}
            className="min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
          />
          <input
            aria-label="Company name"
            placeholder="Company name"
            value={account.companyName}
            onChange={(e) => setAccount((a) => ({ ...a, companyName: e.target.value }))}
            className="min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
          />
          <input
            aria-label="Tax id"
            placeholder="BIN / tax id"
            value={account.taxId}
            onChange={(e) => setAccount((a) => ({ ...a, taxId: e.target.value }))}
            className="min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
          />
          <select
            aria-label="Price list"
            value={account.priceListId}
            onChange={(e) => setAccount((a) => ({ ...a, priceListId: e.target.value }))}
            className="min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
          >
            <option value="">No price list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Net terms days"
            type="number"
            min={0}
            max={180}
            value={account.netTermsDays}
            onChange={(e) => setAccount((a) => ({ ...a, netTermsDays: Number(e.target.value) || 0 }))}
            className="money min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
          />
          <input
            aria-label="Credit limit in paisa"
            type="number"
            min={0}
            value={account.creditLimitMinorInt}
            onChange={(e) =>
              setAccount((a) => ({ ...a, creditLimitMinorInt: Number(e.target.value) || 0 }))
            }
            className="money min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={account.isApproved}
            onChange={(e) => setAccount((a) => ({ ...a, isApproved: e.target.checked }))}
          />
          Approved to buy on terms
        </label>
        <button
          type="button"
          disabled={accountMutation.isPending || account.customerId.length < 10}
          onClick={() => accountMutation.mutate()}
          className="mt-3 min-h-10 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          Save account
        </button>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Business accounts</caption>
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="p-2">Company</th>
                <th scope="col" className="p-2">Customer</th>
                <th scope="col" className="p-2">Terms</th>
                <th scope="col" className="p-2">Credit</th>
                <th scope="col" className="p-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(pricing.data?.accounts ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="p-2">{a.company_name}</td>
                  <td className="p-2 text-muted-foreground">{a.customers?.email ?? "—"}</td>
                  <td className="money p-2">Net {a.net_terms_days}</td>
                  <td className="money p-2">{fmtMinor(Number(a.credit_limit_minor_int), "BDT")}</td>
                  <td className="p-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        a.is_approved
                          ? "bg-success-soft text-success-foreground"
                          : "bg-warning-soft text-warning-foreground"
                      }`}
                    >
                      {a.is_approved ? "approved" : "pending"}
                    </span>
                  </td>
                </tr>
              ))}
              {!(pricing.data?.accounts ?? []).length ? (
                <tr>
                  <td colSpan={5} className="p-3 text-muted-foreground">No business accounts yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
