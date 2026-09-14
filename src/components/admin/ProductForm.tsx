import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { recordSlugChangeFn } from "@/lib/url-lifecycle.functions";
import { slugify } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import { KIND_META, PRODUCT_KINDS, isShippable, type ProductKind } from "@/lib/catalog";
import { catalogSaveKindFn } from "@/lib/catalog.functions";
import {
  ActionMenu,
  DetailLayout,
  SaveBar,
  SaveIndicator,
  useAutosave,
} from "@/components/console/kit";

export type VariantDraft = {
  id?: string;
  name: string;
  sku: string;
  price: string;
  stock: string;
};

export type ProductDraft = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  status: "draft" | "active" | "archived";
  brand_id: string;
  category_id: string;
  image_url: string;
  product_kind: ProductKind;
  tags: string;
};

export const emptyProduct: ProductDraft = {
  title: "",
  slug: "",
  description: "",
  status: "draft",
  brand_id: "",
  category_id: "",
  image_url: "",
  product_kind: "physical",
  tags: "",
};

export function toMinor(value: string) {
  const n = Number.parseFloat(value.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function fromMinor(minor: number) {
  return (minor / 100).toFixed(2);
}

type Option = { id: string; name: string };

export function ProductForm({
  merchantId,
  initialProduct,
  initialVariants,
  brands,
  categories,
}: {
  merchantId: string;
  initialProduct: ProductDraft;
  initialVariants: VariantDraft[];
  brands: Option[];
  categories: Option[];
}) {
  const navigate = useNavigate();
  const { t } = useLang();
  const [product, setProduct] = useState<ProductDraft>(initialProduct);
  const [variants, setVariants] = useState<VariantDraft[]>(
    initialVariants.length
      ? initialVariants
      : [{ name: "Default", sku: "", price: "0.00", stock: "0" }],
  );
  const [busy, setBusy] = useState(false);
  const saveKind = useServerFn(catalogSaveKindFn);
  const kind = product.product_kind;
  const [digital, setDigital] = useState({ fileName: "", storagePath: "", maxDownloads: "5", expiryHours: "720" });
  const [service, setService] = useState({
    durationMinutes: "60",
    bufferMinutes: "0",
    capacityPerSlot: "1",
    locationKind: "onsite" as "onsite" | "remote" | "customer_address",
    advanceBookingDays: "30",
    cancellationHours: "24",
  });
  const [plan, setPlan] = useState({
    intervalUnit: "month" as "day" | "week" | "month" | "year",
    intervalCount: "1",
    trialDays: "0",
    minimumCycles: "1",
  });

  function patch(key: keyof ProductDraft, value: string) {
    setProduct((p) => ({ ...p, [key]: value }));
  }

  function patchVariant(index: number, key: keyof VariantDraft, value: string) {
    setVariants((list) =>
      list.map((v, i) => (i === index ? { ...v, [key]: value } : v)),
    );
  }

  const initialSlug = useRef(product.slug);

  // Validation lives next to its field — never a top-of-page error dump.
  const errors = {
    title: product.title.trim() ? null : "Give the product a title.",
    variants: variants.some((v) => v.name.trim()) ? null : "Add at least one variant.",
  };
  const invalid = Object.values(errors).some(Boolean);

  // Dirty tracking drives the save bar and the autosave clock.
  const snapshot = useRef(JSON.stringify({ p: initialProduct, v: initialVariants }));
  const current = JSON.stringify({ p: product, v: variants });
  const dirty = current !== snapshot.current;

  async function save(e?: React.FormEvent, opts?: { redirect?: boolean }) {
    e?.preventDefault();
    if (invalid) throw new Error("Fix the highlighted fields first.");
    const redirect = opts?.redirect ?? true;
    setBusy(true);
    try {

      const payload = {
        merchant_id: merchantId,
        title: product.title,
        slug: product.slug ? slugify(product.slug) : slugify(product.title),
        description: product.description || null,
        status: product.status,
        brand_id: product.brand_id || null,
        category_id: product.category_id || null,
        image_url: product.image_url || null,
        product_kind: product.product_kind,
        requires_shipping: isShippable(product.product_kind),
        tags: product.tags
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
      };

      let productId = product.id;
      if (productId) {
        // A renamed slug must keep the old URL alive as a 301 — the previous
        // link is already in search results and in customers' chat threads.
        if (initialSlug.current && initialSlug.current !== payload.slug) {
          void recordSlugChangeFn({
            data: { entityType: "product", oldSlug: initialSlug.current, newSlug: payload.slug },
          }).catch(() => undefined);
          initialSlug.current = payload.slug;
        }
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", productId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        productId = data.id;
      }

      const rows = variants
        .filter((v) => v.name.trim().length > 0)
        .map((v, index) => ({
          id: v.id,
          merchant_id: merchantId,
          product_id: productId!,
          name: v.name,
          sku: v.sku || null,
          price_amount_minor_int: toMinor(v.price),
          stock_quantity: Number.parseInt(v.stock, 10) || 0,
          position: index,
        }));

      const keepIds = rows.filter((r) => r.id).map((r) => r.id as string);
      let removal = supabase
        .from("product_variants")
        .delete()
        .eq("product_id", productId!);
      if (keepIds.length) removal = removal.not("id", "in", `(${keepIds.join(",")})`);
      const { error: delError } = await removal;
      if (delError) throw delError;

      const { error: upsertError } = await supabase
        .from("product_variants")
        .upsert(
          rows.map((r) => (r.id ? r : { ...r, id: undefined })),
          { defaultToNull: false },
        );
      if (upsertError) throw upsertError;

      // Kind-specific configuration is written server-side so shipping/stock
      // coherence and role checks are never decided in the browser.
      if (kind !== "physical" && productId) {
        const { data: saved } = await supabase
          .from("product_variants")
          .select("id")
          .eq("product_id", productId)
          .order("position")
          .limit(1);
        await saveKind({
          data: {
            merchantId,
            productId,
            kind,
            digital:
              kind === "digital" && digital.fileName && digital.storagePath
                ? {
                    fileName: digital.fileName,
                    storagePath: digital.storagePath,
                    maxDownloads: Number.parseInt(digital.maxDownloads, 10) || 5,
                    expiryHours: Number.parseInt(digital.expiryHours, 10) || 720,
                  }
                : null,
            service:
              kind === "service"
                ? {
                    durationMinutes: Number.parseInt(service.durationMinutes, 10) || 60,
                    bufferMinutes: Number.parseInt(service.bufferMinutes, 10) || 0,
                    capacityPerSlot: Number.parseInt(service.capacityPerSlot, 10) || 1,
                    locationKind: service.locationKind,
                    advanceBookingDays: Number.parseInt(service.advanceBookingDays, 10) || 30,
                    cancellationHours: Number.parseInt(service.cancellationHours, 10) || 24,
                  }
                : null,
            subscription:
              kind === "subscription" && saved?.[0]?.id
                ? {
                    variantId: saved[0].id,
                    intervalUnit: plan.intervalUnit,
                    intervalCount: Number.parseInt(plan.intervalCount, 10) || 1,
                    trialDays: Number.parseInt(plan.trialDays, 10) || 0,
                    minimumCycles: Number.parseInt(plan.minimumCycles, 10) || 1,
                  }
                : null,
          },
        });
      }

      snapshot.current = current;
      if (redirect) {
        toast.success("Product saved");
        navigate({ to: "/admin/products" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save product";
      if (message.includes("plan_limit_products")) {
        toast.error(message.replace(/^.*plan_limit_products:\s*/, ""), {
          action: { label: "Upgrade", onClick: () => navigate({ to: "/admin/plans" }) },
        });
      } else {
        toast.error(message);
      }
      throw err;
    } finally {
      setBusy(false);
    }
  }

  const autosave = useAutosave({
    dirty,
    // Autosave only edits an existing record; creating one stays deliberate.
    enabled: Boolean(product.id) && !invalid,
    save: () => save(undefined, { redirect: false }),
  });

  return (
    <form
      onSubmit={(e) => {
        void save(e).catch(() => undefined);
      }}
    >
      <DetailLayout
        side={
          <div className="space-y-4 rounded-fq-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <SaveIndicator state={autosave.state} />
              <ActionMenu
                actions={[
                  {
                    id: "discard",
                    label: "Discard changes",
                    disabled: !dirty,
                    onSelect: () => {
                      setProduct(initialProduct);
                      setVariants(
                        initialVariants.length
                          ? initialVariants
                          : [{ name: "Default", sku: "", price: "0.00", stock: "0" }],
                      );
                    },
                  },
                  {
                    id: "back",
                    label: "Back to products",
                    onSelect: () => navigate({ to: "/admin/products" }),
                  },
                ]}
              />
            </div>
            <SelectField
              label="Status"
              value={product.status}
              onChange={(v) => patch("status", v)}
              options={[
                { id: "draft", name: "Draft" },
                { id: "active", name: "Active" },
                { id: "archived", name: "Archived" },
              ]}
            />
            <SelectField
              label="Brand"
              value={product.brand_id}
              onChange={(v) => patch("brand_id", v)}
              options={[{ id: "", name: "— none —" }, ...brands]}
            />
            <TextField
              label="Tags (comma separated)"
              value={product.tags}
              onChange={(v) => patch("tags", v)}
              placeholder="handloom, shari"
            />
            <SelectField
              label="Category"
              value={product.category_id}
              onChange={(v) => patch("category_id", v)}
              options={[{ id: "", name: "— none —" }, ...categories]}
            />

          </div>
        }
      >
      <section className="space-y-4 rounded-fq-lg border border-border bg-card p-5">

        <TextField
          label="Title"
          value={product.title}
          onChange={(v) => patch("title", v)}
          error={errors.title}
          required
        />
        <TextField
          label="Slug"
          value={product.slug}
          onChange={(v) => patch("slug", v)}
          placeholder="auto from title"
        />
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-foreground">Description</span>
          <textarea
            rows={5}
            value={product.description}
            onChange={(e) => patch("description", e.target.value)}
            className="w-full rounded-fq-md border border-border bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </label>
        <TextField
          label="Image URL"
          value={product.image_url}
          onChange={(v) => patch("image_url", v)}
        />

        <div className="rounded-fq-md border border-border p-3">
          <SelectField
            label="Product kind"
            value={kind}
            onChange={(v) => setProduct((p) => ({ ...p, product_kind: v as ProductKind }))}
            options={PRODUCT_KINDS.map((k) => ({ id: k, name: t(KIND_META[k].en, KIND_META[k].bn) }))}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t(KIND_META[kind].hint.en, KIND_META[kind].hint.bn)}
          </p>

          {kind === "digital" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField label="File name" value={digital.fileName} onChange={(v) => setDigital({ ...digital, fileName: v })} />
              <TextField label="Storage path" value={digital.storagePath} onChange={(v) => setDigital({ ...digital, storagePath: v })} />
              <TextField label="Max downloads" value={digital.maxDownloads} inputMode="numeric" money onChange={(v) => setDigital({ ...digital, maxDownloads: v })} />
              <TextField label="Link valid (hours)" value={digital.expiryHours} inputMode="numeric" money onChange={(v) => setDigital({ ...digital, expiryHours: v })} />
            </div>
          ) : null}

          {kind === "service" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <TextField label="Duration (min)" value={service.durationMinutes} inputMode="numeric" money onChange={(v) => setService({ ...service, durationMinutes: v })} />
              <TextField label="Buffer (min)" value={service.bufferMinutes} inputMode="numeric" money onChange={(v) => setService({ ...service, bufferMinutes: v })} />
              <TextField label="Capacity per slot" value={service.capacityPerSlot} inputMode="numeric" money onChange={(v) => setService({ ...service, capacityPerSlot: v })} />
              <SelectField
                label="Location"
                value={service.locationKind}
                onChange={(v) => setService({ ...service, locationKind: v as typeof service.locationKind })}
                options={[
                  { id: "onsite", name: "On site" },
                  { id: "remote", name: "Remote" },
                  { id: "customer_address", name: "Customer address" },
                ]}
              />
              <TextField label="Book ahead (days)" value={service.advanceBookingDays} inputMode="numeric" money onChange={(v) => setService({ ...service, advanceBookingDays: v })} />
              <TextField label="Free cancel (hours)" value={service.cancellationHours} inputMode="numeric" money onChange={(v) => setService({ ...service, cancellationHours: v })} />
            </div>
          ) : null}

          {kind === "subscription" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <SelectField
                label="Interval"
                value={plan.intervalUnit}
                onChange={(v) => setPlan({ ...plan, intervalUnit: v as typeof plan.intervalUnit })}
                options={[
                  { id: "day", name: "Day" },
                  { id: "week", name: "Week" },
                  { id: "month", name: "Month" },
                  { id: "year", name: "Year" },
                ]}
              />
              <TextField label="Every" value={plan.intervalCount} inputMode="numeric" money onChange={(v) => setPlan({ ...plan, intervalCount: v })} />
              <TextField label="Trial days" value={plan.trialDays} inputMode="numeric" money onChange={(v) => setPlan({ ...plan, trialDays: v })} />
              <TextField label="Minimum cycles" value={plan.minimumCycles} inputMode="numeric" money onChange={(v) => setPlan({ ...plan, minimumCycles: v })} />
            </div>
          ) : null}
        </div>

        <div className="pt-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bangla-display text-sm font-semibold">
              {t("Variants & stock", "ভ্যারিয়েন্ট ও স্টক")}
            </h2>
            <button
              type="button"
              onClick={() =>
                setVariants((l) => [
                  ...l,
                  { name: "", sku: "", price: "0.00", stock: "0" },
                ])
              }
              className="inline-flex min-h-9 items-center gap-1.5 rounded-fq-md border border-border px-3 text-sm hover:bg-muted"
            >
              <Plus className="size-4" aria-hidden /> Add variant
            </button>
          </div>
          {errors.variants ? (
            <p className="text-xs text-[var(--fq-danger)]">{errors.variants}</p>
          ) : null}
          <div className="space-y-3">
            {variants.map((v, i) => (
              <div
                key={v.id ?? `new-${i}`}
                className="grid gap-3 rounded-fq-md border border-border p-3 sm:grid-cols-[1.2fr_1fr_0.9fr_0.7fr_auto]"
              >
                <TextField
                  label="Name"
                  value={v.name}
                  onChange={(val) => patchVariant(i, "name", val)}
                />
                <TextField
                  label="SKU"
                  value={v.sku}
                  onChange={(val) => patchVariant(i, "sku", val)}
                />
                <TextField
                  label="Price (BDT)"
                  value={v.price}
                  inputMode="decimal"
                  money
                  onChange={(val) => patchVariant(i, "price", val)}
                />
                <TextField
                  label="Stock"
                  value={v.stock}
                  inputMode="numeric"
                  money
                  onChange={(val) => patchVariant(i, "stock", val)}
                />
                <div className="flex items-end">
                  <button
                    type="button"
                    aria-label={`Remove variant ${i + 1}`}
                    onClick={() => setVariants((l) => l.filter((_, idx) => idx !== i))}
                    className="grid min-h-11 w-11 place-items-center rounded-fq-md text-[hsl(var(--rickshaw-red))] hover:bg-muted"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      </DetailLayout>
      <SaveBar
        state={autosave.state}
        onSave={() => {
          void save(undefined, { redirect: false }).catch(() => undefined);
        }}
        onDiscard={() => {
          setProduct(initialProduct);
          setVariants(
            initialVariants.length
              ? initialVariants
              : [{ name: "Default", sku: "", price: "0.00", stock: "0" }],
          );
        }}
        saveLabel={product.id ? "Save" : "Create product"}
      >
        {product.id ? null : (
          <button
            type="submit"
            disabled={busy || invalid}
            className="min-h-9 rounded-fq-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-60"
          >
            Save &amp; close
          </button>
        )}
      </SaveBar>
    </form>
  );

}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  inputMode,
  money,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  inputMode?: "decimal" | "numeric";
  money?: boolean;
  error?: string | null;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-foreground">{label}</span>
      <input
        value={value}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          money ? "money" : ""
        } ${error ? "border-[var(--fq-danger)]" : ""}`}
        aria-invalid={error ? true : undefined}
      />
      {error ? <span className="mt-1 block text-xs text-[var(--fq-danger)]">{error}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
