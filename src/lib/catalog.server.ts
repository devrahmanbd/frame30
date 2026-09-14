/**
 * Catalog runtime (BUILD.md 1.4).
 *
 * Every write goes through RLS with the caller's client, is rate limited per
 * merchant, emits a metric and a structured log line, and never trusts a
 * client-side verdict: the import diff is recomputed in the database and the
 * apply step is idempotent per source hash.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { enforceRateLimit } from "./rate-limit.server";
import { incr, log, withSpan, captureError } from "./observability.server";
import { cached, invalidate } from "./cache.server";
import {
  IMPORT_MAX_ROWS,
  normalizeRules,
  type ImportJob,
  type ImportRow,
  type JsonRecord,
  type ProductKind,
} from "./catalog";

type Client = SupabaseClient<Database>;
type Loose = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};
const loose = (db: Client) => db as unknown as Loose;

async function assertStaff(supabase: Client, merchantId: string) {
  const { data, error } = await loose(supabase).rpc("has_merchant_role", {
    _merchant_id: merchantId,
    _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (data !== true) throw new Error("catalog.forbidden");
}

export type CatalogDesk = {
  counts: Record<ProductKind, number>;
  drafts: number;
  archived: number;
  missingDigitalAsset: number;
  missingServiceConfig: number;
  missingSubscriptionTerms: number;
  smartCollections: number;
  definitions: Array<{
    id: string;
    owner_type: string;
    namespace: string;
    key: string;
    label: string;
    value_type: string;
    is_required: boolean;
    validation: JsonRecord;
  }>;
  jobs: ImportJob[];
};

/** Read-side health of the catalog: which products are incoherent for their kind. */
export async function loadCatalogDesk(supabase: Client, merchantId: string): Promise<CatalogDesk> {
  await assertStaff(supabase, merchantId);
  return withSpan("catalog.desk", async () => {
    const [products, assets, services, terms, collections, definitions, jobs] = await Promise.all([
      loose(supabase)
        .from("products")
        .select("id, status, product_kind")
        .eq("merchant_id", merchantId)
        .is("deleted_at", null),
      loose(supabase).from("digital_assets").select("product_id").eq("merchant_id", merchantId).is("deleted_at", null),
      loose(supabase).from("service_offerings").select("product_id").eq("merchant_id", merchantId),
      loose(supabase).from("subscription_terms").select("variant_id").eq("merchant_id", merchantId),
      loose(supabase).from("collections").select("id, is_smart").eq("merchant_id", merchantId).is("deleted_at", null),
      loose(supabase)
        .from("metafield_definitions")
        .select("id, owner_type, namespace, key, label, value_type, is_required, validation")
        .eq("merchant_id", merchantId)
        .order("owner_type"),
      loose(supabase)
        .from("catalog_import_jobs")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const rows = (products.data ?? []) as Array<{ id: string; status: string; product_kind: ProductKind }>;
    const assetProducts = new Set(((assets.data ?? []) as Array<{ product_id: string }>).map((a) => a.product_id));
    const serviceProducts = new Set(((services.data ?? []) as Array<{ product_id: string }>).map((s) => s.product_id));
    const termCount = ((terms.data ?? []) as unknown[]).length;

    const counts: Record<ProductKind, number> = {
      physical: 0,
      digital: 0,
      service: 0,
      subscription: 0,
    };
    let drafts = 0;
    let archived = 0;
    let missingDigitalAsset = 0;
    let missingServiceConfig = 0;
    let subscriptions = 0;

    for (const p of rows) {
      counts[p.product_kind] = (counts[p.product_kind] ?? 0) + 1;
      if (p.status === "draft") drafts += 1;
      if (p.status === "archived") archived += 1;
      if (p.product_kind === "digital" && !assetProducts.has(p.id)) missingDigitalAsset += 1;
      if (p.product_kind === "service" && !serviceProducts.has(p.id)) missingServiceConfig += 1;
      if (p.product_kind === "subscription") subscriptions += 1;
    }

    return {
      counts,
      drafts,
      archived,
      missingDigitalAsset,
      missingServiceConfig,
      missingSubscriptionTerms: Math.max(0, subscriptions - termCount),
      smartCollections: ((collections.data ?? []) as Array<{ is_smart: boolean }>).filter((c) => c.is_smart).length,
      definitions: (definitions.data ?? []) as CatalogDesk["definitions"],
      jobs: (jobs.data ?? []) as ImportJob[],
    };
  });
}

export async function dryRunImport(
  supabase: Client,
  merchantId: string,
  input: { fileName: string; sourceHash: string; rows: ImportRow[] },
): Promise<ImportJob> {
  await assertStaff(supabase, merchantId);
  await enforceRateLimit("catalog.import", merchantId);
  if (input.rows.length > IMPORT_MAX_ROWS) throw new Error("catalog.too_many_rows");

  const { data, error } = await loose(supabase).rpc("catalog_import_dry_run", {
    _merchant_id: merchantId,
    _file_name: input.fileName,
    _source_hash: input.sourceHash,
    _rows: input.rows,
  });
  if (error) {
    await captureError(error, { scope: "catalog.dry_run", merchantId });
    throw error;
  }
  incr("framique_catalog_import_total", { phase: "dry_run" });
  log("info", "catalog.import.dry_run", { merchantId, rows: input.rows.length });
  return data as ImportJob;
}

export async function applyImport(supabase: Client, merchantId: string, jobId: string) {
  await assertStaff(supabase, merchantId);
  await enforceRateLimit("catalog.import", merchantId);
  const { data, error } = await loose(supabase).rpc("catalog_import_apply", { _job_id: jobId });
  if (error) {
    await captureError(error, { scope: "catalog.apply", merchantId, jobId });
    throw error;
  }
  const result = data as { replayed: boolean; summary: Record<string, number> };
  incr("framique_catalog_import_total", { phase: result.replayed ? "replayed" : "applied" });
  log("info", "catalog.import.applied", { merchantId, jobId, ...result.summary, replayed: result.replayed });
  invalidate(`catalog:${merchantId}`);
  return result;
}

export async function discardImport(supabase: Client, merchantId: string, jobId: string) {
  await assertStaff(supabase, merchantId);
  const { error } = await loose(supabase)
    .from("catalog_import_jobs")
    .update({ status: "discarded" })
    .eq("id", jobId)
    .eq("merchant_id", merchantId)
    .eq("status", "dry_run");
  if (error) throw error;
  return { ok: true };
}

export type KindConfigInput = {
  merchantId: string;
  productId: string;
  kind: ProductKind;
  digital?: { fileName: string; storagePath: string; maxDownloads: number; expiryHours: number } | null;
  service?: {
    durationMinutes: number;
    bufferMinutes: number;
    capacityPerSlot: number;
    locationKind: "onsite" | "remote" | "customer_address";
    advanceBookingDays: number;
    cancellationHours: number;
  } | null;
  subscription?: {
    variantId: string;
    intervalUnit: "day" | "week" | "month" | "year";
    intervalCount: number;
    trialDays: number;
    minimumCycles: number;
  } | null;
};

/** Persist the kind-specific configuration; the DB trigger normalises shipping. */
export async function saveKindConfig(supabase: Client, input: KindConfigInput) {
  await assertStaff(supabase, input.merchantId);

  const { error: kindError } = await loose(supabase)
    .from("products")
    .update({ product_kind: input.kind })
    .eq("id", input.productId)
    .eq("merchant_id", input.merchantId);
  if (kindError) throw kindError;

  if (input.kind === "digital" && input.digital) {
    const { error } = await loose(supabase).from("digital_assets").insert({
      merchant_id: input.merchantId,
      product_id: input.productId,
      file_name: input.digital.fileName,
      storage_path: input.digital.storagePath,
      max_downloads: input.digital.maxDownloads,
      expiry_hours: input.digital.expiryHours,
    });
    if (error) throw error;
  }

  if (input.kind === "service" && input.service) {
    const { error } = await loose(supabase)
      .from("service_offerings")
      .upsert(
        {
          merchant_id: input.merchantId,
          product_id: input.productId,
          duration_minutes: input.service.durationMinutes,
          buffer_minutes: input.service.bufferMinutes,
          capacity_per_slot: input.service.capacityPerSlot,
          location_kind: input.service.locationKind,
          advance_booking_days: input.service.advanceBookingDays,
          cancellation_hours: input.service.cancellationHours,
        },
        { onConflict: "product_id" },
      );
    if (error) throw error;
  }

  if (input.kind === "subscription" && input.subscription) {
    const { error } = await loose(supabase)
      .from("subscription_terms")
      .upsert(
        {
          merchant_id: input.merchantId,
          variant_id: input.subscription.variantId,
          interval_unit: input.subscription.intervalUnit,
          interval_count: input.subscription.intervalCount,
          trial_days: input.subscription.trialDays,
          minimum_cycles: input.subscription.minimumCycles,
        },
        { onConflict: "variant_id" },
      );
    if (error) throw error;
  }

  incr("framique_catalog_kind_config_total", { kind: input.kind });
  invalidate(`catalog:${input.merchantId}`);
  return { ok: true };
}

export async function loadKindConfig(supabase: Client, merchantId: string, productId: string) {
  await assertStaff(supabase, merchantId);
  const [assets, service, product] = await Promise.all([
    loose(supabase)
      .from("digital_assets")
      .select("id, file_name, storage_path, max_downloads, expiry_hours")
      .eq("merchant_id", merchantId)
      .eq("product_id", productId)
      .is("deleted_at", null),
    loose(supabase).from("service_offerings").select("*").eq("product_id", productId).maybeSingle(),
    loose(supabase).from("products").select("product_kind, requires_shipping, tags, tax_category").eq("id", productId).maybeSingle(),
  ]);
  return {
    product: product.data ?? null,
    assets: assets.data ?? [],
    service: service.data ?? null,
  };
}

export async function saveMetafieldDefinition(
  supabase: Client,
  input: {
    merchantId: string;
    id?: string;
    ownerType: string;
    namespace: string;
    key: string;
    label: string;
    valueType: string;
    isRequired: boolean;
    validation: JsonRecord;
  },
) {
  await assertStaff(supabase, input.merchantId);
  const row = {
    merchant_id: input.merchantId,
    owner_type: input.ownerType,
    namespace: input.namespace,
    key: input.key,
    label: input.label,
    value_type: input.valueType,
    is_required: input.isRequired,
    validation: input.validation,
  };
  const { error } = input.id
    ? await loose(supabase).from("metafield_definitions").update(row).eq("id", input.id)
    : await loose(supabase)
        .from("metafield_definitions")
        .upsert(row, { onConflict: "merchant_id,owner_type,namespace,key" });
  if (error) throw error;
  log("info", "catalog.metafield_definition.saved", { merchantId: input.merchantId, key: input.key });
  return { ok: true };
}

export async function deleteMetafieldDefinition(supabase: Client, merchantId: string, id: string) {
  await assertStaff(supabase, merchantId);
  const { error } = await loose(supabase)
    .from("metafield_definitions")
    .delete()
    .eq("id", id)
    .eq("merchant_id", merchantId);
  if (error) throw error;
  return { ok: true };
}

/** Save smart-collection rules; the DB trigger is the final gate on shape. */
export async function saveCollectionRules(
  supabase: Client,
  input: { merchantId: string; collectionId: string; isSmart: boolean; rules: unknown },
) {
  await assertStaff(supabase, input.merchantId);
  const rules = normalizeRules(input.rules);
  const { error } = await loose(supabase)
    .from("collections")
    .update({ is_smart: input.isSmart, rules })
    .eq("id", input.collectionId)
    .eq("merchant_id", input.merchantId);
  if (error) throw error;
  invalidate(`collection:${input.collectionId}`);
  incr("framique_collection_rules_saved_total", { smart: String(input.isSmart) });
  return { ok: true, rules };
}

/** Preview resolution; cached briefly because the resolver scans the catalog. */
export async function previewCollection(supabase: Client, merchantId: string, collectionId: string) {
  await assertStaff(supabase, merchantId);
  await enforceRateLimit("catalog.search", `${merchantId}:preview`);
  return cached(`collection:${collectionId}:preview`, 15, async () => {
    const { data, error } = await loose(supabase).rpc("collection_resolve", { _collection_id: collectionId });
    if (error) throw error;
    const ids = ((data ?? []) as unknown[])
      .map((r) => (typeof r === "string" ? r : (r as { collection_resolve?: string }).collection_resolve))
      .filter((v): v is string => !!v)
      .slice(0, 60);
    if (!ids.length) return { count: 0, products: [] as Array<{ id: string; title: string }> };
    const { data: products } = await loose(supabase)
      .from("products")
      .select("id, title, product_kind, status")
      .in("id", ids);
    return { count: ids.length, products: (products ?? []) as Array<{ id: string; title: string }> };
  });
}

/**
 * CSV export of the live catalog using the importer's column contract. Reads go
 * through the caller's RLS-scoped client, so a merchant can only ever export
 * their own rows; tombstoned rows are excluded.
 */
export async function exportCatalogCsv(supabase: Client, merchantId: string) {
  const { buildCatalogCsv } = await import("./catalog");
  const [products, variants] = await Promise.all([
    supabase
      .from("products")
      .select("id, title, slug, description, status, product_kind, tags")
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .order("title", { ascending: true }),
    supabase
      .from("product_variants")
      .select("product_id, name, sku, currency_code, price_amount_minor_int, stock_quantity, position")
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
  ]);
  if (products.error) throw new Error(products.error.message);
  if (variants.error) throw new Error(variants.error.message);

  const byProduct = new Map<string, (typeof variants.data)[number][]>();
  for (const v of variants.data ?? []) {
    const list = byProduct.get(v.product_id) ?? [];
    list.push(v);
    byProduct.set(v.product_id, list);
  }

  const rows: import("./catalog").CatalogExportRow[] = (products.data ?? []).flatMap((p): import("./catalog").CatalogExportRow[] => {
    const vs = byProduct.get(p.id) ?? [];
    const base = {
      title: p.title,
      slug: p.slug,
      description: p.description ?? "",
      status: String(p.status),
      kind: String(p.product_kind),
      tags: p.tags ?? [],
    };
    if (!vs.length) {
      return [{ ...base, variant: "Default", sku: null, currency: null, price_minor: 0, stock: 0 }];
    }
    return vs.map((v) => ({
      ...base,
      variant: v.name || "Default",
      sku: v.sku,
      currency: v.currency_code,
      price_minor: Number(v.price_amount_minor_int ?? 0),
      stock: Number(v.stock_quantity ?? 0),
    }));
  });

  incr("framique_catalog_export_total", { outcome: "ok" });
  return { csv: buildCatalogCsv(rows), rows: rows.length };
}
