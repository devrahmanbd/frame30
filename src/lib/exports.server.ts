import { en } from "./i18n-dict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { checkExportReason, exportReasonMessage, needsExportReason } from "./export-controls";

type Client = SupabaseClient<Database>;
export type ExportObjectType = Database["public"]["Enums"]["export_object_type"];

export class ExportError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const SIGNED_URL_TTL_SECONDS = 3600;
const FILE_TTL_HOURS = 24;

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

type Spec = { headers: string[]; select: string; table: string; dateColumn: string };

const SPECS: Record<ExportObjectType, Spec> = {
  orders: {
    table: "orders",
    dateColumn: "created_at",
    headers: [
      "order_id",
      "order_number",
      "status",
      "payment_method",
      "currency_code",
      "subtotal_minor_int",
      "discount_minor_int",
      "shipping_minor_int",
      "vat_minor_int",
      "total_minor_int",
      "city",
      "created_at",
    ],
    select:
      "id,order_number,status,payment_method,currency_code,subtotal_minor_int,discount_minor_int,shipping_minor_int,vat_minor_int,total_minor_int,city,created_at",
  },
  products: {
    table: "products",
    dateColumn: "created_at",
    headers: ["product_id", "title", "slug", "status", "brand_id", "category_id", "created_at"],
    select: "id,title,slug,status,brand_id,category_id,created_at",
  },
  customers: {
    table: "subscribers",
    dateColumn: "created_at",
    headers: ["subscriber_id", "email", "status", "source", "email_consent", "sms_consent", "created_at"],
    select: "id,email,status,source,email_consent,sms_consent,created_at",
  },
  product_events: {
    table: "order_items",
    dateColumn: "created_at",
    headers: [
      "order_item_id",
      "order_id",
      "sku",
      "product_title",
      "variant_name",
      "quantity",
      "unit_price_minor_int",
      "line_total_minor_int",
      "created_at",
    ],
    select:
      "id,order_id,sku,product_title,variant_name,quantity,unit_price_minor_int,line_total_minor_int,created_at",
  },
  analytics_raw: {
    table: "order_events",
    dateColumn: "created_at",
    headers: ["event_id", "order_id", "event_type", "note", "created_at"],
    select: "id,order_id,event_type,note,created_at",
  },
};

export const EXPORT_TYPES: { value: ExportObjectType; key: string; en: string }[] = [
  { value: "orders", key: "export.type.orders", en: en("export.type.orders") },
  { value: "products", key: "export.type.products", en: en("export.type.products") },
  { value: "customers", key: "export.type.customers", en: en("export.type.customers") },
  { value: "product_events", key: "export.type.product_events", en: en("export.type.product_events") },
  { value: "analytics_raw", key: "export.type.analytics_raw", en: en("export.type.analytics_raw") },
];

export async function listJobs(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("export_jobs")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new ExportError("list_failed", error.message);
  return data ?? [];
}

/**
 * §5 — how many rows the requested export would return, decided before any
 * data leaves the database so the reason gate can refuse cheaply.
 */
export async function countRows(
  db: Client,
  merchantId: string,
  input: { objectType: ExportObjectType; rangeStart: string | null; rangeEnd: string | null; status: string | null },
) {
  const spec = SPECS[input.objectType];
  let q = db
    .from(spec.table as "orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId);
  if (input.rangeStart) q = q.gte(spec.dateColumn, input.rangeStart);
  if (input.rangeEnd) q = q.lte(spec.dateColumn, input.rangeEnd);
  if (input.status) q = q.eq("status", input.status as never);
  const { count, error } = await q;
  if (error) throw new ExportError("count_failed", error.message);
  return count ?? 0;
}

export async function createJob(
  db: Client,
  merchantId: string,
  userId: string,
  input: {
    objectType: ExportObjectType;
    rangeStart: string | null;
    rangeEnd: string | null;
    status: string | null;
    reason?: string | null;
  },
) {
  // §5: bulk egress needs a stated reason and an audit row before the job runs.
  const estimated = await countRows(db, merchantId, input);
  const problem = checkExportReason(estimated, input.reason);
  if (problem) throw new ExportError(problem, exportReasonMessage(problem, estimated));
  const reason = (input.reason ?? "").trim() || null;

  const { data, error } = await db
    .from("export_jobs")
    .insert({
      merchant_id: merchantId,
      requested_by: userId,
      object_type: input.objectType,
      range_start: input.rangeStart,
      range_end: input.rangeEnd,
      filters: {
        ...(input.status ? { status: input.status } : {}),
        ...(reason ? { reason } : {}),
        estimated_rows: estimated,
      },
    })
    .select("id")
    .single();
  if (error) throw new ExportError("create_failed", error.message);
  if (needsExportReason(estimated)) {
    const { auditAction } = await import("./hardening.server");
    await auditAction(
      db,
      merchantId,
      userId,
      "export.bulk_requested",
      "export_job",
      { object_type: input.objectType, estimated_rows: estimated, reason },
      data.id,
    );
  }
  await runJob(db, merchantId, data.id);
  return data.id;
}

async function fetchRows(db: Client, merchantId: string, job: Record<string, unknown>) {
  const spec = SPECS[job["object_type"] as ExportObjectType];
  let q = db
    .from(spec.table as "orders")
    .select(spec.select)
    .eq("merchant_id", merchantId)
    .order("id", { ascending: true });
  if (job["range_start"]) q = q.gte(spec.dateColumn, job["range_start"] as string);
  if (job["range_end"]) q = q.lte(spec.dateColumn, job["range_end"] as string);
  const filters = (job["filters"] ?? {}) as { status?: string };
  if (filters.status) q = q.eq("status", filters.status as never);
  const { data, error } = await q;
  if (error) throw new ExportError("query_failed", error.message);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const keys = spec.select.split(",");
  return { csv: toCsv(spec.headers, rows.map((r) => keys.map((k) => r[k]))), count: rows.length };
}

export async function runJob(db: Client, merchantId: string, jobId: string) {
  const { data: job, error } = await db
    .from("export_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("merchant_id", merchantId)
    .single();
  if (error || !job) throw new ExportError("job_not_found", "Export job not found");

  await db
    .from("export_jobs")
    .update({ status: "generating", started_at: new Date().toISOString(), error: null })
    .eq("id", jobId);

  try {
    const { csv, count } = await fetchRows(db, merchantId, job as unknown as Record<string, unknown>);
    await db.from("export_jobs").update({ status: "signing", total_rows: count }).eq("id", jobId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${merchantId}/${jobId}.csv`;
    const body = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const up = await supabaseAdmin.storage.from("exports").upload(path, body, {
      contentType: "text/csv;charset=utf-8",
      upsert: true,
    });
    if (up.error) throw new ExportError("upload_failed", up.error.message);

    const signed = await supabaseAdmin.storage.from("exports").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data) throw new ExportError("sign_failed", signed.error?.message ?? "sign failed");

    const now = Date.now();
    await db
      .from("export_jobs")
      .update({
        status: "ready_for_download",
        storage_path: path,
        signed_url: signed.data.signedUrl,
        signed_url_expires_at: new Date(now + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
        expires_at: new Date(now + FILE_TTL_HOURS * 3600 * 1000).toISOString(),
        size_bytes: new TextEncoder().encode(csv).length,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return { ok: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    await db
      .from("export_jobs")
      .update({
        status: "fail_retry",
        error: message,
        attempts: ((job as { attempts: number }).attempts ?? 0) + 1,
      })
      .eq("id", jobId);
    return { ok: false as const, error: message };
  }
}

export async function downloadJob(db: Client, merchantId: string, jobId: string) {
  const { data: job } = await db
    .from("export_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!job || !job.storage_path) throw new ExportError("not_ready", "File is not ready yet");
  if (job.expires_at && new Date(job.expires_at).getTime() < Date.now()) {
    await db.from("export_jobs").update({ status: "expired" }).eq("id", jobId);
    throw new ExportError("expired", "Link has expired, please create a new export");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const signed = await supabaseAdmin.storage
    .from("exports")
    .createSignedUrl(job.storage_path, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) throw new ExportError("sign_failed", "Failed to create link");
  await db
    .from("export_jobs")
    .update({
      status: "downloaded",
      downloaded_at: new Date().toISOString(),
      signed_url: signed.data.signedUrl,
      signed_url_expires_at: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    })
    .eq("id", jobId);
  return { url: signed.data.signedUrl };
}
