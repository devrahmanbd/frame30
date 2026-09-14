import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant, slugify } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import {
  COLLECTION_FIELDS,
  COLLECTION_OPS,
  PRODUCT_KINDS,
  describeRules,
  normalizeRules,
  type CollectionCondition,
  type CollectionField,
  type CollectionRules,
} from "@/lib/catalog";
import { catalogPreviewCollectionFn, catalogSaveRulesFn } from "@/lib/catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/collections")({
  head: () => ({
    meta: [
      { title: "Collections — Framique Admin" },
      {
        name: "description",
        content: "Group products into storefront collections and control what shoppers browse.",
      },
      { property: "og:title", content: "Collection management" },
      {
        property: "og:description",
        content: "Create collections and assign products for your Bangladeshi storefront.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CollectionsPage,
});

function CollectionsPage() {
  const { t } = useLang();
  const { data: merchant } = useMerchant();
  const qc = useQueryClient();
  const merchantId = merchant?.id;
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: collections, isLoading } = useQuery({
    queryKey: ["collections", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, name, slug, is_published, position, is_smart, rules, collection_products(product_id)")
        .eq("merchant_id", merchantId!)
        .order("position");
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, status")
        .eq("merchant_id", merchantId!)
        .order("title");
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["collections", merchantId] });

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name required");
      const { error } = await supabase.from("collections").insert({
        merchant_id: merchantId!,
        name: trimmed,
        slug: slugify(trimmed),
        position: collections?.length ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      invalidate();
    },
  });

  const togglePublished = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await supabase.from("collections").update({ is_published: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("collections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelected(null);
      invalidate();
    },
  });

  const toggleProduct = useMutation({
    mutationFn: async ({
      collectionId,
      productId,
      member,
    }: {
      collectionId: string;
      productId: string;
      member: boolean;
    }) => {
      if (member) {
        const { error } = await supabase
          .from("collection_products")
          .delete()
          .eq("collection_id", collectionId)
          .eq("product_id", productId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("collection_products").insert({
          merchant_id: merchantId!,
          collection_id: collectionId,
          product_id: productId,
        });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const active = collections?.find((c) => c.id === selected) ?? null;
  const memberIds = new Set((active?.collection_products ?? []).map((cp) => cp.product_id));

  return (
    <section>
      <h1 className="font-bangla-display text-xl font-semibold">{t("Collections", "কালেকশন")}</h1>
      <p className="text-sm text-muted-foreground">Group products into storefront collections.</p>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="min-w-56 flex-1">
          <label htmlFor="collection-name" className="block text-xs font-medium text-muted-foreground">
            {t("New collection", "নতুন কালেকশন")}
          </label>
          <input
            id="collection-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
        <button
          type="submit"
          disabled={create.isPending}
          className="min-h-11 rounded-fq-md bg-bd-teal-700 px-4 text-sm font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("Add", "যোগ করুন")}
        </button>
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-fq-lg border border-border bg-card">
          <h2 className="border-b border-border p-3 text-sm font-semibold">Collections</h2>
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading…</p>
          ) : !collections?.length ? (
            <p className="p-3 text-sm text-muted-foreground">No collections yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {collections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 p-3">
                  <button
                    type="button"
                    aria-pressed={selected === c.id}
                    onClick={() => setSelected(c.id)}
                    className={`min-h-9 flex-1 rounded-fq-md px-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      selected === c.id ? "bg-info-soft font-medium text-info-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {selected === c.id ? "✓ " : ""}
                    {c.name}
                    <span className="money ml-2 text-xs text-muted-foreground">
                      ({c.collection_products?.length ?? 0})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePublished.mutate({ id: c.id, next: !c.is_published })}
                    className={`min-h-9 rounded-full px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      c.is_published
                        ? "bg-success-soft text-success-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.is_published ? t("Published", "প্রকাশিত") : t("Hidden", "খসড়া")}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(c.id)}
                    className="min-h-9 rounded-fq-md border border-border px-3 text-xs font-medium text-danger-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {t("Delete", "মুছুন")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-fq-lg border border-border bg-card">
          <h2 className="border-b border-border p-3 text-sm font-semibold">
            {active ? `Products in “${active.name}”` : "Select a collection"}
          </h2>
          {!active ? (
            <p className="p-3 text-sm text-muted-foreground">
              Pick a collection to assign products.
            </p>
          ) : !products?.length ? (
            <p className="p-3 text-sm text-muted-foreground">No products in your catalog yet.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {products.map((p) => {
                const member = memberIds.has(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 p-3">
                    <input
                      id={`cp-${p.id}`}
                      type="checkbox"
                      checked={member}
                      onChange={() =>
                        toggleProduct.mutate({
                          collectionId: active.id,
                          productId: p.id,
                          member,
                        })
                      }
                      className="size-4 accent-bd-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    <label htmlFor={`cp-${p.id}`} className="flex-1 text-sm">
                      {p.title}
                      <span className="ml-2 text-xs text-muted-foreground">{p.status}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {active ? (
        <SmartRules
          key={active.id}
          merchantId={merchantId!}
          collectionId={active.id}
          collectionName={active.name}
          initialSmart={active.is_smart}
          initialRules={normalizeRules(active.rules)}
          onSaved={invalidate}
        />
      ) : null}
    </section>
  );
}

const field =
  "min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Smart-collection rule builder. The browser only composes the rule set; the
 * database validates its shape and resolves membership, so a hand-crafted
 * payload cannot widen what a shopper sees.
 */
function SmartRules({
  merchantId,
  collectionId,
  collectionName,
  initialSmart,
  initialRules,
  onSaved,
}: {
  merchantId: string;
  collectionId: string;
  collectionName: string;
  initialSmart: boolean;
  initialRules: CollectionRules;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const saveRules = useServerFn(catalogSaveRulesFn);
  const previewFn = useServerFn(catalogPreviewCollectionFn);
  const [isSmart, setIsSmart] = useState(initialSmart);
  const [rules, setRules] = useState<CollectionRules>(initialRules);

  const save = useMutation({
    mutationFn: () => saveRules({ data: { merchantId, collectionId, isSmart, rules } }),
    onSuccess: () => {
      toast.success(t("Rules saved", "রুল সেভ হয়েছে"));
      onSaved();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save rules"),
  });

  const preview = useMutation({
    mutationFn: () => previewFn({ data: { merchantId, collectionId } }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Preview unavailable"),
  });

  function patchCondition(index: number, next: Partial<CollectionCondition>) {
    setRules((r) => ({
      ...r,
      conditions: r.conditions.map((c, i) => (i === index ? { ...c, ...next } : c)),
    }));
  }

  return (
    <section className="mt-6 rounded-fq-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bangla-display text-sm font-semibold">
          {t("Smart rules", "স্মার্ট রুল")} — {collectionName}
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isSmart}
            onChange={(e) => setIsSmart(e.target.checked)}
            className="size-4 accent-bd-teal-700"
          />
          {t("Automatic membership", "স্বয়ংক্রিয় সদস্যপদ")}
        </label>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{describeRules(rules)}</p>

      {isSmart ? (
        <div className="mt-4 space-y-3">
          <label className="block max-w-40 text-sm">
            <span className="mb-1.5 block font-medium">{t("Match", "মিল")}</span>
            <select
              value={rules.match}
              onChange={(e) => setRules({ ...rules, match: e.target.value as "all" | "any" })}
              className={field}
            >
              <option value="all">{t("All conditions", "সব শর্ত")}</option>
              <option value="any">{t("Any condition", "যেকোনো শর্ত")}</option>
            </select>
          </label>

          {rules.conditions.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-fq-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <select
                aria-label={`Condition ${i + 1} field`}
                value={c.field}
                onChange={(e) => {
                  const nextField = e.target.value as CollectionField;
                  patchCondition(i, { field: nextField, op: COLLECTION_OPS[nextField][0]!, value: "", key: "" });
                }}
                className={field}
              >
                {COLLECTION_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Condition ${i + 1} operator`}
                value={c.op}
                onChange={(e) => patchCondition(i, { op: e.target.value })}
                className={field}
              >
                {COLLECTION_OPS[c.field].map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              {c.field === "kind" ? (
                <select
                  aria-label={`Condition ${i + 1} value`}
                  value={c.value ?? ""}
                  onChange={(e) => patchCondition(i, { value: e.target.value })}
                  className={field}
                >
                  <option value="">—</option>
                  {PRODUCT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              ) : c.field === "metafield" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    aria-label={`Condition ${i + 1} metafield key`}
                    value={c.key ?? ""}
                    placeholder="key"
                    onChange={(e) => patchCondition(i, { key: e.target.value })}
                    className={field}
                  />
                  <input
                    aria-label={`Condition ${i + 1} value`}
                    value={c.value ?? ""}
                    onChange={(e) => patchCondition(i, { value: e.target.value })}
                    className={field}
                  />
                </div>
              ) : (
                <input
                  aria-label={`Condition ${i + 1} value`}
                  value={c.value ?? ""}
                  placeholder={c.field === "price" ? "minor units, e.g. 485000" : ""}
                  onChange={(e) => patchCondition(i, { value: e.target.value })}
                  className={`${field} ${c.field === "price" || c.field === "stock" ? "money" : ""}`}
                />
              )}
              <button
                type="button"
                onClick={() =>
                  setRules((r) => ({ ...r, conditions: r.conditions.filter((_, idx) => idx !== i) }))
                }
                className="min-h-11 rounded-fq-md border border-border px-3 text-xs font-medium text-danger-foreground"
              >
                {t("Remove", "মুছুন")}
              </button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={rules.conditions.length >= 20}
              onClick={() =>
                setRules((r) => ({
                  ...r,
                  conditions: [...r.conditions, { field: "title", op: "contains", value: "" }],
                }))
              }
              className="min-h-11 rounded-fq-md border border-border px-3 text-sm disabled:opacity-50"
            >
              {t("Add condition", "শর্ত যোগ করুন")}
            </button>
            <button
              type="button"
              disabled={preview.isPending}
              onClick={() => preview.mutate()}
              className="min-h-11 rounded-fq-md border border-border px-3 text-sm disabled:opacity-50"
            >
              {preview.isPending ? t("Resolving…", "হিসাব হচ্ছে…") : t("Preview matches", "মিল দেখুন")}
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="min-h-11 rounded-fq-md bg-bd-teal-700 px-4 text-sm font-semibold text-background disabled:opacity-50"
            >
              {t("Save rules", "রুল সেভ")}
            </button>
          </div>

          {preview.data ? (
            <div className="rounded-fq-md border border-border p-3 text-sm">
              <p className="font-medium">
                {preview.data.count} {t("products match", "পণ্য মিলেছে")}
              </p>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {preview.data.products.slice(0, 10).map((p) => (
                  <li key={p.id}>{p.title}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "Manual collection: membership comes from the product checklist above.",
            "ম্যানুয়াল কালেকশন: উপরের চেকলিস্ট থেকে সদস্যপদ ঠিক হয়।",
          )}
        </p>
      )}
    </section>
  );
}
