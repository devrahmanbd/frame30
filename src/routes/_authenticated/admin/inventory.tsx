import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  StatusPill,
  Field,
  ErrorFrame,
  inputClass,
  btnPrimary,
  btnGhost,
} from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import {
  inventoryLoadFn,
  inventorySaveLocationFn,
  inventorySetLevelFn,
  inventoryTransferFn,
} from "@/lib/commerce.functions";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Framique admin" },
      {
        name: "description",
        content:
          "Multi-location stock control: per-location levels, low-stock thresholds and transfers between your warehouses and shops.",
      },
      { property: "og:title", content: "Inventory — Framique admin" },
      {
        property: "og:description",
        content: "Track stock per location, set thresholds and move stock with an audited transfer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InventoryPage,
});

const KEY = ["commerce", "inventory"] as const;

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function InventoryPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(inventoryLoadFn);
  const saveLocation = useServerFn(inventorySaveLocationFn);
  const setLevel = useServerFn(inventorySetLevelFn);
  const transfer = useServerFn(inventoryTransferFn);

  const [tab, setTab] = useState<"levels" | "locations" | "transfers">("levels");
  const [term, setTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: KEY,
    queryFn: () => load(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: KEY });

  const levelMutation = useMutation({
    mutationFn: (input: { variantId: string; locationId: string; onHand: number }) =>
      setLevel({ data: input }),
    onSuccess: (_r, v) => {
      setError(null);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[`${v.locationId}:${v.variantId}`];
        return next;
      });
      invalidate();
    },
    onError: (e) => setError(message(e)),
  });

  const locationMutation = useMutation({
    mutationFn: (input: { name: string; code: string; city?: string; isDefault?: boolean }) =>
      saveLocation({ data: input }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError(message(e)),
  });

  const transferMutation = useMutation({
    mutationFn: (input: {
      fromLocationId: string;
      toLocationId: string;
      items: { variantId: string; quantity: number }[];
    }) => transfer({ data: input }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError(message(e)),
  });

  const levels = data?.levels ?? [];
  const locations = data?.locations ?? [];

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return levels.filter((l) => {
      const hay = `${l.productTitle} ${l.variantName} ${l.sku ?? ""}`.toLowerCase();
      const low = l.onHand <= (l.lowStockThreshold ?? 5);
      return (
        (!q || hay.includes(q)) &&
        (!locationFilter || l.locationId === locationFilter) &&
        (!onlyLow || low)
      );
    });
  }, [levels, term, locationFilter, onlyLow]);

  const lowCount = levels.filter((l) => l.onHand <= (l.lowStockThreshold ?? 5)).length;
  const onHandTotal = levels.reduce((s, l) => s + l.onHand, 0);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Inventory", "ইনভেন্টরি")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Stock is tracked per location. Variant totals are the sum of every location.",
            "প্রতিটি লোকেশন অনুযায়ী স্টক হিসাব হয়। ভ্যারিয়েন্টের মোট স্টক সব লোকেশনের যোগফল।",
          )}
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Locations", "লোকেশন")}</dt>
          <dd className="tabular-nums text-2xl font-semibold">{locations.length}</dd>
        </div>
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Units on hand", "মোট ইউনিট")}</dt>
          <dd className="tabular-nums text-2xl font-semibold">{onHandTotal}</dd>
        </div>
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Low stock", "কম স্টক")}</dt>
          <dd className="tabular-nums text-2xl font-semibold">{lowCount}</dd>
        </div>
      </dl>

      <ErrorFrame message={error ?? (isError ? message(loadError) : null)} />

      <div role="tablist" aria-label="Inventory views" className="flex flex-wrap gap-2">
        {([
          ["levels", t("Stock levels", "স্টক লেভেল")],
          ["locations", t("Locations", "লোকেশন")],
          ["transfers", t("Transfers", "ট্রান্সফার")],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={tab === id ? btnPrimary : btnGhost}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>}

      {tab === "levels" && !isLoading && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Field label={t("Search product, variant or SKU", "পণ্য, ভ্যারিয়েন্ট বা SKU খুঁজুন")}>
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label={t("Location", "লোকেশন")}>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className={inputClass}
              >
                <option value="">{t("All locations", "সব লোকেশন")}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              aria-pressed={onlyLow}
              onClick={() => setOnlyLow((v) => !v)}
              className={onlyLow ? btnPrimary : btnGhost}
            >
              {t("Low stock only", "শুধু কম স্টক")} <span className="tabular-nums">({lowCount})</span>
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("No stock rows match this view.", "এই ভিউতে কোনো স্টক নেই।")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">Per-location stock levels</caption>
                <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3">{t("Product", "পণ্য")}</th>
                    <th scope="col" className="p-3">{t("Variant", "ভ্যারিয়েন্ট")}</th>
                    <th scope="col" className="p-3">{t("Location", "লোকেশন")}</th>
                    <th scope="col" className="p-3">{t("Reserved", "রিজার্ভড")}</th>
                    <th scope="col" className="p-3">{t("On hand", "স্টক")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((l) => {
                    const key = `${l.locationId}:${l.variantId}`;
                    const draft = drafts[key];
                    const low = l.onHand <= (l.lowStockThreshold ?? 5);
                    return (
                      <tr key={key}>
                        <td className="p-3 font-medium">{l.productTitle || "—"}</td>
                        <td className="p-3">
                          {l.variantName}
                          {l.sku && (
                            <span className="ml-2 tabular-nums text-xs text-muted-foreground">
                              {l.sku}
                            </span>
                          )}
                        </td>
                        <td className="p-3">{l.locationName}</td>
                        <td className="p-3 tabular-nums">{l.reserved}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <StatusPill
                              label={low ? t("Low", "কম") : t("OK", "ঠিক আছে")}
                              tone={low ? "warning" : "success"}
                            />
                            <label className="sr-only" htmlFor={`lvl-${key}`}>
                              {`On hand for ${l.productTitle} ${l.variantName} at ${l.locationName}`}
                            </label>
                            <input
                              id={`lvl-${key}`}
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={draft ?? String(l.onHand)}
                              onChange={(e) =>
                                setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              className={`${inputClass} w-24 tabular-nums`}
                            />
                            <button
                              type="button"
                              className={btnGhost}
                              disabled={draft === undefined || levelMutation.isPending}
                              onClick={() =>
                                levelMutation.mutate({
                                  variantId: l.variantId,
                                  locationId: l.locationId,
                                  onHand: Math.max(0, Math.trunc(Number(draft))),
                                })
                              }
                            >
                              {t("Save", "সেভ")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "locations" && !isLoading && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Stock locations</caption>
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3">{t("Name", "নাম")}</th>
                  <th scope="col" className="p-3">{t("Code", "কোড")}</th>
                  <th scope="col" className="p-3">{t("City", "শহর")}</th>
                  <th scope="col" className="p-3">{t("Status", "অবস্থা")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {locations.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 font-medium">{l.name}</td>
                    <td className="p-3 tabular-nums">{l.code}</td>
                    <td className="p-3">{l.city ?? "—"}</td>
                    <td className="p-3">
                      <StatusPill
                        label={
                          l.is_default
                            ? t("Default", "ডিফল্ট")
                            : l.active
                              ? t("Active", "সক্রিয়")
                              : t("Inactive", "নিষ্ক্রিয়")
                        }
                        tone={l.is_default ? "info" : l.active ? "success" : "neutral"}
                      />
                    </td>
                  </tr>
                ))}
                {locations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-sm text-muted-foreground">
                      {t("No locations yet.", "এখনো কোনো লোকেশন নেই।")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form
            className="space-y-3 rounded-fq-lg border border-border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              locationMutation.mutate({
                name: String(form.get("name") ?? ""),
                code: String(form.get("code") ?? ""),
                city: String(form.get("city") ?? ""),
                isDefault: form.get("isDefault") === "on",
              });
              e.currentTarget.reset();
            }}
          >
            <h2 className="text-sm font-semibold">{t("Add location", "লোকেশন যোগ করুন")}</h2>
            <Field label={t("Name", "নাম")}>
              <input name="name" required maxLength={120} className={inputClass} />
            </Field>
            <Field label={t("Code", "কোড")} hint={t("Short code used on labels", "লেবেলে ব্যবহৃত সংক্ষিপ্ত কোড")}>
              <input name="code" required maxLength={40} className={inputClass} />
            </Field>
            <Field label={t("City", "শহর")}>
              <input name="city" maxLength={120} className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isDefault" className="size-4" />
              {t("Make this the default location", "এটিকে ডিফল্ট লোকেশন করুন")}
            </label>
            <button type="submit" className={btnPrimary} disabled={locationMutation.isPending}>
              {t("Save location", "লোকেশন সেভ")}
            </button>
          </form>
        </div>
      )}

      {tab === "transfers" && !isLoading && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Stock transfers</caption>
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3">{t("Reference", "রেফারেন্স")}</th>
                  <th scope="col" className="p-3">{t("From", "থেকে")}</th>
                  <th scope="col" className="p-3">{t("To", "যেখানে")}</th>
                  <th scope="col" className="p-3">{t("Status", "অবস্থা")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.transfers ?? []).map((tr) => (
                  <tr key={tr.id}>
                    <td className="p-3 tabular-nums font-medium">{tr.reference}</td>
                    <td className="p-3">{tr.from_location_id.slice(0, 8)}</td>
                    <td className="p-3">{tr.to_location_id.slice(0, 8)}</td>
                    <td className="p-3">
                      <StatusPill
                        label={tr.status}
                        tone={tr.status === "received" ? "success" : "info"}
                      />
                    </td>
                  </tr>
                ))}
                {(data?.transfers ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-sm text-muted-foreground">
                      {t("No transfers yet.", "এখনো কোনো ট্রান্সফার নেই।")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form
            className="space-y-3 rounded-fq-lg border border-border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              transferMutation.mutate({
                fromLocationId: String(form.get("from") ?? ""),
                toLocationId: String(form.get("to") ?? ""),
                items: [
                  {
                    variantId: String(form.get("variant") ?? ""),
                    quantity: Math.max(1, Number(form.get("qty") ?? 1)),
                  },
                ],
              });
            }}
          >
            <h2 className="text-sm font-semibold">{t("Move stock", "স্টক সরান")}</h2>
            <Field label={t("From", "থেকে")}>
              <select name="from" required className={inputClass}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("To", "যেখানে")}>
              <select name="to" required className={inputClass}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Variant", "ভ্যারিয়েন্ট")}>
              <select name="variant" required className={inputClass}>
                {levels.map((l) => (
                  <option key={`${l.variantId}-${l.locationId}`} value={l.variantId}>
                    {l.productTitle} — {l.variantName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Quantity", "পরিমাণ")}>
              <input
                name="qty"
                type="number"
                min={1}
                defaultValue={1}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            <button type="submit" className={btnPrimary} disabled={transferMutation.isPending}>
              {t("Create transfer", "ট্রান্সফার তৈরি")}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
